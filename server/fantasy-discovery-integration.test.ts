import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { fantasyCombatPlayer } from './fantasy-combat-adapter.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { grantFantasyCircleBasics } from '../shared/fantasy-magic-circle.ts';
import { fantasyAlchemyRecipeKey, fantasyAlchemyFormulaKnown } from '../shared/fantasy-alchemy-discovery.ts';
import { fantasyBagState, fantasyItemWeight } from '../shared/fantasy-bags.ts';
import { FANTASY_ITEMS } from '../shared/fantasy-data.ts';
import { foodMeta } from '../shared/fantasy-life.ts';
import { FANTASY_TASK_QUESTS } from '../shared/fantasy-task-quests.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
import { fantasyEncounterFor } from '../shared/fantasy-encounters.ts';
import { validFantasyCombatState } from '../shared/fantasy-combat.ts';

const action = { type: 'alchemyCompose' as const, carrier: 'flask' as const, ingredients: ['redleaf', 'lizard-hide'] };
function profile(job = 'alchemist', location = 'mooncity'): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Discovery', gender: 'female' }, () => .5).profile;
  const c = p.character!; c.job = job; c.jobXp[job] = 100; c.level = 10; c.location = location; c.visited = [...new Set([...c.visited, location])]; c.hour = 12;
  c.inventory = { redleaf: 2, 'lizard-hide': 2, moonmint: 2 }; c.foodLots = []; c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  return p;
}
function fixture(t: TestContext, initial = profile()) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-discovery-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dataDir).startsWith('fantasy-discovery-')); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const file = path.join(dataDir, 'fantasy.json'); fs.writeFileSync(file, JSON.stringify({ owner: initial })); let hour = 12;
  const make = () => new FantasyStore(file, { combatEnabled: true, worldHour: () => hour, onError: () => {} });
  return { file, make, time: (value: number) => { hour = value; } };
}

test('authoritative prepared flame carries its field into actual combat and survives a store restart', t => {
  const p = profile('mage', 'reedfen'); grantFantasyCircleBasics(p.character!);
  p.character!.specialization = { spells: [{ slot: 1, element: 'flame', form: 'bolt', circle: { core: 'flame', runes: [] } }] };
  const prepared = fantasyCombatPlayer(p, 'owner').skills.find(skill => skill.id === 'prepared-spell-1');
  assert.equal(prepared?.field, 'fire');
  const encounter = fantasyEncounterFor('swamp', 'exploration').id; p.event = encounter;
  const f = fixture(t, p); let store = f.make(); assert.equal(store.loadError, undefined);
  const started = store.startCombat([{ user: 'owner', source: 'encounter', target: encounter, session: 'test', generation: p.generation ?? 1, location: 'reedfen' }], () => .5);
  assert.equal(started.error, undefined);
  // Isolate field persistence from approach distance on the generated swamp map.
  const arranged = JSON.parse(fs.readFileSync(f.file, 'utf8')), close = arranged.combats[started.state!.id].state;
  close.battlefield.obstacles = []; close.battlefield.blocked = [];
  close.fighters.find((fighter: { userId?: string }) => fighter.userId === 'owner').tile = { x: 4, y: 4 };
  close.fighters.find((fighter: { side: string }) => fighter.side === 'enemies').tile = { x: 5, y: 4 };
  assert.ok(validFantasyCombatState(close)); fs.writeFileSync(f.file, JSON.stringify(arranged)); store = f.make(); assert.equal(store.loadError, undefined);
  const state = store.combat('owner', 'test')!, target = state.fighters.find(fighter => fighter.side === 'enemies')!;
  const result = store.combatOrder('owner', 'test', state.id, state.revision, { type: 'skill', skill: 'prepared-spell-1', target: target.id });
  assert.equal(result.error, undefined); assert.ok(result.state!.fields?.some(field => field.kind === 'fire' && field.tile.x === target.tile!.x && field.tile.y === target.tile!.y));
  const loaded = f.make(); assert.equal(loaded.loadError, undefined); assert.deepEqual(loaded.combat('owner', 'test')!.fields, result.state!.fields);
  const saved = JSON.parse(fs.readFileSync(f.file, 'utf8')); saved.combats[state.id].state.fields[0].power = 999;
  const bytes = JSON.stringify(saved); fs.writeFileSync(f.file, bytes); assert.ok(f.make().loadError); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
});

