import { useSyncExternalStore } from 'react';
import { VOICE_RANGE, placeDistance, type Place } from '../../shared/places.ts';
import { formatDistance, nearbyUsers, projectProximity, stepTrend, type ListedItem, type ListedPlayer, type TrendState } from './nearby.ts';
import { useStore, get, isBroadcast } from './store.ts';
import { peerGain } from './volume.ts';
import { placesFromInputs } from './placesMemo.ts';

export { formatDistance };

export type { Place };

/** 自分の 3D 位置と、マップで歩いている途中の 2D 位置は、サーバー経由より手元の値が新しい。結果は入力が変わるまで共有される（placesMemo） */
export function placesOf(s = get()): Map<string, Place> {
  return placesFromInputs({ participants: s.participants, avatars: s.avatars, selfId: s.selfId, selfAvatar: s.selfAvatar, mode: s.mode, walk: s.walk });
}

/** 3D の人の顔の上下。自分は手元の値が新しい */
export function pitchOf(id: string, s = get()) {
  return (id === s.selfId ? (s.mode === '3d' ? s.selfAvatar.pitch : 0) : s.avatars[id]?.pitch) ?? 0;
}

export function distanceTo(id: string, s = get()) {
  const places = placesOf(s);
  const me = places.get(s.selfId);
  const p = places.get(id);
  return id === s.selfId ? 0 : me && p ? placeDistance(p, me) : Infinity;
}

/** 2D の距離表示だけ。声の音量と 3D の補間は get() をそのまま読む。購読者がいる間だけ測る */
const SAMPLE_MS = 100;
const listListeners = new Set<() => void>();
const trendListeners = new Set<() => void>();
let sampleTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribeStore: (() => void) | null = null;
let proximity = { players: [] as ListedPlayer[], items: [] as ListedItem[] };
let labels: Record<string, string> = {};
const trendState = new Map<string, TrendState>();
let trends: Record<string, number> = {};

function watchOf(s = get()) {
  return { participants: s.participants, items: s.items, mode: s.mode, session: s.session, selfId: s.selfId };
}

let watch = watchOf();

function sampleTrends(rows: { id: string; d: number }[], now: number) {
  const next: Record<string, number> = {};
  let changed = false;
  for (const row of rows) {
    const stepped = stepTrend(trendState.get(row.id), row.d, now);
    trendState.set(row.id, stepped.state);
    next[row.id] = stepped.trend;
    if (trends[row.id] !== stepped.trend) changed = true;
  }
  for (const id of trendState.keys()) {
    if (!(id in next)) {
      trendState.delete(id);
      changed = true;
    }
  }
  if (!changed) return false;
  trends = next;
  return true;
}

function sample(now = performance.now()) {
  const s = get();
  const places = placesOf(s);
  const users = nearbyUsers(s.participants, places, s.selfId);
  const next = projectProximity(proximity, s.participants, places, s.items, s.selfId);
  const listChanged = next.players !== proximity.players || next.items !== proximity.items;
  proximity = next;
  const nextLabels: Record<string, string> = {};
  for (const u of users) nextLabels[`user:${u.user.id}`] = formatDistance(u.d);
  for (const it of next.items) nextLabels[`item:${it.item.id}`] = formatDistance(it.d);
  labels = nextLabels;
  const trendChanged = sampleTrends(users.filter((u) => u.user.id !== s.selfId).map((u) => ({ id: u.user.id, d: u.d })), now);
  return { listChanged, trendChanged };
}

function publish() {
  const { listChanged, trendChanged } = sample();
  if (listChanged) for (const listener of listListeners) listener();
  if (trendChanged) for (const listener of trendListeners) listener();
}

function ensureSample() {
  if (sampleTimer !== null) return;
  watch = watchOf();
  sample();
  sampleTimer = setInterval(publish, SAMPLE_MS);
  unsubscribeStore = useStore.subscribe(() => {
    const next = watchOf();
    if (next.participants === watch.participants && next.items === watch.items && next.mode === watch.mode && next.session === watch.session && next.selfId === watch.selfId) return;
    watch = next;
    publish();
  });
}

function releaseSample() {
  if (listListeners.size + trendListeners.size > 0) return;
  if (sampleTimer !== null) clearInterval(sampleTimer);
  sampleTimer = null;
  unsubscribeStore?.();
  unsubscribeStore = null;
  trendState.clear();
  trends = {};
}

function subscribeList(listener: () => void) {
  listListeners.add(listener);
  ensureSample();
  return () => {
    listListeners.delete(listener);
    releaseSample();
  };
}

