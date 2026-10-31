import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore, type FantasyCombatPlan } from './fantasy-store.ts';
import { applyFantasyAction, advanceFantasyWorld, fantasyStats, fantasyTransports, newFantasyProfile, startFantasyActivity } from '../shared/fantasy-engine.ts';
import { fantasyCombatPlayer } from './fantasy-combat-adapter.ts';
import { fantasyRegularEncounterTier } from '../shared/fantasy-adventurer.ts';
import { fantasyCombatStartPlan } from '../shared/fantasy-combat-challenges.ts';
import { fantasyCombatEnemy } from '../shared/fantasy-combat-catalog.ts';
import { fantasyCombatOrderError, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatOrder, type FantasyCombatState } from '../shared/fantasy-combat.ts';
import { FANTASY_NAVAL_HARPOON } from '../shared/fantasy-naval.ts';
import { FANTASY_LOCATIONS } from '../shared/fantasy-data.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';

function traveler(name = 'Naval voyager', location = 'tidehaven'): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name, gender: 'female' }, () => .5).profile, c = p.character!;
  Object.assign(c, { location, hour: 12, level: 80, job: 'warrior', gold: 10000, birthBonuses: {}, fatigue: 0, hunger: 0, foodLots: [],
    inventory: { lantern: 1, 'oak-bow': 1 }, equipment: { weapon: 'oak-bow' }, equippedGear: {}, gear: [], outfit: undefined });
  c.visited = [...new Set(['hearth', location])]; c.charted = FANTASY_LOCATIONS.map(place => place.id); c.jobXp.warrior = 0;
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  const actor = fantasyCombatPlayer(p, 'a'); c.encounterTier = fantasyRegularEncounterTier(actor.stats, actor);
  return p;
}
function voyage(mode: 'ship' | 'working-ship' = 'ship') {
  const p = traveler();
  const started = startFantasyActivity(p, { type: 'travel', destination: 'verdant-quay', transport: mode }, 12, () => 39.5 / 4294967296);
  assert.equal(started.error, undefined); assert.ok(started.profile.activity);
  const stopped = advanceFantasyWorld(started.profile, started.profile.activity.endsAt, { ambush: true }).profile;
  assert.ok(stopped.event); assert.equal(stopped.activity, undefined); assert.equal(stopped.character!.travelPosition!.transport, mode);
  for (let index = 0; index < 100; index++) {
    stopped.character!.name = `Naval voyager ${index}`;
    if (fantasyCombatStartPlan(stopped, 'encounter', stopped.event!)?.enemies[0].template === 'monster-juvenile-kraken') {
      return { profile: stopped, paidGold: started.profile.character!.gold, originalGold: p.character!.gold, originalJourney: started.profile.activity };
    }
  }
  assert.fail('A tier-six naval encounter must offer a juvenile kraken for a deterministic voyage fixture');
}
function fixture(t: TestContext, profiles: Record<string, FantasyProfile>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-naval-store-'));
  t.after(() => { const target = path.resolve(dir); assert.equal(path.dirname(target), path.resolve(os.tmpdir())); assert.ok(path.basename(target).startsWith('fantasy-naval-store-')); fs.rmSync(target, { recursive: true, force: true }); });
  const file = path.join(dir, 'fantasy.json'); fs.writeFileSync(file, JSON.stringify(profiles));
  let hour = Math.max(...Object.values(profiles).map(profile => profile.character!.hour)), fail = false;
  const options = { combatEnabled: true, ambush: false, worldHour: () => hour, onError: () => {}, save: (target: string, text: string) => { if (fail) throw Error('Naval save failed'); fs.writeFileSync(target, text); } };
  let store = new FantasyStore(file, options); assert.equal(store.loadError, undefined);
  const plan = (user = 'a', source: FantasyCombatPlan['source'] = 'encounter', target = store.profile(user).event!): FantasyCombatPlan => ({ user, source, target, session: 'ship-session', generation: store.profile(user).generation ?? 1, location: store.profile(user).character!.location });
  return { get store() { return store; }, plan, file, fail: (value: boolean) => { fail = value; }, time: (value: number) => { hour = value; },
    reload: () => { store = new FantasyStore(file, options); assert.equal(store.loadError, undefined); } };
}
function start(f: ReturnType<typeof fixture>) {
  const result = f.store.startCombat([f.plan()], () => .5);
  assert.equal(result.error, undefined); assert.ok(result.state!.naval);
  assert.equal(result.state!.fighters.find(fighter => fighter.side === 'enemies')!.template, 'monster-juvenile-kraken');
  assert.equal(validFantasyCombatState(result.state), true);
  return result.state!;
}
function weakenSavedEnemies(f: ReturnType<typeof fixture>, state: FantasyCombatState) {
  const saved = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  const battle: FantasyCombatState = saved.combats[state.id].state;
  for (const enemy of battle.fighters.filter(fighter => fighter.side === 'enemies')) enemy.hp = 1;
  assert.equal(validFantasyCombatState(battle), true);
  fs.writeFileSync(f.file, JSON.stringify(saved)); f.reload();
  return f.store.combat('a', 'ship-session')!;
}
function finish(f: ReturnType<typeof fixture>, initial: FantasyCombatState) {
  let state = weakenSavedEnemies(f, initial);
  const core = state.naval!.offshore[0].id;
  for (let round = 0; round < 8 && state.status === 'active'; round++) {
    const actor = state.fighters.find(fighter => fighter.userId === 'a')!;
    const attack = { type: 'attack' as const, target: core };
    const order = fantasyCombatOrderError(state, 'a', attack) === 'range' ? { type: 'moveTo' as const, tile: { x: 3, y: actor.tile!.y } } : attack;
    const result = f.store.combatOrder('a', 'ship-session', state.id, state.revision, order);
    assert.equal(result.error, undefined); state = result.state!;
  }
  assert.equal(state.status, 'victory');
  return state;
}
function continueVoyage(f: ReturnType<typeof fixture>) {
  const current = f.store.profile('a'), c = current.character!, position = c.travelPosition!;
  assert.ok(position); assert.equal(current.event, null); assert.equal(current.combatId, undefined);
  const quote = fantasyTransports(c, position.to).find(quote => quote.id === position.transport)!;
  assert.ok(quote?.available); assert.equal(quote.cost, 0);
  const gold = c.gold;
  const resumed = f.store.apply('a', current.revision, { type: 'travel', destination: position.to, transport: position.transport! }, () => .5);
  assert.equal(resumed.error, undefined); assert.equal(resumed.profile.character!.gold, gold);
  assert.equal(resumed.profile.activity!.travel!.legs[0].startFraction, position.fraction);
  f.time(resumed.profile.activity!.endsAt); f.store.tick(new Set(['a']));
  const arrived = f.store.profile('a');
  assert.equal(arrived.character!.location, position.to); assert.equal(arrived.character!.travelPosition, undefined);
  assert.equal(arrived.character!.gold, gold); assert.equal(arrived.activity, undefined);
  f.reload(); assert.deepEqual(f.store.profile('a'), arrived);
}

