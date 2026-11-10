import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareAdRanking } from './ad-ranking.ts';

const base = { infinities: 2, galaxies: 3, dimensionalBoosts: 4, antimatterLog10: 5 };
test('ranking compares each stage in descending priority without changing scores', () => {
  const keys = ['infinities', 'galaxies', 'dimensionalBoosts', 'antimatterLog10'] as const;
  keys.forEach((key, index) => {
    const higher = Object.freeze({ ...base, [key]: base[key] + 1 });
    const lower = Object.freeze(Object.fromEntries(keys.map((k, i) => [k, base[k] + (i > index ? 1000 : 0)])) as typeof base);
    assert.ok(compareAdRanking(higher, lower) < 0, key);
    assert.ok(compareAdRanking(lower, higher) > 0, key);
  });
});
test('missing galaxies and Boost equal measured zero only during comparison', () => {
  const missing = Object.freeze({ infinities: 1, antimatterLog10: 10 });
  const zero = Object.freeze({ ...missing, galaxies: 0, dimensionalBoosts: 0 });
  assert.equal(compareAdRanking(missing, zero), 0);
  assert.equal(compareAdRanking(zero, missing), 0);
  assert.equal(Object.hasOwn(missing, 'galaxies'), false);
  assert.equal(Object.hasOwn(missing, 'dimensionalBoosts'), false);
  assert.equal(compareAdRanking(base, { ...base }), 0);
});
