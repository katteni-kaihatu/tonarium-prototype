import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Follows } from './follows.ts';

test('片方だけのフォローはフレンドではなく、お互いにフォローするとフレンド', () => {
  const f = new Follows();
  assert.equal(f.add('a', 'b'), true);
  assert.equal(f.isFriend('a', 'b'), false);
  assert.deepEqual(f.followers('b'), ['a']);
  f.add('b', 'a');
  assert.equal(f.isFriend('a', 'b'), true);
  assert.deepEqual(f.friendsOf('a'), ['b']);
  f.remove('b', 'a');
  assert.deepEqual(f.friendsOf('a'), []);
  assert.deepEqual(f.following('a'), ['b']);
});

test('自分自身・空の名前・重複はフォローにならない', () => {
  const f = new Follows();
  assert.equal(f.add('a', 'a'), false);
  assert.equal(f.add('', 'a'), false);
  assert.equal(f.add('a', 'b'), true);
  assert.equal(f.add('a', 'b'), false);
  assert.equal(f.remove('a', 'c'), false);
  assert.deepEqual(f.edges(), [['a', 'b']]);
});

test('旧 friends.json の組は相互フォローとして引き継ぐ', () => {
  const f = Follows.fromFriendPairs([['a', 'b'], ['c', 'a']]);
  assert.deepEqual(f.friendsOf('a').sort(), ['b', 'c']);
  assert.equal(f.isFriend('b', 'c'), false);
  assert.equal(new Follows(f.edges()).isFriend('c', 'a'), true);
});

test('フレンドのフレンドは自分とフレンドを除く', () => {
  const f = Follows.fromFriendPairs([['a', 'b'], ['b', 'c'], ['a', 'd'], ['d', 'b']]);
  f.add('c', 'e');
  assert.deepEqual(f.friendsOfFriends('a'), ['c']);
  assert.deepEqual([...f.friendMap().keys()].sort(), ['a', 'b', 'c', 'd']);
});
