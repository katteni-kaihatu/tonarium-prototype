import { arrivalPatch } from '../newArrival.ts';
import { sourceText as uiSource } from '../i18n/core.ts';
import { COMPAT_VERSION, isRoomClientMsg, type ClientMsg, type ServerMsg, type SessionInfo, type SessionSnapshot } from '../../../shared/protocol.ts';
import type { SurvivorState } from '../../../shared/survivor.ts';
import { applyAvatars } from '../sessionView.ts';
import { get, recompute, set, spawnPoint } from '../store.ts';

const selfBusy = () => get().users.find((u) => u.id === get().selfId)?.status === 'busy';
import { applyDelta } from '../items/actions.ts';
import { onHit } from '../items/effects.ts';
import { pushNotice } from '../actions.ts';
import { volumeFrom } from '../spatial.ts';
import { playPoke, playSynth } from '../world/sounds.ts';
import { receiveEmote } from '../emotes.ts';
import { playSurvivorSound } from '../world/survivorAudio.ts';
import { startSessionSync, stopSessionSync, roomSend, configureSessionSync, syncError, resetSessionSync } from './session.ts';

const PAGE_VERSION = document.querySelector('meta[name="tonarium-version"]')?.getAttribute('content') || null;

/** 注目を集めたアイテムが光っている時間 */
export const ATTENTION_MS = 10_000;

// HMR でこのモジュールが読み直されても同じソケットを使う（新しい側で送信が黙って捨てられるのを防ぐ）
const g = globalThis as unknown as { __tonariumWs?: WebSocket | null };
let retry = 0;
type SessionReply = Extract<ServerMsg, { t: 'sessionCreated' | 'sessionResult' }>;
const sessionRequests = new Map<string, { resolve: (reply: SessionReply) => void; reject: (error: Error) => void }>();

export function requestSession(msg: Extract<ClientMsg, { t: 'sessionCreate' | 'join' | 'leave' }>): Promise<SessionReply> {
  if (g.__tonariumWs?.readyState !== WebSocket.OPEN) return Promise.reject(new Error(uiSource('ui468')));
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(uiSource('ui469'))), 15_000);
    const finish = (error?: Error, reply?: SessionReply) => {
      clearTimeout(timer);
      sessionRequests.delete(requestId);
      if (error) reject(error); else resolve(reply!);
    };
    sessionRequests.set(requestId, { resolve: (reply) => finish(undefined, reply), reject: (error) => finish(error) });
    try { send({ ...msg, requestId }); } catch { finish(new Error(uiSource('ui470'))); }
  });
}

export function connectWs() {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const ws = new WebSocket(url);
  let openedAt = 0;
  g.__tonariumWs = ws;
  ws.onopen = () => {
    openedAt = performance.now();
    retry = 0;
    set({ wsConnected: true });
    const s = get();
    send({ t: 'hello', id: s.selfId, name: s.selfName, compat: COMPAT_VERSION });
    if (s.session) {
      send({ t: 'join', sid: s.session });
      // ホームの再接続後は、参加資格と部屋の状態も取り直す。
      startSessionSync();
    }
  };
  ws.onmessage = (e) => onMessage(JSON.parse(e.data) as ServerMsg);
  ws.onclose = (event) => {
    for (const request of sessionRequests.values()) request.reject(new Error(uiSource('ui471')));
    console.warn('[home-ws] closed', { code: event.code, reason: event.reason, wasClean: event.wasClean,
      connectedSeconds: openedAt ? Math.round((performance.now() - openedAt) / 1000) : 0 });
    stopSessionSync(true);
    set({ wsConnected: false });
    if (get().session) set({ sync: 'unavailable', syncError: uiSource('ui472') });
    // 互換性バージョン違いで断たれた場合はつなぎ直しても結果が同じなので、再接続しない
    if (!get().incompatible) setTimeout(connectWs, Math.min(5000, 500 * 2 ** retry++));
  };
}

