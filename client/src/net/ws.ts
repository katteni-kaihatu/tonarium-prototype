import { arrivalPatch } from '../newArrival.ts';
import { setAiSupportTransport, handleAiSupportMessage } from '../ai/support.ts';
import { sourceText as uiSource } from '../i18n/core.ts';
import { receiveShared } from '../shared-assets/state.ts';
import { useSharedAssets } from '../shared-assets/state.ts';
import { applyAssetDelta } from '../../../shared/shared-sync.ts';
import { receiveSystems } from '../systems/state.ts';
import { receiveSystemCommandResult, resetSystemCommands } from '../systems/api.ts';
import { COMPAT_VERSION, isRoomClientMsg, type ClientMsg, type ServerMsg, type SessionInfo, type SessionSnapshot } from '../../../shared/protocol.ts';
import type { SurvivorState } from '../../../shared/survivor.ts';
import { applyAvatars } from '../sessionView.ts';
import { get, recompute, set, spawnPoint } from '../store.ts';
import { fantasyAccountDisconnected, fantasyAccountIdentityUpdate, fantasyPrivateMessagesAllowed, fantasyReconnectIdentity } from '../world/fantasy-account-state.ts';
import { appendFantasyGmResponse, clearFantasyGmLife, fantasyGmRequestOwner } from '../world/fantasy-gm-history.ts';
import { clearNpcRequests, consumeNpcRequest, npcRequestOwner } from '../world/npc-request-tracker.ts';

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
    set({ wsConnected: true, wsReady: false });
    const s = get();
    send({ t: 'hello', id: fantasyReconnectIdentity(s), name: s.selfName, compat: COMPAT_VERSION });
    setAiSupportTransport(send, true);
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
    setAiSupportTransport(send, false);
    stopSessionSync(true);
    const current = get();
    const accountReset = current.fantasyAccount || current.fantasyHomeId || current.session && current.worldBy[current.session] === 'fantasy'
      ? fantasyAccountDisconnected(current)
      : { fantasyAccount: null, fantasyAccountReady: false, fantasyAccountError: null };
    set({ wsConnected: false, wsReady: false, fantasyRealm: null, fantasyRealmPending: false, fantasyRealmError: null, dialogueProgress: {}, fantasyPending: false, fantasyTestResetAllowed: false, fantasyParty: null, fantasyPartyError: null, fantasyPartyPending: false, fantasyProperties: null, fantasyPropertyError: null, fantasyPropertyPending: false, fantasyCombat: null, fantasyCombatError: null, fantasyCombatPending: false, ...accountReset });
    if (get().npcPending) set({ npcPending: false, npcRequestId: null, npcError: 'unavailable', npcErrorContext: null });
    if (get().gmPending) set({ gmPending: false, gmRequestId: null, gmError: 'unavailable', gmErrorLocale: null });
    if (get().communityPending) set({ communityPending: false, communityError: 'unavailable' });
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
  resetSystemCommands();
  if (snap.sharedAssets) receiveShared(sid, snap.sharedAssets, undefined, true);
  if (snap.systems) receiveSystems(sid, snap.systems, undefined, true);
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
  if (msg.t === 'aiSupportJob' || msg.t === 'aiSupportCancel') { handleAiSupportMessage(msg); return; }
  if (['fantasyProfile', 'fantasyLegacies', 'fantasyContractBoard', 'fantasyPartyState', 'fantasyRealmState', 'fantasyPropertyState', 'fantasyCombatState', 'communityState', 'fantasyDialogueChunk', 'fantasyGmReply'].includes(msg.t) && !fantasyPrivateMessagesAllowed(get())) return;
  switch (msg.t) {
    case 'fantasyAccountState': {
      const previous = get(), next = fantasyAccountIdentityUpdate(previous, msg);
      if (next.changed) stopSessionSync();
      set(next.patch);
      recompute();
      if (next.changed && get().session && get().wsConnected) {
        startSessionSync();
        if (get().voice !== 'off') {
          const sid = get().session!, id = get().selfId;
          void import('./livekit.ts').then(({ connectVoice }) => {
            const current = get();
            if (current.session === sid && current.selfId === id && current.wsConnected && current.voice !== 'off') return connectVoice(sid);
          });
        }
      }
      return;
    }
    case 'systemState':
      if (msg.sid === get().session) {
        receiveSystems(msg.sid, msg.view, msg.error);
        receiveSystemCommandResult(msg.sid, msg.view, msg.commandResult, msg.error);
      }
      return;
    case 'sharedDelta': {
      if (msg.sid !== get().session) return;
      const current = useSharedAssets.getState();
      const result = applyAssetDelta(current.sid === msg.sid ? current.view : undefined, msg.delta);
      if (result === 'resync') send({ t: 'sharedResync' });
      else if (result !== 'stale') receiveShared(msg.sid, result);
      return;
    }
    case 'sharedState':
      if (msg.sid === get().session) receiveShared(msg.sid, msg.view, msg.error);
      return;
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
      set({ wsReady: true });
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
        chats: { ...s.chats, [msg.sid]: (s.chats[msg.sid] ?? []).some((m) => m.id === msg.m.id)
          ? s.chats[msg.sid].map((m) => m.id === msg.m.id ? msg.m : m)
          : [...(s.chats[msg.sid] ?? []), msg.m].slice(-500) },
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
        const transform = cur && (cur.kind === 'image' || cur.kind === 'video') ? { y: msg.y ?? cur.y, scale: msg.scale ?? cur.scale } : {};
        return cur ? { itemsBy: { ...s.itemsBy, [msg.sid]: { ...s.itemsBy[msg.sid], [msg.id]: { ...cur, x: msg.x, z: msg.z, ry: msg.ry, ...transform } } } } : {};
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
    case 'fantasyProfile':
      if (get().fantasyProfile && (get().fantasyProfile!.generation ?? 1) !== (msg.profile.generation ?? 1)) {
        clearFantasyGmLife(get().selfId);
        clearNpcRequests(get().selfId);
        set({ fantasyRealm: null, fantasyRealmPending: false, fantasyRealmError: null, dialogueProgress: {}, fantasyProperties: null, fantasyPropertyError: null, fantasyPropertyPending: false, fantasyCombat: null, fantasyCombatError: null, fantasyCombatPending: false, gmReply: null, gmPending: false, gmRequestId: null, gmError: null, gmErrorLocale: null,
          npcMessages: [], npcPending: false, npcRequestId: null, npcError: null, npcErrorContext: null, npcRelationships: {} });
      }
      set({ fantasyProfile: msg.profile, fantasyError: msg.error ?? null, fantasyPending: false });
      return;
    case 'fantasyTestMode':
      set({ fantasyTestResetAllowed: msg.enabled === true });
      return;
    case 'fantasyLegacies':
      set({ fantasyLegacies: msg.records });
      return;
    case 'fantasyContractBoard':
      set({ fantasyContractBoard: msg.board, fantasyContractError: msg.error ?? null });
      return;
    case 'fantasyClock':
      set({ fantasyClock: msg.clock });
      return;
    case 'fantasyPartyState':
      set({ fantasyParty: msg.state, fantasyPartyError: msg.error ?? null, fantasyPartyPending: false });
      return;
    case 'fantasyRealmState':
      set({ fantasyRealm: msg.state, fantasyRealmPending: false, fantasyRealmError: msg.error ?? null });
      return;
    case 'fantasyPropertyState':
      set({ fantasyProperties: msg.state, fantasyPropertyError: msg.error ?? null, fantasyPropertyPending: false });
      return;
    case 'fantasyCombatState':
      set({ fantasyCombat: msg.state ?? (get().fantasyCombat?.status !== 'active' ? get().fantasyCombat : null), fantasyCombatError: msg.error ?? null, fantasyCombatPending: false });
      return;
    case 'communityState':
      set({ communityState: msg.state, communityError: msg.error ?? null, communityPending: false });
      return;
    case 'fantasyDialogueChunk': {
      const owner = msg.kind === 'gm' ? fantasyGmRequestOwner(msg.requestId) : npcRequestOwner(msg.requestId);
      if (!owner || owner.user !== get().selfId || owner.locale !== msg.locale || msg.kind === 'npc' && (!('npcId' in owner) || owner.npcId !== msg.npcId) || typeof msg.text !== 'string' || msg.text.length > 2400) return;
      set(s => ({ dialogueProgress: { ...Object.fromEntries(Object.entries(s.dialogueProgress).slice(-7)), [msg.requestId]: { kind: msg.kind, locale: msg.locale, npcId: msg.npcId, text: msg.text } } }));
      return;
    }
    case 'fantasyGmReply': {
      const owner = fantasyGmRequestOwner(msg.requestId);
      if (!owner) return;
      appendFantasyGmResponse(msg);
      if (owner.user !== get().selfId) return;
      set({ gmReply: msg, gmError: msg.error ?? null, gmErrorLocale: msg.error ? msg.locale : null, ...(msg.requestId === get().gmRequestId ? { gmPending: false, gmRequestId: null } : {}) });
      return;
    }
    case 'npcReply':
      if (consumeNpcRequest(msg)?.user !== get().selfId) return;
      set((s) => ({
        ...(msg.requestId === s.npcRequestId ? { npcPending: false, npcRequestId: null } : {}), npcError: msg.error ?? null, npcErrorContext: msg.error ? { npcId: msg.npcId, locale: msg.locale } : null, npcModel: msg.model,
        npcRelationships: { ...s.npcRelationships, [msg.npcId]: msg.relationship },
        npcMessages: msg.error || !msg.text ? s.npcMessages : [...s.npcMessages, { id: `${msg.requestId}:assistant`, role: 'assistant' as const, text: msg.text, npcId: msg.npcId, locale: msg.locale, source: msg.source, actions: msg.actions }].slice(-72),
      }));
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
    case 'followed':
      pushNotice('follow', msg.from, msg.fromName);
      return;
    case 'follows':
      set({ following: msg.following, followers: msg.followers, fof: msg.fof });
      return;
    case 'posts':
      set({ posts: msg.list });
      return;
    case 'post':
      set((s) => {
        const i = s.posts.findIndex((p) => p.id === msg.p.id);
        return { posts: i < 0 ? [...s.posts, msg.p] : s.posts.map((p, j) => (j === i ? msg.p : p)) };
      });
      return;
    case 'postsRemoved': {
      const gone = new Set(msg.ids);
      set((s) => ({
        posts: s.posts.filter((p) => !gone.has(p.id)),
        timelineSide: s.timelineSide?.startsWith('post:') && gone.has(s.timelineSide.slice(5)) ? null : s.timelineSide,
        composeQuote: s.composeQuote && gone.has(s.composeQuote) ? null : s.composeQuote,
      }));
      return;
    }
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
