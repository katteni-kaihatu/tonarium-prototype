import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST_KEEP_MS, POST_MAX_COUNT, cleanAttach, prunePosts, threadOf, timelineEntries, type Post, type TimelineAudience } from './timeline.ts';

const NOW = 1_800_000_000_000;
const post = (id: string, author: string, at: number, extra: Partial<Post> = {}): Post => ({ id, author, text: id, at, reactions: {}, reposts: [], ...extra });
const who: TimelineAudience = { self: 'me', following: ['a'], friends: ['f'], fof: ['ff'], here: ['h'], blocked: [] };

test('タブごとに出す人を分け、返信は一覧に出さない', () => {
  const posts = [post('1', 'me', 1), post('2', 'a', 2), post('3', 'f', 3), post('4', 'ff', 4), post('5', 'h', 5), post('6', 'x', 6), post('7', 'a', 7, { replyTo: '1' })];
  const ids = (tab: Parameters<typeof timelineEntries>[1]) => timelineEntries(posts, tab, who).map((e) => e.post.id);
  assert.deepEqual(ids('home'), ['2', '1']);
  assert.deepEqual(ids('social'), ['4', '3', '1']);
  assert.deepEqual(ids('session'), ['5']);
  assert.deepEqual(ids('global'), ['6', '5', '4', '3', '2', '1']);
});

test('リポストはした時刻で並び、同じポストは新しい方の行だけ残る', () => {
  const posts = [post('1', 'x', 10, { reposts: [{ id: 'a', at: 30 }] }), post('2', 'a', 20)];
  const home = timelineEntries(posts, 'home', who);
  assert.deepEqual(home.map((e) => [e.post.id, e.repostBy]), [['1', 'a'], ['2', undefined]]);
  const global = timelineEntries(posts, 'global', who);
  assert.deepEqual(global.map((e) => [e.post.id, e.repostBy]), [['1', 'a'], ['2', undefined]]);
});

test('ブロックした人のポストとリポストは出さない', () => {
  const posts = [post('1', 'b', 10), post('2', 'x', 20, { reposts: [{ id: 'b', at: 30 }] })];
  const list = timelineEntries(posts, 'global', { ...who, blocked: ['b'] });
  assert.deepEqual(list.map((e) => [e.post.id, e.repostBy]), [['2', undefined]]);
});

test('返信の木は時系列で、深さつきに平らにする', () => {
  const posts = [post('r', 'a', 1), post('c2', 'b', 5, { replyTo: 'r' }), post('c1', 'b', 2, { replyTo: 'r' }), post('g', 'c', 3, { replyTo: 'c1' })];
  assert.deepEqual(threadOf(posts, 'r').map((x) => [x.post.id, x.depth]), [['c1', 0], ['g', 1], ['c2', 0]]);
});

test('古いもの・多すぎるものを落とし、親が消えた返信も落とす', () => {
  const old = post('old', 'a', NOW - POST_KEEP_MS - 1);
  const reply = post('re', 'b', NOW, { replyTo: 'old' });
  const keep = post('keep', 'a', NOW - POST_KEEP_MS);
  assert.deepEqual(prunePosts([old, reply, keep], NOW).map((p) => p.id), ['keep']);
  const many = Array.from({ length: POST_MAX_COUNT + 5 }, (_, i) => post(String(i), 'a', NOW - i));
  const kept = prunePosts(many, NOW);
  assert.equal(kept.length, POST_MAX_COUNT);
  assert.ok(!kept.some((p) => Number(p.id) >= POST_MAX_COUNT), '新しい方から残す');
});

test('添付は形を確かめ、知らない種類やワールドは捨てる', () => {
  assert.deepEqual(cleanAttach({ kind: 'world', id: 'cafe' }), { kind: 'world', id: 'cafe' });
  assert.equal(cleanAttach({ kind: 'world', id: 'nowhere' }), undefined);
  assert.deepEqual(cleanAttach({ kind: 'session', id: 'abc', name: 'spoofed' }), { kind: 'session', id: 'abc', name: null });
  assert.equal(cleanAttach({ kind: 'item', id: '<script>' }), undefined);
  assert.equal(cleanAttach({ kind: 'other', id: 'x' }), undefined);
  assert.equal(cleanAttach(null), undefined);
});
