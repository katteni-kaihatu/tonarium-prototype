import assert from 'node:assert/strict';
import test from 'node:test';
import { createItem, type Item, type ItemKind } from '../../../shared/items.ts';
import { EMPTY_PRESENCE, type Participant } from '../../../shared/protocol.ts';
import { canEquipHammer, mapItemTarget, mapShareTarget, runMapTarget, type MapActionState, type MapTarget } from './mapActions.ts';

const item = <K extends ItemKind>(kind: K, id: string = kind) =>
  createItem(kind, { id, x: 0, z: 0, ry: 0, createdBy: 'me' }, () => .5)! as Item & { kind: K };
const user = (id: string): Participant => ({ ...EMPTY_PRESENCE, id, name: id, session: 's', mode: '2d', sharing: true,
  icon: null, avatar: null, bio: '', status: 'online', statusText: '', guest: true, username: null, bot: false });
const state = (): MapActionState => ({ session: 's', selfId: 'me', items: { hammer: item('hammer') },
  participants: [user('me'), user('other')], sharer: 'other', camFeeds: {} });
const calls: string[] = [];
const effects = { pick: (id: string) => calls.push(`pick:${id}`), open: (key: string) => calls.push(key) };
const run = (s: MapActionState, target: MapTarget) => { calls.length = 0; runMapTarget(s, target, effects); return [...calls]; };

test('通常の未所持ハンマーのみ既存の装備経路へ渡す', () => {
  const s = state();
  assert.equal(canEquipHammer(s, 'hammer'), true);
  assert.deepEqual(run(s, mapItemTarget(s, 'hammer')!), ['pick:hammer']);
  for (const kind of ['hammer', 'camera'] as const) {
    s.items.held = { ...item(kind), holder: 'me' };
    assert.equal(canEquipHammer(s, 'hammer'), false);
    assert.equal(mapItemTarget(s, 'hammer'), null);
  }
});

test('押下後の他者所持・重複所持・削除・退出・セッション変更を確定時に拒否する', () => {
  for (const change of [
    (s: MapActionState) => { s.items.hammer = { ...item('hammer'), holder: 'other' }; },
    (s: MapActionState) => { s.items.held = { ...item('hammer'), holder: 'me' }; },
    (s: MapActionState) => { s.items.held = { ...item('camera'), holder: 'me' }; },
    (s: MapActionState) => { delete s.items.hammer; },
    (s: MapActionState) => { s.session = null; },
    (s: MapActionState) => { s.session = 'next'; },
  ]) {
    const s = state(), target = mapItemTarget(s, 'hammer')!;
    change(s);
    assert.deepEqual(run(s, target), []);
  }
});

test('開く経路は種類を限定せず既存のキー判定を使う', () => {
  const s = state();
  for (const kind of ['chess', 'canvas', 'note'] as const) {
    s.items[kind] = item(kind);
    const target = mapItemTarget(s, kind)!;
    assert.deepEqual(run(s, target), [`item:${kind}`]);
    delete s.items[kind];
    assert.deepEqual(run(s, target), []);
  }
  s.items.hammer.mapPlacement = { mode: 'system', mapId: 'map', objectId: 'object', itemId: 'hammer', position: [0, 0, 0], rotation: 0 };
  assert.equal(canEquipHammer(s, 'hammer'), false);
  assert.deepEqual(run(s, mapItemTarget(s, 'hammer')!), ['item:hammer']);
});

test('カメラは live と feed がそろった場合だけ開く', () => {
  const s = state();
  const camera = item('camera');
  if (camera.kind !== 'camera') throw new Error('camera');
  s.items.camera = camera;
  camera.live = true;
  assert.equal(mapItemTarget(s, 'camera'), null);
  s.camFeeds.camera = 1;
  const target = mapItemTarget(s, 'camera')!;
  assert.deepEqual(run(s, target), ['cam:camera']);
  camera.live = false;
  assert.deepEqual(run(s, target), []);
  camera.live = true;
  delete s.camFeeds.camera;
  assert.deepEqual(run(s, target), []);
});

test('配信の終了・退出・配信者交代は古い視聴操作を無効にする', () => {
  for (const change of [
    (s: MapActionState) => { s.participants[1].sharing = false; },
    (s: MapActionState) => { s.participants.pop(); },
    (s: MapActionState) => { s.sharer = 'me'; },
    (s: MapActionState) => { s.sharer = null; },
    (s: MapActionState) => { s.session = 'next'; },
  ]) {
    const s = state(), target = mapShareTarget(s, 'other')!;
    assert.deepEqual(run(s, target), ['share']);
    change(s);
    assert.deepEqual(run(s, target), []);
    assert.equal(mapShareTarget(s, 'missing'), null);
  }
});
