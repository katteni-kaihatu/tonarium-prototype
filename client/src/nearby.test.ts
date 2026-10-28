import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Item } from '../../shared/items.ts';
import { EMPTY_PRESENCE, type Participant } from '../../shared/protocol.ts';
import type { Place } from '../../shared/places.ts';
import { arrangePlayers, bandOf, displayMeters, formatDistance, nearbyItems, nearbyUsers, projectProximity, stepTrend } from './nearby.ts';

const person = (id: string, follow: string | null = null): Participant => ({
  ...EMPTY_PRESENCE,
  id, name: id, session: 'room', mode: '3d', sharing: false, icon: null, avatar: null, bio: '', status: 'online', statusText: '', guest: false, username: null,
  follow,
});

const at = (x: number, z = 0): Place => ({ x, z, ry: 0, small: false });

test('距離の帯は 3m と 15m で分かれる', () => {
  assert.equal(bandOf(0), 'near');
  assert.equal(bandOf(3), 'near');
  assert.equal(bandOf(3.01), 'mid');
  assert.equal(bandOf(15), 'mid');
  assert.equal(bandOf(15.01), 'far');
  assert.equal(bandOf(Infinity), 'far');
});

test('自分は 0m、位置の無い人は無限遠、近い順', () => {
  const places = new Map<string, Place>([['me', at(0)], ['a', at(4)], ['b', at(1)]]);
  const rows = nearbyUsers([person('a'), person('me'), person('c'), person('b')], places, 'me');
  assert.deepEqual(rows.map((r) => [r.user.id, r.d]), [['me', 0], ['b', 1], ['a', 4], ['c', Infinity]]);
});

test('ついていっている人は相手の直後で、相手と同じ帯', () => {
  const rows = arrangePlayers([
    { user: person('b', 'a'), d: 0.4 },
    { user: person('a'), d: 1 },
    { user: person('me'), d: 0 },
    { user: person('c'), d: 16 },
  ], 'me');
  assert.deepEqual(rows.map((r) => [r.user.id, r.band, r.child]), [
    ['a', 'near', false],
    ['b', 'near', true],
    ['c', 'far', false],
  ]);
});

test('表示が 3.0m なら近く、3.1m なら声が届く。ついていく人は相手の帯', () => {
  const rows = arrangePlayers([
    { user: person('c', 'a'), d: 20 },
    { user: person('a'), d: 3.04 },
    { user: person('b'), d: 3.06 },
  ], 'me');
  assert.equal(formatDistance(3.04), '3.0m');
  assert.equal(formatDistance(3.06), '3.1m');
  assert.deepEqual(rows.map((r) => [r.user.id, r.band, r.child]), [
    ['a', 'near', false],
    ['c', 'near', true],
    ['b', 'mid', false],
  ]);
});

test('10m 未満は小数、以上は整数。帯は表示上のメートル', () => {
  assert.equal(formatDistance(9.96), '10.0m');
  assert.equal(formatDistance(10), '10m');
  assert.equal(displayMeters(9.96), 10);
  assert.equal(formatDistance(15.4), '15m');
  assert.equal(bandOf(displayMeters(15.4)), 'mid');
  assert.equal(formatDistance(15.5), '16m');
  assert.equal(bandOf(displayMeters(15.5)), 'far');
});

test('ラベルと参加者が同じなら行を再利用する', () => {
  const a = person('a');
  const b = person('b');
  const me = person('me');
  const participants = [a, b, me];
  const places = new Map<string, Place>([['me', at(0)], ['a', at(1.01)], ['b', at(4)]]);
  const first = projectProximity({ players: [], items: [] }, participants, places, {}, 'me');
  const nudged = projectProximity(first, participants, new Map([['me', at(0)], ['a', at(1.04)], ['b', at(4)]]), {}, 'me');
  assert.equal(formatDistance(1.01), formatDistance(1.04));
  assert.equal(nudged.players, first.players);

  const moved = projectProximity(nudged, participants, new Map([['me', at(0)], ['a', at(1.06)], ['b', at(4)]]), {}, 'me');
  assert.equal(formatDistance(1.06), '1.1m');
  assert.notEqual(moved.players, nudged.players);
  assert.notEqual(moved.players[0], nudged.players[0]);
  assert.equal(moved.players[1], nudged.players[1]);

  const a2 = person('a');
  const renamed = projectProximity(moved, [a2, b, me], new Map([['me', at(0)], ['a', at(1.06)], ['b', at(4)]]), {}, 'me');
  assert.notEqual(renamed.players.find((p) => p.user.id === 'a'), moved.players[0]);
  assert.equal(renamed.players.find((p) => p.user.id === 'b'), moved.players[1]);
});

test('表示が同じアイテム行は再利用し、中身が変わったら差し替える', () => {
  const note = { id: 'n', kind: 'note', x: 3, z: 4, ry: 0, createdBy: 'a', updatedBy: 'a', text: '', color: '#fff', editingBy: null } as Item;
  const places = new Map<string, Place>([['me', at(0)]]);
  const first = projectProximity({ players: [], items: [] }, [person('me')], places, { n: note }, 'me');
  const again = projectProximity(first, [person('me')], places, { n: note }, 'me');
  assert.equal(again.items, first.items);
  assert.equal(first.items[0].band, 'mid');
  const edited = { ...note, text: 'x' };
  const next = projectProximity(again, [person('me')], places, { n: edited }, 'me');
  assert.notEqual(next.items[0], again.items[0]);
  assert.equal(next.items[0].item, edited);
});

test('短い間隔では速度を更新せず、止まると光りが消える', () => {
  let cur = stepTrend(undefined, 10, 0);
  assert.equal(cur.trend, 0);
  const held = stepTrend(cur.state, 0, 40);
  assert.equal(held.state, cur.state);
  assert.equal(held.trend, 0);
  cur = stepTrend(cur.state, 0, 1000);
  assert.equal(cur.trend, -1);
  let n = 0;
  while (cur.trend !== 0 && n < 20) {
    cur = stepTrend(cur.state, 0, 1000 * (n + 2));
    n += 1;
  }
  assert.equal(cur.trend, 0);
  assert.ok(n < 20);
});

test('持っている物は持ち主の位置、置いてある物は自分の座標', () => {
  const hammer = { id: 'h', kind: 'hammer', x: 100, z: 100, ry: 0, createdBy: 'a', updatedBy: 'a', holder: 'a' } as Item;
  const note = { id: 'n', kind: 'note', x: 3, z: 4, ry: 0, createdBy: 'a', updatedBy: 'a', text: '', color: '#fff', editingBy: null } as Item;
  const places = new Map<string, Place>([['me', at(0)], ['a', at(3)]]);
  const rows = nearbyItems({ h: hammer, n: note }, places, 'me');
  assert.deepEqual(rows.map((r) => [r.item.id, r.d, r.heldBy]), [['h', 3, 'a'], ['n', 5, null]]);
  assert.equal(nearbyItems({ n: note }, new Map(), 'me')[0].d, Infinity);
});
