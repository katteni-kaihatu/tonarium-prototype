import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { COMPAT_VERSION } from '../shared/protocol.ts';
import { FantasyStore, type FantasyCombatPlan } from './fantasy-store.ts';
import { FantasyParty, type FantasyPartyActor } from './fantasy-party.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { fantasyCombatPlayer, fantasyCombatSupplies } from './fantasy-combat-adapter.ts';
import { fantasyCombatOrderError, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatState, type FantasyCombatOrder } from '../shared/fantasy-combat.ts';
import { fantasyCombatDistance, fantasyCombatMoveRange, fantasyCombatPath } from '../shared/fantasy-combat-tactics.ts';
import { fantasyCombatEnemy, FANTASY_APEX_PROVOCATIONS } from '../shared/fantasy-combat-catalog.ts';
import { fantasyMainInvestigationError } from '../shared/fantasy-main-trials.ts';
import { FANTASY_ITEMS, FANTASY_RACES, FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { applyFantasyPriestAction, fantasyPriestServiceQuest, syncFantasyPriestGrowth } from '../shared/fantasy-priest-growth.ts';
import { fantasyQuestRecordEligible } from '../shared/fantasy-access.ts';
import { FANTASY_READABLE_LIBRARY_BOOKS } from '../shared/fantasy-library.ts';
import { addFantasyStatus } from '../shared/fantasy-effects.ts';
import { createFantasyGear, fantasyEquipGear } from '../shared/fantasy-equipment.ts';
import { foodMeta, reconcileFoodLots } from '../shared/fantasy-life.ts';
import { fantasySpellCapacity } from '../shared/fantasy-specializations.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';

function player(name: string, level = 12, location = 'greenwood', job = 'warrior'): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name, source: 'human', gender: 'female' }, () => .5).profile, c = p.character!;
  p.generation = 1; c.level = level; c.job = job; c.jobXp[job] = 0; c.location = location; c.visited = [...new Set(['hearth', location])]; c.hour = 12;
  c.inventory.potion = 3; c.inventory.lantern = 1; c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  return p;
}
function fixture(t: TestContext, input: Record<string, FantasyProfile> = { a: player('A'), b: player('B') }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-battle-')); t.after(() => { assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('fantasy-battle-')); fs.rmSync(dir, { recursive: true, force: true }); });
  const file = path.join(dir, 'fantasy.json'); fs.writeFileSync(file, JSON.stringify(input)); let hour = 12, fail = false, writes = 0;
  const store = new FantasyStore(file, { combatEnabled: true, worldHour: () => hour, onError: () => {}, save: (file, text) => { if (fail) throw new Error('Test failure'); writes++; fs.writeFileSync(file, text); } });
  assert.equal(store.loadError, undefined);
  const plan = (user: string, source: FantasyCombatPlan['source'] = 'hunt', target = 'monster-forest-wolf', confirm?: boolean): FantasyCombatPlan => ({ user, source, target, session: 'same', generation: store.profile(user).generation ?? 1, location: store.profile(user).character!.location, ...(confirm !== undefined ? { confirm } : {}) });
  return { store, file, plan, time: (value: number) => { hour = value; }, fail: (value: boolean) => { fail = value; }, writes: () => writes };
}
function approachOrAttack(state: FantasyCombatState, user: string): FantasyCombatOrder {
  const actor = state.fighters.find(f => f.userId === user)!, target = state.fighters.find(f => f.side === 'enemies' && f.hp > 0 && !f.fled)!;
  const attack: FantasyCombatOrder = { type: 'attack', target: target.id };
  if (!fantasyCombatOrderError(state, user, attack)) return attack;
  const reach = actor.range === 'melee' ? 1 : actor.range === 'ranged' ? 7 : 8;
  const paths = Array.from({ length: 80 }, (_, index) => ({ x: index % 10, y: Math.floor(index / 10) })).flatMap(tile => {
    if (!target.tile || fantasyCombatDistance(tile, target.tile) > reach) return [];
    const path = fantasyCombatPath(state, actor, tile); return path && path.length > 1 ? [path] : [];
  }).sort((a, b) => a.length - b.length);
  if (!paths[0]) return { type: 'guard' };
  const action: FantasyCombatOrder = { type: 'moveTo', tile: paths[0][Math.min(paths[0].length - 1, fantasyCombatMoveRange(actor))] };
  assert.equal(fantasyCombatOrderError(state, user, action), undefined); return action;
}
function attackRound(store: FantasyStore, state: FantasyCombatState): FantasyCombatState {
  const targets = state.fighters.filter(f => f.side === 'enemies' && f.hp > 0 && !f.fled), players = state.fighters.filter(f => f.side === 'players' && f.hp > 0 && !f.fled);
  let latest = state;
  for (const p of players) {
    if (latest.status !== 'active') break;
    const result = store.combatOrder(p.userId!, 'same', latest.id, latest.revision, approachOrAttack(latest, p.userId!));
    assert.equal(result.error, undefined); latest = result.state!;
  }
  return latest;
}
function victory(store: FantasyStore, state: FantasyCombatState) { let latest = state; for (let i = 0; latest.status === 'active' && i < 50; i++) latest = attackRound(store, latest); assert.equal(latest.status, 'victory'); return latest; }

