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
import type { FantasyProfile } from '../shared/fantasy.ts';
import { testServerEnv } from './test-db.ts';

interface Message {
  t: string; list?: User[];
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
    env: { ...process.env, ...(await testServerEnv(t)), TONARIUM_TEST_HELLO_ID: '1', NODE_ENV: 'test', SERVER_PORT: String(port), DATA_DIR: directory, SESSIONS_FILE: sessions,
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
  return { peer };
}


test('RPG room participants retain their distinct Tonarium identities',{timeout:30000},async t=>{
  const f=await fixture(t),observer=await f.peer('observer'),alice=await f.peer('home-alice','Common Alice'),bob=await f.peer('home-bob','Common Bob');
  for(const peer of [alice,bob]){peer.send({t:'join',sid:'fantasy'});await peer.wait(message=>message.t==='fantasyProfile');}
  await observer.barrier();await bob.barrier();
  const homes=observer.messages.filter(message=>message.t==='users').at(-1)!.list!;
  const local=bob.messages.filter(message=>message.t==='users').at(-1)!.list!;
  for(const list of [homes,local])for(const [id,name] of [['home-alice','Common Alice'],['home-bob','Common Bob']])
    assert.ok(list.some(user=>user.id===id&&user.name===name&&user.session==='fantasy'));
  const room=await bob.sync();assert.equal(room.config.user,bob.id);
  assert.deepEqual(Object.keys(room.snapshot.presence).sort(),[alice.id,bob.id].sort());
});

test('live world changes keep platform owners and private state across entry and exit',{timeout:45000},async t=>{
  const f=await fixture(t),observer=await f.peer('observer'),alice=await f.peer('home-alice','Common Alice'),bob=await f.peer('home-bob','Common Bob');
  for(const peer of [alice,bob]){peer.send({t:'join',sid:'switching'});await peer.barrier();}
  const initial=await alice.sync(),enteredAt=alice.messages.length,bobEnteredAt=bob.messages.length;
  const switchingAt=Date.now();initial.send({t:'world',world:'fantasy'});
  const countdown=await initial.until(message=>message.t==='worldPending');
  assert.ok(countdown.at!>=switchingAt+WORLD_COUNTDOWN_MS-100);
  const empty=(await alice.wait(message=>message.t==='fantasyProfile',enteredAt)).profile!;
  assert.ok(Date.now()>=countdown.at!-100);
  await bob.wait(message=>message.t==='fantasyProfile',bobEnteredAt);
  const fantasy=await alice.sync();assert.equal(fantasy.config.user,alice.id);assert.equal(fantasy.snapshot.world,'fantasy');
  assert.deepEqual(Object.keys(fantasy.snapshot.presence).sort(),[alice.id,bob.id].sort());
  const createdAt=alice.messages.length;
  alice.send({t:'fantasyAction',revision:empty.revision,action:{type:'create',name:'Switch private hero',source:'human',gender:'female'}});
  await alice.wait(message=>message.t==='fantasyProfile'&&message.profile?.character?.name==='Switch private hero',createdAt);
  assert.ok(!JSON.stringify(observer.messages).includes('Switch private hero'));
  assert.ok(!JSON.stringify(bob.messages).includes('Switch private hero'));
  fantasy.send({t:'world',world:'city'});
  await fantasy.until(message=>message.t==='worldPending'&&message.world==='city');
  await alice.wait(message=>message.t==='users'&&!!message.list?.some(user=>user.id===alice.id&&user.session==='switching'));
  await fantasy.until(message=>message.t==='world'&&message.world==='city');
  const city=await alice.sync();assert.equal(city.snapshot.world,'city');assert.equal(city.config.user,alice.id);
  for(const peer of [alice,bob]){
    const deniedAt=peer.messages.length;peer.send({t:'fantasyAction',revision:empty.revision,action:{type:'sync'}});await peer.barrier();
    assert.deepEqual(peer.messages.slice(deniedAt).filter(message=>privateTypes.has(message.t)),[]);
  }
  alice.send({t:'join',sid:'fantasy'});
  await alice.wait(message=>message.t==='fantasyProfile'&&message.profile?.character?.name==='Switch private hero',createdAt);
  const resumed=await alice.sync();assert.equal(resumed.config.user,alice.id);
  assert.ok(alice.messages.filter(message=>message.t==='users').at(-1)!.list!.every(user=>!user.id.startsWith('fantasy:')));
});
