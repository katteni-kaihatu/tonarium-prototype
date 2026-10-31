import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkFantasyEconomy } from './benchmark-fantasy-performance.ts';

test('the isolated performance report measures deterministic economy operations without persistent data', () => {
  const first = benchmarkFantasyEconomy(1), second = benchmarkFantasyEconomy(1);
  for (const name of ['sync', 'view', 'validate']) {
    assert.equal(first.scenarios[name].samplesMs.length, 1);
    assert.ok(Number.isFinite(first.scenarios[name].medianMs));
    assert.equal(first.scenarios[name].signature, second.scenarios[name].signature);
  }
  assert.ok(first.memory.after.heapUsed > 0);
  for (const invalid of [0, -1, 1.5, NaN, Infinity, 101]) assert.throws(() => benchmarkFantasyEconomy(invalid));
});
