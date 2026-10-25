import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIKE, clampBike, vehicleInitial } from '../../../shared/vehicle.ts';
import { moveBike } from './bikePhysics.ts';

const throttle = { throttle: 1, brake: 0, steering: 0 };
test('substeps stop at a thin wall even across a long render frame', () => {
  const s = { ...vehicleInitial(0, 0, 0), speed: BIKE.maxSpeed };
  const next = moveBike(s, throttle, 0.25, [{ x: 0, z: -2, w: 5, d: 0.1 }], n => n);
  assert.ok(next.z >= -2 + 0.05 + BIKE.radius - 1e-8);
  assert.equal(next.speed, 0);
});
test('world boundaries stop the bike and circular obstacles push it out', () => {
  const clamp = (n: number) => Math.max(-5, Math.min(5, n));
  const s = { ...vehicleInitial(0, -4.9, 0), speed: BIKE.maxSpeed };
  const next = moveBike(s, throttle, 0.1, [], clamp);
  assert.equal(next.z, -5);
  assert.equal(next.speed, 0);
  const obstacle = moveBike(vehicleInitial(0, 0, 0), throttle, 0.1, [{ x: 0, z: 0, r: 0.5 }], clamp);
  assert.ok(Math.hypot(obstacle.x, obstacle.z) >= BIKE.radius + 0.5 - 1e-8);
});

test('boundary clearance contains the full collision circle at room and city edges', () => {
  for (const half of [10, 60]) {
    for (const direction of [-1, 1]) {
      const state = { ...vehicleInitial(0, direction * (half - BIKE.radius - 0.01), direction < 0 ? 0 : Math.PI), speed: BIKE.maxSpeed };
      const next = moveBike(state, throttle, 0.1, [], n => clampBike(n, half));
      assert.ok(Math.abs(next.z) + BIKE.radius <= half + 1e-8);
      assert.equal(next.speed, 0);
    }
  }
});
