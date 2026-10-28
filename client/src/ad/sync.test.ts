import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createNewGame, serialize, bigFromLog10 } from './engine.mjs';
import { compareProgress, sameSave } from './sync.mjs';
import { createAdSlice, type AdSlice } from './slice.ts';
import { buildExportBundle, createProfile, getActiveProfile, importBundleInto, listProfiles, listRecoveryRecords, retainSyncSources, parseImportBundle, readConnection, readSaveRaw, switchProfile, writeConnection, writeSave, prepareProgressSelection, readProgressSelection, selectProgress, type StorageLike } from './user.mjs';
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
let testTimerId = 0;
function harness(t: TestContext, data: StorageLike) {
  const timers = new Map<number, { callback: () => void; ms: number }>();
  const previousClear = globalThis.clearInterval;
  t.mock.method(globalThis, 'clearInterval', (id: Parameters<typeof clearInterval>[0]) => {
    if (!timers.delete(Number(id))) previousClear(id);
  });
  let state: AdSlice;
  state = createAdSlice(partial => Object.assign(state, partial), () => state);
  t.after(() => {
    state.adStop();
  });
  return { state, timers, start: () => {
    const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
      setInterval: (callback: () => void, ms: number) => { const id = ++testTimerId; timers.set(id, { callback, ms }); return id; },
    } });
    try { state.adStart({ storage: data }); }
    finally {
      if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  }, fire: (ms: number) => {
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
      return response({ save: remote ?? (route.endsWith('/transferred') ? createNewGame(2000) : null), revision });
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
  assert.equal(state.adMigration, true);
  assert.equal(readConnection(data, a.id), null);
  state.adSelectProgress('profile:' + a.id); await setImmediate();
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
  assert.deepEqual(backup, { local, remote, connection: { id: 'owned', token: 'grant' } });
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
  assert.equal(state.adSync, 'choice');
  state.adChooseSave('remote');
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
  assert.equal(state.adSync, 'ready');
  assert.equal(server.stats().writes, writes);
});