/** セッションの中の操作は kokosync へ、それ以外は WebSocket へ */
export function send(msg: ClientMsg) {
  if (isRoomClientMsg(msg)) { roomSend(msg); return; }
  const ws = g.__tonariumWs;
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

const worldsOf = (info: Record<string, SessionInfo>) => Object.fromEntries(Object.entries(info).map(([sid, i]) => [sid, i.world]));

function playSurvivorTransitions(sid: string, next: SurvivorState) {
  if (sid !== get().session) return;
  const previous = get().survivors[sid];
  if (!previous || previous.run !== next.run) {
    if (next.phase === 'running') playSurvivorSound('start');
    return;
  }
  const priorEffects = new Set(previous.effects.map((effect) => effect.id));
  const freshEffects = next.effects.filter((effect) => !priorEffects.has(effect.id));
  if (freshEffects.length) playSurvivorSound('attack', freshEffects[freshEffects.length - 1].gear);

  const previousPlayers = previous.players;
  const players = Object.values(next.players);
  const selfId = get().selfId;
  const previousSelf = previousPlayers[selfId];
  const nextSelf = next.players[selfId];
  const ownChoiceStarted = !!nextSelf?.alive && nextSelf.choiceQueue.length > 0 && !(previousSelf?.choiceQueue.length ?? 0);
  if (ownChoiceStarted) playSurvivorSound('choice');
  if (previousSelf && nextSelf && nextSelf.hp < previousSelf.hp) playSurvivorSound('hit');
  if (!ownChoiceStarted && players.some((player) => player.level > (previousPlayers[player.id]?.level ?? player.level))) playSurvivorSound('level');
  else if (players.some((player) => {
    const before = previousPlayers[player.id];
    return !!before && Object.entries(player.gear).some(([gear, level]) => level !== (before.gear[gear] ?? 0));
  })) playSurvivorSound('equip');

  if (previous.phase !== 'boss' && next.phase === 'boss') playSurvivorSound('boss');
  if (previous.phase !== 'ended' && next.phase === 'ended') playSurvivorSound(next.bossDefeated ? 'victory' : 'end');
  if (previous.pausedAt == null && next.pausedAt != null) playSurvivorSound('pause');
  else if (previous.pausedAt != null && next.pausedAt == null && (next.phase === 'running' || next.phase === 'boss')) playSurvivorSound('resume');
}

/** 部屋に入ったとき・つなぎ直したときにサーバーから届く、いるセッションの中の状態 */
export function applySessionSnapshot(snap: SessionSnapshot) {
  const sid = snap.sid;
  if (sid !== get().session) return;
  const previousSelf = get().survivors[sid]?.players[get().selfId];
  const nextSelf = snap.survivor?.players[get().selfId];
  if (nextSelf?.alive && nextSelf.choiceQueue.length > 0 && !(previousSelf?.choiceQueue.length ?? 0)) playSurvivorSound('choice');
  set((s) => ({
    chats: { ...s.chats, [sid]: snap.chats },
    avatarsBy: { ...s.avatarsBy, [sid]: snap.avatars },
    itemsBy: { ...s.itemsBy, [sid]: Object.fromEntries(snap.items.map((n) => [n.id, n])) },
    presence: snap.presence,
    broadcast: { ...s.broadcast, [sid]: snap.broadcast },
    worldBy: { ...s.worldBy, [sid]: snap.world },
    games: { ...s.games, [sid]: snap.game },
    survivors: { ...s.survivors, [sid]: snap.survivor },
    elevators: { ...s.elevators, [sid]: snap.elevator },
    serverOffset: snap.now - Date.now(),
  }));
  recompute();
}

export function onMessage(msg: ServerMsg) {
  switch (msg.t) {
    case 'sessionCreated':
    case 'sessionResult': {
      const request = msg.requestId ? sessionRequests.get(msg.requestId) : undefined;
      if (msg.t === 'sessionResult' && msg.error) request?.reject(new Error(msg.error));
      else request?.resolve(msg);
      return;
    }
    case 'thumbnailRequest':
      if (msg.sid !== get().session || get().mode !== '3d') return;
      void import('../view3d/cameraRender.ts').then(({ takeThumbnail }) => {
        if (msg.sid !== get().session || get().mode !== '3d') return;
        const thumbnail = takeThumbnail();
        if (thumbnail) send({ t: 'thumbnailUpload', sid: msg.sid, thumbnail });
      });
      return;
    case 'marketLikes': set({ marketLikes: { counts: msg.counts, liked: msg.liked } }); return;
    case 'incompatible':
      set({ incompatible: true });
      return;
    case 'syncConfig': void configureSessionSync(msg.requestId, msg.config); return;
    case 'syncError': syncError(msg.requestId, msg.error); return;
    case 'syncReset': resetSessionSync(msg.sid); return;
    case 'snapshot': {
      const { guild, users, friends, groups, events, sessions, now, version } = msg.s;
      if (version && PAGE_VERSION && version !== PAGE_VERSION) set({ updateVersion: version });
      set((s) => ({ groups, events, serverOffset: now - Date.now(), guild, users, friends, sessionInfo: sessions, worldBy: { ...s.worldBy, ...worldsOf(sessions) } }));
      break;
    }
    case 'users':
      set({ users: msg.list });
      break;
    case 'sessionInfo':
      set((s) => ({ sessionInfo: msg.sessions, worldBy: { ...s.worldBy, ...worldsOf(msg.sessions) } }));
      return;
    case 'presence':
      if (msg.sid !== get().session) return;
      set({ presence: msg.all });
      break;
    case 'chat':
      set((s) => ({
        ...(msg.sid === s.session && msg.m.from && msg.m.from !== s.selfId && !s.blocked.includes(msg.m.fromName)
          && !(s.chats[msg.sid] ?? []).some((m) => m.id === msg.m.id) ? arrivalPatch('chat', s) : {}),
        chats: { ...s.chats, [msg.sid]: [...(s.chats[msg.sid] ?? []), msg.m].slice(-500) },
      }));
      return;
    case 'avatar':
      set(applyAvatars(get(), msg.sid, msg.id, msg.s));
      return;
    case 'avatarRemove':
      set(applyAvatars(get(), msg.sid, msg.id, null));
      return;
    case 'item':
      set((s) => {
        let item = msg.item;
        // 入力中の付箋は、遅れて返ってくる自分の変更で巻き戻さない
        const cur = s.itemsBy[msg.sid]?.[item.id];
        if (item.kind === 'note' && cur?.kind === 'note' && s.selectedNote === item.id && item.updatedBy === s.selfId)
          item = { ...item, text: cur.text };
        return { itemsBy: { ...s.itemsBy, [msg.sid]: { ...s.itemsBy[msg.sid], [item.id]: item } } };
      });
      break;
    case 'itemMove':
      set((s) => {
        const cur = s.itemsBy[msg.sid]?.[msg.id];
        return cur ? { itemsBy: { ...s.itemsBy, [msg.sid]: { ...s.itemsBy[msg.sid], [msg.id]: { ...cur, x: msg.x, z: msg.z, ry: msg.ry } } } } : {};
      });
      break;
    case 'itemRemove':
      set((s) => {
        const m = { ...s.itemsBy[msg.sid] };
        delete m[msg.id];
        return {
          itemsBy: { ...s.itemsBy, [msg.sid]: m },
          selectedNote: s.selectedNote === msg.id ? null : s.selectedNote,
        };
      });
      break;
    case 'itemAction':
      applyDelta(msg.sid, msg.id, msg.action, msg.by);
      return;
    case 'hit':
      if (msg.sid !== get().session) return;
      onHit(msg.from, msg.to);
      if (msg.to === get().selfId) pushNotice('hit', msg.from);
      return;
    case 'poke': {
      if (msg.sid !== get().session) return;
      const from = get().users.find((u) => u.id === msg.from);
      if (from && get().blocked.includes(from.name)) return;
      set((s) => ({ pokes: { ...s.pokes, [msg.to]: performance.now() } }));
      // 取り込み中は音を鳴らさない
      if (msg.to === get().selfId) { pushNotice('poke', msg.from); if (!selfBusy()) playPoke(); }
      return;
    }
    case 'emote':
      receiveEmote(msg);
      return;
    case 'sound':
      if (msg.sid !== get().session) return;
      if (!get().blocked.includes(get().users.find((u) => u.id === msg.from)?.name ?? '')) playSynth(msg.id, volumeFrom(msg.from));
      return;
    case 'attention': {
      if (msg.sid !== get().session) return;
      const id = msg.key.slice(msg.key.indexOf(':') + 1);
      set((s) => ({ attention: { ...s.attention, [id]: performance.now() + ATTENTION_MS } }));
      if (msg.from !== get().selfId) pushNotice('attention', msg.from, undefined, msg.key);
      return;
    }
    case 'broadcast':
      set((s) => ({ broadcast: { ...s.broadcast, [msg.sid]: msg.on } }));
      return;
    case 'game':
      set((s) => ({ games: { ...s.games, [msg.sid]: msg.game } }));
      return;
    case 'survivor':
      playSurvivorTransitions(msg.sid, msg.state);
      set((s) => ({ survivors: { ...s.survivors, [msg.sid]: msg.state } }));
      return;
    case 'survivorProfile':
      set({ survivorProfile: msg.profile });
      return;
    case 'elevator':
      set((s) => ({ elevators: { ...s.elevators, [msg.sid]: msg.elevator } }));
      return;
    case 'gameTile':
      set((s) => {
        const g = s.games[msg.sid];
        return g ? { games: { ...s.games, [msg.sid]: { ...g, tiles: { ...g.tiles, [msg.tile]: msg.at } } } } : {};
      });
      return;
    case 'worldPending':
      set({ worldPending: msg });
      return;
    case 'world': {
      set((s) => ({ worldBy: { ...s.worldBy, [msg.sid]: msg.world }, worldPending: s.worldPending?.sid === msg.sid ? null : s.worldPending }));
      const s = get();
      if (msg.sid !== s.session) return;
      if (s.mode === '3d') {
        const p = spawnPoint();
        set({ teleport: p, selfAvatar: p, worldLoading: { world: msg.world, dur: 1400 * s.loadScale } });
      }
      return;
    }
    case 'liveRequest':
      if (msg.sid === get().session) pushNotice('live', msg.from);
      return;
    case 'friendRequest':
      pushNotice('friend', msg.from, msg.fromName);
      return;
    case 'friends':
      set({ friends: msg.names });
      return;
    case 'sessions':
      set((s) => ({ guild: { ...s.guild, sessions: msg.list } }));
      return;
    case 'groups':
      set({ groups: msg.list });
      return;
    case 'events':
      set({ events: msg.list });
      return;
    case 'invite':
      pushNotice('invite', msg.from, msg.fromName, `${msg.kind}:${msg.id}`);
      return;
    case 'inbox':
      set((s) => ({
        inbox: msg.convs, reads: msg.reads, people: Object.fromEntries(msg.people.map((p) => [p.name, p])),
        watching: msg.watching, recentStatus: msg.recentStatus,
        // 再接続やグループの出入りで届き直したときは、最初の「前回」を保つ
        lastSeen: s.lastSeen === undefined ? msg.lastSeen : s.lastSeen,
      }));
      return;
    case 'msg':
      set((s) => {
        const list = s.inbox[msg.conv] ?? [];
        const i = list.findIndex((m) => m.id === msg.m.id);
        const next = i >= 0 ? list.map((m, j) => (j === i ? msg.m : m)) : [...list, msg.m].slice(-300);
        return {
          ...(i < 0 && msg.m.from && msg.m.from !== s.selfName && !s.blocked.includes(msg.m.from) ? arrivalPatch('chat', s, Date.now(), msg.conv) : {}),
          inbox: { ...s.inbox, [msg.conv]: next },
        };
      });
      return;
    case 'read':
      set((s) => ({ reads: { ...s.reads, [msg.conv]: Math.max(s.reads[msg.conv] ?? 0, msg.at) } }));
      return;
    case 'people':
      set({ people: Object.fromEntries(msg.list.map((p) => [p.name, p])) });
      return;
    case 'watching':
      set({ watching: msg.names, recentStatus: msg.recentStatus });
      return;
    case 'askJoin':
      pushNotice('askJoin', msg.from, msg.fromName, `session:${msg.session}`);
      return;
    case 'online':
      pushNotice('online', msg.from, msg.fromName);
      return;
  }
  recompute();
}
