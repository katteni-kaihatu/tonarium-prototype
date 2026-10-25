import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import { COMPAT_VERSION, type ClientMsg, type ServerMsg, type SessionDef, type EventDef } from '../shared/protocol.ts';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean | Promise<boolean>) {
  const end = Date.now() + 10_000;
  while (Date.now() < end) {
    if (await check()) return;
    await delay(25);
  }
  assert.fail('Timed out waiting for session state');
}

test('empty user sessions expire; joins, fixed sessions and manual deletion keep their behavior', { timeout: 35_000 }, async (t) => {
  const data = await mkdtemp(path.join(os.tmpdir(), 'tonarium-empty-'));
  t.after(() => rm(data, { recursive: true, force: true }));
  const fixed = { id: 'fixed', name: 'Fixed' };
  const restored = { id: 'restored', name: 'Restored', owner: 'owner', visibility: 'public' };
  const manual = { ...restored, id: 'manual', name: 'Manual' };
  const events = [restored, manual].map((s) => ({ id: s.id, title: s.name, at: Date.now(), group: null, session: s.id, owner: 'owner', attendees: [], maybe: [], declined: [] }));
  await writeFile(path.join(data, 'sessions.json'), JSON.stringify({ name: 'Test', sessions: [fixed] }));
  await writeFile(path.join(data, 'home.json'), JSON.stringify({ sessions: [restored, manual], groups: [], events, renamed: {} }));
  await writeFile(path.join(data, 'items.json'), JSON.stringify(Object.fromEntries([restored, manual].map((s) => [s.id, [{ id: 'canvas', kind: 'canvas', x: 0, z: 0, ry: 0, strokes: [] }]]))));
  // 本番の TTL は変えず、子プロセス内の空セッション用タイマーだけ短縮する。
  const preload = path.join(data, 'short-ttl.mjs');
  await writeFile(preload, `const original = globalThis.setTimeout; globalThis.setTimeout = (fn, ms, ...args) => original(fn, ms === 300000 ? 1500 : ms, ...args);`);
  const listener = net.createServer();
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, '--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, SERVER_PORT: String(port), DATA_DIR: data, SESSIONS_FILE: path.join(data, 'sessions.json'), LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let ready = false;
  const deletions: string[] = [];
  child.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    if (text.includes('server on http://')) ready = true;
    deletions.push(...text.split('\n').filter((line) => line.startsWith('session auto-delete:')));
  });
  child.stderr.resume();
  t.after(async () => {
    if (child.exitCode !== null) return;
    await new Promise<void>((resolve) => { child.once('exit', () => resolve()); child.kill(); });
  });
  await until(() => ready);
  async function peer(id: string) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    t.after(() => ws.terminate());
    let sessions: SessionDef[] = [], events: EventDef[] = [], info: Record<string, unknown> = {};
    let snapshot = false;
    const users = new Map<string, string | null>();
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMsg;
      if (msg.t === 'snapshot') { sessions = msg.s.guild.sessions; events = msg.s.events; info = msg.s.sessions; snapshot = true; }
      if (msg.t === 'sessions') sessions = msg.list;
      if (msg.t === 'events') events = msg.list;
      if (msg.t === 'sessionInfo') info = msg.sessions;
      if (msg.t === 'users') for (const u of msg.list) users.set(u.id, u.session);
    });
    await new Promise<void>((resolve) => ws.once('open', resolve));
    const send = (msg: ClientMsg) => ws.send(JSON.stringify(msg));
    send({ t: 'hello', id, name: id, compat: COMPAT_VERSION });
    await until(() => snapshot);
    return { ws, send, users, sessions: () => sessions, events: () => events, info: () => info };
  }
  const owner = await peer('owner'), observer = await peer('observer');
  const has = (p: typeof owner, id: string) => p.sessions().some((s) => s.id === id);
  owner.send({ t: 'join', sid: 'manual' });
  await until(() => owner.users.get('owner') === 'manual');
  observer.send({ t: 'sessionDelete', id: 'manual' });
  owner.send({ t: 'sessionDelete', id: 'manual' });
  await delay(100);
  assert.ok(has(owner, 'manual'), 'occupied session cannot be deleted');
  owner.send({ t: 'leave' });
  await until(() => owner.users.get('owner') === null);
  observer.send({ t: 'sessionDelete', id: 'manual' });
  await delay(100);
  assert.ok(has(owner, 'manual'), 'only the owner may delete');
  owner.send({ t: 'sessionDelete', id: 'manual' });
  await until(() => !has(owner, 'manual') && !has(observer, 'manual'));
  await until(() => !has(owner, 'restored') && !has(observer, 'restored'));
  await until(() => !('restored' in owner.info()) && !('manual' in owner.info()) && owner.events().every((e) => e.session === null));
  async function create(name: string) {
    owner.send({ t: 'sessionCreate', name, topic: '', world: 'room', visibility: 'public' });
    await until(() => owner.sessions().some((s) => s.name === name));
    return owner.sessions().find((s) => s.name === name)!.id;
  }
  const untouched = await create('Untouched');
  await until(() => !has(owner, untouched) && !has(observer, untouched));
  const active = await create('Active');
  owner.send({ t: 'join', sid: active });
  await until(() => owner.users.get('owner') === active);
  owner.send({ t: 'leave' });
  await until(() => owner.users.get('owner') === null);
  await delay(750);
  owner.send({ t: 'join', sid: active });
  await until(() => owner.users.get('owner') === active);
  await delay(1800);
  assert.ok(has(observer, active), 'rejoining cancels expiration');
  owner.send({ t: 'leave' });
  await until(() => owner.users.get('owner') === null);
  await delay(750);
  assert.ok(has(observer, active), 'the next empty period gets a fresh TTL');
  await until(() => !has(observer, active));
  const disconnected = await create('Disconnected');
  owner.send({ t: 'join', sid: disconnected });
  await until(() => observer.users.get('owner') === disconnected);
  owner.ws.close();
  await until(() => !has(observer, disconnected));
  assert.ok(has(observer, 'fixed'), 'sessions.json sessions never expire');
  await until(async () => {
    const saved = JSON.parse(await readFile(path.join(data, 'home.json'), 'utf8'));
    const items = JSON.parse(await readFile(path.join(data, 'items.json'), 'utf8'));
    return saved.sessions.length === 0 && saved.events.every((e: EventDef) => e.session === null) && !items.restored && !items.manual;
  });
  assert.equal(deletions.length, 4);
  assert.ok(deletions.every((line) => line.includes('empty for 5min')));
  assert.ok(deletions.some((line) => line.includes('Restored')));
  assert.ok(!deletions.some((line) => line.includes('Manual')));
});