test('a party battle saves one shared public snapshot with independent owners and reloads a pending round', t => {
  const f = fixture(t), started = f.store.startCombat([f.plan('a'), f.plan('b')], () => .5);
  assert.equal(started.error, undefined); const state = started.state!; assert.equal(state.scaling.participantIds.length, 2); assert.equal(validFantasyCombatState(state), true);
  assert.equal(f.store.profile('a').combatId, state.id); assert.equal(f.store.profile('b').combatId, state.id);
  const target = state.fighters.find(f => f.side === 'enemies')!, first = f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'attack', target: target.id });
  assert.equal(first.error, undefined); assert.equal(first.state!.revision, state.revision); assert.equal(first.state!.round, 1);
  const restored = new FantasyStore(f.file, { combatEnabled: true, worldHour: () => 12, onError: () => {} }); assert.equal(restored.loadError, undefined);
  assert.deepEqual(restored.combat('a', 'same'), first.state); assert.deepEqual(restored.combat('b', 'same'), first.state);
  assert.equal(restored.combat('a', 'other'), null); assert.equal(restored.combat('outsider', 'same'), null);
  for (const forbidden of ['inventory', 'quests', 'completed', 'voyageDecisions', 'apexWarnings']) assert.ok(!JSON.stringify(state).includes(`"${forbidden}"`));
  const secondOrder = approachOrAttack(first.state!, 'b'); assert.equal(secondOrder.type, 'moveTo');
  assert.equal(restored.combatOrder('b', 'same', state.id, state.revision, secondOrder).error, undefined);
  assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).version, 2);
});

test('foreign users, other sessions, stale rounds and duplicate owner slots cannot submit another turn', t => {
  const f = fixture(t), state = f.store.startCombat([f.plan('a'), f.plan('b')], () => .3).state!, target = state.fighters.find(f => f.side === 'enemies')!.id;
  const before = f.store.profile('a');
  assert.equal(f.store.combatOrder('outsider', 'same', state.id, state.revision, { type: 'guard' }).error, 'not-owner');
  assert.equal(f.store.combatOrder('a', 'other', state.id, state.revision, { type: 'guard' }).error, 'not-owner');
  assert.equal(f.store.combatOrder('a', 'same', state.id, state.revision + 1, { type: 'guard' }).error, 'stale');
  assert.equal(f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'attack', target }).error, undefined);
  assert.equal(f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'guard' }).error, 'already-ordered');
  assert.equal(f.store.profile('a').character!.gold, before.character!.gold);
  assert.ok(f.store.apply('a', f.store.profile('a').revision, { type: 'rest' }).error);
});

test('start and resolved-round save failures leave every profile, item and seed unchanged and retry once', t => {
  const f = fixture(t), initialA = f.store.profile('a'), initialB = f.store.profile('b'); f.fail(true);
  assert.equal(f.store.startCombat([f.plan('a'), f.plan('b')], () => .6).error, 'save-failed'); assert.deepEqual(f.store.profile('a'), initialA); assert.deepEqual(f.store.profile('b'), initialB);
  f.fail(false); const state = f.store.startCombat([f.plan('a'), f.plan('b')], () => .6).state!, target = state.fighters.find(f => f.side === 'enemies')!.id;
  const pending = f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'guard' }).state!, a = f.store.profile('a'), b = f.store.profile('b');
  const order: FantasyCombatOrder = approachOrAttack(pending, 'b'), expected = submitFantasyCombatOrder(pending, 'b', pending.revision, order, 12, fantasyCombatSupplies(new Map([['a', a], ['b', b]]), ['a', 'b']));
  f.fail(true); assert.equal(f.store.combatOrder('b', 'same', state.id, pending.revision, order).error, 'save-failed'); assert.deepEqual(f.store.profile('a'), a); assert.deepEqual(f.store.profile('b'), b); assert.deepEqual(f.store.combat('a', 'same'), pending);
  f.fail(false); const retried = f.store.combatOrder('b', 'same', state.id, pending.revision, order); assert.equal(retried.error, undefined); assert.equal(retried.state!.seed, expected.state.seed); assert.deepEqual(retried.state!.logs, expected.state.logs);
  assert.equal(f.store.combatOrder('b', 'same', state.id, pending.revision, order).error, 'stale');
});

test('victory pays the encounter material and gold budget once and never transfers private choices', t => {
  const f = fixture(t, { a: player('A', 30), b: player('B', 30) }), oldGold = f.store.profile('a').character!.gold + f.store.profile('b').character!.gold;
  const state = victory(f.store, f.store.startCombat([f.plan('a'), f.plan('b')], () => .5).state!), enemy = fantasyCombatEnemy('monster-forest-wolf')!;
  assert.equal(f.store.profile('a').combatId, undefined); assert.equal(f.store.profile('b').combatId, undefined);
  assert.equal(f.store.profile('a').character!.gold + f.store.profile('b').character!.gold - oldGold, enemy.reward.gold);
  const before = fs.readFileSync(f.file, 'utf8'); assert.equal(f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'guard' }).error, 'not-owner'); assert.equal(fs.readFileSync(f.file, 'utf8'), before);
  assert.equal(f.store.profile('a').character!.voyageDecisions, undefined); assert.equal(f.store.profile('b').character!.voyageDecisions, undefined);
});

test('story victory unlocks only its current investigation and does not fabricate the investigation proof', t => {
  let p = player('Story', 20, 'hearth'); p = applyFantasyAction(p, { type: 'accept', quest: 'main-night-01' }).profile; p.character!.location = 'oldwatch'; p.character!.visited.push('oldwatch');
  const f = fixture(t, { a: p }); assert.ok(fantasyMainInvestigationError(f.store.profile('a').character!, { type: 'investigate', quest: 'main-night-01', approach: 'observe' }));
  const state = victory(f.store, f.store.startCombat([f.plan('a', 'story', 'main-night-01')], () => .5).state!), c = f.store.profile('a').character!;
  assert.equal(state.source, 'story:main-night-01:field'); assert.ok(c.combatVictories?.[state.source] !== undefined); assert.equal(c.mainTrials!['main-night-01'].proofs.length, 0);
  assert.equal(fantasyMainInvestigationError(c, { type: 'investigate', quest: 'main-night-01', approach: 'observe' }), undefined);
});

