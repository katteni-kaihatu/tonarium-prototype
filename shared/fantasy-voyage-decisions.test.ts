import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyFantasyAction, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import type { FantasyAction, FantasyProfile } from './fantasy.ts';
import { FANTASY_MAIN_QUESTS } from './fantasy-second-content.ts';
import { fantasyMainStage } from './fantasy-main-trials.ts';
import { FANTASY_VOYAGE_DECISIONS, fantasyVoyageDecisionMemories, fantasyVoyagePendingDecisions, validFantasyVoyageDecisions } from './fantasy-voyage-decisions.ts';
import { fantasyVoyageSceneLogText } from './fantasy-voyage-scenes.ts';
import { FantasyStore, isFantasyAction } from '../server/fantasy-store.ts';
import { npcCanonicalReply } from '../server/npc.ts';
import { fantasyGmKnowledge } from './fantasy-gm-knowledge.ts';
import { fantasyGmReply } from './fantasy-gm.ts';

const high = () => .999;
function act(p: FantasyProfile, action: FantasyAction) {
  const result = applyFantasyAction(p, action, high); assert.equal(result.error, undefined); return result.profile;
}
function player(id = 'letter-promise') {
  const d = FANTASY_VOYAGE_DECISIONS.find(value => value.id === id)!, quest = FANTASY_MAIN_QUESTS.find(q => q.id === d.quest)!;
  let p = act(newFantasyProfile(), { type: 'create', name: 'Traveler', source: 'human', gender: 'female' });
  p.character!.completed = FANTASY_MAIN_QUESTS.filter(q => q.chapter! < quest.chapter!).map(q => q.id);
  p.character!.hour = 12; p.character!.gold = 30; p.character!.inventory.lantern = 1; p.character!.location = quest.giver;
  p = act(p, { type: 'accept', quest: quest.id });
  while (fantasyMainStage(p.character!, quest.id)!.id !== d.stage) {
    p.character!.location = fantasyMainStage(p.character!, quest.id)!.location;
    p.character!.visited = [...new Set([...p.character!.visited, p.character!.location])];
    p.character!.buff = { effect: 'check', power: 40 };
    p = act(p, { type: 'investigate', quest: quest.id, approach: 'analyze' });
  }
  p.character!.location = fantasyMainStage(p.character!, quest.id)!.location;
  p.character!.visited = [...new Set([...p.character!.visited, p.character!.location])]; return p;
}

test('all four personal moments have two localized choices and never grant clues, XP or another traveler’s resources', () => {
  assert.equal(FANTASY_VOYAGE_DECISIONS.length, 4);
  for (const decision of FANTASY_VOYAGE_DECISIONS) for (const option of decision.choices) {
    const p = player(decision.id), untouched = structuredClone(p), other = player(decision.id), beforeOther = structuredClone(other);
    const result = act(p, { type: 'voyageDecision', decision: decision.id, choice: option.id });
    assert.deepEqual(p, untouched); assert.deepEqual(other, beforeOther);
    assert.equal(result.character!.gold, p.character!.gold - option.gold);
    assert.equal(result.character!.fatigue, Math.min(100, p.character!.fatigue + option.fatigue));
    assert.equal(result.character!.xp, p.character!.xp); assert.deepEqual(result.character!.mainTrials, p.character!.mainTrials);
    assert.equal(result.character!.hour, p.character!.hour); assert.equal(validFantasyVoyageDecisions(result.character!), true);
    assert.ok(!fantasyVoyagePendingDecisions(result.character!).some(d => d.id === decision.id));
    for (const locale of ['ko', 'en', 'ja'] as const) {
      assert.ok(option.label[locale]); assert.ok(option.result[locale]);
      assert.equal(fantasyVoyageDecisionMemories(result.character!, locale).find(memory => memory.id === decision.id)?.text, option.result[locale]);
      assert.ok(fantasyGmKnowledge(result, locale).includes(option.result[locale]));
    }
    const repeat = applyFantasyAction(result, { type: 'voyageDecision', decision: decision.id, choice: decision.choices.find(choice => choice.id !== option.id)!.id });
    assert.ok(repeat.error); assert.equal(repeat.changed, false); assert.deepEqual(repeat.profile, result);
  }
});

