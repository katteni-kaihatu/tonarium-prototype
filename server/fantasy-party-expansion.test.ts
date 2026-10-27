import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore, type FantasyCombatPlan, type FantasyGroupTravelPlan } from './fantasy-store.ts';
import { FantasyParty, type FantasyPartyActor } from './fantasy-party.ts';
import { applyFantasyAction, fantasyStats, fantasyTransports, newFantasyProfile } from '../shared/fantasy-engine.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
import { FANTASY_PARTY_TTL_MS, isFantasyPartyCommand } from '../shared/fantasy-party.ts';
import { createFantasyGear } from '../shared/fantasy-equipment.ts';

function player(id: string, location = 'hearth') {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: `Private ${id}`, gender: 'female' }, () => .5).profile, c = p.character!;
  p.generation = 1; c.job = 'warrior'; c.jobXp.warrior = 0; c.level = 10; c.gold = 1000; c.hour = 108;
  c.location = location; c.visited = [...new Set(['hearth', 'greenwood', 'sunmeadow', location])]; c.inventory.herb = 8; c.inventory.lantern = 1;
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp; return p;
}
function fixture(t: TestContext, size = 3, configure?: (profile: FantasyProfile, i: number) => void) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-party-expansion-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith('fantasy-party-expansion-')); fs.rmSync(directory, { recursive: true, force: true }); });
  const file = path.join(directory, 'fantasy.json'); const data = Object.fromEntries(Array.from({ length: size }, (_, i) => { const p = player(`p${i}`); configure?.(p, i); return [`p${i}`, p]; }));
  fs.writeFileSync(file, JSON.stringify(data)); let hour = 108, wall = 1000, fail = false, writes = 0;
  const store = new FantasyStore(file, { combatEnabled: true, worldHour: () => hour, now: () => wall, onError: () => {}, save: (target, text) => { if (fail) throw new Error('Test disk full'); writes++; fs.writeFileSync(target, text); } });
  assert.equal(store.loadError, undefined);
  const actors = new Map<string, { session: string | null; override?: FantasyProfile }>(Object.keys(data).map(id => [id, { session: 'same' }]));
  const lookup = (id: string): FantasyPartyActor | undefined => { const a = actors.get(id); return a ? { id, name: `Public ${id}`, session: a.session, world: 'fantasy', profile: a.override ?? store.profile(id) } : undefined; };
  const party = new FantasyParty({ lookup, now: () => wall, start: plans => store.startGroupInvestigation(plans), startTravel: plans => store.startGroupTravel(plans), startCombat: plans => store.startCombat(plans, () => .6),
    joinCombat: (user, session, combat, confirm) => store.joinCombat(user, session, combat, confirm), battle: (user, session) => { const battle = store.combat(user, session); return battle?.status === 'active' ? { id: battle.id, source: battle.source } : null; },
    vault: id => store.partyVault(id), vaultRequest: (context, user, command) => store.partyVaultRequest(context, user, command), returnDeposits: (id, user) => store.returnPartyDeposits(id, user) });
  const request = (id: string, command: unknown) => { wall += 1001; return party.request(id, command); };
  const create = (id = 'p0') => assert.equal(request(id, { type: 'create' }).error, undefined);
  const join = (id: string, leader = 'p0') => { assert.equal(request(leader, { type: 'invite', target: id }).error, undefined); const invite = party.state(id).invitations[0]; assert.ok(invite); assert.equal(request(id, { type: 'respond', invite: invite.id, accept: true }).error, undefined); };
  const travelPlan = (id: string, transport = 'carriage'): FantasyGroupTravelPlan => ({ user: id, generation: 1, location: store.profile(id).character!.location, destination: 'greenwood', transport });
  const combatPlan = (id: string, target = 'monster-forest-wolf'): FantasyCombatPlan => ({ user: id, generation: 1, session: 'same', location: store.profile(id).character!.location, source: 'hunt', target });
  return { store, party, request, create, join, actors, file, travelPlan, combatPlan, fail: (v: boolean) => { fail = v; }, setHour: (v: number) => { hour = v; }, setWall: (v: number) => { wall = v; }, writes: () => writes };
}