test('a fast party story victory opens the passage for manual final-round participants without granting unearned loot', t => {
  for (const idle of [false, true]) {
    const users = ['a', 'b', 'c', 'd', 'e', 'f'];
    const profiles = Object.fromEntries(users.map(user => {
      let p = player(`Story-${user}`, 40, 'hearth'); p = applyFantasyAction(p, { type: 'accept', quest: 'main-night-01' }).profile;
      p.character!.location = 'oldwatch'; p.character!.visited.push('oldwatch'); return [user, p];
    }));
    const f = fixture(t, profiles), before = new Map(users.map(user => [user, f.store.profile(user)]));
    let state = f.store.startCombat(users.map(user => f.plan(user, 'story', 'main-night-01')), () => .5).state!;
    const target = state.fighters.find(fighter => fighter.side === 'enemies')!.id;
    for (const user of users.filter(user => !idle || user !== 'f')) {
      const result = f.store.combatOrder(user, 'same', state.id, state.revision, approachOrAttack(state, user)); assert.equal(result.error, undefined); state = result.state!;
    }
    if (idle) { f.time(state.deadline); f.store.tick(new Set(users)); state = f.store.combat('a', 'same')!; }
    assert.equal(state.status, 'victory'); assert.equal(state.round, 1);
    const noEffect = state.fighters.filter(fighter => fighter.userId && fighter.contribution.effectiveActions === 0);
    assert.ok(noEffect.length > 0);
    for (const user of users) {
      const c = f.store.profile(user).character!, fighter = state.fighters.find(fighter => fighter.userId === user)!;
      assert.equal(c.combatVictories?.[state.source] !== undefined, !(idle && user === 'f'), `${user}: final-round passage credit`);
      assert.equal(c.mainTrials!['main-night-01'].proofs.length, 0);
      if (fighter.contribution.effectiveActions === 0) {
        assert.equal(c.xp, before.get(user)!.character!.xp); assert.equal(c.gold, before.get(user)!.character!.gold);
        assert.deepEqual(c.inventory, before.get(user)!.character!.inventory);
      }
    }
  }
});

test('apex fights need local inspection and personal confirmation and cannot be started as ordinary hunts', t => {
  const apex = FANTASY_APEX_PROVOCATIONS[0], f = fixture(t, { a: player('Apex', 30, apex.location) });
  assert.ok(f.store.startCombat([f.plan('a', 'hunt', apex.enemy)]).error); assert.ok(f.store.startCombat([f.plan('a', 'apex', apex.id)]).error);
  assert.ok(f.store.startCombat([f.plan('a', 'apex', apex.id, true)]).error);
  assert.equal(f.store.inspectCombat('a', apex.id).error, undefined); assert.ok(f.store.startCombat([f.plan('a', 'apex', apex.id, false)]).error);
  const started = f.store.startCombat([f.plan('a', 'apex', apex.id, true)], () => .5); assert.equal(started.error, undefined); assert.equal(started.state!.source, `apex:${apex.id}`);
});

test('lawful opponents react to an explicit challenge, never just a criminal profession', t => {
  const f = fixture(t, { a: player('Thief', 20, 'hearth', 'thief') }); assert.equal(f.store.combat('a', 'same'), null);
  assert.ok(f.store.startCombat([f.plan('a', 'challenge', 'human-watch-patrol')]).error); assert.equal(f.store.profile('a').character!.notoriety ?? 0, 0);
  const result = f.store.startCombat([f.plan('a', 'challenge', 'human-watch-patrol', true)], () => .3); assert.equal(result.error, undefined);
  const c = f.store.profile('a').character!; assert.equal(c.notoriety, 4); assert.equal(c.reputation!.regions.hearth, -4);
});

test('choosing armed resistance in a watch encounter adds crime consequences without blaming the profession alone', t => {
  const p = player('Caught traveler', 20, 'hearth', 'thief'); p.event = 'encounter-watch';
  const f = fixture(t, { a: p });
  assert.equal(f.store.profile('a').character!.notoriety ?? 0, 0); assert.equal(f.store.profile('a').character!.reputation?.regions.hearth ?? 0, 0);
  assert.equal(f.store.combat('a', 'same'), null);
  const result = f.store.startCombat([f.plan('a', 'encounter', 'encounter-watch')], () => .3);
  assert.equal(result.error, undefined); assert.equal(result.state!.source, 'encounter:encounter-watch');
  assert.equal(result.state!.fighters.find(fighter => fighter.side === 'enemies')!.template, 'human-watch-patrol');
  const c = f.store.profile('a').character!; assert.equal(c.notoriety, 4); assert.equal(c.reputation!.regions.hearth, -4);
});

