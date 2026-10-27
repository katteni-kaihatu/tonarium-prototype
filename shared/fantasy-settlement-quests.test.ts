import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_QUESTS, FANTASY_RECIPES } from './fantasy-data.ts';
import { FANTASY_MAIN_QUESTS, FANTASY_MAIN_REVEALS, FANTASY_SIDE_QUESTS, fantasyStoryReveals } from './fantasy-second-content.ts';
import { FANTASY_SETTLEMENT_MAIN_QUESTS, FANTASY_SETTLEMENT_MAIN_REVEALS, FANTASY_SETTLEMENT_SIDE_QUESTS } from './fantasy-settlement-quests.ts';
import { NPC_PUBLIC } from './npc.ts';
import { fantasyContractCandidates, fantasyContractIssuer, fantasyContractMode, fantasyPersonalQuest } from './fantasy-contracts.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyMainProgress, fantasyMainReady, fantasyMainStage, fantasyMainTrial } from './fantasy-main-trials.ts';
import { fantasyQuestEligible } from './fantasy-access.ts';
import { fantasyHuntTargets } from './fantasy-gathering.ts';
import { fantasyGmKnowledge } from './fantasy-gm-knowledge.ts';
import { npcAllowedFacts, npcCanonicalReply } from '../server/npc.ts';
import { npcInformationSpeech } from '../server/npc-info-speech.ts';

const fresh = () => {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Quest traveler', gender: 'female', source: 'human' }, () => .5).profile;
  p.character!.hour = 12;
  return p;
};
const additions = [...FANTASY_SETTLEMENT_MAIN_QUESTS, ...FANTASY_SETTLEMENT_SIDE_QUESTS];
const legacyMain = FANTASY_MAIN_QUESTS.filter(quest => quest.chapter! <= 12).map(quest => quest.id);
const settlements = ['inkstone-city', 'pinewatch', 'reedcross', 'canopy-hall', 'mossbrook', 'leafshade', 'sunloom', 'wellrest', 'rockshade'];

test('settlement quests register once, with real local issuers and complete localized speech', () => {
  assert.equal(FANTASY_QUESTS.length, 167); assert.equal(new Set(FANTASY_QUESTS.map(quest => quest.id)).size, 167);
  assert.equal(FANTASY_MAIN_QUESTS.length, 18); assert.equal(FANTASY_MAIN_REVEALS.length, 18); assert.equal(FANTASY_SIDE_QUESTS.length, 60);
  assert.equal(additions.length, 36);
  for (const quest of additions) {
    assert.equal(FANTASY_QUESTS.filter(value => value.id === quest.id).length, 1);
    assert.ok(FANTASY_LOCATIONS.some(place => place.id === quest.giver)); assert.ok(FANTASY_LOCATIONS.some(place => place.id === quest.destination));
    assert.ok(FANTASY_ITEMS.some(item => item.id === quest.item), quest.id);
    assert.ok(NPC_PUBLIC.some(npc => npc.id === quest.issuer && npc.homeLocation === quest.giver), quest.id);
    assert.equal(fantasyContractIssuer(quest), quest.issuer);
    for (const job of quest.jobs ?? []) assert.ok(FANTASY_JOBS.some(value => value.id === job));
    for (const locale of ['ko', 'en', 'ja'] as const) {
      assert.ok(quest.names![locale].trim()); assert.ok(quest.descriptions![locale].length > 25); assert.ok(quest.dialogue[locale].length > 25);
      assert.doesNotMatch(quest.dialogue[locale], /\b(?:NPC|GM|server|player|database)\b|시스템|플레이어|サーバー|プレイヤー/);
    }
  }
  for (const id of settlements) assert.equal(FANTASY_SETTLEMENT_SIDE_QUESTS.filter(quest => quest.giver === id).length, 3, id);
});

