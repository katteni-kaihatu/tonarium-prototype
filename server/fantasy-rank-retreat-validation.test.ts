import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { FANTASY_JOBS, FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { fantasyPriestServiceQuest, fantasyPriestGrowthStatus } from '../shared/fantasy-priest-growth.ts';
import { fantasyRankBookChoices, fantasyRankBookClaimError } from '../shared/fantasy-rank-rewards.ts';
import { fantasyTempleLibraryHoldings } from '../shared/fantasy-town.ts';
import { fantasyQuestRecordEligible } from '../shared/fantasy-access.ts';
import { NPC_PUBLIC } from '../shared/npc.ts';
import { FantasyConversationActions } from './fantasy-conversation-actions.ts';
import { handleFantasyNpcRankBenefits, clearFantasyNpcRankBenefits } from './npc-rank-benefits.ts';
import { NpcTransactions } from './npc-transactions.ts';
import { fantasyEconomyState, newFantasyEconomyLedger } from '../shared/fantasy-economy.ts';

function profile(name: string, priest = false) {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name, source: 'human', gender: 'female' }, () => .99).profile;
  const c = p.character!; c.hour = 8; c.job = priest ? 'priest' : 'warrior'; c.jobXp[c.job] = 0; c.gold = 10000; c.fatigue = 80;
  c.guildProgress = { version: 1, grade: 6, completedAtGrade: 0, creditedQuests: [] };
  if (priest) {
    c.jobXp = Object.fromEntries(FANTASY_JOBS.map(job => [job.id, 0]));
    c.completed = FANTASY_QUESTS.filter(q => fantasyPriestServiceQuest(q.id) && !q.requiresCompleted?.length && fantasyQuestRecordEligible(c, q)).slice(0, 25).map(q => q.id);
    const service = [...c.completed];
    c.priestGrowth = { version: 1, startedAt: 8, service, doctrine: [], pilgrimage: ['hearth'], prayerDays: [], prayerTemples: {}, branchChanges: 0,
      vows: service.map(quest => ({ quest, acceptedAt: 8, hour: 8, location: 'hearth', outcome: 'fulfilled' })) };
    assert.equal(fantasyPriestGrowthStatus(c).clergyGrade, 4);
  }
  c.hp = Math.min(c.hp, fantasyStats(c).hp); c.mp = Math.min(c.mp, fantasyStats(c).mp);
  return p;
}
function fixture(t: TestContext, priest = false, retreat = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-rank-retreat-'));
  t.after(() => { const target = path.resolve(directory); assert.equal(path.dirname(target), path.resolve(os.tmpdir())); assert.ok(path.basename(target).startsWith('fantasy-rank-retreat-')); fs.rmSync(target, { recursive: true, force: true }); });
  const file = path.join(directory, 'save.json');
  const profiles = Object.fromEntries(['a', 'b', 'c'].map(user => {
    const p = profile(user, priest); if (retreat) { p.character!.location = 'retreat-mirrorlake'; p.character!.visited.push('retreat-mirrorlake'); }
    return [user, p];
  }));
  fs.writeFileSync(file, JSON.stringify(profiles)); let hour = 8, fail = false;
  const options = { worldHour: () => hour, ambush: true, onError: () => {}, save: (file: string, data: string) => { if (fail) throw new Error('disk full'); fs.writeFileSync(file, data); } };
  let store = new FantasyStore(file, options); assert.equal(store.loadError, undefined);
  return { file, get store() { return store; }, at(value: number, online = ['a', 'b', 'c']) { hour = value; return store.tick(new Set(online)); }, fail(value: boolean) { fail = value; }, reload() { store = new FantasyStore(file, options); assert.equal(store.loadError, undefined); }, apply(user: string, action: Parameters<FantasyStore['apply']>[2]) { return store.apply(user, store.profile(user).revision, action, () => .001); } };
}

test('priest4 manuals and three advanced doctrine books are offered only at the temple', t => {
  const f = fixture(t, true), c = f.store.profile('a').character!;
  assert.equal(fantasyTempleLibraryHoldings(c).length, 3);
  const skill = fantasyRankBookChoices(c)[0]; assert.ok(skill);
  const below = structuredClone(c); below.priestGrowth!.vows.pop();
  assert.equal(fantasyPriestGrowthStatus(below).clergyGrade, 3); assert.ok(fantasyRankBookClaimError(below, 'priest', skill.id));
  const closed = { ...c, hour: 27 }; assert.ok(fantasyRankBookClaimError(closed, 'priest', skill.id));
  const claim = f.apply('a', { type: 'rankBookClaim', source: 'priest', skill: skill.id }); assert.equal(claim.error, undefined);
  f.reload(); assert.equal(f.store.profile('a').character!.rankBookRewards!.priest!.skill, skill.id);
  assert.ok(f.apply('a', { type: 'rankBookClaim', source: 'priest', skill: skill.id }).error);
});

