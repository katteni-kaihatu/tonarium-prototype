import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CAMERA_DISTANCE, LEAN_OFFSET, PlayerCamera } from './playerCamera.ts';
import { aimAt } from './interact.ts';
import { LEAN_ANGLE } from './movementAbilities.ts';

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function setup() {
  const rig = new PlayerCamera();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 300);
  camera.rotation.order = 'YXZ';
  const scene = new THREE.Scene();
  const anchor = new THREE.Vector3(0, 1.5, 0);
  return { rig, camera, scene, anchor };
}
function wall(scene: THREE.Scene, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.1), new THREE.MeshBasicMaterial());
  mesh.position.set(0, 1.5, z);
  scene.add(mesh);
  return mesh;
}

test('lean offsets the view sideways and returns to neutral without moving the player in both views', () => {
  const { rig, camera, scene, anchor } = setup();
  const original = anchor.clone();
  for (const thirdPerson of [false, true]) {
    rig.thirdPerson = thirdPerson;
    for (const yaw of [0, Math.PI / 2, -1]) {
      for (const pitch of [-1.4, 0, 1.4]) {
        rig.lean = 0;
        camera.rotation.set(pitch, yaw, 0);
        rig.place(camera, scene, anchor);
        const position = camera.position.clone();
        const direction = camera.getWorldDirection(new THREE.Vector3());
        for (const angle of [LEAN_ANGLE, -LEAN_ANGLE, 0]) {
          rig.lean = angle;
          camera.rotation.set(pitch, yaw, rig.lean);
          rig.place(camera, scene, anchor);
          close(anchor.distanceTo(original), 0);
          const offset = -angle / LEAN_ANGLE * LEAN_OFFSET;
          close(camera.position.x - position.x, Math.cos(yaw) * offset);
          close(camera.position.y - position.y, 0);
          close(camera.position.z - position.z, -Math.sin(yaw) * offset);
          close(rig.actualDistance, thirdPerson ? CAMERA_DISTANCE.initial : 0);
          close(camera.getWorldDirection(new THREE.Vector3()).distanceTo(direction), 0);
          close(camera.rotation.z, angle);
        }
      }
    }
  }
});

test('starts in first person; T toggles once per press and F5 keeps its browser default', () => {
  const { rig } = setup();
  assert.equal(rig.thirdPerson, false);
  let prevented = 0;
  const press = (repeat = false, code = 'KeyT') => {
    const event = { code, repeat, preventDefault: () => prevented++ };
    return rig.keyDown(event);
  };
  press();
  assert.equal(rig.thirdPerson, true);
  for (let i = 0; i < 100; i++) press(true);
  assert.equal(rig.thirdPerson, true);
  press();
  assert.equal(rig.thirdPerson, false);
  assert.equal(prevented, 0);
  assert.equal(press(false, 'F5'), false);
  assert.equal(press(true, 'F5'), false);
  assert.equal(rig.thirdPerson, false);
  assert.equal(press(false, 'KeyW'), false);
  assert.equal(prevented, 0);
  assert.equal(new PlayerCamera().thirdPerson, false);
});

test('labels do not stop movement, look or item targeting across repeated view switches', () => {
  const { rig, camera, scene, anchor } = setup();
  const label = new THREE.Sprite(new THREE.SpriteMaterial());
  label.position.set(0, 2, 0);
  label.userData.noRay = true;
  scene.add(label);
  let labelRaycasts = 0;
  label.raycast = () => { labelRaycasts++; throw new Error('camera-less sprite raycast'); };
  const item = wall(scene, -2);
  let uses = 0;
  item.userData.use = () => uses++;

  for (let i = 0; i < 20; i++) {
    rig.keyDown({ code: 'KeyT', repeat: false });
    anchor.x += 0.01;
    camera.rotation.set(0.01 * i, 0.005 * i, 0);
    const orientation = camera.quaternion.clone();
    rig.place(camera, scene, anchor);
    assert.equal(rig.thirdPerson, i % 2 === 0);
    assert.ok(camera.quaternion.equals(orientation));
    close(camera.position.x, anchor.x + Math.sin(camera.rotation.y) * Math.cos(camera.rotation.x) * rig.actualDistance);
    // 照準用のレイにはカメラが設定されるため、通常の Sprite 判定を使う。
    label.raycast = THREE.Sprite.prototype.raycast;
    const aim = aimAt(scene, camera);
    assert.equal(aim?.obj, item);
    aim!.data.use!(aim!.hit);
    label.raycast = () => { labelRaycasts++; throw new Error('camera-less sprite raycast'); };
  }
  assert.equal(labelRaycasts, 0);
  assert.equal(uses, 20);
});

test('a real sprite does not throw when switching to third person', () => {
  const { rig, camera, scene, anchor } = setup();
  scene.add(new THREE.Sprite(new THREE.SpriteMaterial()));
  for (let i = 0; i < 20; i++) {
    rig.keyDown({ code: 'KeyT', repeat: false });
    assert.doesNotThrow(() => rig.place(camera, scene, anchor));
  }
});

