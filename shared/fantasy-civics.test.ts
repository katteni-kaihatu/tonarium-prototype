import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import type { FantasyProfile } from './fantasy.ts';
import { NPC_PUBLIC } from './npc.ts';
import { newFantasyCivicLedger, validFantasyCivicLedger, isFantasyCivicCommand, applyFantasyCivicCommand, advanceFantasyCivics, fantasyCivicState, fantasyCivicActionBlock,
  fantasyCivicServiceMultiplier, fantasyNpcCivicPresence, fantasyCivicText, fantasyCivicLogText, type FantasyCivicLedger, type FantasyCivicCommand, type FantasyCivicContext } from './fantasy-civics.ts';

function person(name: string, job = 'unemployed'): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name }, () => .5).profile;
  p.character!.gold = 200; p.character!.location = 'hearth'; p.character!.hour = 25; p.character!.job = job; p.character!.jobXp[job] = 100;
  return p;
}
const context: FantasyCivicContext = { session: 'public-test', publicSession: true, peers: ['a', 'b', 'guard'] };
function setup() {
  const people = { a: person('A'), b: person('B'), guard: person('Guard', 'knight') };
  return advanceFantasyCivics(newFantasyCivicLedger(), people, 25);
}
type Mutable = { ledger: FantasyCivicLedger; profiles: Record<string, FantasyProfile> };
function run(s: Mutable, actor: string, command: Record<string, unknown>, at = 25, ctx = context) {
  return applyFantasyCivicCommand(s.ledger, s.profiles, actor, { ...command, revision: s.ledger.revision, requestId: `${String(command.type)}-${s.ledger.revision}` } as FantasyCivicCommand, at, ctx);
}
function theft() { return run(setup(), 'a', { type: 'npcCrime', npc: 'rin', kind: 'theft' }); }

test('civic catalog contains every real resident and validates bounded persistent social records', () => {
  const s = setup(); assert.equal(s.error, undefined); assert.equal(validFantasyCivicLedger(s.ledger), true);
  assert.equal(Object.keys(s.ledger.npcs).length, NPC_PUBLIC.length); assert.equal(Object.keys(s.ledger.towns).length, 20);
  assert.ok(s.ledger.notices.length <= 80); assert.ok(Object.values(s.ledger.npcs).every(npc => npc.location === NPC_PUBLIC.find(entry => entry.id === npc.npc)!.homeLocation));
  for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(s.ledger.notices.every(entry => !!entry.text[locale]));
  for (const mutate of [(l: FantasyCivicLedger) => { l.towns.hearth.council = 99; }, (l: FantasyCivicLedger) => { l.npcs.rin.location = 'mooncity'; },
    (l: FantasyCivicLedger) => { l.npcs.rin.relations.rin = 1; }, (l: FantasyCivicLedger) => { l.revision = -1; }]) {
    const copy = structuredClone(s.ledger); mutate(copy); assert.equal(validFantasyCivicLedger(copy), false);
  }
});

test('daily schedules and neighbour reactions advance once per six-hour window and long absences are bounded', () => {
  const s = setup(), repeated = advanceFantasyCivics(s.ledger, s.profiles, 25.1);
  assert.equal(repeated.changed, false); assert.equal(repeated.ledger, s.ledger);
  const first = advanceFantasyCivics(s.ledger, s.profiles, 30), second = advanceFantasyCivics(s.ledger, s.profiles, 30);
  assert.deepEqual(first, second); assert.equal(first.ledger.window, 5); assert.ok(first.ledger.revision > s.ledger.revision);
  assert.equal(fantasyNpcCivicPresence(first.ledger, 'rin')?.window, 5); assert.ok(Object.values(first.ledger.npcs).some(npc => npc.activity === 'market'));
  const sleeping = advanceFantasyCivics(first.ledger, first.profiles, 48); assert.equal(sleeping.ledger.npcs.rin.activity, 'sleep');
  const long = advanceFantasyCivics(sleeping.ledger, sleeping.profiles, 1e6); assert.ok(long.ledger.notices.length <= 80); assert.ok(long.ledger.revision - sleeping.ledger.revision <= 8); assert.equal(validFantasyCivicLedger(long.ledger), true);
});

