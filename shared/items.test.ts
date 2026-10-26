import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIRROR_MAX, STROKE_ADD_MAX_NUMS, STROKE_MAX_NUMS, applyItemAction, canAddMirror, createItem, type Item } from './items.ts';

type CanvasItem = Extract<Item, { kind: 'canvas' }>;
const newCanvas = (): CanvasItem => {
  const it = createItem('canvas', { id: 'c1', x: 0, z: 0, ry: 0, createdBy: 'alice' }, Math.random);
  assert.ok(it && it.kind === 'canvas');
  return it as CanvasItem;
};
const start = (it: CanvasItem, over: Partial<{ size: number; x: number; y: number }> = {}) =>
  applyItemAction(it, { a: 'strokeStart', id: 's1', color: '#111111', size: 3, x: 10, y: 10, ...over }, 'alice', Math.random);

test('strokeAdd caps points per message and per stroke', () => {
  const it = newCanvas();
  assert.equal(start(it), true);
  // 1 メッセージで大量に送っても 1 回分の上限までしか入らない
  const flood = Array.from({ length: 100_000 }, (_, i) => i % 600);
  assert.equal(applyItemAction(it, { a: 'strokeAdd', id: 's1', pts: flood }, 'alice', Math.random), true);
  assert.equal(it.strokes[0].pts.length, 2 + STROKE_ADD_MAX_NUMS);
  // 繰り返し送っても総量の上限で打ち切られ、それ以上は受け付けない
  for (let i = 0; i < 100 && it.strokes[0].pts.length < STROKE_MAX_NUMS; i++)
    applyItemAction(it, { a: 'strokeAdd', id: 's1', pts: flood.slice(0, STROKE_ADD_MAX_NUMS) }, 'alice', Math.random);
  assert.equal(it.strokes[0].pts.length, STROKE_MAX_NUMS);
  assert.equal(applyItemAction(it, { a: 'strokeAdd', id: 's1', pts: [1, 2] }, 'alice', Math.random), false);
});

test('stroke points are coerced to finite canvas coordinates', () => {
  const it = newCanvas();
  assert.equal(start(it, { size: Number.NaN, x: Number.NaN, y: Number.POSITIVE_INFINITY }), true);
  assert.equal(it.strokes[0].size, 1);
  assert.deepEqual(it.strokes[0].pts, [0, 0]);
  const pts = [Number.NaN, 20, 30, Number.POSITIVE_INFINITY, -5, 99999] as number[];
  assert.equal(applyItemAction(it, { a: 'strokeAdd', id: 's1', pts }, 'alice', Math.random), true);
  assert.deepEqual(it.strokes[0].pts, [0, 0, 0, 20, 30, 0, 0, 450]);
  assert.ok(it.strokes[0].pts.every(Number.isFinite));
});

test('drop coerces non-finite rotation and pitch', () => {
  const it = createItem('camera', { id: 'cam1', x: 0, z: 0, ry: 0, createdBy: 'alice' }, Math.random);
  assert.ok(it && it.kind === 'camera');
  assert.equal(applyItemAction(it, { a: 'pick' }, 'alice', Math.random), true);
  const drop = { a: 'drop', x: 1, z: 2, ry: Number.NaN, pitch: Number.POSITIVE_INFINITY } as unknown as Parameters<typeof applyItemAction>[1];
  assert.equal(applyItemAction(it, drop, 'alice', Math.random), true);
  assert.equal(it.ry, 0);
  assert.equal(it.pitch, 0);
});

test('strokeAdd rejects a non-array point list', () => {
  const it = newCanvas();
  assert.equal(start(it), true);
  const bad = { a: 'strokeAdd', id: 's1', pts: 'x' } as unknown as Parameters<typeof applyItemAction>[1];
  assert.equal(applyItemAction(it, bad, 'alice', Math.random), false);
  assert.equal(it.strokes[0].pts.length, 2);
});

test('mirror placement is capped per session', () => {
  const mk = (kind: 'mirror' | 'note', id: string) => createItem(kind, { id, x: 0, z: 0, ry: 0, createdBy: 'alice' }, Math.random)!;
  const items: Item[] = [mk('note', 'n1')];
  assert.equal(canAddMirror(items), true);
  for (let i = 0; i < MIRROR_MAX; i++) {
    assert.equal(canAddMirror(items), true);
    items.push(mk('mirror', `m${i}`));
  }
  assert.equal(canAddMirror(items), false);
  items.splice(items.findIndex((i) => i.kind === 'mirror'), 1);
  assert.equal(canAddMirror(items), true);
});
