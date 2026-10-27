import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fantasyBirthBonuses, FANTASY_BIRTH_RANGES, validFantasyBirth } from './fantasy-birth.ts';
import { applyFantasyAction, advanceFantasyWorld, fantasyStats, newFantasyProfile } from './fantasy-engine.ts';
import { FANTASY_STARTING_INVENTORY } from './fantasy-starting-kit.ts';

const high = () => 0.999;
const create = (gender: 'male' | 'female', rng: () => number) => applyFantasyAction(newFantasyProfile(), { type: 'create', name: '個体差', source: 'human', gender }, rng);

test('birth differences cover exactly seven bounded integer stats without gender restrictions', () => {
  assert.deepEqual(fantasyBirthBonuses(() => 0.5), { hp: 0, mp: 0, strength: 0, agility: 0, intelligence: 0, luck: 0, vitality: 0 });
  const low = fantasyBirthBonuses(() => 0), upper = fantasyBirthBonuses(high);
  for (const [key, limit] of Object.entries(FANTASY_BIRTH_RANGES)) {
    assert.equal(low[key as keyof typeof FANTASY_BIRTH_RANGES], -limit); assert.equal(upper[key as keyof typeof FANTASY_BIRTH_RANGES], limit);
  }
  assert.deepEqual(create('female', high).profile.character!.birthBonuses, create('male', high).profile.character!.birthBonuses);
});

test('starting gifts roll first and birth differences are saved once with full matching HP and MP', () => {
  const values = [0.999, 0.999, 0, 0, 0, 0, 0, 0, 0]; let calls = 0;
  const made = create('female', () => { calls++; return values.shift() ?? 0.5; });
  assert.equal(made.error, undefined); assert.equal(calls, 9);
  const character = made.profile.character!, max = fantasyStats(character);
  assert.deepEqual(character.inventory, FANTASY_STARTING_INVENTORY);
  assert.equal(character.hp, max.hp); assert.equal(character.mp, max.mp); assert.equal(character.birthBonuses!.strength, -1);
  const before = structuredClone(character.birthBonuses);
  const synced = advanceFantasyWorld(structuredClone(made.profile), character.hour + 0.5);
  assert.deepEqual(synced.profile.character!.birthBonuses, before);
  assert.equal(applyFantasyAction(synced.profile, { type: 'create', source: 'human', gender: 'female', name: '再抽選' }, () => { throw new Error('must not reroll'); }).changed, false);
});

test('same-species life variation is small and legacy characters keep their existing base stats', () => {
  const lowRolls = [0.999, 0.999];
  const low = create('female', () => lowRolls.length ? lowRolls.shift()! : 0).profile.character!;
  const upper = create('female', high).profile.character!;
  assert.equal(fantasyStats(upper).strength - fantasyStats(low).strength, 2);
  assert.equal(fantasyStats(upper).hp - fantasyStats(low).hp, 18);
  assert.equal(fantasyStats(upper).mp - fantasyStats(low).mp, 12);
  delete low.birthBonuses;
  assert.equal(fantasyStats(low).hp, 100); assert.equal(fantasyStats(low).mp, 50); assert.equal(validFantasyBirth(low), true);
});

test('malformed birth modifiers and invalid creation cannot bypass bounds or consume random rolls', () => {
  const character = create('female', high).profile.character!;
  for (const bonuses of [{ strength: 2 }, { hp: 6 }, { mp: -4 }, { luck: 0.5 }, { dexterity: 1 }, { unknown: 0 }, []]) {
    character.birthBonuses = bonuses as typeof character.birthBonuses; assert.equal(validFantasyBirth(character), false);
  }
  let calls = 0;
  const invalid = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'candidate', gender: 'male', name: '候補なし' }, () => { calls++; return 0.5; });
  assert.equal(invalid.changed, false); assert.equal(calls, 0);
});
