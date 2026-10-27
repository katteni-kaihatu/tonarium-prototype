import test from 'node:test';
import assert from 'node:assert/strict';
import { clampMessengerPosition } from './fantasy-messenger-position.ts';

test('dragging keeps the entire messenger inside every viewport edge', () => {
  const size = { width: 880, height: 640 }, viewport = { width: 1280, height: 800 };
  assert.deepEqual(clampMessengerPosition({ x: -80, y: -20 }, size, viewport), { x: 8, y: 8 });
  assert.deepEqual(clampMessengerPosition({ x: 4000, y: 3000 }, size, viewport), { x: 392, y: 152 });
  assert.deepEqual(clampMessengerPosition({ x: 180.5, y: 90.25 }, size, viewport), { x: 180.5, y: 90.25 });
});

test('restoring a minimized or resized window brings its controls back into reach', () => {
  const original = { x: 920, y: 700 };
  assert.deepEqual(clampMessengerPosition(original, { width: 330, height: 52 }, { width: 1280, height: 800 }), original);
  assert.deepEqual(clampMessengerPosition(original, { width: 880, height: 752 }, { width: 1280, height: 800 }), { x: 392, y: 40 });
  assert.deepEqual(clampMessengerPosition(original, { width: 760, height: 552 }, { width: 808, height: 600 }), { x: 40, y: 40 });
});

test('oversized and temporarily unmeasurable windows never generate invalid CSS coordinates', () => {
  assert.deepEqual(clampMessengerPosition({ x: 100, y: 100 }, { width: 880, height: 760 }, { width: 500, height: 400 }), { x: 0, y: 0 });
  assert.deepEqual(clampMessengerPosition({ x: NaN, y: Infinity }, { width: 880, height: 760 }, { width: 1280, height: 800 }), { x: 8, y: 8 });
  assert.deepEqual(clampMessengerPosition({ x: -1, y: -1 }, { width: NaN, height: -10 }, { width: 0, height: NaN }), { x: 0, y: 0 });
});