test('civic commands reject extra fields, invented residents, foreign effects and prototype identifiers', () => {
  assert.equal(isFantasyCivicCommand({ type: 'sync' }), true);
  assert.equal(isFantasyCivicCommand({ type: 'sync', gold: 999 }), false);
  assert.equal(isFantasyCivicCommand({ type: 'rob', target: '__proto__', revision: 0, requestId: 'x' }), false);
  assert.equal(isFantasyCivicCommand({ type: 'npcCrime', npc: 'unknown', kind: 'theft', revision: 0, requestId: 'x' }), false);
  assert.equal(isFantasyCivicCommand({ type: 'govern', policy: 'seize-all', revision: 0, requestId: 'x' }), false);
  const s = setup(), old = structuredClone(s); assert.equal(applyFantasyCivicCommand(s.ledger, s.profiles, 'a', { type: 'sync' }, -1, context).error, 'invalid'); assert.deepEqual(s, old);
});

test('players are protected until both consent in one public session and the same place', () => {
  const s = setup(); assert.equal(run(s, 'a', { type: 'rob', target: 'b' }).error, 'protected');
  const one = run(s, 'a', { type: 'consent', enabled: true }); assert.equal(one.error, undefined); assert.equal(run(one, 'a', { type: 'rob', target: 'b' }).error, 'protected');
  assert.equal(run(s, 'a', { type: 'consent', enabled: true }, 25, { ...context, publicSession: false }).error, 'protected');
  const both = run(one, 'b', { type: 'consent', enabled: true });
  assert.equal(run(both, 'a', { type: 'rob', target: 'b' }, 25, { ...context, session: 'foreign' }).error, 'protected');
  assert.equal(run(both, 'a', { type: 'rob', target: 'b' }, 25, { ...context, peers: [] }).error, 'protected');
  const away = structuredClone(both); away.profiles.b.character!.location = 'mooncity'; assert.equal(run(away, 'a', { type: 'rob', target: 'b' }).error, 'protected');
});

test('consensual robbery conserves gold, cannot take equipment or food and leaves actual evidence', () => {
  let s = run(setup(), 'a', { type: 'consent', enabled: true }); s = run(s, 'b', { type: 'consent', enabled: true });
  const oldA = structuredClone(s.profiles.a.character!), oldB = structuredClone(s.profiles.b.character!);
  const robbed = run(s, 'a', { type: 'rob', target: 'b' }); assert.equal(robbed.error, undefined);
  const a = robbed.profiles.a.character!, b = robbed.profiles.b.character!;
  assert.equal(a.gold + b.gold, oldA.gold + oldB.gold); assert.ok(oldB.gold - b.gold >= 0 && oldB.gold - b.gold <= 10);
  assert.deepEqual(a.inventory, oldA.inventory); assert.deepEqual(b.inventory, oldB.inventory); assert.deepEqual(b.foodLots, oldB.foodLots); assert.deepEqual(b.gear, oldB.gear);
  const entry = robbed.ledger.cases[0]; assert.equal(entry.status, 'wanted'); assert.equal(entry.crime, 'robbery'); assert.ok(entry.evidence.length);
  assert.equal(fantasyCivicState(robbed.ledger, robbed.profiles, 'b', 25, context).ownCases.length, 0);
});

test('withdrawal, movement, time expiry and a new life invalidate danger consent', () => {
  const s = run(setup(), 'a', { type: 'consent', enabled: true });
  assert.equal(fantasyCivicState(s.ledger, s.profiles, 'a', 25, context).riskEnabled, true);
  assert.equal(fantasyCivicState(s.ledger, s.profiles, 'a', 37, context).riskEnabled, false);
  const withdrawn = run(s, 'a', { type: 'consent', enabled: false }); assert.equal(withdrawn.ledger.consents.a, undefined);
  const moved = structuredClone(s); moved.profiles.a.character!.location = 'mooncity'; const afterMove = advanceFantasyCivics(moved.ledger, moved.profiles, 25); assert.equal(afterMove.ledger.consents.a, undefined);
  const nextLife = structuredClone(s); nextLife.profiles.a.generation = 2; const afterLife = advanceFantasyCivics(nextLife.ledger, nextLife.profiles, 25); assert.equal(afterLife.ledger.consents.a, undefined);
});

