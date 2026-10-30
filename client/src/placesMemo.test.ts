import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computePlaces, type Place } from '../../shared/places.ts';
import { EMPTY_PRESENCE, type AvatarState, type Participant } from '../../shared/protocol.ts';
import { placesFromInputs, type PlacesInputs } from './placesMemo.ts';

const user = (id: string, mode: '2d' | '3d', extra: Partial<Participant> = {}): Participant => ({
  id, name: id, session: 's1', mode, sharing: false, icon: null, avatar: null, bio: '', status: 'online', statusText: '', guest: false, username: null, bot: false,
  ...EMPTY_PRESENCE, ...extra,
});

const base = (): PlacesInputs => {
  const participants = [
    user('me', '3d'),
    user('a', '3d'),
    user('b', '2d', { pos: { x: 1, z: 2, ry: 0 } }),
    user('c', '2d', { follow: 'a' }),
    user('d', '2d'),
  ];
  const avatars: Record<string, AvatarState> = { a: { x: 5, z: 6, ry: 1 } };
  return { participants, avatars, selfId: 'me', selfAvatar: { x: 0, z: 0, ry: 0 }, mode: '3d', walk: null };
};

/** メモ化しない素の計算（placesOf の従来の意味論） */
const plain = (inputs: PlacesInputs): Map<string, Place> => {
  const out = computePlaces(inputs.participants, (id) => (id === inputs.selfId ? (inputs.mode === '3d' ? inputs.selfAvatar : undefined) : inputs.avatars[id]));
  if (inputs.walk && inputs.mode === '2d' && out.has(inputs.selfId)) out.set(inputs.selfId, { ...inputs.walk.at, small: false });
  return out;
};

test('結果は素の計算と一致する', () => {
  const inputs = base();
  assert.deepEqual(placesFromInputs(inputs), plain(inputs));
});

test('入力の参照が全部同じなら同じ Map を返す', () => {
  const inputs = base();
  const first = placesFromInputs(inputs);
  assert.equal(placesFromInputs(inputs), first);
  assert.equal(placesFromInputs({ ...inputs }), first);
});

test('アバターが差し替わると再計算され、新しい位置が返る', () => {
  const inputs = base();
  const first = placesFromInputs(inputs);
  const moved = { ...inputs, avatars: { a: { x: 9, z: 9, ry: 1 } } };
  const next = placesFromInputs(moved);
  assert.notEqual(next, first);
  assert.equal(next.get('a')?.x, 9);
  // ついてきている人の位置も連動して変わる
  assert.notDeepEqual(next.get('c'), first.get('c'));
});

test('参加者が差し替わると再計算される', () => {
  const inputs = base();
  placesFromInputs(inputs);
  const participants = inputs.participants.map((p) => (p.id === 'b' ? { ...p, pos: { x: 7, z: 8, ry: 0 } } : p));
  const next = placesFromInputs({ ...inputs, participants });
  assert.deepEqual(next.get('b'), { x: 7, z: 8, ry: 0, small: false });
});

test('歩行中は手元の位置が優先され、walk の差し替えで再計算される', () => {
  const inputs: PlacesInputs = {
    ...base(),
    participants: [user('me', '2d', { pos: { x: 0, z: 0, ry: 0 } }), user('a', '3d')],
    mode: '2d',
    walk: { to: { x: 3, z: 4 }, at: { x: 1, z: 1, ry: 0.5 }, until: 0 },
  };
  assert.deepEqual(placesFromInputs(inputs).get('me'), { x: 1, z: 1, ry: 0.5, small: false });
  const stepped = { ...inputs, walk: { ...inputs.walk!, at: { x: 2, z: 2, ry: 0.5 } } };
  assert.deepEqual(placesFromInputs(stepped).get('me'), { x: 2, z: 2, ry: 0.5, small: false });
});

test('モードが変わると再計算される（2D の自分は selfAvatar を使わない）', () => {
  const inputs = base();
  const in3d = placesFromInputs(inputs);
  assert.deepEqual(in3d.get('me'), { x: 0, z: 0, ry: 0, small: false });
  const participants = inputs.participants.map((p) => (p.id === 'me' ? { ...p, mode: '2d' as const, pos: { x: 4, z: 4, ry: 0 } } : p));
  const in2d = placesFromInputs({ ...inputs, participants, mode: '2d' });
  assert.notEqual(in2d, in3d);
  assert.deepEqual(in2d.get('me'), { x: 4, z: 4, ry: 0, small: false });
});
