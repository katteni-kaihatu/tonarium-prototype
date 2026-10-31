import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile, startFantasyActivity } from '../shared/fantasy-engine.ts';
import { fantasyBagState, validFantasyPendingLoot } from '../shared/fantasy-bags.ts';
import { validFantasyCombatState } from '../shared/fantasy-combat.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
import { fantasyTestAcceptHunt } from './fantasy-test-combat-access.ts';
function player(job = 'farmer') {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Delivery Store', gender: 'female' }, () => .5).profile, c = p.character!;
  c.job = job; c.jobXp[job] = 0; c.inventory = {}; c.foodLots = []; return p;
}
function fixture(t: TestContext, p: FantasyProfile, initialHour = p.character!.hour) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-delivery-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); const file = path.join(dir, 'save.json'); fs.writeFileSync(file, JSON.stringify({ a: p })); let hour = initialHour, fail = false;
  const make = () => new FantasyStore(file, { combatEnabled: true, worldHour: () => hour, onError: () => {}, save: (target, bytes) => { if (fail) throw Error('disk'); fs.writeFileSync(target, bytes); } });
  return { file, make, hour: (v: number) => { hour = v; }, fail: (v: boolean) => { fail = v; } };
}
test('queued farm work completes with recoverable overflow once after reload and failed saves publish nothing', t => {
  const p = player(), started = startFantasyActivity(p, { type: 'work' }, p.character!.hour, () => .99); assert.equal(started.error, undefined);
  started.profile.character!.inventory.wood = 13;
  const f = fixture(t, started.profile, started.profile.activity!.endsAt), store = f.make(); assert.equal(store.loadError, undefined);
  const before = store.profile('a'), bytes = fs.readFileSync(f.file, 'utf8'); f.fail(true);
  assert.ok(store.synchronize('a').error); assert.deepEqual(store.profile('a'), before); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  f.fail(false); const completed = store.synchronize('a'); assert.equal(completed.error, undefined); assert.equal(completed.profile.activity, undefined);
  assert.ok(completed.profile.character!.pendingLoot?.hearth); assert.ok(validFantasyPendingLoot(completed.profile.character!)); assert.equal(fantasyBagState(completed.profile.character!).overloaded, false);
  const restored = f.make(); assert.equal(restored.loadError, undefined); assert.deepEqual(restored.synchronize('a').profile, completed.profile);
});
test('combat victory finishes atomically even when material rewards must wait for bag space', t => {
  const p = player('warrior'), c = p.character!; c.location = 'greenwood'; c.visited.push('greenwood'); c.level = 12; c.inventory = { wood: 13, herb: 1 }; c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  const f = fixture(t, fantasyTestAcceptHunt(p)), store = f.make(); assert.equal(store.loadError, undefined);
  const started = store.startCombat([{ user: 'a', source: 'hunt', target: 'monster-forest-wolf', session: 'same', generation: 1, location: 'greenwood' }], () => .5); assert.equal(started.error, undefined);
  const disk = JSON.parse(fs.readFileSync(f.file, 'utf8')), state = disk.combats[started.state!.id].state, actor = state.fighters.find((fighter: any) => fighter.userId === 'a'), enemy = state.fighters.find((fighter: any) => fighter.side === 'enemies');
  state.battlefield.obstacles = []; state.seed = 1; actor.tile = { x: 4, y: 4 }; enemy.tile = { x: 5, y: 4 }; actor.stats.attack = 1000; actor.stats.accuracy = 100; enemy.hp = 1;
  assert.ok(validFantasyCombatState(state)); fs.writeFileSync(f.file, JSON.stringify(disk)); const loaded = f.make(); assert.equal(loaded.loadError, undefined);
  const before = loaded.profile('a'); f.fail(true); assert.equal(loaded.combatOrder('a', 'same', state.id, state.revision, { type: 'attack', target: enemy.id }).error, 'save-failed'); assert.deepEqual(loaded.profile('a'), before);
  f.fail(false); const result = loaded.combatOrder('a', 'same', state.id, state.revision, { type: 'attack', target: enemy.id }); assert.equal(result.error, undefined); assert.equal(result.state!.status, 'victory');
  const after = loaded.profile('a'); assert.equal(after.combatId, undefined); assert.ok(after.character!.pendingLoot?.greenwood.items.meat); assert.ok(validFantasyPendingLoot(after.character!)); assert.equal(fantasyBagState(after.character!).overloaded, false);
  assert.equal(f.make().loadError, undefined);
});

test('partial delivery claim publishes only after a successful save and the remainder survives restart', t => {
  const p = player(); p.character!.inventory.wood = 12; p.character!.pendingLoot = { hearth: { items: { wood: 2 }, gear: [], foodLots: [] } };
  const f = fixture(t, p), store = f.make(); assert.equal(store.loadError, undefined); const before = store.profile('a'), bytes = fs.readFileSync(f.file, 'utf8');
  f.fail(true); assert.ok(store.apply('a', before.revision, { type: 'bagClaim' }).error); assert.deepEqual(store.profile('a'), before); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  f.fail(false); const result = store.apply('a', before.revision, { type: 'bagClaim' }); assert.equal(result.error, undefined); assert.equal(result.profile.character!.inventory.wood, 13); assert.equal(result.profile.character!.pendingLoot!.hearth.items.wood, 1);
  const loaded = f.make(); assert.equal(loaded.loadError, undefined); assert.deepEqual(loaded.profile('a'), result.profile);
});
