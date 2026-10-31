import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { enrollFantasyPartyContract, refreshFantasyPartyContract, markFantasyPartyContractParticipation, settleFantasyPartyContract, reconcileFantasyPartyContracts, fantasyPartyContractSupport, validFantasyPartyContracts } from './fantasy-party-contracts.ts';
import { FANTASY_QUESTS } from '../shared/fantasy-data.ts';

const quest = 'quest-herbalist', offer = 'offer-shared';
const snapshot = { parties: [{ id: 'party', leader: 'owner', members: ['owner', 'priest', 'rogue'] }] };
function person(job: string) {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: job, gender: 'female' }, () => .99).profile;
  Object.assign(p.character!, { job, location: 'hearth', gold: 100, lifeStartedAt: 12 }); return p;
}
function accepted(totalGold = 10) {
  const before = new Map([['owner', person('warrior')], ['priest', person('priest')], ['rogue', person('rogue')]]), after = structuredClone(before);
  after.get('owner')!.character!.quests.push(quest);
  after.get('owner')!.character!.contracts = { [quest]: { offerId: offer, issuer: 'issuer', boardLocation: 'hearth', acceptedAt: 12, expiresAt: 100, progress: 1, gold: totalGold } };
  return enrollFantasyPartyContract(before, after, 'owner', quest, snapshot);
}
function completed(profiles: Map<string, ReturnType<typeof person>>, totalGold = 10) {
  const after = structuredClone(profiles), c = after.get('owner')!.character!;
  c.quests = c.quests.filter(id => id !== quest); c.completed.push(quest); delete c.contracts![quest]; c.gold += totalGold + 2;
  return after;
}

test('accept enrolls same-scene members without class gates or a second public claim', () => {
  const result = accepted(); assert.equal(result.error, undefined); assert.equal(result.changed, true);
  for (const id of ['owner', 'priest', 'rogue']) { assert.ok(result.profiles.get(id)!.character!.quests.includes(quest)); assert.equal(result.profiles.get(id)!.character!.contracts![quest].offerId, offer); }
  assert.equal(fantasyPartyContractSupport(result.profiles, 'priest', quest), 'owner');
  assert.equal(fantasyPartyContractSupport(result.profiles, 'owner', quest), undefined);
});

test('only scene participants share the actual grant equally, injured opt-outs elsewhere keep shares and replays cannot pay twice', () => {
  const enrolled = accepted(), original = structuredClone(enrolled.profiles);
  const marked = markFantasyPartyContractParticipation(enrolled.profiles, 'owner', quest, ['owner', 'priest', 'rogue'], snapshot);
  marked.profiles.get('priest')!.character!.hp = 0;
  marked.profiles.get('priest')!.character!.location = 'mooncity';
  const after = completed(marked.profiles), untouched = structuredClone(after), result = settleFantasyPartyContract(marked.profiles, after, 'owner', quest, snapshot);
  assert.equal(result.error, undefined); assert.deepEqual(result.shares, { owner: 4, priest: 4, rogue: 4 });
  assert.equal(result.profiles.get('owner')!.character!.gold, 104); assert.equal(result.profiles.get('priest')!.character!.gold, 104); assert.equal(result.profiles.get('rogue')!.character!.gold, 104);
  assert.equal([...result.profiles.values()].reduce((sum, p) => sum + p.character!.gold, 0), 312);
  assert.equal(result.profiles.get('priest')!.character!.contracts![quest], undefined);
  assert.ok(result.profiles.get('priest')!.character!.completed.includes(quest));
  assert.equal(result.profiles.get('priest')!.character!.xp, FANTASY_QUESTS.find(entry => entry.id === quest)!.xp);
  const replay = settleFantasyPartyContract(marked.profiles, result.profiles, 'owner', quest, snapshot);
  assert.equal(replay.changed, false); assert.deepEqual(replay.profiles, result.profiles);
  assert.deepEqual(enrolled.profiles.get('owner'), original.get('owner'));
  assert.deepEqual(after, untouched);
});

test('mere enrollment earns no share, and departed, dead or replacement lives cannot collect', () => {
  for (const condition of ['unmarked', 'left', 'dead', 'generation', 'new-life']) {
    let profiles = accepted().profiles;
    if (condition !== 'unmarked') profiles = markFantasyPartyContractParticipation(profiles, 'owner', quest, ['owner', 'priest', 'rogue'], snapshot).profiles;
    const party = structuredClone(snapshot), p = profiles.get('priest')!;
    if (condition === 'left') party.parties[0].members = ['owner', 'rogue'];
    if (condition === 'dead') p.death = {} as any;
    if (condition === 'generation') p.generation = 2;
    if (condition === 'new-life') p.character!.lifeStartedAt = 13;
    const result = settleFantasyPartyContract(profiles, completed(profiles), 'owner', quest, party);
    assert.equal(result.error, undefined, condition); assert.equal(result.shares?.priest, undefined, condition);
    assert.equal(result.profiles.get('priest')!.character!.gold, 100, condition);
    assert.equal(Object.values(result.shares!).reduce((sum, gold) => sum + gold, 0), 12, condition);
  }
});

