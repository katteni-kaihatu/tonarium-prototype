import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from './fantasy-engine.ts';
import { FANTASY_PATH_SUMMONS, fantasyCompanionAvailable, fantasySummonCombatSpec } from './fantasy-summon-paths.ts';
import { applyFantasySpecialization, fantasyCompanionBonus, settleFantasyCompanions, validFantasySpecialization, type FantasySpecializationAction } from './fantasy-specializations.ts';

function profile(path = 'summoner-elemental') {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: '契約の試験' }, () => .99).profile;
  const c = p.character!; c.job = 'summoner'; c.jobXp.summoner = 1000; c.gold = 1000; c.mp = 200; c.location = 'starspire'; c.jobPaths = { summoner: { path, hour: c.hour } }; return p;
}
function act(p: ReturnType<typeof profile>, action: FantasySpecializationAction) {
  return applyFantasySpecialization(p, action, () => .99, { stats: fantasyStats(p.character!), check: () => true, addItem: () => {}, hurt: () => {} })!;
}
test('each summoner path has two distinct translated creatures and only its current path is available', () => {
  assert.equal(FANTASY_PATH_SUMMONS.length, 8); assert.equal(new Set(FANTASY_PATH_SUMMONS.map(summon => summon.id)).size, 8);
  const c = profile().character!;
  for (const path of ['elemental', 'beast', 'puppet', 'guardian']) {
    c.jobPaths!.summoner.path = `summoner-${path}`;
    const available = FANTASY_PATH_SUMMONS.filter(summon => fantasyCompanionAvailable(c, summon.id)); assert.equal(available.length, 2);
    for (const summon of available) for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(summon.names[locale] && summon.role[locale]);
  }
  for (const id of ['summon-wisp', 'summon-stone', 'summon-gale']) assert.equal(fantasyCompanionAvailable(c, id), true);
  c.job = 'mage'; assert.equal(fantasyCompanionAvailable(c, 'summon-dawnmender'), false);
});
test('summons expose bounded distinct actual attack, status, healing and protection roles', () => {
  const c = profile().character!, fingerprints = new Set<string>();
  for (const summon of FANTASY_PATH_SUMMONS) {
    c.jobPaths!.summoner.path = summon.requiresPath;
    const spec = fantasySummonCombatSpec(c, summon.id)!; assert.ok(spec); assert.ok(spec.skills.length >= 1);
    assert.ok(spec.attackMultiplier > 0 && spec.attackMultiplier <= .5); assert.ok(spec.defenseMultiplier > 0 && spec.defenseMultiplier <= .9);
    fingerprints.add(JSON.stringify(spec));
    for (const skill of spec.skills) { assert.ok(skill.mp >= 0 && skill.mp <= 10); assert.ok(skill.power >= 0 && skill.power <= 30); }
    c.jobPaths!.summoner.path = 'summoner-unknown'; assert.equal(fantasySummonCombatSpec(c, summon.id), undefined);
  }
  assert.equal(fingerprints.size, 8); assert.equal(fantasySummonCombatSpec(c, 'summon-wisp'), undefined);
});
test('path changes retain contracts while disabling hiring, assignment, missions, bonuses and upkeep for the old path', () => {
  let p = profile(), action: FantasySpecializationAction = { type: 'command', kind: 'summons', operation: 'hire', member: 'summon-flame-spirit' };
  p = act(p, action).profile; p = act(p, { ...action, operation: 'assign' }).profile;
  assert.equal(p.character!.specialization!.companies!.summons!.members.length, 1);
  assert.ok(fantasyCompanionBonus(p.character!).check > 0);
  p.character!.jobPaths!.summoner.path = 'summoner-beast'; const before = structuredClone(p), mp = p.character!.mp;
  assert.equal(validFantasySpecialization(p.character!), true); assert.deepEqual(fantasyCompanionBonus(p.character!), { check: 0, guard: 0 });
  assert.ok(act(p, { ...action, member: 'summon-frost-spirit' }).error);
  assert.ok(act(p, { ...action, operation: 'mission' }).error);
  assert.equal(settleFantasyCompanions(p, false, () => 0), 0); assert.equal(p.character!.mp, mp); assert.deepEqual(p, before);
  p = act(p, { ...action, member: 'summon-direwolf' }).profile;
  assert.equal(p.character!.specialization!.companies!.summons!.members.length, 2);
  p.character!.jobPaths!.summoner.path = 'summoner-elemental'; assert.ok(fantasyCompanionBonus(p.character!).check > 0);
});