test('being a criminal profession creates no case until a real offensive action happens', () => {
  const s = setup(); s.profiles.a.character!.job = 'thief';
  const synced = advanceFantasyCivics(s.ledger, s.profiles, 31); assert.equal(synced.ledger.cases.length, 0); assert.equal(synced.profiles.a.character!.notoriety ?? 0, 0);
  const actual = run(s, 'a', { type: 'npcCrime', npc: 'rin', kind: 'theft' }); assert.equal(actual.error, undefined); assert.equal(actual.ledger.cases.length, 1); assert.ok(actual.profiles.a.character!.notoriety! > 0);
  assert.equal(run(actual, 'a', { type: 'npcCrime', npc: 'rin', kind: 'theft' }).error, 'cooldown');
});

test('custody blocks ordinary actions while allowing a hearing, fine, appeal and consent withdrawal', () => {
  const wanted = theft(), custody = run(wanted, 'a', { type: 'surrender' }); assert.equal(custody.error, undefined);
  assert.equal(fantasyCivicActionBlock(custody.ledger, custody.profiles.a, 'a', 25), 'custody');
  assert.equal(run(custody, 'a', { type: 'govern', policy: 'patrol' }).error, 'custody');
  const withdrawn = run(custody, 'a', { type: 'consent', enabled: false }); assert.equal(withdrawn.error, undefined);
  const hearing = run(withdrawn, 'a', { type: 'hearing', plea: 'admit' }); assert.equal(hearing.error, undefined);
  assert.equal(hearing.ledger.cases[0].status, 'sentenced'); assert.equal(hearing.ledger.cases[0].jailUntil, 26);
  assert.equal(run(hearing, 'a', { type: 'release' }).error, 'wait');
  const freed = advanceFantasyCivics(hearing.ledger, hearing.profiles, 26); assert.equal(freed.ledger.cases[0].status, 'closed'); assert.equal(fantasyCivicActionBlock(freed.ledger, freed.profiles.a, 'a', 26), undefined);
  const twice = advanceFantasyCivics(freed.ledger, freed.profiles, 26); assert.equal(twice.changed, false);
});

test('hearing uses stored eyewitness evidence, has a bounded jail term and cannot be replayed', () => {
  const s = run(setup(), 'a', { type: 'npcCrime', npc: 'rin', kind: 'assault' });
  const custody = run(s, 'a', { type: 'surrender' }), sentenced = run(custody, 'a', { type: 'hearing', plea: 'contest' });
  assert.equal(sentenced.error, undefined); assert.equal(sentenced.ledger.cases[0].jailUntil, 29);
  assert.equal(run(sentenced, 'a', { type: 'hearing', plea: 'admit' }).error, 'no-case');
  const appealed = run(sentenced, 'a', { type: 'appeal' }); assert.equal(appealed.error, undefined); assert.equal(appealed.ledger.cases[0].jailUntil, 29);
  assert.equal(run(appealed, 'a', { type: 'appeal' }).error, 'no-case'); assert.equal(validFantasyCivicLedger(appealed.ledger), true);
});

