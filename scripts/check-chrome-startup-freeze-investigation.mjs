import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const target = '29b78f5f6ca0c5e3302b6960ae2e3ffaf5cda88c';
const stem = 'docs/testing/chrome-startup-freeze-investigation';
const allowed = [`${stem}.md`, `${stem}.json`, 'scripts/investigate-chrome-startup-freeze.mjs', 'scripts/check-chrome-startup-freeze-investigation.mjs'];
const git = (...args) => execFileSync('git', ['-c', 'filter.lfs.process=', '-c', 'filter.lfs.required=false', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const hash = data => createHash('sha256').update(data).digest('hex');
const textHash = data => hash(String(data).replace(/\r\n/g, '\n'));
const string = value => assert.ok(typeof value === 'string' && value.trim(), 'expected nonempty string');
const object = value => assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'expected object');
const strings = value => { assert.ok(Array.isArray(value) && value.length); value.forEach(string); };

function auditChanges(baseline, current, allowedPaths, readFile = path => fs.readFileSync(path)) {
  // LFSの状態表示が変わっても、開始時の内容は必ず照合する。
  for (const e of baseline) {
    assert.equal(hash(readFile(e.path)), e.sha256, `baseline contents changed: ${e.path}`);
  }
  const added = current.filter(x => !baseline.some(b => b.path === x.path));
  for (const e of added) assert.ok(allowedPaths.includes(e.path), `unauthorized change: ${e.path}`);
  return added;
}

export function validate(report, markdown) {
  object(report);
  assert.equal(report.targetCommit, target);
  string(report.startedAt); assert.ok(Number.isFinite(Date.parse(report.startedAt)));
  for (const key of ['checkedPaths', 'hypotheses', 'ruledOut', 'remainingCandidates', 'nextEvidence', 'proposals', 'runs']) assert.ok(Array.isArray(report[key]) && report[key].length, key);
  for (const p of report.checkedPaths) { object(p); string(p.path); assert.match(p.sha256, /^[a-f0-9]{64}$/); strings(p.areas); }
  const ids = new Set();
  for (const h of report.hypotheses) {
    object(h); for (const key of ['id', 'claim', 'method', 'result']) string(h[key]);
    assert.ok(!ids.has(h.id)); ids.add(h.id);
    strings(h.evidence);
    assert.ok(['verified-isolated', 'partially-verified', 'not-reproduced', 'code-only', 'unverified'].includes(h.status));
    assert.equal(typeof h.unverifiedReason, 'string');
    if (h.status !== 'verified-isolated') string(h.unverifiedReason);
    else assert.equal(h.unverifiedReason, '');
    assert.ok(markdown.includes(h.id) && markdown.includes(h.claim) && markdown.includes(h.method) && markdown.includes(h.result), `markdown missing hypothesis ${h.id}`);
    assert.ok(markdown.includes(h.status));
    h.evidence.forEach(e => assert.ok(markdown.includes(e)));
    if (h.unverifiedReason) assert.ok(markdown.includes(h.unverifiedReason));
  }
  for (const item of report.ruledOut) { object(item); for (const key of ['claim', 'scope', 'evidence']) string(item[key]); assert.ok(markdown.includes(item.claim)); }
  for (const item of report.remainingCandidates) { object(item); for (const key of ['candidate', 'minimumEvidence', 'safeProcedure']) string(item[key]); assert.ok(markdown.includes(item.candidate)); }
  for (const item of report.nextEvidence) { object(item); for (const key of ['evidence', 'purpose', 'safeProcedure']) string(item[key]); assert.ok(markdown.includes(item.evidence)); }
  for (const item of report.proposals) { object(item); for (const key of ['name', 'improvementLocation', 'scope', 'regression', 'reason']) string(item[key]); assert.equal(typeof item.recommended, 'boolean'); assert.ok(markdown.includes(item.name)); }
  assert.equal(report.proposals.filter(p => p.recommended).length, 1);
  const runIds = new Set();
  for (const r of report.runs) {
    object(r); string(r.id); assert.ok(!runIds.has(r.id)); runIds.add(r.id);
    for (const key of ['command', 'kind', 'lastStage']) string(r[key]);
    object(r.input); assert.ok(Object.keys(r.input).length); object(r.environment);
    for (const key of ['node', 'os', 'browser']) string(r.environment[key]);
    assert.ok(Number.isFinite(r.timeoutMs) && r.timeoutMs > 0);
    assert.ok(Number.isFinite(r.elapsedMs) && r.elapsedMs >= 0);
    assert.equal(typeof r.timedOut, 'boolean');
    assert.ok(r.exitCode === null || Number.isInteger(r.exitCode));
    assert.ok(r.signal === null || typeof r.signal === 'string');
    assert.ok(r.timedOut ? r.exitCode !== 0 && r.elapsedMs >= r.timeoutMs && r.lastObservation : Number.isInteger(r.exitCode));
    if (r.kind === 'isolated-unit' && !r.timedOut) {
      assert.equal(r.exitCode, 0, r.id); object(r.result); object(r.result.inputStats);
      assert.ok(r.result.snapshots.length >= 5); assert.ok(r.result.stages.some(s => s.stage === 'complete'));
    }
    if (r.kind === 'engine-unit' && !r.timedOut) { assert.equal(r.exitCode, 0); assert.equal(r.result.inputValidation, 'accepted'); assert.ok(Number.isFinite(r.result.elapsedMs)); }
    if (['isolated-unit', 'engine-unit'].includes(r.kind)) {
      assert.equal(r.input.seed, 1); assert.equal(r.input.fixedTime, 1800000000000);
      for (const key of ['profiles', 'recoveryRecords', 'extraSaveCharacters']) assert.ok(Number.isInteger(r.input[key]) && r.input[key] >= 0);
    }
    const first = r.result?.snapshots?.find(s => s.label === 'first-sync');
    const note = r.result?.startupException ? `${r.result.startupException.name}; joined=${first.joined}; WS=${first.wsCalls}` : first ? `AD=${first.sync}; WS=${first.wsCalls}` : r.lastStage;
    const row = `| ${r.id} | ${r.timeoutMs} | ${r.timedOut ? 'timeout / ' + r.signal : r.exitCode} | ${r.elapsedMs} | ${note} |`;
    assert.ok(markdown.includes(row), `markdown missing or stale run ${r.id}`);
  }
  const run = id => { const found = report.runs.find(r => r.id === id); assert.ok(found, id); return found; };
  const first = id => run(id).result.snapshots.find(s => s.label === 'first-sync');
  assert.equal(first('normal').sync, 'ready'); assert.equal(first('normal').wsCalls, 1);
  for (const id of ['profiles-json', 'profiles-type', 'selection-json', 'pending-type', 'guest-json', 'quota-start', 'read-denied']) {
    assert.ok(run(id).result.startupException); assert.equal(first(id).wsCalls, 0); assert.equal(first(id).joined, true);
    assert.equal(run(id).result.snapshots.find(s => s.label === 'second-enter-after-error').wsCalls, 0);
  }
  assert.equal(first('save-json').wsCalls, 1); assert.equal(first('baseline-json').sync, 'error');
  assert.equal(first('network-stop').sync, 'loading'); assert.equal(first('network-stop').wsCalls, 1);
  assert.equal(first('sync-choice').sync, 'choice');
  for (const id of ['elapsed-8h', 'elapsed-365d']) assert.equal(first(id).offlineSimulatedMs, 28800000);
  assert.ok(run('huge-auto').timedOut); assert.equal(run('huge-auto').lastStage, 'first-sync');
  assert.ok(run('watchdog-spin').timedOut); assert.equal(run('watchdog-spin').lastStage, 'intentional-watchdog-self-check');
  for (const id of ['http-401', 'http-403', 'http-409']) assert.equal(run(id).result.network.reads, 1);
  for (const id of ['http-429', 'http-500']) assert.equal(run(id).result.network.reads, 2);
  for (const id of ['normal', 'elapsed-8h', 'elapsed-365d', 'auto-8h', 'huge-no-auto', 'profiles-1000', 'recovery-2000', 'save-2mb']) {
    const result = run(id).result;
    const row = `| ${id} | ${result.syncElapsedMs} | ${result.measurements.map(m => m.elapsedMs).join(' | ')} |`;
    assert.ok(markdown.includes(row), `stale measurement table ${id}`);
  }
  for (const id of ['engine-huge-tick', 'engine-huge-autobuy', 'engine-huge-serialize']) assert.ok(markdown.includes(`| ${id} | ${run(id).result.elapsedMs} |`));
  object(report.changeAudit); assert.deepEqual(report.changeAudit.allowedPaths, allowed);
  assert.ok(Array.isArray(report.changeAudit.baseline));
  for (const b of report.changeAudit.baseline) { string(b.path); string(b.status); assert.match(b.sha256, /^[a-f0-9]{64}$/); }
  string(report.changeAudit.checkCommand); string(report.changeAudit.checkResult);
  assert.match(report.changeAudit.indexSha256, /^[a-f0-9]{64}$/);
  assert.equal(report.changeAudit.finalAuthority, 'orchestrator');
  for (const heading of ['利用者の申告', 'コード上の観測', '再現実測', '否定できた原因', '残る候補', '次に必要な証拠', '対応案', '利用者環境での確認', '検査と変更監査']) assert.ok(markdown.includes(heading), heading);
}

const report = JSON.parse(fs.readFileSync(`${stem}.json`, 'utf8'));
const markdown = fs.readFileSync(`${stem}.md`, 'utf8');
validate(report, markdown);
assert.equal(git('rev-parse', 'HEAD').trim(), target, 'HEAD changed');
for (const p of report.checkedPaths) {
  assert.equal(textHash(fs.readFileSync(p.path, 'utf8')), p.sha256, `checked file changed: ${p.path}`);
  assert.equal(textHash(git('show', `${target}:${p.path}`)), p.sha256, `not target source: ${p.path}`);
}
const status = git('status', '--porcelain=v1', '-z', '--untracked-files=all').split('\0').filter(Boolean);
const current = status.map(s => ({ status: s.slice(0, 2), path: s.slice(3) }));
const baseline = report.changeAudit.baseline;
const added = auditChanges(baseline, current, allowed);
for (const p of allowed) { assert.ok(fs.existsSync(p)); assert.ok(added.some(e => e.path === p), `missing artifact: ${p}`); }
const index = git('ls-files', '--stage', '-z');
const initialIndex = index.split('\0').filter(entry => entry && !allowed.includes(entry.slice(entry.indexOf('\t') + 1))).map(entry => `${entry}\0`).join('');
assert.equal(hash(initialIndex), report.changeAudit.indexSha256, 'index changed outside allowed artifacts');

let rejected = 0;
for (const mutate of [r => delete r.targetCommit, r => r.hypotheses[0].status = 'success', r => r.hypotheses[0].unverifiedReason = '', r => r.runs[0].elapsedMs = 'fast', r => r.proposals[0].scope = '', r => r.checkedPaths = []]) {
  const copy = structuredClone(report); mutate(copy); assert.throws(() => validate(copy, markdown)); rejected++;
}
console.log(`PASS: schema, report correspondence, ${report.hypotheses.length} hypotheses, ${report.runs.length} runs, ${rejected} malformed reports rejected`);
const fixture = [{ path: 'initial.zip', status: ' M', sha256: hash('initial contents') }];
const readInitial = () => Buffer.from('initial contents');
for (const entries of [fixture, [], [{ path: 'initial.zip', status: 'M ' }]]) {
  assert.deepEqual(auditChanges(fixture, entries, [], readInitial), []);
}
for (const entries of [fixture, []]) {
  assert.throws(() => auditChanges(fixture, entries, [], () => Buffer.from('changed contents')), /baseline contents changed/);
}
assert.throws(() => auditChanges(fixture, [], [], () => { throw new Error('missing initial file'); }), /missing initial file/);
for (const status of [' M', '??', ' D']) {
  assert.throws(() => auditChanges(fixture, [{ path: 'product.ts', status }], [], readInitial), /unauthorized change/);
}
console.log('PASS: 9 change-audit cases (status differences accepted; changed/missing initial contents and unauthorized modifications/additions/deletions rejected)');
console.log(`PASS: target sources, unchanged initial ${baseline.length} file contents (status may differ), unchanged index outside allowed artifacts, exactly ${added.length} allowed artifacts; final confirmation belongs to orchestrator`);
