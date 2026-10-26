import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, type Item } from '../shared/items.ts';
import { MARKET_PRODUCTS } from '../shared/market.ts';
import { systemItemDefinitions, systemItemInstanceId } from '../shared/system-items.ts';
import type { SystemObject, SystemView } from '../shared/system-types.ts';
import { isSystemControlledItem, reconcileSystemItems } from './system-items.ts';

const view = (objects: SystemObject[], mapId = 'item-map'): SystemView => ({
  revision: 1, map: { schema: 1, id: mapId, objects, systems: [], connections: [] }, systems: [],
  objects: Object.fromEntries(objects.map(object => [object.id, { position: [...object.position], ...(object.text === undefined ? {} : { text: object.text }) }])), seats: {}, diagnostics: [], traces: [],
});
const itemObject = (id: string, itemId: string, itemMode: 'native' | 'system' = 'native'): SystemObject => ({ id, itemId, itemMode, capabilities: [], position: [0, 0, 0] });
const id = (objectId: string, mapId = 'item-map') => systemItemInstanceId(mapId, objectId);
const noRandom = () => { throw new Error('existing item must not be recreated'); };

test('builtin menu IDs create real independent item instances and authored initial text', () => {
  const definitions = systemItemDefinitions();
  const definition = view(definitions.map((entry, index) => itemObject(`item-${index}`, entry.id)));
  definition.map.objects.push(itemObject('second-note', 'note'));
  definition.map.objects.find(object => object.itemId === 'note')!.text = 'initial map text';
  const result = reconcileSystemItems(new Map(), definition, {}, () => 0);
  assert.equal(result.changed.length, definitions.length + 1);
  for (const [index, entry] of definitions.entries()) {
    const item = result.items.get(id(`item-${index}`))!;
    assert.equal(item.kind, entry.kind); assert.equal(item.mapPlacement?.itemId, entry.id);
  }
  const note = result.changed.find(item => item.mapPlacement?.itemId === 'note')!, second = result.items.get(id('second-note'))!;
  assert.notEqual(note.id, second.id); assert.notEqual(note, second);
  assert.equal(note.kind, 'note'); assert.equal(note.text, 'initial map text');
  assert.equal(second.kind, 'note'); assert.equal(second.text, '');
  assert.ok(result.changed.some(item => item.kind === 'chessAi'));
  assert.ok(result.changed.some(item => item.kind === 'jumpPad'));
});

test('native gameplay, moved coordinates and stable IDs survive reconciliation and restart until layout changes', () => {
  const definition = view([itemObject('memo', 'note'), itemObject('board', 'chess')]);
  const current = reconcileSystemItems(new Map(), definition, {}, () => 0).items;
  const memo = current.get(id('memo'))!; assert.equal(memo.kind, 'note');
  memo.text = 'edited by player'; memo.x = 9; memo.z = 5; memo.ry = 1.2;
  const board = current.get(id('board'))!; assert.equal(board.kind, 'chess'); board.last = [8, 16];
  const next = reconcileSystemItems(current, definition, {}, noRandom);
  assert.equal(next.changed.length, 0); assert.equal(next.items.get(memo.id), memo);
  const restored = new Map<string, Item>((JSON.parse(JSON.stringify([...current.values()])) as Item[]).map(item => [item.id, item]));
  assert.equal(reconcileSystemItems(restored, definition, {}, noRandom).changed.length, 0);
  const updatedLayout = structuredClone(definition); updatedLayout.map.objects[0].position = [3, 0, -2]; updatedLayout.map.objects[0].rotation = 2;
  const moved = reconcileSystemItems(current, updatedLayout, {}, noRandom).items.get(memo.id)!;
  assert.equal(moved.kind, 'note'); assert.equal(moved.text, 'edited by player'); assert.deepEqual([moved.x, moved.z, moved.ry], [3, -2, 2]);
  assert.deepEqual([memo.x, memo.z, memo.ry], [9, 5, 1.2]);
});