test('expanded party commands are strict and never allow forged leaders, recipients or private profile patches', () => {
  for (const command of [{ type: 'readyTravel', destination: 'greenwood', transport: 'carriage' }, { type: 'startTravel' }, { type: 'chat', text: 'Hello' }, { type: 'joinCombat', combatId: 'battle-1', confirm: true }, { type: 'deposit', revision: 0, item: 'herb', count: 1 }, { type: 'requestWithdraw', revision: 1, lot: 'lot-1', count: 1 }, { type: 'approveWithdraw', revision: 2, request: 'request-1', approve: true }]) assert.equal(isFantasyPartyCommand(command), true);
  for (const command of [{ type: 'chat', text: 'hi', user: 'other' }, { type: 'chat', text: '\n' }, { type: 'readyTravel', destination: 'greenwood', transport: 'carriage', members: ['other'] }, { type: 'approveWithdraw', revision: 2, request: 'x', approve: true, leader: true }, { type: 'deposit', revision: 0, item: 'herb', count: 0 }, { type: 'joinCombat', combatId: 'x', confirm: 'true' }]) assert.equal(isFantasyPartyCommand(command), false);
});

test('shared vault changes and failed saves are atomic; retries neither lose nor duplicate deposits', t => {
  const f = fixture(t); f.create(); f.join('p1'); const id = f.party.state('p0').id!, before = f.store.profile('p1'), bytes = fs.readFileSync(f.file, 'utf8');
  f.fail(true); assert.equal(f.request('p1', { type: 'deposit', revision: 0, item: 'herb', count: 3 }).error, 'save-failed');
  assert.deepEqual(f.store.profile('p1'), before); assert.equal(f.store.partyVault(id).lots.length, 0); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  f.fail(false); assert.equal(f.request('p1', { type: 'deposit', revision: 0, item: 'herb', count: 3 }).error, undefined);
  assert.equal(f.store.profile('p1').character!.inventory.herb, 5); assert.equal(f.store.partyVault(id).lots[0].count, 3);
  assert.equal(f.request('p1', { type: 'deposit', revision: 0, item: 'herb', count: 3 }).error, 'stale');
});

test('only a leader can approve, and failed approval preserves both profiles and the outstanding request', t => {
  const f = fixture(t); f.create(); f.join('p1'); const id = f.party.state('p0').id!;
  f.request('p0', { type: 'deposit', revision: 0, item: 'herb', count: 3 }); const lot = f.store.partyVault(id).lots[0];
  f.request('p1', { type: 'requestWithdraw', revision: 1, lot: lot.id, count: 2 }); const request = f.store.partyVault(id).requests[0];
  assert.equal(f.request('p1', { type: 'approveWithdraw', revision: 2, request: request.id, approve: true }).error, 'leader-only');
  const before = ['p0', 'p1'].map(user => f.store.profile(user)), bytes = fs.readFileSync(f.file, 'utf8'); f.fail(true);
  assert.equal(f.request('p0', { type: 'approveWithdraw', revision: 2, request: request.id, approve: true }).error, 'save-failed');
  assert.deepEqual(['p0', 'p1'].map(user => f.store.profile(user)), before); assert.equal(f.store.partyVault(id).requests.length, 1); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  f.fail(false); assert.equal(f.request('p0', { type: 'approveWithdraw', revision: 2, request: request.id, approve: true }).error, undefined);
  assert.equal(f.store.profile('p1').character!.inventory.herb, 10); assert.equal(f.store.partyVault(id).lots[0].count, 1);
  assert.equal(f.request('p0', { type: 'approveWithdraw', revision: 3, request: request.id, approve: true }).error, 'invalid');
});

test('leaving is delayed on failed deposit return and succeeds once without losing remaining shared items', t => {
  const f = fixture(t); f.create(); f.join('p1'); f.request('p1', { type: 'deposit', revision: 0, item: 'herb', count: 3 });
  f.fail(true); assert.equal(f.request('p1', { type: 'leave' }).error, 'save-failed'); assert.equal(f.party.state('p0').members.length, 2); assert.equal(f.store.profile('p1').character!.inventory.herb, 5);
  f.fail(false); assert.equal(f.request('p1', { type: 'leave' }).error, undefined); assert.equal(f.party.state('p1').id, null); assert.equal(f.store.profile('p1').character!.inventory.herb, 8);
});

