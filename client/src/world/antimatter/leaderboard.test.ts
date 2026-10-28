import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupLeaderboard } from './leaderboard.ts';
import type { LeaderboardEntry } from './types.ts';

const entry = (name: string, antimatterLog10 = 10, self?: boolean): LeaderboardEntry => ({ name, antimatterLog10, self, infinities: 2, playTimeSec: 60 });

test('Boost snapshots remain attached to each record without affecting ranks, representatives or self', () => {
  const entries = [
    { ...entry('A', 1, true), dimensionalBoosts: 100 },
    { ...entry('B', 5), dimensionalBoosts: 0 },
    { ...entry('A', 10), dimensionalBoosts: 4 },
    { ...entry('A', 3), dimensionalBoosts: 0 },
    entry('A', 2),
  ];
  const groups = groupLeaderboard(entries);
  assert.deepEqual(groups.map(g => [g.rank, g.representative]), [[1, entries[1]], [2, entries[2]]]);
  assert.deepEqual(groups[1].records, [entries[0], entries[3], entries[4]]);
  assert.deepEqual(groups[1].records.map(r => r.dimensionalBoosts), [100, 0, undefined]);
  assert.equal(groups[1].representative, entries[2]);
  assert.equal(groups[1].records[0], entries[0]);
  assert.equal(groups[1].hasSelfInRecords, true);
  assert.equal(groups[1].representative.self, undefined);
});

test('empty and single record', () => {
  assert.deepEqual(groupLeaderboard([]), []);
  const e = entry('A');
  assert.deepEqual(groupLeaderboard([e]), [{ rank: 1, representative: e, records: [], hasSelfInRecords: false }]);
});

test('nonadjacent names retain every other record in input order', () => {
  const entries = [entry('A', 50), entry('B', 40), entry('A', 30), entry('C', 20), entry('A', 10)];
  const groups = groupLeaderboard(entries);
  assert.deepEqual(groups.map(g => [g.rank, g.representative]), [[1, entries[0]], [2, entries[1]], [3, entries[3]]]);
  assert.deepEqual(groups[0].records, [entries[2], entries[4]]);
});

test('later maximum becomes representative; groups follow representative original indices', () => {
  const entries = [entry('A', 1), entry('B', 5), entry('A', 9), entry('A', 3)];
  const groups = groupLeaderboard(entries);
  assert.deepEqual(groups.map(g => g.representative), [entries[1], entries[2]]);
  assert.deepEqual(groups.map(g => g.rank), [1, 2]);
  assert.deepEqual(groups[1].records, [entries[0], entries[3]]);
});

test('tied representatives and tied different names preserve input order', () => {
  const entries = [entry('B'), entry('A'), entry('B'), entry('C')];
  const groups = groupLeaderboard(entries);
  assert.equal(groups[0].representative, entries[0]);
  assert.deepEqual(groups.map(g => g.representative.name), ['B', 'A', 'C']);
  assert.deepEqual(groups[0].records, [entries[2]]);
});

test('names use exact equality including whitespace, case, Unicode and empty strings', () => {
  const names = ['A', 'a', ' A', 'A ', 'Ａ', 'é', 'e\u0301', '', '__proto__'];
  const groups = groupLeaderboard([...names.map(name => entry(name)), entry('A'), entry('')]);
  assert.deepEqual(groups.map(g => g.representative.name), names);
  assert.equal(groups[0].records.length, 1);
  assert.equal(groups[7].records.length, 1);
});

test('self belongs to each record, independently of its name or representative', () => {
  const groups = groupLeaderboard([entry('A', 100, true), entry('B', 90), entry('C', 80), entry('A', 70), entry('B', 60, true), entry('C', 50)]);
  assert.equal(groups[0].representative.self, true);
  assert.equal(groups[0].hasSelfInRecords, false);
  assert.equal(groups[1].representative.self, undefined);
  assert.equal(groups[1].hasSelfInRecords, true);
  assert.equal(groups[1].records[0].self, true);
  assert.equal(groups[2].hasSelfInRecords, false);
});

test('input array and records remain unchanged and keep their identity', () => {
  const entries = Object.freeze([Object.freeze(entry('A', 1, true)), Object.freeze(entry('B', 5)), Object.freeze(entry('A', 10)), Object.freeze(entry('A', 3))]);
  const before = structuredClone(entries);
  const groups = groupLeaderboard(entries);
  assert.deepEqual(entries, before);
  assert.equal(groups[1].representative, entries[2]);
  assert.equal(groups[1].records[0], entries[0]);
  groups[1].records.reverse();
  assert.deepEqual(entries, before);
});
