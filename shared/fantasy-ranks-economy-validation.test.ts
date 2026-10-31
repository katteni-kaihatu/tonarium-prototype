import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, fantasySkills, newFantasyProfile } from './fantasy-engine.ts';
import { FANTASY_ITEMS, FANTASY_JOBS } from './fantasy-data.ts';
import { FANTASY_PRIEST_RANKS, fantasyPriestFaithRank } from './fantasy-priest-ranks.ts';
import { fantasyRankBookChoices, fantasyRankBookClaimError, validFantasyRankBookRewards } from './fantasy-rank-rewards.ts';
import { fantasyRankBenefitActionValid, validFantasyRankBenefits } from './fantasy-rank-benefits.ts';
import { fantasyEconomyState, newFantasyEconomyLedger, applyFantasyEconomyCommand, validFantasyEconomyLedger } from './fantasy-economy.ts';
import { fantasyPrice } from './fantasy-reputation.ts';

function person() {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Rank tester', source: 'human', gender: 'female' }, () => .99).profile;
  const c = p.character!; c.hour = 12; c.job = 'warrior'; c.gold = 10000;
  c.guildProgress = { version: 1, grade: 6, completedAtGrade: 0, creditedQuests: [] };
  return p;
}

test('clergy thresholds match adventurer difficulty while every boundary uses its own grade', () => {
  assert.deepEqual(FANTASY_PRIEST_RANKS.map(r => [r.faith, r.adventurerGrade]), [[0, 1], [45, 2], [135, 4], [225, 6], [315, 8]]);
  for (const rank of FANTASY_PRIEST_RANKS) {
    assert.equal(fantasyPriestFaithRank(rank.faith).grade, rank.grade);
    if (rank.faith) assert.equal(fantasyPriestFaithRank(rank.faith - 1).grade, rank.grade - 1);
  }
});

test('manual reward is a physical unread item, learned only after reading and once per life', () => {
  let p = person(); const skill = fantasyRankBookChoices(p.character!)[0]; assert.ok(skill);
  p.character!.guildProgress!.grade = 5; assert.ok(fantasyRankBookClaimError(p.character!, 'adventurer', skill.id));
  p.character!.guildProgress!.grade = 6;
  const claimed = applyFantasyAction(p, { type: 'rankBookClaim', source: 'adventurer', skill: skill.id });
  assert.equal(claimed.error, undefined); p = claimed.profile;
  const reward = p.character!.rankBookRewards!.adventurer!;
  assert.equal(p.character!.inventory[reward.book], 1);
  assert.equal(fantasySkills(p.character!).some(s => s.id === skill.id), false);
  assert.ok(applyFantasyAction(p, { type: 'rankBookClaim', source: 'adventurer', skill: skill.id }).error);
  const wrongJob = structuredClone(p); wrongJob.character!.job = 'mage';
  assert.ok(applyFantasyAction(wrongJob, { type: 'use', item: reward.book }).error);
  assert.equal(wrongJob.character!.inventory[reward.book], 1);
  const read = applyFantasyAction(p, { type: 'use', item: reward.book }); assert.equal(read.error, undefined);
  assert.equal(read.profile.character!.inventory[reward.book] ?? 0, 0);
  assert.ok(fantasySkills(read.profile.character!).some(s => s.id === skill.id));
  assert.ok(validFantasyRankBookRewards(read.profile.character!));
  assert.ok(applyFantasyAction(read.profile, { type: 'use', item: reward.book }).error);
});

