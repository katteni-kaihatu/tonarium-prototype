import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { WebSocket } from 'ws';
import { COMPAT_VERSION, dmKey } from '../shared/protocol.ts';
import { createTranslationClient } from '../client/src/translation.ts';

async function until(check: () => boolean) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail('Timed out waiting for chat');
}

for (const mode of ['mock', 'missing', 'failed'] as const) {
  test(`chat send/receive continues with ${mode} translation`, { timeout: 30000 }, async (t) => {
    const data = await mkdtemp(path.join(os.tmpdir(), 'tonarium-translation-'));
    await writeFile(path.join(data, 'sessions.json'), JSON.stringify({ name: 'Test', sessions: [] }));
    await writeFile(path.join(data, 'friends.json'), JSON.stringify([['Alice', 'Bob']]));
    const listener = net.createServer();
    await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
    const port = (listener.address() as net.AddressInfo).port;
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    const base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      env: { ...process.env, OPENAPI_KEY: '', CHAT_TRANSLATION_PROVIDER: mode === 'missing' ? 'openai' : 'mock', CHAT_TRANSLATION_MOCK_FAILURE: mode === 'failed' ? '1' : '0', SERVER_PORT: String(port), DATA_DIR: data, SESSIONS_FILE: path.join(data, 'sessions.json'), LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let ready = false;
    child.stdout.on('data', (chunk: Buffer) => { if (chunk.toString().includes('server on')) ready = true; });
    child.stderr.resume();
    const sockets: WebSocket[] = [];
    t.after(async () => {
      for (const socket of sockets) socket.terminate();
      if (child.exitCode === null && child.signalCode === null) await new Promise<void>((resolve) => { child.once('exit', () => resolve()); child.kill(); });
      await rm(data, { recursive: true, force: true });
    });
    await until(() => ready);
    async function peer(name: string) {
      const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
      sockets.push(ws);
      const messages: any[] = [];
      ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
      await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
      ws.send(JSON.stringify({ t: 'hello', id: name, name, compat: COMPAT_VERSION }));
      await until(() => messages.some((m) => m.t === 'snapshot'));
      return { ws, messages };
    }
    const alice = await peer('Alice'), bob = await peer('Bob');
    const conv = dmKey('Alice', 'Bob');
    alice.ws.send(JSON.stringify({ t: 'msg', conv, text: 'Hello' }));
    await until(() => bob.messages.some((m) => m.t === 'msg' && m.m.text === 'Hello'));
    const client = createTranslationClient((_, init) => fetch(`${base}/api/translate`, init));
    await client.load('Hello', 'ja');
    assert.deepEqual(client.get('Hello', 'ja'), mode === 'mock'
      ? { text: 'こんにちは', sourceLanguage: 'en', status: 'translated' }
      : { text: 'Hello', sourceLanguage: null, status: mode === 'missing' ? 'unavailable' : 'failed' });
    await client.load('Hello', 'ko');
    assert.equal(client.get('Hello', 'ko')?.text, mode === 'mock' ? '안녕하세요' : 'Hello');
    bob.ws.send(JSON.stringify({ t: 'msg', conv, text: 'ありがとう' }));
    await until(() => alice.messages.some((m) => m.t === 'msg' && m.m.text === 'ありがとう'));
    alice.ws.send(JSON.stringify({ t: 'msg', conv, text: 'next message' }));
    await until(() => bob.messages.some((m) => m.t === 'msg' && m.m.text === 'next message'));
    assert.equal(alice.ws.readyState, WebSocket.OPEN);
    assert.equal(bob.ws.readyState, WebSocket.OPEN);
    assert.equal(bob.messages.find((m) => m.t === 'msg' && m.m.text === 'Hello').m.text, 'Hello');
  });
}
