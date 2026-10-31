import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { FantasyParty, type FantasyPartyActor } from './fantasy-party.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import type { FantasyPartyError } from '../shared/fantasy-party.ts';
import { fantasyEscortTerms } from '../shared/fantasy-escort.ts';
import { fantasyAmbushHit } from '../shared/fantasy-ambush.ts';
import { fantasyMapMerchantHit, FANTASY_MAP_MERCHANT_EVENT } from '../shared/fantasy-map-merchant.ts';
import { validFantasyCombatState, fantasyCombatOrderError } from '../shared/fantasy-combat.ts';

function fixture(t: TestContext, investigation = false, settings: { combat?: boolean; ambush?: boolean; escort?: boolean } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-cohort-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  const profiles = Object.fromEntries(['a', 'b'].map((user, i) => {
    let p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: user, gender: 'female' }, () => .5).profile;
    if (investigation) p = applyFantasyAction(p, { type: 'accept', quest: 'main-night-01' }, () => .5).profile;
    const c = p.character!; c.location = investigation ? 'oldwatch' : 'hearth'; c.visited.push('oldwatch', 'greenwood', 'sunmeadow'); c.inventory.lantern = 1; c.gold = 1000;
    if (settings.escort) { c.job = 'warrior'; c.jobXp.warrior = 0; c.level = 6; if (!i) { const terms = fantasyEscortTerms('hearth', 'sunmeadow')!; c.escort = { id: 'escort-hearth-sunmeadow-32', from: 'hearth', destination: 'sunmeadow', acceptedAt: 8, hours: terms.hours, reward: terms.reward, defense: 'cleared' }; } }
    if (investigation) { c.combatStoryVersion = undefined; if (!i) c.buff = { effect: 'check', power: 40 }; else { c.race = 'orc'; c.hunger = 90; c.fatigue = 90; } }
    c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp; return [user, p];
  }));
  fs.writeFileSync(file, JSON.stringify(profiles)); let hour = 8, wall = 1000, fail = false;
  const store = new FantasyStore(file, { combatEnabled: settings.combat, ambush: settings.ambush, worldHour: () => hour, now: () => wall, onError: () => {}, save: (target, bytes) => { if (fail) throw Error('disk'); fs.writeFileSync(target, bytes); } });
  assert.equal(store.loadError, undefined);
  const lookup = (user: string): FantasyPartyActor => ({ id: user, name: user, world: 'fantasy', session: 'same', profile: store.profile(user) });
  const options = { lookup, now: () => wall, start: (plans: Parameters<FantasyStore['startGroupInvestigation']>[0]) => store.startGroupInvestigation(plans, () => .37),
    startTravel: (plans: Parameters<FantasyStore['startGroupTravel']>[0], context?: Parameters<FantasyStore['startGroupTravel']>[1]) => store.startGroupTravel(plans, context, () => 2 / 4294967296),
    startRedirect: (plans: Parameters<FantasyStore['startGroupTravel']>[0], context?: Parameters<FantasyStore['startGroupTravel']>[1]) => store.startGroupRedirect(plans, context),
    startCombat: (plans: Parameters<FantasyStore['startCombat']>[0], context?: Parameters<FantasyStore['startGroupTravel']>[1]) => store.startPartyCombat(plans, context),
    load: () => store.partyState(), save: (snapshot: unknown) => store.savePartyState(snapshot), transaction: (run: () => { error?: FantasyPartyError; updates?: { user: string; profile: ReturnType<FantasyStore['profile']> }[] }, snapshot: () => unknown) => store.partyTransaction(run, snapshot) };
  const party = new FantasyParty(options);
  const request = (user: string, command: unknown) => { wall += 1001; return party.request(user, command); };
  request('a', { type: 'create' }); request('a', { type: 'invite', target: 'b' }); request('b', { type: 'respond', invite: party.state('b').invitations[0].id, accept: true });
  return { store, party, request, file, options, fail: (v: boolean) => { fail = v; }, hour: (v: number) => { hour = v; } };
}

