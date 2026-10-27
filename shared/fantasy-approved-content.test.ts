import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APPROVED_EVENTS, APPROVED_JOBS, APPROVED_RACES } from './fantasy-approved-content.ts';
import { APPROVED_QUESTS } from './fantasy-approved-quests.ts';
import { FANTASY_EVENTS, FANTASY_JOBS, FANTASY_QUESTS, FANTASY_RACES } from './fantasy-data.ts';
import { fantasyQuestEligible } from './fantasy-access.ts';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyContextBonus } from './fantasy-physiology.ts';
import { fantasySkillName } from './fantasy-skill-names.ts';

test('the five chosen ancestries can be created with their body advantages and localized skills', () => {
  assert.deepEqual(APPROVED_RACES.map(race => race.id), ['deerkin', 'goatkin', 'batkin', 'windspirit', 'frostfairy']);
  for (const race of APPROVED_RACES) {
    const profile = newFantasyProfile(); profile.draft.kept = race.id;
    const created = applyFantasyAction(profile, { type: 'create', source: 'kept', name: 'Newcomer', gender: 'female' }, () => .999);
    assert.equal(created.error, undefined, race.id);
    assert.equal(created.profile.character!.race, race.id);
    assert.equal(created.profile.character!.job, 'unassigned');
    for (const skill of race.skills) for (const locale of ['ko', 'en', 'ja'] as const) assert.equal(fantasySkillName(skill, locale), skill.names![locale]);
  }
  assert.ok(fantasyContextBonus({ race: 'deerkin' }, 'keen-senses') > 0);
  assert.ok(fantasyContextBonus({ race: 'goatkin' }, 'high-place') > 0);
  assert.ok(fantasyContextBonus({ race: 'batkin' }, 'keen-senses') > 0);
  assert.ok(fantasyContextBonus({ race: 'windspirit' }, 'narrow-space') > 0);
  assert.ok(fantasyContextBonus({ race: 'frostfairy' }, 'cold') > 0);
  assert.equal(FANTASY_RACES.find(race => race.id === 'human')!.weight, 17.64);
  assert.ok(Math.abs(FANTASY_RACES.reduce((sum, race) => sum + race.weight, 0) - 100) < 1e-9);
});

test('the selected professions have usable pairs of skills and three fully localized encounters each', () => {
  assert.equal(APPROVED_JOBS.length, 21);
  assert.ok(!APPROVED_JOBS.some(job => job.id === 'duelist'));
  for (const job of APPROVED_JOBS) {
    assert.ok(FANTASY_JOBS.some(entry => entry.id === job.id));
    assert.equal(job.skills.length, 2);
    assert.equal(job.skills.filter(skill => skill.kind === 'active').length, 1);
    const events = FANTASY_EVENTS.filter(event => event.job === job.id);
    assert.equal(events.length, 3, job.id);
    assert.equal(new Set(events.map(event => event.description)).size, 3);
  }
  for (const event of APPROVED_EVENTS) for (const locale of ['ko', 'en', 'ja'] as const) {
    assert.ok(event.names?.[locale] && event.descriptions?.[locale]);
    for (const choice of event.choices) assert.ok(choice.labels?.[locale] && choice.successes?.[locale] && choice.failures?.[locale]);
  }
});

test('follow-up contracts cannot be accepted by guessing their IDs or stocking the delivery item early', () => {
  const followups = APPROVED_QUESTS.filter(quest => quest.requiresCompleted?.length);
  assert.equal(followups.length, 8);
  for (const quest of followups) {
    const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Explorer', gender: 'male' }, () => .999).profile;
    const c = profile.character!;
    c.location = quest.giver; c.visited = [...new Set([...c.visited, quest.giver, quest.destination])];
    c.inventory[quest.item] = quest.count;
    assert.equal(fantasyQuestEligible(c, quest), false, quest.id);
    assert.ok(applyFantasyAction(profile, { type: 'accept', quest: quest.id }, () => .999).error, quest.id);
    c.completed = [...quest.requiresCompleted!];
    assert.equal(fantasyQuestEligible(c, quest), true, quest.id);
    assert.equal(applyFantasyAction(profile, { type: 'accept', quest: quest.id }, () => .999).error, undefined, quest.id);
  }
});

test('contract prerequisites are registered, acyclic and do not depend on an incompatible ancestry or profession', () => {
  const walk = (id: string, ancestors: string[]) => {
    assert.ok(!ancestors.includes(id), `Quest cycle: ${[...ancestors, id].join(' -> ')}`);
    const quest = FANTASY_QUESTS.find(quest => quest.id === id)!;
    assert.ok(quest, id);
    for (const previous of quest.requiresCompleted ?? []) walk(previous, [...ancestors, id]);
  };
  for (const quest of FANTASY_QUESTS) {
    walk(quest.id, []);
    if (quest.jobs) assert.ok(quest.jobs.length && quest.jobs.every(job => FANTASY_JOBS.some(value => value.id === job)));
    for (const previous of quest.requiresCompleted ?? []) {
      const prior = FANTASY_QUESTS.find(value => value.id === previous)!;
      if (quest.races && prior.races) assert.ok(quest.races.some(race => prior.races!.includes(race)));
      if (quest.jobs && prior.jobs) assert.ok(quest.jobs.some(job => prior.jobs!.includes(job)));
    }
  }
});