test('party combat requires every member to consent and never mixes an investigation ready slot', t => {
  const f = fixture(t), actors = new Map(['a', 'b'].map(id => [id, { id, name: id, session: 'same', world: 'fantasy', profile: f.store.profile(id) }]));
  const party = new FantasyParty({ lookup: id => { const actor = actors.get(id); return actor ? { ...actor, profile: f.store.profile(id) } as FantasyPartyActor : undefined; }, start: plans => f.store.startGroupInvestigation(plans), startCombat: plans => f.store.startCombat(plans), now: () => 100 });
  assert.equal(party.request('a', { type: 'create' }).error, undefined); party.request('a', { type: 'invite', target: 'b' }); const invitation = party.state('b').invitations[0]; party.request('b', { type: 'respond', invite: invitation.id, accept: true });
  assert.equal(party.request('a', { type: 'readyCombat', source: 'hunt', target: 'monster-forest-wolf' }).error, undefined);
  assert.equal(party.request('a', { type: 'startCombat' }).error, 'not-ready'); assert.equal(party.request('b', { type: 'startCombat' }).error, 'leader-only');
  assert.equal(party.request('b', { type: 'readyCombat', source: 'hunt', target: 'monster-forest-wolf' }).error, undefined); assert.equal(party.state('a').canStart, false); assert.equal(party.state('a').canStartCombat, true);
  assert.equal(party.request('a', { type: 'startCombat' }).error, undefined); assert.equal(f.store.profile('a').combatId, f.store.profile('b').combatId);
});

test('only learned combat abilities and prepared mage spells enter public snapshots; potion cures stay typed', t => {
  const merchant = player('Merchant', 5, 'hearth', 'merchant'); merchant.character!.jobXp.merchant = 600;
  const snapshot = fantasyCombatPlayer(merchant, 'm'); assert.ok(!snapshot.skills.some(skill => skill.id.startsWith('merchant-') && skill.kind === 'attack'));
  const mage = player('Mage', 8, 'hearth', 'mage'); mage.character!.specialization = { spells: [{ slot: 1, element: 'light', form: 'mend' }] };
  assert.ok(fantasyCombatPlayer(mage, 'g').skills.some(skill => skill.id === 'prepared-spell-1' && skill.kind === 'heal'));
  const cure = FANTASY_ITEMS.find(item => item.use?.cure?.includes('poison')); assert.ok(cure); mage.character!.inventory[cure.id] = 1;
  assert.deepEqual(fantasyCombatSupplies(new Map([['g', mage]]), ['g']).supplies!.g[cure.id].cleanse, cure.use!.cure!.filter(id => ['poison', 'burn', 'frost'].includes(id)));
  const noLight = player('No light', 8, 'greenwood'); noLight.character!.hour = 22; noLight.character!.inventory.lantern = 0;
  const dark = fantasyCombatPlayer(noLight, 'd'); noLight.character!.inventory.lantern = 1; assert.ok(dark.stats.accuracy < fantasyCombatPlayer(noLight, 'd').stats.accuracy);
  assert.ok(FANTASY_RACES.length > 0);
});

test('combat supplies exclude fresh or spoiled meals and ingredient foods while keeping instant medicines', () => {
  const p = player('Pantry');
  const foods = FANTASY_ITEMS.filter(item => !!foodMeta(item.id) || item.category === 'food' || !!item.food);
  assert.ok(foods.length > 0);
  for (const item of foods) p.character!.inventory[item.id] = 2;
  reconcileFoodLots(p.character!); for (const lot of p.character!.foodLots) lot.createdAt = 0;
  const supplies = fantasyCombatSupplies(new Map([['a', p]]), ['a']).supplies!.a;
  for (const item of foods) assert.equal(supplies[item.id], undefined, item.id);
  assert.equal(supplies.potion.count, 3); assert.equal(supplies.potion.hp, 35); assert.equal(supplies.potion.mp, 20);
});

test('ordinary fighting never levels a production trade, while effective alchemist medicine use remains relevant practice', t => {
  for (const job of ['cook', 'blacksmith', 'farmer']) {
    const f = fixture(t, { a: player('Trade traveler', 40, 'greenwood', job) }), before = f.store.profile('a').character!;
    victory(f.store, f.store.startCombat([f.plan('a')], () => .5).state!);
    const c = f.store.profile('a').character!; assert.equal(c.jobXp[job], before.jobXp[job]); assert.ok(c.xp > before.xp);
  }
  const p = player('Medicinal practice', 12, 'greenwood', 'alchemist'); p.character!.hp = 20;
  const f = fixture(t, { a: p }), state = f.store.startCombat([f.plan('a')], () => .5).state!, own = state.fighters.find(fighter => fighter.userId === 'a')!;
  const result = f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'item', item: 'potion', target: own.id }); assert.equal(result.error, undefined);
  assert.ok(f.store.profile('a').character!.jobXp.alchemist > 0); assert.equal(f.store.profile('a').character!.inventory.potion, 2);
});

test('effective prepared spells grow the existing mage proficiency and unlock its second and third slots', t => {
  for (const xp of [29, 99]) {
    const p = player('Prepared caster', 12, 'greenwood', 'mage'); p.character!.hp = 20; p.character!.jobXp.mage = xp;
    p.character!.specialization = { spells: [{ slot: 1, element: 'light', form: 'mend' }] };
    const f = fixture(t, { a: p }), beforeCapacity = fantasySpellCapacity(f.store.profile('a').character!), state = f.store.startCombat([f.plan('a')], () => .5).state!, own = state.fighters.find(fighter => fighter.userId === 'a')!;
    const result = f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'skill', skill: 'prepared-spell-1', target: own.id }); assert.equal(result.error, undefined);
    const c = f.store.profile('a').character!; assert.ok(c.jobXp.mage > xp); assert.equal(fantasySpellCapacity(c), beforeCapacity + 1);
    assert.ok((c.mana?.useXp ?? 0) > 0); assert.equal(c.skillXp?.['prepared-spell-1'], undefined);
  }
  const p = player('Unneeded spell', 12, 'greenwood', 'mage'); p.character!.jobXp.mage = 29; p.character!.specialization = { spells: [{ slot: 1, element: 'light', form: 'mend' }] };
  const f = fixture(t, { a: p }), state = f.store.startCombat([f.plan('a')], () => .5).state!, own = state.fighters.find(fighter => fighter.userId === 'a')!, before = f.store.profile('a');
  assert.equal(f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'skill', skill: 'prepared-spell-1', target: own.id }).error, 'unnecessary');
  assert.deepEqual(f.store.profile('a'), before);
});

