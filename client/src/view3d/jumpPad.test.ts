import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, ITEM_INFO, ONLY_3D } from '../../../shared/items.ts';
import { JUMP_PAD, jumpPadAt, jumpPadSolid, type JumpPad } from '../../../shared/jumpPad.ts';
import { pushOut } from '../../../shared/worlds.ts';
import { blocked, fallToGround } from './movement.ts';

const pad = createItem('jumpPad', { id: 'pad', x: 2, z: 3, ry: 1, createdBy: 'alice' }, () => 0) as JumpPad;
const ground = { y: JUMP_PAD.height, jumpPad: true };

test('jump pad is available as a placeable 3D-only item', () => {
  assert.equal(pad.kind, 'jumpPad');
  assert.equal(ONLY_3D.jumpPad, true);
  assert.equal(ITEM_INFO.jumpPad.in3d, true);
  assert.equal(ITEM_INFO.jumpPad.in2d, false);
});

test('descending top contact bounces once and rearms on the next landing', () => {
  const b = { y: 0.19, vy: -1, grounded: false, n: 0 };
  assert.ok(jumpPadAt([pad], 2, 3, b.y));
  assert.equal(fallToGround(b, ground, 1 / 60), true);
  assert.equal(b.y, JUMP_PAD.height);
  assert.equal(b.vy, 4.2);
  assert.equal(b.grounded, false);
  assert.equal(b.n, 1);
  for (let i = 0; i < 10; i++) {
    assert.equal(fallToGround(b, ground, 1 / 60), false);
    assert.equal(b.n, 1);
  }
  let landed = false;
  for (let i = 0; i < 100; i++) {
    if (fallToGround(b, ground, 1 / 60)) { landed = true; break; }
  }
  assert.equal(landed, true);
  assert.equal(b.n, 2);
  assert.equal(b.vy, JUMP_PAD.velocity);
});

test('side, underside and upward contacts do not activate the pad', () => {
  assert.equal(jumpPadAt([pad], 2, 3, 0), undefined);
  assert.equal(jumpPadAt([pad], 2, 3, -1.7), undefined);
  assert.equal(jumpPadAt([pad], 2.81, 3, 1), undefined);
  for (const b of [
    { y: 0, vy: -1, grounded: false, n: 0 },
    { y: -1.7, vy: 4.2, grounded: false, n: 0 },
    { y: JUMP_PAD.height, vy: 4.2, grounded: false, n: 0 },
  ]) {
    assert.equal(fallToGround(b, ground, 1 / 60), false);
    assert.equal(b.n, 0);
  }
  const solid = jumpPadSolid(pad);
  assert.equal(blocked({ x: 2, z: 3, y: 0 }, [solid]), true);
  assert.equal(blocked({ x: 2, z: 3, y: JUMP_PAD.height }, [solid]), false);
  const side = pushOut(2.85, 3, 0.3, [solid], 0);
  assert.ok(Math.hypot(side.x - pad.x, side.z - pad.z) >= 1.1 - 1e-9);
});

test('leaving the pad lands on the floor without another bounce', () => {
  const b = { y: 0.2, vy: -1, grounded: false, n: 0 };
  fallToGround(b, ground, 0.05);
  assert.equal(jumpPadAt([pad], 5, 3, b.y), undefined);
  for (let i = 0; i < 100 && !b.grounded; i++) fallToGround(b, { y: 0 }, 1 / 60);
  assert.equal(b.n, 1);
  assert.equal(b.grounded, true);
  assert.equal(b.y, 0);
});

test('top landings remain repeatable across frame rates and fast descents', () => {
  for (const dt of [1 / 144, 1 / 60, 1 / 30, 0.05]) {
    const b = { y: 1, vy: -30, grounded: false, n: 0 };
    for (let i = 0; i < Math.ceil(3 / dt); i++) {
      const top = jumpPadAt([pad], pad.x, pad.z, b.y);
      const before = b.n;
      const bounced = fallToGround(b, top ? ground : { y: 0 }, dt);
      assert.equal(b.n - before, bounced ? 1 : 0);
      assert.ok(b.y >= JUMP_PAD.height);
    }
    assert.ok(b.n >= 3);
  }
});