test('third person stays directly behind the view at several yaw and pitch angles, with no shoulder offset', () => {
  const { rig, camera, scene, anchor } = setup();
  rig.thirdPerson = true;
  for (const yaw of [0, Math.PI / 2, Math.PI, -1]) {
    for (const pitch of [-1.4, 0, 1.4]) {
      camera.rotation.set(pitch, yaw, 0);
      rig.place(camera, scene, anchor);
      const offset = camera.position.clone().sub(anchor);
      close(offset.length(), CAMERA_DISTANCE.initial);
      close(offset.x * Math.cos(yaw) - offset.z * Math.sin(yaw), 0);
      assert.ok(offset.x * Math.sin(yaw) + offset.z * Math.cos(yaw) > 0);
      close(offset.clone().normalize().dot(camera.getWorldDirection(new THREE.Vector3())), -1);
    }
  }
});

test('wheel respects desired-distance limits and does nothing in first person', () => {
  const { rig } = setup();
  rig.zoom(100);
  close(rig.desiredDistance, CAMERA_DISTANCE.initial);
  rig.thirdPerson = true;
  rig.zoom(100);
  close(rig.desiredDistance, CAMERA_DISTANCE.initial + CAMERA_DISTANCE.wheelStep);
  for (let i = 0; i < 100; i++) rig.zoom(100);
  close(rig.desiredDistance, CAMERA_DISTANCE.max);
  for (let i = 0; i < 100; i++) rig.zoom(-100);
  close(rig.desiredDistance, CAMERA_DISTANCE.min);
});

test('nearest obstacle wins regardless of scene order, even when noRay is set for interaction', () => {
  const { rig, camera, scene, anchor } = setup();
  rig.thirdPerson = true;
  wall(scene, 2.5);
  wall(scene, 1).userData.noRay = true;
  rig.place(camera, scene, anchor);
  close(rig.actualDistance, 0.95 - CAMERA_DISTANCE.margin);
  close(camera.position.z, rig.actualDistance);
  close(rig.desiredDistance, CAMERA_DISTANCE.initial);
});

test('ray uses world transforms and stops at the desired distance', () => {
  const { rig, camera, scene, anchor } = setup();
  rig.thirdPerson = true;
  const beyond = wall(scene, 5);
  rig.place(camera, scene, anchor);
  close(rig.actualDistance, rig.desiredDistance);
  scene.remove(beyond);
  const group = new THREE.Group();
  group.rotation.y = Math.PI / 2;
  group.add(wall(scene, 1));
  scene.add(group);
  camera.rotation.y = Math.PI / 2;
  rig.place(camera, scene, anchor);
  close(rig.actualDistance, 0.95 - CAMERA_DISTANCE.margin);
  close(camera.position.x, rig.actualDistance);
  close(camera.position.z, 0);
});

test('close obstacles override the minimum and disappearing obstacles restore the current desired distance', () => {
  const { rig, camera, scene, anchor } = setup();
  rig.thirdPerson = true;
  const obstacle = wall(scene, 0.2);
  rig.place(camera, scene, anchor);
  close(rig.actualDistance, 0);
  close(rig.desiredDistance, CAMERA_DISTANCE.initial);
  rig.zoom(1);
  rig.place(camera, scene, anchor);
  close(rig.actualDistance, 0);
  const desired = CAMERA_DISTANCE.initial + CAMERA_DISTANCE.wheelStep;
  close(rig.desiredDistance, desired);
  scene.remove(obstacle);
  rig.place(camera, scene, anchor);
  close(rig.actualDistance, desired);
});

test('self avatar collider, first-person models and hidden meshes do not obstruct the camera', () => {
  const { rig, camera, scene, anchor } = setup();
  rig.thirdPerson = true;
  const self = new THREE.Group();
  self.userData.selfBody = true;
  const collider = wall(scene, 0.3);
  self.add(collider);
  scene.add(self);
  wall(scene, 0.5).userData.firstPerson = true;
  wall(scene, 0.7).visible = false;
  const invisible = wall(scene, 0.9).material as THREE.MeshBasicMaterial;
  invisible.transparent = true;
  invisible.opacity = 0;
  rig.place(camera, scene, anchor);
  close(rig.actualDistance, rig.desiredDistance);
});

test('switching back restores the exact first-person position and rotation without changing player position', () => {
  const { rig, camera, scene, anchor } = setup();
  const original = anchor.clone();
  camera.rotation.set(0.4, 0.7, 0);
  const orientation = camera.quaternion.clone();
  rig.thirdPerson = true;
  rig.place(camera, scene, anchor);
  assert.ok(!camera.position.equals(anchor));
  assert.ok(anchor.equals(original));
  rig.thirdPerson = false;
  rig.place(camera, scene, anchor);
  assert.ok(camera.position.equals(original));
  assert.ok(camera.quaternion.equals(orientation));
  close(rig.actualDistance, 0);
  close(rig.desiredDistance, CAMERA_DISTANCE.initial);
});