test('actual paid ship and working-ship ambushes create naval combat and preserve its snapshot and temporary tool across restart', t => {
  for (const mode of ['ship', 'working-ship'] as const) {
    const v = voyage(mode), f = fixture(t, { a: v.profile }), initial = start(f);
    assert.ok(v.paidGold < v.originalGold || mode === 'working-ship');
    assert.equal(initial.naval!.offshore[0].parts.length, 3);
    assert.equal(initial.fighters.filter(fighter => fighter.side === 'enemies').length, 4);
    assert.equal(initial.fighters.find(fighter => fighter.userId === 'a')!.skills.filter(skill => skill.id === FANTASY_NAVAL_HARPOON).length, 1);
    const position = structuredClone(f.store.profile('a').character!.travelPosition);
    f.reload(); assert.deepEqual(f.store.combat('a', 'ship-session'), initial);
    assert.deepEqual(f.store.profile('a').character!.travelPosition, position);
  }
});

test('using the shared harpoon remains free, does not invent learned skill experience and survives actor refresh and reload', t => {
  const f = fixture(t, { a: voyage().profile }), state = start(f), before = f.store.profile('a').character!;
  const result = f.store.combatOrder('a', 'ship-session', state.id, state.revision, { type: 'skill', skill: FANTASY_NAVAL_HARPOON, target: state.naval!.offshore[0].id });
  assert.equal(result.error, undefined); assert.ok(result.state!.naval!.tether);
  const after = f.store.profile('a').character!;
  assert.equal(after.mp, before.mp); assert.equal(after.skillXp?.[FANTASY_NAVAL_HARPOON], undefined);
  assert.ok(!after.learnedSkills?.includes(FANTASY_NAVAL_HARPOON));
  assert.equal(result.state!.fighters.find(fighter => fighter.userId === 'a')!.skills.filter(skill => skill.id === FANTASY_NAVAL_HARPOON).length, 1);
  f.reload(); assert.deepEqual(f.store.combat('a', 'ship-session'), result.state);
  assert.equal(f.store.profile('a').character!.skillXp?.[FANTASY_NAVAL_HARPOON], undefined);
});

