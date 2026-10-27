import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyTrackedPose, avatarTrackingPose, calibratedOrigin, carryPosition, controllerRay, renderedQuaternion, uprightQuaternion } from './pose.ts';
import { clampAvatar } from '../../../shared/places.ts';
import { validAvatarXR, type AvatarXR } from '../../../shared/xr-pose.ts';

const near = (a: THREE.Vector3, b: THREE.Vector3) => assert.ok(a.distanceTo(b) < 1e-8, `${a.toArray()} != ${b.toArray()}`);
const sameRotation = (a: THREE.Quaternion, b: THREE.Quaternion) => assert.ok(1 - Math.abs(a.dot(b)) < 1e-8);

test('reading an XR render camera preserves its supplied world and inverse matrices', () => {
  for (const yaw of [0, .8, -1.2, Math.PI]) {
    const rig = new THREE.Group(); rig.position.set(4, -2, 7); rig.rotation.y = yaw; rig.updateMatrixWorld(true);
    for (const roll of [-.6, 0, .6]) {
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(.3, 1.6, -.2); camera.rotation.set(.2, -.4, roll, 'YXZ'); camera.updateMatrix();
      // WebXRManagerは親のない描画カメラへ、リグ込みのmatrixWorldを直接設定する。
      camera.matrixAutoUpdate = false;
      camera.matrixWorld.multiplyMatrices(rig.matrixWorld, camera.matrix);
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      const before = camera.matrixWorld.clone(), inverse = camera.matrixWorldInverse.clone();
      const expected = rig.quaternion.clone().multiply(camera.quaternion);
      sameRotation(renderedQuaternion(camera), expected);
      const upright = new THREE.Euler().setFromQuaternion(uprightQuaternion(camera), 'YXZ');
      assert.ok(Math.abs(upright.y - new THREE.Euler().setFromQuaternion(expected, 'YXZ').y) < 1e-8);
      assert.ok(Math.abs(upright.z) < 1e-8);
      assert.deepEqual(camera.matrixWorld.elements, before.elements);
      assert.deepEqual(camera.matrixWorldInverse.elements, inverse.elements);
    }
  }
});

test('avatar hands, head and target rays share the calibrated rig after physical movement and locomotion', () => {
  const initial = new THREE.Vector3(.7, 1.7, -.4), eye = 1.1;
  const samples = [initial, new THREE.Vector3(.3, 1.2, -.6), new THREE.Vector3(1.1, 2, .2)];
  for (const basePosition of [new THREE.Vector3(), new THREE.Vector3(8, 2, -5)]) {
    for (const yaw of [0, .8, -1.2, Math.PI]) {
      for (const rotation of [new THREE.Euler(), new THREE.Euler(.4, -.7, .2, 'YXZ'), new THREE.Euler(-.5, 1.2, -.6, 'YXZ')]) {
        const rig = new THREE.Group(); rig.position.copy(calibratedOrigin(basePosition, yaw, initial, eye)); rig.rotation.y = yaw;
        const rawQ = new THREE.Quaternion().setFromEuler(rotation);
        const headYaw = new THREE.Euler().setFromQuaternion(rawQ, 'YXZ').y;
        const avatar = new THREE.Group(); avatar.position.copy(basePosition); avatar.rotation.y = yaw + headYaw;
        const body = new THREE.Group(), model = new THREE.Group();
        avatar.add(body); body.position.y = .13; body.scale.setScalar(1.2);
        body.add(model); model.scale.setScalar(.01); model.rotation.y = Math.PI;
        for (const sample of samples) for (const side of [-1, 0, 1]) {
          const raw = sample.clone().add(new THREE.Vector3(.3 * side, side ? -.4 : 0, side ? -.25 : 0));
          const tracked = new THREE.Group(); rig.add(tracked); tracked.position.copy(raw); tracked.quaternion.copy(rawQ);
          const hand = new THREE.Group(); model.add(hand); avatar.updateMatrixWorld(true); rig.updateMatrixWorld(true);
          applyTrackedPose(hand, avatar, avatarTrackingPose(raw, rawQ, initial, eye, headYaw));
          near(hand.getWorldPosition(new THREE.Vector3()), tracked.getWorldPosition(new THREE.Vector3()));
          sameRotation(hand.getWorldQuaternion(new THREE.Quaternion()), tracked.getWorldQuaternion(new THREE.Quaternion()));
          const ray = controllerRay(tracked);
          const endpoint = new THREE.Vector3(0, 0, -2).applyMatrix4(tracked.matrixWorld);
          near(ray.at(2, new THREE.Vector3()), endpoint);
          const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
          panel.position.copy(endpoint); panel.quaternion.copy(tracked.getWorldQuaternion(new THREE.Quaternion())); panel.updateMatrixWorld(true);
          const hit = new THREE.Raycaster(ray.origin, ray.direction).intersectObject(panel)[0];
          assert.ok(hit?.uv); near(hit.point, endpoint); assert.ok(hit.uv.distanceTo(new THREE.Vector2(.5, .5)) < 1e-8);
          panel.geometry.dispose(); panel.material.dispose(); hand.removeFromParent(); tracked.removeFromParent();
        }
      }
    }
  }
});
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
