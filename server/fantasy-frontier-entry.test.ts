import { fantasyQuestRecordEligible } from '../shared/fantasy-access.ts';
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore, type FantasyGroupTravelPlan } from './fantasy-store.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { fantasyCombatPlayer } from './fantasy-combat-adapter.ts';
import { fantasyRegularEncounterTier } from '../shared/fantasy-adventurer.ts';
import { FANTASY_FRONTIER_BASE, FANTASY_FRONTIER_DEPARTURE } from '../shared/fantasy-frontier-data.ts';
import { fantasyPriestGrowthStatus, fantasyPriestServiceQuest } from '../shared/fantasy-priest-growth.ts';
import { FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { beginFantasyDowned } from '../shared/fantasy-downed.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
function person(name: string, job = 'warrior', grade: 3 | 4 = 4): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name, gender: 'female' }, () => .5).profile, c = p.character!;
  Object.assign(c, { job, hour: 12, location: FANTASY_FRONTIER_DEPARTURE, gold: 5000, guildProgress: { version: 1, grade, completedAtGrade: 0, creditedQuests: [] }, encounterTier: 6, fatigue: 0, hunger: 0 });
  c.jobXp[job] = 0; c.visited.push(FANTASY_FRONTIER_DEPARTURE); c.charted.push(FANTASY_FRONTIER_BASE);
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp; return p;
}
function enlisted(p: FantasyProfile, route: 'guild' | 'smuggler' = 'guild') {
  p.character!.expedition = { route, issuedAt: p.character!.hour }; return p;
}
function fixture(t: TestContext, profiles: Record<string, FantasyProfile>, party = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-frontier-entry-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('fantasy-frontier-entry-')); fs.rmSync(dir, { recursive: true, force: true }); });
  const file = path.join(dir, 'fantasy.json');
  const partyState = { version: 1, parties: [{ id: 'entry-party', session: 'entry', leader: 'a', members: Object.keys(profiles), ready: [], combatReady: [], combatDeclined: [], combatSitOut: [], travelReady: [], chat: [], revision: 1 }], invitations: [] };
  fs.writeFileSync(file, JSON.stringify(party ? { version: 2, profiles, combats: {}, partyState } : profiles));
  const errors: unknown[] = []; let hour = 12;
  const store = new FantasyStore(file, { worldHour: () => hour, onError: error => errors.push(error) });
  assert.equal(store.loadError, undefined, errors.map(String).join('\n'));
  return { store, file, setHour: (value: number) => { hour = value; } };
}
const boarding = { type: 'travel', destination: FANTASY_FRONTIER_BASE, transport: 'ship' } as const;
function travelPlan(user: string, p: FantasyProfile, destination = FANTASY_FRONTIER_BASE): FantasyGroupTravelPlan {
  return { user, generation: p.generation ?? 1, location: p.character!.location, destination, transport: 'ship' };
}
test('authoritative enlistment rejects low guild rank and stale cached criminal combat power', t => {
  for (const job of ['warrior', 'thief']) {
    const p = person('Weak entry', job, 3), c = p.character!;
    const actor = fantasyCombatPlayer(p, 'a'); assert.ok(fantasyRegularEncounterTier(actor.stats, actor) < 4);
    c.encounterTier = 6;
    const { store, file } = fixture(t, { a: p }), before = fs.readFileSync(file, 'utf8');
    const result = store.apply('a', store.profile('a').revision, { type: 'expeditionJoin', route: job === 'thief' ? 'smuggler' : 'guild' });
    assert.equal(result.error, 'expedition:rank'); assert.equal(result.changed, false); assert.equal(store.profile('a').character!.expedition, undefined);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  }
});
test('registered lawful Gold and equivalent evidence-backed temple rank can enlist', t => {
  const priest = person('Temple entry', 'priest'), c = priest.character!;
  c.guildProgress = undefined;
  const service = FANTASY_QUESTS.filter(q => fantasyPriestServiceQuest(q.id) && fantasyQuestRecordEligible(c, q)).slice(0, 15).map(q => q.id);
  assert.equal(service.length, 15); c.completed = service;
  c.priestGrowth = { version: 1, startedAt: 0, service, doctrine: [], pilgrimage: [], prayerDays: [], prayerTemples: {}, vows: service.map(quest => ({ quest, acceptedAt: 0, hour: 12, location: c.location, outcome: 'fulfilled' as const })), branchChanges: 0 };
  assert.equal(fantasyPriestGrowthStatus(c).clergyAdventurerGrade, 4);
  for (const p of [person('Gold entry'), priest]) {
    p.character!.location = 'hearth';
    const { store } = fixture(t, { a: p });
    const joined = store.apply('a', store.profile('a').revision, { type: 'expeditionJoin', route: 'guild' });
    assert.equal(joined.error, undefined); assert.equal(joined.profile.character!.expedition?.route, 'guild');
    const atHarbor = structuredClone(joined.profile); atHarbor.character!.location = FANTASY_FRONTIER_DEPARTURE;
    const harbor = fixture(t, { a: atHarbor }).store;
    const embarked = harbor.apply('a', harbor.profile('a').revision, boarding);
    assert.equal(embarked.error, undefined); assert.equal(embarked.profile.activity?.action.type, 'travel');
  }
});
test('boarding rechecks each criminal current power rather than honoring a stale receipt and cached tier', t => {
  const p = enlisted(person('Stale smuggler', 'thief'), 'smuggler'); p.character!.encounterTier = 6;
  const { store } = fixture(t, { a: p }), before = store.profile('a');
  const result = store.apply('a', before.revision, boarding);
  assert.equal(result.error, 'expedition:rank'); assert.equal(result.changed, false); assert.deepEqual(store.profile('a'), before);
});
test('group travel checks every member and commits no departure when one lacks qualification', t => {
  for (const bad of ['rank', 'criminal-power', 'receipt'] as const) {
    const a = enlisted(person('Leader')), b = enlisted(person('Passenger', bad === 'criminal-power' ? 'thief' : 'warrior', bad === 'rank' ? 3 : 4), bad === 'criminal-power' ? 'smuggler' : 'guild');
    if (bad === 'receipt') delete b.character!.expedition;
    const { store, file } = fixture(t, { a, b }); const bytes = fs.readFileSync(file, 'utf8');
    const result = store.startGroupTravel([travelPlan('a', a), travelPlan('b', b)], undefined, () => .5);
    assert.equal(result.error, 'incompatible', bad); assert.deepEqual(result.updates, []);
    assert.equal(store.profile('a').activity, undefined); assert.equal(store.profile('b').activity, undefined); assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  }
  const a = enlisted(person('Leader')), b = enlisted(person('Qualified companion'));
  const { store } = fixture(t, { a, b });
  const result = store.startGroupTravel([travelPlan('a', a), travelPlan('b', b)], undefined, () => .5);
  assert.equal(result.error, undefined); assert.equal(result.updates.length, 2);
});
test('a carried downed patient needs their own receipt and recalculated illegal-route power', t => {
  for (const bad of ['receipt', 'criminal-power'] as const) {
    const a = enlisted(person('Carrier')), b = person('Patient', bad === 'criminal-power' ? 'thief' : 'warrior');
    if (bad === 'criminal-power') enlisted(b, 'smuggler');
    b.character!.hp = 0; beginFantasyDowned(b, 12); b.character!.encounterTier = 6;
    const { store } = fixture(t, { a, b }, true);
    assert.equal(store.carryReturn('a', 'b', 'carry', { party: 'entry-party', allies: ['a', 'b'] }).error, undefined);
    const before = store.profile('b'), result = store.apply('a', store.profile('a').revision, boarding);
    assert.equal(result.error, bad === 'receipt' ? 'expedition:recruit' : 'expedition:rank', bad);
    assert.equal(result.changed, false); assert.equal(store.profile('a').activity, undefined);
    assert.equal(store.profile('b').character!.hp, 0); assert.deepEqual(store.profile('b').character!.downed, before.character!.downed);
    const group = store.startGroupTravel([travelPlan('a', store.profile('a'))], { party: 'entry-party', session: 'entry', leader: 'a' }, () => .5);
    assert.equal(group.error, 'incompatible', bad); assert.deepEqual(group.updates, []);
  }
});
test('unqualified survivors can still board the return ship from the frontier landing', t => {
  const p = person('Returning thief', 'thief', 3), c = p.character!; c.location = FANTASY_FRONTIER_BASE; delete c.expedition;
  c.visited.push(FANTASY_FRONTIER_BASE); const { store } = fixture(t, { a: p });
  const returned = store.apply('a', store.profile('a').revision, { type: 'travel', destination: FANTASY_FRONTIER_DEPARTURE, transport: 'ship' });
  assert.equal(returned.error, undefined); assert.equal(returned.profile.activity?.action.type, 'travel');
});