test('legacy saves keep old investigation reservations and cancel only old automatic apex hunts', t => {
  let p = player('Legacy', 5, 'hearth'); p = applyFantasyAction(p, { type: 'accept', quest: 'main-night-01' }).profile; p.character!.location = 'oldwatch'; p.character!.visited.push('oldwatch');
  p.activity = { action: { type: 'investigate', quest: 'main-night-01', approach: 'observe' }, startedAt: 12, endsAt: 12.5, seed: 1 };
  const f = fixture(t, { a: p }); assert.equal(f.store.profile('a').character!.combatStoryVersion, undefined); assert.ok(f.store.profile('a').activity);
  f.time(12.5); f.store.tick(new Set(['a'])); assert.equal(f.store.profile('a').character!.combatStoryVersion, 1);
  const q = player('Old apex', 20, 'ashpeak'); q.activity = { action: { type: 'hunt', monster: 'monster-elder-dragon' }, startedAt: 12, endsAt: 15, seed: 1 };
  const old = fixture(t, { a: q }); assert.equal(old.store.profile('a').activity, undefined); assert.equal(old.store.profile('a').character!.gold, q.character!.gold);
});

test('successful victory retries publish no partial XP, money or materials after a failed final save', t => {
  const f = fixture(t, { a: player('Finisher', 40) }), state = f.store.startCombat([f.plan('a')], () => .5).state!, before = f.store.profile('a'), target = state.fighters.find(f => f.side === 'enemies')!.id;
  f.fail(true); const failed = f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'attack', target });
  assert.equal(failed.error, 'save-failed'); assert.deepEqual(f.store.profile('a'), before); assert.deepEqual(f.store.combat('a', 'same'), state);
  f.fail(false); const won = f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'attack', target });
  assert.equal(won.error, undefined); assert.equal(won.state!.status, 'victory'); const paid = f.store.profile('a');
  assert.ok(paid.character!.xp > before.character!.xp); assert.ok(paid.character!.combatVictories?.[state.source] !== undefined);
  assert.equal(f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'attack', target }).error, 'not-owner'); assert.deepEqual(f.store.profile('a'), paid);
});

test('real potion stock is consumed atomically and a failed round never consumes or duplicates it', t => {
  const a = player('Wounded'); a.character!.hp = 20; const f = fixture(t, { a, b: player('Support') });
  const state = f.store.startCombat([f.plan('a'), f.plan('b')], () => .5).state!, own = state.fighters.find(f => f.userId === 'a')!.id;
  const pending = f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'item', item: 'potion', target: own }); assert.equal(pending.error, undefined);
  const before = f.store.profile('a'); f.fail(true);
  assert.equal(f.store.combatOrder('b', 'same', state.id, state.revision, { type: 'guard' }).error, 'save-failed'); assert.deepEqual(f.store.profile('a'), before);
  f.fail(false); assert.equal(f.store.combatOrder('b', 'same', state.id, state.revision, { type: 'guard' }).error, undefined);
  assert.equal(f.store.profile('a').character!.inventory.potion, before.character!.inventory.potion - 1);
  assert.ok(f.store.profile('a').character!.hp > before.character!.hp);
});

test('late automatic guards cannot turn one early hit into a full fight reward', t => {
  const idle = player('Idle', 12, 'oldwatch'); idle.character!.inventory['oak-bow'] = 1; idle.character!.equipment = { ...idle.character!.equipment, weapon: 'oak-bow' };
  const f = fixture(t, { a: player('Active', 30, 'oldwatch'), b: idle });
  const initial = f.store.profile('b'); let state = f.store.startCombat([f.plan('a', 'hunt', 'monster-stone-golem'), f.plan('b', 'hunt', 'monster-stone-golem')], () => .5).state!;
  state = attackRound(f.store, state); let time = 12;
  for (let i = 0; state.status === 'active' && i < 30; i++) {
    const target = state.fighters.find(f => f.side === 'enemies' && f.hp > 0)!.id;
    const result = f.store.combatOrder('a', 'same', state.id, state.revision, approachOrAttack(state, 'a')); assert.equal(result.error, undefined);
    time = result.state!.deadline; f.time(time); f.store.tick(new Set(['a', 'b'])); state = f.store.combat('a', 'same')!;
  }
  assert.equal(state.status, 'victory'); assert.ok(state.round >= 3); assert.ok(state.fighters.find(f => f.userId === 'b')!.hp > 0);
  const b = f.store.profile('b').character!; assert.equal(b.xp, initial.character!.xp); assert.equal(b.combatVictories?.[state.source], undefined); assert.equal(b.gold, initial.character!.gold);
});

test('corrupted combat ownership blocks loading without overwriting either the battle or the profiles', t => {
  const f = fixture(t), state = f.store.startCombat([f.plan('a'), f.plan('b')], () => .5).state!, data = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  data.profiles.a.combatId = 'combat-not-owned'; const broken = JSON.stringify(data); fs.writeFileSync(f.file, broken);
  const restored = new FantasyStore(f.file, { combatEnabled: true, onError: () => {} }); assert.ok(restored.loadError); assert.equal(fs.readFileSync(f.file, 'utf8'), broken);
  assert.ok(state.id);
});

