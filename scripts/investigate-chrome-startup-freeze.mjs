import fs from 'node:fs';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const reportPath = 'docs/testing/chrome-startup-freeze-investigation.json';
const self = fileURLToPath(import.meta.url);
const NOW = 1800000000000;
const cases = [
  'normal', 'profiles-json', 'profiles-type', 'selection-json', 'pending-type', 'guest-json',
  'save-json', 'save-null', 'save-types', 'save-autobuyers-type', 'save-clock-type', 'baseline-json', 'connection-json', 'recovery-index-type',
  'recovery-json', 'quota-start', 'quota-adopt', 'quota-periodic', 'read-denied', 'safe-probe-denied',
  'profiles-1000', 'recovery-2000', 'save-2mb', 'number-boundary', 'number-subnormal', 'elapsed-8h', 'elapsed-365d',
  'auto-8h', 'huge-no-auto', 'huge-auto', 'network-stop', 'network-timeout', 'watchdog-spin',
  'http-401', 'http-403', 'http-409', 'http-429', 'http-500', 'conflict-save', 'sync-choice',
  'engine-huge-tick', 'engine-huge-autobuy', 'engine-huge-serialize',
];

async function runProcess(id, args, timeoutMs, input, executable = process.execPath) {
  const started = performance.now();
  return await new Promise(resolve => {
    const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true, env: { ...process.env, CHANGELOG_BASE: '29b78f5f6ca0c5e3302b6960ae2e3ffaf5cda88c' } });
    let stdout = '', stderr = '', lastStage = 'spawn', lastObservation = null, timedOut = false;
    child.stdout.on('data', b => { stdout = (stdout + b).slice(-16000); });
    child.stderr.on('data', b => { stderr = (stderr + b).slice(-4000); });
    child.on('message', m => { lastStage = m.stage; lastObservation = m; });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.on('error', error => { stderr += error.message; });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      let result = null;
      if (stdout.trim().startsWith('{')) { try { result = JSON.parse(stdout); } catch {} }
      resolve({ id, kind: id.startsWith('test:') ? 'existing-test' : id.startsWith('engine-') ? 'engine-unit' : 'isolated-unit',
        command: `${JSON.stringify(executable)} ${args.map(a => a.includes(' ') ? JSON.stringify(a) : a).join(' ')}`,
        timeoutMs, exitCode, signal, timedOut, elapsedMs: +(performance.now() - started).toFixed(3),
        input, environment: { node: execFileSync(executable, ['--version'], { encoding: 'utf8', windowsHide: true }).trim(), os: `${os.platform()} ${os.release()} ${os.arch()}`, browser: 'not-run (Node isolated unit only)' },
        lastStage, lastObservation, result, stdout: result ? '' : stdout, stderr });
    });
  });
}

