import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { FANTASY_QUESTS } from './fantasy-data.ts';
import type { FantasyProfile, FantasyQuest } from './fantasy.ts';
import type { FantasyContractGrant } from './fantasy-contracts.ts';
import { applyFantasyUnderworld, creditFantasyUnderworldCompletion, fantasyUnderworldActionValid, fantasyUnderworldState, validFantasyUnderworld } from './fantasy-underworld.ts';
import { fantasyBlackMarketOpening } from './fantasy-black-market.ts';
import { FANTASY_JOB_DISCOVERY_BOOKS } from './fantasy-job-discovery.ts';
import { FANTASY_RELICS } from './fantasy-relic-catalog.ts';

function profile(): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: '影の旅人' }, () => .5).profile;
  Object.assign(p.character!, { job: 'thief', location: 'hearth', hour: 100, inventory: { silk: 4, crystal: 4, gem: 4 }, gold: 500 });
  return p;
}
function earn(p: FantasyProfile, count = 1): FantasyProfile {
  let next = structuredClone(p);
  for (let i = 0; i < count; i++) {
    const q: FantasyQuest = { id: `underworld-test-${i}`, name: '記録の照合', description: '記録', giver: 'hearth', destination: 'hearth', item: 'silk', count: 1, gold: 5, xp: 1, issuer: 'hearth-nyx', jobs: ['thief'] };
    FANTASY_QUESTS.push(q);
    try {
      const before = structuredClone(next), c = before.character!, grant: FantasyContractGrant = { offerId: `receipt-${i}`, issuer: 'hearth-nyx', boardLocation: 'hearth', acceptedAt: 80, expiresAt: 120, progress: 0, gold: 5 };
      c.quests.push(q.id); (c.contracts ??= {})[q.id] = grant;
      next = structuredClone(before); next.character!.quests = next.character!.quests.filter(id => id !== q.id); next.character!.completed.push(q.id); delete next.character!.contracts![q.id];
      assert.equal(creditFantasyUnderworldCompletion(before, next, q.id, grant), true);
    } finally { FANTASY_QUESTS.splice(FANTASY_QUESTS.indexOf(q), 1); }
  }
  return next;
}

test('completion credit requires accepted underworld work and is idempotent independently of XP and notoriety', () => {
  const p = profile(), c = p.character!, before = structuredClone(p);
  c.jobXp.thief = 10000;
  assert.equal(creditFantasyUnderworldCompletion(before, p, 'herb-delivery', undefined), false);
  assert.equal(c.underworld, undefined);
  const next = earn(p);
  assert.equal(next.character!.underworld!.trust, 20);
  assert.equal(next.character!.underworld!.merit, 20);
  assert.equal(fantasyUnderworldState(next.character!).tier, 2);
  assert.equal(creditFantasyUnderworldCompletion(next, next, 'underworld-test-0', undefined), false);
  assert.equal(next.character!.jobXp.thief, 10000);
});

test('receipts cannot cross life identity or be minted from cancelled or ordinary guild quests', () => {
  const q: FantasyQuest = { id: 'underworld-guard-test', name: '記録', description: '記録', giver: 'hearth', destination: 'hearth', item: 'silk', count: 1, gold: 5, xp: 1, issuer: 'hearth-nyx', jobs: ['thief'] };
  FANTASY_QUESTS.push(q);
  try {
    const p = profile(), grant: FantasyContractGrant = { offerId: 'guard-receipt', issuer: 'hearth-nyx', boardLocation: 'hearth', acceptedAt: 80, expiresAt: 120, progress: 0, gold: 5 };
    p.character!.quests = [q.id]; p.character!.contracts = { [q.id]: grant };
    const next = structuredClone(p); next.character!.completed = [q.id]; next.character!.quests = []; delete next.character!.contracts![q.id];
    for (const alter of [(n: FantasyProfile) => { n.generation = 2; }, (n: FantasyProfile) => { n.character!.name = '別人'; }, (n: FantasyProfile) => { n.character!.completed = []; }, (n: FantasyProfile) => { n.character!.hour = 120; }, (n: FantasyProfile) => { n.character!.hour = 121; }]) {
      const bad = structuredClone(next); alter(bad); assert.equal(creditFantasyUnderworldCompletion(p, bad, q.id, grant), false);
    }
    assert.equal(creditFantasyUnderworldCompletion(p, next, q.id, { ...grant, offerId: 'forged' }), false);
    q.jobs = ['adventurer']; q.issuer = 'hearth-guild';
    assert.equal(creditFantasyUnderworldCompletion(p, next, q.id, grant), false);
  } finally { FANTASY_QUESTS.splice(FANTASY_QUESTS.indexOf(q), 1); }
});

test('milestone rewards consume costs once and preserve progress through job changes', () => {
  const p = earn(profile(), 14), c = p.character!;
  assert.equal(fantasyUnderworldState(c).tier, 5);
  assert.equal(validFantasyUnderworld(c), true);
  const result = applyFantasyUnderworld(p, { type: 'underworldClaim', reward: 'supplies', npc: 'hearth-nyx' }, { hour: 100, realm: 'test' });
  assert.equal(result.error, undefined); assert.equal(result.changed, true);
  assert.equal(result.profile.character!.inventory.potion, 2);
  assert.equal(result.profile.character!.inventory.antidote, 1);
  assert.equal(result.profile.character!.underworld!.merit, 260);
  assert.equal(p.character!.inventory.potion, undefined);
  assert.equal(applyFantasyUnderworld(result.profile, { type: 'underworldClaim', reward: 'supplies', npc: 'hearth-nyx' }, { hour: 100, realm: 'test' }).changed, false);
  const former = structuredClone(result.profile); former.character!.job = 'adventurer';
  const blocked = applyFantasyUnderworld(former, { type: 'underworldClaim', reward: 'folio', npc: 'hearth-nyx' }, { hour: 100, realm: 'test' });
  assert.equal(blocked.changed, false); assert.deepEqual(former.character!.underworld, result.profile.character!.underworld);
});

