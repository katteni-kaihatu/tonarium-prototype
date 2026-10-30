import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { floorAt, floorMatrix, MapTap } from './mapProjection.ts';

test('床の SVG 投影とカメラの投影・クリック復元が一致する', () => {
  for (const [width, height] of [[390, 844], [1440, 900], [2560, 1080]]) {
    for (const yaw of [-2.4, 0, 1.8]) for (const polar of [.08, .65, 1.25]) {
      for (const distance of [20, 60, 150]) for (const zoom of [.5, 1, 3]) {
        for (const target of [new THREE.Vector3(), new THREE.Vector3(9, 0, -7)]) {
          const camera = new THREE.PerspectiveCamera(45, width / height, .1, 4000);
          camera.zoom = zoom;
          camera.position.copy(target).add(new THREE.Vector3().setFromSphericalCoords(distance, polar, yaw));
          camera.lookAt(target);
          camera.setViewOffset(width, height, -85, 17, width, height);
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld();
          const matrix = new THREE.Matrix4().fromArray(floorMatrix(camera, width, height));
          for (const [x, z] of [[0, 0], [-3, 4], [2, -5]]) {
            const world = new THREE.Vector3(target.x + x, 0, target.z + z);
            const ndc = world.clone().project(camera);
            const screenX = (ndc.x + 1) * width / 2;
            const screenY = (1 - ndc.y) * height / 2;
            const svg = new THREE.Vector4(world.x, world.z, 0, 1).applyMatrix4(matrix);
            assert.ok(Math.abs(svg.x / svg.w - screenX) < 1e-7);
            assert.ok(Math.abs(svg.y / svg.w - screenY) < 1e-7);
            const restored = floorAt(camera, screenX, screenY, width, height);
            assert.ok(restored && restored.distanceTo(world) < 1e-7);
          }
        }
      }
    }
  }
});

test('床面との交点がないときは移動先を返さない', () => {
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 100);
  camera.position.set(0, 5, 0);
  camera.lookAt(0, 10, 0);
  assert.equal(floorAt(camera, 50, 50, 100, 100), null);
  assert.equal(floorAt(camera, 0, 0, 0, 100), null);
});

const pointer = (button = 0, x = 10, y = 10, id = 1, buttons = button === 0 ? 1 : button === 1 ? 4 : 2) => ({ pointerId: id, button, buttons, clientX: x, clientY: y });
const release = (...args: Parameters<typeof pointer>) => ({ ...pointer(...args), buttons: 0 });

test('追加ボタンが pointermove で届いた操作は全ボタン解放まで取り消す', () => {
  for (const buttons of [3, 5, 7]) {
    const tap = new MapTap();
    tap.start(pointer());
    tap.move(pointer(2, 11, 10, 1, buttons));
    tap.move(pointer(2, 11, 10, 1, 1));
    assert.equal(tap.end(release(0, 11, 10)), false);
    tap.start(pointer());
    assert.equal(tap.end(release()), true);
  }
});

test('左クリックとタップだけを移動として確定する', () => {
  const tap = new MapTap();
  tap.start(pointer());
  assert.equal(tap.end(release(0, 12, 12)), true);
  assert.equal(tap.end(release()), false);
  for (const button of [1, 2]) {
    tap.start(pointer(button));
    tap.move(pointer(button, 40, 80));
    assert.equal(tap.end(release(button, 40, 80)), false);
    tap.start(pointer(button));
    assert.equal(tap.end(release(button)), false);
  }
});

test('ドラッグ後に押下位置へ戻っても移動しない', () => {
  const tap = new MapTap();
  tap.start(pointer());
  tap.move(pointer(0, 50, 50));
  assert.equal(tap.end(release()), false);
});

test('キャンセル・capture 喪失・別 pointer・別ボタンでは移動しない', () => {
  const tap = new MapTap();
  for (let i = 0; i < 2; i++) {
    tap.start(pointer());
    tap.cancel();
    assert.equal(tap.end(release()), false);
  }
  tap.start(pointer());
  assert.equal(tap.end(release(0, 10, 10, 2)), false);
  tap.start(pointer());
  assert.equal(tap.end(release(2)), false);
  tap.start(pointer());
  tap.start(pointer(0, 10, 10, 2));
  assert.equal(tap.end(release()), false);
});
