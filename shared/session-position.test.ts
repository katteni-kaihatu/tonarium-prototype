import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { KokosyncClient, Frame } from '../vendor/kokosync/index.js';
import { base64, importKey, open, seal, type SyncConfig, type PositionPeer } from './session-wire.ts';
import { POSITION_DIRECT_PEERS, POSITION_TOPIC, SessionPositions } from './session-position.ts';
import { clampAvatar } from './places.ts';
import { LEAN_ANGLE } from './protocol.ts';
import { canLean, leanAngle, type LeanContext } from '../client/src/view3d/movementAbilities.ts';

test('lean direction, intermediate angles and every cancellation reach multiple peers and server state', async () => {
  const source = config('leaner', 0), sender = fixture(source);
  const peers = [config('left-observer', 1), config('right-observer', 2)];
  const receivers = peers.map(fixture);
  await sender.positions.update(peers.map(p => member(p)));
  sender.present(peers.map(p => p.peer));
  for (const receiver of receivers) await receiver.positions.update([member(source)]);
  const context: LeanContext = { enabled: true, locked: true, typing: false, survivor: false,
    carrying: false, dragging: false, holdingTool: false, bike: false };
  const states = [LEAN_ANGLE, LEAN_ANGLE / 2, -LEAN_ANGLE, 0,
    leanAngle(LEAN_ANGLE, false, false, true, 2),
    leanAngle(LEAN_ANGLE, true, true, true, 2),
    ...(['enabled', 'locked', 'typing', 'survivor', 'carrying', 'dragging', 'holdingTool', 'bike'] as const)
      .map(key => leanAngle(LEAN_ANGLE, true, false, canLean({ ...context, [key]: !context[key] }), 1 / 60))];
  for (const lean of states) {
    sender.sent.length = 0;
    await sender.positions.send({ x: 1, z: 2, ry: 0, lean });
    for (let i = 0; i < peers.length; i++) {
      const packet = sender.sent.find(f => f.to?.includes(peers[i].peer))!;
      await receivers[i].positions.receive({ ...packet, peer: source.peer });
      const applied = receivers[i].applied.at(-1) as { state: any };
      assert.equal(clampAvatar('room', applied.state).lean, lean);
    }
    const packet = sender.sent.find(f => f.to?.includes(source.server))!;
    const decoded = await open(await importKey(source.positionKey!), source.token, 'position', packet.value);
    assert.equal(clampAvatar('room', decoded.value.s).lean, lean);
  }
  assert.equal(clampAvatar('room', { x: 0, z: 0, ry: 0 }).lean, 0);
  for (const sign of [-1, 1]) {
    assert.equal(clampAvatar('room', { x: 0, z: 0, ry: 0, lean: sign * 100 }).lean, sign * LEAN_ANGLE);
  }
});

test('walking start and stationary stop reach multiple peers through position sync', async () => {
  const source = config('walker', 0), sender = fixture(source);
  const peers = [config('observer-a', 1), config('observer-b', 2)];
  const receivers = peers.map(fixture);
  await sender.positions.update(peers.map((p) => member(p)));
  sender.present(peers.map((p) => p.peer));
  for (const receiver of receivers) await receiver.positions.update([member(source)]);
  for (const walking of [true, false]) {
    sender.sent.length = 0;
    await sender.positions.send({ x: 1, z: 2, ry: 0, walking });
    for (let i = 0; i < peers.length; i++) {
      const packet = sender.sent.find((f) => f.to?.includes(peers[i].peer))!;
      await receivers[i].positions.receive({ ...packet, peer: source.peer });
      const applied = receivers[i].applied.at(-1) as { state: any };
      assert.equal(clampAvatar('room', applied.state).walking, walking);
    }
    const serverPacket = sender.sent.find((f) => f.to?.includes(source.server))!;
    const decoded = await open(await importKey(source.positionKey!), source.token, 'position', serverPacket.value);
    assert.equal(clampAvatar('room', decoded.value.s).walking, walking);
  }
});

const secret = () => base64(crypto.getRandomValues(new Uint8Array(32)));
const config = (peer: string, slot: number): SyncConfig => ({ sid: 'room', room: 'wire-room', server: 'server', peer,
  token: `grant-${peer}`, key: secret(), positionKey: secret(), slot });
const member = (c: SyncConfig, key = true): PositionPeer => ({ peer: c.peer, grant: c.token, slot: c.slot, user: `user-${c.peer}`, ...(key ? { key: c.positionKey } : {}) });
function fixture(c: SyncConfig) {
  const sent: Frame[] = [], applied: unknown[] = [];
  let policy: any;
  let routes: any[] = [];
  const client = { send(type: string, fields: object) { sent.push({ type, ...fields }); },
    setRouting(options: unknown) { policy = options; }, routes() { return routes; } } as unknown as KokosyncClient;
  return { sent, applied, positions: new SessionPositions(client, c, (id, state) => applied.push({ id, state })),
    policy: () => policy, present(peers: string[]) { routes = peers.map((peer) => ({ peer, route: 'relay', reason: 'local-adapter-unavailable' })); } };
}

