import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { AVATAR_EYES, AVATAR_SCALE, DEFAULT_EYE_HEIGHT, DEFAULT_PARAMS, getAvatarEyeHeight, getAvatarFloorOffset, sanitizeParams } from './avatar.ts';

test('standard eye height matches the default avatar', () => {
  assert.ok(Math.abs(DEFAULT_EYE_HEIGHT - 1.085556018447876) < 1e-12);
  assert.equal(getAvatarEyeHeight(DEFAULT_PARAMS), DEFAULT_EYE_HEIGHT);
  assert.equal(getAvatarFloorOffset(DEFAULT_PARAMS), 0);
});

test('neck, legs and head dimensions change floor-to-eye height', () => {
  const tall = { ...DEFAULT_PARAMS, neckLength: 80, legsDistanceFromBody: 70, headSize: 100, legsSize: 3 };
  assert.ok(Math.abs(getAvatarEyeHeight(tall) - 3.926202306447876) < 1e-9);
  const inverted = { ...DEFAULT_PARAMS, headSize: -100, legsSize: -3, neckLength: -30, legsDistanceFromBody: 100 };
  assert.ok(Math.abs(getAvatarEyeHeight(inverted) - 1.742880474447876) < 1e-9);
  assert.equal(getAvatarEyeHeight({ ...DEFAULT_PARAMS, bodySize: 100, handSize: 100, tailSize: -100 }), DEFAULT_EYE_HEIGHT);
  for (const value of [-100, 0, 100]) {
    assert.ok(Number.isFinite(getAvatarEyeHeight(sanitizeParams({ headSize: value, neckLength: value, legsSize: value, legsDistanceFromBody: value }))));
  }
});

test('standard and extreme avatars use the same eye landmark as the rendered model', () => {
  const glb = readFileSync(new URL('../client/public/oekaki/avatar.glb', import.meta.url));
  const geometry = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8')) as {
    nodes: { name: string; translation?: number[]; rotation?: number[]; scale?: number[]; children?: number[] }[];
  };
  const nodes = geometry.nodes.map((node) => {
    const obj = new THREE.Object3D();
    obj.name = node.name;
    if (node.translation) obj.position.fromArray(node.translation);
    if (node.rotation) obj.quaternion.fromArray(node.rotation);
    if (node.scale) obj.scale.fromArray(node.scale);
    return obj;
  });
  geometry.nodes.forEach((node, i) => node.children?.forEach((child) => nodes[i].add(nodes[child])));
  const head = nodes.find((node) => node.name === 'Head')!;
  const front = nodes.find((node) => node.name === 'Head_Front')!;
  const body = nodes.find((node) => node.name === 'Body')!;
  const feet = nodes.find((node) => node.name === 'Feet')!;
  assert.ok(Math.abs(head.position.y - AVATAR_EYES.headY) < 1e-6);
  assert.ok(Math.abs(front.position.y - AVATAR_EYES.centerY) < 1e-6);
  assert.ok(Math.abs(front.scale.x - AVATAR_EYES.headSize) < 1e-6);
  const baseBody = body.position.clone();
  const baseFeet = feet.position.clone();
  const baseHeadSize = front.scale.x;
  const root = new THREE.Object3D();
  root.add(nodes[0]);
  root.scale.setScalar(AVATAR_SCALE);
  for (const params of [DEFAULT_PARAMS, { ...DEFAULT_PARAMS, headSize: 100, neckLength: 80, legsDistanceFromBody: 70, legsSize: 3 }, { ...DEFAULT_PARAMS, headSize: -100, legsSize: -3, neckLength: -30, legsDistanceFromBody: 100 }]) {
    body.position.copy(baseBody).add(new THREE.Vector3(0, -params.neckLength, params.headInFront ? -.5 : .5));
    feet.position.copy(baseFeet).add(new THREE.Vector3(0, -params.legsDistanceFromBody, params.legsInFront ? .5 : -.5));
    feet.scale.setScalar(1 + params.legsSize);
    front.scale.setScalar(baseHeadSize + params.headSize);
    root.position.y = getAvatarFloorOffset(params);
    root.updateMatrixWorld(true);
    const size = Math.abs(front.scale.x);
    const eye = head.localToWorld(new THREE.Vector3(0, front.position.y + size * AVATAR_EYES.up, size * AVATAR_EYES.forward));
    // 元モデルの静止姿勢には頭のわずかな傾きがある。
    assert.ok(Math.abs(eye.y - getAvatarEyeHeight(params)) < .04);
  }
});