test('timed synthesis discovers and consumes only on completion, once across restart', t => {
  const f = fixture(t); let store = f.make(); assert.equal(store.loadError, undefined);
  const started = store.apply('owner', store.profile('owner').revision, action, () => 0);
  assert.equal(started.error, undefined); assert.equal(started.profile.activity?.endsAt, 14); assert.equal(started.profile.character!.inventory.redleaf, 2); assert.equal(started.profile.character!.alchemyKnowledge, undefined);
  f.time(13); store = f.make(); assert.equal(store.loadError, undefined); const midway = store.synchronize('owner').profile;
  assert.equal(midway.character!.inventory.redleaf, 2); assert.equal(midway.character!.inventory['fire-bomb'] ?? 0, 0); assert.equal(midway.character!.alchemyKnowledge, undefined);
  f.time(14); const completion = store.synchronize('owner'); assert.equal(completion.error, undefined); const completed = completion.profile;
  assert.equal(completed.activity, undefined); assert.equal(completed.character!.inventory.redleaf, 1); assert.equal(completed.character!.inventory['lizard-hide'], 1); assert.equal(completed.character!.inventory['fire-bomb'], 1);
  assert.deepEqual(completed.character!.alchemyKnowledge?.recipes, [fantasyAlchemyRecipeKey('flask', action.ingredients)]);
  store = f.make(); assert.equal(store.loadError, undefined); assert.deepEqual(store.synchronize('owner').profile, completed);
});

test('failed mixtures spend their reagents and time without learning or awarding an unrelated quest', t => {
  const p = profile(); p.character!.quests = [FANTASY_TASK_QUESTS[0].id]; p.character!.taskProgress = { [FANTASY_TASK_QUESTS[0].id]: { acceptedAt: 12, progress: 0, lastAt: 12 } };
  const f = fixture(t, p), store = f.make(); assert.equal(store.loadError, undefined);
  const before = store.profile('owner'), started = store.apply('owner', before.revision, { ...action, ingredients: ['moonmint', 'lizard-hide'] }, () => 0);
  assert.equal(started.error, undefined); f.time(14); const completed = store.synchronize('owner').profile;
  assert.equal(completed.character!.inventory.moonmint, 1); assert.equal(completed.character!.inventory['lizard-hide'], 1); assert.equal(completed.character!.hour, 14);
  assert.equal(completed.character!.alchemyKnowledge, undefined); assert.deepEqual(completed.character!.taskProgress, before.character!.taskProgress); assert.deepEqual(completed.character!.completed, before.character!.completed);
  assert.ok(completed.log.some(entry => entry.kind === 'failure' && entry.text === 'alchemy:synthesis:failed'));
});

test('cancelling a saved synthesis leaves every reagent and recipe untouched', t => {
  const f = fixture(t); let store = f.make(); const before = store.profile('owner');
  assert.equal(store.apply('owner', before.revision, action, () => 0).error, undefined); f.time(13); store = f.make();
  const cancelled = store.apply('owner', store.profile('owner').revision, { type: 'cancel' }); assert.equal(cancelled.error, undefined);
  f.time(15); store = f.make(); assert.equal(store.loadError, undefined); const later = store.synchronize('owner').profile;
  assert.equal(later.activity, undefined); assert.deepEqual(later.character!.inventory, before.character!.inventory); assert.equal(later.character!.alchemyKnowledge, undefined);
});

test('missing materials and an overfull output bag reject synthesis atomically', t => {
  const p = profile(); p.character!.inventory['lizard-hide'] = 0;
  const f = fixture(t, p), store = f.make(), before = store.profile('owner');
  assert.equal(store.loadError, undefined);
  assert.ok(store.apply('owner', before.revision, action).error); assert.deepEqual(store.profile('owner'), before);
  const full = profile(); full.character!.inventory = fullInventory(); assert.equal(fantasyBagState(full.character!).slots, 24);
  const g = fixture(t, full), second = g.make(), original = second.profile('owner');
  assert.equal(second.loadError, undefined);
  assert.ok(second.apply('owner', original.revision, action).error); assert.deepEqual(second.profile('owner'), original);
});

function fullInventory() {
  const fillers = FANTASY_ITEMS.filter(item => !foodMeta(item.id) && item.category !== 'alchemy-potion' && !['redleaf', 'lizard-hide'].includes(item.id) && fantasyItemWeight(item) <= 250).slice(0, 22);
  assert.equal(fillers.length, 22);
  return { ...Object.fromEntries(fillers.map(item => [item.id, 1])), redleaf: 2, 'lizard-hide': 2 };
}