test('temple has exactly two shared beds and an eight-hour daily reservation survives restart', t => {
  const f = fixture(t, true), action = { type: 'rankBenefitClaim', benefit: 'temple-lodging' } as const;
  assert.equal(f.apply('a', action).error, undefined); assert.equal(f.apply('b', action).error, undefined);
  assert.equal(f.store.profile('a').activity!.endsAt, 16); assert.equal(f.store.templeBedsAvailable('c'), 0);
  const before = f.store.profile('c'); assert.ok(f.apply('c', action).error); assert.deepEqual(f.store.profile('c'), before);
  f.reload(); assert.equal(f.store.templeBedsAvailable('c'), 0); f.at(16);
  assert.equal(f.store.profile('a').activity, undefined); assert.equal(f.store.profile('a').character!.rankBenefits!.claims['temple-lodging'], 0);
  assert.ok(f.apply('a', action).error); assert.equal(f.store.templeBedsAvailable('c'), 2);
  f.at(32); assert.equal(f.apply('a', action).error, undefined);
});

test('failed manual save changes neither reward record nor inventory and succeeds once after retry', t => {
  const f = fixture(t), skill = fantasyRankBookChoices(f.store.profile('a').character!)[0];
  const before = f.store.profile('a'), bytes = fs.readFileSync(f.file, 'utf8'); f.fail(true);
  assert.ok(f.apply('a', { type: 'rankBookClaim', source: 'adventurer', skill: skill.id }).error);
  assert.deepEqual(f.store.profile('a'), before); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  f.fail(false); assert.equal(f.apply('a', { type: 'rankBookClaim', source: 'adventurer', skill: skill.id }).error, undefined);
  f.reload(); assert.equal(f.store.profile('a').character!.rankBookRewards!.adventurer!.skill, skill.id);
});

test('retreat camps are monster-free and remember continuous party company exactly once after restart', t => {
  const f = fixture(t, false, true); f.at(8);
  assert.ok(f.store.savePartyState({ parties: [{ members: ['a', 'b'] }] }));
  assert.equal(f.apply('a', { type: 'rest' }).error, undefined); assert.equal(f.store.profile('a').activity!.retreatCamp!.participants.length, 1);
  f.at(12); f.reload(); f.at(16);
  const result = f.store.profile('a'); assert.equal(result.event, null); assert.equal(result.activity, undefined);
  assert.deepEqual(result.character!.retreatMemories![0].companions, [{ kind: 'player', name: 'b' }]);
  f.reload(); f.at(16); assert.equal(f.store.profile('a').character!.retreatMemories!.length, 1);
});

test('a party member who leaves during retreat camping and returns before completion earns no memory', t => {
  const f = fixture(t, false, true); f.at(8);
  assert.ok(f.store.savePartyState({ parties: [{ members: ['a', 'b'] }] }));
  assert.equal(f.apply('a', { type: 'rest' }).error, undefined); f.at(10);
  assert.ok(f.store.savePartyState({ parties: [{ members: ['a'] }] }));
  f.at(12); assert.ok(f.store.savePartyState({ parties: [{ members: ['a', 'b'] }] }));
  f.at(16); assert.equal(f.store.profile('a').character!.retreatMemories?.length ?? 0, 0);
});

test('rank NPC manual choice and confirmation use current locale and current life in all three languages', () => {
  const speaker = NPC_PUBLIC.find(n => n.homeLocation === 'hearth' && n.building === 'guild')!.id;
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const p = profile('Speaker'), actions = new FantasyConversationActions(), user = `rank-${locale}`;
    const context = { user, speaker, locale, profile: p };
    const text = { ko: '기술서 목록', en: 'skill book list', ja: '技能書一覧' }[locale];
    const list = handleFantasyNpcRankBenefits({ ...context, text }, actions); assert.equal(list.handled, true); assert.match(list.text!, /1\./);
    const selected = handleFantasyNpcRankBenefits({ ...context, text: '1' }, actions); assert.equal(selected.handled, true);
    let called = 0;
    const confirmed = actions.confirm({ ...context, text: { ko: '네', en: 'yes', ja: 'はい' }[locale] }, (_revision, action) => {
      called++; assert.equal(action.type, 'rankBookClaim'); return applyFantasyAction(p, action);
    });
    assert.equal(called, 1); assert.ok(confirmed.result?.profile.character!.rankBookRewards!.adventurer);
    const claimed = handleFantasyNpcRankBenefits({ ...context, profile: confirmed.result!.profile, text }, actions);
    assert.doesNotMatch(claimed.text!, /1\./); clearFantasyNpcRankBenefits(user);
  }
});

