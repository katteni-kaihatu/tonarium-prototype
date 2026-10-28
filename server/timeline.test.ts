import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timeline } from './timeline.ts';

function fresh() {
  const removed: string[] = [];
  const tl = new Timeline([], (id) => removed.push(id), () => {});
  const upload = (name: string, now = Date.now()) => {
    const id = tl.newImageId();
    tl.registerUpload(id, name, now);
    return id;
  };
  return { tl, upload, removed };
}
const ctx = { place: null, session: () => null };

test('画像は上げた本人が 1 つのポストにだけ付けられ、他人のポストを消しても残る', () => {
  const { tl, upload, removed } = fresh();
  const id = upload('a');
  assert.equal(tl.create('b', { text: 'x', image: id }, ctx)?.image, undefined, '他人の画像は付かない');
  const mine = tl.create('a', { text: 'x', image: id }, ctx);
  assert.equal(mine?.image, id);
  assert.equal(tl.create('a', { text: 'y', image: id }, ctx)?.image, undefined, '同じ画像を二度使えない');
  const other = tl.create('b', { text: 'z' }, ctx)!;
  tl.remove(other.id, 'b');
  assert.deepEqual(removed, []);
  tl.remove(mine!.id, 'a');
  assert.deepEqual(removed, [id], '自分のポストを消すと画像も消える');
});

test('ポストに使われないまま古くなった画像だけ消す', () => {
  const { tl, upload, removed } = fresh();
  const old = upload('a', 0);
  const used = upload('a', 0);
  tl.create('a', { text: 'x', image: used }, ctx);
  const recent = upload('a', 60 * 60 * 1000);
  tl.sweepImages(60 * 60 * 1000 + 1);
  assert.deepEqual(removed, [old]);
  assert.equal(tl.create('a', { text: 'y', image: recent }, ctx, 60 * 60 * 1000 + 2)?.image, recent);
});

test('回数の上限は人ごとに直近の時間だけ数える', () => {
  const { tl } = fresh();
  const rate = { limit: 2, ms: 1000 };
  assert.equal(tl.allow('a', rate, 0), true);
  assert.equal(tl.allow('a', rate, 10), true);
  assert.equal(tl.allow('a', rate, 20), false);
  assert.equal(tl.allow('b', rate, 20), true, '別の人は別に数える');
  assert.equal(tl.allow('a', rate, 1001), true, '時間が過ぎれば戻る');
});
