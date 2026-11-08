import test from 'node:test';
import assert from 'node:assert/strict';
import { Battlefields } from './battlefield.ts';
import { BATTLEFIELD, battleClear, battlePath, validBattleInput, type BattlefieldState } from '../shared/battlefield.ts';
import { WORLD_KINDS, WORLDS, type Solid } from '../shared/worlds.ts';
import { TANK } from '../shared/vehicle.ts';

function fixture(solids: Solid[] = [...BATTLEFIELD.solids]) {
  let now = 10000;
  const members = [{ id: 'a' }, { id: 'b' }];
  const deliveries: BattlefieldState[] = [];
  const battles = new Battlefields({ now: () => now, random: () => .5, members: sid => sid === 'room' ? members : [], owner: () => 'a', solids: () => solids,
    publish: (_sid, s) => deliveries.push(structuredClone(s)) });
  const state = battles.ensure('room');
  return { battles, state, members, deliveries, advance: (ms: number) => { now += ms; battles.update('room'); },
    input: (id: string, x = 0, z = 0, aim = 0, fire = false) => battles.command('room', id, { t: 'battleInput', input: { x, z, aim, fire } }) };
}
test('registered world and existing participants form balanced teams, with zero bots and no human cap', () => {
  assert.ok(WORLD_KINDS.includes('battlefield')); assert.deepEqual(WORLDS.battlefield.solids, BATTLEFIELD.solids);
  const f = fixture(); assert.equal(f.state.actors.a.team, 'red'); assert.equal(f.state.actors.b.team, 'blue');
  assert.equal(Object.values(f.state.actors).filter(a => a.bot).length, 0);
  for (let i = 0; i < 10; i++) f.members.push({ id: `human-${i}` });
  f.battles.ensure('room'); assert.equal(Object.keys(f.state.actors).length, 12);
});
test('identity, session, finite values, vector bounds and dead inputs are rejected', () => {
  const f = fixture();
  assert.equal(f.input('intruder', 1), false);
  assert.equal(f.battles.command('other', 'a', { t: 'battleInput', input: { x: 0, z: 0, aim: 0, fire: true } }), false);
  for (const value of [NaN, Infinity, -Infinity, 2]) assert.equal(f.input('a', value), false);
  assert.equal(f.input('a', .9, .9), false); assert.equal(f.input('a', 0, 0, 10), false);
  assert.equal(validBattleInput({ x: 0, z: 0, aim: 0, fire: 'yes' }), false);
  f.state.actors.a.alive = false; assert.equal(f.input('a', 1), false);
  assert.equal(f.battles.command('room', 'a', { t: 'battleMount', id: 'battlefield-tank-red' }), false);
});
test('server movement has elapsed-time speed, swept obstacles and boundaries; input spam cannot accelerate', () => {
  const f = fixture(); const a = f.state.actors.a;
  for (let i = 0; i < 100; i++) f.input('a', 1);
  const start = a.x; f.advance(50); assert.ok(Math.abs(a.x - start - .2) < 1e-8);
  Object.assign(a, { x: -4, z: 1 }); f.input('a', 1); f.advance(100); assert.ok(a.x < -3.85);
  Object.assign(a, { x: 9.6, z: 9 }); f.input('a', 1); f.advance(100); assert.equal(a.x, 9.6);
});
test('common shots determine damage, cooldown, LOS, repeated deaths and exact 3000ms respawn', () => {
  const f = fixture(); const a = f.state.actors.a, b = f.state.actors.b;
  for (let round = 0; round < 2; round++) {
    Object.assign(a, { x: -7, z: 0 }); Object.assign(b, { x: -7, z: -3 });
    f.input('a', 0, 0, 0, true); f.advance(50); assert.equal(b.hp, 75);
    f.input('a', 0, 0, 0, true); f.advance(50); assert.equal(b.hp, 75);
    for (let i = 0; i < 3; i++) { f.input('a', 0, 0, 0, true); f.advance(400); /* stale input must be refreshed after advancing */ f.input('a', 0, 0, 0, true); f.advance(50); }
    assert.equal(b.alive, false); const death = f.state.at;
    assert.equal(b.respawnAt, death + 3000); assert.equal(f.input('b', 1), false);
    f.advance(2999); assert.equal(b.alive, false); f.advance(1); assert.equal(b.alive, true); assert.equal(b.hp, 100);
  }
  Object.assign(a, { x: -5, z: 1, firedAt: -1e9 }); Object.assign(b, { x: -1, z: 1 });
  f.input('a', 0, 0, -Math.PI / 2, true); f.advance(50); assert.equal(b.hp, 100);
});
test('capture persists without ending combat and contested bases do not progress', () => {
  const f = fixture(); Object.assign(f.state.actors.a, { x: BATTLEFIELD.bases[0].x, z: BATTLEFIELD.bases[0].z });
  for (let i = 0; i < 40; i++) f.advance(50);
  assert.equal(f.state.bases[0].owner, 'red'); assert.equal(f.input('a', 1), true);
  Object.assign(f.state.actors.b, { x: BATTLEFIELD.bases[0].x, z: BATTLEFIELD.bases[0].z });
  for (let i = 0; i < 40; i++) f.advance(50);
  assert.equal(f.state.bases[0].owner, 'red'); assert.equal(f.state.bases[0].progress, 0);
});
test('tank mount is atomic and exclusive; only rider drives and fires; leave and death release it', () => {
  const f = fixture(); const tank = f.state.tanks['battlefield-tank-red'];
  Object.assign(f.state.actors.a, { x: tank.x, z: tank.z + 1 }); Object.assign(f.state.actors.b, { x: tank.x, z: tank.z + 1 });
  assert.equal(f.battles.command('room', 'a', { t: 'battleMount', id: tank.id }), true);
  assert.equal(f.battles.command('room', 'b', { t: 'battleMount', id: tank.id }), false);
  const start = tank.x; f.input('b', 1); f.advance(50); assert.equal(tank.x, start);
  f.input('a', 1); f.advance(50); assert.equal(tank.x, start + .15);
  f.state.actors.a.hp = 25;
  Object.assign(f.state.actors.b, { x: tank.x, z: tank.z + 2 });
  f.input('a'); f.input('b', 0, 0, 0, true); f.advance(50);
  assert.equal(f.state.actors.a.alive, false); assert.equal(tank.rider, null);
  assert.equal(f.state.actors.a.tank, null);
  f.advance(3000); Object.assign(f.state.actors.a, { x: tank.x, z: tank.z + 2 });
  assert.equal(f.battles.command('room', 'a', { t: 'battleMount', id: tank.id }), true);
  f.battles.leave('room', 'a'); assert.equal(tank.rider, null);
});
test('dismount chooses a clear exit beside a wall and infantry can walk for one second', () => {
  const f = fixture(); const p = f.state.actors.a, tank = f.state.tanks['battlefield-tank-red'];
  Object.assign(tank, { x: -4.6, z: 1 }); Object.assign(p, { x: tank.x - 2, z: tank.z });
  assert.ok(f.battles.command('room', 'a', { t: 'battleMount', id: tank.id }));
  assert.ok(f.battles.command('room', 'a', { t: 'battleMount', id: null }));
  assert.equal(p.tank, null); assert.equal(tank.rider, null);
  assert.ok(battleClear(p, p, BATTLEFIELD.radius, [...BATTLEFIELD.solids, { x: tank.x, z: tank.z, r: TANK.radius }]));
  const start = { x: p.x, z: p.z };
  for (let i = 0; i < 20; i++) { f.input('a', 0, 1); f.advance(50); }
  assert.ok(Math.hypot(p.x - start.x, p.z - start.z) > 1);
});