test('five peer positions use approved recipients and a key separate from commands', async () => {
  const own = config('a', 0), f = fixture(own);
  const others = Array.from({ length: 5 }, (_, i) => config(`peer-${i}`, i + 1));
  const legacy = config('legacy', 6);
  await f.positions.update([...others.map((c) => member(c)), member(legacy, false)]);
  f.present(others.map((c) => c.peer).concat(legacy.peer));
  assert.equal(f.policy().maxPeers, POSITION_DIRECT_PEERS);
  assert.equal(POSITION_DIRECT_PEERS, 5);
  assert.deepEqual(f.policy().peers, others.map((c) => c.peer));
  await f.positions.send({ x: 1, z: 2, ry: 0 });
  assert.equal(f.sent.length, 6);
  assert.deepEqual(f.sent.map((p) => p.to), [['server'], ...others.map((c) => [c.peer])]);
  const packet = f.sent[0].value;
  assert.deepEqual((await open(await importKey(own.positionKey!), own.token, 'position', packet)).value, { t: 'avatar', s: { x: 1, z: 2, ry: 0 } });
  await assert.rejects(open(await importKey(own.key), own.token, 'client', packet));
  const command = await seal(await importKey(own.key), own.token, 'client', 1, { t: 'chat', text: 'private' });
  await assert.rejects(open(await importKey(own.positionKey!), own.token, 'client', command));
});

test('bind received positions to approved peers, deduplicate, and reject departed publishers', async () => {
  const own = config('a', 0), other = config('b', 1), f = fixture(own);
  await f.positions.update([member(other)]);
  const value = await seal(await importKey(other.positionKey!), other.token, 'position', 1, { t: 'avatar', s: { x: 3, z: 4, ry: 0 } });
  const frame = { type: 'latest', key: `${POSITION_TOPIC}:${own.slot}`, peer: other.peer, seq: 1n, value };
  await f.positions.receive({ ...frame, peer: 'intruder' });
  await f.positions.receive({ ...frame, key: `${POSITION_TOPIC}:9` });
  assert.equal(f.applied.length, 0);
  await f.positions.receive(frame);
  await f.positions.receive(frame);
  assert.deepEqual(f.applied, [{ id: 'user-b', state: { x: 3, z: 4, ry: 0 } }]);
  await f.positions.update([]);
  await f.positions.receive(frame);
  assert.equal(f.applied.length, 1);
  f.present([]);
  await f.positions.send({ x: 0, z: 0, ry: 0 });
  assert.deepEqual(f.sent.map((p) => p.to), [['server']]);
});

test('jump pad height and jump count reach another participant through position sync', async () => {
  const own = config('a', 0), other = config('b', 1), f = fixture(own);
  await f.positions.update([member(other)]);
  const key = await importKey(other.positionKey!);
  for (const [i, y] of [0.18, 0.65, 0.18].entries()) {
    const state = { x: 2, z: 3, ry: 0, jump: i === 2 ? 2 : 1, y, walking: false };
    const value = await seal(key, other.token, 'position', i + 1, { t: 'avatar', s: state });
    await f.positions.receive({ type: 'latest', key: `${POSITION_TOPIC}:0`, peer: other.peer, seq: BigInt(i + 1), value });
    assert.deepEqual(f.applied.at(-1), { id: 'user-b', state });
  }
  assert.equal(f.applied.length, 3);
});

test('reject mismatched sequence and non-position payloads without applying them', async () => {
  const own = config('a', 0), other = config('b', 1), f = fixture(own), key = await importKey(other.positionKey!);
  await f.positions.update([member(other)]);
  const base = { type: 'latest', key: `${POSITION_TOPIC}:0`, peer: other.peer, seq: 3n };
  await f.positions.receive({ ...base, value: await seal(key, other.token, 'position', 2, { t: 'avatar', s: { x: 1, z: 1, ry: 0 } }) });
  await f.positions.receive({ ...base, value: await seal(key, other.token, 'position', 3, { t: 'chat', text: 'injected' }) });
  assert.equal(f.applied.length, 0);
  await f.positions.receive({ ...base, value: await seal(key, other.token, 'position', 3, { t: 'avatar', s: { x: 1, z: 1, ry: 0, walking: 'true' } }) });
  assert.equal(f.applied.length, 0);
  for (const lean of [NaN, Infinity, 'left']) {
    await f.positions.receive({ ...base, value: await seal(key, other.token, 'position', 3, { t: 'avatar', s: { x: 1, z: 1, ry: 0, lean } }) });
    assert.equal(f.applied.length, 0);
  }
  f.positions.close();
  await f.positions.receive({ ...base, value: await seal(key, other.token, 'position', 3, { t: 'avatar', s: { x: 1, z: 1, ry: 0 } }) });
  assert.equal(f.applied.length, 0);
});
