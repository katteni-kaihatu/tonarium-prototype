import { readFantasySavedProfiles } from './fantasy-test-saved-profiles.ts';
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { COMPAT_VERSION } from '../shared/protocol.ts';
import { BROWSER_AI_MODEL, type BrowserAiCooperation, type BrowserAiJob } from '../shared/ai-support.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
import { NPC_SERVER } from './npc-catalog.ts';

const PUBLIC_QUESTION = 'Please share a quiet comforting thought about feeling lonely.';
const PRIVATE_QUESTION = 'I quietly remember PRIVATE_DIALOGUE_PIN_8729 from my travels.';
const LOCAL_REPLY = 'A quiet pause can make the road feel gentler.';
const NPC_REPLY = 'A warm cup and a quiet bench may soften a long evening.';
const GM_REPLY = 'There is room for patience between one step and the next.';
const choices = (change: Partial<BrowserAiCooperation> = {}): BrowserAiCooperation => ({ version: 2, shareIdle: true, allowRemote: true, idle: true, ...change });
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
interface Message { t: string; requestId?: string; source?: string; text?: string; error?: string; model?: string; job?: BrowserAiJob; leaseId?: string; actions?: unknown[]; reply?: { text: string; suggestions: unknown[] } }
interface ModelBody { messages: { role: string; content: string }[] }