test('late load after profile switch or stop cannot replace the active game', async t => {
  const data = storage(), a = createProfile(data, 'A'), b = createProfile(data, 'B');
  switchProfile(data, a.id);
  selectProgress(data, a.id);
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
  selectProgress(data, a.id);
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
  selectProgress(data, a.id);
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

test('manual and automatic score bodies capture the current Boost count, including reset to zero', async t => {
  const data = storage();
  const server = api(t);
  const { state, start, fire } = harness(t, data);
  start(); await setImmediate();
  const bodies: Record<string, unknown>[] = [];
  server.mock.mock.mockImplementation(async (url, options) => {
    if (String(url).endsWith('/leaderboard') && options?.method === 'POST') bodies.push(JSON.parse(String(options.body)));
    return server.implementation(url, options);
  });
  state.adGame!.dimensionalBoosts = 23;
  const manual = state.adSubmitScore();
  state.adGame!.dimensionalBoosts = 24;
  assert.equal(await manual, true);
  assert.equal(bodies[0].dimensionalBoosts, 23);
  state.adGame!.dimensionalBoosts = 0;
  fire(30000); await setImmediate();
  assert.deepEqual(bodies.map(body => body.dimensionalBoosts), [23, 0]);
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
    if (String(url).includes('/save/')) return response({ save: null, revision: 0 });
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

function paired(t: TestContext) {
  t.mock.method(Date, 'now', () => 10_000);
  const seed = createNewGame();
  let save = JSON.parse(serialize(seed));
  let revision = 1, writes = 0, reads = 0;
  const grants = new Set(['grant-a', 'grant-b']);
  let code: string | null = null;
  const implementation: typeof fetch = async (url, options) => {
    const path = String(url);
    const grant = new Headers(options?.headers).get('Authorization')?.replace(/^Bearer /, '');
    if (path.endsWith('/api/ad/exchange')) {
      const input = JSON.parse(String(options?.body)).code;
      if (!code || input !== code) return response({}, 400);
      code = null; grants.add('grant-c');
      return response({ id: 'shared', token: 'grant-c' });
    }
    if (path.includes('/save/') || path.endsWith('/ad/transfer')) {
      if (!grant || !grants.has(grant)) return response({}, 403);
      if (path.endsWith('/ad/transfer')) { code = 'single-use'; return response({ code, expiresAt: 610_000 }); }
      if (!path.endsWith('/save/shared')) return response({}, 403);
      if (options?.method === 'POST') {
        const body = JSON.parse(String(options.body));
        if (body.revision !== revision) return response({}, 409);
        save = structuredClone(body.save); writes++;
        return response({ revision: ++revision });
      }
      reads++;
      return response({ save, revision });
    }
    return response({ entries: [] });
  };
  const mock = t.mock.method(globalThis, 'fetch', implementation);
  const device = (name: string, token: string) => {
    const data = storage(), profile = createProfile(data, name);
    writeSave(data, profile.id, serialize(seed));
    writeConnection(data, profile.id, { id: 'shared', token });
    return { ...harness(t, data), data, profile };
  };
  return {
    a: device('A', 'grant-a'), b: device('B', 'grant-b'), mock, implementation,
    remote: () => structuredClone(save), stats: () => ({ writes, reads, revision }),
    replace: (next: ReturnType<typeof createNewGame>) => { save = JSON.parse(serialize(next)); revision++; },
  };
}

test('independent devices alternate automatic updates and resume after restart without manual load or save', async t => {
  const { a, b, remote, stats } = paired(t);
  a.start(); b.start(); await setImmediate();
  assert.notEqual(a.data, b.data);
  assert.equal(a.timers.size, 3); assert.equal(b.timers.size, 3);
  const idleWrites = stats().writes;
  a.fire(100); b.fire(100);
  a.fire(30000); b.fire(30000); await setImmediate();
  assert.equal(a.state.adSync, 'ready'); assert.equal(b.state.adSync, 'ready');
  assert.equal(stats().writes, idleWrites);
  a.state.adGame!.infinities = 1;
  a.fire(30000); await setImmediate();
  b.fire(30000); await setImmediate();
  assert.equal(remote().infinities, 1);
  assert.equal(b.state.adGame!.infinities, 1);
  b.state.adGame!.galaxies = 2;
  b.fire(30000); await setImmediate();
  a.fire(30000); await setImmediate();
  assert.equal(a.state.adGame!.galaxies, 2);
  b.state.adStop(); b.start(); await setImmediate();
  a.state.adGame!.infinities = 3;
  a.fire(30000); await setImmediate();
  b.fire(30000); await setImmediate();
  assert.equal(b.state.adGame!.infinities, 3);
  assert.equal(b.state.adMigration, false);
});

test('idle periodic synchronization preserves the clock before a purchase and restart', async t => {
  let now = 10_000;
  const { a, stats } = paired(t);
  t.mock.method(Date, 'now', () => now);
  a.start(); await setImmediate();
  const game = a.state.adGame;
  const writes = stats().writes;
  for (let period = 0; period < 3; period++) {
    for (let tick = 0; tick < 300; tick++) { now += 100; a.fire(100); }
    a.fire(1000); a.fire(30000); await setImmediate();
    assert.equal(a.state.adGame, game);
    assert.equal(a.state.adGame!.lastTick, now);
  }
  assert.equal(stats().writes, writes);
  assert.equal(a.state.adBuyDimension(1), true);
  a.state.adStop();
  now += 1000;
  a.start(); await setImmediate();
  assert.equal(a.state.adSync, 'ready');
  assert.equal(a.state.adOffline!.elapsedMs, 1000);
  assert.equal(a.state.adGame!.dimensions[0].bought, 1);
});

for (const failedWrite of ['save', 'baseline']) {
test(`failed adoption ${failedWrite} writes preserve the old baseline and cannot roll back the remote after restart`, async t => {
  const { a, b, remote, stats } = paired(t);
  a.start(); b.start(); await setImmediate();
  a.state.adGame!.infinities = 7;
  a.fire(30000); await setImmediate();
  const baselineKey = 'ad:v4:baseline:' + b.profile.id;
  const oldBaseline = b.data.getItem(baselineKey);
  const oldSave = readSaveRaw(b.data, b.profile.id);
  const saveKey = [...b.data.values.keys()].find(key => b.data.getItem(key) === oldSave)!;
  const setItem = b.data.setItem;
  const written: string[] = [];
  const failure = t.mock.method(b.data, 'setItem', (key: string, value: string) => {
    if (key === (failedWrite === 'save' ? saveKey : baselineKey)) throw new Error('storage unavailable');
    setItem(key, value);
    written.push(key);
  });
  b.fire(30000); await setImmediate();
  assert.equal(b.state.adSync, 'error');
  assert.equal(b.state.adGame!.infinities, 0);
  assert.equal(b.data.getItem(baselineKey), oldBaseline);
  assert.ok(written.some(key => key.startsWith('ad:v3:recovery:')));
  assert.equal(readSaveRaw(b.data, b.profile.id), oldSave);
  b.state.adStop();
  failure.mock.restore();
  const writes = stats().writes;
  b.start(); await setImmediate();
  b.fire(30000); await setImmediate();
  assert.equal(b.state.adSync, 'ready');
  assert.equal(b.state.adGame!.infinities, 7);
  assert.equal(remote().infinities, 7);
  assert.equal(stats().writes, writes);
});
}

test('simultaneous updates retain both whole saves, survive restart and resume automatically after selection', async t => {
  const { a, b, remote } = paired(t);
  a.start(); b.start(); await setImmediate();
  a.state.adGame!.galaxies = 4;
  b.state.adGame!.galaxies = 8;
  a.fire(30000); await setImmediate();
  b.fire(30000); await setImmediate();
  assert.equal(b.state.adSync, 'choice');
  assert.equal(b.state.adExportRecovery('local')!.save.galaxies, 8);
  assert.equal(b.state.adExportRecovery('remote')!.save.galaxies, 4);
  b.state.adStop(); b.start(); await setImmediate();
  assert.equal(b.state.adSync, 'choice');
  b.state.adChooseSave('local'); b.fire(30000); await setImmediate();
  assert.equal(remote().galaxies, 8);
  a.fire(30000); await setImmediate();
  assert.equal(a.state.adGame!.galaxies, 8);
});

test('identical full content continues silently even when both devices changed; equal metrics with other differences conflict', async t => {
  const { a, b } = paired(t);
  a.start(); b.start(); await setImmediate();
  a.state.adGame!.galaxies = b.state.adGame!.galaxies = 3;
  a.fire(30000); await setImmediate();
  b.fire(30000); await setImmediate();
  assert.equal(b.state.adSync, 'ready');
  assert.ok(sameSave(a.state.adGame, b.state.adGame));
  a.state.adGame!.galaxies = 4; b.state.adGame!.galaxies = 5;
  assert.equal(compareProgress(a.state.adGame, b.state.adGame), 0);
  a.fire(30000); await setImmediate();
  b.fire(30000); await setImmediate();
  assert.equal(b.state.adSync, 'choice');
});

test('actions during fetch and save are preserved, periodic requests serialize, and a 409 rechecks both sources', async t => {
  const server = paired(t), { a } = server;
  a.start(); await setImmediate();
  const load = deferred<Response>();
  server.mock.mock.mockImplementation(async (url, options) => String(url).includes('/save/') && options?.method !== 'POST' ? load.promise : server.implementation(url, options));
  a.fire(30000); a.fire(30000);
  assert.equal(a.state.adBuyDimension(1), true);
  a.state.adGame!.galaxies = 9;
  const other = createNewGame(); other.galaxies = 7;
  server.replace(other);
  load.resolve(response({ save: other, revision: server.stats().revision })); await setImmediate();
  assert.equal(a.state.adSync, 'choice');
  assert.equal(a.state.adExportRecovery('local')!.save.galaxies, 9);
  assert.equal((a.state.adExportRecovery('local')!.save.dimensions as { bought: number }[])[0].bought, 1);
  a.state.adChooseSave('local');
  const saving = deferred<Response>();
  server.mock.mock.mockImplementation(async (url, options) => options?.method === 'POST' && String(url).includes('/save/') ? saving.promise : server.implementation(url, options));
  a.fire(30000); await setImmediate();
  a.state.adGame!.galaxies = 11;
  // 409 は別端末の更新による競合として再現し、前の選択と同じ remote を返さない。
  const changedRemote = createNewGame(); changedRemote.galaxies = 10;
  server.replace(changedRemote);
  saving.resolve(response({}, 409)); await setImmediate();
  assert.equal(a.state.adSync, 'choice');
  assert.equal(a.state.adExportRecovery('local')!.save.galaxies, 11);
  server.mock.mock.mockImplementation(server.implementation);
  a.state.adChooseSave('local'); a.fire(30000); await setImmediate();
  assert.equal(server.remote().galaxies, 11);
});

test('successful save acknowledges only its submitted snapshot, leaving later operations for the next automatic round', async t => {
  const server = paired(t), { a, b } = server;
  a.start(); b.start(); await setImmediate();
  const gate = deferred<void>();
  server.mock.mock.mockImplementation(async (url, options) => {
    if (options?.method === 'POST' && String(url).includes('/save/')) await gate.promise;
    return server.implementation(url, options);
  });
  a.state.adGame!.galaxies = 2; a.fire(30000); await setImmediate();
  a.state.adGame!.galaxies = 3; a.fire(30000);
  gate.resolve(); await setImmediate();
  assert.equal(server.remote().galaxies, 2);
  assert.equal(a.state.adGame!.galaxies, 3);
  server.mock.mock.mockImplementation(server.implementation);
  a.fire(30000); await setImmediate(); b.fire(30000); await setImmediate();
  assert.equal(b.state.adGame!.galaxies, 3);
});

for (const status of [0, 429, 500]) {
  test(`automatic synchronization resumes after ${status || 'network/timeout'} failure without losing unsynced operations`, async t => {
    const server = paired(t), { a, b } = server;
    a.start(); b.start(); await setImmediate();
    a.state.adGame!.galaxies = 12;
    server.mock.mock.mockImplementation(async () => { if (!status) throw new DOMException('Timeout', 'TimeoutError'); return response({}, status); });
    a.fire(30000); await setImmediate();
    assert.equal(a.state.adSync, 'error');
    a.state.adGame!.galaxies = 13; a.fire(1000);
    a.state.adStop(); a.start(); await setImmediate();
    assert.equal(a.state.adGame!.galaxies, 13);
    server.mock.mock.mockImplementation(server.implementation);
    a.fire(30000); await setImmediate(); a.fire(30000); await setImmediate();
    b.fire(30000); await setImmediate();
    assert.equal(b.state.adGame!.galaxies, 13);
    assert.equal(a.state.adSync, 'ready');
  });
}

test('code connection adopts destination even with an existing stronger local candidate; issuer remains connected', async t => {
  const server = paired(t), { a, b } = server;
  a.start(); b.start(); await setImmediate();
  a.state.adGame!.infinities = 2;
  b.state.adGame!.infinities = 100;
  const { code } = await a.state.adIssueTransfer();
  const oldId = b.profile.id;
  await b.state.adExchangeTransfer(code); await setImmediate();
  assert.equal(b.state.adGame!.infinities, 2);
  assert.equal(b.state.adSync, 'ready');
  assert.equal(JSON.parse(readSaveRaw(b.data, oldId)!).infinities, 100);
  assert.equal(readConnection(b.data, oldId)?.token, 'grant-b');
  assert.equal(readConnection(a.data, a.profile.id)?.token, 'grant-a');
  a.state.adGame!.infinities = 3; a.fire(30000); await setImmediate();
  b.fire(30000); await setImmediate();
  assert.equal(b.state.adGame!.infinities, 3);
  assert.ok(b.state.adExportProgress('profile:' + oldId));
  b.state.adRestoreProgress('profile:' + oldId); await setImmediate();
  assert.equal(b.state.adGame!.infinities, 100);
  assert.equal(b.state.adSync, 'choice');
  assert.ok(b.state.adProgressSources().some(source => source.save.infinities === 3));
  assert.ok(!JSON.stringify(b.state.adExportProgress('profile:' + oldId)).includes('grant-b'));
});

test('destination adoption intent survives failed reads, stop and restart', async t => {
  const server = paired(t), { a, b } = server;
  a.start(); b.start(); await setImmediate();
  a.state.adGame!.infinities = 2;
  const { code } = await a.state.adIssueTransfer();
  b.state.adGame!.infinities = 100;
  server.mock.mock.mockImplementation(async (url, options) => {
    if (String(url).includes('/save/') && options?.method !== 'POST') throw new Error('offline');
    return server.implementation(url, options);
  });
  await b.state.adExchangeTransfer(code); await setImmediate();
  assert.equal(b.state.adSync, 'error');
  assert.equal(readConnection(b.data, b.state.adProfile!.id)?.adoptRemote, true);
  b.state.adStop(); b.start(); await setImmediate();
  server.mock.mock.mockImplementation(server.implementation);
  b.fire(30000); await setImmediate();
  assert.equal(b.state.adSync, 'ready');
  assert.equal(b.state.adGame!.infinities, 2);
  assert.equal(server.remote().infinities, 2);
});

test('code connection resumes a partially persisted selection after restart without consuming the code again', async t => {
  const server = paired(t), { a, b } = server;
  a.start(); b.start(); await setImmediate();
  a.state.adGame!.infinities = 5;
  const { code } = await a.state.adIssueTransfer();
  b.state.adGame!.infinities = 99;
  const setItem = b.data.setItem;
  const failure = t.mock.method(b.data, 'setItem', (key: string, value: string) => {
    if (key === 'ad:v4:selection') throw new Error('quota');
    setItem(key, value);
  });
  await assert.rejects(b.state.adExchangeTransfer(code), /quota/);
  assert.ok(b.data.getItem('ad:v4:pendingConnection'));
  assert.equal(b.state.adGame!.infinities, 99);
  failure.mock.restore();
  b.state.adStop(); b.start(); await setImmediate();
  assert.equal(b.state.adGame!.infinities, 5);
  assert.equal(b.state.adSync, 'ready');
  assert.equal(b.data.getItem('ad:v4:pendingConnection'), null);
  assert.equal(JSON.parse(readSaveRaw(b.data, b.profile.id)!).infinities, 99);
});

test('backup failure aborts remote adoption and writes; recovery safely handles missing sides', async t => {
  const server = paired(t), { a } = server;
  a.start(); await setImmediate();
  const other = createNewGame(); other.infinities = 10; server.replace(other);
  const originalSet = a.data.setItem;
  const failure = t.mock.method(a.data, 'setItem', (key: string, value: string) => {
    if (key.startsWith('ad:v3:recovery:')) throw new Error('quota');
    originalSet(key, value);
  });
  a.fire(30000); await setImmediate();
  assert.equal(a.state.adGame!.infinities, 0);
  assert.equal(a.state.adSync, 'error');
  assert.equal(server.stats().writes, 0);
  failure.mock.restore();
  a.fire(30000); await setImmediate();
  assert.equal(a.state.adGame!.infinities, 10);
  const key = retainSyncSources(a.data, a.profile.id, null, null);
  assert.equal(a.state.adExportRecovery('local', key), null);
  assert.equal(a.state.adExportRecovery('remote', key), null);
});

test('migration handles zero, one and multiple candidates, stays offline before confirmation and keeps legacy storage', async t => {
  const empty = storage();
  assert.equal(prepareProgressSelection(empty).confirmed, true);
  assert.equal(listProfiles(empty).length, 1);
  assert.equal(prepareProgressSelection(empty).confirmed, true);
  const data = storage();
  const a = createProfile(data, 'A'), b = createProfile(data, 'B');
  writeSave(data, a.id, serialize(createNewGame(1000)));
  assert.equal(prepareProgressSelection(data).profileId, a.id);
  data.removeItem('ad:v4:selection');
  writeSave(data, b.id, serialize(createNewGame(2000)));
  switchProfile(data, b.id);
  const previous = [...data.values];
  const server = api(t), device = harness(t, data);
  device.start(); await setImmediate();
  assert.equal(device.state.adMigration, true);
  assert.equal(device.state.adProfile!.id, b.id);
  device.fire(100); device.fire(1000); device.fire(30000); await setImmediate();
  assert.deepEqual(server.stats(), { reads: 0, writes: 0, submissions: 0 });
  for (const [key, value] of previous) assert.equal(data.getItem(key), value);
  const failure = t.mock.method(data, 'setItem', () => { throw new Error('quota'); });
  assert.throws(() => device.state.adSelectProgress('profile:' + a.id), /quota/);
  assert.equal(device.state.adMigration, true);
  failure.mock.restore();
  device.state.adSelectProgress('profile:' + a.id); await setImmediate();
  device.state.adStop(); device.start(); await setImmediate();
  assert.equal(device.state.adMigration, false);
  assert.equal(device.state.adProfile!.id, a.id);
  device.state.adBindTonarium('another-user', 'Name');
  assert.equal(device.state.adProfile!.id, a.id);
  assert.equal(readProgressSelection(data)!.profileId, a.id);
});

test('guest migration resumes after interrupted persistence without deleting its source or creating duplicate candidates', () => {
  const data = storage(), original = serialize(createNewGame(1000));
  data.setItem('ad-save-v1', original);
  const setItem = data.setItem;
  let fail = true;
  data.setItem = (key, value) => { if (fail && key === 'ad:v2:profiles') throw new Error('quota'); setItem(key, value); };
  assert.throws(() => prepareProgressSelection(data), /quota/);
  fail = false;
  const selection = prepareProgressSelection(data);
  assert.equal(selection.confirmed, true);
  assert.equal(readSaveRaw(data, selection.profileId), original);
  assert.equal(data.getItem('ad-save-v1'), original);
  assert.equal(prepareProgressSelection(data).profileId, selection.profileId);
  assert.equal(listProfiles(data).length, 1);
});

test('restoring invalidates an older in-flight read and keeps the previous progress and connection recoverable', async t => {
  const server = paired(t), { a } = server;
  a.start(); await setImmediate();
  a.state.adGame!.infinities = 7;
  const late = deferred<Response>();
  let delay = true;
  server.mock.mock.mockImplementation(async (url, options) => {
    if (delay && String(url).includes('/save/') && options?.method !== 'POST') { delay = false; return late.promise; }
    return server.implementation(url, options);
  });
  a.fire(30000);
  a.state.adRestoreProgress('profile:' + a.profile.id); await setImmediate();
  const restoredId = a.state.adProfile!.id;
  const lateGame = createNewGame(); lateGame.infinities = 100;
  late.resolve(response({ save: lateGame, revision: 99 })); await setImmediate();
  assert.equal(a.state.adProfile!.id, restoredId);
  assert.equal(a.state.adGame!.infinities, 0);
  assert.ok(a.state.adProgressSources().some(source => source.save.infinities === 7));
  assert.equal(readConnection(a.data, a.profile.id)?.token, 'grant-a');
});

test('backup and selection persistence failures leave restore, code exchange and conflict choices unchanged', async t => {
  const server = paired(t), { a, b } = server;
  a.start(); b.start(); await setImmediate();
  a.state.adGame!.galaxies = 2; b.state.adGame!.galaxies = 3;
  a.fire(30000); await setImmediate(); b.fire(30000); await setImmediate();
  const setItem = b.data.setItem;
  const failure = t.mock.method(b.data, 'setItem', (key: string, value: string) => {
    if (key.startsWith('ad:v4:resolved:')) throw new Error('quota');
    setItem(key, value);
  });
  assert.throws(() => b.state.adChooseSave('remote'), /quota/);
  assert.equal(b.state.adSync, 'choice');
  assert.equal(b.state.adGame!.galaxies, 3);
  failure.mock.restore();
  b.state.adChooseSave('remote');
  const selected = readProgressSelection(b.data), connection = readConnection(b.data, b.profile.id);
  const noBackup = t.mock.method(b.data, 'setItem', (key: string, value: string) => {
    if (key.startsWith('ad:v3:recovery:')) throw new Error('quota');
    setItem(key, value);
  });
  assert.throws(() => b.state.adRestoreProgress('profile:' + b.profile.id), /quota/);
  await assert.rejects(b.state.adExchangeTransfer('unused'), /quota/);
  assert.deepEqual(readProgressSelection(b.data), selected);
  assert.deepEqual(readConnection(b.data, b.profile.id), connection);
  assert.equal(b.state.adGame!.galaxies, 2);
  noBackup.mock.restore();
});

test('a response from before restart cannot replace the new game or revision', async t => {
  const server = paired(t), { a } = server;
  a.start(); await setImmediate();
  const late = deferred<Response>();
  let delay = true;
  server.mock.mock.mockImplementation(async (url, options) => {
    if (delay && String(url).includes('/save/') && options?.method !== 'POST') { delay = false; return late.promise; }
    return server.implementation(url, options);
  });
  a.fire(30000); a.state.adStop(); a.start(); await setImmediate();
  const obsolete = createNewGame(); obsolete.infinities = 100;
  late.resolve(response({ save: obsolete, revision: 99 })); await setImmediate();
  assert.equal(a.state.adGame!.infinities, 0);
  assert.equal(a.state.adSync, 'ready');
  a.state.adGame!.infinities = 1; a.fire(30000); await setImmediate();
  assert.equal(server.remote().infinities, 1);
  assert.equal(server.stats().revision, 2);
});

test('the API timeout aborts a stalled read and the next automatic attempt reconnects safely', async t => {
  const server = paired(t), { a } = server;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let aborted = false;
  server.mock.mock.mockImplementation(async (url, options) => {
    if (String(url).includes('/save/')) return new Promise<Response>((_, reject) => {
      options?.signal?.addEventListener('abort', () => { aborted = true; reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
    });
    return server.implementation(url, options);
  });
  a.start();
  assert.equal(a.state.adSync, 'loading');
  t.mock.timers.tick(5000); await setImmediate();
  assert.equal(aborted, true);
  assert.equal(a.state.adSync, 'error');
  assert.equal(a.state.adGame!.infinities, 0);
  server.mock.mock.mockImplementation(server.implementation);
  a.fire(30000); await setImmediate();
  assert.equal(a.state.adSync, 'ready');
  assert.equal(server.stats().writes, 0);
});
