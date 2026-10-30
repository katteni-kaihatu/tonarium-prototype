import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Item } from '../../shared/items.ts';
import { EMPTY_PRESENCE, type AvatarState, type User } from '../../shared/protocol.ts';
import { applyAvatars, deriveSession, type SessionSources } from './sessionView.ts';

const user = (id: string, mode: User['mode'] = '2d'): User => ({
  id, name: id, session: 'room', mode, sharing: false, icon: null, avatar: null, bio: '', status: 'online', statusText: '', guest: false, username: null, bot: false,
});

const pose = (x: number): AvatarState => ({ x, z: 2, ry: 0 });

const sources = (over: Partial<SessionSources> = {}): SessionSources => ({
  users: [user('a', '3d'), user('me')],
  presence: {},
  avatarsBy: { room: { a: pose(1) } },
  itemsBy: {},
  session: 'room',
  selfId: 'me',
  ...over,
});

const emptyPrev = { participants: [], avatars: {}, avatarIds: [] };

test('位置だけ変わっても参加者と表示する ID は同じオブジェクトのまま', () => {
  const src = sources();
  const first = deriveSession(emptyPrev, src);
  const moved = deriveSession(first, sources({ avatarsBy: { room: { a: pose(4) } } }));
  assert.equal(moved.participants[0], first.participants[0]);
  assert.equal(moved.participants[1], first.participants[1]);
  assert.equal(moved.avatarIds, first.avatarIds);
  assert.deepEqual(moved.avatarIds, ['a']);
  assert.equal(moved.avatars.a.x, 4);
  assert.equal(moved.avatars.me, undefined);
});

test('同じ入力なら切り出した参照を保つ', () => {
  const src = sources();
  const first = deriveSession(emptyPrev, src);
  const again = deriveSession(first, src);
  assert.equal(again.participants, first.participants);
  assert.equal(again.avatars, first.avatars);
  assert.equal(again.avatarIds, first.avatarIds);
});

test('状態が変わった人だけ差し替え、自分と 2D はアバターに入れない', () => {
  const src = sources({ users: [user('a', '3d'), user('me'), user('c')] });
  const first = deriveSession(emptyPrev, src);
  const next = deriveSession(first, sources({
    users: [user('a', '3d'), user('me', '3d'), user('c'), user('b', '2d')],
    presence: { a: { ...EMPTY_PRESENCE, micOn: true } },
    avatarsBy: { room: { a: pose(1), me: pose(9), b: pose(8) } },
  }));
  const still = first.participants.find((p) => p.id === 'c');
  assert.equal(next.participants.find((p) => p.id === 'c'), still);
  assert.notEqual(next.participants.find((p) => p.id === 'a'), first.participants.find((p) => p.id === 'a'));
  assert.equal(next.participants.find((p) => p.id === 'a')?.micOn, true);
  assert.equal(next.participants.find((p) => p.id === 'me')?.mode, '3d');
  assert.deepEqual(next.avatarIds, ['a']);
  assert.equal(next.avatars.me, undefined);
  assert.equal(next.avatars.b, undefined);
});

test('セッションを出ると参加者とアバターは空', () => {
  const first = deriveSession(emptyPrev, sources());
  const left = deriveSession(first, sources({ session: null }));
  assert.deepEqual(left.participants, []);
  assert.deepEqual(left.avatarIds, []);
  assert.equal(left.items, deriveSession(left, sources({ session: null })).items);
});

test('アイテムの参照はセッションのマップをそのまま使う', () => {
  const note = { id: 'n', kind: 'note', x: 1, z: 1, ry: 0, createdBy: 'me', updatedBy: 'me', text: '', color: '#fff', editingBy: null } as Item;
  const items = { n: note };
  const slice = deriveSession(emptyPrev, sources({ itemsBy: { room: items } }));
  assert.equal(slice.items, items);
});

test('姿勢は表示中のアバターと ID だけを差し替える', () => {
  const src = sources();
  const first = deriveSession(emptyPrev, src);
  const base = { ...src, ...first };
  const moved = applyAvatars(base, 'room', 'a', pose(6));
  assert.equal(moved.avatarIds, first.avatarIds);
  assert.notEqual(moved.avatars, first.avatars);
  assert.equal(moved.avatars.a.x, 6);

  const other = applyAvatars({ ...base, ...moved }, 'other', 'z', pose(1));
  assert.equal(other.avatars, moved.avatars);
  assert.equal(other.avatarIds, moved.avatarIds);
  assert.equal(other.avatarsBy.other.z.x, 1);

  const gone = applyAvatars({ ...base, ...moved }, 'room', 'a', null);
  assert.deepEqual(gone.avatarIds, []);
  assert.equal(gone.avatars.a, undefined);
});

test('自分と 2D の姿勢は表示用アバターに入らない', () => {
  const src = sources({
    users: [user('a', '3d'), user('me', '3d'), user('b', '2d')],
    avatarsBy: { room: { a: pose(1) } },
  });
  const first = deriveSession(emptyPrev, src);
  const selfPose = applyAvatars({ ...src, ...first }, 'room', 'me', pose(3));
  assert.equal(selfPose.avatars, first.avatars);
  assert.equal(selfPose.avatars.me, undefined);
  const twoD = applyAvatars({ ...src, ...first, avatarsBy: selfPose.avatarsBy }, 'room', 'b', pose(4));
  assert.equal(twoD.avatars, first.avatars);
  assert.equal(twoD.avatars.b, undefined);
  assert.equal(twoD.avatarsBy.room.b.x, 4);
});
