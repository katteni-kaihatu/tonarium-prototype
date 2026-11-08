import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import type { TestContext } from 'node:test';
import { WebSocket } from 'ws';
import { testServerEnv } from './test-db.ts';
import { devLogin } from './test-auth.ts';
import { KokosyncClient } from '../vendor/kokosync/index.js';
import { COMPAT_VERSION, type RoomClientMsg, type SessionSnapshot } from '../shared/protocol.ts';
import { importKey, open, PACKET_TOPIC, receiveBlob, seal, sendPacket, type Envelope, type SyncConfig } from '../shared/session-wire.ts';
import type { BattlefieldState } from '../shared/battlefield.ts';

export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export async function until<T>(read: () => T | undefined, timeout = 20000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = read(); if (value !== undefined) return value; await delay(10); }
  throw new Error('Battlefield playtest timed out');
}
export async function battlefieldPlaytest(t: Pick<TestContext, 'after'>, options: { fixedClock?: boolean; benchmark?: boolean } = {}) {
  const env = await testServerEnv(t as TestContext);
  const listener = net.createServer();
  await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => listener.close(() => resolve()));
  const data = await mkdtemp(path.join(os.tmpdir(), 'tonarium-battlefield-'));
  const sessions = [{ id: 'battle-test', name: 'Battle test', world: 'battlefield' }, { id: 'other-test', name: 'Other', world: 'battlefield' }];
  const sessionsFile = path.join(data, 'sessions.json');
  await writeFile(sessionsFile, JSON.stringify({ name: 'test', sessions }));
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, ...env, NODE_ENV: 'test', SERVER_PORT: String(port), DATA_DIR: data, SESSIONS_FILE: sessionsFile,
      LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '', BATTLEFIELD_TEST_CLOCK: options.fixedClock ? '1' : '0', BATTLEFIELD_BENCHMARK: options.benchmark ? '1' : '0' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let ready = false;
  let errors = 0;
  const metrics: { at: number; durationMs: number }[] = [];
  const inputMetrics: { at: number; durationMs: number; accepted: boolean }[] = [];
  child.stdout!.on('data', chunk => { if (String(chunk).includes('server on')) ready = true; });
  child.stderr!.on('data', chunk => { if (/bad room message|uncaught|unhandled/i.test(String(chunk))) errors++; });
  child.on('message', message => {
    const m = message as { type?: string; at: number; durationMs: number; accepted: boolean };
    if (m.type === 'battlefieldMetrics') metrics.push({ at: m.at, durationMs: m.durationMs });
    if (m.type === 'battlefieldInputMetrics') inputMetrics.push({ at: m.at, durationMs: m.durationMs, accepted: m.accepted });
  });
  t.after(async () => {
    child.kill(); await until(() => child.exitCode !== null || child.signalCode ? true : undefined, 5000).catch(() => child.kill('SIGKILL'));
    if (path.dirname(data) !== path.resolve(os.tmpdir()) || !path.basename(data).startsWith('tonarium-battlefield-')) throw new Error('Unexpected playtest directory');
    await rm(data, { recursive: true, force: true });
  });
  await until(() => ready ? true : undefined);
  const base = `http://127.0.0.1:${port}`;
  async function peer(name: string, target?: string) {
    const login = await devLogin(base, name);
    let home!: WebSocket;
    const replies: any[] = [];
    async function connectHome() {
      home = new WebSocket(base.replace('http', 'ws') + '/ws', { headers: login.headers });
      home.on('message', bytes => replies.push(JSON.parse(bytes.toString())));
      await new Promise<void>((resolve, reject) => { home.once('open', resolve); home.once('error', reject); });
      home.send(JSON.stringify({ t: 'hello', compat: COMPAT_VERSION }));
    }
    await connectHome();
    t.after(() => home.close());
    if (!target) {
      const requestId = crypto.randomUUID();
      home.send(JSON.stringify({ t: 'sessionCreate', requestId, name: 'Battlefield playtest', visibility: 'public', world: 'battlefield' }));
      target = (await until(() => replies.find(m => m.t === 'sessionCreated' && m.requestId === requestId))).sid;
    }
    const sid = target!;
    home.send(JSON.stringify({ t: 'join', sid }));
    let sync: KokosyncClient | null = null;
    let config: SyncConfig, key: CryptoKey, sequence = 0;
    let snapshot: SessionSnapshot | undefined, state: BattlefieldState | null = null;
    let receivedBytes = 0, sentBytes = 0;
    const versions = new Map<number, string>();
    let inconsistencies = 0, transportErrors = 0;
    async function connect() {
      sync?.close();
      const requestId = crypto.randomUUID();
      home.send(JSON.stringify({ t: 'prepareSync', requestId, peerPositions: true, peerDelivery: true }));
      const reply = await until(() => replies.find(m => m.requestId === requestId));
      if (reply.t !== 'syncConfig') throw new Error('Battlefield sync configuration failed');
      config = reply.config; key = await importKey(config.key); sequence = 0;
      const connection = await KokosyncClient.connect({ url: base, room: config.room, peer: config.peer, transport: 'websocket', timeout: 20000,
        websocketUrl: `/sync/ws?token=${config.token}`, websocketFactory: url => {
          const socket = new WebSocket(url, { origin: base });
          socket.on('message', bytes => { receivedBytes += Buffer.byteLength(bytes as Buffer); });
          socket.on('error', () => transportErrors++);
          const original = socket.send.bind(socket);
          socket.send = ((bytes: any, ...args: any[]) => { sentBytes += Buffer.byteLength(bytes); return (original as any)(bytes, ...args); }) as typeof socket.send;
          return socket as unknown as globalThis.WebSocket;
        } });
      sync = connection; snapshot = undefined;
      let incoming = Promise.resolve();
      const receive = (packet: unknown, sender: string) => {
        const job = incoming.then(async () => {
          if (sender !== config.server || (packet as Envelope)?.grant !== config.token) return;
          const result = await open(key, config.token, 'server', packet);
          if (result.value.kind === 'snapshot') { snapshot = result.value.snapshot; state = snapshot!.battlefield ?? null; }
          else if (result.value.message?.t === 'battlefield') state = result.value.message.state;
          if (state) {
            const serialized = JSON.stringify(state), old = versions.get(state.revision);
            if (old && old !== serialized) inconsistencies++;
            versions.set(state.revision, serialized);
          }
        });
        incoming = job.catch(() => { transportErrors++; }); return job;
      };
      connection.on('message', f => { if (f.topic === PACKET_TOPIC) void receive(f.value, f.peer); });
      connection.on('blob_open', f => receiveBlob(connection, f, sender => sender === config.server, receive));
      await send({ t: 'sync' });
      await until(() => snapshot);
    }
    async function send(message: RoomClientMsg) {
      if (!sync) throw new Error('Disconnected playtest peer');
      await sendPacket(sync, config.server, await seal(key, config.token, 'client', ++sequence, message));
    }
    t.after(() => sync?.close());
    await connect();
    return { id: login.id, sid, get home() { return home; }, send, reconnect: connect, versions,
      disconnect: async () => {
        sync?.close(); sync = null;
        const closed = new Promise<void>(resolve => home.once('close', () => resolve()));
        home.close(); await closed;
        state = null; snapshot = undefined;
      },
      rejoin: async () => {
        await connectHome();
        const requestId = crypto.randomUUID();
        home.send(JSON.stringify({ t: 'join', sid, requestId }));
        await until(() => replies.find(m => m.t === 'sessionResult' && m.requestId === requestId));
        await connect();
      },
      get state() { return state; }, get snapshot() { return snapshot!; }, get config() { return config; },
      traffic: () => ({ receivedBytes, sentBytes, errors: transportErrors, inconsistencies }) };
  }
  return { base, peer, metrics, inputMetrics, errors: () => errors, advance: async (ms: number) => {
    child.send({ type: 'battlefieldAdvance', ms }); await delay(30);
  } };
}