test('failed acceptance, unsuccessful completion and forged budgets never mutate the input maps', () => {
  const state = accepted(), before = structuredClone(state.profiles);
  assert.equal(enrollFantasyPartyContract(before, before, 'owner', quest, snapshot).changed, false);
  assert.equal(settleFantasyPartyContract(before, before, 'owner', quest, snapshot).changed, false);
  const after = completed(before); (before.get('owner')!.character as any).contractParties[quest].totalGold = 999;
  const result = settleFantasyPartyContract(before, after, 'owner', quest, snapshot);
  assert.equal(result.changed, false); assert.ok(result.error); assert.deepEqual(result.profiles, after);
});

test('saved party-contract records reject unknown quests, polluted fields, duplicate members and wrong own lives', () => {
  const p = person('warrior'), c = p.character!, q = FANTASY_QUESTS[0].id;
  assert.equal(validFantasyPartyContracts(c), true);
  c.quests.push(q); c.contracts = { [q]: { offerId: offer, issuer: 'issuer', boardLocation: 'hearth', acceptedAt: 12, expiresAt: 100, progress: 0, gold: 10 } };
  (c as any).contractParties = { [q]: { offer, party: 'party', owner: 'owner', members: [{ user: 'owner', generation: 1, lifeStartedAt: 12 }], totalGold: 10 } };
  assert.equal(validFantasyPartyContracts(c, { user: 'owner', generation: 1 }), true);
  for (const corrupt of [
    (c: any) => c.contractParties[q].members.push({ ...c.contractParties[q].members[0] }),
    (c: any) => c.contractParties[q].members = [null],
    (c: any) => c.contractParties[q].members[0].lifeStartedAt++,
    (c: any) => c.contractParties[q].members[0].reward = 99,
    (c: any) => c.contractParties[q].members[0].user = '__proto__',
    (c: any) => c.contractParties[q].totalGold++,
    (c: any) => c.contractParties[q].owner = 'outsider',
    (c: any) => c.contractParties[q].paid = true,
    (c: any) => c.contractParties['invented-quest'] = c.contractParties[q],
    (c: any) => c.contractParties = JSON.parse('{"__proto__":{}}'),
  ]) { const bad = structuredClone(c); corrupt(bad); assert.equal(validFantasyPartyContracts(bad, { user: 'owner', generation: 1 }), false); }
  assert.equal(validFantasyPartyContracts(c, { user: 'owner', generation: 2 }), false);
});

test('late scene joiners enroll without a new claim and departed/rejoining members lose old scene proof', () => {
  const marked = markFantasyPartyContractParticipation(accepted().profiles, 'owner', quest, ['owner', 'priest', 'rogue'], snapshot);
  const profiles = new Map(marked.profiles); profiles.set('late', person('bard'));
  const party = { parties: [{ id: 'party', leader: 'owner', members: ['owner', 'priest', 'late'] }] };
  const refreshed = refreshFantasyPartyContract(profiles, 'owner', quest, party);
  assert.equal(refreshed.changed, true); assert.equal(fantasyPartyContractSupport(refreshed.profiles, 'late', quest), 'owner');
  assert.equal(refreshed.profiles.get('rogue')!.character!.quests.includes(quest), false);
  assert.equal((refreshed.profiles.get('late')!.character as any).contractParties[quest].members.find((m: any) => m.user === 'late').participated, undefined);
  const final = markFantasyPartyContractParticipation(refreshed.profiles, 'owner', quest, ['late'], party).profiles;
  const paid = settleFantasyPartyContract(final, completed(final), 'owner', quest, party);
  assert.deepEqual(paid.shares, { owner: 4, late: 4, priest: 4 });
  assert.equal(refreshFantasyPartyContract(paid.profiles, 'owner', quest, party).changed, false);
  const rejoined = refreshFantasyPartyContract(refreshed.profiles, 'owner', quest, snapshot);
  assert.equal((rejoined.profiles.get('rogue')!.character as any).contractParties[quest].members.find((m: any) => m.user === 'rogue').participated, undefined);
});