test('world deadlines auto-guard without growth, keep food time moving and block a reset of a living participant', t => {
  const f = fixture(t), state = f.store.startCombat([f.plan('a'), f.plan('b')], () => .5).state!, before = f.store.profile('a');
  assert.ok(f.store.testReset('a', before.revision).error); assert.deepEqual(f.store.profile('a'), before);
  f.time(13); f.store.tick(new Set(['a', 'b'])); const battle = f.store.combat('a', 'same')!, current = f.store.profile('a');
  assert.ok(battle.round > state.round); assert.equal(battle.fighters.find(fighter => fighter.userId === 'a')!.contribution.manualActions, 0);
  assert.equal(current.character!.xp, before.character!.xp); assert.equal(current.character!.jobXp.warrior, before.character!.jobXp.warrior);
  assert.equal(current.character!.hour, 13); assert.ok(current.character!.hunger > before.character!.hunger); assert.ok(current.character!.fatigue > before.character!.fatigue);
  const reload = new FantasyStore(f.file, { combatEnabled: true, worldHour: () => 13, onError: () => {} }); assert.equal(reload.loadError, undefined); assert.deepEqual(reload.combat('a', 'same'), battle);
});

test('direct companion orders preserve the owner action and atomically train real command use without extra loot slots', t => {
  const p = player('Commander', 12, 'greenwood', 'leader');
  p.character!.specialization = { companies: { troop: { members: [{ id: 'troop-scout', condition: 'ready', hp: 24, assigned: true, missions: 0 }] } } };
  const f = fixture(t, { a: p }), initial = f.store.startCombat([f.plan('a')], () => .5).state!, companion = initial.units![0];
  assert.equal(initial.units?.length, 1); assert.equal(initial.scaling.participantIds.length, 1);
  const waiting = f.store.combatOrder('a', 'same', initial.id, initial.revision, { type: 'guard' }); assert.equal(waiting.error, undefined);
  assert.equal(waiting.state!.round, 1); assert.deepEqual(waiting.state!.orders.a, { type: 'guard' });
  const prior = f.store.profile('a'), pending = waiting.state!, input: FantasyCombatOrder = { type: 'unit', unit: companion.id, order: { type: 'attack', target: initial.fighters.find(fighter => fighter.side === 'enemies')!.id } };
  f.fail(true); assert.equal(f.store.combatOrder('a', 'same', initial.id, initial.revision, input).error, 'save-failed');
  assert.deepEqual(f.store.profile('a'), prior); assert.deepEqual(f.store.combat('a', 'same'), pending);
  f.fail(false); const resolved = f.store.combatOrder('a', 'same', initial.id, initial.revision, input); assert.equal(resolved.error, undefined);
  assert.ok(resolved.state!.units![0].contribution.effectiveActions > 0); assert.equal(resolved.state!.fighters.find(fighter => fighter.userId === 'a')!.contribution.manualActions, 1);
  assert.ok(f.store.profile('a').character!.jobXp.leader > prior.character!.jobXp.leader); assert.ok((f.store.profile('a').character!.practice?.command ?? 0) > 0);
  const restored = new FantasyStore(f.file, { combatEnabled: true, worldHour: () => 12, onError: () => {} }); assert.equal(restored.loadError, undefined);
  assert.deepEqual(restored.combat('a', 'same'), resolved.state); assert.equal(resolved.state!.scaling.participantIds.length, 1);
});

test('delayed oath focus preserves its source across saves and grants real-use growth once after a successful atomic retry', t => {
  const witness = player('Witness', 12, 'hearth', 'priest'), c = witness.character!;
  c.jobXp.priest = 1000; c.completed = FANTASY_QUESTS.filter(quest => !quest.chapter && !quest.requiresCompleted?.length && fantasyQuestRecordEligible(c, quest) && fantasyPriestServiceQuest(quest.id)).slice(0, 6).map(quest => quest.id);
  c.readBooks = FANTASY_READABLE_LIBRARY_BOOKS.map(book => book.id); c.visited.push('suncourt'); syncFantasyPriestGrowth(c);
  assert.equal(applyFantasyPriestAction(c, { type: 'priestBranch', branch: 'oath' })!.error, undefined);
  const f = fixture(t, { a: witness, b: player('Ally', 12, 'hearth') });
  let state = f.store.startCombat([f.plan('a', 'challenge', 'human-watch-patrol', true), f.plan('b', 'challenge', 'human-watch-patrol', true)], () => .5).state!;
  const ally = state.fighters.find(fighter => fighter.userId === 'b')!, clarity = state.fighters.find(fighter => fighter.userId === 'a')!.skills.find(skill => skill.id === 'priest-oath-clarity')!;
  assert.equal(clarity.kind, 'focus');
  state = f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'skill', skill: clarity.id, target: ally.id }).state!;
  state = f.store.combatOrder('b', 'same', state.id, state.revision, { type: 'guard' }).state!;
  assert.ok(state.fighters.find(fighter => fighter.userId === 'b')!.aim); const prepared = f.store.profile('a');
  assert.equal(prepared.character!.skillXp?.[clarity.id] ?? 0, 0);
  const restored = new FantasyStore(f.file, { combatEnabled: true, worldHour: () => 12, onError: () => {} }); assert.equal(restored.loadError, undefined); assert.deepEqual(restored.combat('a', 'same'), state);
  state = f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'guard' }).state!;
  const pending = state, before = f.store.profile('a'), attack = approachOrAttack(state, 'b'); assert.equal(attack.type, 'attack');
  f.fail(true); assert.equal(f.store.combatOrder('b', 'same', state.id, state.revision, attack).error, 'save-failed');
  assert.deepEqual(f.store.profile('a'), before); assert.deepEqual(f.store.combat('a', 'same'), pending);
  f.fail(false); const used = f.store.combatOrder('b', 'same', state.id, state.revision, attack); assert.equal(used.error, undefined);
  const after = f.store.profile('a'); assert.equal(after.character!.mp, prepared.character!.mp);
  assert.ok((after.character!.skillXp?.[clarity.id] ?? 0) > 0); assert.ok((after.character!.mana?.useXp ?? 0) > (before.character!.mana?.useXp ?? 0));
  assert.equal(f.store.combatOrder('b', 'same', state.id, pending.revision, attack).error, 'stale'); assert.deepEqual(f.store.profile('a'), after);
});

