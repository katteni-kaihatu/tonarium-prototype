import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JUMP_V } from '../../../shared/protocol.ts';
import { fallToGround } from './movement.ts';
import { canLean, leanAngle, LEAN_ANGLE, pressJump, type LeanContext } from './movementAbilities.ts';

test('extra jump requires a normal jump and a fresh press, uses the same velocity once', () => {
  const b = { y: 0, vy: 0, grounded: true, n: 0, extraJump: false };
  assert.equal(pressJump(b, true, true), 'normal');
  assert.equal(b.vy, JUMP_V);
  b.vy = -1;
  assert.equal(pressJump(b, true, false), null);
  assert.equal(b.vy, -1);
  assert.equal(pressJump(b, false, true), null);
  assert.equal(pressJump(b, true, true), 'extra');
  assert.equal(b.vy, JUMP_V);
  assert.equal(b.n, 2);
  assert.equal(pressJump(b, true, true), null);
  b.y = 0.01; b.vy = -1;
  fallToGround(b, { y: 0 }, 0.05);
  assert.equal(b.grounded, true);
  assert.equal(pressJump(b, true, true), 'normal');
  assert.equal(pressJump(b, true, true), 'extra');
  assert.equal(b.n, 4);
});

test('falling without a normal jump cannot start an extra jump; holding cannot jump after landing', () => {
  const b = { vy: -2, grounded: false, n: 0, extraJump: false };
  assert.equal(pressJump(b, true, true), null);
  b.grounded = true;
  assert.equal(pressJump(b, true, false), null);
  assert.equal(pressJump(b, false, true), 'normal');
  assert.equal(pressJump(b, false, true), null);
});

const context: LeanContext = { enabled: true, locked: true, typing: false, survivor: false,
  carrying: false, dragging: false, holdingTool: false, bike: false };

test('lean tilts left/right symmetrically, simultaneous keys and release return to neutral', () => {
  const left = leanAngle(0, true, false, canLean(context), 1 / 60);
  const right = leanAngle(0, false, true, true, 1 / 60);
  assert.ok(left > 0 && left < LEAN_ANGLE);
  assert.equal(left, -right);
  assert.equal(leanAngle(0, true, true, true, 1 / 60), 0);
  assert.equal(leanAngle(left, true, true, true, 2), 0);
  assert.equal(leanAngle(right, false, false, true, 2), 0);
  for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
    let angle = 0;
    for (let i = 0; i < Math.round(1 / dt); i++) angle = leanAngle(angle, true, false, true, dt);
    assert.ok(Math.abs(angle - LEAN_ANGLE) < 0.0001);
  }
});

test('settings, focus and existing interactions immediately cancel lean', () => {
  for (const change of [{ enabled: false }, { locked: false }, { typing: true }, { survivor: true },
    { carrying: true }, { dragging: true }, { holdingTool: true }, { bike: true }]) {
    assert.equal(leanAngle(LEAN_ANGLE, true, false, canLean({ ...context, ...change }), 1 / 60), 0);
  }
});
