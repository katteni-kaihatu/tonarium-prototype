import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_KEEP_MS, isStaleEvent, pruneEvents } from './events.ts';

const NOW = 1_800_000_000_000; // 固定の基準時刻 (テストが実時計に依存しないように)

test('保持期間ちょうどは残し、1ms でも過ぎたら剪定対象', () => {
  assert.equal(isStaleEvent(NOW - EVENT_KEEP_MS, NOW), false, 'ちょうど30日はまだ残す');
  assert.equal(isStaleEvent(NOW - EVENT_KEEP_MS - 1, NOW), true, '30日+1ms は対象');
  assert.equal(isStaleEvent(NOW - EVENT_KEEP_MS + 1, NOW), false);
});

test('当日のものと未来のイベントは残す', () => {
  assert.equal(isStaleEvent(NOW, NOW), false);
  assert.equal(isStaleEvent(NOW + 24 * 60 * 60 * 1000, NOW), false);
});

test('開始時刻が数値として読めないものは残す', () => {
  assert.equal(isStaleEvent(Number.NaN, NOW), false);
  assert.equal(isStaleEvent(Number.POSITIVE_INFINITY, NOW), false);
  assert.equal(isStaleEvent(Number.NEGATIVE_INFINITY, NOW), false);
});

test('pruneEvents は古いものだけを除き、順序と入力を保つ', () => {
  const old = { id: 'old', at: NOW - EVENT_KEEP_MS - 1000 };
  const edge = { id: 'edge', at: NOW - EVENT_KEEP_MS };
  const fresh = { id: 'fresh', at: NOW + 1000 };
  const broken = { id: 'broken', at: Number.NaN };
  const input = [old, edge, fresh, broken];
  const kept = pruneEvents(input, NOW);
  assert.deepEqual(kept.map((e) => e.id), ['edge', 'fresh', 'broken']);
  assert.deepEqual(input.map((e) => e.id), ['old', 'edge', 'fresh', 'broken'], '入力配列は変更しない');
  assert.notEqual(kept, input, '新しい配列を返す');
});

test('pruneEvents は空・全件対象・全件保持でも壊れない', () => {
  assert.deepEqual(pruneEvents([], NOW), []);
  assert.deepEqual(pruneEvents([{ at: NOW - EVENT_KEEP_MS - 1 }], NOW), []);
  const all = [{ at: NOW }, { at: NOW + 1 }];
  assert.deepEqual(pruneEvents(all, NOW), all);
});
