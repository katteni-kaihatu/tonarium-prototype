import { t as tr } from './i18n/core.ts';
import type { Item } from '../../shared/items.ts';
import { NEAR_RANGE, VOICE_RANGE, placeDistance, type Place } from '../../shared/places.ts';
import type { Participant } from '../../shared/protocol.ts';

export type Band = 'near' | 'mid' | 'far';

export const bandOf = (d: number): Band => (d <= NEAR_RANGE ? 'near' : d <= VOICE_RANGE ? 'mid' : 'far');

/** 画面に出るメートル。3.04 は 3.0 で近く、9.96 は 10.0 */
export function displayMeters(d: number) {
  if (!Number.isFinite(d)) return d;
  return d < 10 ? Number(d.toFixed(1)) : Math.round(d);
}

export const formatDistance = (d: number) => (d === 0 ? tr("ui41") : !Number.isFinite(d) ? '—' : d < 10 ? `${d.toFixed(1)}m` : `${Math.round(d)}m`);

export interface ListedPlayer { user: Participant; d: number; band: Band; child: boolean }
export interface ListedItem { item: Item; d: number; band: Band; heldBy: string | null }

export interface TrendState { d: number; t: number; v: number }

function trendFrom(v: number) {
  return Math.abs(v) < 0.15 ? 0 : Math.max(-1, Math.min(1, v / 1.5));
}

/** 近づくと負、離れると正。短い間隔では前回のまま（サンプルが重なっても速度が暴れない） */
export function stepTrend(prev: TrendState | undefined, d: number, now: number): { state: TrendState; trend: number } {
  if (!prev || !Number.isFinite(d) || !Number.isFinite(prev.d)) return { state: { d, t: now, v: 0 }, trend: 0 };
  const dt = (now - prev.t) / 1000;
  if (dt <= 0.05) return { state: prev, trend: trendFrom(prev.v) };
  const v = Math.max(-4, Math.min(4, (d - prev.d) / dt));
  const sm = prev.v * 0.6 + v * 0.4;
  return { state: { d, t: now, v: sm }, trend: trendFrom(sm) };
}

export interface NearbyUser { user: Participant; d: number }

export function nearbyUsers(participants: Participant[], places: Map<string, Place>, selfId: string): NearbyUser[] {
  const me = places.get(selfId);
  return participants
    .map((user) => {
      const p = places.get(user.id);
      const d = user.id === selfId ? 0 : me && p ? placeDistance(p, me) : Infinity;
      return { user, d };
    })
    .sort((a, b) => a.d - b.d);
}

export function nearbyItems(items: Record<string, Item>, places: Map<string, Place>, selfId: string) {
  const me = places.get(selfId);
  return Object.values(items)
    .map((item) => {
      const heldBy = 'holder' in item ? item.holder : null;
      const p = heldBy ? places.get(heldBy) : item;
      const d = me && p ? Math.hypot(p.x - me.x, p.z - me.z) : Infinity;
      return { item, d, heldBy };
    })
    .sort((a, b) => a.d - b.d);
}

/** ついていっている人は相手の直後。帯は表示上の距離で、相手に合わせる */
export function arrangePlayers(list: NearbyUser[], selfId: string): ListedPlayer[] {
  const others = list.filter((x) => x.user.id !== selfId);
  const ids = new Set(others.map((x) => x.user.id));
  const out: ListedPlayer[] = [];
  for (const x of others) {
    if (x.user.follow && ids.has(x.user.follow)) continue;
    const band = bandOf(displayMeters(x.d));
    out.push({ ...x, band, child: false });
    for (const f of others.filter((y) => y.user.follow === x.user.id)) out.push({ ...f, band, child: true });
  }
  return out;
}

function sameDistance(a: number, b: number) {
  return formatDistance(a) === formatDistance(b);
}

/** ラベル・帯・参加者の参照が同じ行は残す。d は出したときの生値のままで、ラベルは一致する */
export function reusePlayers(prev: ListedPlayer[], next: ListedPlayer[]): ListedPlayer[] {
  let changed = prev.length !== next.length;
  const reused = next.map((p, i) => {
    const old = prev[i]?.user.id === p.user.id ? prev[i] : prev.find((x) => x.user.id === p.user.id);
    if (old && old.user === p.user && old.child === p.child && old.band === p.band && sameDistance(old.d, p.d)) return old;
    changed = true;
    return p;
  });
  if (!changed && reused.every((p, i) => p === prev[i])) return prev;
  return reused;
}

export function reuseItems(prev: ListedItem[], next: ListedItem[]): ListedItem[] {
  let changed = prev.length !== next.length;
  const reused = next.map((p, i) => {
    const old = prev[i]?.item.id === p.item.id ? prev[i] : prev.find((x) => x.item.id === p.item.id);
    if (old && old.item === p.item && old.heldBy === p.heldBy && old.band === p.band && sameDistance(old.d, p.d)) return old;
    changed = true;
    return p;
  });
  if (!changed && reused.every((p, i) => p === prev[i])) return prev;
  return reused;
}

export function projectProximity(
  prev: { players: ListedPlayer[]; items: ListedItem[] },
  participants: Participant[],
  places: Map<string, Place>,
  items: Record<string, Item>,
  selfId: string,
) {
  const players = reusePlayers(prev.players, arrangePlayers(nearbyUsers(participants, places, selfId), selfId));
  const listed = nearbyItems(items, places, selfId).map((x) => ({ ...x, band: bandOf(displayMeters(x.d)) }));
  return { players, items: reuseItems(prev.items, listed) };
}
