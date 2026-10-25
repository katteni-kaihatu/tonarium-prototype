import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMirrorSurface } from './mirrorReflection.ts';
import { createItem, ITEM_INFO, ONLY_3D, applyItemAction } from '../../../shared/items.ts';
import { CAFE } from '../../../shared/worlds.ts';
import { ROOM_HALF, SPAWN } from '../../../shared/protocol.ts';

function rendererStub(draw: (scene: THREE.Scene, camera: THREE.Camera) => void) {
  let target: THREE.WebGLRenderTarget | null = null;
  const viewport = new THREE.Vector4(0, 0, 800, 600);
  const renderer = {
    xr: { enabled: true }, shadowMap: { autoUpdate: true }, autoClear: true,
    state: { buffers: { depth: { setMask() {} } }, viewport: (value: THREE.Vector4) => viewport.copy(value) },
    getRenderTarget: () => target,
    setRenderTarget: (value: THREE.WebGLRenderTarget | null) => { target = value; },
    getCurrentViewport: (value: THREE.Vector4) => value.copy(viewport),
    render: (scene: THREE.Scene, camera: THREE.Camera) => { scene.updateMatrixWorld(true); draw(scene, camera); },
  };
  return renderer as unknown as THREE.WebGLRenderer;
}

function reflect(resource: ReturnType<typeof createMirrorSurface>, renderer: THREE.WebGLRenderer,
  scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const mirror = resource.mirror;
  const args = [renderer, scene, camera, mirror.geometry, mirror.material, null] as unknown as Parameters<typeof mirror.onBeforeRender>;
  mirror.onBeforeRender(...args);
}

test('cafe wall mirror fits the north wall and reflects both participants from spawn', (t) => {
  const m = CAFE.mirror;
  assert.equal(m.x, SPAWN.x);
  assert.ok(m.z < SPAWN.z && m.z > -ROOM_HALF + 0.2);
  assert.ok(m.w > m.h);
  assert.ok(Math.abs(m.x) + m.w / 2 + 0.07 < ROOM_HALF);
  assert.ok(m.y - m.h / 2 - 0.07 > 0);
  assert.ok(m.y + m.h / 2 + 0.07 < 4);
  const resource = createMirrorSurface(m.w, m.h);
  t.after(() => resource.dispose());
  resource.mirror.position.set(m.x, m.y, m.z + 0.001);
  const scene = new THREE.Scene();
  scene.add(resource.mirror);
  const camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.05, 100);
  let draws = 0;
  const renderer = rendererStub((_, view) => {
    draws++;
    // 鏡面を通る視線が枠内に収まることを、足元と頭の両方で確かめる。
    for (const x of [-1, 1]) for (const y of [0.1, 1.7]) {
      const avatar = new THREE.Vector3(x, y, SPAWN.z);
      const ratio = (resource.mirror.position.z - view.position.z) / (avatar.z - view.position.z);
      const hit = view.position.clone().lerp(avatar, ratio);
      assert.ok(Math.abs(hit.x - m.x) < m.w / 2);
      assert.ok(Math.abs(hit.y - m.y) < m.h / 2);
      const projected = avatar.project(view);
      assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && Math.abs(projected.z) < 1);
    }
  });
  for (const x of [-1, 1]) {
    camera.position.set(x, 1.6, SPAWN.z);
    reflect(resource, renderer, scene, camera);
  }
  assert.equal(draws, 2);
});

test('mirror is a placeable 3D-only item without content actions', () => {
  const base = { id: 'mirror1', x: 1, z: -2, ry: 0.7, createdBy: 'alice' };
  const item = createItem('mirror', base, Math.random);
  assert.deepEqual(item, { ...base, updatedBy: 'alice', kind: 'mirror' });
  assert.equal(ONLY_3D.mirror, true);
  assert.equal(ITEM_INFO.mirror.in3d, true);
  assert.equal(ITEM_INFO.mirror.in2d, false);
  assert.ok(item);
  assert.equal(applyItemAction(item, { a: 'pick' }, 'alice', Math.random), false);
});

