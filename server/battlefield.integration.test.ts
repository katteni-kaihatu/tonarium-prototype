import test from 'node:test';
import assert from 'node:assert/strict';
import { battlefieldPlaytest, until, delay } from './battlefield-playtest.ts';
import { battleInputFor } from '../client/src/battlefield-input.ts';
import { BATTLEFIELD } from '../shared/battlefield.ts';

test('authenticated battlefield room: join, authority, bots, both view inputs, tank and reconnect', { timeout: 120000 }, async t => {
  const server = await battlefieldPlaytest(t, { fixedClock: true });
  const a = await server.peer('battle-a'), b = await server.peer('battle-b', a.sid);
  assert.equal(a.snapshot.world, 'battlefield');
  await until(() => a.state?.actors[b.id]);
  assert.notEqual(a.state!.actors[a.id].team, a.state!.actors[b.id].team);
  assert.equal(a.config.positionKey, undefined, 'battlefield never negotiates direct client positions');
  const before = a.state!.actors[a.id];
  await a.send({ t: 'avatar', s: { x: 0, z: 0, ry: 0 } });
  await a.send({ t: 'place2d', target: a.id, pos: { x: 0, z: 0, ry: 0 } });
  await a.send({ t: 'follow', target: b.id });
  for (const x of [NaN, Infinity, -Infinity, 9]) await a.send({ t: 'battleInput', input: { x, z: 0, aim: 0, fire: true } });
  await server.advance(50);
  assert.equal(a.state!.actors[a.id].x, before.x); assert.equal(a.state!.actors[a.id].z, before.z);
  await b.send({ t: 'battleBot', action: 'add' }); await delay(30);
  assert.equal(Object.values(b.state!.actors).filter(p => p.bot).length, 0);
  await Promise.all(Array.from({ length: 12 }, () => a.send({ t: 'battleBot', action: 'add' })));
  await until(() => Object.values(a.state?.actors ?? {}).filter(p => p.bot).length === 6 ? true : undefined);
  const bot = Object.values(a.state!.actors).find(p => p.bot)!;
  const initialZ = a.state!.actors[a.id].z;
  for (const relative of [false, true]) {
    await a.send({ t: 'battleInput', input: battleInputFor({ KeyW: true }, 0, relative, false) });
    await server.advance(100);
  }
  assert.ok(a.state!.actors[a.id].z < initialZ);
  for (let i = 0; i < 4; i++) { await a.send({ t: 'battleInput', input: battleInputFor({ KeyW: true }, 0, false, false) }); await server.advance(100); }
  await a.send({ t: 'battleMount', id: 'battlefield-tank-red' });
  await until(() => a.state?.actors[a.id].tank ? true : undefined);
  const tankId = a.state!.actors[a.id].tank!;
  const tankBefore = structuredClone(a.state!.tanks[tankId]);
  await b.send({ t: 'battleMount', id: tankId });
  await b.send({ t: 'itemMove', id: tankId, x: 9, z: 9, ry: 0 });
  await b.send({ t: 'itemAction', id: tankId, action: { a: 'bikeDismount' } });
  await a.send({ t: 'mode', mode: '3d' }); await a.send({ t: 'mode', mode: '2d' }); await server.advance(50);
  assert.deepEqual(a.state!.tanks[tankId], tankBefore);
  await a.reconnect(); assert.equal(a.snapshot.battlefield!.tanks[tankId].rider, a.id);
  assert.ok(a.snapshot.battlefield!.actors[bot.id].bot);
  const revisions = a.state!.revision;
  await a.send({ t: 'battleBot', action: 'remove', id: bot.id });
  await until(() => a.state && a.state.revision > revisions && !a.state.actors[bot.id] ? true : undefined);
  await server.advance(BATTLEFIELD.respawnMs); assert.equal(a.state!.actors[bot.id], undefined);
  const outsider = await server.peer('battle-outside', 'other-test');
  await outsider.send({ t: 'battleMount', id: tankId }); await server.advance(50);
  assert.equal(a.state!.tanks[tankId].rider, a.id);
  const health = a.state!.actors[a.id].hp, bases = structuredClone(a.state!.bases);
  await a.disconnect();
  await until(() => b.state?.actors[a.id].active === false ? true : undefined);
  assert.equal(b.state!.tanks[tankId].rider, null);
  await a.rejoin();
  assert.equal(a.snapshot.battlefield!.actors[a.id].active, true);
  assert.equal(a.snapshot.battlefield!.actors[a.id].hp, health);
  assert.equal(a.snapshot.battlefield!.actors[a.id].tank, null);
  assert.deepEqual(a.snapshot.battlefield!.bases, bases);
  assert.equal(Object.values(a.snapshot.battlefield!.actors).filter(p => p.bot).length, 5);
  const restored = a.state!.actors[a.id], position = { x: restored.x, z: restored.z };
  await a.send({ t: 'battleInput', input: { x: 0, z: 1, aim: 0, fire: false } });
  await server.advance(50);
  assert.ok(Math.hypot(a.state!.actors[a.id].x - position.x, a.state!.actors[a.id].z - position.z) > 0);
  assert.equal(server.errors(), 0); assert.equal(a.traffic().errors, 0);
});

test('fixed-clock bots fight, capture, die and respawn over authenticated snapshots', { timeout: 120000 }, async t => {
  const server = await battlefieldPlaytest(t, { fixedClock: true });
  const owner = await server.peer('battle-bots-owner'), observer = await server.peer('battle-bots-observer', owner.sid);
  for (let i = 0; i < 6; i++) await owner.send({ t: 'battleBot', action: 'add' });
  await until(() => Object.values(owner.state?.actors ?? {}).filter(p => p.bot).length === 6 ? true : undefined);
  let moved = false, fired = false, captured = false, died = false, respawned = false;
  const positions = new Map(Object.values(owner.state!.actors).filter(p => p.bot).map(p => [p.id, { x: p.x, z: p.z }]));
  const deaths = new Map<string, number>();
  for (let i = 0; i < 1200; i++) {
    await server.advance(50);
    const state = observer.state!;
    captured ||= state.bases.some(b => b.owner !== null);
    for (const bot of Object.values(state.actors).filter(p => p.bot)) {
      const start = positions.get(bot.id)!;
      moved ||= Math.hypot(bot.x - start.x, bot.z - start.z) > 1;
      fired ||= bot.firedAt > 0;
      if (!bot.alive) {
        died = true; deaths.set(bot.id, bot.respawnAt!);
        assert.ok(bot.respawnAt! > state.at, 'dead actors retain the future respawn time');
      } else if (deaths.has(bot.id)) {
        assert.ok(state.at >= deaths.get(bot.id)!); respawned = true; deaths.delete(bot.id);
      }
    }
  }
  assert.ok(moved); assert.ok(fired); assert.ok(captured); assert.ok(died); assert.ok(respawned);
  const before = structuredClone(owner.state!);
  await owner.reconnect();
  const restored = owner.snapshot.battlefield!;
  assert.ok(restored.revision > before.revision);
  assert.deepEqual(restored, { ...before, revision: restored.revision });
  assert.equal(owner.traffic().errors, 0); assert.equal(observer.traffic().errors, 0);
  assert.equal(owner.traffic().inconsistencies, 0); assert.equal(server.errors(), 0);
});
