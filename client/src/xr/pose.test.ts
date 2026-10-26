import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { calibratedOrigin, carryPosition, uprightQuaternion } from './pose.ts';
import { clampAvatar } from '../../../shared/places.ts';
import { validAvatarXR, type AvatarXR } from '../../../shared/xr-pose.ts';

const near = (a: THREE.Vector3, b: THREE.Vector3) => assert.ok(a.distanceTo(b) < 1e-8, `${a.toArray()} != ${b.toArray()}`);
test('initial local-floor position aligns with avatar eyes at every rig yaw; physical head motion is retained', () => {
  const base = new THREE.Vector3(2, 3, -4), initial = new THREE.Vector3(.7, 1.75, -.4), eye = 1.1;
  for (const yaw of [0, .8, -1.2, Math.PI]) {
    const origin = calibratedOrigin(base, yaw, initial, eye);
    const head = initial.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).add(origin);
    near(head, base.clone().add(new THREE.Vector3(0, eye, 0)));
    const moved = initial.clone().add(new THREE.Vector3(.2, -.3, .1)).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).add(origin);
    near(moved.clone().sub(head), new THREE.Vector3(.2, -.3, .1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw));
  }
});
test('upright floating panels remove headset roll including a rotated camera parent', () => {
  const parent = new THREE.Group(), camera = new THREE.PerspectiveCamera();
  parent.rotation.y = .4; parent.add(camera);
  for (const roll of [-.7, 0, .7]) {
    camera.rotation.set(.2, .5, roll, 'YXZ'); parent.updateMatrixWorld(true);
    const upright = uprightQuaternion(camera);
    const e = new THREE.Euler().setFromQuaternion(upright, 'YXZ');
    assert.ok(Math.abs(e.z) < 1e-8);
    assert.ok(Math.abs(e.x - .2) < 1e-8); assert.ok(Math.abs(e.y - .9) < 1e-8);
  }
});
test('carrying follows the holding ray position and direction, independently of head orientation', () => {
  const held = new THREE.Ray(new THREE.Vector3(1, 1, 2), new THREE.Vector3(0, 0, -1));
  near(carryPosition(held), new THREE.Vector3(1, 1, 0));
  const head = new THREE.PerspectiveCamera(); head.rotation.y = Math.PI;
  near(carryPosition(held), new THREE.Vector3(1, 1, 0));
  held.direction.set(-1, 0, 0); near(carryPosition(held), new THREE.Vector3(-1, 1, 2));
});
test('tracked poses retain both hands and orientation; invalid and legacy poses do not persist', () => {
  const pose: AvatarXR = { head: { p: [0, 1.1, 0], q: [0, 0, 0, 1] },
    left: { p: [-.3, .8, -.3], q: [0, Math.SQRT1_2, 0, Math.SQRT1_2] }, right: { p: [.3, .9, -.4], q: [0, 0, 0, 1] } };
  assert.ok(validAvatarXR(pose));
  assert.deepEqual(clampAvatar('room', { x: 0, z: 0, ry: 0, xr: pose }).xr, pose);
  for (const bad of [null, {}, { ...pose, left: { p: [Infinity, 0, 0], q: [0, 0, 0, 1] } },
    { ...pose, right: { p: [0, 0, 0], q: [1, 1, 1, 1] } }, { ...pose, head: { p: [0, 9, 0], q: [0, 0, 0, 1] } }]) assert.equal(validAvatarXR(bad), false);
  assert.equal(clampAvatar('room', { x: 0, z: 0, ry: 0 }).xr, undefined);
});
