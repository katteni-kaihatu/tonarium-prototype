import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CITY_SOLIDS, MANSION_STOPS, SHAFT_DOOR, STATION_PARTS, elevatorDoorOpen, trainState, type ElevatorState } from '../../../shared/city.ts';
import type { Solid } from '../../../shared/worlds.ts';
import { citySolids } from './cityPhysics.ts';

/** メモ化しない素の計算（従来の citySolids の意味論） */
const plain = (now: number, e: ElevatorState): Solid[] => {
  const open = trainState(now).station;
  const out = [...CITY_SOLIDS];
  STATION_PARTS.forEach((p, i) => { if (i !== open) out.push(...p.gates); });
  for (let f = 0; f < MANSION_STOPS; f++) if (!elevatorDoorOpen(e, f, now)) out.push(SHAFT_DOOR(f));
  return out;
};

const parked = (floor: number): ElevatorState => ({ from: floor, to: floor, startAt: 0, queue: [] });

test('結果は素の計算と一致する', () => {
  const states: [number, ElevatorState][] = [
    [0, parked(0)],
    [2000, parked(0)],
    [9500, parked(0)],
    [2000, parked(3)],
    [2000, { from: 0, to: 2, startAt: 1000, queue: [] }],
    [60_000, { from: 5, to: 1, startAt: 50_000, queue: [2] }],
    [123_456, parked(10)],
  ];
  for (const [now, e] of states) assert.deepEqual(citySolids(now, e), plain(now, e), `now=${now}`);
});

test('開いている駅と閉まっている階の組が同じなら同じ配列を返す', () => {
  const e = parked(0);
  const first = citySolids(2000, e);
  // 2000ms と 3000ms はどちらも駅0でドア開・かごは0階で停止中なので決定要素が同じ
  assert.equal(citySolids(3000, e), first);
  // 駅のドアが閉まる 9500ms では組が変わり、再構築される（中身は素の計算と一致）
  const later = citySolids(9500, e);
  assert.notEqual(later, first);
  assert.deepEqual(later, plain(9500, e));
});
