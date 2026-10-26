import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { WebSocket } from 'ws';
import { COMPAT_VERSION, type ServerMsg, type SessionDef } from '../shared/protocol.ts';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until<T>(read: () => T | undefined): Promise<T> {
  const end = Date.now() + 10_000;
  while (Date.now() < end) {
    const value = read();
    if (value !== undefined) return value;
    await delay(25);
  }
  throw new Error('Timed out waiting for session response');
}

test('shared targets use filtered lists and server join authorization', { timeout: 35_000 }, async (t) => {
  const data = await mkdtemp(path.join(os.tmpdir(), 'tonarium-links-'));
  t.after(() => rm(data, { recursive: true, force: true }));
  const sessions: SessionDef[] = ['public', 'friends', 'group', 'groupPlus', 'invite'].map((visibility) => ({
    id: visibility, name: visibility, visibility: visibility as SessionDef['visibility'], owner: 'owner', group: 'team', invited: ['invited'],
  }));
  await writeFile(path.join(data, 'sessions.json'), JSON.stringify({ name: 'Test', sessions }));
  await writeFile(path.join(data, 'home.json'), JSON.stringify({ sessions: [], events: [], renamed: {}, groups: [
    { id: 'team', name: 'Team', color: '#000', owner: 'member', members: ['member'], channels: [] },
  ] }));
  const listener = net.createServer();
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, SERVER_PORT: String(port), DATA_DIR: data, SESSIONS_FILE: path.join(data, 'sessions.json'), LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let ready = false;
  child.stdout.on('data', (chunk: Buffer) => { if (chunk.toString().includes('server on http://')) ready = true; });
  child.stderr.resume();
  t.after(async () => {
    if (child.exitCode !== null) return;
    await new Promise<void>((resolve) => { child.once('exit', () => resolve()); child.kill(); });
  });
  await until(() => ready ? true : undefined);
  for (const name of ['stranger', 'owner', 'invited', 'member']) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    t.after(() => ws.terminate());
    const messages: ServerMsg[] = [];
    ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
    await new Promise<void>((resolve) => ws.once('open', resolve));
    ws.send(JSON.stringify({ t: 'hello', id: name, name, compat: COMPAT_VERSION }));
    const snapshot = await until(() => messages.find((m) => m.t === 'snapshot'));
    assert.equal(snapshot.t, 'snapshot');
    if (snapshot.t !== 'snapshot') throw new Error('Expected snapshot');
    for (const sid of [...sessions.map((s) => s.id), 'deleted-or-missing']) {
      const allowed = sid !== 'deleted-or-missing' && (sid === 'public' || name === 'owner' || name === 'invited' || (name === 'member' && ['group', 'groupPlus'].includes(sid)));
      assert.equal(snapshot.s.guild.sessions.some((s) => s.id === sid), allowed);
      const requestId = crypto.randomUUID();
      ws.send(JSON.stringify({ t: 'join', sid, requestId }));
      const reply = await until(() => messages.find((m) => m.t === 'sessionResult' && m.requestId === requestId));
      assert.equal(reply.t, 'sessionResult');
      if (reply.t === 'sessionResult') assert.equal(!reply.error, allowed, `${name} joining ${sid}`);
    }
    ws.close();
  }
});
