import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { COMPAT_VERSION, type User, type SessionSnapshot } from '../shared/protocol.ts';
import { WORLD_COUNTDOWN_MS } from '../shared/worlds.ts';
import type { FantasyAccountResponse } from '../shared/fantasy-account.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';

interface Message {
  t: string; list?: User[]; account?: FantasyAccountResponse['account']; activeId?: string; homeId?: string;
  user?: User; profile?: FantasyProfile; world?: string; at?: number; sid?: string; requestId?: string;
  error?: string;
  config?: { token: string; sid: string; user: string }; snapshot?: SessionSnapshot;
}
const privateTypes = new Set(['fantasyProfile', 'fantasyRealmState', 'fantasyContractBoard', 'fantasyPartyState', 'fantasyPropertyState', 'fantasyCombatState', 'fantasyLegacies', 'communityState']);

async function fixture(t: TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-world-switch-'));
  const sessions = path.join(directory, 'sessions.json');
  fs.writeFileSync(sessions, JSON.stringify({ name: 'World switch fixture', sessions: [
    { id: 'switching', name: 'Switching room', world: 'room' }, { id: 'fantasy', name: 'Fantasy room', world: 'fantasy' },
  ] }));
  // 部屋の通信だけをローカルに置き換え、ホーム WS とワールド変更の本体は実サーバーを通す。
  const transport = `
    import { WebSocketServer, WebSocket } from ${JSON.stringify(import.meta.resolve('ws'))};
    import { randomUUID } from 'node:crypto';
    const grants = new Map();
    const wss = new WebSocketServer({ noServer: true });
    export function livekitRoom(sid) { return sid; }
    export async function createSyncGrant(sid, user, owner, handlers, reset) {
      const token = randomUUID(), config = { token, sid, user };
      grants.set(token, { config, owner, handlers, reset, sockets: new Set() });
      return config;
    }
    function revoke(test) {
      for (const [token, grant] of grants) if (test(grant)) {
        grants.delete(token);
        for (const socket of grant.sockets) socket.close(1000, 'Session ended');
      }
    }
    export function revokeSync(owner) { revoke(grant => grant.owner === owner); }
    export function revokeUserSync(user) { revoke(grant => grant.config.user === user); }
    export function upgradeSync(req, socket, head) {
      const token = new URL(req.url, 'http://local').searchParams.get('token'), grant = grants.get(token);
      if (!grant) { socket.destroy(); return; }
      wss.handleUpgrade(req, socket, head, ws => {
        grant.sockets.add(ws); ws.on('error', () => {});
        ws.on('close', () => grant.sockets.delete(ws));
        ws.on('message', raw => grant.handlers.onMessage(grant.config.sid, grant.config.user, JSON.parse(String(raw)), false));
      });
    }
    export function roomSend(sid, message, recipients) {
      for (const grant of grants.values()) if (grant.config.sid === sid && (!recipients || recipients.includes(grant.config.user)))
        for (const socket of grant.sockets) if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    }
    export function roomSendSnapshot(sid, user, snapshot) { roomSend(sid, { t: 'sessionSnapshot', snapshot }, [user]); }
    export async function handleSyncOffer(req, res) { res.writeHead(404).end(); }
    export async function leaveRoom() {}
    export async function shutdownRooms() { for (const socket of wss.clients) socket.terminate(); wss.close(); }
  `;
  const loader = path.join(directory, 'room-transport.mjs');
  fs.writeFileSync(loader, `import { registerHooks } from 'node:module';
    registerHooks({
      resolve(specifier, context, next) {
        if (specifier === './rooms.ts' && context.parentURL === ${JSON.stringify(pathToFileURL(path.resolve('server/index.ts')).href)})
          return { url: 'tonarium-world-test:rooms', shortCircuit: true };
        return next(specifier, context);
      },
      load(url, context, next) {
        if (url === 'tonarium-world-test:rooms') return { format: 'module', source: ${JSON.stringify(transport)}, shortCircuit: true };
        return next(url, context);
      }
    });`);
  const probe = net.createServer();
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', '--import', pathToFileURL(loader).href, 'server/index.ts', '--dev'], {
    env: { ...process.env, NODE_ENV: 'test', FANTASY_ACCOUNT_TEST_BYPASS: '0', SERVER_PORT: String(port), DATA_DIR: directory, SESSIONS_FILE: sessions,
      LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '', KOKOAAI_APIKEY: '' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', data => { logs += String(data); }); child.stderr.on('data', data => { logs += String(data); });
  const sockets: WebSocket[] = [];
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    if (child.exitCode === null && !child.signalCode) {
      child.kill();
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 4000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
    const relative = path.relative(os.tmpdir(), directory);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(directory).startsWith('tonarium-world-switch-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(`World fixture startup timed out: ${logs}`)), 20000);
    const inspect = () => { if (logs.includes('server on')) { clearTimeout(timer); child.stdout.off('data', inspect); resolve(); } };
    child.stdout.on('data', inspect); child.once('exit', () => { clearTimeout(timer); reject(Error(`World fixture exited: ${logs}`)); }); inspect();
  });
  async function account(action: string, body?: unknown, cookie = '') {
    const response = await fetch(`${origin}/api/fantasy/account/${action}`, {
      method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.status, 200);
    return { body: await response.json() as FantasyAccountResponse, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' };
  }
  async function peer(id: string, name = id) {
    const socket = new WebSocket(`${origin.replace('http', 'ws')}/ws`, { headers: { Origin: origin } }); sockets.push(socket);
    const messages: Message[] = []; socket.on('message', raw => messages.push(JSON.parse(String(raw)) as Message));
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const send = (message: unknown) => socket.send(JSON.stringify(message));
    const wait = (predicate: (message: Message) => boolean, from = 0, timeout = 7000) => new Promise<Message>((resolve, reject) => {
      const current = messages.slice(from).find(predicate); if (current) { resolve(current); return; }
      const timer = setTimeout(() => { socket.off('message', inspect); reject(Error(`World fixture message timed out for ${predicate}: ${messages.slice(from).map(message => message.t).join(',')}; ${logs}`)); }, timeout);
      const inspect = () => { const found = messages.slice(from).find(predicate); if (found) { clearTimeout(timer); socket.off('message', inspect); resolve(found); } };
      socket.on('message', inspect); inspect();
    });
    const barrier = () => new Promise<void>((resolve, reject) => {
      const marker = Buffer.from(crypto.randomUUID()), timer = setTimeout(() => { socket.off('pong', done); reject(Error('World fixture barrier timed out')); }, 5000);
      const done = (data: Buffer) => { if (data.equals(marker)) { clearTimeout(timer); socket.off('pong', done); resolve(); } }; socket.on('pong', done); socket.ping(marker);
    });
    async function sync() {
      const requestId = crypto.randomUUID(); send({ t: 'prepareSync', requestId });
      const config = (await wait(message => message.t === 'syncConfig' && message.requestId === requestId)).config!;
      const room = new WebSocket(`${origin.replace('http', 'ws')}/sync/ws?token=${config.token}`); sockets.push(room);
      const received: Message[] = []; room.on('message', raw => received.push(JSON.parse(String(raw)) as Message));
      await new Promise<void>((resolve, reject) => { room.once('open', resolve); room.once('error', reject); });
      async function until(predicate: (message: Message) => boolean) {
        for (const _ of Array.from({ length: 150 })) {
          const found = received.find(predicate); if (found) return found;
          await new Promise(resolve => setTimeout(resolve, 30));
        }
        throw Error(`Room fixture timed out: ${received.map(message => message.t).join(',')}; ${logs}`);
      }
      room.send(JSON.stringify({ t: 'sync' }));
      const snapshot = (await until(message => message.t === 'sessionSnapshot')).snapshot!;
      return { room, received, config, snapshot, until, send: (message: unknown) => room.send(JSON.stringify(message)) };
    }
    send({ t: 'hello', compat: COMPAT_VERSION, id, name }); await wait(message => message.t === 'snapshot');
    return { id, name, socket, messages, send, wait, barrier, sync };
  }
  return { account, peer };
}

test('home observers retain both original identities while shared fantasy room actors stay deduplicated', { timeout: 30000 }, async t => {
  const f = await fixture(t), observer = await f.peer('observer'), alice = await f.peer('home-alice', 'Common Alice'), bob = await f.peer('home-bob', 'Common Bob');
  const registered = await f.account('register', { username: 'projection_owner', password: 'World fixture password 123' });
  const principal = registered.body.account!.principal;
  alice.send({ t: 'join', sid: 'fantasy' }); alice.send({ t: 'fantasyAccountBind', ticket: registered.body.ticket });
  await alice.wait(message => message.t === 'fantasyAccountState' && message.activeId === principal);
  const status = await f.account('status', undefined, registered.cookie), observedAt = observer.messages.length;
  bob.send({ t: 'join', sid: 'fantasy' }); bob.send({ t: 'fantasyAccountBind', ticket: status.body.ticket });
  await bob.wait(message => message.t === 'fantasyAccountState' && message.activeId === principal); await bob.barrier(); await observer.barrier();
  const homes = observer.messages.slice(observedAt).filter(message => message.t === 'users').at(-1)!.list!;
  assert.ok(homes.some(user => user.id === 'home-alice' && user.name === 'Common Alice' && user.session === 'fantasy'), 'observer must retain Alice home identity');
  assert.ok(homes.some(user => user.id === 'home-bob' && user.name === 'Common Bob' && user.session === 'fantasy'), 'observer must retain Bob home identity');
  assert.ok(homes.every(user => !user.id.startsWith('fantasy:')));
  const local = bob.messages.filter(message => message.t === 'users').at(-1)!.list!;
  for (const id of ['home-alice', 'home-bob']) assert.ok(local.some(user => user.id === id && user.session === null));
  assert.equal(local.filter(user => user.id === principal && user.session === 'fantasy').length, 1);
  assert.equal(local.find(user => user.id === principal)?.name, 'Common Bob');
  const room = await bob.sync(); assert.equal(room.config.user, principal);
  assert.deepEqual(Object.keys(room.snapshot.presence), [principal]);
});

test('live room world changes bind and restore existing authenticated tabs while anonymous visitors stay private', { timeout: 45000 }, async t => {
  const f = await fixture(t), observer = await f.peer('observer'), alice = await f.peer('home-alice', 'Common Alice'), bob = await f.peer('home-bob', 'Common Bob'), guest = await f.peer('guest');
  const registered = await f.account('register', { username: 'switch_owner', password: 'World fixture password 123' });
  const principal = registered.body.account!.principal, status = await f.account('status', undefined, registered.cookie);
  for (const [peer, ticket] of [[alice, registered.body.ticket], [bob, status.body.ticket]] as const) {
    peer.send({ t: 'join', sid: 'switching' }); peer.send({ t: 'fantasyAccountBind', ticket }); await peer.barrier();
  }
  guest.send({ t: 'join', sid: 'switching' }); await guest.barrier();
  const initial = await alice.sync(), enteredAt = alice.messages.length, bobEnteredAt = bob.messages.length, guestEnteredAt = guest.messages.length;
  const switchingAt = Date.now(); initial.send({ t: 'world', world: 'fantasy' });
  const countdown = await initial.until(message => message.t === 'worldPending');
  assert.ok(countdown.at! >= switchingAt + WORLD_COUNTDOWN_MS - 100);
  const identity = await alice.wait(message => message.t === 'fantasyAccountState' && message.activeId === principal, enteredAt);
  assert.ok(Date.now() >= countdown.at! - 100); assert.equal(identity.homeId, alice.id);
  await bob.wait(message => message.t === 'fantasyAccountState' && message.activeId === principal, bobEnteredAt);
  const empty = (await alice.wait(message => message.t === 'fantasyProfile', enteredAt)).profile!;
  await bob.wait(message => message.t === 'fantasyProfile', bobEnteredAt);
  const guestIdentity = await guest.wait(message => message.t === 'fantasyAccountState', guestEnteredAt);
  assert.equal(guestIdentity.activeId, 'guest'); assert.equal(guestIdentity.account, null);
  assert.deepEqual(guest.messages.slice(guestEnteredAt).filter(message => privateTypes.has(message.t)), []);
  assert.notEqual(initial.room.readyState, WebSocket.OPEN);
  const fantasy = await alice.sync(); assert.equal(fantasy.config.user, principal); assert.equal(fantasy.snapshot.world, 'fantasy');
  assert.deepEqual(Object.keys(fantasy.snapshot.presence).sort(), ['guest', principal].sort());
  const createdAt = alice.messages.length;
  alice.send({ t: 'fantasyAction', revision: empty.revision, action: { type: 'create', name: 'Switch private hero', source: 'human', gender: 'female' } });
  await alice.wait(message => message.t === 'fantasyProfile' && message.profile?.character?.name === 'Switch private hero', createdAt);
  assert.ok(!JSON.stringify(observer.messages).includes('Switch private hero'));
  const leftAt = alice.messages.length, bobLeftAt = bob.messages.length, guestLeftAt = guest.messages.length;
  const guestRoom = await guest.sync(); fantasy.send({ t: 'world', world: 'city' });
  await guestRoom.until(message => message.t === 'world' && message.world === 'city');
  for (const [peer, from] of [[alice, leftAt], [bob, bobLeftAt]] as const) {
    const restored = await peer.wait(message => message.t === 'fantasyAccountState' && message.activeId === peer.id, from);
    assert.equal(restored.account, null); assert.equal(restored.user?.name, peer.name); assert.equal(restored.user?.session, 'switching');
    const room = await peer.sync(); assert.equal(room.config.user, peer.id); assert.equal(room.snapshot.world, 'city');
    assert.deepEqual(Object.keys(room.snapshot.presence).sort(), ['guest', 'home-alice', 'home-bob']);
    const deniedAt = peer.messages.length; peer.send({ t: 'fantasyAction', revision: empty.revision, action: { type: 'sync' } }); await peer.barrier();
    assert.deepEqual(peer.messages.slice(deniedAt).filter(message => privateTypes.has(message.t)), []);
  }
  await guest.barrier(); assert.deepEqual(guest.messages.slice(guestLeftAt).filter(message => privateTypes.has(message.t)), []);
  assert.ok(alice.messages.filter(message => message.t === 'users').at(-1)!.list!.every(user => !user.id.startsWith('fantasy:')));
});

test('a live world change cannot move an account already occupying a different session', { timeout: 30000 }, async t => {
  const f = await fixture(t), alice = await f.peer('home-alice'), bob = await f.peer('home-bob');
  const registered = await f.account('register', { username: 'occupied_owner', password: 'World fixture password 123' });
  const principal = registered.body.account!.principal;
  alice.send({ t: 'join', sid: 'fantasy' }); alice.send({ t: 'fantasyAccountBind', ticket: registered.body.ticket });
  await alice.wait(message => message.t === 'fantasyAccountState' && message.activeId === principal);
  const originalRoom = await alice.sync(), status = await f.account('status', undefined, registered.cookie);
  bob.send({ t: 'join', sid: 'switching' }); bob.send({ t: 'fantasyAccountBind', ticket: status.body.ticket }); await bob.barrier();
  const switching = await bob.sync(), changedAt = bob.messages.length;
  switching.send({ t: 'world', world: 'fantasy' });
  const denied = await bob.wait(message => message.t === 'fantasyAccountState', changedAt);
  assert.equal(denied.activeId, bob.id); assert.equal(denied.account, null); assert.equal(denied.error, 'unavailable');
  assert.equal(originalRoom.room.readyState, WebSocket.OPEN);
  assert.deepEqual(bob.messages.slice(changedAt).filter(message => privateTypes.has(message.t)), []);
  const refreshed = await alice.sync(); assert.equal(refreshed.snapshot.sid, 'fantasy'); assert.deepEqual(Object.keys(refreshed.snapshot.presence), [principal]);
  const retry = await f.account('status', undefined, registered.cookie), retriedAt = bob.messages.length;
  bob.send({ t: 'fantasyAccountBind', ticket: retry.body.ticket });
  const stillDenied = await bob.wait(message => message.t === 'fantasyAccountState', retriedAt);
  assert.equal(stillDenied.activeId, bob.id); assert.equal(stillDenied.error, 'unavailable');
  assert.equal(originalRoom.room.readyState, WebSocket.OPEN);
  assert.deepEqual(bob.messages.slice(retriedAt).filter(message => privateTypes.has(message.t)), []);
  const joinedAt = bob.messages.length;
  bob.send({ t: 'join', sid: 'switching', requestId: 'occupied-account-join' });
  const joinDenied = await bob.wait(message => message.t === 'sessionResult' && message.requestId === 'occupied-account-join', joinedAt);
  assert.ok(joinDenied.error); assert.equal(originalRoom.room.readyState, WebSocket.OPEN);
  assert.deepEqual(bob.messages.slice(joinedAt).filter(message => privateTypes.has(message.t)), []);
});
