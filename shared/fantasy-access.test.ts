import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FantasyEvent, FantasyQuest } from './fantasy.ts';
import { FANTASY_EVENTS, FANTASY_QUESTS, FANTASY_RACES } from './fantasy-data.ts';
import { fantasyEventEligible, fantasyQuestEligible } from './fantasy-access.ts';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyGmReply } from './fantasy-gm.ts';

const human = { race: 'human', job: 'cook', location: 'hearth' };
const event: FantasyEvent = { id: 'test', name: 'Test', description: 'Test', choices: [] };
const quest: FantasyQuest = { id: 'test', name: 'Test', description: 'Test', giver: 'hearth', destination: 'greenwood', item: 'herb', count: 1, gold: 1, xp: 1 };

test('events combine job, race, family and location conditions with AND while each array uses OR', () => {
  const gated: FantasyEvent = { ...event, job: 'cook', races: ['human', 'elf'], families: ['human', 'elf'], locations: ['hearth', 'suncourt'] };
  assert.ok(fantasyEventEligible(human, gated));
  assert.ok(fantasyEventEligible({ ...human, race: 'elf', location: 'suncourt' }, gated));
  for (const character of [{ ...human, race: 'dwarf' }, { ...human, job: 'merchant' }, { ...human, location: 'greenwood' }]) assert.equal(fantasyEventEligible(character, gated), false);
  assert.equal(fantasyEventEligible(human, { ...gated, families: ['elf'] }), false);
  assert.ok(fantasyEventEligible(human, event));
});

test('empty or unknown ancestry requirements fail closed, and family requirements cover real descendants', () => {
  for (const conditions of [{ races: [] }, { families: [] }, { locations: [] }, { races: ['made-up'] }, { families: ['made-up'] }]) assert.equal(fantasyEventEligible(human, { ...event, ...conditions }), false);
  assert.equal(fantasyEventEligible({ ...human, race: 'made-up' }, event), false);
  const descendants = FANTASY_RACES.filter(race => race.family === 'elf');
  assert.ok(descendants.length >= 2);
  for (const race of descendants) assert.ok(fantasyEventEligible({ ...human, race: race.id }, { ...event, families: ['elf'] }));
  assert.equal(fantasyEventEligible(human, { ...event, families: ['elf'] }), false);
});

test('quest building requirements refer to the giver, so an accepted quest remains eligible away from town', () => {
  const gated: FantasyQuest = { ...quest, races: ['human'], families: ['human'], building: 'library' };
  assert.ok(fantasyQuestEligible(human, gated));
  assert.ok(fantasyQuestEligible({ ...human, location: 'greenwood' }, gated));
  assert.equal(fantasyQuestEligible({ ...human, race: 'elf' }, gated), false);
  assert.equal(fantasyQuestEligible(human, { ...gated, giver: 'emberhall' }), false);
  assert.equal(fantasyQuestEligible(human, { ...gated, building: 'made-up' }), false);
  assert.equal(fantasyQuestEligible(human, { ...quest, races: [] }), false);
});

test('access helpers are deterministic and do not mutate caller objects or condition arrays', () => {
  const character = Object.freeze({ ...human });
  const gated = Object.freeze({ ...event, races: Object.freeze(['human']) as unknown as string[] });
  assert.ok(fantasyEventEligible(character, gated));
  assert.ok(fantasyEventEligible(character, gated));
  assert.deepEqual(gated.races, ['human']);
});

test('guessing a lineage-only quest ID cannot reveal or accept another ancestry contract through the GM or engine', () => {
  const restricted = FANTASY_QUESTS.filter(quest => quest.races?.length || quest.families?.length);
  assert.ok(restricted.length > 0);
  for (const quest of restricted) {
    const created = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Traveler', gender: 'female', source: 'human' }).profile;
    const character = created.character!;
    character.location = quest.giver;
    character.visited = [...new Set(['hearth', quest.giver, quest.destination])];
    character.inventory[quest.item] = quest.count;
    assert.equal(fantasyQuestEligible(character, quest), false);
    assert.ok(applyFantasyAction(created, { type: 'accept', quest: quest.id }).error);
    character.quests = [quest.id];
    assert.ok(applyFantasyAction(created, { type: 'complete', quest: quest.id }).error);
    character.quests = [];
    for (const locale of ['ko', 'en', 'ja'] as const) {
      const response = fantasyGmReply(created, quest.id, locale);
      assert.ok(!response.text.includes(quest.name));
      assert.ok(!response.suggestions.some(s => s.action?.type === 'accept' || s.action?.type === 'complete'));
    }
  }
});

test('racial events remain eligible without a job but reject a different lineage', () => {
  const racial = FANTASY_EVENTS.filter(event => !event.job && (event.races?.length || event.families?.length));
  assert.ok(racial.length > 0);
  for (const event of racial) {
    const race = FANTASY_RACES.find(race => fantasyEventEligible({ race: race.id, job: 'unassigned', location: event.locations?.[0] ?? 'hearth' }, event));
    assert.ok(race, event.id);
    assert.equal(fantasyEventEligible({ ...human, race: 'missing-race' }, event), false);
  }
});