test('existing twelve-chapter completion continues into chapter thirteen without resetting records or skipping a stage', () => {
  let p = fresh(); p.character!.completed = [...legacyMain];
  const old = [...p.character!.completed];
  for (const quest of FANTASY_SETTLEMENT_MAIN_QUESTS) {
    const next = FANTASY_SETTLEMENT_MAIN_QUESTS.find(value => value.chapter === quest.chapter! + 1);
    if (next) {
      p.character!.location = next.giver;
      assert.equal(applyFantasyAction(p, { type: 'accept', quest: next.id }, () => .5).changed, false, next.id);
    }
    p.character!.location = quest.giver;
    assert.equal(fantasyQuestEligible(p.character!, quest), true, quest.id);
    const accepted = applyFantasyAction(p, { type: 'accept', quest: quest.id }, () => .5);
    assert.equal(accepted.changed, true); p = accepted.profile;
    p.character!.inventory[quest.item] = quest.count;
    assert.equal(applyFantasyAction(p, { type: 'complete', quest: quest.id }, () => .5).changed, false, 'destination must be visited');
    p.character!.visited.push(quest.destination);
    assert.equal(applyFantasyAction(p, { type: 'complete', quest: quest.id }, () => .5).changed, false, 'a visit and supplied goods do not replace the investigation');
    while (!fantasyMainReady(p.character!, quest.id)) {
      const c = p.character!, stage = fantasyMainStage(c, quest.id)!;
      c.level = Math.max(c.level, fantasyMainTrial(quest.id)!.recommendedLevel);
      c.location = stage.location; c.hunger = 0; c.fatigue = 0; c.gold = 5000; c.inventory.lantern = 1;
      if (!c.visited.includes(stage.location)) c.visited.push(stage.location);
      c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
      const before = fantasyMainProgress(c, quest.id);
      const investigated = applyFantasyAction(p, { type: 'investigate', quest: quest.id, approach: 'analyze' }, () => .999);
      assert.equal(investigated.changed, true, investigated.error ?? quest.id); p = investigated.profile;
      assert.equal(fantasyMainProgress(p.character!, quest.id), before + 1);
    }
    p.character!.location = quest.reportAt ?? quest.giver;
    const result = applyFantasyAction(p, { type: 'complete', quest: quest.id }, () => .5);
    assert.equal(result.changed, true, result.error ?? quest.id); p = result.profile;
    assert.ok(p.character!.completed.includes(quest.id)); assert.deepEqual(p.character!.completed.slice(0, 12), old);
    assert.equal(applyFantasyAction(p, { type: 'complete', quest: quest.id }, () => .5).changed, false);
  }
  assert.deepEqual(p.character!.completed, FANTASY_MAIN_QUESTS.map(quest => quest.id));
});

test('new chapter evidence is hidden from GM and NPC knowledge until that chapter is completed', () => {
  const p = fresh(); p.character!.completed = [...legacyMain]; p.character!.visited = FANTASY_LOCATIONS.map(place => place.id);
  for (const locale of ['ko', 'en', 'ja'] as const) {
    p.character!.completed = [...legacyMain];
    for (const completed of [undefined, ...FANTASY_SETTLEMENT_MAIN_REVEALS]) {
      if (completed) p.character!.completed.push(completed.questId);
      const gm = fantasyGmKnowledge(p, locale);
      const query={ko:'소문의 섬에 관해 확인한 기록을 알려줘',en:'Tell me the verified records of the uncharted island.',ja:'噂の島について確かめた記録を教えてください。'}[locale];
      const npc = npcCanonicalReply(locale, 'rin', 'trusted', query, { completedQuests: p.character!.completed }) ?? '';
      if(completed&&completed.questId!=='main-night-18')assert.ok(npc.includes(npcInformationSpeech('rin',locale,completed.text[locale])),`${locale}/${completed.questId}: ${npc}`);
      for (const evidence of FANTASY_SETTLEMENT_MAIN_REVEALS) {
        const known = p.character!.completed.includes(evidence.questId) && evidence.questId !== 'main-night-18';
        assert.equal(gm.includes(evidence.text[locale]), known, evidence.id);
        if (!known) {
          assert.equal(npc.includes(evidence.text[locale]), false);
          assert.equal(npc.includes(npcInformationSpeech('rin',locale,evidence.text[locale])), false);
          assert.equal(fantasyStoryReveals(p.character!.completed, locale).includes(evidence.text[locale]), false);
          assert.equal(npcAllowedFacts('rin', 'trusted', { completedQuests: p.character!.completed }).includes(evidence.text.en), false);
        }
      }
    }
  }
});