test('restitution transfers actual damages once and supports a shorter rehearing without erasing evidence', () => {
  const prepared = setup(); prepared.profiles.a.character!.level = 20;
  let s = run(prepared, 'a', { type: 'consent', enabled: true }); s = run(s, 'b', { type: 'consent', enabled: true }); s = run(s, 'a', { type: 'rob', target: 'b' });
  const damages = s.ledger.cases[0].damages; assert.ok(damages > 0);
  s = run(s, 'a', { type: 'surrender' }); s = run(s, 'a', { type: 'hearing', plea: 'contest' });
  const before = s.profiles.b.character!.gold, repaid = run(s, 'a', { type: 'restitution' }); assert.equal(repaid.error, undefined); assert.equal(repaid.profiles.b.character!.gold, before + damages);
  assert.equal(run(repaid, 'a', { type: 'restitution' }).error, 'no-case');
  const reheard = run(repaid, 'a', { type: 'appeal' }); assert.equal(reheard.error, undefined); assert.equal(reheard.ledger.cases[0].jailUntil, 25.5); assert.ok(reheard.ledger.cases[0].fine < repaid.ledger.cases[0].fine); assert.deepEqual(reheard.ledger.cases[0].evidence, repaid.ledger.cases[0].evidence);
});

test('only an authorised local officer can arrest and bounty comes from a paid fine once', () => {
  const s = theft(); assert.equal(run(s, 'b', { type: 'arrest', target: 'a' }).error, 'forbidden');
  const detained = run(s, 'guard', { type: 'arrest', target: 'a' }); assert.equal(detained.error, undefined); assert.equal(detained.ledger.cases[0].arrestor?.user, 'guard');
  const hearing = run(detained, 'a', { type: 'hearing', plea: 'admit' }), fine = hearing.ledger.cases[0].fine;
  const beforeGold = hearing.profiles.a.character!.gold + hearing.profiles.guard.character!.gold, treasury = hearing.ledger.towns.hearth.treasury;
  const paid = run(hearing, 'a', { type: 'payFine' }); assert.equal(paid.error, undefined);
  assert.equal(paid.profiles.guard.character!.gold - hearing.profiles.guard.character!.gold, Math.floor(fine / 4));
  assert.equal(paid.profiles.a.character!.gold + paid.profiles.guard.character!.gold + paid.ledger.towns.hearth.treasury - treasury, beforeGold);
  assert.equal(run(paid, 'a', { type: 'payFine' }).error, 'no-case');
});

test('criminal evidence stays in the world but never follows the accused into a new life', () => {
  const s = theft(); s.profiles.a.generation = 2;
  const changed = advanceFantasyCivics(s.ledger, s.profiles, 26); assert.equal(changed.ledger.cases[0].status, 'closed'); assert.equal(changed.ledger.cases[0].closedReason, 'past-life');
  const state = fantasyCivicState(changed.ledger, changed.profiles, 'a', 26, context); assert.equal(state.ownCases.length, 0); assert.equal(state.wanted.length, 0); assert.equal(state.actionBlock, undefined);
});

test('leadership changes shared trust, factions, projects and a bounded real service multiplier', () => {
  const s = setup(); s.profiles.a.character!.job = 'leader'; s.profiles.a.character!.jobXp.leader = 100;
  const before = fantasyCivicServiceMultiplier(s.ledger, 'hearth'), governed = run(s, 'a', { type: 'govern', policy: 'provisions' }); assert.equal(governed.error, undefined);
  assert.equal(governed.profiles.a.character!.gold, 188); assert.equal(governed.ledger.towns.hearth.treasury, 12);
  assert.ok(governed.ledger.towns.hearth.trust > s.ledger.towns.hearth.trust); assert.ok(fantasyCivicServiceMultiplier(governed.ledger, 'hearth') < before);
  assert.equal(fantasyCivicState(governed.ledger, governed.profiles, 'b', 25, context).town?.policy, 'provisions'); assert.equal(run(governed, 'a', { type: 'govern', policy: 'patrol' }).error, 'cooldown');
  const expired = advanceFantasyCivics(governed.ledger, governed.profiles, 54); assert.equal(expired.ledger.towns.hearth.policy, null);
});

