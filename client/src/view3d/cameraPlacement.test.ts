import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyItemAction, createItem } from '../../../shared/items.ts';
import { cameraStandSegments, DEFAULT_CAMERA_Y, placedCameraPose } from './cameraPlacement.ts';

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('drop preserves the held world Y through pickup, live streaming and repeated placement', () => {
  const item = createItem('camera', { id: 'camera', x: 0, z: 0, ry: 0, createdBy: 'alice' }, Math.random);
  assert.ok(item?.kind === 'camera');
  close(placedCameraPose(item).pos.y, DEFAULT_CAMERA_Y);
  const parent = new THREE.Group();
  const model = new THREE.Group();
  parent.add(model);
  parent.rotation.set(.3, -.6, .2);
  for (const groundY of [0, 3]) {
    for (const height of [.35, 1.2, 8]) {
      for (const pitch of [-1.4, 0, 1.4]) {
        parent.position.y = groundY + height;
        model.position.set(.26, -.3, -.6);
        const before = model.getWorldPosition(new THREE.Vector3()).y;
        assert.equal(applyItemAction(item, { a: 'pick' }, 'alice', Math.random), true);
        assert.equal(applyItemAction(item, { a: 'camLive', on: true }, 'alice', Math.random), true);
        assert.equal(applyItemAction(item, {
          a: 'drop', x: 2, z: -4, ry: .7, pitch, cameraY: before, groundY,
        }, 'alice', Math.random), true);
        assert.equal(item.holder, null);
        assert.equal(item.live, true);
        assert.equal(item.operator, 'alice');
        const pose = placedCameraPose(item);
        close(pose.pos.y, before);
        assert.equal(pose.pos.x, 2);
        assert.equal(pose.pos.z, -4);
        const stand = new THREE.Group();
        stand.position.set(item.x, groundY, item.z);
        stand.rotation.y = item.ry;
        const placed = new THREE.Group();
        placed.position.y = before - groundY;
        placed.rotation.x = pitch;
        stand.add(placed);
        close(placed.getWorldPosition(new THREE.Vector3()).y, before);
        close(placed.getWorldPosition(new THREE.Vector3()).distanceTo(pose.pos), 0);
        close(Math.abs(placed.getWorldQuaternion(new THREE.Quaternion()).dot(pose.quat)), 1);
        const rendered = placedCameraPose(item, placed);
        close(rendered.pos.y, before);
        close(rendered.pos.distanceTo(pose.pos), 0);
        // 移動補間中も、写真・配信は保存座標でなく表示中のモデルに追従する。
        stand.position.x += .1;
        close(placedCameraPose(item, placed).pos.x, item.x + .1);
      }
    }
  }
  assert.equal(applyItemAction(item, { a: 'camLive', on: false }, 'alice', Math.random), true);
});

test('tripod legs meet the ground and the pole meets the pitched camera underside at low, medium and high heights', () => {
  for (const height of [.3, 1.2, 8]) {
    for (const pitch of [-1.4, 0, 1.4]) {
      const segments = cameraStandSegments(height, pitch);
      const pole = segments[3];
      for (const leg of segments.slice(0, 3)) {
        close(leg.start.y, 0);
        close(leg.end.distanceTo(pole.start), 0);
      }
      const underside = new THREE.Vector3(0, -.075, 0)
        .applyEuler(new THREE.Euler(pitch, 0, 0)).add(new THREE.Vector3(0, height, 0));
      close(pole.end.distanceTo(underside), 0);
      for (const segment of segments) {
        assert.ok(segment.length > 0);
        for (const [direction, expected] of [[-1, segment.start], [1, segment.end]] as const) {
          const end = new THREE.Vector3(0, direction * segment.length / 2, 0)
            .applyQuaternion(segment.quaternion).add(segment.position);
          close(end.distanceTo(expected), 0);
        }
      }
    }
  }
});

test('invalid placement heights do not release the camera; old actions retain the default height', () => {
  const item = createItem('camera', { id: 'camera', x: 0, z: 0, ry: 0, createdBy: 'alice' }, Math.random);
  assert.ok(item?.kind === 'camera');
  applyItemAction(item, { a: 'pick' }, 'alice', Math.random);
  for (const patch of [{ cameraY: NaN }, { cameraY: Infinity }, { groundY: -Infinity }]) {
    assert.equal(applyItemAction(item, { a: 'drop', x: 1, z: 2, ry: 0, ...patch }, 'alice', Math.random), false);
    assert.equal(item.holder, 'alice');
  }
  assert.equal(applyItemAction(item, { a: 'drop', x: 1, z: 2, ry: 0 }, 'bob', Math.random), false);
  assert.equal(applyItemAction(item, { a: 'drop', x: 1, z: 2, ry: 0 }, 'alice', Math.random), true);
  close(placedCameraPose(item).pos.y, DEFAULT_CAMERA_Y);
  assert.equal(item.groundY, 0);
});