test('only the leader proposes travel and each member acknowledges the immutable published quote', t => {
  const f = fixture(t);
  assert.equal(f.request('b', { type: 'readyTravel', destination: 'greenwood', transport: 'foot' }).error, 'leader-only');
  assert.equal(f.request('a', { type: 'readyTravel', destination: 'greenwood', transport: 'foot' }).error, undefined);
  const proposal = f.party.state('b').travelProposal!;
  assert.equal(proposal.destination, 'greenwood'); assert.equal(proposal.quotes.length, 2);
  assert.equal(f.request('b', { type: 'travelDecision', proposal: proposal.id, revision: proposal.revision - 1, accept: true }).error, 'stale');
  assert.equal(f.request('b', { type: 'travelDecision', proposal: proposal.id, revision: proposal.revision, accept: true }).error, undefined);
  const before = ['a', 'b'].map(user => f.store.profile(user)); f.fail(true);
  assert.equal(f.request('a', { type: 'startTravel' }).error, 'save-failed'); assert.deepEqual(['a', 'b'].map(user => f.store.profile(user)), before);
  f.fail(false); assert.equal(f.request('a', { type: 'startTravel' }).error, undefined);
  assert.equal(f.store.apply('b', f.store.profile('b').revision, { type: 'redirect', destination: 'sunmeadow' }).changed, false);
});

test('an escort convoy owns one cart, includes companions without a foreign contract, and rolls back a failed ambush save', t => {
  const f = fixture(t, false, { combat: true, ambush: true, escort: true });
  assert.equal(f.request('a', { type: 'readyTravel', destination: 'sunmeadow', transport: 'escort' }).error, undefined);
  const proposal = f.party.state('b').travelProposal!; assert.equal(proposal.transport, 'escort');
  assert.equal(f.request('b', { type: 'travelDecision', proposal: proposal.id, revision: proposal.revision, accept: true }).error, undefined);
  assert.equal(f.request('a', { type: 'startTravel' }).error, undefined); assert.equal(f.store.profile('b').character!.escort, undefined);
  const activity = f.store.profile('a').activity!, hit = fantasyAmbushHit(activity, activity.endsAt)!; assert.ok(hit);
  const before = ['a', 'b'].map(user => f.store.profile(user)); f.hour(hit.hour + .001); f.fail(true);
  assert.ok(f.store.tick(new Set(['a'])).every(update => !!update.error)); assert.deepEqual(['a', 'b'].map(user => f.store.profile(user)), before);
  f.fail(false); const restored = new FantasyStore(f.file, { combatEnabled: true, ambush: true, worldHour: () => hit.hour + .001, onError: () => {} }); restored.tick(new Set());
  const battle = restored.combat('a', 'same')!; assert.ok(battle); assert.equal(battle.escort!.owner, 'a'); assert.equal(battle.fighters.filter(f => f.userId).length, 2);
  assert.equal(restored.profile('a').combatId, restored.profile('b').combatId); assert.equal(restored.profile('b').character!.escort, undefined);
});

test('a story victory credits an eligible sit-out once without loot, and a failed victory save credits nobody', t => {
  const f = fixture(t, true, { combat: true });
  assert.equal(f.request('a', { type: 'readyCombat', source: 'story', target: 'main-night-01' }).error, undefined);
  const proposal = f.party.state('b').combatProposal!;
  assert.equal(f.request('b', { type: 'combatDecision', proposal: proposal.id, revision: proposal.revision, decision: 'sit-out' }).error, undefined);
  assert.equal(f.request('a', { type: 'startCombat' }).error, undefined);
  const disk = JSON.parse(fs.readFileSync(f.file, 'utf8')), battle = Object.values(disk.combats)[0] as any;
  const actor = battle.state.fighters.find((fighter: any) => fighter.userId === 'a'), enemy = battle.state.fighters.find((fighter: any) => fighter.side === 'enemies');
  battle.state.seed=1; actor.stats.agility=100; actor.stats.accuracy=100; actor.tile = { x: 7, y: 4 }; actor.stats.attack = 1000; enemy.tile = { x: 8, y: 4 }; enemy.hp = 1;
  assert.ok(validFantasyCombatState(battle.state));
  fs.writeFileSync(f.file, JSON.stringify(disk)); let fail = true;
  const store = new FantasyStore(f.file, { combatEnabled: true, worldHour: () => 8, onError: () => {}, save: (target, bytes) => { if (fail) throw Error('disk'); fs.writeFileSync(target, bytes); } });
  assert.equal(store.loadError, undefined); const before = ['a', 'b'].map(user => store.profile(user)), savedBytes = fs.readFileSync(f.file, 'utf8');
  assert.ok(validFantasyCombatState(store.combat('a', 'same'))); assert.equal(fantasyCombatOrderError(store.combat('a', 'same')!, 'a', { type: 'attack', target: enemy.id }), undefined);
  assert.equal(store.combatOrder('a', 'same', battle.state.id, battle.state.revision, { type: 'attack', target: enemy.id }).error, 'save-failed'); assert.deepEqual(['a', 'b'].map(user => store.profile(user)), before); assert.equal(fs.readFileSync(f.file, 'utf8'), savedBytes);
  fail = false; const victory = store.combatOrder('a', 'same', battle.state.id, battle.state.revision, { type: 'attack', target: enemy.id }); assert.equal(victory.state!.status, 'victory');
  const b = store.profile('b'); assert.equal(b.character!.combatVictories!['story:main-night-01:field'], 8); assert.equal(b.character!.xp, before[1].character!.xp); assert.equal(b.character!.gold, before[1].character!.gold); assert.deepEqual(b.character!.inventory, before[1].character!.inventory);
  const a = store.profile('a'), receipt = a.character!.lastHunt!; assert.equal(receipt.receipt, battle.state.id); assert.equal(receipt.count, 1);
  const restored = new FantasyStore(f.file, { combatEnabled: true, worldHour: () => 8, onError: () => {} }); assert.equal(restored.loadError, undefined); restored.tick(new Set()); assert.deepEqual(restored.profile('b'), b); assert.deepEqual(restored.profile('a'), a);
  assert.ok(restored.combatOrder('a', 'same', battle.state.id, battle.state.revision, { type: 'attack', target: enemy.id }).error); assert.deepEqual(restored.profile('b'), b); assert.deepEqual(restored.profile('a'), a);
  const saved = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  for (const patch of [{ count: 7 }, { receipt: 'quest-forged' }, { id: 'monster-invented' }]) {
    const broken = structuredClone(saved); Object.assign(broken.profiles.a.character.lastHunt, patch);
    const file = path.join(path.dirname(f.file), 'bad-receipt.json'), bytes = JSON.stringify(broken); fs.writeFileSync(file, bytes);
    assert.ok(new FantasyStore(file, { onError: () => {} }).loadError); assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  }
});