test('kraken victory grants only one core reward budget, cannot replay it and resumes the already-paid voyage', t => {
  const v = voyage(), f = fixture(t, { a: v.profile }), before = f.store.profile('a').character!, state = finish(f, start(f));
  const reward = fantasyCombatEnemy('monster-juvenile-kraken')!.reward, after = f.store.profile('a').character!;
  assert.equal(after.xp - before.xp, reward.xp); assert.equal(after.gold - before.gold, reward.gold);
  for (const material of reward.materials) assert.equal((after.inventory[material.item] ?? 0) - (before.inventory[material.item] ?? 0), material.count);
  assert.equal(after.lastHunt?.id, 'monster-juvenile-kraken'); assert.equal(after.lastHunt?.count, 1);
  assert.equal(state.fighters.filter(fighter => fighter.side === 'enemies').every(fighter => fighter.hp === 0), true);
  const bytes = fs.readFileSync(f.file, 'utf8'), profile = f.store.profile('a');
  assert.ok(f.store.combatOrder('a', 'ship-session', state.id, state.revision, { type: 'guard' }).error);
  assert.equal(fs.readFileSync(f.file, 'utf8'), bytes); f.reload(); assert.deepEqual(f.store.profile('a'), profile);
  continueVoyage(f);
});

test('failed naval start and harpoon saves roll back profiles, cooldown and voyage position before a deterministic retry', t => {
  const f = fixture(t, { a: voyage().profile }), original = f.store.profile('a'), bytes = fs.readFileSync(f.file, 'utf8');
  f.fail(true); assert.equal(f.store.startCombat([f.plan()], () => .5).error, 'save-failed');
  assert.deepEqual(f.store.profile('a'), original); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  f.fail(false); const state = start(f), before = f.store.profile('a'), startedBytes = fs.readFileSync(f.file, 'utf8');
  const order = { type: 'skill' as const, skill: FANTASY_NAVAL_HARPOON, target: state.naval!.offshore[0].id };
  f.fail(true); assert.equal(f.store.combatOrder('a', 'ship-session', state.id, state.revision, order).error, 'save-failed');
  assert.deepEqual(f.store.profile('a'), before); assert.deepEqual(f.store.combat('a', 'ship-session'), state);
  assert.equal(fs.readFileSync(f.file, 'utf8'), startedBytes);
  f.fail(false); const retried = f.store.combatOrder('a', 'ship-session', state.id, state.revision, order);
  assert.equal(retried.error, undefined); assert.ok(retried.state!.naval!.tether);
  assert.deepEqual(f.store.profile('a').character!.travelPosition, original.character!.travelPosition);
  assert.equal(f.store.combatOrder('a', 'ship-session', state.id, state.revision, order).error, 'stale');
});