test('crime-boss intimidation has civic consequences and creates a real legal case rather than free money', () => {
  const s = setup(); s.profiles.a.character!.job = 'crimeboss'; s.profiles.a.character!.jobXp.crimeboss = 100;
  const result = run(s, 'a', { type: 'govern', policy: 'extort' }); assert.equal(result.error, undefined);
  assert.equal(result.profiles.a.character!.gold, 188); assert.equal(result.ledger.cases[0].crime, 'extortion'); assert.ok(result.ledger.towns.hearth.underworld > s.ledger.towns.hearth.underworld);
  assert.ok(result.ledger.towns.hearth.trust < s.ledger.towns.hearth.trust); assert.ok(fantasyCivicServiceMultiplier(result.ledger, 'hearth') > 1);
});

test('stale or duplicate commands and busy counterparts change neither input nor their funds', () => {
  const s = setup(), old = structuredClone(s), command: FantasyCivicCommand = { type: 'consent', enabled: true, revision: s.ledger.revision, requestId: 'consent-once' };
  const one = applyFantasyCivicCommand(s.ledger, s.profiles, 'a', command, 25, context); assert.deepEqual(s, old);
  assert.equal(applyFantasyCivicCommand(one.ledger, one.profiles, 'a', command, 25, context).error, 'duplicate');
  assert.equal(applyFantasyCivicCommand(one.ledger, one.profiles, 'b', { ...command, requestId: 'different' }, 25, context).error, 'stale');
  const busy = structuredClone(s); busy.profiles.a.event = 'pending'; assert.equal(run(busy, 'a', { type: 'consent', enabled: true }).error, 'busy');
  for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(['protected', 'custody', 'stale'].every(error => fantasyCivicText(error, locale) !== error));
});

test('public state omits private cases and inventories while exposing only local named residents and notices', () => {
  const s = theft(), state = fantasyCivicState(s.ledger, s.profiles, 'b', 25, context);
  assert.equal(state.ownCases.length, 0); assert.equal(state.wanted.length, 1); assert.equal(JSON.stringify(state).includes('inventory'), false); assert.equal(JSON.stringify(state).includes('readBooks'), false);
  assert.ok(state.npcs.every(npc => NPC_PUBLIC.find(entry => entry.id === npc.npc)!.homeLocation === 'hearth'));
  const absent = fantasyCivicState(s.ledger, {}, 'missing', 25, context); assert.equal(absent.location, null); assert.equal(absent.npcs.length, 0);
});

test('all committed civic journal messages have Korean, English and Japanese readings', () => {
  const wanted = theft(), custody = run(wanted, 'a', { type: 'surrender' }), hearing = run(custody, 'a', { type: 'hearing', plea: 'contest' });
  const paid = run(hearing, 'a', { type: 'payFine' });
  for (const entry of paid.profiles.a.log.filter(entry => entry.id > setup().profiles.a.log.at(-1)!.id)) for (const locale of ['ko', 'en', 'ja'] as const) {
    assert.ok(fantasyCivicLogText(entry.text, locale), `${locale}: ${entry.text}`);
    if (locale !== 'ko') assert.equal(/[가-힣]/.test(fantasyCivicLogText(entry.text, locale)!), false);
  }
  assert.equal(fantasyCivicLogText('unrelated message', 'en'), undefined);
});

test('closed-history pruning never evicts another person’s still-active case', () => {
  const s = setup(), example = theft().ledger.cases[0];
  s.ledger.cases = Array.from({ length: 511 }, (_, index) => ({ ...structuredClone(example), id: `existing-${index}`, accused: { user: `old-${index}`, generation: 1, name: `Old ${index}` } }));
  s.ledger.cases.push({ ...structuredClone(example), id: 'recent-closed', status: 'closed', closedReason: 'paid' });
  assert.equal(validFantasyCivicLedger(s.ledger), true);
  const result = run(s, 'a', { type: 'npcCrime', npc: 'rin', kind: 'theft' }); assert.equal(result.error, undefined); assert.equal(result.ledger.cases.length, 512);
  assert.equal(result.ledger.cases.some(entry => entry.id === 'existing-0'), true); assert.equal(result.ledger.cases.some(entry => entry.id === 'recent-closed'), false);
});