test('an unused body guard or skipped body attack cannot double companion command proficiency', t => {
  for (const body of ['guard', 'attack'] as const) {
    let p = player('Fast command', 1, 'hearth', 'leader'); p.character!.jobXp.leader = 600; p = applyFantasyAction(p, { type: 'accept', quest: 'main-night-01' }).profile;
    // 冷気を受けた低敏捷の指揮官より斥候が先に動く。
    p.character!.race = 'elder-dragon'; p.character!.gender = 'female';
    p.character!.location = 'oldwatch'; p.character!.visited.push('oldwatch');
    p.character!.inventory['steel-sword'] = 1;
    const weapon = createFantasyGear(p.character!, 'steel-sword', () => .999, 'starsteel-ingot', 'ruby')!; assert.equal(fantasyEquipGear(p.character!, 'steel-sword', weapon.id), undefined);
    addFantasyStatus(p.character!, 'frost');
    p.character!.specialization = { companies: { troop: { members: [{ id: 'troop-scout', condition: 'ready', hp: 24, assigned: true, missions: 0 }] } } };
    const f = fixture(t, { a: p }), state = f.store.startCombat([f.plan('a', 'story', 'main-night-01')], () => .5).state!, own = state.fighters.find(fighter => fighter.userId === 'a')!, unit = state.units![0], enemy = state.fighters.find(fighter => fighter.side === 'enemies')!;
    const before = f.store.profile('a').character!.jobXp.leader;
    const action: FantasyCombatOrder = body === 'attack' ? { type: 'attack', target: enemy.id } : { type: 'guard' };
    const pending = f.store.combatOrder('a', 'same', state.id, state.revision, action); assert.equal(pending.error, undefined);
    const won = f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'unit', unit: unit.id, order: { type: 'attack', target: enemy.id } });
    assert.equal(won.error, undefined); assert.equal(won.state!.status, 'victory');
    assert.equal(won.state!.units![0].contribution.effectiveActions, 1, `${body}: ${JSON.stringify(won.state!.logs)}`);
    assert.equal(won.state!.fighters.find(fighter => fighter.id === own.id)!.contribution.effectiveActions, 1, body);
    assert.equal(f.store.profile('a').character!.jobXp.leader - before, 3, body); assert.equal(f.store.profile('a').character!.practice?.command, 1);
  }
});