test('illegal enlistment accepts actual Gold-equivalent combat power and charges only one arrangement fee', t => {
  const p = person('Qualified smuggler', 'thief'), c = p.character!;
  c.level = 40; c.jobXp.thief = 1000; c.guildProgress = undefined;
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  const actor = fantasyCombatPlayer(p, 'a'); assert.ok(fantasyRegularEncounterTier(actor.stats, actor) >= 4);
  c.encounterTier = 1;
  const { store } = fixture(t, { a: p });
  const result = store.apply('a', store.profile('a').revision, { type: 'expeditionJoin', route: 'smuggler' });
  assert.equal(result.error, undefined); assert.equal(result.profile.character!.expedition?.route, 'smuggler');
  assert.equal(result.profile.character!.gold, 4920);
  const repeated = store.apply('a', result.profile.revision, { type: 'expeditionJoin', route: 'smuggler' });
  assert.equal(repeated.error, 'expedition:enlisted'); assert.equal(store.profile('a').character!.gold, 4920);
});
test('a qualified downed patient may board without being healed or losing carrying state', t => {
  for (const group of [false, true]) {
    const a = enlisted(person('Qualified carrier')), b = enlisted(person('Qualified patient'));
    b.character!.hp = 0; beginFantasyDowned(b, 12);
    const { store } = fixture(t, { a, b }, true);
    assert.equal(store.carryReturn('a', 'b', 'carry', { party: 'entry-party', allies: ['a', 'b'] }).error, undefined);
    const downed = store.profile('b').character!.downed;
    if (group) {
      const result = store.startGroupTravel([travelPlan('a', store.profile('a'))], { party: 'entry-party', session: 'entry', leader: 'a' }, () => .5);
      assert.equal(result.error, undefined);
    } else assert.equal(store.apply('a', store.profile('a').revision, boarding).error, undefined);
    assert.equal(store.profile('a').activity?.action.type, 'travel');
    assert.equal(store.profile('a').character!.carrying?.target, 'b');
    assert.equal(store.profile('b').character!.hp, 0); assert.deepEqual(store.profile('b').character!.downed, downed);
  }
});
test('carrying an unqualified survivor never blocks the frontier return voyage', t => {
  const a = person('Returning carrier', 'thief', 3), b = person('Returning patient', 'thief', 3);
  for (const p of [a, b]) { p.character!.location = FANTASY_FRONTIER_BASE; p.character!.visited.push(FANTASY_FRONTIER_BASE); delete p.character!.expedition; }
  b.character!.hp = 0; beginFantasyDowned(b, 12);
  const { store } = fixture(t, { a, b }, true);
  assert.equal(store.carryReturn('a', 'b', 'carry', { party: 'entry-party', allies: ['a', 'b'] }).error, undefined);
  const result = store.apply('a', store.profile('a').revision, { type: 'travel', destination: FANTASY_FRONTIER_DEPARTURE, transport: 'ship' });
  assert.equal(result.error, undefined); assert.equal(result.profile.activity?.action.type, 'travel');
});