test('reflection follows the viewpoint and a translated, rotated mirror with clipping', (t) => {
  const resource = createMirrorSurface(1.8, 2.2);
  t.after(() => resource.dispose());
  const scene = new THREE.Scene();
  scene.add(resource.mirror);
  const camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.05, 100);
  camera.position.set(1, 1.5, 4);
  const views: THREE.Camera[] = [];
  const renderer = rendererStub((_, view) => { views.push(view.clone()); });
  reflect(resource, renderer, scene, camera);
  assert.ok(views[0].position.distanceTo(new THREE.Vector3(1, 1.5, -4)) < 1e-8);
  const clip = (z: number) => new THREE.Vector4(0, 1, z, 1)
    .applyMatrix4(views[0].matrixWorldInverse).applyMatrix4(views[0].projectionMatrix);
  const front = clip(1), behind = clip(-1);
  assert.ok(front.z >= -front.w);
  assert.ok(behind.z < -behind.w);

  camera.position.set(-1, 2, 2);
  camera.lookAt(0, 1, 0);
  reflect(resource, renderer, scene, camera);
  assert.ok(views[1].position.distanceTo(new THREE.Vector3(-1, 2, -2)) < 1e-8);
  assert.notDeepEqual(views[1].quaternion.toArray(), views[0].quaternion.toArray());

  resource.mirror.position.x = 2;
  resource.mirror.rotation.y = Math.PI / 2;
  camera.position.set(5, 1.5, 0);
  camera.lookAt(2, 1.5, 0);
  reflect(resource, renderer, scene, camera);
  assert.ok(views[2].position.distanceTo(new THREE.Vector3(-1, 1.5, 0)) < 1e-8);

  camera.position.x = 0;
  reflect(resource, renderer, scene, camera);
  assert.equal(views.length, 3, 'back side does not render a reflection');
});

test('reflection includes self, other participants and scenery, and reads their current transforms', (t) => {
  const resource = createMirrorSurface(1.8, 2.2);
  const otherMirror = createMirrorSurface(1.8, 2.2);
  t.after(() => { resource.dispose(); otherMirror.dispose(); });
  const scene = new THREE.Scene();
  const self = new THREE.Group();
  self.userData.selfBody = true;
  self.visible = false;
  const hands = new THREE.Group();
  hands.userData.firstPerson = true;
  const participant = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const scenery = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  t.after(() => { participant.geometry.dispose(); participant.material.dispose(); scenery.geometry.dispose(); scenery.material.dispose(); });
  scene.add(resource.mirror, otherMirror.mirror, self, hands, participant, scenery);
  const camera = new THREE.PerspectiveCamera();
  camera.position.z = 4;
  const positions: number[][] = [];
  const renderer = rendererStub((drawn, view) => {
    assert.equal(drawn, scene);
    assert.equal(self.visible, true);
    assert.equal(hands.visible, false);
    assert.equal(participant.visible, true);
    assert.equal(scenery.visible, true);
    assert.equal(resource.mirror.visible, false);
    assert.equal(otherMirror.mirror.visible, false);
    assert.equal(renderer.xr.enabled, false);
    positions.push([self.matrixWorld.elements[12], participant.matrixWorld.elements[12]]);
    reflect(otherMirror, renderer, scene, view as THREE.PerspectiveCamera);
  });
  reflect(resource, renderer, scene, camera);
  self.position.x = 1;
  participant.position.x = -2;
  reflect(resource, renderer, scene, camera);
  assert.deepEqual(positions, [[0, 0], [1, -2]]);
  assert.equal(self.visible, false);
  assert.equal(hands.visible, true);
  assert.equal(otherMirror.mirror.visible, true);
  assert.equal(resource.mirror.visible, true);
  assert.equal(renderer.xr.enabled, true);
  assert.equal(renderer.shadowMap.autoUpdate, true);
  assert.equal(renderer.getRenderTarget(), null);

  self.visible = true;
  hands.visible = false;
  reflect(resource, renderer, scene, camera);
  assert.equal(self.visible, true, 'third-person visibility is preserved');
  assert.equal(hands.visible, false);
});

test('failed reflection restores scene visibility and renderer state for the next frame', (t) => {
  const resource = createMirrorSurface(1.8, 2.2);
  t.after(() => resource.dispose());
  const scene = new THREE.Scene();
  const self = new THREE.Group();
  self.userData.selfBody = true;
  self.visible = false;
  scene.add(resource.mirror, self);
  const camera = new THREE.PerspectiveCamera();
  camera.position.z = 4;
  const renderer = rendererStub(() => { throw new Error('render failed'); });
  assert.throws(() => reflect(resource, renderer, scene, camera), /render failed/);
  assert.equal(self.visible, false);
  assert.equal(resource.mirror.visible, true);
  assert.equal(renderer.getRenderTarget(), null);
  assert.equal(renderer.xr.enabled, true);
  assert.equal(renderer.shadowMap.autoUpdate, true);
  let rendered = false;
  reflect(resource, rendererStub(() => { rendered = true; }), scene, camera);
  assert.equal(rendered, true);
});