test('real combat WebSockets enforce party consent, session ownership, turn slots, private profiles and busy NPC dialogue', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-combat-ws-')), profiles = { alice: player('Secret-alice', 12, 'hearth'), bob: player('Secret-bob', 12, 'hearth'), carol: player('Secret-carol', 12, 'hearth') };
  fs.writeFileSync(path.join(directory, 'fantasy.json'), JSON.stringify(profiles)); fs.writeFileSync(path.join(directory, 'fantasy-clock.json'), JSON.stringify({ version: 1, hour: 12, wallTime: Date.now() + 3600000 }));
  const sessions = path.join(directory, 'sessions.json'); fs.writeFileSync(sessions, JSON.stringify({ name: 'Combat integration', sessions: [{ id: 'one', name: 'One', world: 'fantasy' }, { id: 'two', name: 'Two', world: 'fantasy' }] }));
  const listener = net.createServer(); await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve)); const port = (listener.address() as net.AddressInfo).port; await new Promise<void>(resolve => listener.close(() => resolve()));
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts', '--dev'], { env: { ...process.env, NODE_ENV:'test',FANTASY_ACCOUNT_TEST_BYPASS:'1',SERVER_PORT: String(port), DATA_DIR: directory, SESSIONS_FILE: sessions, LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '', NPC_LLM_URL: 'http://127.0.0.1:1/v1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', chunk => { output += String(chunk); }); child.stderr.on('data', chunk => { output += String(chunk); }); const sockets: WebSocket[] = [];
  t.after(async () => { for (const socket of sockets) socket.terminate(); child.kill(); if (child.exitCode === null && !child.signalCode) await new Promise<void>(resolve => { const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000); child.once('exit', () => { clearTimeout(timer); resolve(); }); }); assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith('fantasy-combat-ws-')); fs.rmSync(directory, { recursive: true, force: true }); });
  async function until<T>(read: () => T | undefined | null | false): Promise<T> { const deadline = Date.now() + 15000; while (Date.now() < deadline) { const value = read(); if (value) return value; if (child.exitCode !== null) throw new Error(output); await new Promise(resolve => setTimeout(resolve, 20)); } throw new Error(`Combat WS timeout: ${output}`); }
  async function client(id: keyof typeof profiles, session: string) {
    let ws: WebSocket | undefined; const deadline = Date.now() + 30000;
    while (!ws && Date.now() < deadline) { const attempt = new WebSocket(`ws://127.0.0.1:${port}/ws`); const opened = await new Promise<boolean>(resolve => { attempt.once('open', () => resolve(true)); attempt.once('error', () => resolve(false)); }); if (opened) ws = attempt; else { attempt.terminate(); if (child.exitCode !== null) throw new Error(output); await new Promise(resolve => setTimeout(resolve, 30)); } }
    if (!ws) throw new Error(output); sockets.push(ws); const messages: Record<string, any>[] = []; ws.on('message', data => messages.push(JSON.parse(String(data)))); const send = (message: object) => ws!.send(JSON.stringify(message));
    send({ t: 'hello', compat: COMPAT_VERSION, id, name: id }); await until(() => messages.find(message => message.t === 'fantasyPartyState')); const joinedAt = messages.length;
    send({ t: 'join', sid: session }); send({ t: 'fantasyPartyRequest', command: { type: 'sync' } }); await until(() => messages.slice(joinedAt).find(message => message.t === 'fantasyPartyState' && !message.error));
    return { ws, messages, send };
  }
  const a = await client('alice', 'one'), b = await client('bob', 'one'), c = await client('carol', 'two');
  a.send({ t: 'fantasyPartyRequest', command: { type: 'create' } }); await until(() => a.messages.find(message => message.t === 'fantasyPartyState' && message.state?.id));
  a.send({ t: 'fantasyPartyRequest', command: { type: 'invite', target: 'bob' } }); const invite = await until(() => b.messages.find(message => message.t === 'fantasyPartyState' && message.state?.invitations?.length)?.state.invitations[0]);
  b.send({ t: 'fantasyPartyRequest', command: { type: 'respond', invite: invite.id, accept: true } }); await until(() => a.messages.find(message => message.t === 'fantasyPartyState' && message.state?.members?.length === 2));
  a.send({ t: 'fantasyPartyRequest', command: { type: 'readyCombat', source: 'challenge', target: 'human-watch-patrol', confirm: true } }); b.send({ t: 'fantasyPartyRequest', command: { type: 'readyCombat', source: 'challenge', target: 'human-watch-patrol', confirm: true } });
  await until(() => a.messages.find(message => message.t === 'fantasyPartyState' && message.state?.canStartCombat)); a.send({ t: 'fantasyPartyRequest', command: { type: 'startCombat' } });
  const battle = await until(() => a.messages.find(message => message.t === 'fantasyCombatState' && message.state?.status === 'active')?.state as FantasyCombatState | undefined); await until(() => b.messages.find(message => message.t === 'fantasyCombatState' && message.state?.id === battle.id));
  assert.ok(!c.messages.some(message => message.t === 'fantasyCombatState' && message.state?.id === battle.id));
  c.send({ t: 'fantasyCombatRequest', command: { type: 'order', combatId: battle.id, revision: battle.revision, order: { type: 'guard' } } }); await until(() => c.messages.find(message => message.t === 'fantasyCombatState' && message.error === 'not-owner'));
  a.send({ t: 'npcChat', requestId: 'busy_combat', npcId: 'rin', locale: 'en', text: 'hello' }); await until(() => a.messages.find(message => message.t === 'npcReply' && message.requestId === 'busy_combat' && message.error === 'busy'));
  const enemy = battle.fighters.find(fighter => fighter.side === 'enemies')!, approach = approachOrAttack(battle, 'bob'); assert.equal(approach.type, 'moveTo');
  a.send({ t: 'fantasyCombatRequest', command: { type: 'order', combatId: battle.id, revision: battle.revision, order: { type: 'guard' } } }); b.send({ t: 'fantasyCombatRequest', command: { type: 'order', combatId: battle.id, revision: battle.revision, order: approach } });
  const moved = await until(() => a.messages.find(message => message.t === 'fantasyCombatState' && message.state?.revision > battle.revision)?.state as FantasyCombatState | undefined);
  assert.notDeepEqual(moved.fighters.find(fighter => fighter.userId === 'bob')!.tile, battle.fighters.find(fighter => fighter.userId === 'bob')!.tile);
  assert.equal(fantasyCombatOrderError(moved, 'bob', { type: 'attack', target: enemy.id }), undefined);
  a.send({ t: 'fantasyCombatRequest', command: { type: 'order', combatId: battle.id, revision: moved.revision, order: { type: 'guard' } } }); b.send({ t: 'fantasyCombatRequest', command: { type: 'order', combatId: battle.id, revision: moved.revision, order: { type: 'attack', target: enemy.id } } });
  const attacked = await until(() => a.messages.find(message => message.t === 'fantasyCombatState' && message.state?.revision > moved.revision)?.state as FantasyCombatState | undefined);
  assert.equal(attacked.fighters.find(fighter => fighter.userId === 'bob')!.contribution.manualActions, 2);
  for (const [client, id] of [[a, 'alice'], [b, 'bob'], [c, 'carol']] as const) {
    for (const message of client.messages.filter(message => message.t === 'fantasyProfile')) assert.equal(message.profile?.character?.name, `Secret-${id}`);
    for (const message of client.messages.filter(message => message.t === 'fantasyCombatState' && message.state)) for (const privateKey of ['inventory', 'quests', 'completed', 'voyageDecisions', 'apexWarnings']) assert.ok(!JSON.stringify(message.state).includes(`"${privateKey}"`));
  }
});
