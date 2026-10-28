import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { seedHomeData, testServerEnv } from './test-db.ts';
import { devLogin } from './test-auth.ts';
import { WebSocket } from 'ws';
import { KokosyncClient } from '../vendor/kokosync/index.js';
import { importKey, open, PACKET_TOPIC, receiveBlob, seal, sendPacket, unpack, type Envelope, type SyncConfig } from '../shared/session-wire.ts';
import { POSITION_TOPIC, SessionPositions } from '../shared/session-position.ts';
import { SessionEvents, EVENT_TOPIC, EVENT_BULK_TOPIC, RECOVERY_TOPIC } from '../shared/session-events.ts';
import { applyItemAction, isDeltaAction, type Item } from '../shared/items.ts';
import { COMPAT_VERSION, type RoomClientMsg } from '../shared/protocol.ts';
import { EMOTES } from '../shared/emotes.ts';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until<T>(read: () => T | undefined, timeout = 45_000): Promise<T> {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = read(); if (value !== undefined) return value; await delay(30); }
  throw new Error('Timed out waiting for session data');
}

test('live kokosync: initial canvas, deltas, private delivery, independent media and reconnect', { skip: process.env.KOKOSYNC_INTEGRATION !== '1', timeout: 180_000 }, async (t) => {
  const dbEnv = await testServerEnv(t);
  const listener = net.createServer();
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const data = await mkdtemp(path.join(os.tmpdir(), 'tonarium-sync-'));
  const canvas = { id: 'large-canvas', kind: 'canvas', x: 0, z: 0, ry: 0, createdBy: 'seed', updatedBy: 'seed',
    strokes: Array.from({ length: 600 }, (_, i) => ({ id: `line-${i}`, by: 'seed', color: '#334455', size: 3, pts: Array.from({ length: 100 }, (_, n) => (n * 3) % 400) })) };
  const sessions = [{ id: 'sync-test', name: 'Sync test' }, { id: 'other-test', name: 'Other test' }, { id: 'peer-five', name: 'Peer five' }];
  await writeFile(path.join(data, 'sessions.json'), JSON.stringify({ name: 'test', sessions }));
  await seedHomeData(dbEnv, { items: { 'sync-test': [canvas as unknown as Item] } });
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, ...dbEnv, NODE_ENV: 'test', FANTASY_ACCOUNT_TEST_BYPASS: '1', SERVER_PORT: String(port), DATA_DIR: data, SESSIONS_FILE: path.join(data, 'sessions.json'), LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });
  t.after(async () => { child.kill(); await until(() => child.exitCode !== null || child.signalCode ? true : undefined, 10_000).catch(() => child.kill('SIGKILL')); await rm(data, { recursive: true, force: true }); });
  await until(() => logs.includes('server on') ? true : undefined);

  async function peer(name: string, sid = 'sync-test', previous?: { home: WebSocket; id: string; login: Awaited<ReturnType<typeof devLogin>> }, modern = false) {
    const login = previous?.login ?? await devLogin(base, name);
    const home = previous?.home ?? new WebSocket(base.replace('http', 'ws') + '/ws', { headers: login.headers });
    t.after(() => home.close());
    const messages: any[] = [], raw: any[] = [];
    home.on('message', (bytes) => messages.push(JSON.parse(bytes.toString())));
    if (!previous) await new Promise<void>((resolve, reject) => { home.once('open', resolve); home.once('error', reject); });
    const id = login.id;
    if (!previous) {
      home.send(JSON.stringify({ t: 'hello', compat: COMPAT_VERSION }));
      home.send(JSON.stringify({ t: 'join', sid }));
    }
    const requestId = crypto.randomUUID();
    home.send(JSON.stringify({ t: 'prepareSync', requestId, peerPositions: modern, peerDelivery: modern }));
    const reply = await until(() => messages.find((m) => m.requestId === requestId));
    assert.equal(reply.t, 'syncConfig', JSON.stringify(reply));
    const cfg: SyncConfig = reply.config;
    const key = await importKey(cfg.key);
    const client = await KokosyncClient.connect({ url: base, room: cfg.room, peer: cfg.peer, transport: 'websocket', timeout: 45_000,
      websocketUrl: `/sync/ws?token=${cfg.token}`, websocketFactory: (u) => new WebSocket(u, { origin: base }) as unknown as globalThis.WebSocket });
    t.after(() => client.close());
    const received: any[] = [];
    const localItems = new Map<string, Item>();
    if (modern) assert.ok(cfg.positionKey, 'deployed kokosync supports peer routes');
    const positions = cfg.positionKey ? new SessionPositions(client, cfg, (id, s) => received.push({ t: 'avatar', id, s })) : null;
    const events = cfg.peerDelivery ? new SessionEvents(client, cfg) : null;
    t.after(() => positions?.close());
    t.after(() => events?.close());
    let incoming = Promise.resolve();
    const receive = async (p: unknown, sender: string, latest = false) => {
      if (sender !== cfg.server || (p as Envelope)?.grant !== cfg.token) return;
      const apply = async () => {
        const decoded = await open(key, cfg.token, latest ? 'server-position' : 'server', p);
        let value = decoded.value;
        if (value.kind === 'peers') { await positions?.update(value.peers); events?.update(value.peers); }
        if (value.kind === 'peerCommit') value = await events!.resolve(value);
        if (value.kind === 'snapshot') { localItems.clear(); for (const item of value.snapshot.items) localItems.set(item.id, item); }
        const m = value.message;
        if (m?.t === 'item') localItems.set(m.item.id, m.item);
        if (m?.t === 'itemRemove') localItems.delete(m.id);
        if (m?.t === 'itemAction' && localItems.has(m.id)) applyItemAction(localItems.get(m.id)!, m.action, m.by, Math.random);
        received.push(value);
      };
      if (latest) return apply();
      const task = incoming.then(apply); incoming = task.catch(() => {}); return task;
    };
    client.on('message', async (f) => { raw.push(f); if (f.topic === PACKET_TOPIC) await receive(f.value, f.peer); });
    client.on('latest', (f) => { raw.push(f); return f.key?.startsWith(POSITION_TOPIC) ? positions?.receive(f) : receive(f.value, f.peer, true); });
    client.on('peer_message', (f) => { raw.push(f); return events?.receive(f); });
    let pause: { started: () => void; wait: Promise<void> } | null = null;
    const pauseNextBlob = () => {
      let release!: () => void, started!: () => void;
      const beginning = new Promise<void>((resolve) => { started = resolve; });
      const wait = new Promise<void>((resolve) => { release = resolve; });
      pause = { started, wait };
      t.after(release);
      return { beginning, release };
    };
    client.on('blob_open', (f) => {
      if (!pause || f.peer !== cfg.server) return receiveBlob(client, f, (sender) => sender === cfg.server, receive);
      const hold = pause; pause = null;
      const bytes = new Uint8Array(Number(f.size)); let offset = 0;
      hold.started();
      return client.acceptBlob(f as any, {
        async write(chunk) { await hold.wait; bytes.set(chunk, offset); offset += chunk.length; },
        async close() { await receive(unpack(bytes), f.peer); },
      }).then(() => {});
    });
    let seq = 0;
    const send = async (msg: RoomClientMsg) => {
      if (!events && msg.t === 'itemAction' && isDeltaAction(msg.action) && localItems.has(msg.id))
        applyItemAction(localItems.get(msg.id)!, msg.action, id, Math.random);
      const event = await events?.prepare(msg, { sid, user: id, name, at: Date.now(), item: msg.t === 'itemAction' ? localItems.get(msg.id) : undefined });
      await sendPacket(client, cfg.server, await seal(key, cfg.token, 'client', ++seq, event ? { t: 'peerOperation', event } : msg));
      return event;
    };
    await send({ t: 'sync' });
    const snapshot = await until(() => received.find((v) => v.kind === 'snapshot'));
    return { id, login, home, homeMessages: messages, client, cfg, key, received, raw, send, positions, events, localItems, pauseNextBlob, snapshot: snapshot.snapshot };
  }
  const a = await peer('sync-a');
  assert.equal(a.snapshot.items[0].strokes.length, 600);
  assert.ok(JSON.stringify(a.snapshot).length > 100_000);
  const b = await peer('sync-b');
  assert.deepEqual(b.snapshot.items[0], canvas);
  a.home.send(JSON.stringify({ t: 'followUser', to: b.id, on: true }));
  await until(() => b.homeMessages.find((m) => m.t === 'followed' && m.from === a.id));
  b.home.send(JSON.stringify({ t: 'followUser', to: a.id, on: true }));
  await until(() => a.homeMessages.find((m) => m.t === 'friends' && m.ids.includes(b.id)));
  a.home.send(JSON.stringify({ t: 'postCreate', text: 'timeline hello', withPlace: true }));
  const posted = await until(() => b.homeMessages.find((m) => m.t === 'post' && m.p.text === 'timeline hello'));
  assert.equal(posted.p.author, 'sync-a');
  a.home.send(JSON.stringify({ t: 'msg', conv: 'dm:sync-a\u0000sync-b', text: 'home websocket DM' }));
  await until(() => b.homeMessages.find((m) => m.t === 'msg' && m.m.text === 'home websocket DM'));
  await a.send({ t: 'chat', text: 'room hello', scope: 'all' });
  await until(() => b.received.find((v) => v.message?.m?.text === 'room hello'));
  const gif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAAKAAAAIf8LTkVUU0NBUEUyLjADAQAAACwAAAAAAQABAAACAkQBADs=';
  const clientRequestId = crypto.randomUUID();
  await a.send({ t: 'chat', text: 'recorded GIF', scope: 'all', image: gif, clientRequestId });
  await until(() => b.received.find(v => v.message?.m?.clientRequestId === clientRequestId));
  await a.send({ t: 'chat', text: 'recorded GIF', scope: 'all', image: gif, clientRequestId });
  await a.send({ t: 'sync' });
  const gifSnapshot = await until(() => a.received.find(v => v.kind === 'snapshot' && v.snapshot.chats.some((m: any) => m.clientRequestId === clientRequestId)));
  const gifMessages = gifSnapshot.snapshot.chats.filter((m: any) => m.clientRequestId === clientRequestId);
  assert.equal(gifMessages.length, 1);
  assert.equal(gifMessages[0].image, gif);
  await a.send({ t: 'itemAction', id: 'large-canvas', action: { a: 'strokeStart', id: 'new-line', color: '#ffffff', size: 2, x: 1, y: 2 } });
  await until(() => b.received.find((v) => v.message?.action?.id === 'new-line'));
  await a.send({ t: 'mode', mode: '3d' });
  a.client.latest(PACKET_TOPIC, await seal(a.key, a.cfg.token, 'client-position', 1, { t: 'avatar', s: { x: 2, z: 3, ry: 0, walking: true } }) as any, 1n);
  await until(() => b.received.find((v) => v.t === 'avatar' && v.id === a.id && v.s.x === 2 && v.s.walking === true));
  await a.send({ t: 'poke', to: b.id });
  const poke = await until(() => b.received.find((v) => v.message?.t === 'poke'));
  assert.equal(poke.message.from, a.id);
  const privateFrame = await until(() => a.raw.find((f) => f.peer === b.cfg.server && f.value?.grant === b.cfg.token));
  await assert.rejects(open(a.key, b.cfg.token, 'server', privateFrame.value));
  const image = 'data:image/png;base64,' + 'A'.repeat(240_000);
  const hold = b.pauseNextBlob();
  await a.send({ t: 'chat', text: 'large attachment', image, scope: 'all' });
  await hold.beginning;
  a.client.latest(PACKET_TOPIC, await seal(a.key, a.cfg.token, 'client-position', 2, { t: 'avatar', s: { x: 2, z: 3, ry: 0, walking: false } }) as any, 2n);
  await until(() => b.received.find((v) => v.t === 'avatar' && v.id === a.id && v.s.x === 2 && v.s.walking === false));
  assert.equal(b.received.some((v) => v.message?.m?.image === image), false, 'position arrives while the blob receiver is paused');
  hold.release();
  await until(() => b.received.find((v) => v.message?.m?.image === image));
  await a.send({ t: 'sync' });
  await until(() => a.received.find((v) => v.kind === 'snapshot' && v.snapshot.chats.some((c: any) => c.text === 'large attachment')));
  const media = await (await fetch(`${base}/token?session=sync-test`, { headers: a.login.headers })).json() as any;
  assert.match(media.error, /LiveKit/);
  await b.send({ t: 'chat', text: 'without media', scope: 'all' });
  await until(() => a.received.find((v) => v.message?.m?.text === 'without media'));
  await a.send({ t: 'avatar', s: { x: 2, z: 3, ry: 0, crouching: true } });
  await until(() => b.received.find((v) => v.t === 'avatar' && v.id === a.id && v.s.crouching === true));
  b.client.close();
  const b2 = await peer('sync-b', 'sync-test', b);
  assert.equal(b2.id, b.id);
  assert.equal(b2.snapshot.avatars[a.id].crouching, true);
  await a.send({ t: 'avatar', s: { x: 2, z: 3, ry: 0, crouching: false } });
  await until(() => b2.received.find((v) => v.t === 'avatar' && v.id === a.id && v.s.crouching === false));
  assert.ok(b2.snapshot.chats.some((c: any) => c.text === 'without media'));
  assert.ok(b2.snapshot.items[0].strokes.some((s: any) => s.id === 'new-line'));
  const other = await peer('other', 'other-test');
  assert.ok(other.snapshot.items.every((v: any) => v.id !== 'large-canvas'));
  await a.send({ t: 'emote', id: 'wave' });
  const reaction = await until(() => b2.received.find((v) => v.message?.t === 'emote'));
  assert.equal(reaction.message.from, a.id);
  assert.equal(reaction.message.id, 'wave');
  assert.ok(Number.isFinite(reaction.message.at));
  await until(() => a.received.find((v) => v.message?.t === 'emote'));
  await a.send({ t: 'emote', id: 'hop' });
  await a.send({ t: 'emote', id: '__proto__' } as unknown as RoomClientMsg);
  // A chat after both commands is a barrier: all earlier commands were handled.
  await a.send({ t: 'chat', text: 'emote barrier', scope: 'all' });
  await until(() => b2.received.find((v) => v.message?.m?.text === 'emote barrier'));
  assert.equal(b2.received.filter((v) => v.message?.t === 'emote').length, 1, 'reject overlapping or unsupported emotes');
  assert.equal(other.received.some((v) => v.message?.t === 'emote'), false, 'emotes stay in their session');
  await delay(Math.max(0, reaction.message.at + EMOTES.wave.duration - Date.now()) + 50);
  await a.send({ t: 'emote', id: '__proto__' } as unknown as RoomClientMsg);
  await a.send({ t: 'emote', id: 'hop' });
  await until(() => b2.received.find((v) => v.message?.t === 'emote' && v.message.id === 'hop'));
  assert.equal(b2.received.filter((v) => v.message?.t === 'emote').length, 2, 'next reaction works after cooldown; invalid IDs never broadcast');
  const replay = await seal(b2.key, b2.cfg.token, 'client', 100, { t: 'chat', text: 'once only', scope: 'all' });
  await sendPacket(b2.client, b2.cfg.server, replay);
  await sendPacket(b2.client, b2.cfg.server, replay);
  await until(() => a.received.find((v) => v.message?.m?.text === 'once only'));
  await delay(100);
  assert.equal(a.received.filter((v) => v.message?.m?.text === 'once only').length, 1);
  const beforeCrouch = b2.received.length;
  await a.send({ t: 'avatar', s: { x: 2, z: 3, ry: 0, crouching: true } });
  await until(() => b2.received.slice(beforeCrouch).find((v) => v.t === 'avatar' && v.id === a.id && v.s.crouching === true));
  const c = await peer('modern-a', 'sync-test', undefined, true);
  assert.equal(c.snapshot.avatars[a.id].crouching, true);
  await a.send({ t: 'avatar', s: { x: 2, z: 3, ry: 0, crouching: false } });
  await until(() => c.received.find((v) => v.t === 'avatar' && v.id === a.id && v.s.crouching === false));
  const d = await peer('modern-b', 'sync-test', undefined, true);
  await until(() => c.positions!.routes().some((r) => r.peer === d.cfg.peer) ? true : undefined);
  assert.equal(c.positions!.routes().find((r) => r.peer === d.cfg.peer)?.route, 'relay', 'Node without WebRTC uses relay');
  await c.positions!.send({ x: 5, z: 3, ry: 0.2 });
  await until(() => d.received.find((v) => v.t === 'avatar' && v.id === c.id && v.s.x === 5));
  await until(() => a.received.find((v) => v.t === 'avatar' && v.id === c.id && v.s.x === 5));
  assert.ok(d.raw.some((f) => f.type === 'latest' && f.peer === c.cfg.peer && f.key.startsWith(POSITION_TOPIC)), 'modern recipient receives the publisher frame, not an app-server resend');
  assert.ok(!d.raw.some((f) => f.type === 'latest' && f.peer === d.cfg.server && f.value?.grant === d.cfg.token && f.value?.lane === 'server-position'), 'modern positions do not take the legacy double relay');
  await c.send({ t: 'chat', text: 'modern chat remains ordered', scope: 'all' });
  await until(() => d.received.find((v) => v.message?.m?.text === 'modern chat remains ordered'));
  assert.ok(d.raw.some((f) => f.type === 'peer_message' && f.topic === EVENT_TOPIC), 'modern chat body arrives from its peer');
  const peerGifRequest = crypto.randomUUID();
  await c.send({ t: 'chat', scope: 'all', text: 'peer GIF', image: gif, clientRequestId: peerGifRequest });
  const peerGif = await until(() => d.received.find(v => v.message?.m?.clientRequestId === peerGifRequest));
  assert.equal(peerGif.message.m.image, gif);
  await c.send({ t: 'chat', scope: 'all', text: 'peer GIF', image: gif, clientRequestId: peerGifRequest });
  await c.send({ t: 'sync' });
  const peerGifSnapshot = await until(() => c.received.find(v => v.kind === 'snapshot' && v.snapshot.chats.some((m: any) => m.clientRequestId === peerGifRequest)));
  assert.equal(peerGifSnapshot.snapshot.chats.filter((m: any) => m.clientRequestId === peerGifRequest).length, 1);
  const five: Awaited<ReturnType<typeof peer>>[] = [];
  for (let i = 0; i < 5; i++) five.push(await peer(`peer-${i}`, 'peer-five', undefined, true));
  await until(() => five.every((p) => p.positions!.routes().length === 4) ? true : undefined);
  const [publisher, receiver] = five;
  const publicEvent = await publisher.send({ t: 'chat', text: 'five peer chat', scope: 'all', image });
  await until(() => five.every((p) => p.received.some((v) => v.message?.m?.id === publicEvent!.id)) ? true : undefined);
  assert.equal(receiver.received.filter((v) => v.message?.m?.id === publicEvent!.id).length, 1);
  assert.ok(receiver.raw.some((f) => f.type === 'peer_message' && f.peer === publisher.cfg.peer && f.topic === EVENT_BULK_TOPIC));
  await publisher.send({ t: 'peerOperation', event: publicEvent! });
  await delay(100);
  assert.equal(receiver.received.filter((v) => v.message?.m?.id === publicEvent!.id).length, 1, 'application event ID rejects a replay');
  await publisher.send({ t: 'itemCreate', kind: 'canvas', x: 0, z: 0, ry: 0 });
  const newCanvas = await until(() => [...publisher.localItems.values()].find((i) => i.kind === 'canvas'));
  await until(() => five.every((p) => p.localItems.has(newCanvas.id)) ? true : undefined);
  await publisher.send({ t: 'itemAction', id: newCanvas.id, action: { a: 'strokeStart', id: 'p2p-stroke', color: '#123456', size: 2, x: 1, y: 2 } });
  await until(() => five.every((p) => { const it = p.localItems.get(newCanvas.id); return it?.kind === 'canvas' && it.strokes.some((s) => s.id === 'p2p-stroke'); }) ? true : undefined);
  await publisher.send({ t: 'itemCreate', kind: 'dice', x: 0, z: 0, ry: 0 });
  const dice = await until(() => [...publisher.localItems.values()].find((i) => i.kind === 'dice'));
  await until(() => five.every((p) => p.localItems.has(dice.id)) ? true : undefined);
  const rolled = await publisher.send({ t: 'itemAction', id: dice.id, action: { a: 'diceRoll', sides: 6, count: 2, secret: false } });
  await until(() => five.every((p) => { const it = p.localItems.get(dice.id); return it?.kind === 'dice' && it.roll?.id === rolled!.id; }) ? true : undefined);
  for (const p of five) assert.deepEqual((p.localItems.get(dice.id) as any).roll.results, rolled!.roll!.results);
  await Promise.all([
    publisher.send({ t: 'itemAction', id: newCanvas.id, action: { a: 'strokeStart', id: 'concurrent-stroke', color: '#ff0000', size: 3, x: 8, y: 9 } }),
    receiver.send({ t: 'itemAction', id: newCanvas.id, action: { a: 'canvasClear' } }),
  ]);
  await until(() => five.every((p) => p.received.some((v) => v.message?.action?.id === 'concurrent-stroke') &&
    p.received.some((v) => v.message?.action?.a === 'canvasClear')) ? true : undefined);
  for (const p of five) assert.deepEqual((p.localItems.get(newCanvas.id) as any).strokes, (publisher.localItems.get(newCanvas.id) as any).strokes);
  await delay(650);
  const secretRoll = await publisher.send({ t: 'itemAction', id: dice.id, action: { a: 'diceRoll', sides: 20, count: 1, secret: true } });
  await until(() => publisher.received.find((v) => v.message?.m?.dice?.id === secretRoll!.id));
  assert.deepEqual(publisher.received.find((v) => v.message?.m?.dice?.id === secretRoll!.id).message.m.dice.results, secretRoll!.roll!.results);
  await until(() => receiver.received.find((v) => v.message?.m?.dice?.id === secretRoll!.id));
  assert.equal(receiver.received.find((v) => v.message?.m?.dice?.id === secretRoll!.id).message.m.dice.results, null);
  publisher.events!.update([]);
  const recovery = await publisher.send({ t: 'chat', text: 'recover missing peer data', scope: 'all' });
  await until(() => receiver.received.find((v) => v.message?.m?.id === recovery!.id));
  assert.ok(receiver.raw.some((f) => f.topic === RECOVERY_TOPIC), 'missing P2P body recovers from server');
  const newcomer = await peer('newcomer', 'peer-five', undefined, true);
  assert.ok(newcomer.snapshot.chats.some((m: any) => m.id === publicEvent!.id));
  assert.deepEqual(newcomer.snapshot.items.find((i: any) => i.id === newCanvas.id).strokes, (publisher.localItems.get(newCanvas.id) as any).strokes);
  const bikeA = await peer('bike-a', 'peer-five');
  const bikeB = await peer('bike-b', 'peer-five');
  for (const p of [bikeA, bikeB]) {
    await p.send({ t: 'mode', mode: '3d' });
    await p.send({ t: 'avatar', s: { x: 0, z: 0, ry: 0 } });
  }
  await bikeA.send({ t: 'itemCreate', kind: 'bike', x: 0, z: -2, ry: 0 });
  const bike = await until(() => [...bikeA.localItems.values()].find(i => i.kind === 'bike'));
  assert.ok(bike.kind === 'bike');
  await Promise.all([bikeA, bikeB].map(p => p.send({ t: 'itemAction', id: bike.id, action: { a: 'bikeMount' } })));
  const occupied = await until(() => {
    const it = bikeA.localItems.get(bike.id);
    return it?.kind === 'bike' && it.rider ? it : undefined;
  });
  const driver = occupied.rider === bikeA.id ? bikeA : bikeB;
  const passenger = driver === bikeA ? bikeB : bikeA;
  const state = { ...occupied, x: 0.5, speed: 2, roll: -0.1 };
  await passenger.send({ t: 'itemAction', id: bike.id, action: { a: 'bikeDrive', state, rideVersion: occupied.rideVersion } });
  await passenger.send({ t: 'itemAction', id: bike.id, action: { a: 'bikeDismount' } });
  await passenger.send({ t: 'chat', text: 'bike ownership barrier', scope: 'all' });
  await until(() => driver.received.find(v => v.message?.m?.text === 'bike ownership barrier'));
  assert.equal((driver.localItems.get(bike.id) as typeof occupied).rider, driver.id);
  assert.equal((driver.localItems.get(bike.id) as typeof occupied).speed, 0);
  await driver.send({ t: 'itemAction', id: bike.id, action: { a: 'bikeDrive', state, rideVersion: occupied.rideVersion } });
  await until(() => { const it = passenger.localItems.get(bike.id); return it?.kind === 'bike' && it.speed === 2 && it.roll === -0.1 ? it : undefined; });
  await driver.send({ t: 'itemAction', id: bike.id, action: { a: 'bikeDismount' } });
  await until(() => { const it = passenger.localItems.get(bike.id); return it?.kind === 'bike' && it.rider === null && it.speed === 0 ? it : undefined; });
  await passenger.send({ t: 'itemAction', id: bike.id, action: { a: 'bikeMount' } });
  await until(() => { const it = driver.localItems.get(bike.id); return it?.kind === 'bike' && it.rider === passenger.id ? it : undefined; });
  passenger.home.close();
  await until(() => { const it = driver.localItems.get(bike.id); return it?.kind === 'bike' && it.rider === null && it.speed === 0 ? it : undefined; });
  d.home.send(JSON.stringify({ t: 'leave' }));
  await until(() => !c.positions!.routes().some((r) => r.peer === d.cfg.peer) ? true : undefined);
  a.home.send(JSON.stringify({ t: 'leave' }));
  await delay(150);
  const denied = await fetch(`${base}/sync/offer`, { method: 'POST', headers: { Origin: base, 'X-Tonarium-Sync': a.cfg.token }, body: '{}' });
  assert.equal(denied.status, 403);
  t.diagnostic(`Confirmed ${JSON.stringify(a.snapshot).length} byte initial canvas and 240 KB attachment on ${process.env.KOKOSYNC_URL || 'default endpoint'}`);
});