test('all new side contracts participate in seasonal guild postings and preserve individual and group modes', () => {
  const p = fresh();
  for (const quest of FANTASY_SETTLEMENT_SIDE_QUESTS) {
    const place = FANTASY_LOCATIONS.find(value => value.id === quest.giver)!;
    const board = { noctis: 'inkstone-city', sylvara: 'canopy-hall', kazaran: 'sunloom' }[place.land as 'noctis' | 'sylvara' | 'kazaran'];
    assert.ok(board); assert.equal(fantasyPersonalQuest(quest), false);
    const season = quest.seasons?.[0] ?? 'spring';
    assert.ok(fantasyContractCandidates(board, 12, season, 8).some(value => value.id === quest.id), quest.id);
    assert.equal(fantasyContractMode(quest), quest.group ? 'raid' : 'exclusive');
    if (quest.seasons) for (const other of ['spring', 'summer', 'autumn', 'winter'].filter(value => !quest.seasons!.includes(value as typeof season))) assert.ok(!fantasyContractCandidates(board, 12, other, 8).some(value => value.id === quest.id));
    if (quest.objective?.type === 'hunt') {
      const objective = quest.objective;
      p.character!.location = quest.destination;
      assert.ok(fantasyHuntTargets(p.character!).some(monster => monster.id === objective.monster), quest.id);
    }
  }
  assert.equal(FANTASY_SETTLEMENT_SIDE_QUESTS.filter(quest => quest.group).length, 2);
  assert.equal(FANTASY_QUESTS.filter(quest => quest.group).length, 8);
  assert.equal(FANTASY_SETTLEMENT_SIDE_QUESTS.filter(quest => quest.objective && !quest.group).length, 2);
  assert.equal(new Set(FANTASY_SETTLEMENT_SIDE_QUESTS.flatMap(quest => quest.seasons ?? [])).size, 4);
});

test('new delivery contracts consume the actual goods once while hunt contracts require recorded kills rather than placeholder ore', () => {
  for (const quest of FANTASY_SETTLEMENT_SIDE_QUESTS) {
    let p = fresh(); p.character!.location = quest.giver; p.character!.visited.push(quest.destination);
    if (quest.jobs) { p.character!.job = quest.jobs[0]; p.character!.jobXp[quest.jobs[0]] = 0; }
    const accepted = applyFantasyAction(p, { type: 'accept', quest: quest.id }, () => .5);
    assert.equal(accepted.changed, true, quest.id); p = accepted.profile;
    if (quest.objective) {
      assert.equal(applyFantasyAction(p, { type: 'complete', quest: quest.id }, () => .5).changed, false);
      p.character!.contracts = { [quest.id]: { offerId: `offer-${quest.id}`, issuer: quest.issuer!, boardLocation: quest.giver, acceptedAt: p.character!.hour, expiresAt: p.character!.hour + 36, progress: quest.objective.count - 1, gold: quest.gold } };
      assert.equal(applyFantasyAction(p, { type: 'complete', quest: quest.id }, () => .5).changed, false);
      p.character!.contracts[quest.id].progress++;
    } else {
      assert.equal(applyFantasyAction(p, { type: 'complete', quest: quest.id }, () => .5).changed, false);
      p.character!.inventory[quest.item] = quest.count;
    }
    const before = p.character!.gold, result = applyFantasyAction(p, { type: 'complete', quest: quest.id }, () => .5);
    assert.equal(result.changed, true, `${quest.id}: ${result.error}`); assert.ok(result.profile.character!.gold >= before + quest.gold);
    assert.equal(applyFantasyAction(result.profile, { type: 'complete', quest: quest.id }, () => .5).changed, false);
  }
  for (const quest of FANTASY_SETTLEMENT_SIDE_QUESTS.filter(quest => quest.jobs && ['linen', 'bread', 'dried-fish', 'repair-plank', 'potion', 'pottery-vessel', 'ingot', 'jerky'].includes(quest.item))) assert.ok(FANTASY_RECIPES.some(recipe => recipe.output === quest.item && quest.jobs!.includes(recipe.job)), quest.id);
});
