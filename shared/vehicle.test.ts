import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIKE, angleDelta, releaseBike, stepVehicle, vehicleInitial } from './vehicle.ts';
import { applyItemAction, createItem } from './items.ts';

const straight = { throttle: 1, brake: 0, steering: 0 };
const simulate = (fps: number) => {
  let s = vehicleInitial(0, 0, 0);
  for (let i = 0; i < fps * 4; i++) s = stepVehicle(s, { ...straight, steering: 0.2 }, 1 / fps);
  return s;
};

test('fixed steps preserve motion across 30, 60 and 144 FPS', () => {
  const expected = simulate(120);
  for (const fps of [30, 60, 144]) {
    const actual = simulate(fps);
    for (const key of ['x', 'z', 'ry', 'speed', 'roll', 'wheel', 'heading'] as const)
      assert.ok(Math.abs(actual[key] - expected[key]) < 1e-8, `${fps}: ${key}`);
  }
});

test('acceleration is capped, wheel distance agrees, braking stops without reversing', () => {
  let s = vehicleInitial(0, 0, 0);
  for (let i = 0; i < 1200; i++) s = stepVehicle(s, straight, BIKE.step);
  assert.ok(s.speed > 9 && s.speed <= BIKE.maxSpeed);
  assert.ok(Math.abs(s.wheel * BIKE.wheelRadius + s.z) < 1e-8);
  for (let i = 0; i < 300; i++) s = stepVehicle(s, { throttle: 0, brake: 1, steering: 0 }, BIKE.step);
  assert.equal(s.speed, 0);
});

test('zero dt is immutable and analog inputs are bounded', () => {
  const previous = vehicleInitial(1, 2, 0.3);
  const saved = { ...previous };
  assert.deepEqual(stepVehicle(previous, straight, 0), saved);
  assert.deepEqual(previous, saved);
  assert.deepEqual(stepVehicle(previous, { throttle: 100, brake: -1, steering: 100 }, 0.1),
    stepVehicle(previous, { throttle: 1, brake: 0, steering: 1 }, 0.1));
});

test('right and left steering lean inward; sharp turns slip and slow down', () => {
  for (const direction of [-1, 1]) {
    let s = { ...vehicleInitial(0, 0, 0), speed: 3 };
    for (let i = 0; i < 30; i++) s = stepVehicle(s, { throttle: 0, brake: 0, steering: direction * 0.2 }, BIKE.step);
    assert.ok(s.ry * direction < 0);
    assert.ok(s.roll * direction < 0);
    assert.equal(s.slipping, false);
    const fast = { ...vehicleInitial(0, 0, 0), speed: 10 };
    const slipped = stepVehicle(fast, { throttle: 0, brake: 0, steering: direction }, BIKE.step);
    const coasted = stepVehicle(fast, { throttle: 0, brake: 0, steering: 0 }, BIKE.step);
    assert.equal(slipped.slipping, true);
    assert.ok(Math.abs(angleDelta(slipped.ry, slipped.heading)) > 0);
    assert.ok(slipped.speed < coasted.speed);
  }
});

test('rider ownership, ride versions, malformed states and release', () => {
  const item = createItem('bike', { id: 'b', x: 0, z: 0, ry: 0, createdBy: 'a' }, Math.random);
  assert.ok(item?.kind === 'bike');
  const act = (action: Parameters<typeof applyItemAction>[1], who = 'a') => applyItemAction(item, action, who, Math.random);
  assert.ok(act({ a: 'bikeMount' }));
  const version = item.rideVersion;
  assert.equal(act({ a: 'bikeMount' }, 'b'), false);
  const state = stepVehicle(item, straight, 0.1);
  assert.equal(act({ a: 'bikeDrive', state, rideVersion: version }, 'b'), false);
  assert.equal(act({ a: 'bikeDismount' }, 'b'), false);
  assert.equal(act({ a: 'bikeDrive', state: { ...state, speed: NaN }, rideVersion: version }), false);
  assert.ok(act({ a: 'bikeDrive', state, rideVersion: version }));
  assert.ok(act({ a: 'bikeDismount' }));
  assert.equal(item.rider, null);
  assert.equal(item.speed, 0);
  assert.equal(act({ a: 'bikeDrive', state, rideVersion: version }), false);
  assert.ok(act({ a: 'bikeMount' }));
  assert.equal(act({ a: 'bikeDrive', state, rideVersion: version }), false);
  const released = releaseBike(item);
  assert.equal(released.rider, null);
  assert.equal(released.roll, 0);
  assert.equal(item.rider, 'a');
});
