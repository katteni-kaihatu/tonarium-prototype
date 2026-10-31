import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile, fantasyStats } from './fantasy-engine.ts';
import { FANTASY_ITEMS, FANTASY_LOCATIONS, FANTASY_QUESTS } from './fantasy-data.ts';
import { FANTASY_FOOD_META, reconcileFoodLots } from './fantasy-life.ts';
import { fantasyConversationPlan, fantasyGmContext, fantasyGmTokenEstimate, type FantasyGmHistoryTurn } from './fantasy-gm-context.ts';
import { fantasyGmKnowledge } from './fantasy-gm-knowledge.ts';
import { FANTASY_TERMS } from './fantasy-lore.ts';

function player() {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: '문답', gender: 'female', source: 'human' }, () => 0.999).profile;
  p.character!.birthBonuses = {};
  p.character!.job = 'cook'; p.character!.jobXp.cook = 0;
  p.character!.hp = fantasyStats(p.character!).hp; p.character!.mp = fantasyStats(p.character!).mp;
  p.character!.visited = FANTASY_LOCATIONS.map(place => place.id);
  p.character!.quests = FANTASY_QUESTS.filter(quest => !quest.races && !quest.families).map(quest => quest.id);
  p.character!.inventory = Object.fromEntries(FANTASY_ITEMS.map(item => [item.id, 2]));
  reconcileFoodLots(p.character!);
  return p;
}
const total = (context: ReturnType<typeof fantasyGmContext>) => (context.knowledge ? fantasyGmTokenEstimate(context.knowledge) + 8 : 0)
  + context.history.reduce((sum, turn) => sum + fantasyGmTokenEstimate(turn.content) + 8, 0);

test('multilingual estimation is deterministic and counts non-ASCII conservatively', () => {
  assert.equal(fantasyGmTokenEstimate('hello'), 2);
  assert.equal(fantasyGmTokenEstimate('안녕'), 4);
  assert.equal(fantasyGmTokenEstimate('猫'), 2);
});

test('large knowledge stays in budget while preserving current status and activity', () => {
  const p = player();
  p.activity = { action: { type: 'work' }, startedAt: 8, endsAt: 12, seed: 123 };
  const history: FantasyGmHistoryTurn[] = Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `Earlier turn ${index}: ${'history '.repeat(30)}` }));
  for (const locale of ['ko', 'en', 'ja'] as const) {
    assert.ok(fantasyGmTokenEstimate(fantasyGmKnowledge(p, locale)) > 1800);
    const context = fantasyGmContext(p, locale, 'How long is my current activity?', history);
    assert.ok(total(context) <= 1800);
    assert.ok(context.knowledge.includes(`HP ${p.character!.hp}/${fantasyStats(p.character!).hp}`));
    assert.ok(context.knowledge.includes('12.000'));
    assert.ok(context.history.length <= 4);
  }
});

