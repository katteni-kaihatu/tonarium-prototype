import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceFantasyWorld, applyFantasyAction, fantasyActionHours, fantasySkills, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { fantasyAvailableJobSkills, fantasyPracticeMultiplier, fantasyProfessionGrade, fantasyProficiencyBonus, fantasySkillUnlocked, grantFantasyPractice, validFantasyProgression } from './fantasy-progression.ts';
import { fantasyManaOnUse, fantasyManaTrainingError } from './fantasy-mana.ts';
import { FANTASY_JOBS } from './fantasy-data.ts';
import type { FantasySkill } from './fantasy.ts';

const high = () => 0.999;
const player = () => applyFantasyAction(newFantasyProfile(), { type: 'create', name: '実践者', gender: 'female', source: 'human' }, high).profile;

test('profession ranks use the shared five thresholds and cap their check bonus', () => {
  const c = player().character!;
  for (const [xp, grade] of [[0, 0], [29, 0], [30, 1], [100, 2], [250, 3], [600, 4], [9999, 4]]) {
    c.jobXp[c.job] = xp; assert.equal(fantasyProfessionGrade(c), grade); assert.equal(fantasyProficiencyBonus(c), grade);
  }
});

test('repeated real actions diminish XP, varied work resets it, and failed practice still earns a little', () => {
  const c = player().character!;
  const earned = [];
  for (let n = 0; n < 4; n++) { earned.push(grantFantasyPractice(c, { key: 'gather:herbs', amount: 8, success: true, practice: 'gather' })); c.hour += 2; }
  assert.deepEqual(earned, [8, 4, 2, 1]); assert.equal(c.practice!.gather, 4);
  assert.equal(grantFantasyPractice(c, { key: 'hunt:wolf', amount: 6, success: false, practice: 'hunt' }), 2);
  assert.equal(fantasyPracticeMultiplier(c, 'gather:herbs'), 1);
  c.hour += 6; assert.equal(fantasyPracticeMultiplier(c, 'hunt:wolf'), 1);
});

test('job, previous-skill, book, mentor and practical milestones unlock only the current profession', () => {
  const c = player().character!; c.job = 'mage'; c.jobXp.mage = 0;
  const base: FantasySkill = { id: 'sample', name: '試験', description: '', effect: 'check', power: 2, kind: 'active', mp: 5 };
  const gates: FantasySkill[] = [
    { ...base, unlock: { kind: 'job', xp: 30 } }, { ...base, unlock: { kind: 'skill', skill: 'human-ingenuity', xp: 5 } },
    { ...base, unlock: { kind: 'book', book: 'mana-primer', jobXp: 100 } }, { ...base, unlock: { kind: 'mentor', jobXp: 100 } },
    { ...base, unlock: { kind: 'condition', condition: 'gather', count: 6 } },
  ];
  assert.ok(gates.every(skill => !fantasySkillUnlocked(c, skill)));
  c.jobXp.mage = 100; c.skillXp = { 'human-ingenuity': 5 }; c.readBooks = ['mana-primer']; c.unlockedSkills = ['sample']; c.practice = { gather: 6 };
  assert.ok(gates.every(skill => fantasySkillUnlocked(c, skill)));
  const own = FANTASY_JOBS.find(job => job.id === c.job)!.skills;
  assert.ok(fantasyAvailableJobSkills(c).every(skill => own.some(entry => entry.id === skill.id)));
  c.job = 'warrior'; c.jobXp.warrior = 0;
  assert.ok(fantasyAvailableJobSkills(c).every(skill => FANTASY_JOBS.find(job => job.id === 'warrior')!.skills.some(entry => entry.id === skill.id)));
});

test('mana training buttons are retired and only positive effective MP use grows its bounded stages', () => {
  const c = player().character!; assert.ok(fantasyManaTrainingError(c, 'sense'));
  assert.equal(fantasyManaOnUse(c, 0).useXp, undefined);
  c.mana = fantasyManaOnUse(c, 12); assert.equal(c.mana.stage, 1);
  c.mana = fantasyManaOnUse(c, 28); assert.equal(c.mana.stage, 2);
  c.mana = fantasyManaOnUse(c, 60); assert.equal(c.mana.stage, 3);
  c.mana = fantasyManaOnUse(c, 140); assert.equal(c.mana.stage, 4); assert.equal(c.mana.mastery, 20);
});

test('preparing and discarding an MP buff grants no use XP, while a matching actual check grants it once', () => {
  const p = player();
  const prepared = applyFantasyAction(p, { type: 'skill', skill: 'human-ingenuity' }, high).profile;
  assert.equal(prepared.character!.buff!.skill, 'human-ingenuity');
  assert.equal(prepared.character!.mana?.useXp ?? 0, 0); assert.equal(prepared.character!.skillXp?.['human-ingenuity'] ?? 0, 0);
  const discarded = applyFantasyAction(prepared, { type: 'rest' }, high).profile;
  assert.equal(discarded.character!.mana?.useXp ?? 0, 0); assert.equal(discarded.character!.skillXp?.['human-ingenuity'] ?? 0, 0);
  const used = applyFantasyAction(prepared, { type: 'explore' }, high).profile;
  assert.equal(used.character!.mana!.useXp, 6); assert.ok(used.character!.skillXp!['human-ingenuity'] > 0); assert.equal(used.character!.buff, null);
  const again = applyFantasyAction(used, { type: 'explore' }, high).profile;
  assert.equal(again.character!.mana!.useXp, 6);
  assert.ok(fantasySkills(again.character!).some(skill => skill.id === 'human-ingenuity'));
});

test('forged XP, unknown books and future practice records fail semantic validation', () => {
  const c = player().character!; assert.equal(validFantasyProgression(c), true);
  c.skillXp = { forged: 5 }; assert.equal(validFantasyProgression(c), false);
  c.skillXp = {}; c.readBooks = ['world-bible']; assert.equal(validFantasyProgression(c), false);
  c.readBooks = []; c.proficiencyUse = { key: 'work', hour: c.hour + 1, repeats: 1 }; assert.equal(validFantasyProgression(c), false);
});

test('reading takes one shared game hour and records its unlock only once after completion', () => {
  const p = player(), action = { type: 'read', book: 'traveler-guide' } as const;
  assert.equal(fantasyActionHours(p, action), 1);
  const direct = applyFantasyAction(p, action, high);
  assert.equal(direct.error, undefined); assert.equal(direct.profile.character!.hour, p.character!.hour + 1);
  const started = startFantasyActivity(p, action, p.character!.hour, high);
  assert.equal(started.error, undefined); assert.equal(started.profile.activity!.endsAt - started.profile.activity!.startedAt, 1);
  assert.equal(started.profile.character!.readBooks?.includes(action.book) ?? false, false);
  const partial = advanceFantasyWorld(structuredClone(started.profile), p.character!.hour + 0.5).profile;
  assert.equal(partial.character!.readBooks?.includes(action.book) ?? false, false);
  const done = advanceFantasyWorld(partial, started.profile.activity!.endsAt).profile;
  assert.deepEqual(done.character!.readBooks, [action.book]); assert.equal(done.activity, undefined);
  assert.deepEqual(advanceFantasyWorld(structuredClone(done), done.character!.hour).profile, done);
  assert.equal(applyFantasyAction(done, action, high).changed, false);
});