test('restart returns unclaimed deposits once with food age and crafted gear attributes intact', t => {
  const f = fixture(t, 2, (p, i) => { if (i) return; const c = p.character!; c.inventory.meal = 2; c.foodLots = c.foodLots.filter(food => food.item !== 'meal'); c.foodLots.push({ id: 'aged-meals', item: 'meal', count: 2, createdAt: 80 }); c.inventory['steel-sword'] = 1; createFantasyGear(c, 'steel-sword', () => .7, 'orichalcum-ingot', 'ruby'); });
  f.create(); f.join('p1'); const original = f.store.profile('p0'), gear = original.character!.gear!.find(item => item.item === 'steel-sword')!;
  assert.equal(f.request('p0', { type: 'deposit', revision: 0, item: 'meal', count: 2 }).error, undefined);
  assert.equal(f.request('p0', { type: 'deposit', revision: 1, item: 'steel-sword', count: 1, instance: gear.id }).error, undefined);
  const restored = new FantasyStore(f.file, { combatEnabled: true, worldHour: () => 108, onError: () => {} }); assert.equal(restored.loadError, undefined);
  const c = restored.profile('p0').character!; assert.equal(c.inventory.meal, 2); assert.equal(c.inventory['steel-sword'], 1); assert.equal(c.foodLots.find(food => food.item === 'meal')!.createdAt, 80);
  assert.deepEqual({ ...c.gear!.find(item => item.item === 'steel-sword'), id: gear.id }, gear);
  const again = new FantasyStore(f.file, { combatEnabled: true, worldHour: () => 108, onError: () => {} }); assert.deepEqual(again.profile('p0'), restored.profile('p0'));
});

test('shared food reaches a lagging recipient after world-time synchronization without refreshing its original age', t => {
  const f = fixture(t, 2, (p, i) => { if (i) p.character!.hour = 100; else { const c = p.character!; c.inventory.meal = 1; c.foodLots = c.foodLots.filter(food => food.item !== 'meal'); c.foodLots.push({ id: 'recent-meal', item: 'meal', count: 1, createdAt: 105 }); } });
  f.create(); f.join('p1'); const id = f.party.state('p0').id!;
  assert.equal(f.request('p0', { type: 'deposit', revision: 0, item: 'meal', count: 1 }).error, undefined);
  assert.equal(f.store.profile('p1').character!.hour, 108);
  const lot = f.store.partyVault(id).lots[0]; assert.equal(f.request('p1', { type: 'requestWithdraw', revision: 1, lot: lot.id, count: 1 }).error, undefined);
  const request = f.store.partyVault(id).requests[0]; assert.equal(f.request('p0', { type: 'approveWithdraw', revision: 2, request: request.id, approve: true }).error, undefined);
  assert.equal(f.store.profile('p1').character!.foodLots.find(food => food.id.startsWith('food-shared-'))!.createdAt, 105);
});

test('group travel requires each member’s own destination and transport consent before the leader starts', t => {
  const f = fixture(t); f.create(); f.join('p1');
  assert.equal(f.request('p0', { type: 'readyTravel', destination: 'greenwood', transport: 'carriage', user: 'p1' }).error, 'invalid');
  assert.equal(f.request('p0', { type: 'readyTravel', destination: 'greenwood', transport: 'carriage' }).error, undefined);
  assert.equal(f.request('p0', { type: 'startTravel' }).error, 'not-ready');
  assert.equal(f.request('p1', { type: 'readyTravel', destination: 'greenwood', transport: 'foot' }).error, undefined);
  assert.equal(f.request('p0', { type: 'startTravel' }).error, 'incompatible');
  assert.equal(f.request('p1', { type: 'readyTravel', destination: 'greenwood', transport: 'carriage' }).error, undefined);
  assert.equal(f.request('p1', { type: 'startTravel' }).error, 'leader-only'); assert.equal(f.party.state('p0').canStartTravel, true);
  assert.equal(f.request('p0', { type: 'startTravel' }).error, undefined); assert.equal(f.store.profile('p2').activity, undefined);
});