test('an output that no longer fits at timed completion is held safely with its discovered recipe', t => {
  const f = fixture(t), store = f.make(); assert.equal(store.apply('owner', store.profile('owner').revision, action, () => 0).error, undefined);
  const saved = JSON.parse(fs.readFileSync(f.file, 'utf8')); const data = saved.version === 2 ? saved.profiles : saved; data.owner.character.inventory = fullInventory(); fs.writeFileSync(f.file, JSON.stringify(saved));
  f.time(14); const restored = f.make(); assert.equal(restored.loadError, undefined); const completed = restored.synchronize('owner').profile;
  assert.equal(completed.character!.inventory.redleaf, 1); assert.equal(completed.character!.inventory['lizard-hide'], 1); assert.equal(completed.character!.inventory['fire-bomb'] ?? 0, 0);
  assert.equal(completed.character!.pendingLoot?.mooncity.items['fire-bomb'], 1); assert.ok(completed.character!.alchemyKnowledge?.recipes.includes(fantasyAlchemyRecipeKey('flask', action.ingredients)!));
  const reloaded = f.make(); assert.equal(reloaded.loadError, undefined); assert.deepEqual(reloaded.synchronize('owner').profile, completed);
});
test('legacy formulas remain unknown while reserved and learn only after one successful persisted completion', t => {
  const p = profile(); p.character!.inventory.herb = 4;
  const f = fixture(t, p); let store = f.make();
  const started = store.apply('owner', store.profile('owner').revision, { type: 'alchemy', formula: 'healing' }, () => .999);
  assert.equal(started.error, undefined); assert.equal(started.profile.activity?.endsAt, 15); assert.equal(fantasyAlchemyFormulaKnown(started.profile.character!, 'healing'), false);
  assert.equal(started.profile.character!.inventory.herb, 4);
  f.time(14); store = f.make(); assert.equal(fantasyAlchemyFormulaKnown(store.synchronize('owner').profile.character!, 'healing'), false);
  f.time(15); const completed = store.synchronize('owner').profile;
  assert.equal(completed.activity, undefined); assert.equal(completed.character!.inventory.herb, 2); assert.equal(completed.character!.inventory.redleaf, 1);
  assert.ok(fantasyAlchemyFormulaKnown(completed.character!, 'healing')); assert.deepEqual(completed.character!.alchemyKnowledge?.formulas, ['healing']);
  const loaded = f.make(); assert.equal(loaded.loadError, undefined); assert.deepEqual(loaded.synchronize('owner').profile, completed);
});
test('legacy failures and cancelled reservations never identify a formula or reveal its name', t => {
  const p = profile(); p.character!.inventory.herb = 4; p.character!.level = 1; p.character!.hunger = 100; p.character!.fatigue = 100;
  p.character!.hp = fantasyStats(p.character!).hp; p.character!.mp = fantasyStats(p.character!).mp;
  const f = fixture(t, p), store = f.make(); assert.equal(store.apply('owner', store.profile('owner').revision, { type: 'alchemy', formula: 'healing' }, () => 0).error, undefined);
  f.time(15); const failed = store.synchronize('owner').profile;
  assert.equal(failed.character!.inventory.herb, 3); assert.equal(failed.character!.inventory.redleaf, 2); assert.equal(failed.character!.alchemyKnowledge, undefined);
  assert.ok(failed.log.some(log => log.text.startsWith('未確認の配合 1は安定せず'))); assert.ok(!failed.log.some(log => log.text.includes('回復薬の調合')));
  const second = profile(); second.character!.inventory.herb = 4;
  const g = fixture(t, second), reserved = g.make(); assert.equal(reserved.apply('owner', reserved.profile('owner').revision, { type: 'alchemy', formula: 'healing' }, () => .999).error, undefined);
  g.time(13); assert.equal(reserved.apply('owner', reserved.profile('owner').revision, { type: 'cancel' }).error, undefined);
  g.time(16); const cancelled = g.make().synchronize('owner').profile;
  assert.equal(cancelled.character!.alchemyKnowledge, undefined); assert.equal(cancelled.character!.inventory.herb, 4); assert.equal(cancelled.character!.inventory.redleaf, 2);
});
test('legacy formula discovery survives output delivery to a full-bag holding area', t => {
  const p = profile(); p.character!.inventory.herb = 4;
  const f = fixture(t, p), store = f.make(); assert.equal(store.apply('owner', store.profile('owner').revision, { type: 'alchemy', formula: 'healing' }, () => .999).error, undefined);
  const saved = JSON.parse(fs.readFileSync(f.file, 'utf8')), data = saved.version === 2 ? saved.profiles : saved;
  const fillers = FANTASY_ITEMS.filter(item => !foodMeta(item.id) && !['herb', 'redleaf'].includes(item.id) && !item.id.startsWith('hp-potion') && fantasyItemWeight(item) <= 250).slice(0, 22);
  data.owner.character.inventory = { ...Object.fromEntries(fillers.map(item => [item.id, 1])), herb: 4, redleaf: 2 }; fs.writeFileSync(f.file, JSON.stringify(saved));
  f.time(15); const loaded = f.make(); assert.equal(loaded.loadError, undefined); const completed = loaded.synchronize('owner').profile;
  assert.ok(fantasyAlchemyFormulaKnown(completed.character!, 'healing'));
  assert.ok(Object.keys(completed.character!.pendingLoot?.mooncity.items ?? {}).some(id => id.startsWith('hp-potion')));
  assert.deepEqual(f.make().synchronize('owner').profile, completed);
});
