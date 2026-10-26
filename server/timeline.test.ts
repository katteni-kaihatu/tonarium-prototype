import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Timeline } from './timeline.ts';

function fresh() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-timeline-'));
  const tl = new Timeline(path.join(dir, 'timeline.json'), path.join(dir, 'images'), () => {});
  const upload = (name: string) => {
    const id = tl.newImageId();
    fs.writeFileSync(tl.imageFile(id), Buffer.from([0xff, 0xd8]));
    tl.registerUpload(id, name);
    return id;
  };
  return { dir, tl, upload };
}
const ctx = { place: null, session: () => null };

test('画像は上げた本人が 1 つのポストにだけ付けられ、他人のポストを消しても残る', () => {
  const { dir, tl, upload } = fresh();
  try {
    const id = upload('a');
    assert.equal(tl.create('b', { text: 'x', image: id }, ctx)?.image, undefined, '他人の画像は付かない');
    const mine = tl.create('a', { text: 'x', image: id }, ctx);
    assert.equal(mine?.image, id);
    assert.equal(tl.create('a', { text: 'y', image: id }, ctx)?.image, undefined, '同じ画像を二度使えない');
    const other = tl.create('b', { text: 'z' }, ctx)!;
    tl.remove(other.id, 'b');
    assert.ok(fs.existsSync(tl.imageFile(id)));
    tl.remove(mine!.id, 'a');
    assert.ok(!fs.existsSync(tl.imageFile(id)), '自分のポストを消すと画像も消える');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('回数の上限は人ごとに直近の時間だけ数える', () => {
  const { dir, tl } = fresh();
  try {
    const rate = { limit: 2, ms: 1000 };
    assert.equal(tl.allow('a', rate, 0), true);
    assert.equal(tl.allow('a', rate, 10), true);
    assert.equal(tl.allow('a', rate, 20), false);
    assert.equal(tl.allow('b', rate, 20), true, '別の人は別に数える');
    assert.equal(tl.allow('a', rate, 1001), true, '時間が過ぎれば戻る');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