test('both teams and bots respawn at 3000ms despite tanks blocking their spawn', () => {
  const f = fixture(); f.battles.command('room', 'a', { t: 'battleBot', action: 'add' });
  for (const team of ['red', 'blue'] as const) Object.assign(f.state.tanks[`battlefield-tank-${team}`], BATTLEFIELD.spawns[team]);
  for (const p of Object.values(f.state.actors)) Object.assign(p, { alive: false, hp: 0, respawnAt: f.state.at + 3000 });
  f.advance(2999); assert.ok(Object.values(f.state.actors).every(p => !p.alive));
  f.advance(1);
  for (const p of Object.values(f.state.actors)) {
    assert.ok(p.alive); assert.equal(p.hp, 100); assert.equal(p.respawnAt, null);
    const obstacles = [...BATTLEFIELD.solids, ...Object.values(f.state.tanks).map(t => ({ x: t.x, z: t.z, r: TANK.radius }))];
    assert.ok(battleClear(p, p, BATTLEFIELD.radius, obstacles));
  }
  const p = f.state.actors.a, start = { x: p.x, z: p.z };
  f.input('a', 0, 1); f.advance(50);
  assert.ok(Math.hypot(p.x - start.x, p.z - start.z) > 0);
});

test('leaving a mounted tank preserves a clear infantry position for rejoining', () => {
  const f = fixture(), p = f.state.actors.a, tank = f.state.tanks['battlefield-tank-red'];
  assert.ok(f.battles.command('room', 'a', { t: 'battleMount', id: tank.id }));
  f.battles.leave('room', 'a'); f.members.shift(); f.battles.ensure('room');
  assert.equal(tank.rider, null);
  assert.ok(battleClear(p, p, BATTLEFIELD.radius, [...BATTLEFIELD.solids, { x: tank.x, z: tank.z, r: TANK.radius }]));
  f.members.push({ id: 'a' }); f.battles.ensure('room');
  const start = { x: p.x, z: p.z };
  f.input('a', 0, 1); f.advance(50);
  assert.ok(Math.hypot(p.x - start.x, p.z - start.z) > 0);
});

