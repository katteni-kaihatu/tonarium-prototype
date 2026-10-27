import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_JOBS, FANTASY_RACES } from './fantasy-data.ts';
import { applyFantasyAction, fantasySkills, fantasyStats, newFantasyProfile } from './fantasy-engine.ts';
import { FANTASY_MANA_EXERCISES, fantasyMana, fantasyManaAfterSkill, fantasyManaOnUse, fantasyManaRecover, fantasyManaSkillError, fantasyManaSkills, fantasyManaStatBonuses, fantasyManaTrainingError, fantasyManaTrainingResult, validFantasyMana } from './fantasy-mana.ts';

function character() {
  return applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: '修練者', gender: 'male' }, () => 0.999).profile.character!;
}

test('retired exercises remain localized reference data and cannot grant stages', () => {
  const c = character();
  assert.ok(fantasyManaTrainingError(c, 'sense'));
  for (const id of ['circulate', 'shape', 'release', 'refine', '__proto__']) assert.ok(fantasyManaTrainingError(c, id));
  for (const exercise of FANTASY_MANA_EXERCISES) {
    for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(exercise.names[locale]);
    assert.ok(exercise.hours >= 1 && Number.isInteger(exercise.hours));
    assert.ok(exercise.mpCost >= 0 && exercise.dc > 0);
  }
  for (const id of ['sense', 'circulate', 'shape', 'release'] as const) {
    assert.ok(fantasyManaTrainingError(c, id));
    const result = fantasyManaTrainingResult(c, id, true);
    assert.ok(result.error); assert.equal(result.mana.stage, 0); assert.equal(result.mp, c.mp); assert.equal(result.xp, 0);
  }
  assert.equal(fantasyMana(c).stage, 0);
});

test('effective-use and skill helpers are immutable and charge bounded strain and fatigue', () => {
  const c = character(); c.mana = { stage: 1, mastery: 3, strain: 0, affinity: 'balanced', useXp: 12 };
  const original = structuredClone(c);
  const success = fantasyManaOnUse(c, 28);
  assert.deepEqual(c, original);
  assert.equal(success.stage, 2); assert.equal(success.strain, 0); assert.equal(success.useXp, 40);
  c.mana = success;
  const before = structuredClone(c); const used = fantasyManaAfterSkill(c, 'mana-body-agility');
  assert.deepEqual(c, before); assert.equal(used.mana.strain, c.mana.strain + 3); assert.equal(used.fatigue, c.fatigue + 1);
});

test('retired training never grants failure XP and dangerous skill overload has bounded consequences', () => {
  const c = character(); c.mana = { stage: 4, mastery: 20, strain: 79, affinity: 'balanced' };
  const failure = fantasyManaTrainingResult(c, 'circulate', false);
  assert.equal(failure.mana.stage, 4); assert.equal(failure.mana.mastery, 20); assert.equal(failure.mana.strain, 79);
  assert.equal(failure.xp, 0); assert.equal(failure.hpDamage, 0); assert.equal(failure.fatigue, c.fatigue);
  const overloaded = fantasyManaAfterSkill(c, 'mana-ward', 30);
  assert.equal(overloaded.mana.strain, 94); assert.ok(overloaded.hpDamage > 0 && overloaded.hpDamage <= 6);
  c.mana = overloaded.mana; assert.ok(fantasyManaSkillError(c, 'mana-ward'));
  const rejected = fantasyManaTrainingResult(c, 'circulate', true);
  assert.ok(rejected.error); assert.equal(rejected.mp, c.mp); assert.equal(rejected.xp, 0); assert.equal(rejected.hpDamage, 0);
  c.mana.strain = 0; c.mp = 1; assert.ok(fantasyManaTrainingError(c, 'circulate'));
});

test('effective use respects stage mastery caps and permanent mana bonuses remain bounded', () => {
  const c = character(); c.mana = { stage: 4, mastery: 18, strain: 0, affinity: 'balanced' };
  const result = fantasyManaOnUse(c, 10000);
  assert.equal(result.stage, 4); assert.equal(result.mastery, 20);
  c.mana = result; assert.ok(fantasyManaTrainingError(c, 'refine'));
  assert.deepEqual(fantasyManaStatBonuses(c), { mp: 20, strength: 2, agility: 1, vitality: 2 });
});

test('every profession can gain mana resources and body skills, including ordinary and criminal warriors', () => {
  for (const job of FANTASY_JOBS) {
    const c = character(); c.job = job.id; c.jobXp[job.id] = 0;
    const before = fantasyStats(c);
    c.mana = { stage: 4, mastery: 20, strain: 0, affinity: 'balanced' };
    const after = fantasyStats(c);
    assert.equal(after.strength - before.strength, 2, job.id); assert.equal(after.vitality - before.vitality, 2, job.id);
    assert.equal(after.agility - before.agility, 1, job.id); assert.equal(after.mp - before.mp, 20, job.id);
    assert.equal(fantasySkills(c).filter(skill => skill.id.startsWith('mana-')).length, 5, job.id);
  }
});

test('body skills unlock at circulation, focus at shaping and ward at release without forged early use', () => {
  const c = character();
  for (const stage of [0, 1, 2, 3, 4] as const) {
    c.mana = { stage, mastery: stage * 5, strain: 0, affinity: 'balanced' };
    const skills = fantasyManaSkills(c);
    assert.equal(skills.length, [0, 0, 3, 4, 5][stage]);
    for (const skill of skills) assert.equal(fantasyManaSkillError(c, skill.id), undefined);
    assert.ok(fantasyManaSkillError(c, 'mana-forged'));
    c.mana.strain = 80; if (skills.length) assert.ok(fantasyManaSkillError(c, skills[0].id));
  }
  assert.ok(fantasyManaSkillError(c, 'unrelated-racial-skill'));
  c.mana!.strain = 0;
  assert.equal(fantasyManaSkillError(c, 'unrelated-racial-skill'), undefined);
});

test('strain recovery floors elapsed time once, is bounded and preserves the original record', () => {
  const c = character(); c.mana = { stage: 2, mastery: 7, strain: 30, affinity: 'flame' };
  const before = structuredClone(c);
  assert.equal(fantasyManaRecover(c, 2.9).strain, 18);
  for (const elapsed of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(fantasyManaRecover(c, elapsed).strain, 30);
  assert.equal(fantasyManaRecover(c, 10000).strain, 0); assert.deepEqual(c, before);
});

test('all races have a registered default affinity and malformed saved records are rejected', () => {
  const c = character(); assert.equal(validFantasyMana(c), true);
  for (const race of FANTASY_RACES) {
    c.race = race.id; const mana = fantasyMana(c);
    assert.equal(mana.stage, 0); assert.equal(mana.strain, 0);
    assert.ok(['balanced', 'flame', 'tide', 'gale', 'stone', 'light', 'shadow'].includes(mana.affinity));
  }
  for (const mana of [null, [], { stage: 5, mastery: 0, strain: 0, affinity: 'balanced' }, { stage: 1, mastery: 6, strain: 0, affinity: 'balanced' }, { stage: 1, mastery: 1, strain: 101, affinity: 'balanced' }, { stage: 1, mastery: 1, strain: 0, affinity: 'unknown' }, { stage: 1, mastery: 1, strain: 0, affinity: 'balanced', extra: 0 }]) assert.equal(validFantasyMana({ mana } as unknown as typeof c), false);
});
