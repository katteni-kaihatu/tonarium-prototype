import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { newFantasyDungeonProgress } from '../shared/fantasy-dungeon.ts';
import { FANTASY_FRONTIER_DUNGEONS } from '../shared/fantasy-frontier-data.ts';
import { FANTASY_FRONTIER_ARTIFACTS } from '../shared/fantasy-frontier-artifacts.ts';
import type { FantasyCombatOrder } from '../shared/fantasy-combat.ts';

const site = FANTASY_FRONTIER_DUNGEONS.find(site => site.kind === 'ruin')!, boss = site.rooms.find(room => room.enemy?.boss)!;
const draw = (seed: string, user: string) => createHash('sha256').update(`${seed}:${user}:${site.id}:reward`).digest().readUInt32BE(0) / 0x100000000;
function seedFor(outcomes: Record<string, boolean>) {
  for (let index = 0; index < 10000; index++) {
    const seed = `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
    if (Object.entries(outcomes).every(([user, reward]) => (draw(seed, user) < .3) === reward)) return seed;
  }
  throw Error('No deterministic reward seed found');
}
function fixture(t: TestContext, outcomes: Record<string, boolean>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-frontier-ruin-'));
  t.after(() => { const resolved = path.resolve(directory); assert.equal(path.dirname(resolved), path.resolve(os.tmpdir())); assert.ok(path.basename(resolved).startsWith('fantasy-frontier-ruin-')); fs.rmSync(resolved, { recursive: true, force: true }); });
  const file = path.join(directory, 'state.json'), users = Object.keys(outcomes);
  const profiles = Object.fromEntries(users.map(user => {
    const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: user }, () => .5).profile, c = p.character!;
    c.location = site.location; c.visited.push(site.location); c.level = 12; c.inventory = { lantern: 1 }; c.foodLots = [];
    c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp; c.expedition = { route: 'guild', issuedAt: c.hour };
    const progress = newFantasyDungeonProgress(); progress.revealed = site.rooms.map(room => room.id); progress.visited = [...progress.revealed];
    c.dungeon = { known: [site.id], active: { site: site.id, room: boss.id }, sites: { [site.id]: progress } };
    return [user, p];
  }));
  fs.writeFileSync(file, JSON.stringify(profiles)); let fail = false;
  const options = { combatEnabled: true, worldHour: () => 8, onError: () => {}, save: (target: string, bytes: string) => { if (fail) throw Error('disk-full'); fs.writeFileSync(target, bytes); } };
  const make = () => new FantasyStore(file, options), initial = make(); assert.equal(initial.loadError, undefined);
  const start = initial.startCombat(users.map(user => ({ user, generation: 1, location: site.location, session: 'expedition', source: 'dungeon' as const, target: `${site.id}:${boss.id}` })), () => .5);
  assert.equal(start.error, undefined); assert.ok(start.state);
  const id = start.state.id, disk = JSON.parse(fs.readFileSync(file, 'utf8')), record = disk.combats[id], state = record.state;
  assert.match(record.expeditionSeed, /^[a-f0-9-]{36}$/);
  const seed = seedFor(outcomes); record.expeditionSeed = seed;
  const enemy = state.fighters.find((fighter: { side: string }) => fighter.side === 'enemies'); enemy.tile = { x: 8, y: 4 }; enemy.hp = 1;
  state.fighters.filter((fighter: { side: string }) => fighter.side === 'players').forEach((fighter: { tile: { x: number; y: number }; stats: { attack: number; agility: number } }, index: number) => {
    fighter.tile = { x: 7, y: 4 + index }; fighter.stats.attack = 1000; fighter.stats.agility = 1000;
  });
  fs.writeFileSync(file, JSON.stringify(disk)); const store = make(); assert.equal(store.loadError, undefined);
  const order = (user: string, command: FantasyCombatOrder, targetStore = store) => {
    const current = targetStore.combat(user, 'expedition')!;
    return targetStore.combatOrder(user, 'expedition', id, current.revision, command);
  };
  const win = (targetStore = store) => {
    let result = order(users[0], { type: 'attack', target: enemy.id }, targetStore);
    for (const user of users.slice(1)) if (!result.error && result.state?.status === 'active') result = order(user, { type: 'guard' }, targetStore);
    assert.equal(result.error, undefined); assert.equal(result.state?.status, 'victory'); return result;
  };
  return { file, users, id, seed, store, make, order, win, enemy: enemy.id as string, fail: (value: boolean) => { fail = value; } };
}
const artifacts = (store: FantasyStore, user: string) => FANTASY_FRONTIER_ARTIFACTS.reduce((count, item) => count + (store.profile(user).character!.inventory[item.id] ?? 0), 0);

for (const reward of [true, false]) test(`real first ruin victory persists a ${reward ? 'successful' : 'failed'} artifact roll across restart without duplicate awards`, t => {
  const f = fixture(t, { a: reward }), before = f.store.profile('a');
  assert.ok(!JSON.stringify(f.store.combat('a', 'expedition')).includes(f.seed));
  assert.ok(!JSON.stringify(f.store.combat('a', 'expedition')).includes('expeditionSeed'));
  const result = f.win(); assert.ok(!JSON.stringify(result.state).includes('expeditionSeed'));
  const c = f.store.profile('a').character!, rolls = c.expedition!.ruinRolls!;
  assert.equal(rolls.length, 1); assert.equal(rolls[0].site, site.id); assert.equal(!!rolls[0].item, reward);
  assert.equal(artifacts(f.store, 'a'), reward ? 1 : 0); assert.ok(c.dungeon!.sites[site.id].cleared.includes(boss.id));
  const restored = f.make(); assert.equal(restored.loadError, undefined); assert.deepEqual(restored.profile('a'), f.store.profile('a'));
  const stable = restored.profile('a');
  assert.ok(restored.startCombat([{ user: 'a', generation: 1, location: site.location, session: 'expedition', source: 'dungeon', target: `${site.id}:${boss.id}` }]).error);
  assert.ok(restored.combatOrder('a', 'expedition', f.id, result.state!.revision, { type: 'attack', target: f.enemy }).error);
  assert.deepEqual(restored.profile('a'), stable); assert.equal(artifacts(restored, 'a'), reward ? 1 : 0);
  assert.equal(before.character!.expedition!.ruinRolls, undefined);
});

for (const reward of [true, false]) test(`a failed victory save rolls back the ${reward ? 'successful' : 'failed'} ruin roll before an identical retry`, t => {
  const f = fixture(t, { a: reward }), before = f.store.profile('a'), battle = f.store.combat('a', 'expedition'), bytes = fs.readFileSync(f.file, 'utf8');
  f.fail(true);
  const failed = f.order('a', { type: 'attack', target: f.enemy }); assert.equal(failed.error, 'save-failed');
  assert.deepEqual(f.store.profile('a'), before); assert.deepEqual(f.store.combat('a', 'expedition'), battle); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  f.fail(false); f.win(); assert.equal(artifacts(f.store, 'a'), reward ? 1 : 0); assert.equal(f.store.profile('a').character!.expedition!.ruinRolls!.length, 1);
  const restored = f.make(); assert.equal(restored.loadError, undefined); assert.equal(artifacts(restored, 'a'), reward ? 1 : 0);
});

test('party members receive independently seeded first-clear outcomes instead of copied artifacts', t => {
  const f = fixture(t, { a: true, b: false }); assert.ok(draw(f.seed, 'a') < .3); assert.ok(draw(f.seed, 'b') >= .3);
  f.win();
  for (const user of f.users) {
    const roll = f.store.profile(user).character!.expedition!.ruinRolls!;
    assert.equal(roll.length, 1); assert.equal(!!roll[0].item, user === 'a'); assert.equal(artifacts(f.store, user), user === 'a' ? 1 : 0);
  }
  const restored = f.make(); assert.equal(restored.loadError, undefined); assert.equal(artifacts(restored, 'a'), 1); assert.equal(artifacts(restored, 'b'), 0);
});

test('legacy active frontier fights receive a persisted private seed before victory', t => {
  const f = fixture(t, { a: false }), disk = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  delete disk.combats[f.id].expeditionSeed; fs.writeFileSync(f.file, JSON.stringify(disk));
  const restored = f.make(); assert.equal(restored.loadError, undefined);
  const upgraded = JSON.parse(fs.readFileSync(f.file, 'utf8')).combats[f.id].expeditionSeed;
  assert.match(upgraded, /^[a-f0-9-]{36}$/); assert.ok(!JSON.stringify(restored.combat('a', 'expedition')).includes(upgraded));
});
