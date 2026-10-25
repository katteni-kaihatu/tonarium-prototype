import { sourceText as uiSource } from './i18n/core.ts';
import { msg } from './i18n/core.ts';
import type { ChatMedia, ChatScope, ClientMsg, Mode, Rsvp, StatusKind, Visibility } from '../../shared/protocol.ts';
import type { WorldKind } from '../../shared/worlds.ts';
import { approach } from '../../shared/places.ts';
import { clampRoomPos } from './items/actions.ts';
import { get, set, recompute, spawnPoint, save, nameOf, showToast, dropSession, type Notice } from './store.ts';
import { requestSession, send } from './net/ws.ts';
import { connectVoice, leaveVoice } from './net/livekit.ts';
import { startSessionSync, stopSessionSync } from './net/session.ts';
import { placesOf, resumeAudio } from './spatial.ts';
import { touchOnly } from './phone.ts';
import { stopWalk } from './walk.ts';

let sessionOperation = false;

async function enterSession(sid: string, requireVoice = false) {
  if (get().session === sid) { set({ hubOpen: false }); return; }
  await exitSession();
  try {
    await requestSession({ t: 'join', sid });
  } catch (error) {
    // 応答だけが届かなかった場合も、サーバー側の参加を残さない。
    await requestSession({ t: 'leave' }).catch(() => {});
    throw error;
  }
  selectNote(null);
  dropSession(get().session);
  // フレンド申請と招待はセッションをまたいで残す
  set((s) => ({ session: sid, mode: '2d', hubOpen: false, selfAvatar: spawnPoint(), windows: [], maxWin: null, notices: s.notices.filter((n) => n.kind === 'friend' || n.kind === 'invite' || n.kind === 'online') }));
  recompute();
  startSessionSync();
  await connectVoice(sid);
  if (requireVoice && get().voice !== 'connected') throw new Error(uiSource('ui0'));
  // 外で 3D を選んでいたら、入った後に 3D へ
  if (get().joinMode === '3d' && !touchOnly) setTimeout(() => { if (get().session === sid) switchMode('3d'); }, 400);
}

async function exitSession() {
  if (!get().session) return;
  selectNote(null);
  dropSession(get().session);
  set({ session: null, mode: '2d', hubOpen: false, windows: [], maxWin: null });
  recompute();
  stopSessionSync();
  // 通話の切断も終えてから次の部屋につなぐ。
  const results = await Promise.allSettled([requestSession({ t: 'leave' }), leaveVoice()]);
  for (const result of results) if (result.status === 'rejected') throw result.reason;
}

async function withSessionOperation(action: () => Promise<void>) {
  if (sessionOperation) return;
  sessionOperation = true;
  const before = get();
  try {
    await action();
  } catch (error) {
    let message = error instanceof Error ? error.message : uiSource('ui1');
    try {
      if (get().session !== before.session) {
        await exitSession();
        if (before.session) await enterSession(before.session);
      }
    } catch {
      message += uiSource('ui2');
    }
    if (get().session === before.session) {
      set({ mode: before.mode, hubOpen: before.hubOpen, homePage: before.homePage, selfAvatar: before.selfAvatar,
        windows: before.windows, maxWin: before.maxWin, notices: before.notices });
      if (before.session) { send({ t: 'mode', mode: before.mode }); send({ t: 'avatar', s: before.selfAvatar }); }
    }
    showToast(message);
  } finally {
    sessionOperation = false;
  }
}

export function joinSession(sid: string) {
  resumeAudio();
  return withSessionOperation(() => enterSession(sid));
}

export function leaveSession() {
  return withSessionOperation(exitSession);
}

