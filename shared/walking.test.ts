import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampAvatar } from './places.ts';

test('position sanitization retains walking transitions without coordinate changes', () => {
  const position = { x: 1, z: 2, ry: 0 };
  for (const walking of [true, false]) {
    const sanitized = clampAvatar('room', { ...position, walking });
    assert.equal(sanitized.walking, walking);
    assert.equal(sanitized.x, position.x);
    assert.equal(sanitized.z, position.z);
  }
  assert.equal(clampAvatar('room', position).walking, undefined);
});

test('train passengers cannot publish a walking pose', () => {
  const riding = { x: 1, z: 2, ry: 0, walking: true, ride: { car: 0, along: 0, side: 0, ry: 0 } };
  assert.equal(clampAvatar('city', riding).walking, false);
});
