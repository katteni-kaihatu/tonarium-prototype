import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChatMessage } from '../shared/protocol.ts';
import { logHammerHit } from './hammer.ts';

const a = { id: 'a', name: 'そら' }, b = { id: 'b', name: 'そら' }, c = { id: 'c', name: 'そら' };

test('10秒ちょうどまで同じログを更新し、直前の打撃から判定を続ける', () => {
  const list: ChatMessage[] = [];
  const first = logHammerHit(list, a, b, 1000);
  assert.equal(first.text, 'そら がピコピコハンマーで そら を1回叩きました');
  for (const [at, count] of [[6000, 2], [16000, 3], [26000, 4]]) {
    const next = logHammerHit(list, a, b, at);
    assert.equal(next.id, first.id);
    assert.equal(next.hammer?.count, count);
    assert.equal(next.hammer?.lastHitAt, at);
    assert.equal(next.text, `そら がピコピコハンマーで そら を${count}回叩きました`);
    assert.equal(list.length, 1);
  }
  const next = logHammerHit(list, a, b, 36001);
  assert.notEqual(next.id, first.id);
  assert.equal(next.hammer?.count, 1);
  assert.equal(list.length, 2);
  assert.equal(first.hammer?.count, 4);
});

test('同名でも叩く人・相手のIDを区別し、他のログを挟んでも組み合わせごとに集約する', () => {
  const list: ChatMessage[] = [];
  const ab = logHammerHit(list, a, b, 1000);
  const cb = logHammerHit(list, c, b, 2000);
  const ac = logHammerHit(list, a, c, 3000);
  const ba = logHammerHit(list, b, a, 4000);
  list.push({ id: 'event', from: null, fromName: '', text: '別のイベント', at: 4500, scope: 'all', about: b.id });
  assert.equal(logHammerHit(list, { ...a, name: '改名後' }, b, 5000).id, ab.id);
  assert.equal(ab.hammer?.count, 2);
  assert.equal(ab.text, '改名後 がピコピコハンマーで そら を2回叩きました');
  for (const m of [cb, ac, ba]) assert.equal(m.hammer?.count, 1);
  assert.equal(list.length, 5);
});

test('最新の対象ログを更新し、保持件数を超えたログには集約しない', () => {
  const list: ChatMessage[] = [];
  const old = logHammerHit(list, a, b, 1000);
  const latest = logHammerHit(list, a, b, 11001);
  assert.equal(logHammerHit(list, a, b, 12000).id, latest.id);
  assert.equal(old.hammer?.count, 1);
  for (let n = 0; n < 500; n++) logHammerHit(list, { id: `other-${n}`, name: '他の人' }, b, 13000);
  assert.equal(list.length, 500);
  const next = logHammerHit(list, a, b, 14000);
  assert.notEqual(next.id, latest.id);
  assert.equal(next.hammer?.count, 1);
  assert.equal(list.length, 500);
});