export function setMode(mode: Mode) {
  const s = get();
  if (s.mode === mode || !s.session) return;
  selectNote(null);
  // 3D には 2D でいた場所から入る（スポーンエリアにいたならその場所）
  if (mode === '3d') {
    const p = placesOf(s).get(s.selfId);
    if (p) set({ selfAvatar: clampRoomPos({ x: p.x, z: p.z, ry: p.ry }) });
  }
  set({ mode });
  send({ t: 'mode', mode });
  if (mode === '3d') send({ t: 'avatar', s: get().selfAvatar });
}

/** 2D/3D の切り替えに 1〜2 秒（× 倍率）の疑似ローディングを挟む */
export function switchMode(mode: Mode) {
  const s = get();
  if (s.switching || s.mode === mode || !s.session || (mode === '3d' && touchOnly)) return;
  // 疑似ローディングの間に 3D のチャンクを先読みしておく（WorldScreen の lazy と同じモジュール）
  if (mode === '3d') void import('./view3d/View3D.tsx');
  const dur = (1000 + Math.random() * 1000) * s.loadScale;
  if (dur < 50) { setMode(mode); return; }
  set({ switching: { to: mode, dur } });
  setTimeout(() => {
    setMode(mode);
    set({ switching: null });
  }, dur);
}

export function setMapMode(mapMode: 'none' | '2d' | '3d') {
  set({ mapMode });
  save('tonarium.mapMode', mapMode);
}

export function setVoiceHeat(voiceHeat: boolean) {
  set({ voiceHeat });
  save('tonarium.voiceHeat', voiceHeat);
}

export function setLightweight(lightweight: boolean) {
  set({ lightweight });
  save('tonarium.lightweight', lightweight);
}

export function setLoadScale(loadScale: number) {
  set({ loadScale });
  save('tonarium.loadScale', loadScale);
}

export function follow(target: string | null) {
  stopWalk();
  send({ t: 'follow', target });
  set({ liveRequested: null });
}

/** ついていっている相手に視点のライブを頼む。相手が始めたらウィンドウが開く */
export function requestLive(to: string) {
  send({ t: 'liveRequest', to });
  set({ liveRequested: to });
}

export function setViewLive(on: boolean, noticeId?: number) {
  send({ t: 'viewLive', on });
  if (noticeId !== undefined) set((s) => ({ notices: s.notices.filter((n) => n.id !== noticeId) }));
}

export function dropFollowers() {
  send({ t: 'dropFollowers' });
}

export function selectNote(id: string | null) {
  const prev = get().selectedNote;
  if (prev === id) return;
  if (prev) send({ t: 'itemAction', id: prev, action: { a: 'noteLock', lock: false } });
  if (id) send({ t: 'itemAction', id, action: { a: 'noteLock', lock: true } });
  set({ selectedNote: id });
}

/** 人なら `id`、アイテムなら `item:<id>`。持たれているアイテムは持っている人のそばへ */
export function goNear(target: string) {
  const s = get();
  const places = placesOf(s);
  let t: { x: number; z: number } | undefined;
  if (target.startsWith('item:')) {
    const it = s.items[target.slice(5)];
    if (!it) return;
    const holder = 'holder' in it ? it.holder : null;
    t = holder ? places.get(holder) : it;
  } else {
    t = places.get(target);
  }
  if (!t) return;
  const pos = clampRoomPos(approach(places.get(s.selfId), t, 1));
  if (s.mode === '3d') set({ teleport: pos });
  else send({ t: 'place2d', target: s.selfId, pos });
}

export const poke = (to: string) => send({ t: 'poke', to });
export const friendRequest = (to: string) => send({ t: 'friendRequest', to });

export function friendAccept(to: string, noticeId: number) {
  send({ t: 'friendAccept', to });
  set((s) => ({ notices: s.notices.filter((n) => n.id !== noticeId) }));
}

export const removeNotice = (noticeId: number) => set((s) => ({ notices: s.notices.filter((n) => n.id !== noticeId) }));

