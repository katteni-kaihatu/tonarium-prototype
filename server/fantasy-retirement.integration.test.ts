import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { WebSocket } from 'ws';
import { COMPAT_VERSION, type ServerMsg } from '../shared/protocol.ts';
import { markIdData, readHomeData, seedDevAccounts, seedHomeData, testServerEnv } from './test-db.ts';
import { devLogin } from './test-auth.ts';
import { createItem } from '../shared/items.ts';

test('withdrawing the RPG blocks saved sessions and stale clients without starting its runtime', { timeout: 40_000 }, async t => {
  let phase = 'database';
  let logs = '';
  t.after(() => t.diagnostic(`Last phase: ${phase}; server: ${logs}`));
  const dbEnv = await testServerEnv(t);
  const accounts = await seedDevAccounts(dbEnv, ['retirement-player']);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-rpg-retirement-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  await markIdData(directory);
  const sessions = path.join(directory, 'sessions.json');
  fs.writeFileSync(sessions, JSON.stringify({ name: 'Retirement fixture', sessions: [
    { id: 'normal', name: 'Normal room', world: 'room' },
    { id: 'retired-fixed', name: 'Old RPG room', world: 'fantasy' },
  ] }));
  await seedHomeData(dbEnv, { home: { sessions: [
    { id: 'retired-saved', name: 'Saved RPG room', world: 'fantasy', owner: accounts['retirement-player'] },
    { id: 'saved-cafe', name: 'Saved cafe', world: 'cafe' },
  ] }, items: { 'retired-fixed': [createItem('note', { id: 'retired-note', x: 0, z: 0, ry: 0, createdBy: accounts['retirement-player'] }, () => .5)!] } });
  phase = 'start';
  const retiredFiles = ['fantasy.json', 'fantasy-clock.json', 'fantasy-community.json', 'fantasy-contracts.json', 'fantasy-named-commissions.json', 'fantasy-platform-reset.json'];
  for (const file of retiredFiles) fs.writeFileSync(path.join(directory, file), `retired sentinel: ${file}`);
  const probe = net.createServer();
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, ...dbEnv, NODE_ENV: 'test', SERVER_PORT: String(port), DATA_DIR: directory, SESSIONS_FILE: sessions,
      LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '', KOKOAAI_BASEURL: 'https://127.0.0.1:1/v1', KOKOAAI_APIKEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', data => { logs += String(data); });
  child.stderr.on('data', data => { logs += String(data); });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode) return;
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 4000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      child.kill();
    });
  };
  t.after(stop);
  async function until<T>(read: () => T | undefined, timeout = 15_000): Promise<T> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const result = read();
      if (result !== undefined) return result;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw Error(`Retirement fixture timed out: ${logs}`);
  }
  await until(() => logs.includes('server on http://') ? true : undefined);
  phase = 'health';
  assert.equal((await fetch(`${origin}/healthz`)).status, 200);
  const login = await devLogin(origin, 'retirement-player');
  phase = 'socket';
  const ws = new WebSocket(`${origin.replace('http', 'ws')}/ws`, { headers: login.headers });
  t.after(() => ws.terminate());
  const messages: ServerMsg[] = [];
  ws.on('message', raw => { messages.push(JSON.parse(String(raw))); });
  await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const send = (message: unknown) => ws.send(JSON.stringify(message));
  send({ t: 'hello', compat: COMPAT_VERSION });
  const snapshot = await until(() => messages.find(message => message.t === 'snapshot'));
  phase = 'snapshot';
  assert.equal(snapshot.t, 'snapshot');
  if (snapshot.t !== 'snapshot') throw Error('Expected snapshot');
  assert.deepEqual(snapshot.s.guild.sessions.map(session => session.id).sort(), ['normal', 'saved-cafe']);
  for (const sid of ['retired-fixed', 'retired-saved']) {
    const requestId = crypto.randomUUID();
    send({ t: 'join', sid, requestId });
    const result = await until(() => messages.find(message => message.t === 'sessionResult' && message.requestId === requestId));
    assert.ok(result.t === 'sessionResult' && result.error);
  }
  const denied = crypto.randomUUID();
  phase = 'session creation';
  send({ t: 'sessionCreate', name: 'Reopen RPG', world: 'fantasy', visibility: 'public', requestId: denied });
  const deniedResult = await until(() => messages.find(message => message.t === 'sessionResult' && message.requestId === denied));
  assert.ok(deniedResult.t === 'sessionResult' && deniedResult.error);
  send({ t: 'fantasyGmChat', requestId: 'retired-gm', locale: 'en', text: 'Hello' });
  send({ t: 'npcChat', requestId: 'retired-npc', npcId: 'rin', locale: 'en', text: 'Hello' });
  send({ t: 'fantasyAction', revision: 0, action: { type: 'create', source: 'human', name: 'No new life', gender: 'male' } });
  const created = crypto.randomUUID();
  send({ t: 'sessionDelete', id: 'retired-saved' });
  send({ t: 'sessionCreate', name: 'Still available', world: 'room', visibility: 'public', requestId: created });
  await until(() => messages.find(message => message.t === 'sessionCreated' && message.requestId === created));
  const latest = messages.findLast(message => message.t === 'sessions');
  assert.ok(latest?.t === 'sessions');
  if (latest?.t === 'sessions') for (const id of ['normal', 'saved-cafe']) assert.ok(latest.list.some(session => session.id === id), id);
  await new Promise(resolve => setTimeout(resolve, 5200));
  phase = 'runtime checks';
  assert.deepEqual(messages.filter(message => message.t.startsWith('fantasy') || message.t === 'npcReply' || message.t === 'communityState').map(message => message.t), []);
  ws.terminate();
  await stop();
  phase = 'stopped';
  assert.deepEqual(fs.readdirSync(directory).filter(file => file.startsWith('fantasy')).sort(), retiredFiles.sort());
  for (const file of retiredFiles) assert.equal(fs.readFileSync(path.join(directory, file), 'utf8'), `retired sentinel: ${file}`);
  assert.ok(!logs.includes('[npc]') && !logs.includes('[fantasy-backup]'));
  const saved = await readHomeData(dbEnv);
  assert.ok(saved.items.some(row => row.sessionId === 'retired-fixed'));
});