async function fixture(t: TestContext) {
  const prefix = path.join(os.tmpdir(), 'tonarium-sharing-wire-'), directory = fs.mkdtempSync(prefix);
  const file = path.join(directory, 'fantasy.json');
  const profiles = Object.fromEntries(['alice', 'bob', 'charlie'].map(id => {
    const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: `PRIVATE_${id.toUpperCase()}_NAME`, source: 'human', gender: 'female' }, () => .8).profile;
    profile.character!.gold = 413; profile.character!.inventory.gem = 7;
    return [id, profile];
  }));
  fs.writeFileSync(file, JSON.stringify(profiles));
  fs.writeFileSync(path.join(directory, 'fantasy-clock.json'), JSON.stringify({ version: 1, hour: profiles.alice.character!.hour, wallTime: Date.now() + 3_600_000 }));
  const sessions = path.join(directory, 'sessions.json');
  fs.writeFileSync(sessions, JSON.stringify({ name: 'Sharing test', sessions: [
    { id: 'sharing-one', name: 'Isolated sharing one', world: 'fantasy' }, { id: 'sharing-two', name: 'Isolated sharing two', world: 'fantasy' },
  ] }));
  const localBodies: ModelBody[] = [];
  const local = http.createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += String(chunk);
    localBodies.push(JSON.parse(body) as ModelBody);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ model: 'sharing-test-server', choices: [{ message: { content: LOCAL_REPLY } }] }));
  });
  await new Promise<void>(resolve => local.listen(0, '127.0.0.1', resolve));
  const localPort = (local.address() as net.AddressInfo).port;
  const listener = net.createServer(); await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as net.AddressInfo).port; await new Promise<void>(resolve => listener.close(() => resolve()));
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts', '--dev'], {
    env: { ...process.env, NODE_ENV: 'test', FANTASY_ACCOUNT_TEST_BYPASS: '1', SERVER_PORT: String(port), DATA_DIR: directory, SESSIONS_FILE: sessions,
      NPC_LLM_URL: `http://127.0.0.1:${localPort}/v1`, NPC_LLM_MODEL: 'sharing-test-server', LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = ''; child.stdout.on('data', data => { logs += String(data); }); child.stderr.on('data', data => { logs += String(data); });
  const sockets: WebSocket[] = [];
  async function until<T>(read: () => T | undefined, timeout = 8000): Promise<T> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = read(); if (value !== undefined) return value;
      if (child.exitCode !== null) throw new Error(`Sharing server exited: ${logs}`);
      await delay(10);
    }
    throw new Error(`Sharing test timed out: ${logs}`);
  }
  t.after(async () => {
    for (const socket of sockets) socket.terminate(); child.kill();
    if (child.exitCode === null && !child.signalCode) await new Promise<void>(resolve => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    await new Promise<void>(resolve => local.close(() => resolve()));
    if (!path.resolve(directory).startsWith(path.resolve(prefix))) throw new Error('Unexpected sharing test directory');
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await until(() => logs.includes('server on') ? true : undefined, 20_000);
  const peer = async (id: 'alice' | 'bob' | 'charlie', session = 'sharing-one') => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(socket);
    const messages: Message[] = []; socket.on('message', data => messages.push(JSON.parse(String(data)) as Message));
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const send = (message: unknown) => socket.send(JSON.stringify(message));
    const barrier = () => new Promise<void>((resolve, reject) => {
      const nonce = crypto.randomUUID();
      const pong = (data: Buffer) => { if (String(data) !== nonce) return; clearTimeout(timer); socket.off('pong', pong); resolve(); };
      const timer = setTimeout(() => { socket.off('pong', pong); reject(new Error('Sharing transport barrier timed out')); }, 2000);
      socket.on('pong', pong); socket.ping(nonce);
    });
    send({ t: 'hello', compat: COMPAT_VERSION, id, name: profiles[id].character!.name }); send({ t: 'join', sid: session });
    await until(() => messages.find(message => message.t === 'fantasyProfile')); await barrier();
    const status = async (ready: boolean, cooperation: BrowserAiCooperation | null = choices()) => {
      send({ t: 'aiSupport', ready, epoch: `sharing-${id}`, model: BROWSER_AI_MODEL, ...(cooperation ? { cooperation } : {}) }); await barrier();
    };
    const ask = (requestId: string, kind: 'npc' | 'gm', text = PUBLIC_QUESTION, locale = 'en') => {
      send({ t: kind === 'npc' ? 'npcChat' : 'fantasyGmChat', requestId, text, locale, ...(kind === 'npc' ? { npcId: 'rin' } : {}) });
      return until(() => messages.find(message => message.requestId === requestId && ['npcReply', 'fantasyGmReply'].includes(message.t)));
    };
    const job = (since: number) => until(() => messages.slice(since).find(message => message.t === 'aiSupportJob')?.job);
    const result = (job: BrowserAiJob, text: string) => send({ t: 'aiSupportResult', leaseId: job.leaseId, epoch: job.epoch, text });
    return { socket, messages, send, status, ask, job, result, barrier };
  };
  const alice = await peer('alice'), bob = await peer('bob'), charlie = await peer('charlie', 'sharing-two');
  await alice.status(false); await bob.status(true); await charlie.status(true);
  return { alice, bob, charlie, localBodies, until,
    read: () => readFantasySavedProfiles(file),
  };
}

test('real NPC and GM requests borrow one idle browser with public context and deliver each answer only to its requester', { timeout: 30_000 }, async t => {
  const f = await fixture(t), before = f.read();
  await f.alice.status(false, choices({ allowRemote: false }));
  assert.equal((await f.alice.ask('private-history', 'npc', PRIVATE_QUESTION)).source, 'local');
  assert.equal(f.localBodies.length, 1); await delay(1550); await f.alice.status(false);
  for (const [kind, text] of [['npc', NPC_REPLY], ['gm', GM_REPLY]] as const) {
    const id = `shared-${kind}`, since = f.bob.messages.length, pending = f.alice.ask(id, kind), job = await f.bob.job(since);
    assert.equal(job.scope, 'shared'); assert.equal(job.kind, kind); assert.notEqual(job.requestId, id); assert.match(job.requestId, /^[a-f0-9-]{36}$/);
    const prompt = job.messages.map(message => message.content).join('\n');
    assert.doesNotMatch(prompt, /PRIVATE_|alice|bob|charlie|PRIVATE_DIALOGUE_PIN_8729/i);
    assert.ok(!prompt.includes(LOCAL_REPLY));
    for (const secret of Object.values(NPC_SERVER).flatMap(npc => npc.privateSecrets)) assert.equal(prompt.includes(secret), false);
    assert.equal(f.alice.messages.some(message => message.t === 'aiSupportJob'), false);
    assert.equal(f.charlie.messages.some(message => message.t === 'aiSupportJob'), false);
    f.charlie.result(job, 'A forged response from a different world.');
    f.bob.result(job, text);
    const reply = await pending;
    assert.equal(reply.source, 'browser'); assert.equal(reply.model, BROWSER_AI_MODEL); assert.equal(reply.error, undefined);
    assert.equal(kind === 'npc' ? reply.text : reply.reply?.text, text);
    assert.deepEqual(kind === 'npc' ? reply.actions ?? [] : reply.reply?.suggestions, []);
    f.bob.result(job, 'A duplicate must not enter the conversation.'); await f.bob.barrier(); await delay(30);
    assert.equal(f.alice.messages.filter(message => message.requestId === id && ['npcReply','fantasyGmReply'].includes(message.t)).length, 1);
    assert.equal(f.bob.messages.some(message => message.requestId === id), false);
    assert.equal(f.charlie.messages.some(message => message.requestId === id), false);
    assert.equal(f.localBodies.length, 1);
  }
  const since = f.bob.messages.length, own = f.bob.ask('bob-private-history-check', 'npc', 'Could you offer a quiet thought about being patient?'), ownJob = await f.bob.job(since);
  assert.equal(ownJob.scope, 'self'); assert.equal(ownJob.requestId, 'bob-private-history-check');
  const ownPrompt = JSON.stringify(ownJob.messages);
  for (const secret of [NPC_REPLY, GM_REPLY, PRIVATE_QUESTION, 'PRIVATE_ALICE_NAME']) assert.ok(!ownPrompt.includes(secret));
  f.bob.result(ownJob, 'A small pause may help.'); await own;
  assert.equal(f.alice.messages.some(message => message.requestId === 'bob-private-history-check'), false);
  assert.deepEqual(f.read(), before);
});

test('real consent and session boundaries keep legacy, declined, busy and private-only requests on the server', { timeout: 30_000 }, async t => {
  const f = await fixture(t), before = f.read();
  await f.bob.status(true, choices({ idle: false }));
  assert.equal((await f.alice.ask('idle-blocked', 'npc')).source, 'local'); assert.equal(f.localBodies.length, 1);
  await f.bob.status(true); await f.alice.status(false, choices({ allowRemote: false }));
  assert.equal((await f.alice.ask('remote-declined', 'gm')).source, 'local'); assert.equal(f.localBodies.length, 2);
  await delay(1550); await f.alice.status(false, null);
  assert.equal((await f.alice.ask('legacy-requester', 'npc')).source, 'local'); assert.equal(f.localBodies.length, 3);
  await f.alice.status(false); await f.bob.status(true, null);
  assert.equal((await f.alice.ask('legacy-contributor', 'gm')).source, 'local'); assert.equal(f.localBodies.length, 4);
  await delay(1550); await f.bob.status(true);
  const privateText = 'My password is PRIVATE_NEVER_SHARE_9274. What should I do?';
  assert.equal((await f.alice.ask('private-server-only', 'npc', privateText)).source, 'local'); assert.equal(f.localBodies.length, 5);
  assert.ok(JSON.stringify(f.localBodies.at(-1)).includes(privateText));
  await f.bob.status(true, choices({ shareIdle: false }));
  assert.equal((await f.alice.ask('other-world-only', 'gm')).source, 'local'); assert.equal(f.localBodies.length, 6);
  assert.equal(f.bob.messages.some(message => message.t === 'aiSupportJob'), false);
  assert.equal(f.charlie.messages.some(message => message.t === 'aiSupportJob'), false);
  assert.deepEqual(f.read(), before);
});

test('real shared leases yield to personal conversation, resource or permission withdrawal and disconnect with one server fallback each', { timeout: 30_000 }, async t => {
  const f = await fixture(t), before = f.read();
  let expectedCalls = 0;
  for (const [index, mode] of ['idle', 'personal', 'memory', 'remote', 'disconnect'].entries()) {
    if (index) await delay(mode === 'memory' ? 2050 : 1550);
    await f.alice.status(false); await f.bob.status(true);
    const kind = index % 2 ? 'gm' : 'npc', id = `withdraw-${mode}`, since = f.bob.messages.length;
    const pending = f.alice.ask(id, kind), job = await f.bob.job(since);
    assert.equal(job.scope, 'shared');
    if (mode === 'idle') await f.bob.status(true, choices({ idle: false }));
    else if (mode === 'personal') {
      const own = await f.bob.ask('preempting-own-greeting', 'npc', 'Hello');
      assert.equal(own.source, 'canon'); assert.equal(own.error, undefined);
    } else if (mode === 'memory') await f.bob.status(false);
    else if (mode === 'remote') await f.alice.status(false, choices({ allowRemote: false }));
    else f.bob.socket.terminate();
    const reply = await pending; expectedCalls++;
    assert.equal(reply.source, 'local'); assert.equal(reply.error, undefined); assert.equal(f.localBodies.length, expectedCalls);
    assert.equal(kind === 'npc' ? reply.text : reply.reply?.text, LOCAL_REPLY);
    if (mode !== 'disconnect') {
      await f.until(() => f.bob.messages.slice(since).find(message => message.t === 'aiSupportCancel' && message.leaseId === job.leaseId));
      f.bob.result(job, 'A late shared result must be ignored.'); await f.bob.barrier();
    } else { f.charlie.result(job, 'A disconnected contributor cannot be impersonated.'); await f.charlie.barrier(); }
    await delay(30);
    assert.equal(f.alice.messages.filter(message => message.requestId === id && ['npcReply','fantasyGmReply'].includes(message.t)).length, 1);
    assert.equal(f.localBodies.length, expectedCalls);
    assert.equal(f.charlie.messages.some(message => message.t === 'aiSupportJob'), false);
  }
  assert.ok(!JSON.stringify(f.localBodies).includes('A late shared result must be ignored.'));
  assert.deepEqual(f.read(), before);
});
