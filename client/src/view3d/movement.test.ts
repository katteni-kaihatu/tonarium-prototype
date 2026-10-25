import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blocked, blockedByTrain, moveFlight, recoverPosition, walkingAfterMove } from './movement.ts';
import { CAR, PLATFORM_Y, carPose, fromCarLocal } from '../../../shared/city.ts';
import type { Solid } from '../../../shared/worlds.ts';
import { pushOut } from '../../../shared/worlds.ts';

test('walking follows resolved horizontal movement, with speed hysteresis', () => {
  const origin = { x: 0, z: 0 };
  const walking = (active: boolean, speed: number, dt = 1 / 60) =>
    walkingAfterMove(active, 'walk', true, false, origin, { x: speed * dt, z: 0 }, dt);
  for (const dt of [1 / 30, 1 / 60, 1 / 144]) assert.equal(walking(false, 4, dt), true);
  assert.equal(walking(false, 0.12), false);
  assert.equal(walking(true, 0.12), true);
  assert.equal(walking(true, 0.04), false);
  assert.equal(walking(true, 0), false);
  assert.equal(walkingAfterMove(true, 'walk', true, false, origin, origin, 0), false);
});

test('wall pressure stops walking while sliding along a wall keeps walking', () => {
  const solids: Solid[] = [{ x: 1, z: 0, w: 1, d: 10 }];
  const start = { x: 0.2, z: 0 };
  const stopped = pushOut(start.x + 0.06, start.z, 0.3, solids, 0);
  assert.equal(walkingAfterMove(true, 'walk', true, false, start, stopped, 1 / 60), false);
  const sliding = pushOut(start.x + 0.06, start.z + 0.06, 0.3, solids, 0);
  assert.equal(walkingAfterMove(false, 'walk', true, false, start, sliding, 1 / 60), true);
});

test('takeoff, flight, noclip and boarding stop walking; landing and dismount allow it again', () => {
  const start = { x: 0, z: 0 }, end = { x: 0.06, z: 0 };
  for (const mode of ['walk', 'fly', 'noclip'] as const) {
    assert.equal(walkingAfterMove(true, mode, false, false, start, end, 1 / 60), false);
    assert.equal(walkingAfterMove(true, mode, true, true, start, end, 1 / 60), false);
    assert.equal(walkingAfterMove(true, mode, true, false, start, end, 1 / 60), mode === 'walk');
  }
  assert.equal(walkingAfterMove(false, 'walk', true, false, start, end, 1 / 60), true);
});

const wall: Solid = { x: 1, z: 0, w: 0.1, d: 10, y0: 0, y1: 6 };
const ceiling = { x0: -5, x1: 5, z0: -5, z1: 5, ya: 3, yb: 3 };
const collides = (p: { x: number; y: number; z: number }) => blocked(p, [wall], [ceiling]);

test('fly stops at walls, floors and ceilings, including large movement steps', () => {
  const start = { x: 0, y: 0, z: 0 };
  const wallStop = moveFlight(start, { x: 4, y: 0, z: 0 }, collides);
  assert.ok(wallStop.x > 0.5 && wallStop.x <= 0.65);
  const ceilingStop = moveFlight(start, { x: 0, y: 5, z: 0 }, collides);
  assert.ok(ceilingStop.y > 1 && ceilingStop.y <= 1.18 + 1e-7);
  assert.equal(moveFlight(start, { x: 0, y: -5, z: 0 }, collides).y, 0);
  assert.equal(collides(wallStop), false);
  assert.equal(collides(ceilingStop), false);
});

test('flight moves in six directions and stays still without input; noclip crosses colliders', () => {
  const start = { x: -2, y: 0.5, z: 0 };
  for (const axis of ['x', 'y', 'z'] as const) for (const sign of [-1, 1]) {
    const delta = { x: 0, y: 0, z: 0, [axis]: sign * 0.1 };
    const end = moveFlight(start, delta, collides);
    assert.ok(Math.abs(end[axis] - start[axis] - delta[axis]) < 1e-8);
  }
  assert.deepEqual(moveFlight(start, { x: 0, y: 0, z: 0 }, collides), start);
  const end = moveFlight(start, { x: 6, y: -4, z: 0 }, () => false);
  assert.ok(Math.abs(end.x - 4) < 1e-8 && end.y < 0);
});

test('restoring collision validates correction, handles below-floor and ceiling penetration', () => {
  for (const inside of [{ x: 1, y: 1, z: 0 }, { x: 0, y: -2, z: 0 }, { x: 0, y: 2, z: 0 }]) {
    const safe = recoverPosition(inside, { x: -3, y: 0, z: 0 }, [wall], (p) => !collides(p));
    assert.ok(safe);
    assert.equal(collides(safe), false);
  }
  const airborne = { x: -2, y: 5, z: 0 };
  assert.deepEqual(recoverPosition(airborne, { x: 0, y: 0, z: 0 }, [wall], (p) => !collides(p)), airborne);
});

test('fallback uses verified spawn and rejects impossible recovery', () => {
  const inside = { x: 1, y: 1, z: 0 };
  const spawn = { x: 30, y: 0, z: 0 };
  assert.deepEqual(recoverPosition(inside, spawn, [wall], (p) => p.x === 30 && p.y === 0), spawn);
  assert.equal(recoverPosition(inside, spawn, [wall], () => false), null);
});

test('train floors, roofs and ends block flight in train coordinates', () => {
  const now = 10000;
  const pose = carPose(now, 0);
  const floor = fromCarLocal(pose, 0, 0);
  assert.equal(blockedByTrain({ ...floor, y: PLATFORM_Y - 0.2 }, now), true);
  assert.equal(blockedByTrain({ ...floor, y: PLATFORM_Y }, now), false);
  assert.equal(blockedByTrain({ ...floor, y: PLATFORM_Y + CAR.h - 0.2 }, now), true);
  const end = fromCarLocal(pose, CAR.len / 2, 0);
  assert.equal(blockedByTrain({ ...end, y: PLATFORM_Y }, now), true);
});