test('shared departure waits for the slowest consenting traveler while keeping personal costs and progress', t => {
  const f = fixture(t, 2, (p, i) => { if (!i) p.character!.buff = { effect: 'travel', power: 1 }; });
  const a = f.store.profile('p0'), b = f.store.profile('p1'); const routes = [a, b].map(p => fantasyTransports(p.character!, 'greenwood').find(route => route.id === 'carriage')!); assert.ok(routes.every(Boolean)); assert.notEqual(routes[0].hours, routes[1].hours);
  const result = f.store.startGroupTravel([f.travelPlan('p0'), f.travelPlan('p1')]); assert.equal(result.error, undefined);
  const arrival = 108 + Math.max(...routes.map(route => route.hours));
  for (const update of result.updates) { assert.equal(update.profile.activity!.endsAt, arrival); assert.equal(update.profile.character!.location, 'hearth'); assert.equal(update.profile.character!.gold, 1000); }
  f.setHour(arrival); f.store.tick(new Set(['p0', 'p1']));
  for (const [i, user] of ['p0', 'p1'].entries()) { const p = f.store.profile(user); assert.equal(p.activity, undefined); assert.equal(p.character!.location, 'greenwood'); assert.equal(p.character!.gold, 1000 - routes[i].cost); assert.deepEqual(p.character!.completed, [a, b][i].character!.completed); }
});

test('a failed group-travel write starts nobody and retry preserves the common arrival', t => {
  const f = fixture(t, 2), before = ['p0', 'p1'].map(user => f.store.profile(user)), bytes = fs.readFileSync(f.file, 'utf8'); f.fail(true);
  assert.equal(f.store.startGroupTravel([f.travelPlan('p0'), f.travelPlan('p1')]).error, 'save-failed'); assert.deepEqual(['p0', 'p1'].map(user => f.store.profile(user)), before); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  f.fail(false); const result = f.store.startGroupTravel([f.travelPlan('p0'), f.travelPlan('p1')]); assert.equal(result.error, undefined); assert.equal(result.updates[0].profile.activity!.endsAt, result.updates[1].profile.activity!.endsAt);
});

test('expired consent or changed personal route cost invalidates travel readiness without spending money', t => {
  const f = fixture(t, 2); f.create(); f.join('p1'); for (const user of ['p0', 'p1']) assert.equal(f.request(user, { type: 'readyTravel', destination: 'greenwood', transport: 'carriage' }).error, undefined);
  f.setWall(FANTASY_PARTY_TTL_MS + 100_000); assert.equal(f.party.state('p0').canStartTravel, false);
  for (const user of ['p0', 'p1']) f.request(user, { type: 'readyTravel', destination: 'greenwood', transport: 'carriage' });
  const changed = f.store.profile('p1'); changed.character!.gold = 0; f.actors.get('p1')!.override = changed;
  assert.equal(f.party.state('p0').canStartTravel, false); assert.equal(f.store.profile('p1').character!.gold, 1000); assert.equal(f.store.profile('p1').activity, undefined);
});

test('party chat is trimmed, isolated from outsiders and removed from a player who changes session', t => {
  const f = fixture(t, 4); f.create(); f.join('p1'); f.create('p2'); f.join('p3', 'p2');
  assert.equal(f.request('p1', { type: 'chat', text: '  Meet by the gate  ' }).error, undefined);
  assert.equal(f.party.state('p0').chat![0].text, 'Meet by the gate'); assert.equal(f.party.state('p1').chat![0].from, 'p1'); assert.equal(f.party.state('p2').chat, undefined);
  f.actors.get('p1')!.session = 'other'; assert.equal(f.party.state('p1').id, null); assert.equal(f.party.state('p1').chat, undefined);
  assert.equal(f.party.state('p0').members.some(member => member.id === 'p1'), false);
});