test('claim rejects forged venue, closed market, missing materials, full bags and repeat folio ownership atomically', () => {
  const p = earn(profile(), 14), command = { type: 'underworldClaim' as const, reward: 'folio' as const, npc: 'hearth-nyx' };
  for (const alter of [(n: FantasyProfile) => { n.character!.inventory.crystal = 0; }, (n: FantasyProfile) => { n.character!.inventory.ore = 10000; }, (n: FantasyProfile) => { n.character!.inventory['black-skill-folio'] = 1; }, (n: FantasyProfile) => { n.character!.location = 'mooncity'; }, (n: FantasyProfile) => { n.combatId = 'combat'; }]) {
    const bad = structuredClone(p); alter(bad); const original = structuredClone(bad);
    assert.equal(applyFantasyUnderworld(bad, command, { hour: 100, realm: 'test' }).changed, false); assert.deepEqual(bad, original);
  }
  assert.equal(applyFantasyUnderworld(p, { ...command, npc: 'hearth-elder' }, { hour: 100, realm: 'test' }).changed, false);
  assert.equal(applyFantasyUnderworld(p, { type: 'underworldClaim', reward: 'folio' }, { hour: 100, realm: 'test' }).changed, false);
  const good = applyFantasyUnderworld(p, command, { hour: 100, realm: 'test' });
  assert.equal(good.changed, true); assert.equal(good.profile.character!.inventory['black-skill-folio'], 1);
  assert.deepEqual(good.profile.character!.learnedSkills, p.character!.learnedSkills);
});

test('wire action and persisted progress reject forged rank, duplicated receipts and unknown rewards', () => {
  assert.equal(fantasyUnderworldActionValid({ type: 'underworldClaim', reward: 'folio', npc: 'hearth-nyx' }), true);
  for (const value of [{ type: 'underworldClaim', reward: 'skill' }, { type: 'underworldClaim', reward: 'folio', merit: 999 }, { type: 'underworldClaim', reward: 'folio', npc: 12 }]) assert.equal(fantasyUnderworldActionValid(value), false);
  const p = earn(profile()); assert.equal(validFantasyUnderworld(p.character!), true);
  p.character!.underworld!.trust = 280; assert.equal(validFantasyUnderworld(p.character!), false);
  p.character!.underworld!.trust = 20; p.character!.underworld!.receipts.push(p.character!.underworld!.receipts[0]); assert.equal(validFantasyUnderworld(p.character!), false);
});

test('an active known black market can issue finite literature without directly granting skills', () => {
  const p = earn(profile(), 14), c = p.character!;
  const hour = Array.from({ length: 600 }, (_, i) => 100 + i).find(hour => fantasyBlackMarketOpening('hearth', hour, 'test').open)!;
  assert.ok(hour); c.hour = hour; c.blackMarketClues = ['hearth'];
  const folio = applyFantasyUnderworld(p, { type: 'underworldClaim', reward: 'folio' }, { hour, realm: 'test' });
  assert.equal(folio.changed, true); assert.equal(folio.profile.character!.inventory['black-skill-folio'], 1);
  assert.deepEqual(folio.profile.character!.readBooks, c.readBooks);
  const relic = applyFantasyUnderworld(folio.profile, { type: 'underworldClaim', reward: 'relic' }, { hour, realm: 'test' });
  assert.equal(relic.changed, true);
  assert.equal(Object.keys(relic.profile.character!.inventory).filter(id => id.startsWith('black-study-')).length, 1);
  assert.deepEqual(relic.profile.character!.blackMarketStudies, c.blackMarketStudies);
  assert.equal(applyFantasyUnderworld(relic.profile, { type: 'underworldClaim', reward: 'relic' }, { hour, realm: 'test' }).changed, false);
});

test('literature rewards respect known paths and cannot be collected while inside a dungeon', () => {
  const p = earn(profile(), 14), c = p.character!;
  c.readBooks = Object.values(FANTASY_JOB_DISCOVERY_BOOKS);
  assert.equal(applyFantasyUnderworld(p, { type: 'underworldClaim', reward: 'folio', npc: 'hearth-nyx' }, { hour: 100, realm: 'test' }).changed, false);
  c.blackMarketStudies = FANTASY_RELICS.filter(row => row.job === c.job).map(row => row.id);
  assert.equal(applyFantasyUnderworld(p, { type: 'underworldClaim', reward: 'relic', npc: 'hearth-nyx' }, { hour: 100, realm: 'test' }).changed, false);
  c.dungeon = { active: { site: 'dummy' } } as unknown as NonNullable<typeof c.dungeon>;
  assert.equal(applyFantasyUnderworld(p, { type: 'underworldClaim', reward: 'supplies', npc: 'hearth-nyx' }, { hour: 100, realm: 'test' }).changed, false);
});