export function createSession(name: string, topic: string, world: WorldKind, visibility: Visibility, group?: string) {
  resumeAudio();
  return withSessionOperation(async () => {
    const reply = await requestSession({ t: 'sessionCreate', name, topic, world, visibility, group });
    if (reply.t !== 'sessionCreated') throw new Error(uiSource('ui3'));
    await enterSession(reply.sid, true);
  });
}
export const deleteSession = (id: string) => send({ t: 'sessionDelete', id });
export const createGroup = (name: string, color: string) => send({ t: 'groupCreate', name, color });
export const updateGroup = (groupId: string, changes: { name?: string; editors?: string[] }) => send({ t: 'groupUpdate', groupId, ...changes });
export const joinGroup = (id: string) => send({ t: 'groupJoin', id });
export const leaveGroup = (id: string) => send({ t: 'groupLeave', id });
export const deleteGroup = (id: string) => send({ t: 'groupDelete', id });
export const createEvent = (title: string, at: number, group: string | null, session: string | null) =>
  send({ t: 'eventCreate', title, at, group, session });
export const answerEvent = (id: string, answer: Rsvp | null) => send({ t: 'eventAttend', id, answer });
export const createChannel = (group: string, name: string) => send({ t: 'channelCreate', group, name });
export const setStatus = (status: StatusKind, text: string) => send({ t: 'setStatus', status, text });
export const watchFriend = (name: string, on: boolean) => send({ t: 'watch', name, on });
export function askJoin(to: string) {
  send({ t: 'askJoin', to });
  showToast(msg("ui4", nameOf(to)));
}
export const answerPlan = (conv: string, id: string, answer: Rsvp | null) => send({ t: 'rsvp', conv, id, answer });

type Outgoing = Omit<Extract<ClientMsg, { t: 'msg' }>, 't' | 'conv'>;
export function sendMessage(conv: string, m: Outgoing) {
  send({ t: 'msg', conv, ...m });
}
/** 会話の最後まで読んだことにする */
export function markRead(conv: string) {
  const s = get();
  const last = s.inbox[conv]?.at(-1)?.at ?? 0;
  if (last <= (s.reads[conv] ?? 0)) return;
  set({ reads: { ...s.reads, [conv]: last } });
  send({ t: 'read', conv, at: last });
}
export function openDm(name: string) {
  set({ homePage: 'friends', dmWith: name });
  window.scrollTo(0, 0);
}
export function openGroup(id: string, channel?: string) {
  set((s) => ({ homePage: 'group', homeGroup: id, homeChannel: channel ? { ...s.homeChannel, [id]: channel } : s.homeChannel }));
  window.scrollTo(0, 0);
}
export const deleteEvent = (id: string) => send({ t: 'eventDelete', id });
export function invite(kind: 'session' | 'group', id: string, to: string) {
  send({ t: 'invite', kind, id, to });
  showToast(msg("ui5", nameOf(to)));
}

export function toggleBlock(name: string) {
  const blocked = get().blocked.includes(name) ? get().blocked.filter((n) => n !== name) : [...get().blocked, name];
  set({ blocked });
  save('tonarium.blocked', blocked);
}

export async function report(target: string, reason: string) {
  const res = await fetch('/report', { method: 'POST', body: JSON.stringify({ from: get().selfName, target, reason }) });
  return res.ok;
}

export function sendChat(text: string, scope: ChatScope, image?: string, media?: ChatMedia) {
  if (!get().session || (!text.trim() && !image && !media)) return;
  send({ t: 'chat', text, scope, image, media });
}

export const playSound = (id: string) => send({ t: 'sound', id });

export function markNoticesRead() {
  set((s) => ({ notices: s.notices.map((n) => ({ ...n, unread: false })) }));
}

let noticeSeq = 0;
export function pushNotice(kind: Notice['kind'], from: string, fromName = nameOf(from), key?: string) {
  if (get().blocked.includes(fromName)) return;
  set((s) => ({ notices: [{ id: ++noticeSeq, kind, from, fromName, key, at: Date.now(), unread: true }, ...s.notices].slice(0, 30) }));
}
