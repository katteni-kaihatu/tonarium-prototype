import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_RACES } from './fantasy-data.ts';
import { fantasyBodyTraits, fantasyContextBonus } from './fantasy-physiology.ts';
import { fantasyBodyStatModifiers } from './fantasy-body-diversity.ts';
import { fantasyBodyCombatSkills } from './fantasy-body-combat.ts';
import { fantasyBodyAdjustAttack, FANTASY_BODY_COMBAT_TECHNIQUES } from './fantasy-body-combat-catalog.ts';

test('long limbs belong to appropriate tall ancestries and preserve the reach cap', () => {
  for (const race of ['elf', 'high-elf', 'dark-elf', 'snow-elf', 'orc', 'hobgoblin', 'deerkin', 'celestial', 'demigod']) assert.ok(fantasyBodyTraits({ race }).some(trait => trait.id === 'long-limbed'), race);
  for (const race of ['human', 'dwarf', 'halfling', 'starfairy']) assert.ok(!fantasyBodyTraits({ race }).some(trait => trait.id === 'long-limbed'));
  const entry = FANTASY_BODY_COMBAT_TECHNIQUES.find(value => value.skill.id === 'body-extended-palm')!;
  const skill = { ...entry.combat, id: entry.skill.id, names: entry.skill.names!, mp: entry.skill.mp };
  assert.equal(fantasyBodyAdjustAttack(skill, ['long-limbed', 'large', 'long-limbed'], entry.tags).reach, 2);
  assert.equal(fantasyBodyAdjustAttack({ ...skill, reach: 3 }, ['long-limbed', 'large'], entry.tags).reach, 3);
});

test('strong hands, joints and spring tendons unlock real single and compound capability arts', () => {
  const ids = (race: string, level = 3) => fantasyBodyCombatSkills({ race, level }).map(skill => skill.id);
  assert.ok(ids('orc').includes('body-grip-crush')); assert.ok(!ids('dwarf').includes('body-grip-crush'));
  assert.ok(ids('elf').includes('body-extended-palm')); assert.ok(ids('elf').includes('body-coiling-strike'));
  assert.ok(ids('rabbitkin').includes('body-spring-kick')); assert.ok(ids('tideborn').includes('body-coiling-strike'));
  assert.ok(!ids('rabbitkin', 2).includes('body-spring-kick')); assert.ok(!ids('human', 20).includes('body-spring-kick'));
  for (const race of FANTASY_RACES) assert.equal(new Set(ids(race.id, 20)).size, ids(race.id, 20).length);
});

test('every anatomy bonus stays capped with actual tradeoffs and no new free flight', () => {
  for (const race of FANTASY_RACES) {
    const stats = fantasyBodyStatModifiers({ race: race.id });
    for (const [stat, amount] of Object.entries(stats)) assert.ok(Math.abs(amount) <= (stat === 'hp' || stat === 'mp' ? 12 : 3));
    for (const context of ['narrow-space', 'trap', 'deep-water', 'high-place', 'heat', 'cold', 'heavy-lifting', 'keen-senses'] as const) assert.ok(Math.abs(fantasyContextBonus({ race: race.id }, context)) <= 5);
    for (const trait of fantasyBodyTraits({ race: race.id })) for (const locale of ['ko', 'en', 'ja'] as const) { assert.ok(trait.names[locale]); assert.ok(trait.descriptions[locale]); }
  }
  assert.ok(fantasyBodyStatModifiers({ race: 'orc' }).dexterity! < 0);
  assert.ok(fantasyBodyStatModifiers({ race: 'elf' }).vitality! < 0);
  assert.ok(!fantasyBodyTraits({ race: 'rabbitkin' }).some(trait => trait.id === 'winged'));
  const jump = FANTASY_BODY_COMBAT_TECHNIQUES.find(entry => entry.skill.id === 'body-spring-kick')!;
  assert.deepEqual(jump.combat.motion, { kind: 'advance', distance: 2 });
});
