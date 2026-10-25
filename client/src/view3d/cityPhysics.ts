import {
  CAR, CITY_SOLIDS, CITY_SURFACES, MANSION_STOPS, PLATFORM_Y, SHAFT_DOOR, STATION_PARTS, carPose, elevatorDoorOpen, elevatorY,
  inShaft, surfaceHeight, toCarLocal, fromCarLocal, trainState, type CarPose, type ElevatorState,
} from '../../../shared/city.ts';
import type { Solid } from '../../../shared/worlds.ts';

/** 坂や階段で一度に上がれる高さ */
export const STEP_UP = 0.5;
const BODY_R = 0.3;

/** 足元 y から下で、(x, z) にいちばん高い足場。car は電車の床に乗っていればその号車 */
export function cityGround(x: number, z: number, y: number, now: number, e: ElevatorState): { y: number; car: number | null } {
  let best = 0;
  for (const s of CITY_SURFACES) {
    const h = surfaceHeight(s, x, z);
    if (h !== null && h <= y + STEP_UP && h > best) best = h;
  }
  if (inShaft(x, z)) {
    const h = elevatorY(e, now);
    if (h <= y + STEP_UP && h > best) best = h;
  }
  if (PLATFORM_Y <= y + STEP_UP && PLATFORM_Y >= best) {
    for (const k of [0, 1]) {
      const l = toCarLocal(carPose(now, k), x, z);
      if (Math.abs(l.along) < CAR.len / 2 && Math.abs(l.side) < CAR.w / 2) return { y: PLATFORM_Y, car: k };
    }
  }
  return { y: best, car: null };
}

/**
 * 時刻で変わる当たり判定：電車が止まっていない駅の線路側の柵と、かごが来ていない階のドア。
 * 結果は「開いている駅」と「閉まっている階の集合」だけで決まるので、その組が同じ間は
 * 前回の配列をそのまま返す（毎フレーム呼ばれるため再構築を避ける。呼び出し側は読み取り専用）。
 */
let citySolidsCache: { open: number | null; closedDoors: number; out: Solid[] } | null = null;
export function citySolids(now: number, e: ElevatorState): Solid[] {
  const open = trainState(now).station;
  let closedDoors = 0;
  for (let f = 0; f < MANSION_STOPS; f++) if (!elevatorDoorOpen(e, f, now)) closedDoors |= 1 << f;
  if (citySolidsCache && citySolidsCache.open === open && citySolidsCache.closedDoors === closedDoors) return citySolidsCache.out;
  const out = [...CITY_SOLIDS];
  STATION_PARTS.forEach((p, i) => { if (i !== open) out.push(...p.gates); });
  for (let f = 0; f < MANSION_STOPS; f++) if (closedDoors & (1 << f)) out.push(SHAFT_DOOR(f));
  citySolidsCache = { open, closedDoors, out };
  return out;
}

/** 車内では壁の内側に収める。駅でドアが開いている間だけ、ホーム側のドアから出られる */
export function keepInCar(c: CarPose, x: number, z: number, now: number) {
  const l = toCarLocal(c, x, z);
  const along = Math.max(-CAR.len / 2 + BODY_R, Math.min(CAR.len / 2 - BODY_R, l.along));
  const inner = CAR.w / 2 - BODY_R;
  const atDoor = trainState(now).station !== null && CAR.doors.some((d) => Math.abs(along - d) < CAR.doorW / 2 - BODY_R);
  const side = Math.max(-inner, atDoor ? l.side : Math.min(inner, l.side));
  return fromCarLocal(c, along, side);
}

export { carPose, toCarLocal, fromCarLocal };