if (process.argv.includes('--native-server-test')) {
  const { registerHooks, stripTypeScriptTypes } = await import('node:module');
  registerHooks({ load(url, context, next) {
    const result = next(url, context);
    if (!url.endsWith('/server/ad-store.ts')) return result;
    return { format: 'module', source: stripTypeScriptTypes(String(result.source), { mode: 'transform', sourceUrl: url }), shortCircuit: true };
  } });
  await import('../server/ad-store.test.ts');
} else if (process.argv.includes('--checks')) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  report.runs = report.runs.filter(r => r.id !== 'test:ad-server-node24' && !r.id.startsWith('test:npm-'));
  const node24 = 'C:/Users/neo/AppData/Local/Volta/tools/image/node/24.17.0/node.exe';
  if (fs.existsSync(node24)) report.runs.push(await runProcess('test:ad-server-node24', ['--experimental-transform-types', '--test', 'server/ad-store.test.ts'], 30000, { fixtures: 'existing temporary-directory fixtures', network: 'none' }, node24));
  const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  for (const name of ['check:completion', 'typecheck', 'build']) report.runs.push(await runProcess(`test:npm-${name}`, [npm, 'run', name], 30000, { CHANGELOG_BASE: report.targetCommit, network: 'no install; local check scripts only' }));
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  for (const run of report.runs.filter(r => r.id === 'test:ad-server-node24' || r.id.startsWith('test:npm-'))) console.log(`${run.id}: ${run.exitCode} ${run.elapsedMs}ms\n${run.stdout.slice(-900)}\n${run.stderr.slice(-900)}`);
} else if (!process.argv.includes('--child')) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const selected = process.argv.includes('--cases') ? process.argv[process.argv.indexOf('--cases') + 1].split(',') : cases;
  if (selected.some(id => !cases.includes(id))) throw new Error('Unknown investigation case');
  report.runs = (report.runs ?? []).filter(r => !selected.includes(r.id) && (!['test:engine', 'test:update-flow-native', 'test:update-recovery-native'].includes(r.id) || process.argv.includes('--cases')));
  for (const id of selected) {
    const input = { seed: 1, fixedTime: NOW, generator: 'worker() in scripts/investigate-chrome-startup-freeze.mjs', case: id,
      profiles: id.startsWith('engine-') || id === 'watchdog-spin' ? 0 : id === 'profiles-1000' ? 1000 : 1, recoveryRecords: id === 'recovery-2000' ? 2000 : id === 'recovery-json' ? 1 : 0,
      extraSaveCharacters: id === 'save-2mb' ? 2000000 : 0, network: 'fully mocked; no real browser/storage/account',
      timers: 'manual interval callbacks; timeout case fires captured API abort callback manually; parent wall-clock watchdog' };
    const run = await runProcess(id, ['--experimental-test-module-mocks', self, '--child', id], id === 'watchdog-spin' ? 750 : ['huge-auto', 'engine-huge-autobuy'].includes(id) ? 2500 : 10000, input);
    report.runs.push(run);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(`${id}: ${run.timedOut ? 'TIMEOUT' : run.exitCode} ${run.elapsedMs}ms ${run.lastStage}`);
  }
  if (process.argv.includes('--cases')) process.exit(0);
  for (const [id, args] of [
    ['test:engine', ['--test', 'client/src/ad/engine-boundaries.test.mjs']],
    ['test:update-flow-native', ['--test', 'client/src/updateFlow.test.ts']],
    ['test:update-recovery-native', ['--experimental-test-module-mocks', '--test', 'client/src/updateRecovery.test.mjs']],
  ]) {
    const run = await runProcess(id, args, 30000, { network: 'reviewed local test; temporary files for ad-store only', seed: 'existing fixtures', fixedTime: 'existing fixtures' });
    report.runs.push(run);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(`${id}: ${run.exitCode} ${run.elapsedMs}ms`);
  }
} else {
  const id = process.argv.at(-1);
  let stage = 'imports';
  const stages = [];
  const mark = (name, extra = {}) => { stage = name; const value = { stage, atMs: +performance.now().toFixed(3), ...extra }; stages.push(value); process.send?.(value); };
  try { await worker(id, mark, stages); }
  catch (error) { console.log(JSON.stringify({ stages, exception: { name: error.name, message: error.message, stack: error.stack }, stoppedAt: stage })); process.exitCode = 1; }
}

