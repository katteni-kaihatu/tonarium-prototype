import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyBodyCombatSkills } from './fantasy-body-combat.ts';
import { fantasyBodyAdjustAttack, fantasyBodyCombatCapabilities, FANTASY_BODY_COMBAT_TECHNIQUES } from './fantasy-body-combat-catalog.ts';
import { fantasyBodyTraits } from './fantasy-physiology.ts';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyCombatPlayer } from '../server/fantasy-combat-adapter.ts';
import { validFantasyProgression } from './fantasy-progression.ts';

test('body capabilities unlock learned natural arts once and support multiple contributing traits', () => {
  assert.ok(fantasyBodyTraits({ race: 'deerkin' }).some(trait => trait.id === 'horned'));
  assert.ok(fantasyBodyTraits({ race: 'catkin' }).some(trait => trait.id === 'clawed'));
  assert.equal(fantasyBodyCombatSkills({ race: 'catkin', level: 1 }).length, 0);
  const skills = fantasyBodyCombatSkills({ race: 'catkin', level: 2 });
  assert.ok(skills.some(skill => skill.id === 'body-claw-rend')); assert.ok(skills.some(skill => skill.id === 'body-tail-sweep'));
  assert.equal(new Set(skills.map(skill => skill.id)).size, skills.length);
  assert.deepEqual([...fantasyBodyCombatCapabilities(['aquatic', 'webbed-limbs'])], ['aquatic']);
  assert.equal(new Set(FANTASY_BODY_COMBAT_TECHNIQUES.map(entry => entry.skill.id)).size, FANTASY_BODY_COMBAT_TECHNIQUES.length);
});
test('future anatomy bonuses have bounded reach accuracy and secondary damage', () => {
  const base = { ...FANTASY_BODY_COMBAT_TECHNIQUES[0].combat, id: 'test', names: { ko: '공격', en: 'Attack', ja: '攻撃' }, mp: 8 };
  const adjusted = fantasyBodyAdjustAttack(base, ['large', 'long-limbed', 'balancing-tail', 'flexible', 'balancing-tail'], ['physical-melee', 'unarmed', 'sweep']);
  assert.equal(adjusted.reach, 2); assert.equal(adjusted.hitBonus, 3);
  assert.equal(fantasyBodyAdjustAttack({ ...base, reach: 2 }, ['large', 'long-limbed'], ['physical-melee', 'unarmed']).reach, 3);
  assert.equal(fantasyBodyAdjustAttack({ ...base, reach: 3 }, ['large', 'long-limbed'], ['physical-melee', 'unarmed']).reach, 3);
  assert.deepEqual(fantasyBodyAdjustAttack(base, ['large', 'long-limbed', 'balancing-tail', 'flexible'], ['physical-melee', 'unarmed', 'sweep']), adjusted);
  const breath = fantasyBodyAdjustAttack({ ...base, secondaryDamage: 78 }, ['overlapping-scales'], ['breath']);
  assert.equal(breath.secondaryDamage, 80);
});
test('server derives body arts and real breathing attacks while preserving valid proficiency saves', () => {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Body', gender: 'male' }, () => .5).profile;
  const character = profile.character!; character.race = 'dragonblood'; character.level = 3;
  const player = fantasyCombatPlayer(profile, 'u0'), breath = player.skills.find(skill => skill.id === 'dragonblood-flame');
  assert.equal(breath?.kind, 'attack'); assert.equal(breath?.shape, 'cone'); assert.equal(breath?.reach, 3);
  assert.equal(breath?.hitUtility?.id, 'vulnerable');
  assert.ok(player.skills.some(skill => skill.id === 'body-horn-gore'));
  character.skillXp = { ...character.skillXp, 'body-claw-rend': 50 };
  assert.ok(validFantasyProgression(character));
  character.skillXp['body-forged'] = 1; assert.equal(validFantasyProgression(character), false);
});
