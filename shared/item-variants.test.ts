import assert from 'node:assert/strict';
import test from 'node:test';
import { ITEM_INFO, applyItemAction, createItem, type Item } from './items.ts';
import { ITEM_VARIANTS, itemVariantDefinition, validItemVariant } from './item-variants.ts';
import { systemItemDefinition, systemItemDefinitions, systemItemInstanceId } from './system-items.ts';
import type { SystemObject, SystemView } from './system-types.ts';
import { reconcileSystemItems } from '../server/system-items.ts';

const base = { id: 'timer-camera-one', x: 2, z: -3, ry: 1, createdBy: 'alice' };
const rng = () => 0.5;
const view = (mapId: string, objects: SystemObject[] = []): SystemView => ({
  revision: 1, map: { schema: 1, id: mapId, objects, systems: [], connections: [] }, systems: [],
  objects: Object.fromEntries(objects.map(object => [object.id, { position: [...object.position] }])),
  seats: {}, diagnostics: [], traces: [],
});

test('the timer camera is a separate 3D registry entry reusing the camera model without changing the native entry', () => {
  const nativeName = ITEM_INFO.camera.name, variant = itemVariantDefinition('camera-timer'); assert.ok(variant);
  assert.equal(variant.kind, 'camera'); assert.equal(variant.id, 'camera-timer');
  assert.equal(variant.info.name, '5秒タイマーカメラ'); assert.equal(variant.info.in2d, false); assert.equal(variant.info.in3d, true);
  assert.equal(variant.info.illustration, ITEM_INFO.camera.illustration); assert.ok(variant.usage.includes('5秒'));
  const listed = systemItemDefinition('camera-timer')!;
  assert.equal(listed.kind, 'camera'); assert.equal(listed.variant, 'camera-timer');
  assert.equal(systemItemDefinitions().filter(definition => definition.id === 'camera-timer').length, 1);
  listed.info.name = 'caller mutation';
  assert.equal(ITEM_VARIANTS['camera-timer'].info.name, '5秒タイマーカメラ'); assert.equal(ITEM_INFO.camera.name, nativeName);
  assert.equal(systemItemDefinition('camera')!.variant, undefined);
});

test('creation accepts only compatible registered variants and keeps ordinary cameras unchanged', () => {
  const camera = createItem('camera', { ...base, variant: 'camera-timer' }, rng)!;
  assert.equal(camera.kind, 'camera'); if (camera.kind !== 'camera') assert.fail('camera type');
  assert.equal(camera.variant, 'camera-timer'); assert.equal(camera.holder, null); assert.equal(camera.live, false);
  assert.equal(camera.pitch, 0); assert.equal(camera.operator, null); assert.equal(camera.timerState, undefined);
  const native = createItem('camera', base, rng)!;
  assert.equal(Object.hasOwn(native, 'variant'), false); assert.equal(validItemVariant('camera', undefined), true);
  assert.equal(createItem('note', { ...base, variant: 'camera-timer' }, rng), null);
  for (const variant of ['', 'unknown', 'constructor', '__proto__', null, {}, []]) {
    assert.equal(itemVariantDefinition(variant), undefined); assert.equal(validItemVariant('camera', variant), false);
    assert.equal(createItem('camera', { ...base, variant } as Parameters<typeof createItem>[1], rng), null);
  }
});

test('timer cameras cannot be picked up or livestreamed through native camera actions', () => {
  const camera = createItem('camera', { ...base, variant: 'camera-timer' }, rng)!;
  const before = structuredClone(camera);
  for (const action of [{ a: 'pick' as const }, { a: 'camLive' as const, on: true }, { a: 'timedCameraRequest' as const, token: 'server-bridge-only' }]) {
    assert.equal(applyItemAction(camera, action, 'alice', rng), false); assert.deepEqual(camera, before);
  }
  const native = createItem('camera', base, rng)!;
  assert.equal(applyItemAction(native, { a: 'pick' }, 'alice', rng), true);
  assert.equal(applyItemAction(native, { a: 'drop', x: 4, z: 5, ry: 2, cameraY: 3.5, groundY: 2 }, 'alice', rng), true);
  assert.equal(native.kind, 'camera'); if (native.kind === 'camera') { assert.equal(native.cameraY, 3.5); assert.equal(native.groundY, 2); }
});

test('normally spawned timer cameras survive authored map swaps without acquiring map ownership', () => {
  const camera = createItem('camera', { ...base, variant: 'camera-timer' }, rng)!;
  const current = new Map<string, Item>([[camera.id, camera]]);
  const first = reconcileSystemItems(current, view('first-map', [{ id: 'map-note', itemId: 'note', capabilities: [], position: [0, 0, 0] }]), {}, rng);
  const second = reconcileSystemItems(first.items, view('second-map'), {}, rng);
  assert.deepEqual([...second.items.values()], [camera]); assert.equal(second.items.get(camera.id)?.mapPlacement, undefined);
  assert.ok(second.removed.includes(systemItemInstanceId('first-map', 'map-note')));
});

test('ID-based map placement creates the variant and reuses its stored native state on reconciliation', () => {
  const scene = view('variant-map', [{ id: 'camera-spot', itemId: 'camera-timer', capabilities: [], position: [1, 0, 2] }]);
  const first = reconcileSystemItems(new Map(), scene, {}, rng);
  const camera = first.items.get(systemItemInstanceId('variant-map', 'camera-spot'))!;
  assert.equal(camera.kind, 'camera'); if (camera.kind !== 'camera') assert.fail('camera type');
  assert.equal(camera.variant, 'camera-timer'); assert.equal(camera.mapPlacement?.itemId, 'camera-timer');
  camera.timerState = view('private-timer-state'); camera.cameraY = 4; camera.groundY = 2.5;
  const second = reconcileSystemItems(first.items, scene, {}, () => { throw new Error('should reuse the item'); });
  assert.equal(second.changed.length, 0); assert.equal(second.items.get(camera.id), camera);
});