test('full contract payout including bonus is conserved with one-gold rounding and implausible deltas reject atomically', () => {
  const profiles = markFantasyPartyContractParticipation(accepted(9).profiles, 'owner', quest, ['owner', 'priest', 'rogue'], snapshot).profiles;
  const after = completed(profiles, 9), result = settleFantasyPartyContract(profiles, after, 'owner', quest, snapshot);
  assert.deepEqual(result.shares, { owner: 4, priest: 4, rogue: 3 });
  assert.equal(Object.values(result.shares!).reduce((sum, gold) => sum + gold, 0), 11);
  for (const delta of [8, 9.5, 1010, Infinity]) {
    const bad = completed(profiles, 9); bad.get('owner')!.character!.gold = 100 + delta;
    const untouched = structuredClone(bad), rejected = settleFantasyPartyContract(profiles, bad, 'owner', quest, snapshot);
    assert.equal(rejected.changed, false); assert.ok(rejected.error); assert.deepEqual(bad, untouched);
  }
});

test('race and prerequisite failures skip companions without rejecting owner acceptance, while unrelated jobs remain allowed', () => {
  for (const questId of ['approved-quest-deerkin-trail', 'underworld-nyx-wrapped-record']) {
    const canonical = FANTASY_QUESTS.find(entry => entry.id === questId)!;
    const before = new Map([['owner', person('thief')], ['priest', person('priest')], ['rogue', person('rogue')]]);
    for (const p of before.values()) { p.character!.race = canonical.races?.[0] ?? 'human'; p.character!.completed = [...canonical.requiresCompleted ?? []]; }
    const rejected = before.get('rogue')!.character!;
    if (canonical.races) rejected.race = 'human'; else rejected.completed = [];
    const after = structuredClone(before), c = after.get('owner')!.character!;
    c.quests.push(questId); c.contracts = { [questId]: { offerId: offer, issuer: 'issuer', boardLocation: 'hearth', acceptedAt: 12, expiresAt: 100, progress: 0, gold: 10 } };
    const result = enrollFantasyPartyContract(before, after, 'owner', questId, snapshot);
    assert.equal(result.error, undefined); assert.equal(result.changed, true);
    assert.ok(result.profiles.get('owner')!.character!.quests.includes(questId));
    assert.ok(result.profiles.get('priest')!.character!.quests.includes(questId), 'job restrictions are ignored for valid support');
    assert.equal(result.profiles.get('rogue')!.character!.quests.includes(questId), false);
    assert.equal(result.profiles.get('rogue')!.character!.contracts?.[questId], undefined);
    const refresh = refreshFantasyPartyContract(result.profiles, 'owner', questId, snapshot);
    assert.equal(refresh.error, undefined); assert.equal(refresh.profiles.get('rogue')!.character!.quests.includes(questId), false);
  }
});

test('shared completion awards ordinary quest XP once through leveling without reviving an injured supporter', () => {
  const profiles = markFantasyPartyContractParticipation(accepted().profiles, 'owner', quest, ['owner', 'priest', 'rogue'], snapshot).profiles;
  const priest = profiles.get('priest')!.character!;
  Object.assign(priest, { xp: 29, level: 1, hp: 0, mp: 1, downed: { since: 10, expiresAt: 20 } });
  const result = settleFantasyPartyContract(profiles, completed(profiles), 'owner', quest, snapshot), awarded = result.profiles.get('priest')!.character!;
  assert.equal(result.error, undefined); assert.equal(awarded.level, 2); assert.equal(awarded.xp, 29 + FANTASY_QUESTS.find(entry => entry.id === quest)!.xp - 30);
  assert.equal(awarded.hp, 0); assert.equal(awarded.mp, 1); assert.deepEqual(awarded.downed, priest.downed);
  const replay = settleFantasyPartyContract(profiles, result.profiles, 'owner', quest, snapshot);
  assert.equal(replay.changed, false); assert.equal(replay.profiles.get('priest')!.character!.xp, awarded.xp); assert.equal(replay.profiles.get('priest')!.character!.level, 2);
  assert.equal(result.profiles.get('owner')!.character!.xp, profiles.get('owner')!.character!.xp, 'owner XP belongs to the engine action');
});