test('joining an ongoing party fight requires the joining player’s request, same session and location', t => {
  const f = fixture(t, 3, p => { p.character!.location = 'greenwood'; }); f.create(); f.join('p1');
  const battle = f.store.startCombat([f.combatPlan('p0')], () => .6).state!; assert.ok(battle); assert.equal(f.store.profile('p1').combatId, undefined);
  assert.equal(f.request('p2', { type: 'joinCombat', combatId: battle.id }).error, 'no-party');
  assert.equal(f.store.joinCombat('p1', 'other', battle.id).error, 'not-active'); assert.equal(f.store.profile('p1').combatId, undefined);
  assert.equal(f.request('p1', { type: 'joinCombat', combatId: battle.id }).error, undefined); const joined = f.store.combat('p0', 'same')!;
  assert.equal(joined.fighters.filter(fighter => fighter.side === 'players').length, 2); assert.equal(f.store.profile('p1').combatId, battle.id); assert.equal(joined.revision, battle.revision + 1);
  assert.ok(f.request('p1', { type: 'joinCombat', combatId: battle.id }).error);
});

test('mid-battle join never exceeds six players and save failure does not attach a seventh or partial new fighter', t => {
  const f = fixture(t, 7, p => { p.character!.location = 'greenwood'; });
  const battle = f.store.startCombat(['p0', 'p1', 'p2', 'p3', 'p4'].map(user => f.combatPlan(user)), () => .6).state!;
  f.fail(true); assert.equal(f.store.joinCombat('p5', 'same', battle.id).error, 'save-failed'); assert.equal(f.store.profile('p5').combatId, undefined); assert.equal(f.store.combat('p0', 'same')!.fighters.filter(fighter => fighter.side === 'players').length, 5);
  f.fail(false); assert.equal(f.store.joinCombat('p5', 'same', battle.id).error, undefined); assert.equal(f.store.joinCombat('p6', 'same', battle.id).error, 'capacity'); assert.equal(f.store.profile('p6').combatId, undefined);
});

test('apex reinforcements need their own local warning and explicit confirmation', t => {
  const f = fixture(t, 2, p => { p.character!.location = 'ashpeak'; p.character!.visited.push('ashpeak'); }); f.create(); f.join('p1');
  assert.equal(f.store.inspectCombat('p0', 'apex-elder-dragon').error, undefined);
  const battle = f.store.startCombat([{ ...f.combatPlan('p0'), source: 'apex', target: 'apex-elder-dragon', confirm: true }], () => .6).state!; assert.ok(battle);
  assert.equal(f.party.state('p1').battle!.needsConfirmation, true);
  assert.ok(f.request('p1', { type: 'joinCombat', combatId: battle.id }).error); assert.ok(f.request('p1', { type: 'joinCombat', combatId: battle.id, confirm: true }).error);
  assert.equal(f.store.profile('p1').combatId, undefined); assert.equal(f.store.inspectCombat('p1', 'apex-elder-dragon').error, undefined);
  assert.ok(f.request('p1', { type: 'joinCombat', combatId: battle.id }).error);
  assert.equal(f.request('p1', { type: 'joinCombat', combatId: battle.id, confirm: true }).error, undefined); assert.equal(f.store.profile('p1').combatId, battle.id);
});

test('a consenting reinforcement refreshes the round and clears old orders without spending pending items', t => {
  const f = fixture(t, 3, p => { p.character!.location = 'greenwood'; }); f.create(); f.join('p1'); f.join('p2');
  const battle = f.store.startCombat([f.combatPlan('p0'), f.combatPlan('p1')], () => .6).state!, before = f.store.profile('p0').character!.inventory;
  assert.equal(f.store.combatOrder('p0', 'same', battle.id, battle.revision, { type: 'guard' }).error, undefined);
  assert.ok(f.store.combat('p0', 'same')!.orders.p0); const enemy = battle.fighters.find(fighter => fighter.side === 'enemies')!;
  assert.equal(f.request('p2', { type: 'joinCombat', combatId: battle.id }).error, undefined);
  const joined = f.store.combat('p0', 'same')!; assert.deepEqual(joined.orders, {}); assert.equal(joined.revision, battle.revision + 1);
  assert.deepEqual(f.store.profile('p0').character!.inventory, before); assert.ok(joined.fighters.find(fighter => fighter.id === enemy.id)!.stats.hp >= enemy.stats.hp);
  assert.equal(f.store.combatOrder('p0', 'same', battle.id, battle.revision, { type: 'guard' }).error, 'stale');
});
