import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createItem, type Item } from '../../../shared/items.ts';
import { createSystemMap } from '../../../shared/system-map.ts';
import { systemItemInstanceId } from '../../../shared/system-items.ts';
import { validateSystemSubmission } from '../../../server/system-catalog.ts';
import { SystemRuntime } from '../../../server/system-runtime.ts';
import type { SystemManifest } from '../../../shared/system-types.ts';
import { controlledItemObject } from './map-item-control.ts';
import { findInteractable } from '../view3d/interact.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('system item boundary overrides native child actions once and blocks native fallback without an action', () => {
  const outer = new THREE.Group(), inner = new THREE.Group(), mesh = new THREE.Mesh();
  let shared = 0, native = 0;
  outer.add(inner); inner.add(mesh);
  inner.userData = { use: () => native++, drag: () => native++, carry: 'native', remove: () => native++ };
  outer.userData = { interactionBoundary: true, use: () => shared++ };
  const found = findInteractable(mesh)!;
  assert.equal(found.obj, outer); found.data.use!({} as THREE.Intersection);
  assert.equal(shared, 1); assert.equal(native, 0); assert.equal(found.data.drag, undefined); assert.equal(found.data.carry, undefined);
  outer.userData = { interactionBoundary: true };
  assert.equal(findInteractable(mesh)!.obj, outer); assert.equal(findInteractable(mesh)!.data.use, undefined);
  outer.userData = {};
  assert.equal(findInteractable(mesh)!.obj, inner);
  outer.userData = { noRay: true, interactionBoundary: true };
  assert.equal(findInteractable(mesh), null);
});

test('controlled item callback resolution rejects stale rooms, maps and item identities', () => {
  const catalog = validateSystemSubmission(root).catalog, runtime = new SystemRuntime(() => catalog, () => {});
  const map = createSystemMap('my-map').item({ id: 'board', itemId: 'chess', itemMode: 'system', capabilities: ['interact'], position: [2, 0, 3], rotation: 1 })
    .system({ instanceId: 'button', systemId: 'button', bindings: { target: ['board'] }, config: {} }).build(catalog);
  runtime.apply('alice', { kind: 'map', id: 'load', revision: 0, map });
  const item = createItem('chess', { id: systemItemInstanceId(map.id, 'board'), x: 2, z: 3, ry: 1, createdBy: 'map', mapPlacement: { mapId: map.id, objectId: 'board', itemId: 'chess', mode: 'system', position: [2, 0, 3], rotation: 1 } }, () => 0)!;
  const state = { sid: 'room', view: runtime.view() };
  assert.equal(controlledItemObject(item, 'room', state)!.id, 'board');
  assert.equal(controlledItemObject(item, 'other-room', state), undefined);
  assert.equal(controlledItemObject(item, null, state), undefined);
  assert.equal(controlledItemObject({ ...item, id: 'another' } as Item, 'room', state), undefined);
  const stale = structuredClone(state); stale.view.map.id = 'previous-map';
  assert.equal(controlledItemObject(item, 'room', stale), undefined);
  const native = structuredClone(item); native.mapPlacement!.mode = 'native';
  assert.equal(controlledItemObject(native, 'room', state), undefined);
});

test('vertical item movement rolls back system state and persistence while ordinary object movement remains available', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../../shared-systems/button/1.0.0/system.json', import.meta.url), 'utf8')) as SystemManifest;
  manifest.targets.target.capabilities = ['move']; delete manifest.interaction;
  manifest.handlers.press = [{ op: 'move', target: 'target', offset: [0, 2, 0] }];
  const catalog = { schema: 1 as const, commit: 'test', entries: [{ id: manifest.id, version: manifest.version, integrity: 'sha256-' + 'a'.repeat(64), manifest }] };
  let persisted = 0;
  const runtime = new SystemRuntime(() => catalog, () => persisted++);
  const map = createSystemMap('my-map').item({ id: 'target', itemId: 'note', itemMode: 'system', capabilities: ['move'], position: [1, 0, 2] })
    .system({ instanceId: 'mover', systemId: 'button', bindings: { target: ['target'] }, config: {} }).build(catalog);
  runtime.apply('alice', { kind: 'map', id: 'load', revision: 0, map });
  const before = runtime.view();
  assert.throws(() => runtime.apply('alice', { kind: 'input', id: 'rise', revision: before.revision, instanceId: 'mover', input: 'press', payload: {} }), /on the ground/);
  assert.equal(persisted, 1); assert.deepEqual(runtime.view(), before);
  const plain = structuredClone(map); delete plain.objects[0].itemId; delete plain.objects[0].itemMode;
  runtime.apply('alice', { kind: 'map', id: 'plain', revision: before.revision, map: plain });
  runtime.apply('alice', { kind: 'input', id: 'rise-plain', revision: runtime.view().revision, instanceId: 'mover', input: 'press', payload: {} });
  assert.deepEqual(runtime.view().objects.target.position, [1, 2, 2]);
});
