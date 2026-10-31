import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { COMPAT_VERSION } from '../shared/protocol.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { testServerEnv } from './test-db.ts';
import { markFantasyPlatformDataCurrent } from './fantasy-platform-reset.ts';

test('live NPC and GM sockets use authenticated external HTTPS and ignore retired device AI messages', { timeout: 30_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'tonarium-kokoa-ws-'));
  const sessions = join(directory, 'sessions.json');
  const profiles = Object.fromEntries(['alice', 'bob'].map(id => [id, applyFantasyAction(newFantasyProfile(), { type: 'create', name: id, source: 'human', gender: 'female' }, () => .5).profile]));
  await writeFile(join(directory, 'fantasy.json'), JSON.stringify(profiles));
  await writeFile(sessions, JSON.stringify({ name: 'KokoaAI test', sessions: [{ id: 'world', name: 'Test world', world: 'fantasy' }] }));
  let calls = 0;
  const upstream = https.createServer({ key: await readFile(new URL('./fixtures/kokoa-test-key.pem', import.meta.url)), cert: await readFile(new URL('./fixtures/kokoa-test-cert.pem', import.meta.url)) }, async (request, response) => {
    assert.equal(request.url, '/v1/chat/completions');
    assert.equal(request.headers.authorization, 'Bearer websocket-test-only');
    let raw = ''; for await (const part of request) raw += String(part);
    const body = JSON.parse(raw);
    assert.equal(body.model, 'lfm3-1.7b'); assert.equal(body.stream, true);
    assert.ok(!('cache_prompt' in body)); assert.deepEqual(body.chat_template_kwargs, { enable_thinking: true });
    assert.ok(!raw.includes('websocket-test-only')); assert.ok(!raw.includes('FORGED_DEVICE_REPLY'));
    calls++;
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end('data: ' + JSON.stringify({ model: 'lfm3-1.7b', choices: [{ delta: { content: 'A quiet pause can help.' } }] }) + '\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = (upstream.address() as net.AddressInfo).port;
  const listener = net.createServer(); await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as net.AddressInfo).port; await new Promise<void>(resolve => listener.close(() => resolve()));
  markFantasyPlatformDataCurrent(directory);
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts', '--dev'], { env: { ...process.env, ...(await testServerEnv(t)), TONARIUM_TEST_HELLO_ID: '1', NODE_ENV: 'test', SERVER_PORT: String(port), DATA_DIR: directory, SESSIONS_FILE: sessions, KOKOAAI_BASEURL: `https://127.0.0.1:${upstreamPort}/v1`, KOKOAAI_MODEL: 'lfm3-1.7b', KOKOAAI_APIKEY: 'websocket-test-only', NODE_EXTRA_CA_CERTS: fileURLToPath(new URL('./fixtures/kokoa-test-cert.pem', import.meta.url)), LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', data => { logs += String(data); }); child.stderr.on('data', data => { logs += String(data); });
  const sockets: WebSocket[] = [];
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    child.kill();
    if (child.exitCode === null && !child.signalCode) await new Promise<void>(resolve => { const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
    await new Promise<void>(resolve => upstream.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  async function until<T>(read: () => T | undefined): Promise<T> {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) { const value = read(); if (value !== undefined) return value; if (child.exitCode !== null) throw Error(logs); await new Promise(resolve => setTimeout(resolve, 10)); }
    throw Error('KokoaAI socket test timed out: ' + logs);
  }
  await until(() => logs.includes('server on') ? true : undefined);
  type Message = { t: string; profile?: typeof profiles.alice; requestId?: string; source?: string; model?: string; text?: string; error?: string; reply?: { text: string } };
  async function peer(id: string) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(socket);
    const messages: Message[] = []; socket.on('message', raw => messages.push(JSON.parse(String(raw))));
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const send = (message: unknown) => socket.send(JSON.stringify(message));
    send({ t: 'hello', compat: COMPAT_VERSION, id, name: id });
    await until(() => messages.find(message => message.t === 'snapshot'));
    assert.equal(messages.some(message => message.t === 'fantasyProfile'), false);
    send({ t: 'join', sid: 'world' });
    const current = await until(() => messages.find(message => message.t === 'fantasyProfile'));
    assert.equal(current.profile?.character?.name, id);
    return { messages, send };
  }
  const alice = await peer('alice'), bob = await peer('bob');
  for (const person of [alice, bob]) person.send({ t: 'aiSupport', ready: true, epoch: 'retired', model: 'retired-browser-model', cooperation: { version: 2, shareIdle: true, allowRemote: true, idle: true } });
  alice.send({ t: 'aiSupportResult', leaseId: 'forged', epoch: 'retired', text: 'FORGED_DEVICE_REPLY' });
  for (const [kind, person] of [['npc', alice], ['gm', bob]] as const) {
    const requestId = 'external-' + kind;
    person.send({ t: kind === 'npc' ? 'npcChat' : 'fantasyGmChat', npcId: 'rin', locale: 'en', requestId, text: 'I argued with my friend Mina. How should I start an apology?' });
    person.send({ t: 'aiSupportChunk', requestId, leaseId: 'forged', epoch: 'retired', sequence: 1, text: 'FORGED_DEVICE_REPLY' });
    person.send({ t: 'aiSupportResult', requestId, leaseId: 'forged', epoch: 'retired', text: 'FORGED_DEVICE_REPLY' });
    const reply = await until(() => person.messages.find(message => message.requestId === requestId && message.t === (kind === 'npc' ? 'npcReply' : 'fantasyGmReply')));
    assert.equal(reply.error, undefined); assert.equal(reply.source, 'local'); assert.equal(reply.model, 'lfm3-1.7b');
    assert.equal(kind === 'npc' ? reply.text : reply.reply?.text, 'A quiet pause can help.');
    assert.ok(person.messages.some(message => message.t === 'fantasyDialogueChunk' && message.requestId === requestId));
  }
  assert.equal(calls, 2);
  for (const person of [alice, bob]) {
    assert.ok(!person.messages.some(message => message.t === 'aiSupportJob' || message.source === 'browser'));
    assert.ok(!JSON.stringify(person.messages).includes('websocket-test-only'));
    assert.ok(!JSON.stringify(person.messages).includes('FORGED_DEVICE_REPLY'));
  }
  assert.ok(!logs.includes('websocket-test-only'));
});
