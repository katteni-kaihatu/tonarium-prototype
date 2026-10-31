import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_ITEMS, FANTASY_LOCATIONS, FANTASY_QUESTS } from './fantasy-data.ts';
import { FANTASY_MAIN_TRIALS } from './fantasy-main-trials.ts';
import { fantasyRankingScore, newFantasyRankingLedger, reconcileFantasyRanking, validFantasyRankingLedger } from './fantasy-ranking.ts';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import type { FantasyCharacter } from './fantasy.ts';
test('fixed score weights increase independently for level, current items, mastery, quests, story and visits', () => {
  assert.equal(fantasyRankingScore({ level: 1 }), 50);
  const item = FANTASY_ITEMS.find(item => item.id === 'herb')!;
  assert.equal(fantasyRankingScore({ inventory: { herb: 1 } }), 10 + 10 * (item.tier ?? 1));
  assert.equal(fantasyRankingScore({ jobXp: { mage: 100 } }), 20);
  assert.equal(fantasyRankingScore({ skillXp: { skill: 100 } }), 20);
  const quest = FANTASY_QUESTS.find(quest => !FANTASY_MAIN_TRIALS.some(trial => trial.questId === quest.id))!;
  assert.equal(fantasyRankingScore({ completed: [quest.id] }), 80);
  const trial = FANTASY_MAIN_TRIALS[0];
  assert.equal(fantasyRankingScore({ mainTrials: { [trial.questId]: { acceptedAt: 8, attempts: 1, proofs: [{ stage: trial.stages[0].id, hour: 9, approach: 'observe' }] } } }), 100);
  assert.equal(fantasyRankingScore({ visited: ['hearth'] }), 40);
});
test('stack farming, repeat records, gold and invalid numeric inputs cannot inflate scores', () => {
  assert.equal(fantasyRankingScore({ inventory: { herb: 9 } }), fantasyRankingScore({ inventory: { herb: 1_000_000 } }));
  assert.equal(fantasyRankingScore({ visited: ['hearth', 'hearth', 'unknown'], completed: ['unknown', 'unknown'] }), 40);
  assert.equal(fantasyRankingScore({ gold: 1_000_000 }), 0);
  assert.equal(fantasyRankingScore({ level: Infinity, jobXp: { mage: NaN, warrior: -1 }, inventory: { herb: Infinity } }), 0);
  const low = fantasyRankingScore({ jobXp: { mage: 100 } }), higher = fantasyRankingScore({ jobXp: { mage: 200 } });
  assert.ok(higher - low < low);
  const max = fantasyRankingScore({ level: Number.MAX_SAFE_INTEGER, inventory: Object.fromEntries(FANTASY_ITEMS.map(item => [item.id, 1_000_000])), jobXp: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`job-${i}`, 1_000_000])), completed: FANTASY_QUESTS.map(quest => quest.id), visited: FANTASY_LOCATIONS.map(place => place.id) });
  assert.equal(max, Number.MAX_SAFE_INTEGER);
});

test('ranking has no gameplay ceiling for its total or individual score categories', () => {
  assert.equal(fantasyRankingScore({ level: 1_000 }), 50_000);
  assert.equal(fantasyRankingScore({ jobXp: { mage: 4_000_000 }, skillXp: { skill: 16_000_000 } }), 12_000);
  const inventory = Object.fromEntries(FANTASY_ITEMS.map(item => [item.id, 1]));
  const itemPoints = FANTASY_ITEMS.reduce((sum, item) => sum + 10 + 10 * Math.min(8, item.tier || 1), 0);
  assert.ok(itemPoints > 2_000);
  assert.equal(fantasyRankingScore({ inventory }), itemPoints);
  const regularQuests = FANTASY_QUESTS.filter(quest => !FANTASY_MAIN_TRIALS.some(trial => trial.questId === quest.id));
  assert.equal(fantasyRankingScore({ completed: regularQuests.map(quest => quest.id) }), regularQuests.length * 80);
  assert.equal(fantasyRankingScore({ visited: FANTASY_LOCATIONS.map(place => place.id) }), FANTASY_LOCATIONS.length * 40);
  const mainTrials = Object.fromEntries(FANTASY_MAIN_TRIALS.map(trial => [trial.questId, {
    acceptedAt: 1, attempts: 1, proofs: trial.stages.map(stage => ({ stage: stage.id, hour: 1, approach: 'observe' as const })),
  }]));
  assert.equal(fantasyRankingScore({ mainTrials }), FANTASY_MAIN_TRIALS.reduce((sum, trial) => sum + trial.stages.length * 100, 0));
});
test('ranking ledger rejects forged row fields, duplicate generations and unsafe scores', () => {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Name', gender: 'female' }, () => .5).profile;
  const ledger = reconcileFantasyRanking(newFantasyRankingLedger(), new Map([['owner', profile]])); assert.ok(validFantasyRankingLedger(ledger));
  for (const score of [20_001, 1_000_000, Number.MAX_SAFE_INTEGER]) {
    const higher = structuredClone(ledger); higher.entries[0].row.score = score;
    assert.ok(validFantasyRankingLedger(higher));
  }
  for (const change of [(value: typeof ledger) => { value.entries[0].row.score = NaN; }, (value: typeof ledger) => { value.entries[0].row.score = Number.MAX_SAFE_INTEGER + 1; }, (value: typeof ledger) => { value.entries.push(structuredClone(value.entries[0])); }, (value: typeof ledger) => { Object.assign(value.entries[0].row, { gender: 'female' }); }, (value: typeof ledger) => { value.entries[0].generation = 0; }]) {
    const invalid = structuredClone(ledger); change(invalid); assert.equal(validFantasyRankingLedger(invalid), false);
  }
});
test('prototype-like owner identifiers cannot become inherited nickname values', () => {
  const c = { name: 'Fallback', race: 'human', job: 'unassigned', gender: 'female', level: 1 } as FantasyCharacter;
  const profile = { ...newFantasyProfile(), character: c };
  const ledger = reconcileFantasyRanking(newFantasyRankingLedger(), new Map([['constructor', profile]]));
  assert.equal(ledger.entries[0].row.nickname, 'Fallback'); assert.ok(validFantasyRankingLedger(ledger));
});