test('group boarding rates a carried criminal at boarding time after a qualifying buff expires', t => {
  const a = enlisted(person('Carrier')), b = enlisted(person('Expiring patient', 'thief'), 'smuggler'), c = b.character!;
  c.level = 16; c.effects = [{ id: 'gem-focus', expiresAt: 13, stats: { strength: 2 } }];
  c.hp = fantasyStats(c).hp;
  const earlier = fantasyCombatPlayer(b, 'b'); assert.ok(fantasyRegularEncounterTier(earlier.stats, earlier) >= 4);
  const expired = structuredClone(b); expired.character!.hour = 14;
  const later = fantasyCombatPlayer(expired, 'b'); assert.ok(fantasyRegularEncounterTier(later.stats, later) < 4);
  c.hp = 0; beginFantasyDowned(b, 12);
  const f = fixture(t, { a, b }, true);
  assert.equal(f.store.carryReturn('a', 'b', 'carry', { party: 'entry-party', allies: ['a', 'b'] }).error, undefined);
  f.setHour(14);
  const result = f.store.startGroupTravel([travelPlan('a', f.store.profile('a'))], { party: 'entry-party', session: 'entry', leader: 'a' }, () => .5);
  assert.equal(result.error, 'incompatible'); assert.deepEqual(result.updates, []);
});
test('combat power and a legacy assessment never substitute for actual registered guild rank', t => {
  const p = person('Unregistered veteran'), c = p.character!;
  c.level = 40; c.jobXp.warrior = 1000; c.guildProgress = undefined;
  c.guildAssessment = { grade: 8, score: 1000, assessedAt: 12 };
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  const actor = fantasyCombatPlayer(p, 'a'); assert.ok(fantasyRegularEncounterTier(actor.stats, actor) >= 4);
  const { store } = fixture(t, { a: p });
  const result = store.apply('a', store.profile('a').revision, { type: 'expeditionJoin', route: 'guild' });
  assert.equal(result.error, 'expedition:rank'); assert.equal(result.changed, false);
});
