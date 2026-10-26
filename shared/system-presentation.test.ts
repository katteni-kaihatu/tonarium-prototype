import { test } from 'node:test';
import assert from 'node:assert/strict';
import { systemSeat, systemSolids } from './system-presentation.ts';
import type { SystemView } from './system-types.ts';

test('bound-object movement controls collision and rotated seat anchors', () => {
  const view: SystemView = {
    revision: 1,
    map: { schema: 1, id: 'test', systems: [], connections: [], objects: [{ id: 'door', capabilities: ['move', 'seat'], position: [0, 0, 0], rotation: Math.PI / 2, size: [2, 3, 1], solid: true, seatOffset: [1, 0.4, 0] }] },
    systems: [], objects: { door: { position: [5, 1, 6] } }, seats: { door: 'alice' }, diagnostics: [], traces: [],
  };
  const solid = systemSolids(view)[0];
  assert.ok('w' in solid && 'd' in solid);
  assert.equal(solid.x, 5); assert.equal(solid.z, 6); assert.equal(solid.y0, 1); assert.equal(solid.y1, 4);
  assert.ok(Math.abs(solid.w - 1) < 1e-9); assert.ok(Math.abs(solid.d - 2) < 1e-9);
  const seat = systemSeat(view, 'alice')!;
  assert.equal(seat.z, 5); assert.equal(seat.y, 1.4); assert.equal(systemSeat(view, 'bob'), undefined);
});
