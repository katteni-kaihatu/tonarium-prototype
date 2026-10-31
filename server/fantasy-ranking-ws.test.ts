import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { COMPAT_VERSION } from '../shared/protocol.ts';
import { testServerEnv } from './test-db.ts';
import { devLogin } from './test-auth.ts';
import type { FantasyRankingRow } from '../shared/fantasy-ranking.ts';

test('ranking socket accepts only a platform-authenticated RPG session and exposes server computed four-field rows', { timeout: 30000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-ranking-ws-')), sessions = path.join(directory, 'sessions.json');
  fs.writeFileSync(sessions, JSON.stringify({ name: 'Ranking fixture', sessions: [{ id: 'ranking-world', name: 'Ranking world', world: 'fantasy' }] }));
  const probe = net.createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as net.AddressInfo).port; await new Promise<void>(resolve => probe.close(() => resolve()));
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts', '--dev'], { env: { ...process.env, ...(await testServerEnv(t)), NODE_ENV: 'test', TONARIUM_TEST_HELLO_ID: '0', SERVER_PORT: String(port), DATA_DIR: directory, SESSIONS_FILE: sessions, LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '', KOKOAAI_APIKEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', data => { logs += String(data); }); child.stderr.on('data', data => { logs += String(data); });
  let socket: WebSocket | undefined;
  t.after(async () => {
    socket?.terminate();
    if (child.exitCode === null && !child.signalCode) { child.kill(); await new Promise<void>(resolve => { const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 4000); child.once('exit', () => { clearTimeout(timer); resolve(); }); }); }
    const target = path.resolve(directory), relative = path.relative(path.resolve(os.tmpdir()), target);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(target).startsWith('fantasy-ranking-ws-')); fs.rmSync(target, { recursive: true, force: true });
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(`Ranking fixture did not start: ${logs}`)), 20000);
    const inspect = () => { if (logs.includes('server on')) { clearTimeout(timer); child.stdout.off('data', inspect); resolve(); } };
    child.stdout.on('data', inspect); child.once('exit', () => { clearTimeout(timer); reject(Error(`Ranking fixture exited: ${logs}`)); }); inspect();
  });
  const origin = `http://127.0.0.1:${port}`;
  const login = await devLogin(origin, 'Tonarium Ranking Nick');
  socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Origin: origin, ...login.headers } });
  const messages: { t: string; rows?: FantasyRankingRow[]; [key: string]: unknown }[] = [];
  socket.on('message', raw => messages.push(JSON.parse(String(raw))));
  await new Promise<void>((resolve, reject) => { socket!.once('open', resolve); socket!.once('error', reject); });
  const send = (message: unknown) => socket!.send(JSON.stringify(message));
  const wait = (type: string, from = 0) => new Promise<(typeof messages)[number]>((resolve, reject) => {
    const timer = setTimeout(() => { socket!.off('message', inspect); reject(Error(`Missing ${type}: ${logs}`)); }, 6000);
    const inspect = () => { const found = messages.slice(from).find(message => message.t === type); if (found) { clearTimeout(timer); socket!.off('message', inspect); resolve(found); } }; socket!.on('message', inspect); inspect();
  });
  const barrier = () => new Promise<void>((resolve, reject) => { const marker = Buffer.from(crypto.randomUUID()), timer = setTimeout(() => reject(Error('Ranking barrier timed out')), 4000); socket!.once('pong', () => { clearTimeout(timer); resolve(); }); socket!.ping(marker); });
  send({ t: 'hello', compat: COMPAT_VERSION, id: 'ranking-home', name: 'Tonarium Ranking Nick' }); await wait('snapshot');
  send({ t: 'fantasyRankingRequest' }); await barrier(); assert.ok(!messages.some(message => message.t === 'fantasyRanking'));
  send({ t: 'join', sid: 'ranking-world' });
  await wait('fantasyProfile');
  send({ t: 'fantasyAction', revision: 0, action: { type: 'create', source: 'human', name: 'Private Character Name', gender: 'female' } });
  await barrier(); const from = messages.length;
  send({ t: 'fantasyRankingRequest', score: 999999 }); await barrier(); assert.ok(!messages.slice(from).some(message => message.t === 'fantasyRanking'));
  send({ t: 'fantasyRankingRequest' }); const message = await wait('fantasyRanking', from), row = message.rows![0];
  assert.ok(row); assert.deepEqual(Object.keys(row).sort(), ['job', 'nickname', 'race', 'score']); assert.equal(row.nickname, 'Tonarium Ranking Nick'); assert.ok(Number.isSafeInteger(row.score) && row.score < 999999);
  assert.ok(!JSON.stringify(message).includes('Private Character Name')); assert.ok(!JSON.stringify(message).includes(login.id));
});