test('a mixed investigation shares only proof, survives restart, and completion save failure publishes nobody', t => {
  const f = fixture(t, true);
  for (const user of ['a', 'b']) assert.equal(f.request(user, { type: 'ready', quest: 'main-night-01', approach: user === 'a' ? 'analyze' : 'restore' }).error, undefined);
  assert.equal(f.request('a', { type: 'start' }).error, undefined);
  const before = ['a', 'b'].map(user => f.store.profile(user)); f.hour(8.5); f.fail(true);
  f.store.tick(new Set(['a'])); assert.deepEqual(['a', 'b'].map(user => f.store.profile(user)), before);
  f.fail(false);
  const restored = new FantasyStore(f.file, { worldHour: () => 8.5, onError: () => {} }); restored.tick(new Set());
  assert.equal(restored.profile('a').character!.mainTrials!['main-night-01'].proofs.length, 1);
  assert.equal(restored.profile('b').character!.mainTrials!['main-night-01'].proofs.length, 1);
  assert.equal(restored.profile('b').character!.xp, 0);
  const settled = JSON.stringify(['a', 'b'].map(user => restored.profile(user))); restored.tick(new Set()); assert.equal(JSON.stringify(['a', 'b'].map(user => restored.profile(user))), settled);
});

test('combat rejection cancels the proposal and old decisions cannot attach to its replacement', t => {
  const f = fixture(t, true, { combat: true });
  assert.equal(f.request('a', { type: 'readyCombat', source: 'story', target: 'main-night-01' }).error, undefined);
  const proposal = f.party.state('b').combatProposal!;
  assert.ok(proposal);
  assert.equal(f.request('b', { type: 'combatDecision', proposal: proposal.id, revision: proposal.revision, decision: 'decline' }).error, undefined);
  assert.equal(f.party.state('a').combatProposal, undefined); assert.equal(f.request('a', { type: 'startCombat' }).error, 'not-ready');
  assert.equal(f.request('a', { type: 'readyCombat', source: 'story', target: 'main-night-01' }).error, undefined);
  assert.equal(f.request('b', { type: 'combatDecision', proposal: proposal.id, revision: proposal.revision, decision: 'accept' }).error, 'stale');
});

test('party roster and proposal survive restart and persistence failure rolls back authority changes', t => {
  const f = fixture(t); f.fail(true);
  assert.equal(f.request('a', { type: 'transferLeader', target: 'b' }).error, 'save-failed');
  assert.equal(f.party.state('a').members.find(m => m.isLeader)!.id, 'a'); f.fail(false);
  assert.equal(f.request('a', { type: 'readyTravel', destination: 'greenwood', transport: 'foot' }).error, undefined);
  const restored = new FantasyStore(f.file, { worldHour: () => 8, onError: () => {} });
  const party = new FantasyParty({ ...f.options, load: () => restored.partyState() });
  assert.deepEqual(party.state('b'), f.party.state('b'));
});