test('dismount stays mounted when no exit fits instead of crossing a wall', () => {
  const solids: Solid[] = [...BATTLEFIELD.solids];
  const f = fixture(solids), tank = f.state.tanks['battlefield-tank-red'];
  assert.ok(f.battles.command('room', 'a', { t: 'battleMount', id: tank.id }));
  for (let i = 0; i < 16; i++) solids.push({ x: tank.x + Math.cos(i * Math.PI / 8) * 1.55, z: tank.z + Math.sin(i * Math.PI / 8) * 1.55, r: .4 });
  assert.equal(f.battles.command('room', 'a', { t: 'battleMount', id: null }), false);
  assert.equal(tank.rider, 'a'); assert.equal(f.state.actors.a.tank, tank.id);
});

test('bot targets and damages an enemy tank rider through the common shooting path', () => {
  const f = fixture(); f.battles.command('room', 'a', { t: 'battleBot', action: 'add' });
  const bot = Object.values(f.state.actors).find(p => p.bot)!, tank = f.state.tanks['battlefield-tank-blue'];
  Object.assign(tank, { x: -7, z: -2 }); Object.assign(f.state.actors.b, { x: -7, z: -4 });
  assert.ok(f.battles.command('room', 'b', { t: 'battleMount', id: tank.id }));
  Object.assign(bot, { x: -7, z: 1 }); f.advance(50);
  assert.equal(f.state.actors.b.hp, 75); assert.equal(f.state.actors.b.tank, tank.id);
});

