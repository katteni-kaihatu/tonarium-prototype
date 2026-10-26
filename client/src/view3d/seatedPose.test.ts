import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DEFAULT_PARAMS } from '../../../shared/avatar.ts';
import { applySeatedFoot, avatarHipHeight, stepSeatedWeight } from './seatedPose.ts';

test('seated transition is independent of rendering frequency and restores the exact standing pose', () => {
  let at30 = 0, at120 = 0;
  for (let i = 0; i < 15; i++) at30 = stepSeatedWeight(at30, true, 1 / 30);
  for (let i = 0; i < 60; i++) at120 = stepSeatedWeight(at120, true, 1 / 120);
  assert.ok(Math.abs(at30 - at120) < 1e-10);
  assert.ok(at30 > 0.99);
  for (let i = 0; i < 240; i++) at120 = stepSeatedWeight(at120, false, 1 / 120);
  assert.equal(at120, 0);
  assert.equal(stepSeatedWeight(0, true, 1 / 120, true), 1);
  assert.equal(stepSeatedWeight(1, false, 1 / 120, true), 0);
});

test('seated legs use the current mixer pose without accumulating rotation or position', () => {
  const foot = new THREE.Group();
  const base = { position: new THREE.Vector3(6, 1, 0), quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.05)) };
  applySeatedFoot(foot, base, 1);
  const q = foot.quaternion.clone();
  for (let i = 0; i < 600; i++) applySeatedFoot(foot, base, 1);
  assert.ok(foot.quaternion.angleTo(q) < 1e-8);
  applySeatedFoot(foot, base, 0);
  assert.ok(foot.position.distanceTo(base.position) < 1e-10);
  assert.ok(foot.quaternion.angleTo(base.quaternion) < 1e-8);
});

test('seat eye and body offset follow leg proportions while neck translation remains compensated', () => {
  const normal = avatarHipHeight(DEFAULT_PARAMS);
  assert.ok(normal > 0.4 && normal < 0.5);
  assert.ok(Math.abs(normal - avatarHipHeight({ ...DEFAULT_PARAMS, neckLength: 20, legsDistanceFromBody: 10 })) < 1e-10);
  assert.ok(avatarHipHeight({ ...DEFAULT_PARAMS, legsSize: 1 }) > normal);
  assert.ok(avatarHipHeight({ ...DEFAULT_PARAMS, legsSize: -100 }) > 0);
});
