import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createNewGame, serialize, bigFromLog10 } from './engine.mjs';
import { compareProgress } from './sync.mjs';
import { createAdSlice, type AdSlice } from './slice.ts';
import { buildExportBundle, createProfile, getActiveProfile, importBundleInto, listProfiles, listRecoveryRecords, retainSyncSources, parseImportBundle, readConnection, readSaveRaw, switchProfile, writeConnection, writeSave, type StorageLike } from './user.mjs';
import { linkTonariumProfile } from './link.ts';
import { subscribeAdFeedback } from './feedback.ts';

function storage() {
  const values = new Map<string, string>();
  return Object.assign({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  }, { values });
}
function harness(t: TestContext, data: StorageLike) {
  const timers = new Map<number, { callback: () => void; ms: number }>();
  let next = 0;
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    setInterval: (callback: () => void, ms: number) => { timers.set(++next, { callback, ms }); return next; },
  } });
  t.mock.method(globalThis, 'clearInterval', (id: Parameters<typeof clearInterval>[0]) => { timers.delete(Number(id)); });
  let state: AdSlice;
  state = createAdSlice(partial => Object.assign(state, partial), () => state);
  t.after(() => {
    state.adStop();
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  return { state, timers, start: () => state.adStart({ storage: data }), fire: (ms: number) => {
    for (const value of timers.values()) if (value.ms === ms) value.callback();
  } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function api(t: TestContext) {
  let remote: ReturnType<typeof createNewGame> | null = null;
  let revision = 0, writes = 0, submissions = 0, reads = 0;
  const implementation: typeof fetch = async (url, options) => {
    const route = String(url);
    if (route.endsWith('/api/ad/create')) return response({ id: 'destination', token: 'capability' });
    if (route.endsWith('/api/ad/exchange')) return response({ id: 'transferred', token: 'new-capability' });
    if (route.includes('/api/save/')) {
      assert.ok(new Headers(options?.headers).get('Authorization')?.startsWith('Bearer '));
      if (options?.method === 'POST') {
        const body = JSON.parse(String(options.body));
        writes++;
        if (body.revision !== revision) return response({}, 409);
        remote = body.save;
        return response({ revision: ++revision });
      }
      reads++;
      return response({ save: remote, revision });
    }
    if (options?.method === 'POST') { submissions++; return response({}); }
    return response({ entries: [{ name: 'Public', antimatterLog10: 10, infinities: 0, playTimeSec: 1 }] });
  };
  const mock = t.mock.method(globalThis, 'fetch', implementation);
  return { mock, implementation, replace: (save: ReturnType<typeof createNewGame>) => { remote = save; revision++; },
    stats: () => ({ writes, submissions, reads }) };
}

test('smaller imports and recovery imports require a choice and preserve every source across restart and comparison', async t => {
  const data = storage();
  const profile = createProfile(data, 'Player');
  const original = createNewGame(); original.infinities = 5;
  writeSave(data, profile.id, serialize(original));
  const server = api(t);
  const remote = createNewGame(); remote.infinities = 10;
  server.replace(remote);
  const { state, start, fire } = harness(t, data);
  start(); await setImmediate();
  const firstKey = state.adRecoveryKey!;
  const recovery = state.adExportRecovery('local', firstKey)!;
  const imported = createNewGame(); imported.infinities = 1;
  state.adImport(buildExportBundle(profile, JSON.parse(serialize(imported))));
  await setImmediate();
  assert.equal(state.adSync, 'choice');
  assert.equal(state.adGame!.infinities, 1);
  fire(100); fire(1000); fire(30000); await setImmediate();
  assert.equal(server.stats().writes, 0);
  assert.equal(state.adGame!.infinities, 1);
  assert.deepEqual(state.adExportRecovery('remote')!.save, remote);
  assert.ok(state.adListRecovery().some(record => state.adExportRecovery('local', record.key)?.save.infinities === 10));
  state.adStop(); start(); await setImmediate();
  assert.equal(state.adSync, 'choice');
  state.adChooseSave('local');
  assert.equal(await state.adSaveServer(), true);
  assert.equal(state.adGame!.infinities, 1);
  assert.equal(data.getItem('ad:v3:importPending:' + profile.id), null);
  server.replace(remote);
  await state.adLoadServer();
  assert.equal(state.adGame!.infinities, 10);
  assert.deepEqual(state.adExportRecovery('local', firstKey)!.save, recovery.save);
  state.adImport(recovery); await setImmediate();
  assert.equal(state.adSync, 'choice');
  state.adChooseSave('local');
  assert.equal(state.adGame!.infinities, 5);
  assert.equal(await state.adSaveServer(), true);
  state.adStop(); start(); await setImmediate();
  assert.ok(state.adListRecovery().some(record => record.key === firstKey));
  assert.deepEqual(state.adExportRecovery('local', firstKey)!.save, recovery.save);
  assert.equal(state.adExportRecovery('local', 'another-profile'), null);
});

test('import intent survives failed reads and revision conflicts until the selected save is persisted', async t => {
  const data = storage();
  const server = api(t);
  const { state, start, fire } = harness(t, data);
  start(); await setImmediate();
  const imported = createNewGame(); imported.infinities = 2;
  const remote = createNewGame(); remote.infinities = 20;
  server.replace(remote);
  server.mock.mock.mockImplementation(async () => { throw new Error('offline'); });
  state.adImport(buildExportBundle(state.adProfile!, JSON.parse(serialize(imported))));
  await setImmediate();
  assert.equal(state.adSync, 'error');
  assert.equal(state.adGame!.infinities, 2);
  server.mock.mock.mockImplementation(server.implementation);
  fire(30000); await setImmediate();
  assert.equal(state.adSync, 'choice');
  state.adChooseSave('local');
  remote.infinities = 30;
  server.replace(remote);
  assert.equal(await state.adSaveServer(), false);
  assert.equal(state.adSync, 'choice');
  assert.equal(state.adGame!.infinities, 2);
  state.adChooseSave('remote');
  assert.equal(state.adGame!.infinities, 30);
  assert.equal(await state.adSaveServer(), true);
  assert.equal(data.getItem('ad:v3:importPending:' + state.adProfile!.id), null);
});

test('legacy recovery records are discovered and indexed without duplicating keys or mixing profiles', () => {
  const data = storage();
  const enumerable = Object.assign(data, {
    key: (index: number) => [...data.values.keys()][index] ?? null,
  });
  Object.defineProperty(enumerable, 'length', { get: () => data.values.size });
  data.setItem('ad:v3:recovery:a:old', JSON.stringify({ local: { old: true }, remote: null }));
  data.setItem('ad:v3:recovery:a:latest', JSON.stringify({ local: {}, remote: {} }));
  data.setItem('ad:v3:recovery:b:other', '{}');
  data.setItem('ad:v3:lastRecovery:a', 'ad:v3:recovery:a:latest');
  const key = retainSyncSources(enumerable, 'a', {}, {});
  const records = listRecoveryRecords(enumerable, 'a');
  assert.equal(records[0].key, key);
  assert.equal(records.length, 3);
  assert.equal(new Set(records.map(record => record.key)).size, 3);
  assert.ok(records.some(record => record.key.endsWith(':old')));
});

test('progress comparison prioritizes infinities, then the full precision total; equality stays equal', () => {
  const a = createNewGame(), b = createNewGame();
  a.infinities = 1; b.totalAntimatter = bigFromLog10(10000);
  assert.equal(compareProgress(a, b), 1);
  b.infinities = 1;
  assert.equal(compareProgress(a, b), -1);
  a.totalAntimatter = b.totalAntimatter;
  assert.equal(compareProgress(a, b), 0);
});

test('legacy profiles, per-profile saves, active selection and Tonarium links are retained', async t => {
  const data = storage();
  const a = createProfile(data, 'Guest A'), b = createProfile(data, 'Guest B');
  const original = serialize(createNewGame());
  writeSave(data, a.id, original); writeSave(data, b.id, original);
  switchProfile(data, a.id);
  assert.equal(linkTonariumProfile(data, 'tonarium', 'Name').id, a.id);
  api(t);
  const { state, start } = harness(t, data);
  start(); await setImmediate();
  assert.equal(state.adProfile?.id, a.id);
  assert.deepEqual(listProfiles(data).map(p => p.id), [a.id, b.id]);
  assert.equal(readSaveRaw(data, b.id), original);
  assert.equal(readConnection(data, a.id)?.id, 'destination');
  assert.notEqual(readConnection(data, a.id)?.id, a.id);
  assert.equal(JSON.parse(data.getItem(state.adRecoveryKey!)!).local.infinities, 0);
  state.adSwitchProfile(b.id); await setImmediate();
  assert.equal(state.adProfile?.id, b.id);
});

test('initial load freezes tick, offline progress and autosaves until comparison, preserving both complete sources', async t => {
  const data = storage(), profile = createProfile(data, 'Guest');
  const local = createNewGame(1000), remote = createNewGame(2000);
  local.galaxies = 77; remote.infinities = 1; remote.galaxies = 2;
  const original = serialize(local);
  writeSave(data, profile.id, original);
  writeConnection(data, profile.id, { id: 'owned', token: 'grant' });
  const load = deferred<Response>();
  let posts = 0;
  const fetchMock: typeof fetch = async (url, options) => {
    if (String(url).includes('/api/save/')) { if (options?.method === 'POST') posts++; return load.promise; }
    return response({ entries: [] });
  };
  t.mock.method(globalThis, 'fetch', fetchMock);
  const { state, start, fire } = harness(t, data);
  start(); fire(100); fire(1000); fire(30000);
  assert.equal(state.adSync, 'loading');
  assert.equal(state.adGame!.lastTick, 1000);
  assert.equal(state.adBuyDimension(1), false);
  assert.equal(readSaveRaw(data, profile.id), original);
  assert.equal(posts, 0);
  load.resolve(response({ save: remote, revision: 5 })); await setImmediate();
  assert.equal(state.adSync, 'ready');
  assert.equal(state.adGame!.galaxies, 2);
  const backup = JSON.parse(data.getItem(state.adRecoveryKey!)!);
  assert.deepEqual(backup, { local, remote });
  assert.deepEqual(state.adExportRecovery('local')!.save, local);
  assert.deepEqual(state.adExportRecovery('remote')!.save, remote);
});

test('equal progress requires an explicit whole-save choice and pauses local persistence', async t => {
  const data = storage(), profile = createProfile(data, 'A');
  const local = createNewGame(), remote = createNewGame();
  local.galaxies = 7; remote.galaxies = 8;
  writeSave(data, profile.id, serialize(local));
  const server = api(t); server.replace(remote);
  const { state, start, fire } = harness(t, data);
  start(); await setImmediate();
  assert.equal(state.adSync, 'choice');
  fire(100); fire(1000); fire(30000); await setImmediate();
  assert.equal(server.stats().writes, 0);
  assert.equal(state.adSaveLocal(), false);
  state.adChooseSave('remote');
  assert.equal(state.adSync, 'ready'); assert.equal(state.adGame!.galaxies, 8);
  assert.ok(await state.adSaveServer());
});

test('CAS conflict returns to comparison, failed loads never enable writes, and retry resolves first', async t => {
  const data = storage();
  const server = api(t);
  const { state, start, fire } = harness(t, data);
  start(); await setImmediate();
  const progressed = createNewGame(); progressed.infinities = 10;
  server.replace(progressed);
  assert.equal(await state.adSaveServer(), false);
  assert.equal(state.adGame!.infinities, 10);
  assert.equal(state.adSync, 'ready');
  server.mock.mock.mockImplementation(async () => { throw new Error('offline'); });
  assert.equal(await state.adLoadServer(), false);
  const writes = server.stats().writes;
  fire(1000); fire(30000); await setImmediate();
  assert.equal(server.stats().writes, writes);
  assert.equal(state.adSync, 'error');
  assert.equal(JSON.parse(readSaveRaw(data, state.adProfile!.id)!).infinities, 10);
  server.mock.mock.mockImplementation(server.implementation);
  fire(30000); await setImmediate();
  assert.equal(state.adSync, 'choice');
  assert.equal(server.stats().writes, writes);
});

test('late load after profile switch or stop cannot replace the active game', async t => {
  const data = storage(), a = createProfile(data, 'A'), b = createProfile(data, 'B');
  switchProfile(data, a.id);
  writeConnection(data, a.id, { id: 'a', token: 'grant-a' });
  writeConnection(data, b.id, { id: 'b', token: 'grant-b' });
  const delayed = deferred<Response>();
  const fetchMock: typeof fetch = async (url) => String(url).endsWith('/save/a') ? delayed.promise : response({ save: null, revision: 0 });
  t.mock.method(globalThis, 'fetch', fetchMock);
  const { state, start } = harness(t, data);
  start(); state.adSwitchProfile(b.id); await setImmediate();
  const remote = createNewGame(); remote.infinities = 100;
  delayed.resolve(response({ save: remote, revision: 9 })); await setImmediate();
  assert.equal(state.adProfile!.id, b.id); assert.equal(state.adGame!.infinities, 0);
  const pending = deferred<Response>();
  const pendingFetch: typeof fetch = async () => pending.promise;
  t.mock.method(globalThis, 'fetch', pendingFetch);
  const loading = state.adLoadServer();
  state.adStop();
  pending.resolve(response({ save: remote, revision: 9 })); await loading;
  assert.equal(state.adSync, 'disconnected'); assert.equal(state.adGame!.infinities, 0);
});

test('authorization rejection preserves the save and waits for manual recovery rather than retrying the same grant', async t => {
  const data = storage(), profile = createProfile(data, 'Guest');
  const game = createNewGame(); game.infinities = 12;
  writeSave(data, profile.id, serialize(game));
  writeConnection(data, profile.id, { id: 'owned', token: 'invalid' });
  let loads = 0;
  const fetchMock: typeof fetch = async url => {
    if (String(url).includes('/save/')) { loads++; return response({}, 403); }
    return response({ entries: [] });
  };
  t.mock.method(globalThis, 'fetch', fetchMock);
  const { state, start, fire } = harness(t, data);
  start(); await setImmediate();
  assert.equal(state.adSync, 'error');
  fire(30000); await setImmediate();
  assert.equal(loads, 1);
  assert.equal(JSON.parse(readSaveRaw(data, profile.id)!).infinities, 12);
  await state.adLoadServer();
  assert.equal(loads, 2);
});

test('transfer creates a separate local profile without merging guests, and binding never reverts it', async t => {
  const data = storage(), guest = createProfile(data, 'Guest');
  const game = createNewGame(); game.infinities = 50;
  writeSave(data, guest.id, serialize(game));
  linkTonariumProfile(data, 'tonarium', 'User');
  api(t);
  const { state, start } = harness(t, data);
  start(); await setImmediate();
  const guestSave = readSaveRaw(data, guest.id);
  await state.adExchangeTransfer('code'); await setImmediate();
  const transferred = state.adProfile!.id;
  assert.notEqual(transferred, guest.id);
  assert.equal(state.adGame!.infinities, 0);
  assert.equal(readSaveRaw(data, guest.id), guestSave);
  assert.equal(readConnection(data, transferred)?.id, 'transferred');
  state.adBindTonarium('tonarium', 'User');
  assert.equal(state.adProfile!.id, transferred);
  state.adStop(); start(); await setImmediate();
  assert.equal(state.adProfile!.id, transferred);
});

test('late save and ranking responses do not leak revisions or entries into the next profile', async t => {
  const data = storage(), a = createProfile(data, 'A'), b = createProfile(data, 'B');
  switchProfile(data, a.id);
  writeConnection(data, a.id, { id: 'a', token: 'grant-a' });
  writeConnection(data, b.id, { id: 'b', token: 'grant-b' });
  const server = api(t);
  const { state, start } = harness(t, data);
  start(); await setImmediate();
  const oldSave = deferred<Response>(), oldRanking = deferred<Response>();
  let delayOld = true;
  let submittedRevision: number | null = null;
  server.mock.mock.mockImplementation(async (url, options) => {
    if (options?.method === 'POST' && String(url).endsWith('/save/a')) return oldSave.promise;
    if (options?.method === 'POST' && String(url).endsWith('/save/b')) {
      submittedRevision = JSON.parse(String(options.body)).revision;
      return response({ revision: 8 });
    }
    if (String(url).endsWith('/leaderboard') && options?.method !== 'POST') {
      if (delayOld) { delayOld = false; return oldRanking.promise; }
      return response({ entries: [] });
    }
    return response({ save: null, revision: 7 });
  });
  const save = state.adSaveServer(), ranking = state.adRefreshLeaderboard();
  state.adSwitchProfile(b.id); await setImmediate();
  oldSave.resolve(response({ revision: 99 }));
  oldRanking.resolve(response({ entries: [{ name: 'Old' }] }));
  await Promise.all([save, ranking]); await setImmediate();
  assert.equal(state.adLastServerSaveAt, null);
  assert.deepEqual(state.adLeaderboard, []);
  assert.equal(await state.adSaveServer(), true);
  assert.equal(submittedRevision, 7);
});

test('failed local persistence stops profile switching and preserves the current game', async t => {
  const data = storage(), a = createProfile(data, 'A'), b = createProfile(data, 'B');
  switchProfile(data, a.id);
  api(t);
  const { state, start } = harness(t, data);
  start(); await setImmediate();
  state.adGame!.infinities = 123;
  t.mock.method(data, 'setItem', () => { throw new Error('quota'); });
  assert.throws(() => state.adSwitchProfile(b.id), /Local save failed/);
  assert.equal(state.adProfile!.id, a.id);
  assert.equal(state.adGame!.infinities, 123);
  assert.equal(getActiveProfile(data)!.id, a.id);
});

test('timers and requests do not duplicate, stop removes timers, ranking read survives submission failure, and automatic work is silent', async t => {
  const data = storage();
  const server = api(t);
  const { state, start, fire, timers } = harness(t, data);
  const events: unknown[] = [];
  t.after(subscribeAdFeedback(event => events.push(event)));
  start(); start(); await setImmediate();
  assert.equal(timers.size, 3);
  const save = deferred<Response>();
  let posts = 0, rankingReads = 0;
  server.mock.mock.mockImplementation(async (url, options) => {
    if (options?.method === 'POST') {
      if (String(url).includes('/save/')) { posts++; return save.promise; }
      throw new Error('score failure');
    }
    rankingReads++; return response({ entries: [] });
  });
  fire(30000); fire(30000); await setImmediate();
  assert.equal(posts, 1); assert.equal(rankingReads, 1);
  save.resolve(response({ revision: 1 })); await setImmediate();
  assert.deepEqual(events, []);
  state.adStop(); assert.equal(timers.size, 0);
  start(); assert.equal(timers.size, 3);
});

test('v3 checksum covers fields, is deterministic across key order and unicode, and rejects mutation before any storage write', () => {
  const data = storage(), profile = createProfile(data, '日本語 한글');
  const game = createNewGame(1000);
  const bundle = buildExportBundle(profile, JSON.parse(serialize(game)), 2000);
  // プロパティ順だけを変え、ネストしたデータは保持する。
  const reverse = Object.fromEntries(Object.entries(bundle).reverse());
  assert.equal(parseImportBundle(reverse).checksum, bundle.checksum);
  assert.equal(buildExportBundle(profile, JSON.parse(serialize(game)), 2000).checksum, bundle.checksum);
  writeSave(data, profile.id, serialize(game));
  const before = [...data.values];
  for (const mutate of [(b: typeof bundle) => { b.save.infinities = 9; }, (b: typeof bundle) => { b.user.name = 'other'; }, (b: typeof bundle) => { b.exportedAt = new Date(3000).toISOString(); }]) {
    const changed = structuredClone(bundle); mutate(changed);
    assert.throws(() => importBundleInto(data, changed), /Checksum/);
    assert.deepEqual([...data.values], before);
  }
  assert.throws(() => importBundleInto(data, { user: bundle.user, save: bundle.save }), /Invalid export/);
  assert.deepEqual([...data.values], before);
});

test('legacy v2 confirmation cannot be bypassed by parsing first; invalid formats and cancellation create no profile', () => {
  const data = storage();
  const bundle = buildExportBundle({ id: 'source', name: 'Source', createdAt: null }, JSON.parse(serialize(createNewGame())), 1000);
  const legacy = { ...bundle, version: 2 }; delete legacy.checksum;
  const parsed = parseImportBundle(legacy);
  assert.equal(parsed.version, 2);
  assert.throws(() => importBundleInto(data, parsed), /confirmation/);
  assert.throws(() => importBundleInto(data, parsed, { confirmLegacy: false }), /confirmation/);
  assert.equal(data.values.size, 0);
  assert.throws(() => importBundleInto(data, { ...legacy, save: {} }, { confirmLegacy: true }), /Invalid AD save/);
  assert.equal(data.values.size, 0);
  importBundleInto(data, parsed, { confirmLegacy: true });
  const active = getActiveProfile(data)!;
  assert.notEqual(active.id, 'source'); assert.equal(readConnection(data, active.id), null);
});
