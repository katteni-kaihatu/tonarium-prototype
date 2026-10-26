import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createItem, type Item } from '../../../shared/items.ts';
import { imageItemCreator } from './imageItemCreator.ts';

const image = (id: string, createdBy: string, createdByName?: string): Item => ({
  id, kind: 'image', x: 0, z: 0, ry: 0, createdBy, updatedBy: 'mover', createdByName,
  url: `/media/${id}.png`, w: 1200, h: 800,
});

test('複数の画像を並べ替えても作成者IDで対応し、更新者を使わない', () => {
  const users = [{ id: 'alice', name: 'アリス' }, { id: 'bob', name: 'ボブ' }, { id: 'mover', name: '運んだ人' }];
  const items = [image('a', 'alice', '古い名前'), image('b', 'bob'), image('c', 'alice')];
  assert.deepEqual(items.reverse().map((item) => [item.id, imageItemCreator(item, users)]), [
    ['c', 'アリス'], ['b', 'ボブ'], ['a', 'アリス'],
  ]);
});

test('退出後・保存復元後は保存名を使い、旧データと空白名も受け付ける', () => {
  const restored = JSON.parse(JSON.stringify(image('a', 'alice', ' アリス '))) as Item;
  assert.equal(imageItemCreator(restored, []), 'アリス');
  assert.equal(imageItemCreator(restored, [{ id: 'alice', name: '  ' }]), 'アリス');
  assert.equal(imageItemCreator(image('old', 'alice'), []), undefined);
  assert.equal(imageItemCreator(image('empty', 'alice', '  '), []), undefined);
  assert.equal(imageItemCreator(image('old', 'alice'), [{ id: 'alice', name: 'アリス' }]), 'アリス');
});

test('既存の生成経路と画像以外のアイテムは追加の名前を必須にしない', () => {
  const base = { id: 'old', x: 0, z: 0, ry: 0, createdBy: 'alice' };
  const old = createItem('image', base, () => 0, { url: '/media/00000000-0000-0000-0000-000000000001.png', w: 20, h: 40 });
  assert.ok(old);
  assert.equal(imageItemCreator(old, []), undefined);
  const note = createItem('note', base, () => 0)!;
  assert.equal(imageItemCreator(note, [{ id: 'alice', name: 'アリス' }]), undefined);
});