function subscribeTrend(listener: () => void) {
  trendListeners.add(listener);
  ensureSample();
  return () => {
    trendListeners.delete(listener);
    releaseSample();
  };
}

// 購読は描画の後なので、タイマーが無い最初の描画はここで測る。測った参照は次の getSnapshot でも同じ
function warm() {
  if (sampleTimer === null) sample();
}

export function useNearby(): ListedPlayer[] {
  return useSyncExternalStore(subscribeList, () => { warm(); return proximity.players; }, () => proximity.players);
}

export function useNearbyItems(): ListedItem[] {
  return useSyncExternalStore(subscribeList, () => { warm(); return proximity.items; }, () => proximity.items);
}

export function useDistanceLabel(kind: 'user' | 'item', id: string) {
  return useSyncExternalStore(subscribeList, () => { warm(); return labels[`${kind}:${id}`] ?? '—'; }, () => '—');
}

export function useTrend(id: string) {
  return useSyncExternalStore(subscribeTrend, () => { warm(); return trends[id] ?? 0; }, () => 0);
}

const FULL = 2;
export const SILENT = VOICE_RANGE;

const falloff = (d: number) => (1 - Math.min(1, Math.max(0, (d - FULL) / (SILENT - FULL)))) ** 2;

/** 効果音などをその人の位置から鳴らすときの音量。ブロードキャストモードでは距離に関係なく等倍 */
export const volumeFrom = (id: string) => (id === get().selfId || isBroadcast() ? 1 : falloff(distanceTo(id)));

/** 空間に置かれた物（動画など）の音量 */
export function volumeAt(x: number, z: number) {
  const s = get();
  if (isBroadcast(s)) return 1;
  const me = placesOf(s).get(s.selfId);
  return me ? falloff(Math.hypot(x - me.x, z - me.z)) : 0;
}

type StoreState = ReturnType<typeof get>;

// 音量更新（100ms 間隔）のたびに作り直さないよう、blocked の参照が変わった時だけ再構築する
let blockedCache: { blocked: StoreState['blocked']; set: Set<string> } | null = null;
const blockedIds = (s = get()) => {
  if (blockedCache && blockedCache.blocked === s.blocked) return blockedCache.set;
  blockedCache = { blocked: s.blocked, set: new Set(s.blocked) };
  return blockedCache.set;
};

let ctx: AudioContext | null = null;
const voices = new Map<string, { gain: GainNode; pan: StereoPannerNode; source: MediaStreamAudioSourceNode }>();

/** AudioContext はユーザー操作の中で再開しないと鳴らない */
export function resumeAudio() {
  ctx ??= new AudioContext();
  void ctx.resume();
}

export function addVoice(identity: string, track: MediaStreamTrack) {
  removeVoice(identity);
  ctx ??= new AudioContext();
  const source = ctx.createMediaStreamSource(new MediaStream([track]));
  const gain = ctx.createGain();
  const pan = ctx.createStereoPanner();
  gain.gain.value = 0;
  source.connect(gain).connect(pan).connect(ctx.destination);
  voices.set(identity, { gain, pan, source });
  update();
}

export function removeVoice(identity: string) {
  const v = voices.get(identity);
  if (!v) return;
  v.source.disconnect();
  v.gain.disconnect();
  v.pan.disconnect();
  voices.delete(identity);
}

export function removeAllVoices() {
  for (const id of [...voices.keys()]) removeVoice(id);
}

function update() {
  if (!ctx || !voices.size) return;
  const s = get();
  const places = placesOf(s);
  const me = places.get(s.selfId);
  const directional = s.mode === '3d' || !!(s.participants.find((p) => p.id === s.selfId)?.follow);
  const blocked = blockedIds(s);
  const bc = isBroadcast(s);
  for (const [id, v] of voices) {
    const p = places.get(id);
    let g = 0;
    let pan = 0;
    if (me && p && !blocked.has(id)) {
      const dx = p.x - me.x;
      const dz = p.z - me.z;
      const d = placeDistance(p, me);
      g = (bc ? 1 : falloff(d)) * s.audioVol.voice * peerGain(id, s);
      if (directional && d > 0.3) pan = ((dx * Math.cos(me.ry) - dz * Math.sin(me.ry)) / d) * 0.8;
    }
    v.gain.gain.setTargetAtTime(g, ctx.currentTime, 0.08);
    v.pan.pan.setTargetAtTime(pan, ctx.currentTime, 0.08);
  }
}

setInterval(update, 100);

// 開発時のデバッグ用
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__spatial = { placesOf, voices };