test('guild stock questions use the shared ledger and cannot become a fixed reward bundle in any locale', () => {
  const speaker = NPC_PUBLIC.find(n => n.homeLocation === 'hearth' && n.building === 'guild')!.id;
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const p = profile('Shopper'), actions = new FantasyConversationActions(), transactions = new NpcTransactions();
    const state = fantasyEconomyState(newFantasyEconomyLedger(), new Map([['shopper', p]]), 'shopper', { hour: 8, peers: ['shopper'] });
    const text = { ko: '보급품 재고', en: 'supplies stock', ja: '補給品の在庫' }[locale];
    const context = { user: 'shopper', speaker, locale, profile: p, text, dynamicFacts: { hour: 8, location: 'hearth', shops: state.shops, rumors: [] } };
    assert.equal(handleFantasyNpcRankBenefits(context, actions).handled, false);
    const reply = transactions.chat(context, actions); assert.equal(reply.handled, true);
    const lots = state.shops.find(s => s.building === 'guild')!.lots;
    for (const lot of lots) assert.ok(reply.text!.includes(`${lot.unitPrice}G`));
    assert.equal(actions.confirm({ ...context, text: 'yes' }, () => { throw new Error('An information request cannot buy goods'); }).handled, false);
  }
});

test('guild shared stock purchase rolls back disk failure and competing stale approvals survive reload safely', t => {
  const f = fixture(t), context = { session: 'rank-stock', publicSession: true, peers: ['a', 'b', 'c'] };
  assert.equal(f.store.realmRequest('a', { domain: 'economy', command: { type: 'sync' } }, context).error, undefined);
  const shop = f.store.realmState('a', context).economy.shops.find(s => s.building === 'guild')!, lot = shop.lots[0];
  const command = { type: 'shopBuy', building: 'guild', item: lot.item, count: lot.count, revision: shop.revision, quotedUnitPrice: lot.unitPrice } as const;
  const before = f.store.profile('a'), bytes = fs.readFileSync(f.file, 'utf8'); f.fail(true);
  assert.equal(f.store.realmRequest('a', { domain: 'economy', command }, context).error, 'save-failed');
  assert.deepEqual(f.store.profile('a'), before); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  assert.deepEqual(f.store.realmState('a', context).economy.shops.find(s => s.building === 'guild'), shop);
  f.fail(false); assert.equal(f.store.realmRequest('a', { domain: 'economy', command }, context).error, undefined);
  assert.equal(f.store.profile('a').character!.gold, before.character!.gold - lot.count * lot.unitPrice);
  f.reload(); const other = f.store.profile('b');
  assert.equal(f.store.realmRequest('b', { domain: 'economy', command }, context).error, 'stale');
  assert.deepEqual(f.store.profile('b'), other);
  assert.equal(f.store.realmState('b', context).economy.shops.find(s => s.building === 'guild')!.lots.some(l => l.item === lot.item), false);
  f.at(32); assert.ok(f.store.realmState('b', context).economy.shops.find(s => s.building === 'guild')!.lots.length >= 4);
});

test('a failed retreat completion save preserves the unfinished camp and records its memory once on retry', t => {
  const f = fixture(t, false, true); f.at(8); assert.ok(f.store.savePartyState({ parties: [{ members: ['a', 'b'] }] }));
  assert.equal(f.apply('a', { type: 'rest' }).error, undefined); const before = f.store.profile('a'), bytes = fs.readFileSync(f.file, 'utf8');
  f.fail(true); assert.ok(f.at(16).some(update => update.error)); assert.deepEqual(f.store.profile('a'), before); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  f.fail(false); f.at(16); assert.equal(f.store.profile('a').character!.retreatMemories!.length, 1);
  f.reload(); f.at(16); assert.equal(f.store.profile('a').character!.retreatMemories!.length, 1);
});

test('legacy personal guild-supplies claims load unchanged but cannot generate another bundle', t => {
  const f = fixture(t), legacy = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  const profiles = legacy.profiles ?? legacy; profiles.a.character.rankBenefits = { claims: { 'guild-supplies': 0 } };
  fs.writeFileSync(f.file, JSON.stringify(legacy)); f.reload(); const before = f.store.profile('a');
  assert.deepEqual(before.character!.rankBenefits, { claims: { 'guild-supplies': 0 } });
  assert.ok(f.apply('a', { type: 'rankBenefitClaim', benefit: 'guild-supplies' }).error); assert.deepEqual(f.store.profile('a'), before);
});

test('a party disconnect at the same world minute invalidates continuous company before reconnect', t => {
  const f = fixture(t, false, true); f.at(8); assert.ok(f.store.savePartyState({ parties: [{ members: ['a', 'b'] }] }));
  assert.equal(f.apply('a', { type: 'rest' }).error, undefined); f.at(10); f.at(10, ['a', 'c']); f.at(12); f.at(16);
  assert.equal(f.store.profile('a').character!.retreatMemories?.length ?? 0, 0);
});
