import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, writeFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { testServerEnv } from './test-db.ts';
import { devLogin } from './test-auth.ts';
import { WebSocket } from 'ws';
import { COMPAT_VERSION, dmKey, type ServerMsg } from '../shared/protocol.ts';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until<T>(read: () => T | undefined | false): Promise<T> {
  const end = Date.now() + 10_000;
  while (Date.now() < end) {
    const value = read();
    if (value !== undefined && value !== false) return value;
    await delay(25);
  }
  throw new Error('Timed out');
}

test('people are kept by account ID: renaming keeps follows, DMs, groups and icons; old name-keyed data is archived', { timeout: 60_000 }, async (t) => {
  const dbEnv = await testServerEnv(t);
  const data = await mkdtemp(path.join(os.tmpdir(), 'tonarium-ids-'));
  t.after(() => rm(data, { recursive: true, force: true }));
  await writeFile(path.join(data, 'sessions.json'), JSON.stringify({ name: 'Test', sessions: [] }));
  // 名前で持っていた頃のデータは、最初の起動で退避される
  await writeFile(path.join(data, 'follows.json'), JSON.stringify([['Old', 'Name']]));
  const listener = net.createServer();
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, ...dbEnv, SERVER_PORT: String(port), DATA_DIR: data, SESSIONS_FILE: path.join(data, 'sessions.json'), LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let ready = false;
  child.stdout.on('data', (chunk: Buffer) => { if (chunk.toString().includes('server on http://')) ready = true; });
  child.stderr.resume();
  t.after(async () => {
    if (child.exitCode !== null) return;
    await new Promise<void>((resolve) => { child.once('exit', () => resolve()); child.kill(); });
  });
  await until(() => ready);

  const archived = (await readdir(data)).find((n) => n.startsWith('archive-'));
  assert.ok(archived, 'old data is moved to archive-*');
  assert.ok(await stat(path.join(data, archived!, 'follows.json')));
  await assert.rejects(stat(path.join(data, 'follows.json')));

  async function peer(name: string) {
    const login = await devLogin(base, name);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: login.headers });
    t.after(() => ws.terminate());
    const messages: ServerMsg[] = [];
    ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
    await new Promise<void>((resolve) => ws.once('open', resolve));
    ws.send(JSON.stringify({ t: 'hello', compat: COMPAT_VERSION }));
    await until(() => messages.some((m) => m.t === 'snapshot'));
    const last = <K extends ServerMsg['t']>(t: K) => [...messages].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: K }> | undefined;
    return { ...login, ws, messages, last, send: (m: unknown) => ws.send(JSON.stringify(m)) };
  }

  // 同じ表示名でも、アカウントが違えば別人
  const a = await peer('Same');
  const b = await peer('Other');
  await until(() => b.last('directory')?.list.find((e) => e.id === a.id));
  assert.notEqual(a.id, b.id);

  a.send({ t: 'followUser', to: b.id, on: true });
  b.send({ t: 'followUser', to: a.id, on: true });
  await until(() => a.last('friends')?.ids.includes(b.id));
  const conv = dmKey(a.id, b.id);
  a.send({ t: 'msg', conv, text: 'hi' });
  await until(() => b.messages.find((m) => m.t === 'msg' && m.conv === conv && m.m.from === a.id));
  a.send({ t: 'groupCreate', name: 'Team', color: '#2F5FC4' });
  const group = await until(() => b.last('groups')?.list.find((g) => g.name === 'Team'));
  assert.deepEqual([group.owner, group.members], [a.id, [a.id]]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1]);
  assert.equal((await fetch(`${base}/icon`, { method: 'POST', body: jpeg, headers: a.headers })).status, 200);

  // 名前を変えても、フォロー・DM・グループ・アイコンは ID についたまま
  const renamed = await fetch(`${base}/auth/name`, { method: 'POST', body: JSON.stringify({ name: 'Renamed' }), headers: { ...a.headers, 'Content-Type': 'application/json', Origin: base } });
  assert.equal(renamed.status, 200);
  await until(() => b.messages.find((m) => m.t === 'directory' && !m.full && m.list.some((e) => e.id === a.id && e.name === 'Renamed')));
  const again = await peer('Other');
  assert.ok(again.last('snapshot')!.s.friends.includes(a.id));
  assert.equal(again.last('inbox')!.convs[conv]?.[0]?.from, a.id);
  assert.ok(again.last('groups') === undefined || again.last('groups')!.list.some((g) => g.owner === a.id));
  assert.ok(again.last('snapshot')!.s.groups.some((g) => g.owner === a.id && g.members.includes(a.id)));
  assert.equal(again.last('directory')!.list.find((e) => e.id === a.id)?.name, 'Renamed');
  assert.equal((await fetch(`${base}/icon?id=${a.id}`)).status, 200);
});