async function worker(id, mark, stages) {
  if (id === 'watchdog-spin') { mark('intentional-watchdog-self-check'); for (;;) {} }
  const { mock } = await import('node:test');
  const E = await import('../client/src/ad/engine.mjs');
  const { sameSave, validateSave } = await import('../client/src/ad/sync.mjs');
  if (id.startsWith('engine-')) {
    const game = E.createNewGame(NOW - 28800000);
    game.antimatter = { mantissa: 1, exponent: 10000000 }; game.totalAntimatter = { ...game.antimatter };
    for (const key of ['lowDims', 'highDims', 'tickspeed']) Object.assign(game.autobuyers[key], { unlocked: true, enabled: true, level: 5 });
    validateSave(game);
    const inputStats = { saveCharacters: E.serialize(game).length, elapsedMs: 28800000, exponent: 10000000, level: 5 };
    mark(id, { inputStats }); const started = performance.now();
    if (id === 'engine-huge-tick') E.tick(game, 28800);
    if (id === 'engine-huge-autobuy') E.runAutobuyers(game, 28800);
    if (id === 'engine-huge-serialize') sameSave(E.serialize(game), E.serialize(game));
    mark('complete'); console.log(JSON.stringify({ stages, inputStats, elapsedMs: +(performance.now() - started).toFixed(3), inputValidation: 'accepted' })); return;
  }
  const { createAdSlice } = await import('../client/src/ad/slice.ts');
  const { safeStorage } = await import('../client/src/ad/storage.ts');
  const RealDate = Date;
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [NOW])); } static now() { return NOW; } };
  let uuid = 0;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: () => `synthetic-${++uuid}` } });
  const values = new Map();
  const game = E.createNewGame(NOW);
  if (id.startsWith('elapsed-') || id === 'auto-8h' || id.startsWith('huge-')) game.lastTick -= id === 'elapsed-365d' ? 365 * 86400000 : 8 * 3600000;
  if (id === 'auto-8h' || id === 'huge-auto') for (const ab of Object.values(game.autobuyers)) Object.assign(ab, { unlocked: true, enabled: true, level: 5 });
  if (id === 'huge-auto') for (const key of ['crunch', 'galaxy', 'boost']) game.autobuyers[key].enabled = false;
  if (id.startsWith('huge-')) { game.antimatter = { mantissa: 1, exponent: 10000000 }; game.totalAntimatter = { ...game.antimatter }; }
  if (id === 'number-boundary') game.tickspeedBought = Number.MAX_SAFE_INTEGER;
  if (id === 'number-subnormal') game.antimatter = { mantissa: Number.MIN_VALUE, exponent: Number.MAX_SAFE_INTEGER };
  if (id === 'save-types') game.dimensions = 'unexpected';
  if (id === 'save-autobuyers-type') game.autobuyers = [];
  if (id === 'save-clock-type') game.lastTick = 'invalid';
  if (id === 'save-2mb') game.achievements = ['x'.repeat(2000000)];
  const profiles = Array.from({ length: id === 'profiles-1000' ? 1000 : 1 }, (_, i) => ({ id: `p${i}`, name: 'Synthetic', createdAt: new Date(NOW).toISOString() }));
  values.set('ad:v2:profiles', JSON.stringify(profiles));
  values.set('ad:v2:activeProfile', 'p0');
  values.set('ad:v4:selection', JSON.stringify({ profileId: 'p0', confirmed: true }));
  values.set('ad:v2:save:p0', JSON.stringify(game));
  values.set('ad:v3:connection:p0', JSON.stringify({ id: 'synthetic-remote', token: 'synthetic-only' }));
  const corruptions = {
    'profiles-json': ['ad:v2:profiles', '{'], 'profiles-type': ['ad:v2:profiles', '{}'],
    'selection-json': ['ad:v4:selection', '{'], 'pending-type': ['ad:v4:pendingConnection', '{}'],
    'guest-json': ['ad-save-v1', '{'], 'save-json': ['ad:v2:save:p0', '{'], 'save-null': ['ad:v2:save:p0', 'null'],
    'baseline-json': ['ad:v4:baseline:p0', '{'], 'connection-json': ['ad:v3:connection:p0', '{'],
    'recovery-index-type': ['ad:v3:recoveryIndex:p0', '{}'],
  };
  if (corruptions[id]) values.set(...corruptions[id]);
  if (id === 'guest-json' || id === 'quota-start') values.delete('ad:v4:selection');
  if (id === 'recovery-2000' || id === 'recovery-json') {
    const count = id === 'recovery-2000' ? 2000 : 1;
    const index = [];
    for (let i = 0; i < count; i++) { const key = `ad:v3:recovery:p0:synthetic-${i}`; values.set(key, id === 'recovery-json' ? '{' : JSON.stringify({ local: game, remote: null })); index.push({ key, createdAt: new Date(NOW - i).toISOString() }); }
    values.set('ad:v3:recoveryIndex:p0', JSON.stringify(index));
  }
  let phase = 'startup', gets = 0, sets = 0, removes = 0;
  const data = {
    get length() { return values.size; }, key: i => [...values.keys()][i] ?? null,
    getItem(key) { gets++; if (id === 'read-denied' && key !== '__ad_probe__') throw new DOMException('Synthetic denied read', 'SecurityError'); return values.get(key) ?? null; },
    setItem(key, value) { sets++; if (id === 'quota-start' || id === 'quota-adopt' && key.startsWith('ad:v2:save:') || id === 'quota-periodic' && phase === 'interval-1000') throw new DOMException('Synthetic quota', 'QuotaExceededError'); values.set(key, String(value)); },
    removeItem(key) { removes++; values.delete(key); },
  };
  const inputStats = { keys: values.size, utf16Characters: [...values].reduce((n, [k, v]) => n + k.length + v.length, 0), saveCharacters: values.get('ad:v2:save:p0').length };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { if (id === 'safe-probe-denied') throw new DOMException('Synthetic probe denial', 'SecurityError'); return data; } });
  const timers = [], aborts = [];
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (cb, ms, ...args) => ms === 5000 ? (aborts.push(cb), 100 + aborts.length) : realSetTimeout(cb, ms, ...args);
  globalThis.clearTimeout = () => {};
  globalThis.window = { setInterval: (cb, ms) => (timers.push({ cb, ms }), timers.length) };
  globalThis.clearInterval = () => {};
  const network = { reads: 0, writes: 0, creates: 0, requests: 0, aborted: 0 };
  let conflict = id === 'conflict-save';
  globalThis.fetch = async (url, options = {}) => {
    network.requests++;
    const route = String(url);
    if (!route.startsWith('/api/')) throw new Error('Blocked non-mock route');
    const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
    if (route === '/api/ad/create') { network.creates++; return response({ id: 'synthetic-remote', token: 'synthetic-only' }); }
    if (route.startsWith('/api/save/')) {
      if (options.method === 'POST') { network.writes++; if (conflict) { conflict = false; return response({}, 409); } return response({ revision: 1 }); }
      network.reads++;
      if (id === 'network-stop' || id === 'network-timeout') return new Promise((_, reject) => options.signal.addEventListener('abort', () => { network.aborted++; reject(new DOMException('Synthetic abort', 'AbortError')); }));
      if (id.startsWith('http-')) return response({}, Number(id.slice(5)));
      if (id === 'sync-choice') { const remote = JSON.parse(JSON.stringify(game)); remote.achievements = ['different']; return response({ save: remote, revision: 1 }); }
      return response({ save: null, revision: 0 });
    }
    if (route === '/api/leaderboard') return response(options.method === 'POST' ? {} : { entries: [] });
    throw new Error('Blocked unknown mock route');
  };
  let state, notifications = 0, wsCalls = 0;
  const set = patch => { Object.assign(state, patch); notifications++; };
  state = { ...createAdSlice(set, () => state), joined: false, selfId: '' };
  const stub = (path, namedExports) => mock.module(new URL(path, import.meta.url).href, { namedExports });
  stub('../client/src/store.ts', { get: () => state, set });
  stub('../client/src/net/ws.ts', { connectWs: () => { wsCalls++; } });
  stub('../client/src/updateBridge.ts', { isElectron: () => false });
  stub('../client/src/world/fantasy-account-state.ts', { clearFantasyAccountPrivateState: () => ({}) });
  const { enter } = await import('../client/src/auth.ts');
  const snapshots = [];
  const snapshot = label => snapshots.push({ label, sync: state.adSync, joined: state.joined, wsCalls, version: state.adVersion, migration: state.adMigration, game: !!state.adGame, reads: network.reads, writes: network.writes, notifications, offlineSimulatedMs: state.adOffline?.simulatedMs ?? null, offlineElapsedMs: state.adOffline?.elapsedMs ?? null });
  const drain = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r)); };
  let startupException = null;
  mark('enter', { inputStats });
  try { enter({ id: 'synthetic-account', name: 'Synthetic', kind: 'guest', username: null }); }
  catch (error) { startupException = { name: error.name, message: error.message, stack: error.stack }; }
  snapshot('enter-return');
  mark('first-sync');
  const syncStart = performance.now();
  await drain(); snapshot('first-sync');
  const syncElapsedMs = +(performance.now() - syncStart).toFixed(3);
  if (startupException) { enter({ id: 'synthetic-account', name: 'Synthetic', kind: 'guest', username: null }); snapshot('second-enter-after-error'); }
  if (id === 'network-timeout') { mark('api-abort'); for (const abort of aborts.splice(0)) abort(); await drain(); snapshot('after-abort'); }
  const measurements = [];
  for (const ms of [100, 1000, 30000]) {
    phase = `interval-${ms}`; mark(phase);
    const start = performance.now();
    for (const timer of timers) if (timer.ms === ms) timer.cb();
    await drain(); measurements.push({ phase, elapsedMs: +(performance.now() - start).toFixed(3) }); snapshot(phase);
  }
  if (id === 'conflict-save') { mark('manual-save-conflict'); await state.adSaveServer(); snapshot('after-conflict'); }
  let sourceException = null;
  mark('progress-sources');
  try { state.adProgressSources(); } catch (error) { sourceException = { name: error.name, message: error.message }; }
  if (id === 'sync-choice') { mark('choose-local'); state.adChooseSave('local'); await drain(); snapshot('after-choice'); }
  if (state.adGame && state.adSync === 'ready') {
    mark('periodic-100-samples'); const start = performance.now();
    for (let i = 0; i < 100; i++) for (const timer of timers) if (timer.ms === 100) timer.cb();
    measurements.push({ phase: '100-callbacks-with-state-notifications-no-React', elapsedMs: +(performance.now() - start).toFixed(3) });
    const t = performance.now(); const saved = E.serialize(state.adGame); sameSave(saved, saved);
    measurements.push({ phase: 'serialize-and-canonical-compare', elapsedMs: +(performance.now() - t).toFixed(3), characters: saved.length });
  }
  let validation = 'not-run';
  try { validateSave(game); validation = 'accepted'; } catch { validation = 'rejected'; }
  mark('complete');
  console.log(JSON.stringify({ inputStats, snapshots, startupException, sourceException, syncElapsedMs, measurements, network, storageOperations: { gets, sets, removes }, inputValidation: validation,
    safeStorageFallback: id === 'safe-probe-denied' ? safeStorage() !== data : null, errors: state.adSaveErrors.map(e => ({ op: e.op, phase: e.phase, name: e.name, status: e.status })), stages }));
}
