import type { Solid } from './worlds.ts';

export type BattleTeam = 'red' | 'blue';
export interface BattlePoint { x: number; z: number }
export const BATTLEFIELD = {
  half: 10, radius: 0.35, speed: 4, respawnMs: 3000, tickMs: 50, botLimit: 6,
  range: 14, fireMs: 400, damage: 25, captureMs: 2000,
  spawns: { red: { x: -8, z: 7 }, blue: { x: 8, z: -7 } },
  bases: [{ id: 'A', x: -5, z: -3, r: 1.4 }, { id: 'B', x: 5, z: 3, r: 1.4 }, { id: 'C', x: 0, z: 0, r: 1.4 }],
  solids: [{ x: -3, z: 1, w: 1, d: 5 }, { x: 3, z: -1, w: 1, d: 5 }, { x: 0, z: -6, w: 4, d: 1 }, { x: 0, z: 6, w: 4, d: 1 }] satisfies Solid[],
} as const;
export interface BattleActor extends BattlePoint {
  id: string; participantId: string | null; bot: boolean; active: boolean; team: BattleTeam;
  aim: number; hp: number; alive: boolean; respawnAt: number | null; firedAt: number; tank: string | null;
}
export interface BattleTank extends BattlePoint { id: string; ry: number; rider: string | null }
export interface BattleBase { id: string; owner: BattleTeam | null; capturing: BattleTeam | null; progress: number }
export interface BattlefieldState {
  at: number; revision: number; actors: Record<string, BattleActor>; tanks: Record<string, BattleTank>; bases: BattleBase[];
}
export interface BattleInput { x: number; z: number; aim: number; fire: boolean }
export type BattleCommand = { t: 'battleInput'; input: BattleInput } | { t: 'battleMount'; id: string | null }
  | { t: 'battleBot'; action: 'add' | 'remove'; id?: string };
export const battleColor = (team: BattleTeam | null) => team === 'red' ? '#ed726c' : team === 'blue' ? '#6eacff' : '#bdc4ab';
export const battleDistance = (a: BattlePoint, b: BattlePoint) => Math.hypot(a.x - b.x, a.z - b.z);
export function validBattleInput(value: unknown): value is BattleInput {
  if (!value || typeof value !== 'object') return false;
  const i = value as BattleInput;
  return [i.x, i.z, i.aim].every(v => typeof v === 'number' && Number.isFinite(v))
    && Math.hypot(i.x, i.z) <= 1.000001 && Math.abs(i.aim) <= Math.PI && typeof i.fire === 'boolean';
}
export function battleClear(a: BattlePoint, b: BattlePoint, radius: number, solids: readonly Solid[]): boolean {
  if ([a.x, a.z, b.x, b.z].some(v => !Number.isFinite(v))) return false;
  if ([a.x, a.z, b.x, b.z].some(v => Math.abs(v) > BATTLEFIELD.half - radius)) return false;
  return !solids.some(s => {
    if (s.y0 !== undefined && (s.y0 >= 1.7 || s.y1! <= 0)) return false;
    if ('r' in s) {
      const dx = b.x - a.x, dz = b.z - a.z, n = dx * dx + dz * dz;
      const t = n ? Math.max(0, Math.min(1, ((s.x - a.x) * dx + (s.z - a.z) * dz) / n)) : 0;
      return Math.hypot(a.x + dx * t - s.x, a.z + dz * t - s.z) < s.r + radius;
    }
    let lo = 0, hi = 1;
    for (const [start, delta, center, half] of [[a.x, b.x - a.x, s.x, s.w / 2 + radius], [a.z, b.z - a.z, s.z, s.d / 2 + radius]]) {
      if (Math.abs(delta) < 1e-10) { if (Math.abs(start - center) >= half) return false; }
      else {
        const t0 = (center - half - start) / delta, t1 = (center + half - start) / delta;
        lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
        if (lo > hi) return false;
      }
    }
    return true;
  });
}

// 既存の歩行は局所的な迂回のみ。ボットは行き止まりを検出できる有限グリッドで探索する。
export function battlePath(from: BattlePoint, to: BattlePoint, solids: readonly Solid[]): BattlePoint[] {
  if (!battleClear(from, from, BATTLEFIELD.radius, solids) || !battleClear(to, to, BATTLEFIELD.radius, solids)) return [];
  if (battleClear(from, to, BATTLEFIELD.radius, solids)) return [to];
  const points: BattlePoint[] = [from];
  for (let x = -9; x <= 9; x++) for (let z = -9; z <= 9; z++) {
    const p = { x, z }; if (battleClear(p, p, BATTLEFIELD.radius, solids)) points.push(p);
  }
  const queue = [0], previous = new Map<number, number>([[0, -1]]);
  for (let q = 0; q < queue.length; q++) {
    const n = queue[q], p = points[n];
    if (battleClear(p, to, BATTLEFIELD.radius, solids)) {
      const path = [to]; let at = n;
      while (at > 0) { path.unshift(points[at]); at = previous.get(at)!; }
      return path;
    }
    for (let i = 1; i < points.length; i++) {
      if (previous.has(i) || battleDistance(p, points[i]) > 1.5 || !battleClear(p, points[i], BATTLEFIELD.radius, solids)) continue;
      previous.set(i, n); queue.push(i);
    }
  }
  return [];
}