test('manual rewards require the local institution and exclude learned or special skills', () => {
  const p = person(), c = p.character!, choices = fantasyRankBookChoices(c);
  c.location = 'greenwood'; assert.ok(fantasyRankBookClaimError(c, 'adventurer', choices[0].id));
  c.location = 'hearth'; c.travelPosition = { from: 'hearth', to: 'greenwood', fraction: .5 };
  assert.ok(fantasyRankBookClaimError(c, 'adventurer', choices[0].id)); delete c.travelPosition;
  for (const skill of choices) {
    assert.ok(FANTASY_JOBS.find(j => j.id === c.job)!.skills.some(s => s.id === skill.id));
    assert.doesNotMatch(skill.id, /^(ultimate-|job-path-|priest-path-|miracle-|saint-|last-dawn)/);
  }
  assert.equal(fantasyRankBenefitActionValid({ type: 'rankBenefitClaim', benefit: 'guild-supplies' }), false);
  assert.ok(validFantasyRankBenefits({ claims: { 'guild-supplies': 0 } }, 12));
});

test('daily guild native lots are unique, shared, bounded and valid for a full world year', () => {
  const p = person(), profiles = new Map([['a', p]]);
  for (let day = 0; day < 365; day++) {
    const hour = day * 24 + 12;
    const result = applyFantasyEconomyCommand(newFantasyEconomyLedger(), profiles, 'a', { type: 'sync' }, { hour, peers: ['a'], token: `day-${day}` });
    assert.equal(result.error, undefined);
    assert.ok(validFantasyEconomyLedger(result.ledger), `invalid ledger on day ${day}`);
    const lots = result.ledger.shops['hearth:guild'].lots;
    assert.ok(lots.length >= 4 && lots.length <= 6, `day ${day} has ${lots.length} kinds`);
    assert.equal(new Set(lots.map(l => l.item)).size, lots.length, `duplicate guild goods on day ${day}`);
    assert.ok(lots.every(l => l.count >= 1 && l.count <= 3));
  }
});

test('guild rank4 discount is combined before rounding and exhausted shared stock waits for tomorrow', () => {
  const a = person(), b = person(); a.character!.guildProgress!.grade = 3; b.character!.guildProgress!.grade = 4;
  let ledger = newFantasyEconomyLedger(), profiles = new Map([['a', a], ['b', b]]);
  const state = (actor: string, hour = 12) => fantasyEconomyState(ledger, profiles, actor, { hour, peers: ['a', 'b'] });
  const shop = state('a').shops.find(s => s.building === 'guild')!;
  const lot = shop.lots[0], discounted = state('b').shops.find(s => s.building === 'guild')!.lots.find(l => l.item === lot.item)!;
  const base = fantasyPrice(a.character!, FANTASY_ITEMS.find(item => item.id === lot.item)!.price, 'goods');
  assert.ok(lot.unitPrice <= Math.max(1, Math.floor(base * .95)));
  const normalPrices = state('a').shops.filter(s => ['market', 'tower', 'alchemist'].includes(s.building)).flatMap(s => s.lots.filter(l => l.item === lot.item && l.count > 0).map(l => l.unitPrice));
  assert.equal(discounted.unitPrice, Math.max(1, Math.floor(Math.min(base, ...normalPrices) * .95 * .98)));
  const buy = applyFantasyEconomyCommand(ledger, profiles, 'a', { type: 'shopBuy', building: 'guild', item: lot.item, count: lot.count, revision: shop.revision, quotedUnitPrice: lot.unitPrice }, { hour: 12, peers: ['a', 'b'], token: 'buy-all' });
  assert.equal(buy.error, undefined); ledger = buy.ledger; profiles = buy.profiles;
  assert.equal(state('b').shops.find(s => s.building === 'guild')!.lots.some(l => l.item === lot.item), false);
  const retry = applyFantasyEconomyCommand(ledger, profiles, 'b', { type: 'shopBuy', building: 'guild', item: lot.item, count: 1, revision: shop.revision }, { hour: 12, peers: ['a', 'b'], token: 'stale-buy' });
  assert.equal(retry.error, 'stale'); assert.deepEqual(retry.profiles, profiles);
  const tomorrow = state('b', 36).shops.find(s => s.building === 'guild')!;
  assert.ok(tomorrow.lots.length >= 4 && tomorrow.lots.length <= 6);
});
