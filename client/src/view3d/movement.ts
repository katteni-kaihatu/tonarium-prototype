import { pushOut, type Solid } from '../../../shared/worlds.ts';
import { CAR, PLATFORM_Y, carPose, toCarLocal, trainState, surfaceHeight, type Surface } from '../../../shared/city.ts';

export const MOVEMENT_MODES = { walk: '歩行', fly: 'フライ', noclip: 'ノークリップ' } as const;
export type MovementMode = keyof typeof MOVEMENT_MODES;
export interface Position { x: number; y: number; z: number }
export function walkingAfterMove(walking: boolean, mode: MovementMode, grounded: boolean, riding: boolean,
  before: Pick<Position, 'x' | 'z'>, after: Pick<Position, 'x' | 'z'>, dt: number): boolean {
  if (mode !== 'walk' || !grounded || riding || dt <= 0) return false;
  const speed = Math.hypot(after.x - before.x, after.z - before.z) / Math.min(dt, 0.1);
  return Number.isFinite(speed) && speed > (walking ? 0.08 : 0.18);
}
export const BODY_RADIUS = 0.3;
export const BODY_HEIGHT = 1.7;

export function blockedByTrain(p: Position, now: number, height = BODY_HEIGHT) {
  for (const k of [0, 1]) {
    const local = toCarLocal(carPose(now, k), p.x, p.z);
    if (Math.abs(local.along) > CAR.len / 2 + BODY_RADIUS + 0.1 || Math.abs(local.side) > CAR.w / 2 + BODY_RADIUS + 0.1) continue;
    const slabs: Solid[] = [
      { x: 0, z: 0, w: CAR.w, d: CAR.len, y0: PLATFORM_Y - 0.5, y1: PLATFORM_Y },
      { x: 0, z: 0, w: CAR.w, d: CAR.len, y0: PLATFORM_Y + CAR.h - 0.075, y1: PLATFORM_Y + CAR.h + 0.075 },
      ...[-1, 1].map((sign) => ({ x: 0, z: sign * CAR.len / 2, w: CAR.w, d: 0.1, y0: PLATFORM_Y, y1: PLATFORM_Y + CAR.h })),
    ];
    const open = trainState(now).station !== null;
    for (const sign of [-1, 1]) {
      let start = -CAR.len / 2;
      const doors = sign === 1 && open ? CAR.doors.slice().sort((a, b) => a - b) : [];
      for (const end of [...doors.map((d) => d - CAR.doorW / 2), CAR.len / 2]) {
        slabs.push({ x: sign * (CAR.w / 2 - 0.04), z: (start + end) / 2, w: 0.08, d: end - start, y0: PLATFORM_Y, y1: PLATFORM_Y + CAR.h });
        start = end + CAR.doorW;
      }
    }
    if (blocked({ x: local.side, y: p.y, z: local.along }, slabs, [], height)) return true;
  }
  return false;
}

export function blocked(p: Position, solids: Solid[], surfaces: Surface[] = [], height = BODY_HEIGHT) {
  if (p.y < 0) return true;
  for (const s of solids) {
    if (p.y + height <= (s.y0 ?? -Infinity) || p.y >= (s.y1 ?? Infinity)) continue;
    const dx = 'r' in s ? p.x - s.x : p.x - Math.max(s.x - s.w / 2, Math.min(s.x + s.w / 2, p.x));
    const dz = 'r' in s ? p.z - s.z : p.z - Math.max(s.z - s.d / 2, Math.min(s.z + s.d / 2, p.z));
    if (Math.hypot(dx, dz) < ('r' in s ? s.r + BODY_RADIUS : BODY_RADIUS) - 1e-7) return true;
  }
  for (const s of surfaces) {
    const x = Math.max(s.x0, Math.min(s.x1, p.x));
    const z = Math.max(s.z0, Math.min(s.z1, p.z));
    if (Math.hypot(x - p.x, z - p.z) >= BODY_RADIUS) continue;
    const y = surfaceHeight(s, x, z);
    if (y !== null && p.y < y - 1e-7 && p.y + height > y - 0.12 + 1e-7) return true;
  }
  return false;
}

// 小刻みに判定して薄い壁や天井の飛び越しを防ぐ。
export function moveFlight(p: Position, delta: Position, collides: (p: Position) => boolean): Position {
  const out = { ...p };
  const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.y, delta.z) / 0.02));
  for (let i = 0; i < steps; i++) {
    for (const axis of ['x', 'z', 'y'] as const) {
      const next = { ...out, [axis]: out[axis] + delta[axis] / steps };
      if (!collides(next)) out[axis] = next[axis];
    }
  }
  return out;
}

export function recoverPosition(p: Position, spawn: Position, solids: Solid[], valid: (p: Position) => boolean): Position | null {
  if (valid(p)) return p;
  const pushed = pushOut(p.x, p.z, BODY_RADIUS + 0.01, solids, Math.max(0, p.y));
  const candidate = { ...pushed, y: Math.max(0, p.y) };
  if (valid(candidate)) return candidate;
  for (const origin of [p, spawn]) {
    const base = { ...origin, y: Math.max(0, origin.y) };
    if (valid(base)) return base;
    for (let r = 0.5; r <= 8; r += 0.5) {
      for (let i = 0; i < 16; i++) {
        const q = { x: base.x + Math.cos(i * Math.PI / 8) * r, y: base.y, z: base.z + Math.sin(i * Math.PI / 8) * r };
        if (valid(q)) return q;
      }
    }
  }
  return null;
}
