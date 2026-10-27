import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FantasyDiagnostics, readDiagnosticConversations, summarizeDiagnostics } from './fantasy-diagnostics.ts';

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tonarium-diagnostics-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith('tonarium-diagnostics-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}
async function entries(directory: string) {
  const names = (await fs.readdir(directory)).filter(name => name.endsWith('.jsonl'));
  return (await Promise.all(names.map(name => fs.readFile(path.join(directory, name), 'utf8')))).join('').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

test('writes bounded metadata and stable private actor hashes across logger restarts', async t => {
  const directory = await fixture(t);
  for (let run = 0; run < 2; run++) {
    const logger = new FantasyDiagnostics({ directory });
    logger.record({ type: 'action', actorId: 'fantasy:private-principal', action: 'gather', moneyDelta: 4, generation: 2, password: 'secret-password', profile: { name: 'Private Name' } } as never);
    await logger.close();
  }
  const rows = await entries(directory);
  assert.equal(rows.length, 2);
  assert.match(rows[0].actor, /^[a-f0-9]{24}$/u);
  assert.equal(rows[0].actor, rows[1].actor);
  assert.equal(rows[0].moneyDelta, 4);
  assert.equal(rows[0].generation, 2);
  const serialized = JSON.stringify(rows);
  for (const secret of ['private-principal', 'secret-password', 'Private Name', 'actorId', 'profile']) assert.ok(!serialized.includes(secret));
  const other = new FantasyDiagnostics({ directory: path.join(directory, 'other') });
  other.record({ type: 'action', actorId: 'fantasy:private-principal' });
  await other.close();
  assert.notEqual((await entries(path.join(directory, 'other')))[0].actor, rows[0].actor);
});

test('metadata mode omits dialogue and explicitly selected issue capture redacts credentials', async t => {
  const directory = await fixture(t);
  const logger = new FantasyDiagnostics({ directory });
  logger.recordDialogue({ type: 'ai.reply', status: 'error' }, { query: 'private query', reply: 'private reply' });
  await logger.close();
  assert.ok(!JSON.stringify(await entries(directory)).includes('private'));
  const issues = new FantasyDiagnostics({ directory, captureMode: 'issues', maxTextChars: 160 });
  issues.recordDialogue({ type: 'ai.reply', status: 'ok' }, { reply: 'ordinary reply' });
  issues.recordDialogue({ type: 'ai.reply', status: 'error' }, { query: 'password=secret-one パスワード：秘密二 비밀번호=비밀삼 token: abcdefghijklmnop recovery code: RCV-12345 name@example.com', reply: 'Bearer sk-secretkey12345678901234567890 ' + '長'.repeat(500) });
  await issues.close();
  const rows = await entries(directory), captured = rows.find(row => row.dialogue);
  assert.ok(captured);
  assert.ok(captured.dialogue.query.length <= 160);
  assert.ok(captured.dialogue.reply.length <= 160);
  const text = JSON.stringify(rows);
  for (const secret of ['ordinary reply', 'secret-one', '秘密二', '비밀삼', 'abcdefghijklmnop', 'RCV-12345', 'name@example.com', 'sk-secretkey']) assert.ok(!text.includes(secret), secret);
});

test('rejects arbitrary nested payloads and hostile values without throwing into gameplay', async t => {
  const directory = await fixture(t), logger = new FantasyDiagnostics({ directory });
  const circular: Record<string, unknown> = {}; circular.self = circular;
  assert.doesNotThrow(() => logger.record({ type: 'action', action: circular, state: circular, durationMs: Infinity, password: 'hidden' } as never));
  assert.doesNotThrow(() => logger.record(Object.defineProperty({}, 'type', { get() { throw new Error('hostile getter'); } }) as never));
  await logger.close();
  const rows = await entries(directory);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, undefined);
  assert.equal(rows[0].durationMs, undefined);
});

test('bounds queue work synchronously and reports dropped entries', async t => {
  const directory = await fixture(t), logger = new FantasyDiagnostics({ directory, maxQueueSize: 3 });
  for (let i = 0; i < 20; i++) logger.record({ type: 'action', action: 'wait' });
  assert.ok(logger.stats.queued <= 3);
  assert.equal(logger.stats.dropped, 17);
  await logger.flush();
  assert.equal((await entries(directory)).filter(row => row.type === 'action').length, 3);
  assert.equal((await entries(directory)).find(row => row.type === 'diagnostics.drop')?.droppedCount, 17);
  await logger.close();
  assert.doesNotThrow(() => logger.record({ type: 'action' }));
});

test('filesystem failure is fail-open and flush and close settle', async t => {
  const directory = await fixture(t), blocked = path.join(directory, 'file');
  await fs.writeFile(blocked, 'keep');
  const logger = new FantasyDiagnostics({ directory: blocked });
  assert.doesNotThrow(() => logger.record({ type: 'action' }));
  await logger.flush(); await logger.close();
  assert.ok(logger.stats.failures > 0);
  assert.equal(await fs.readFile(blocked, 'utf8'), 'keep');
});

test('rotates bounded files and retention removes only recognized regular logs', async t => {
  const directory = await fixture(t), old = 'play-20000101T000000000Z-12345678.jsonl';
  await fs.writeFile(path.join(directory, old), '{}\n');
  await fs.writeFile(path.join(directory, 'notes.jsonl'), 'keep');
  const logger = new FantasyDiagnostics({ directory, maxFileBytes: 512, maxFiles: 3, maxTotalBytes: 1536, retentionDays: 14 });
  for (let i = 0; i < 16; i++) { logger.record({ type: 'action', action: 'gather', moneyDelta: i }); await logger.flush(); }
  await logger.close();
  const names = (await fs.readdir(directory)).filter(name => name.startsWith('play-'));
  assert.ok(names.length <= 3);
  assert.ok(!names.includes(old));
  for (const name of names) assert.ok((await fs.stat(path.join(directory, name))).size <= 512);
  assert.equal(await fs.readFile(path.join(directory, 'notes.jsonl'), 'utf8'), 'keep');
});

test('a long-lived process rotates by UTC day and expires earlier days', async t => {
  const directory = await fixture(t); let now = Date.UTC(2026, 9, 1);
  const logger = new FantasyDiagnostics({ directory, retentionDays: 2, now: () => now });
  logger.record({ type: 'action', action: 'gather' }); await logger.flush();
  now += 3 * 86_400_000;
  logger.record({ type: 'action', action: 'travel' }); await logger.close();
  const rows = await entries(directory);
  assert.deepEqual(rows.map(row => row.action), ['travel']);
});

test('read-only report counts outcomes and timing without returning dialogue or trailing partial records', async t => {
  const directory = await fixture(t), logger = new FantasyDiagnostics({ directory, captureMode: 'all' });
  logger.recordDialogue({ type: 'ai.reply', actorId: 'principal', status: 'ok', durationMs: 20, route: 'local' }, { query: 'sensitive conversation', reply: 'reply text' });
  logger.record({ type: 'ai.reply', status: 'error', durationMs: 100, errorCode: 'TIMEOUT' });
  logger.record({ type: 'action', status: 'ok', moneyDelta: 7 });
  await logger.close();
  const filename = (await fs.readdir(directory)).find(name => name.endsWith('.jsonl'))!;
  await fs.appendFile(path.join(directory, filename), '{"type":"partial"');
  const before = await fs.readFile(path.join(directory, filename));
  const report = await summarizeDiagnostics({ directory });
  assert.equal(report.records, 3);
  assert.deepEqual(report.types, { 'ai.reply': 2, action: 1 });
  assert.equal(report.statuses.error, 1);
  assert.equal(report.timings.count, 2);
  assert.equal(report.timings.minMs, 20);
  assert.equal(report.timings.maxMs, 100);
  assert.equal(report.timings.p95Ms, 100);
  assert.equal(report.ignoredPartialLines, 1);
  assert.equal(report.balanceDeltas.moneyDelta, 7);
  assert.equal(report.dialogueRecords, 1);
  assert.ok(!JSON.stringify(report).includes('sensitive conversation'));
  assert.deepEqual(await fs.readFile(path.join(directory, filename)), before);
});

test('report bounds oversized and malformed lines and ignores unrecognized filenames', async t => {
  const directory = await fixture(t);
  await fs.writeFile(path.join(directory, 'play-20261027T000000000Z-12345678.jsonl'), 'x'.repeat(10000) + '\nnot-json\n{"type":"action","status":"ok"}\n');
  await fs.writeFile(path.join(directory, 'untrusted.jsonl'), '{"type":"unexpected"}\n');
  const report = await summarizeDiagnostics({ directory, maxLineBytes: 1024 });
  assert.equal(report.records, 1);
  assert.equal(report.ignoredLines, 2);
  assert.equal(report.types.unexpected, undefined);
});

test('private key and report directory refuse linked destinations', async t => {
  const directory = await fixture(t), target = path.join(directory, 'target'), linked = path.join(directory, 'linked');
  await fs.mkdir(target);
  await fs.symlink(target, linked, 'junction');
  const logger = new FantasyDiagnostics({ directory: linked });
  logger.record({ type: 'action', actorId: 'private' });
  await logger.close();
  assert.equal(logger.stats.disabled, true);
  assert.deepEqual(await fs.readdir(target), []);
  await assert.rejects(summarizeDiagnostics({ directory: linked }), /regular directory/u);
});

test('report treats hostile dictionary names as counts and honors byte budget', async t => {
  const directory = await fixture(t);
  await fs.writeFile(path.join(directory, 'play-20261027T000000000Z-12345678.jsonl'), '{"type":"constructor","status":"constructor"}\n' + '{"type":"action"}\n'.repeat(200));
  const report = await summarizeDiagnostics({ directory, maxBytes: 1024 });
  assert.equal(report.types.constructor, 1);
  assert.equal(report.statuses.constructor, 1);
  assert.equal(report.limited, true);
  assert.ok(report.bytesRead <= 1024);
  assert.ok(report.records < 201);
});

test('all capture strips complete credential headers and credentials without punctuation', async t => {
  const directory = await fixture(t), logger = new FantasyDiagnostics({ directory, captureMode: 'all' });
  logger.recordDialogue({ type: 'ai.reply', status: 'ok' }, { query: 'Cookie: sid=secret-session; other=secret-cookie\npassword secret-pass\nパスワード 秘密\n비밀번호 비밀\nRecovery code secret-recovery\n비밀번호는 자연비밀\nパスワードは 自然秘密', reply: 'public response' });
  await logger.close();
  const rows = await entries(directory);
  assert.equal(rows[0].dialogue.reply, 'public response');
  for (const secret of ['secret-session', 'secret-cookie', 'secret-pass', '秘密', '비밀', 'secret-recovery', '자연비밀', '自然秘密']) assert.ok(!JSON.stringify(rows).includes(secret), secret);
});

test('explicit conversation reader filters date NPC locale and anonymous actor and bounds latest results', async t => {
  const directory = await fixture(t); let now = Date.UTC(2026, 9, 26, 23, 59);
  const logger = new FantasyDiagnostics({ directory, captureMode: 'all', maxTextChars: 32, now: () => now });
  logger.recordDialogue({ type: 'ai.reply', actorId: 'one', npcId: 'innkeeper', locale: 'ko' }, { query: 'earlier day' }); await logger.flush();
  now += 120000;
  logger.recordDialogue({ type: 'npc.reply', actorId: 'one', npcId: 'innkeeper', locale: 'ko' }, { query: 'first matching', reply: 'a'.repeat(100) });
  now += 1000;
  logger.recordDialogue({ type: 'gm.reply', actorId: 'two', npcId: 'gm', locale: 'ja' }, { query: 'other actor' });
  now += 1000;
  logger.recordDialogue({ type: 'npc.reply', actorId: 'one', npcId: 'innkeeper', locale: 'ko' }, { query: 'latest matching', reply: 'b'.repeat(100) });
  await logger.close();
  const actor = (await entries(directory)).find(row => row.npcId === 'innkeeper').actor;
  const result = await readDiagnosticConversations({ directory, from: '2026-10-27', to: '2026-10-27', npc: 'innkeeper', locale: 'ko', actor, limit: 1 });
  assert.equal(result.matched, 2);
  assert.equal(result.conversations.length, 1);
  assert.equal(result.conversations[0].query, 'latest matching');
  assert.equal(result.conversations[0].reply, 'b'.repeat(32));
  assert.equal(result.conversations[0].replyTruncated, true);
  assert.equal(result.conversations[0].locale, 'ko');
  assert.equal(result.limited, true);
  assert.ok(!JSON.stringify(result).includes('.actor-key'));
  await assert.rejects(readDiagnosticConversations({ directory, from: 'not-a-date' }), /date/iu);
});

test('conversation reader rejects non-dialogue payloads and ignores a partial final line', async t => {
  const directory = await fixture(t);
  await fs.writeFile(path.join(directory, 'play-20261027T000000000Z-12345678.jsonl'), [
    JSON.stringify({ type: 'action', at: '2026-10-27T00:00:00.000Z', dialogue: { query: 'wrong event' } }),
    JSON.stringify({ type: 'ai.reply', at: '2026-10-27T00:00:00.000Z', actor: 'raw-principal', dialogue: { query: 'password=hidden', reply: 'safe', password: 'never return' }, profile: 'never return' }),
    '{"type":"ai.reply"',
  ].join('\n'));
  const result = await readDiagnosticConversations({ directory });
  assert.equal(result.conversations.length, 1);
  assert.equal(result.conversations[0].actor, undefined);
  assert.equal(result.ignoredPartialLines, 1);
  for (const secret of ['wrong event', 'raw-principal', 'hidden', 'never return']) assert.ok(!JSON.stringify(result).includes(secret));
});

test('conversation reader shows one completed turn while preserving pending and cancelled queries across actors', async t => {
  const directory = await fixture(t); let now = Date.UTC(2026, 9, 27);
  const logger = new FantasyDiagnostics({ directory, captureMode: 'all', now: () => now++ });
  const shared = { requestId: 'reused-request', sessionId: 'connection', npcId: 'rin', locale: 'ko' as const };
  logger.recordDialogue({ ...shared, type: 'ai.request', actorId: 'one', status: 'started' }, { query: 'one completed' });
  logger.recordDialogue({ ...shared, type: 'ai.request', actorId: 'two', status: 'started' }, { query: 'two cancelled' });
  logger.recordDialogue({ ...shared, type: 'ai.reply', actorId: 'one', status: 'ok', durationMs: 20 }, { query: 'one completed', reply: 'one answer' });
  logger.recordDialogue({ ...shared, type: 'ai.reply', actorId: 'two', status: 'cancelled', reason: 'disconnect' }, { query: 'two cancelled', reply: '' });
  logger.recordDialogue({ ...shared, type: 'ai.request', actorId: 'one', status: 'started' }, { query: 'one pending after reuse' });
  await logger.close();
  const result = await readDiagnosticConversations({ directory });
  assert.equal(result.matched, 3);
  assert.equal(result.conversations.length, 3);
  assert.deepEqual(result.conversations.map(row => [row.query, row.reply, row.status]), [
    ['one completed', 'one answer', 'ok'],
    ['two cancelled', '', 'cancelled'],
    ['one pending after reuse', undefined, 'pending'],
  ]);
  assert.equal(result.conversations[1].reason, 'disconnect');
  assert.equal(result.conversations[0].startedAt, '2026-10-27T00:00:00.000Z');
  const latest = await readDiagnosticConversations({ directory, limit: 2 });
  assert.equal(latest.matched, 3);
  assert.equal(latest.conversations.length, 2);
  assert.equal(latest.conversations[0].query, 'two cancelled');
});

test('conversation pairing preserves repeated turns and separates concurrent NPCs and missing identities', async t => {
  const directory = await fixture(t); let now = Date.UTC(2026, 9, 27);
  const logger = new FantasyDiagnostics({ directory, captureMode: 'all', now: () => now++ });
  const context = { actorId: 'one', requestId: 'same', sessionId: 'connection' };
  logger.recordDialogue({ ...context, type: 'ai.request', npcId: 'rin' }, { query: 'first' });
  logger.recordDialogue({ ...context, type: 'ai.request', npcId: 'gm' }, { query: 'gm still pending' });
  logger.recordDialogue({ ...context, type: 'ai.reply', npcId: 'rin', status: 'cancelled' }, { query: 'first', reply: '' });
  logger.recordDialogue({ ...context, type: 'ai.request', npcId: 'rin' }, { query: 'second' });
  logger.recordDialogue({ ...context, type: 'ai.reply', npcId: 'rin', status: 'ok' }, { query: 'second', reply: 'answer' });
  logger.recordDialogue({ type: 'ai.request' }, { query: 'no identity pending' });
  logger.recordDialogue({ type: 'ai.reply' }, { query: 'no identity completed', reply: 'legacy answer' });
  await logger.close();
  const result = await readDiagnosticConversations({ directory });
  assert.equal(result.matched, 5);
  assert.deepEqual(result.conversations.map(row => row.query), ['gm still pending', 'first', 'second', 'no identity pending', 'no identity completed']);
});

test('conversation date filters use the completed turn timestamp and pair across rotated files', async t => {
  const directory = await fixture(t); let now = Date.UTC(2026, 9, 26, 23, 59, 59);
  const logger = new FantasyDiagnostics({ directory, captureMode: 'all', now: () => now });
  const context = { actorId: 'one', requestId: 'overnight', npcId: 'gm' };
  logger.recordDialogue({ ...context, type: 'ai.request', status: 'started' }, { query: 'crosses midnight' }); await logger.flush();
  now += 2000;
  logger.recordDialogue({ ...context, type: 'ai.reply', status: 'ok' }, { query: 'crosses midnight', reply: 'finished' });
  await logger.close();
  const earlier = await readDiagnosticConversations({ directory, from: '2026-10-26', to: '2026-10-26' });
  assert.equal(earlier.matched, 0);
  const completed = await readDiagnosticConversations({ directory, from: '2026-10-27', to: '2026-10-27' });
  assert.equal(completed.matched, 1);
  assert.equal(completed.conversations[0].startedAt, '2026-10-26T23:59:59.000Z');
});

test('explicit CLI conversation HTML export escapes content and refuses overwriting', async t => {
  const directory = await fixture(t), output = path.join(directory, 'review.html');
  const logger = new FantasyDiagnostics({ directory, captureMode: 'all' });
  const context = { actorId: 'one', requestId: 'gm-completed', npcId: 'gm', locale: 'en' as const };
  logger.recordDialogue({ ...context, type: 'ai.request', status: 'started' }, { query: '<script>alert(1)</script>' });
  logger.recordDialogue({ ...context, type: 'ai.reply', status: 'ok' }, { query: '<script>alert(1)</script>', reply: '<img src=x onerror=alert(2)>' });
  logger.recordDialogue({ ...context, requestId: 'gm-pending', type: 'ai.request', status: 'started' }, { query: 'still awaiting reply' });
  await logger.close();
  const args = ['--import', 'tsx', 'scripts/fantasy-diagnostics.ts', 'conversations', '--directory', directory, '--format', 'html', '--output', output, '--limit', '2'];
  const result = spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const html = await fs.readFile(output, 'utf8');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(2)&gt;'));
  assert.ok(html.includes('Content-Security-Policy'));
  assert.ok(!html.includes('<script>'));
  assert.equal(html.split('&lt;script&gt;alert(1)&lt;/script&gt;').length - 1, 1);
  assert.ok(html.includes('pending'));
  assert.equal(html.split('<article>').length - 1, 2);
  const repeat = spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(repeat.status, 0);
  assert.equal(await fs.readFile(output, 'utf8'), html);
});

test('CLI requires explicit absolute location and reports without creating or changing files', async t => {
  const directory = await fixture(t), logger = new FantasyDiagnostics({ directory });
  logger.record({ type: 'action', status: 'ok' }); await logger.close();
  const before = await fs.readdir(directory);
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/fantasy-diagnostics.ts', '--directory', directory], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).records, 1);
  assert.deepEqual(await fs.readdir(directory), before);
  const invalid = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/fantasy-diagnostics.ts'], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(invalid.status, 0);
});