test('query topics prioritize complete matching facts without changing the profile or history', () => {
  const p = player();
  const before = structuredClone(p);
  const history: FantasyGmHistoryTurn[] = [{ role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Welcome' }];
  const snapshot = structuredClone(history);
  const food = fantasyGmContext(p, 'en', 'Tell me my food nutrition and shelf life', history);
  assert.ok(food.knowledge.includes('Cook ingredient appraisal'));
  assert.ok(food.knowledge.includes('nutrition='));
  const fullLines = new Set(fantasyGmKnowledge(p, 'en').split('\n'));
  for (const line of food.knowledge.split('\n')) assert.ok(fullLines.has(line));
  assert.deepEqual(p, before);
  assert.deepEqual(history, snapshot);
});

test('context selection never adds hidden names or ordinary food inspection data', () => {
  const p = player();
  p.character!.job = 'unassigned'; p.character!.jobXp.unassigned = 0;
  p.character!.visited = ['hearth']; p.character!.charted = [];
  p.character!.quests = [];
  const hidden = FANTASY_TERMS.find(term => term.id === 'deepcave')!.names.en;
  const context = fantasyGmContext(p, 'en', `${hidden} food nutrition?`, []);
  assert.ok(!context.knowledge.includes(hidden));
  assert.ok(!context.knowledge.includes('nutrition='));
  assert.ok(!context.knowledge.includes('shelfLife='));
  assert.ok(FANTASY_FOOD_META.length > 0);
});

test('tiny budgets remain bounded and history is copied instead of exposing mutable references', () => {
  const p = player();
  const history: FantasyGmHistoryTurn[] = [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hi' }];
  for (const budget of [0, 1, 8, 20, 100, 500, 1800, 2400]) assert.ok(total(fantasyGmContext(p, 'en', 'hello', history, { budget })) <= budget);
  const context = fantasyGmContext(p, 'en', 'hello', history);
  context.history[0].content = 'changed';
  assert.equal(history[0].content, 'hello');
});

test('short input budgets preserve essential self and pending activity while public lore questions select approved basics', () => {
  const p = player(); p.activity = { action: { type: 'work' }, startedAt: 8, endsAt: 12, seed: 1 };
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const context = fantasyGmContext(p, locale, 'current activity', [], { budget: 900 });
    assert.ok(total(context) <= 900);
    assert.ok(context.knowledge.includes(`HP ${p.character!.hp}/${fantasyStats(p.character!).hp}`));
    assert.ok(context.knowledge.includes('12.000'));
  }
  const lore = fantasyGmContext(p, 'en', 'What is known about the uncharted island voyage in this world?', []);
  assert.ok(lore.knowledge.includes('A reliable route and the island’s true nature have not yet been verified'));
  assert.ok(!lore.knowledge.includes(FANTASY_TERMS.find(term => term.id === 'beyond-dawn-isle')!.names.en));
});

test('mana and equipment questions select current progression and equipped effects within budget', () => {
  const p = player(); p.character!.mana = { stage: 4, mastery: 18, strain: 31, affinity: 'balanced' };
  p.character!.equipment = { weapon: 'steel-sword' };
  for (const [locale, query, expected] of [['ko', '마나 수련 부담이 얼마야?', '자기 마나 수련: 단계 4/4'], ['en', 'What is my mana strain?', 'Own mana training: stage 4/4'], ['ja', 'マナ修練の負荷は？', '自分のマナ修練: 段階4/4']] as const) {
    const context = fantasyGmContext(p, locale, query, []);
    assert.ok(total(context) <= 1800); assert.ok(context.knowledge.includes(expected));
  }
  const equipped = fantasyGmContext(p, 'en', 'What weapon is equipped and what equipment stats does it provide?', []);
  assert.ok(equipped.knowledge.includes('Equipped item: Steel Sword'));
});

test('conversation budgets distinguish social, factual and explicitly detailed requests in every language', () => {
  for (const query of ['조금 지쳐서 대화하고 싶어.', 'I feel a little tired today.', '少し疲れたので会話したいです。']) assert.deepEqual(fantasyConversationPlan(query), { casual: true, budget: 550, maxTokens: 128 });
  for (const query of ['내 소지품을 알려줘', 'What is my mana strain?', '私の装備は？']) assert.deepEqual(fantasyConversationPlan(query), { casual: false, budget: 1400, maxTokens: 160 });
  for (const query of ['길게 설명해줘', 'Explain in detail', '詳しく教えて']) assert.deepEqual(fantasyConversationPlan(query), { casual: false, budget: 1600, maxTokens: 256 });
  assert.equal(fantasyConversationPlan('I feel worried about my quest').casual, false);
});

test('casual conversation never fills spare context with unrelated inventory, lore or quests', () => {
  const p = player(); p.activity = { action: { type: 'work' }, startedAt: 8, endsAt: 12, seed: 1 };
  for (const [locale, query] of [['ko', '오늘은 좀 지쳐서 대화하고 싶어.'], ['en', 'A quiet evening sounds nice.'], ['ja', '今日は少し疲れました。']] as const) {
    const selected = fantasyGmContext(p, locale, query, []);
    assert.ok(total(selected) <= 550);
    assert.ok(selected.knowledge.includes(`HP ${p.character!.hp}/${fantasyStats(p.character!).hp}`));
    assert.ok(selected.knowledge.includes('12.000'));
    assert.ok(!/Inventory:|소지품:|所持品:|Known quest:|아는 의뢰:|自分が知る依頼:|Public basics:|기초 공개 설정:|基本の公開設定:/.test(selected.knowledge));
  }
});

test('a specifically named owned item outranks the rest of a large inventory in all three locales', () => {
  const p = player();
  for (const [locale, query] of [['ko', '루비 반지는 무슨 물건이야?'], ['en', 'Tell me about my Ruby Ring.'], ['ja', '紅玉の指輪はどんな品？']] as const) {
    const selected = fantasyGmContext(p, locale, query, [], { budget: 900 });
    assert.ok(total(selected) <= 900);
    assert.ok(selected.knowledge.includes(FANTASY_ITEMS.find(item => item.id === 'ruby-ring')!.names![locale]));
  }
});