test('story decisions reject early, remote, poor and forged requests and remain optional for the main investigation', () => {
  const p = player('chart-offer'), action: FantasyAction = { type: 'voyageDecision', decision: 'chart-offer', choice: 'decoy' };
  assert.equal(isFantasyAction(action), true); assert.equal(isFantasyAction({ ...action, gold: 100 }), false);
  const remote = structuredClone(p); remote.character!.location = 'hearth'; assert.ok(applyFantasyAction(remote, action).error);
  const poor = structuredClone(p); poor.character!.gold = 0; assert.ok(applyFantasyAction(poor, action).error);
  assert.equal(applyFantasyAction(poor, { ...action, choice: 'refuse' }).error, undefined);
  const early = structuredClone(p); early.character!.mainTrials!['main-night-10'].proofs = [];
  assert.ok(applyFantasyAction(early, action).error);
  const invalid: Record<string, { choice: string; hour: number }>[] = [{ unknown: { choice: 'promise', hour: 12 } }, { 'chart-offer': { choice: 'decoy', hour: p.character!.hour + 1 } }, { 'chart-offer': { choice: 'decoy', hour: 0 } }];
  for (const value of invalid) {
    const forged = structuredClone(p); forged.character!.voyageDecisions = value;
    assert.equal(validFantasyVoyageDecisions(forged.character!), false); assert.deepEqual(fantasyVoyageDecisionMemories(forged.character!, 'en'), []);
  }
  const plain = structuredClone(p); plain.character!.buff = { effect: 'check', power: 40 };
  assert.equal(applyFantasyAction(plain, { type: 'investigate', quest: 'main-night-10', approach: 'analyze' }, high).error, undefined);
});

test('choices persist across abandonment, reacceptance and disk reload without repeated payment', t => {
  let p = player('chart-offer'); p = act(p, { type: 'voyageDecision', decision: 'chart-offer', choice: 'decoy' });
  const memories = fantasyVoyageDecisionMemories(p.character!, 'en'), gold = p.character!.gold;
  p = act(p, { type: 'abandon', quest: 'main-night-10' }); p = act(p, { type: 'accept', quest: 'main-night-10' });
  assert.equal(p.character!.gold, gold); assert.deepEqual(fantasyVoyageDecisionMemories(p.character!, 'en'), memories);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voyage-choices-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('voyage-choices-')); fs.rmSync(dir, { recursive: true, force: true }); });
  const file = path.join(dir, 'fantasy.json'); fs.writeFileSync(file, JSON.stringify({ a: p })); const store = new FantasyStore(file);
  assert.equal(store.loadError, undefined); assert.deepEqual(fantasyVoyageDecisionMemories(store.profile('a').character!, 'en'), memories);
});

test('zero-time personal choices apply once and NPCs remember the actual reply in all three languages', () => {
  let p = player(); const chosen = startFantasyActivity(p, { type: 'voyageDecision', decision: 'letter-promise', choice: 'promise' }, p.character!.hour, high);
  assert.equal(chosen.error, undefined); assert.equal(chosen.profile.activity, undefined); p = chosen.profile;
  p.character!.buff = { effect: 'check', power: 40 }; p = act(p, { type: 'investigate', quest: 'main-night-01', approach: 'analyze' });
  for (const [locale, query] of [['ko', '내 약속을 기억해?'], ['en', 'Do you remember my promise?'], ['ja', '私の約束を覚えている？']] as const) {
    const reply = npcCanonicalReply(locale, 'hearth-mira', 'trusted', query, { character: p.character!, completedQuests: p.character!.completed });
    assert.ok(reply); assert.match(reply!, /약속|promise|約束/);
    assert.ok(fantasyGmReply(p, query, locale).text.includes(fantasyVoyageDecisionMemories(p.character!, locale)[0].text));
  }
});

test('the completed final chapter closes the story instead of requesting a second report', () => {
  const p = player(); p.character!.completed = FANTASY_MAIN_QUESTS.map(q => q.id); delete p.character!.mainTrials;
  p.character!.location = 'beyond-dawn-isle'; p.character!.visited.push('beyond-dawn-isle');
  const done = act(p, { type: 'finishVoyage' });
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const text = fantasyVoyageSceneLogText('航海場面［main-night-18:closing］。', locale, done.character)!;
    assert.ok(text); assert.doesNotMatch(text, /주괴 두|마지막 보고|two ingots|last report|最後の報告/);
  }
});
