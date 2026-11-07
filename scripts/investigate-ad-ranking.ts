import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AdStore } from '../server/ad-store.ts';
import { AdApiClient, type LeaderboardSubmission } from '../client/src/ad/api.ts';
import { createNewGame, bigFromLog10, bigLog10, prestigeInfinity, serialize, deserialize } from '../client/src/ad/engine.mjs';
import { compareProgress } from '../client/src/ad/sync.mjs';
import { groupLeaderboard } from '../client/src/world/antimatter/leaderboard.ts';
import { createAuthProvider } from '../client/src/ad/user.mjs';

// 合成データだけを使い、現行の観測結果を確かめる。順位仕様の承認には使わない。
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-ranking-investigation-'));
const originalFetch = globalThis.fetch;
const observations: Record<string, unknown> = {};
try {
  const game = (current: number, total: number, infinities: number) => {
    const value = createNewGame(1000);
    value.antimatter = bigFromLog10(current);
    value.totalAntimatter = bigFromLog10(total);
    value.infinities = infinities;
    return value;
  };
  const snapshot = (value: ReturnType<typeof createNewGame>) => ({
    currentLog10: bigLog10(value.antimatter), total: value.totalAntimatter, infinities: value.infinities,
  });
  const crunch = game(309, 310, 0);
  const before = snapshot(crunch);
  assert.equal(prestigeInfinity(crunch), 1);
  assert.equal(bigLog10(crunch.antimatter), 1);
  assert.deepEqual(crunch.totalAntimatter, before.total);
  assert.equal(crunch.infinities, 1);
  observations.infinity = { before, after: snapshot(crunch) };
  const cases = [
    ['different-current', game(20, 30, 0), game(10, 40, 2)],
    ['same-current', game(20, 30, 0), game(20, 40, 2)],
    ['same-score', game(20, 30, 2), game(20, 40, 2)],
    ['fully-equal', game(20, 40, 2), game(20, 40, 2)],
    ['after-infinity', game(100, 100, 0), crunch],
  ] as const;
  observations.comparison = cases.map(([label, a, b], index) => {
    const store = new AdStore(path.join(dir, `pair-${index}.json`));
    for (const [name, value] of [['A', a], ['B', b]] as const) {
      const owner = store.create();
      store.submit(owner.token, { playerId: owner.id, name, antimatterLog10: bigLog10(value.antimatter), infinities: value.infinities, playTimeSec: 1 });
    }
    const order = store.leaderboard('').map(r => r.name);
    const progress = compareProgress(a, b);
    assert.deepEqual(order, index === 1 ? ['B', 'A'] : ['A', 'B']);
    assert.equal(progress, index === 3 ? 0 : -1);
    if (index === 3) {
      const owner = store.create();
      store.submit(owner.token, { playerId: owner.id, name: 'C', antimatterLog10: 20, infinities: 2, playTimeSec: 1 });
      store.submit(owner.token, { playerId: owner.id, name: 'C', antimatterLog10: 20, infinities: 2, playTimeSec: 1 });
      assert.deepEqual(store.leaderboard('').map(r => r.name), ['A', 'B', 'C']);
    }
    return { label, A: snapshot(a), B: snapshot(b), savedOrder: order, compareAtoB: progress };
  });

  const file = path.join(dir, 'candidates.json');
  let store = new AdStore(file);
  const owners = Array.from({ length: 52 }, () => store.create());
  // HTTPソケットは開かず、実APIクライアントのJSON送受信をAdStoreに接続する。
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), '/api/leaderboard');
    const token = new Headers(options?.headers).get('Authorization')?.replace(/^Bearer /, '') ?? '';
    if (options?.method === 'POST') {
      store.submit(token, JSON.parse(String(options.body)));
      return new Response(JSON.stringify({ ok: true }));
    }
    return new Response(JSON.stringify({ entries: store.leaderboard(token) }));
  };
  const apiFor = (i: number) => new AdApiClient('', createAuthProvider({ mode: 'token', token: owners[i].token }));
  const input = (i: number): LeaderboardSubmission => ({
    playerId: owners[i].id, name: i < 2 ? 'Shared' : `P${i + 1}`,
    antimatterLog10: 100 - i, infinities: i, playTimeSec: 1,
  });
  const checkpoints = [];
  for (let i = 0; i < 51; i++) {
    const countBefore = store.leaderboard('').length;
    await apiFor(i).submitScore(input(i));
    if (i < 48) continue;
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')).scores;
    const savedPublic = saved.map(({ playerId: _, ...row }: LeaderboardSubmission) => row);
    store = new AdStore(file);
    const returned = await new AdApiClient('', createAuthProvider()).leaderboard();
    assert.deepEqual(returned, savedPublic);
    assert.equal(returned.length, Math.min(i + 1, 50));
    assert.deepEqual(returned.map(r => r.antimatterLog10), Array.from({ length: returned.length }, (_, j) => 100 - j));
    const groups = groupLeaderboard(returned);
    assert.equal(groups.length, returned.length - 1);
    assert.equal(groups[0].representative.antimatterLog10, 100);
    assert.deepEqual(groups[0].records.map(r => r.antimatterLog10), [99]);
    checkpoints.push({ submitted: i + 1, before: countBefore, saved: saved.length, restartAndApi: returned.length,
      groups: groups.length, order: returned.map(r => r.name), representative: 'Shared:100', children: ['Shared:99'] });
  }
  observations.checkpoints = checkpoints;
  assert.ok(!store.leaderboard('').some(r => r.name === 'P51'));
  const retained = game(50, 70, 50);
  store.save(owners[50].id, owners[50].token, 0, JSON.parse(serialize(retained)));
  store = new AdStore(file);
  assert.equal(bigLog10(deserialize(JSON.stringify(store.load(owners[50].id, owners[50].token).save)).totalAntimatter), 70);
  assert.ok(!store.leaderboard('').some(r => r.name === 'P51'), 'save is not automatically indexed');
  await apiFor(50).submitScore({ ...input(50), antimatterLog10: 51, infinities: 0 });
  assert.ok(!store.leaderboard('').some(r => r.name === 'P51'), 'boundary tie loses on infinities');
  await apiFor(50).submitScore({ ...input(50), antimatterLog10: 51, infinities: 49 });
  assert.ok(!store.leaderboard('').some(r => r.name === 'P51'), 'full boundary tie keeps earlier record');
  await apiFor(50).submitScore({ ...input(50), antimatterLog10: 51, infinities: 100 });
  assert.equal(store.leaderboard('').at(-1)!.name, 'P51');
  await apiFor(0).submitScore({ ...input(0), name: 'Resent', antimatterLog10: 0 });
  assert.equal(store.leaderboard('').length, 50);
  assert.equal(store.leaderboard('').at(-1)!.name, 'Resent');
  assert.ok(!store.leaderboard('').some(r => r.name === 'P50'), 'excluded candidate does not return when another owner drops');
  await apiFor(51).submitScore({ ...input(51), name: 'NewHigh', antimatterLog10: 200 });
  assert.ok(!store.leaderboard('').some(r => r.name === 'Resent'));
  observations.boundary = { equalCurrentLessInfinity: 'excluded', fullTie: 'excluded', moreInfinity: 'P51 retained',
    existingOwnerLowerResubmit: 'old high score replaced by 0; excluded P50 not restored', newHigh: 'Resent excluded' };

  const row = (name: string, current: number, inf: number) => ({ name, antimatterLog10: current, infinities: inf, playTimeSec: 1 });
  const unsorted = [row('Same', 1, 99), row('Other', 5, 0), row('Same', 10, 1), row('Same', 10, 100)];
  const grouped = groupLeaderboard(unsorted);
  assert.deepEqual(grouped.map(g => g.representative), [unsorted[1], unsorted[2]]);
  assert.deepEqual(grouped[1].records, [unsorted[0], unsorted[3]]);
  observations.unsortedGrouping = grouped;
  const legacyFile = path.join(dir, 'legacy.json');
  const legacy = [{ playerId: 'synthetic-legacy', ...row('Legacy', 123, 2) }];
  const imported = new AdStore(legacyFile, Date.now, legacy);
  imported.create();
  const restarted = new AdStore(legacyFile, Date.now, [{ playerId: 'different-legacy', ...row('NotReimported', 200, 4) }]);
  assert.deepEqual(restarted.leaderboard(''), [row('Legacy', 123, 2)]);
  assert.equal(Object.hasOwn(restarted.leaderboard('')[0], 'totalAntimatter'), false);
  assert.equal(Object.hasOwn(restarted.leaderboard('')[0], 'dimensionalBoosts'), false);
  const old = JSON.parse(serialize(retained)); delete old.totalAntimatter;
  assert.deepEqual(deserialize(old).totalAntimatter, { mantissa: 0, exponent: 0 });
  observations.recovery = { retainedSave: 'totalLog10=70; no automatic score rebuild', legacy: 'import only without access file; no total or Boost',
    missingTotalDeserialize: '0 fallback is not evidence of historical total' };
  console.log(JSON.stringify(observations, null, 2));
  console.log('All synthetic observations matched. No production data accessed.');
} finally {
  globalThis.fetch = originalFetch;
  fs.rmSync(dir, { recursive: true, force: true });
}
