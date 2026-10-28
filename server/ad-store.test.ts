import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { AdStore, AdStoreError } from './ad-store.ts';

function fixture(t: TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-ad-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'access.json');
  let now = 1_000;
  return { file, store: new AdStore(file, () => now), advance: () => { now += 600_001; } };
}
const rejected = (status: number) => (error: unknown) => error instanceof AdStoreError && error.status === status;

test('all private operations require the matching capability, never a claimed ID', t => {
  const { store } = fixture(t);
  const a = store.create(), b = store.create();
  for (const token of ['', a.id, b.token, 'X-User-Id']) {
    assert.throws(() => store.load(a.id, token), rejected(403));
    assert.throws(() => store.save(a.id, token, 0, {}), rejected(403));
    assert.throws(() => store.issue(a.id, token), rejected(403));
  }
  assert.throws(() => store.submit(b.token, { playerId: a.id }), rejected(403));
  assert.throws(() => store.load('legacy-id', a.token), rejected(403));
  assert.deepEqual(store.load(a.id, a.token), { save: null, revision: 0 });
});

test('revisions reject stale writers and survive a restart', t => {
  const { store, file } = fixture(t);
  const a = store.create();
  assert.deepEqual(store.save(a.id, a.token, 0, { progress: 5 }), { revision: 1 });
  assert.throws(() => store.save(a.id, a.token, 0, { progress: 0 }), rejected(409));
  const restarted = new AdStore(file);
  assert.deepEqual(restarted.load(a.id, a.token), { save: { progress: 5 }, revision: 1 });
});

test('exchange is single use even for simultaneous requests and remains consumed after restart', async t => {
  const { store, file } = fixture(t);
  const a = store.create();
  const { code } = store.issue(a.id, a.token);
  const results = await Promise.allSettled([0, 1].map(() => Promise.resolve().then(() => store.exchange(code, 'peer'))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const grant = results.find(r => r.status === 'fulfilled');
  assert.ok(grant?.status === 'fulfilled');
  assert.equal(grant.value.id, a.id);
  store.save(a.id, a.token, 0, { progress: 'issuer' });
  assert.deepEqual(store.load(a.id, grant.value.token), { save: { progress: 'issuer' }, revision: 1 });
  store.save(a.id, grant.value.token, 1, { progress: 'receiver' });
  assert.throws(() => store.save(a.id, a.token, 1, {}), rejected(409));
  const restarted = new AdStore(file);
  assert.equal(restarted.owner(grant.value.token), a.id);
  assert.equal(restarted.owner(a.token), a.id);
  assert.deepEqual(restarted.load(a.id, a.token), { save: { progress: 'receiver' }, revision: 2 });
  restarted.save(a.id, a.token, 2, { progress: 'issuer continues' });
  assert.deepEqual(restarted.load(a.id, grant.value.token), { save: { progress: 'issuer continues' }, revision: 3 });
  assert.throws(() => restarted.exchange(code, 'peer'), rejected(400));
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(!raw.includes(code) && !raw.includes(grant.value.token) && !raw.includes(a.token));
});

test('expired, invalid, replaced codes and repeated attempts are rejected', t => {
  const { store, advance } = fixture(t);
  const a = store.create();
  const first = store.issue(a.id, a.token);
  const second = store.issue(a.id, a.token);
  assert.throws(() => store.exchange(first.code, 'peer'), rejected(400));
  advance();
  assert.throws(() => store.exchange(second.code, 'peer'), rejected(400));
  for (let i = 0; i < 20; i++) assert.throws(() => store.exchange('invalid', 'brute'), rejected(400));
  assert.throws(() => store.exchange('invalid', 'brute'), rejected(429));
});

test('failed persistence issues no grant and does not consume the code', t => {
  const { store, file } = fixture(t);
  const a = store.create();
  const { code } = store.issue(a.id, a.token);
  const rename = t.mock.method(fs, 'renameSync', () => { throw new Error('disk failure'); });
  assert.throws(() => store.exchange(code, 'peer'), /disk failure/);
  rename.mock.restore();
  const restarted = new AdStore(file, () => 2_000);
  const grant = restarted.exchange(code, 'peer');
  assert.equal(restarted.owner(grant.token), a.id);
  assert.throws(() => restarted.exchange(code, 'peer'), rejected(400));
});

test('public leaderboard hides identifiers and preserves the existing score order', t => {
  const { store } = fixture(t);
  const a = store.create(), b = store.create();
  store.submit(a.token, { playerId: a.id, name: 'A', antimatterLog10: 10, infinities: 100, playTimeSec: 1 });
  store.submit(b.token, { playerId: b.id, name: 'B', antimatterLog10: 20, infinities: 1, playTimeSec: 1 });
  const rows = store.leaderboard(a.token);
  assert.deepEqual(rows.map(r => r.name), ['B', 'A']);
  assert.equal(rows[1].self, true);
  const publicText = JSON.stringify(store.leaderboard(''));
  for (const secret of [a.id, a.token, b.id, b.token, 'playerId', 'self']) assert.ok(!publicText.includes(secret));
});