test('a failed final victory save cannot leak core rewards or consumed appendages before a single successful retry', t => {
  const f = fixture(t, { a: voyage().profile }); let state = weakenSavedEnemies(f, start(f));
  let finishingOrder: FantasyCombatOrder | undefined;
  for (let round = 0; round < 8; round++) {
    const actor = state.fighters.find(fighter => fighter.userId === 'a')!, target = state.naval!.offshore[0].id;
    const attack = { type: 'attack' as const, target };
    const order = fantasyCombatOrderError(state, 'a', attack) === 'range' ? { type: 'moveTo' as const, tile: { x: 3, y: actor.tile!.y } } : attack;
    const preview = submitFantasyCombatOrder(state, 'a', state.revision, order, state.hour);
    assert.equal(preview.error, undefined);
    if (preview.state.status === 'victory') { finishingOrder = order; break; }
    const next = f.store.combatOrder('a', 'ship-session', state.id, state.revision, order);
    assert.equal(next.error, undefined); state = next.state!;
  }
  assert.ok(finishingOrder);
  const before = f.store.profile('a'), bytes = fs.readFileSync(f.file, 'utf8');
  f.fail(true);
  assert.equal(f.store.combatOrder('a', 'ship-session', state.id, state.revision, finishingOrder).error, 'save-failed');
  assert.deepEqual(f.store.profile('a'), before); assert.deepEqual(f.store.combat('a', 'ship-session'), state);
  assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  f.fail(false);
  const retry = f.store.combatOrder('a', 'ship-session', state.id, state.revision, finishingOrder);
  assert.equal(retry.error, undefined); assert.equal(retry.state!.status, 'victory');
  assert.equal(f.store.profile('a').character!.xp - before.character!.xp, 50);
  assert.equal(f.store.profile('a').character!.gold - before.character!.gold, 12);
  assert.equal((f.store.profile('a').character!.inventory.fish ?? 0) - (before.character!.inventory.fish ?? 0), 1);
  const committed = f.store.profile('a'); f.reload(); assert.deepEqual(f.store.profile('a'), committed);
  assert.ok(f.store.combatOrder('a', 'ship-session', state.id, state.revision, finishingOrder).error);
  assert.deepEqual(f.store.profile('a'), committed);
});

test('stationary coastline hunts and interrupted airships never become naval combats', t => {
  const shore = traveler('Shore hunter', 'frontier-kelp-coast'); shore.character!.expedition = { route: 'guild', issuedAt: 8 };
  const f = fixture(t, { a: shore });
  const hunted = f.store.startCombat([f.plan('a', 'hunt', 'monster-deep-serpent')], () => .5);
  assert.equal(hunted.error, undefined); assert.equal(hunted.state!.naval, undefined);
  assert.equal(hunted.state!.fighters.find(fighter => fighter.userId === 'a')!.skills.some(skill => skill.id === FANTASY_NAVAL_HARPOON), false);
  let air = traveler('Airship voyager', 'hearth');
  const reserved = startFantasyActivity(air, { type: 'travel', destination: 'greenwood', transport: 'airship' }, 12, () => .5);
  assert.equal(reserved.error, undefined);
  air = advanceFantasyWorld(reserved.profile, 12 + (reserved.profile.activity!.endsAt - 12) / 2, { ambush: false }).profile;
  delete air.activity; air.event = 'encounter-reef-beast';
  const airborne = fixture(t, { a: air }), battle = airborne.store.startCombat([airborne.plan()], () => .5);
  assert.equal(battle.error, undefined); assert.equal(battle.state!.naval, undefined);
});

test('late crew may join at the same sea position while port outsiders and different voyage positions are rejected', t => {
  const a = voyage().profile, b = structuredClone(a), port = structuredClone(a), elsewhere = structuredClone(a);
  b.character!.name = 'Same-position crew'; b.event = null;
  port.character!.name = 'Port outsider'; port.event = null; delete port.character!.travelPosition;
  elsewhere.character!.name = 'Different-position crew'; elsewhere.event = null; elsewhere.character!.travelPosition!.fraction += .1;
  const f = fixture(t, { a, b, port, elsewhere }), state = start(f);
  assert.ok(f.store.joinCombat('port', 'ship-session', state.id).error);
  assert.ok(f.store.joinCombat('elsewhere', 'ship-session', state.id).error);
  const joined = f.store.joinCombat('b', 'ship-session', state.id);
  assert.equal(joined.error, undefined);
  const member = joined.state!.fighters.find(fighter => fighter.userId === 'b')!;
  assert.ok(member.tile!.x <= 6); assert.ok(member.skills.some(skill => skill.id === FANTASY_NAVAL_HARPOON));
  f.reload(); assert.deepEqual(f.store.combat('b', 'ship-session'), joined.state);
});

test('escaping the naval fight clears the hostile event and retains the paid sailing continuation', t => {
  const f = fixture(t, { a: voyage().profile }); let state = start(f);
  for (let round = 0; round < 16 && state.status === 'active'; round++) {
    const result = f.store.combatOrder('a', 'ship-session', state.id, state.revision, { type: 'escape' });
    assert.equal(result.error, undefined); state = result.state!;
  }
  assert.equal(state.status, 'escaped');
  continueVoyage(f);
});
