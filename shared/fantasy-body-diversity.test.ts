import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_BODY_DIVERSITY_TRAITS, FANTASY_RACE_DIVERSITY_TRAITS, fantasyBodyStatModifiers } from './fantasy-body-diversity.ts';
import { FANTASY_BODY_TRAITS, FANTASY_RACE_BODY_TRAITS, fantasyBodyTraits, fantasyContextBonus } from './fantasy-physiology.ts';
import { FANTASY_RACES } from './fantasy-data.ts';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';

test('human and unknown bodies preserve baseline while race anatomy supplies actual stat tradeoffs', () => {
  for (const race of ['human', 'missing', '__proto__', 'constructor']) assert.deepEqual(fantasyBodyStatModifiers({ race }), {});
  assert.deepEqual(fantasyBodyStatModifiers({ race: 'birdkin' }), { hp: -4, agility: 2, strength: -2, dexterity: 2, charisma: -1 });
  assert.deepEqual(fantasyBodyStatModifiers({ race: 'stoneborn' }), { hp: 6, strength: 2, agility: -3, mp: -3, dexterity: -1, vitality: 1 });
  assert.deepEqual(fantasyBodyStatModifiers({ race: 'tideborn' }), { hp: -1, agility: 1, dexterity: 1, charisma: -1 });
  assert.ok(fantasyBodyStatModifiers({ race: 'dryad' }).hp! > 0); assert.ok(fantasyBodyStatModifiers({ race: 'dryad' }).agility! < 0);
});

test('at least eight real anatomical traits share the displayed trait catalog and bounded context checks', () => {
  assert.ok(FANTASY_BODY_DIVERSITY_TRAITS.length >= 8);
  for (const trait of FANTASY_BODY_DIVERSITY_TRAITS) {
    assert.ok(FANTASY_BODY_TRAITS.some(entry => entry.id === trait.id));
    assert.ok(Object.values(trait.stats).some(value => value > 0)); assert.ok(Object.values(trait.stats).some(value => value < 0));
    for (const locale of ['ko', 'en', 'ja'] as const) { assert.ok(trait.names[locale]); assert.ok(trait.descriptions[locale]); }
    assert.ok(Object.keys(trait.modifiers).length > 0);
    const witnesses = Object.entries(FANTASY_RACE_DIVERSITY_TRAITS).filter(([, ids]) => ids.includes(trait.id));
    assert.ok(witnesses.length > 0, trait.id);
    for (const [race] of witnesses) { assert.ok(FANTASY_RACES.some(entry => entry.id === race)); assert.ok(FANTASY_RACE_BODY_TRAITS[race].includes(trait.id)); assert.ok(fantasyBodyTraits({ race }).some(entry => entry.id === trait.id)); }
  }
  assert.equal(fantasyContextBonus({ race: 'tideborn' }, 'deep-water'), 5);
  assert.ok(fantasyContextBonus({ race: 'stoneborn' }, 'high-place') < 0);
  assert.ok(fantasyContextBonus({ race: 'dragonblood' }, 'cold') < 0);
});

test('all additional anatomical stats are deterministic and bounded independently of vocation and birth randomness', () => {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Body', gender: 'female' }, () => .5).profile, c = p.character!;
  c.race = 'birdkin'; c.job = 'mage'; c.jobPaths = { mage: { path: 'mage-wind', hour: c.hour } }; c.birthBonuses = { strength: 2, luck: -1 };
  const before = JSON.stringify(c), modifiers = fantasyBodyStatModifiers(c);
  assert.equal(JSON.stringify(c), before); c.job = 'warrior'; c.birthBonuses = { vitality: 2 };
  assert.deepEqual(fantasyBodyStatModifiers(c), modifiers); assert.equal(c.jobPaths.mage.path, 'mage-wind');
  for (const race of FANTASY_RACES) for (const [stat, value] of Object.entries(fantasyBodyStatModifiers({ race: race.id }))) {
    assert.ok(Number.isInteger(value)); assert.ok(Math.abs(value) <= (stat === 'hp' || stat === 'mp' ? 12 : 3));
  }
});