test('party redirect requires fresh consent and commits every current route together', t => {
  const f = fixture(t); f.request('a', { type: 'readyTravel', destination: 'greenwood', transport: 'foot' });
  const proposal = f.party.state('b').travelProposal!;
  f.request('b', { type: 'travelDecision', proposal: proposal.id, revision: proposal.revision, accept: true }); f.request('a', { type: 'startTravel' });
  f.hour(8.1); f.store.tick(new Set(['a', 'b']));
  assert.equal(f.request('a', { type: 'readyRedirect', destination: 'sunmeadow' }).error, undefined);
  const redirect = f.party.state('b').travelProposal!; assert.equal(redirect.kind, 'redirect');
  assert.equal(f.request('a', { type: 'startRedirect' }).error, 'not-ready');
  f.request('b', { type: 'travelDecision', proposal: redirect.id, revision: redirect.revision, accept: true });
  const before = ['a', 'b'].map(user => f.store.profile(user)); f.fail(true);
  assert.equal(f.request('a', { type: 'startRedirect' }).error, 'save-failed'); assert.deepEqual(['a', 'b'].map(user => f.store.profile(user)), before);
  f.fail(false); assert.equal(f.request('a', { type: 'startRedirect' }).error, undefined);
  assert.equal(f.store.profile('a').activity!.endsAt, f.store.profile('b').activity!.endsAt);
  const action = f.store.profile('b').activity!.action; assert.ok(action.type === 'travel'); assert.equal(action.destination, 'sunmeadow');
});

test('a grouped ambush catches offline members and starts exactly one shared saved combat', t => {
  const f = fixture(t, false, { combat: true, ambush: true });
  f.request('a', { type: 'readyTravel', destination: 'greenwood', transport: 'foot' }); const proposal = f.party.state('b').travelProposal!;
  f.request('b', { type: 'travelDecision', proposal: proposal.id, revision: proposal.revision, accept: true }); f.request('a', { type: 'startTravel' });
  f.hour(8.18); f.store.tick(new Set(['a']));
  const a = f.store.profile('a'), b = f.store.profile('b');
  assert.ok(a.combatId); assert.equal(a.combatId, b.combatId);
  const battle = f.store.combat('a', 'same')!; assert.equal(battle.fighters.filter(f => f.userId).length, 2);
  const restored = new FantasyStore(f.file, { combatEnabled: true, worldHour: () => battle.hour, onError: () => {} });
  assert.equal(restored.loadError, undefined); assert.equal(restored.profile('b').combatId, a.combatId);
});

test('a nonhostile map merchant pauses the whole online/offline convoy without creating combat', t => {
  const f = fixture(t, false, { combat: true, ambush: true });
  let seed = 0, meet: { hour: number } | undefined;
  for (; seed < 100000; seed++) {
    const activity = { action: { type: 'travel' as const, destination: 'greenwood', transport: 'foot' }, startedAt: 8, endsAt: 9, seed };
    const merchant = fantasyMapMerchantHit(activity, 9), hostile = fantasyAmbushHit(activity, 9);
    if (merchant && (!hostile || merchant.hour < hostile.hour)) { meet = merchant; break; }
  }
  assert.ok(meet);
  assert.equal(f.store.startGroupTravel(['a', 'b'].map(user => ({ user, generation: 1, location: 'hearth', destination: 'greenwood', transport: 'foot' })), { party: f.party.state('a').id!, session: 'same', leader: 'a' }, () => seed / 4294967296).error, undefined);
  const before = ['a', 'b'].map(user => f.store.profile(user)); f.hour(meet.hour + .001); f.fail(true);
  f.store.tick(new Set(['a'])); assert.deepEqual(['a', 'b'].map(user => f.store.profile(user)), before);
  f.fail(false); f.store.tick(new Set(['a']));
  const a = f.store.profile('a'), b = f.store.profile('b'); assert.equal(a.event, FANTASY_MAP_MERCHANT_EVENT); assert.equal(b.event, a.event);
  assert.equal(a.activity, undefined); assert.equal(b.activity, undefined); assert.equal(a.combatId, undefined); assert.equal(b.combatId, undefined); assert.deepEqual(a.character!.travelPosition, b.character!.travelPosition);
  assert.equal(new FantasyStore(f.file, { combatEnabled: true, worldHour: () => meet!.hour + .001, onError: () => {} }).loadError, undefined);
});
