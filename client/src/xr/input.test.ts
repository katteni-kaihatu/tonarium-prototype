import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DEFAULT_TURN, replaceSelection, stick, turnSettings, turnStep, unicodeCharacter } from './input.ts';
import { aimAt, aimOn } from '../view3d/interact.ts';

test('xr-standard thumbstick uses axes 2/3, fallback uses 0/1, noise and invalid axes stop', () => {
  assert.deepEqual(stick([0, 0, .8, -.9]), [.8, -.9]);
  assert.deepEqual(stick([-.8, .7]), [-.8, .7]);
  assert.deepEqual(stick([.2, -.1]), [0, 0]);
  assert.deepEqual(stick([NaN, Infinity]), [0, 0]);
  assert.deepEqual(stick([]), [0, 0]);
});
test('snap turn requires stick release before repeating, including direction reversal', () => {
  const first = turnStep(1, .016, DEFAULT_TURN, false);
  assert.equal(first.radians, -Math.PI / 6);
  assert.equal(first.latched, true);
  assert.equal(turnStep(-1, .016, DEFAULT_TURN, first.latched).radians, 0);
  const release = turnStep(0, .016, DEFAULT_TURN, true);
  assert.equal(turnStep(-1, .016, DEFAULT_TURN, release.latched).radians, Math.PI / 6);
});
test('smooth turn uses degrees per second and clamps long frames', () => {
  const config = { ...DEFAULT_TURN, mode: 'smooth' as const, speed: 180 };
  assert.equal(turnStep(1, .1, config, true).radians, -Math.PI / 10);
  assert.equal(turnStep(1, 100, config, false).radians, -Math.PI / 10);
  assert.equal(turnStep(1, -1, config, false).radians, 0);
});
test('saved turn settings tolerate corrupted, missing and out of range data', () => {
  assert.deepEqual(turnSettings(null), DEFAULT_TURN);
  assert.deepEqual(turnSettings({ mode: 'other', speed: NaN, angle: -20 }), { ...DEFAULT_TURN, angle: 15 });
  assert.deepEqual(turnSettings({ mode: 'smooth', speed: 1000, angle: 1000 }), { mode: 'smooth', speed: 180, angle: 90 });
});
test('text replacement preserves selection, unicode and field length limits', () => {
  assert.deepEqual(replaceSelection('こんにちは', 2, 4, '😀'), { value: 'こん😀は', cursor: 4 });
  assert.deepEqual(replaceSelection('ab', 1, 1, '😀', 3), { value: 'ab', cursor: 1 });
  assert.deepEqual(replaceSelection('abcd', 1, 3, 'XYZ', 4), { value: 'aXYd', cursor: 3 });
});
test('unicode input accepts kanji and emoji while rejecting surrogates and invalid code points', () => {
  assert.equal(unicodeCharacter('7A7A'), '空');
  assert.equal(unicodeCharacter('1F600'), '😀');
  for (const code of ['D800', '110000', 'hello', '', '-1']) assert.equal(unicodeCharacter(code), '');
});
test('controller ray reaches the existing interaction callback without moving the desktop camera', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(20, 20, 20); camera.updateMatrixWorld();
  const cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  cube.position.set(2, 1, -3);
  let count = 0;
  cube.userData.use = () => { count++; };
  scene.add(cube); scene.updateMatrixWorld(true);
  const ray = new THREE.Ray(new THREE.Vector3(2, 1, 0), new THREE.Vector3(0, 0, -1));
  const target = aimAt(scene, camera, ray);
  assert.equal(target?.obj, cube);
  target?.data.use?.(target.hit);
  assert.equal(count, 1);
  assert.ok(aimOn(cube, camera, ray));
  assert.deepEqual(camera.position.toArray(), [20, 20, 20]);
  assert.equal(aimAt(scene, camera), null);
  cube.geometry.dispose(); (cube.material as THREE.Material).dispose();
});

test('desktop and controller aim skip noRay descendants but retain walls and the distance limit', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.updateMatrixWorld();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  const decoration = new THREE.Group();
  decoration.userData.noRay = true;
  const ignored = new THREE.Mesh(geometry, material);
  ignored.position.z = -1;
  decoration.add(ignored);
  const target = new THREE.Mesh(geometry, material);
  target.position.z = -3;
  target.userData.use = () => {};
  const wall = new THREE.Mesh(geometry, material);
  wall.position.z = -2;
  scene.add(decoration, target);
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
  try {
    for (const input of [undefined, ray]) {
      scene.updateMatrixWorld(true);
      assert.equal(aimAt(scene, camera, input)?.obj, target);
      scene.add(wall); scene.updateMatrixWorld(true);
      assert.equal(aimAt(scene, camera, input), null);
      scene.remove(wall);
      target.position.z = -32; scene.updateMatrixWorld(true);
      assert.equal(aimAt(scene, camera, input), null);
      target.position.z = -3;
    }
  } finally {
    geometry.dispose(); material.dispose();
  }
});