test('controlled placements mirror committed system transforms and note text while retaining source baseline', () => {
  const definition = view([itemObject('display', 'note', 'system')]);
  definition.objects.display = { position: [4, 0, -6], text: '00:09' };
  const initial = reconcileSystemItems(new Map(), definition, {}, () => 0);
  const item = initial.items.get(id('display'))!; assert.equal(item.kind, 'note');
  assert.equal(isSystemControlledItem(item), true); assert.equal(item.text, '00:09'); assert.deepEqual([item.x, item.z], [4, -6]);
  assert.deepEqual(item.mapPlacement?.position, [0, 0, 0]);
  const advanced = structuredClone(definition); advanced.objects.display = { position: [5, 0, -6], text: '00:08' };
  const result = reconcileSystemItems(initial.items, advanced, {}, noRandom);
  const updated = result.items.get(item.id)!; assert.equal(updated.kind, 'note'); assert.equal(updated.text, '00:08'); assert.equal(updated.x, 5);
  assert.equal(item.text, '00:09'); assert.equal(item.x, 4);
  assert.equal(reconcileSystemItems(result.items, advanced, {}, noRandom).changed.length, 0);
});

test('native removal remains removed during ticks while explicit map reload restores authored placement', () => {
  const definition = view([itemObject('native', 'note'), itemObject('controlled', 'note', 'system')]);
  const initial = reconcileSystemItems(new Map(), definition, {}, () => 0).items;
  initial.delete(id('native')); initial.delete(id('controlled'));
  const tick = reconcileSystemItems(initial, definition, { createMissingNative: false }, () => 0);
  assert.equal(tick.items.has(id('native')), false); assert.equal(tick.items.has(id('controlled')), true);
  const reload = reconcileSystemItems(tick.items, definition, {}, () => 0);
  assert.equal(reload.items.has(id('native')), true); assert.equal(reload.changed.length, 1);
});

test('new map and removed definitions clean up only obsolete map-owned items', () => {
  const old = view([itemObject('memo', 'note')]);
  const current = reconcileSystemItems(new Map(), old, {}, () => 0).items;
  const manual = createItem('note', { id: 'manual', x: 8, z: 3, ry: 0, createdBy: 'alice' }, () => 0)!;
  current.set(manual.id, manual);
  const result = reconcileSystemItems(current, view([itemObject('memo', 'note')], 'other-map'), {}, () => 0);
  assert.deepEqual(result.removed, [id('memo')]); assert.equal(result.items.get(manual.id), manual);
  assert.equal(result.items.has(id('memo', 'other-map')), true); assert.equal(current.has(id('memo')), true);
  const removed = reconcileSystemItems(result.items, view([], 'other-map'), {}, noRandom);
  assert.deepEqual([...removed.items.keys()], ['manual']);
});

test('invalid assets, duplicate placement IDs and reserved instance collisions fail without mutating callers', () => {
  const current = reconcileSystemItems(new Map(), view([itemObject('memo', 'note')]), {}, () => 0).items;
  const before = structuredClone([...current]);
  const marketIds = MARKET_PRODUCTS.flatMap(product => product.category === 'items' ? [product.id, ...(product.kind ? [product.kind] : [])] : []);
  for (const itemId of ['missing-item', 'image', 'video', 'youtube', 'constructor', '__proto__', 'toString', ...marketIds]) {
    assert.throws(() => reconcileSystemItems(current, view([itemObject('new', itemId)]), {}, noRandom), /Unknown map item/);
    assert.deepEqual([...current], before);
  }
  assert.throws(() => reconcileSystemItems(current, view([itemObject('duplicate', 'note'), itemObject('duplicate', 'hammer')]), {}, noRandom), /Duplicate/);
  const conflict = createItem('note', { id: id('new'), x: 0, z: 0, ry: 0, createdBy: 'alice' }, () => 0)!;
  current.set(conflict.id, conflict);
  const conflicted = structuredClone([...current]);
  assert.throws(() => reconcileSystemItems(current, view([itemObject('new', 'note')]), {}, noRandom), /identity conflict/);
  assert.deepEqual([...current], conflicted);
  const absentState = view([itemObject('new-controlled', 'note', 'system')]); delete absentState.objects['new-controlled'];
  assert.throws(() => reconcileSystemItems(current, absentState, {}, () => 0), /state unavailable/);
  assert.deepEqual([...current], conflicted);
});