test('owner-only bots cap atomically at six, cannot be impersonated, and removal cancels respawn', async () => {
  const f = fixture(); assert.equal(f.battles.command('room', 'b', { t: 'battleBot', action: 'add' }), false);
  await Promise.all(Array.from({ length: 30 }, async () => f.battles.command('room', 'a', { t: 'battleBot', action: 'add' })));
  const bots = Object.values(f.state.actors).filter(a => a.bot); assert.equal(bots.length, 6); assert.equal(f.input(bots[0].id, 1), false);
  const bot = bots[0]; bot.alive = false; bot.respawnAt = f.state.at + 3000;
  assert.equal(f.battles.command('room', 'a', { t: 'battleBot', action: 'remove', id: bot.id }), true);
  f.advance(5000); assert.equal(Object.hasOwn(f.state.actors, bot.id), false);
});
test('bots die through the same shots and can repeatedly respawn at exactly 3000ms', () => {
  const f = fixture(); f.battles.command('room', 'a', { t: 'battleBot', action: 'add' });
  const bot = Object.values(f.state.actors).find(p => p.bot)!;
  for (let round = 0; round < 2; round++) {
    Object.assign(bot, { x: -7, z: 0, hp: 25 }); Object.assign(f.state.actors.b, { x: -7, z: 1 });
    f.input('b', 0, 0, 0, true); f.advance(50);
    assert.equal(bot.alive, false); assert.equal(f.input(bot.id, 1), false);
    f.advance(2999); assert.equal(bot.alive, false); f.advance(1); assert.equal(bot.alive, true); assert.equal(bot.hp, 100);
  }
});
test('dynamic obstacles trigger bot replanning and unreachable bases never cause teleportation', () => {
  const solids: Solid[] = [...BATTLEFIELD.solids];
  const f = fixture(solids); f.battles.command('room', 'a', { t: 'battleBot', action: 'add' });
  const bot = Object.values(f.state.actors).find(p => p.bot)!;
  for (let i = 0; i < 20; i++) f.advance(50);
  solids.push({ x: -5, z: 0, w: 1, d: 22 });
  let previous = { x: bot.x, z: bot.z };
  for (let i = 0; i < 200; i++) {
    f.advance(50);
    assert.ok(battleClear(previous, bot, BATTLEFIELD.radius, solids));
    assert.ok(Math.hypot(bot.x - previous.x, bot.z - previous.z) <= .200001);
    previous = { x: bot.x, z: bot.z };
  }
  assert.ok(bot.x < -5.85);
});
test('fixed bots use common movement, obstacle avoidance, attacks, capture and respawn with published snapshots', () => {
  const f = fixture(); f.battles.command('room', 'a', { t: 'battleBot', action: 'add' });
  const bot = Object.values(f.state.actors).find(a => a.bot)!; const start = { x: bot.x, z: bot.z };
  Object.assign(f.state.actors.b, { x: -7, z: 5 });
  let moved = false, damage = false, capture = false, death = false, respawn = false;
  let wasDead = false;
  for (let i = 0; i < 1600; i++) {
    f.advance(50);
    moved ||= Math.hypot(bot.x - start.x, bot.z - start.z) > 1;
    damage ||= f.state.actors.b.hp < 100;
    capture ||= f.state.bases.some(b => b.owner === bot.team);
    assert.ok(battleClear(bot, bot, BATTLEFIELD.radius, [...BATTLEFIELD.solids]));
    if (i === 500) { bot.hp = 25; Object.assign(f.state.actors.b, { x: bot.x, z: bot.z + 1, alive: true, hp: 100, respawnAt: null }); f.input('b', 0, 0, 0, true); }
    death ||= !bot.alive; if (wasDead && bot.alive) respawn = true; wasDead = !bot.alive;
  }
  assert.ok(moved, 'bot moves'); assert.ok(damage, 'bot attacks'); assert.ok(capture, 'bot captures'); assert.ok(death, 'bot dies'); assert.ok(respawn, 'bot respawns');
  assert.ok(f.deliveries.some(s => s.actors[bot.id]?.respawnAt !== null));
});
test('finite route search detours and reports unreachable targets, including changed obstacles', () => {
  const wall: Solid[] = [{ x: 0, z: 0, w: 1, d: 8 }];
  const start = { x: -4, z: 0 }, target = { x: 4, z: 0 }, path = battlePath(start, target, wall);
  assert.ok(path.length > 1);
  let previous = start; for (const next of path) { assert.ok(battleClear(previous, next, BATTLEFIELD.radius, wall)); previous = next; }
  wall[0] = { x: 0, z: 0, w: 1, d: 22 }; assert.deepEqual(battlePath(start, target, wall), []);
});
test('reconnect restores death timer, bases, tanks and bots; session destruction drops all state', () => {
  const f = fixture(); f.battles.command('room', 'a', { t: 'battleBot', action: 'add' });
  f.state.actors.a.alive = false; f.state.actors.a.respawnAt = f.state.at + 3000; f.state.bases[0].owner = 'blue';
  f.battles.leave('room', 'a'); f.members.splice(0, 1); f.advance(1000); f.members.push({ id: 'a' }); f.battles.ensure('room');
  assert.equal(f.state.actors.a.alive, false); assert.equal(f.state.bases[0].owner, 'blue'); assert.equal(Object.values(f.state.actors).filter(a => a.bot).length, 1);
  f.battles.clear('room'); assert.equal(f.battles.state('room'), null);
});