test('owner abandonment, death, new life and disband clean unpaid support without income or erasing solo/new claims', () => {
  for (const condition of ['abandon', 'death', 'new-life', 'disband', 'changed-offer']) {
    const profiles = accepted().profiles, party = structuredClone(snapshot), owner = profiles.get('owner')!, c = owner.character!;
    if (condition === 'abandon') { c.quests = []; delete c.contracts![quest]; }
    if (condition === 'death') owner.death = {} as any;
    if (condition === 'new-life') { owner.generation = 2; c.lifeStartedAt = 13; }
    if (condition === 'disband') party.parties = [];
    if (condition === 'changed-offer') c.contracts![quest].offerId = 'new-offer';
    const result = reconcileFantasyPartyContracts(profiles, party);
    assert.equal(result.error, undefined, condition); assert.equal(result.changed, true, condition);
    for (const id of ['owner', 'priest', 'rogue']) assert.equal((result.profiles.get(id)!.character as any).contractParties?.[quest], undefined, condition);
    for (const id of ['priest', 'rogue']) { const support = result.profiles.get(id)!.character!; assert.equal(support.contracts?.[quest], undefined, condition); assert.equal(support.quests.includes(quest), false, condition); assert.equal(support.gold, 100, condition); }
    if (condition === 'disband') { assert.ok(result.profiles.get('owner')!.character!.quests.includes(quest)); assert.equal(result.profiles.get('owner')!.character!.contracts![quest].offerId, offer); }
    if (condition === 'changed-offer') assert.equal(result.profiles.get('owner')!.character!.contracts![quest].offerId, 'new-offer');
    if (condition === 'death' || condition === 'new-life') { assert.equal(result.profiles.get('owner')!.character!.contracts?.[quest], undefined); assert.equal(result.profiles.get('owner')!.character!.quests.includes(quest), false); }
    assert.equal(reconcileFantasyPartyContracts(result.profiles, party).changed, false);
  }
});

test('support abandonment and departure revoke roster proof; unrelated replacement claims and paid histories survive', () => {
  for (const condition of ['abandon', 'left', 'death', 'new-life']) {
    const profiles = markFantasyPartyContractParticipation(accepted().profiles, 'owner', quest, ['owner', 'priest', 'rogue'], snapshot).profiles, party = structuredClone(snapshot), priest = profiles.get('priest')!;
    if (condition === 'abandon') { priest.character!.quests = []; delete priest.character!.contracts![quest]; }
    if (condition === 'left') party.parties[0].members = ['owner', 'rogue'];
    if (condition === 'death') priest.death = {} as any;
    if (condition === 'new-life') { priest.generation = 2; priest.character!.lifeStartedAt = 13; priest.character!.contracts![quest].offerId = 'independent-offer'; }
    const result = reconcileFantasyPartyContracts(profiles, party);
    assert.equal(result.error, undefined); assert.equal((result.profiles.get('priest')!.character as any).contractParties?.[quest], undefined);
    for (const id of ['owner', 'rogue']) assert.equal((result.profiles.get(id)!.character as any).contractParties[quest].members.some((member: any) => member.user === 'priest'), false);
    if (condition === 'new-life') assert.equal(result.profiles.get('priest')!.character!.contracts![quest].offerId, 'independent-offer');
    assert.equal(result.profiles.get('priest')!.character!.gold, 100);
  }
  const profiles = markFantasyPartyContractParticipation(accepted().profiles, 'owner', quest, ['owner', 'priest', 'rogue'], snapshot).profiles;
  const paid = settleFantasyPartyContract(profiles, completed(profiles), 'owner', quest, snapshot).profiles;
  assert.equal(reconcileFantasyPartyContracts(paid, { parties: [] }).changed, false);
});

test('partial maps and completed-but-unpaid owner records are preserved for authoritative settle-first ordering', () => {
  const profiles = accepted().profiles, partial = new Map(profiles); partial.delete('owner');
  assert.equal(reconcileFantasyPartyContracts(partial, snapshot).changed, false);
  const ready = completed(profiles); assert.equal(reconcileFantasyPartyContracts(ready, snapshot).changed, false);
  const changed = reconcileFantasyPartyContracts(new Map([['owner', profiles.get('owner')!]]), snapshot);
  assert.equal(changed.changed, false);
});

test('unpaid nonrecipients can later accept a different offer for the same quest without old payouts replaying', () => {
  const profiles = markFantasyPartyContractParticipation(accepted().profiles, 'owner', quest, ['owner'], snapshot).profiles;
  const paid = settleFantasyPartyContract(profiles, completed(profiles), 'owner', quest, snapshot);
  assert.equal(paid.error, undefined); assert.equal((paid.profiles.get('priest')!.character as any).contractParties?.[quest], undefined);
  const next = structuredClone(paid.profiles), c = next.get('priest')!.character!;
  assert.equal(c.completed.includes(quest), false); c.quests.push(quest);
  c.contracts = { [quest]: { offerId: 'new-solo-offer', issuer: 'issuer', boardLocation: 'hearth', acceptedAt: 20, expiresAt: 100, progress: 0, gold: 20 } };
  assert.equal(validFantasyPartyContracts(c, { user: 'priest', generation: 1 }), true);
  const replay = settleFantasyPartyContract(profiles, next, 'owner', quest, snapshot);
  assert.equal(replay.changed, false); assert.deepEqual(replay.profiles, next); assert.equal(replay.profiles.get('priest')!.character!.gold, 100);
  const cleaned = reconcileFantasyPartyContracts(next, snapshot);
  assert.equal(cleaned.profiles.get('priest')!.character!.contracts![quest].offerId, 'new-solo-offer');
});
