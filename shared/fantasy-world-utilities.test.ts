import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from './fantasy-engine.ts';
import { FANTASY_ITEMS, FANTASY_JOBS } from './fantasy-data.ts';
import { fantasyEffectHealing, fantasyItemBonuses, validFantasyItemState } from './fantasy-effects.ts';
import { applyFantasyWorldUtility, fantasyWorldUtilityText, recordFantasyWorldUtilityUse, validFantasyUtilityPractice } from './fantasy-world-utilities.ts';
import type { FantasySkill } from './fantasy.ts';
const names = { ko: '술기', en: 'Art', ja: '術' };
const skill = (utility: string): FantasySkill => ({ id: `test-${utility}`, name: '術', names, kind: 'active', description: '術', mp: 5, power: 100, effect: 'check', utility: utility as FantasySkill['utility'] });
const profile = () => applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: '術の試験' }, () => .99).profile;
test('world utilities give distinct modest effects and preserve caller-owned MP, time, revision and input', () => {
  for (const utility of ['haste', 'regen', 'clarity', 'resolve']) {
    const p = profile(), before = structuredClone(p), c = p.character!, result = applyFantasyWorldUtility(p, skill(utility))!;
    assert.equal(result.error, undefined); assert.equal(result.changed, true); assert.deepEqual(p, before);
    const changed = result.profile.character!; assert.equal(changed.mp, c.mp); assert.equal(changed.hour, c.hour); assert.equal(result.profile.revision, p.revision);
    assert.equal(changed.effects!.length, 1); assert.equal(changed.effects![0].expiresAt, c.hour + 3);
    assert.equal(validFantasyItemState(changed, FANTASY_ITEMS), true);
    const actual = fantasyStats(changed), base = fantasyStats(c);
    if (utility === 'haste') assert.equal(actual.agility, base.agility + 2);
    if (utility === 'clarity') assert.equal(actual.intelligence, base.intelligence + 2);
    if (utility === 'resolve') assert.equal(fantasyItemBonuses(changed, FANTASY_ITEMS).guard, fantasyItemBonuses(c, FANTASY_ITEMS).guard + 2);
    if (utility === 'regen') { assert.equal(changed.hp, c.hp); assert.equal(changed.effects![0].periodicHp, 2); }
  }
});
test('active effects cannot be refreshed or stacked even after some time has elapsed', () => {
  let p = applyFantasyWorldUtility(profile(), skill('haste'))!.profile;
  p.character!.hour += 1;
  const original = structuredClone(p), denied = applyFantasyWorldUtility(p, skill('haste'))!;
  assert.equal(denied.changed, false); assert.ok(denied.error); assert.deepEqual(denied.profile, original); assert.deepEqual(p, original);
  p.character!.hour += 2;
  const resumed = applyFantasyWorldUtility(p, skill('haste'))!; assert.equal(resumed.error, undefined); assert.equal(resumed.profile.character!.effects!.length, 1);
});
test('regeneration ticks on whole hours only through expiry and never revives a downed traveler', () => {
  const c = applyFantasyWorldUtility(profile(), skill('regen'))!.profile.character!; c.hour = 12;
  c.effects![0].expiresAt = 15; c.hp = 1;
  assert.equal(fantasyEffectHealing(c, 12, 12.99), 0); assert.equal(fantasyEffectHealing(c, 12, 14), 4);
  assert.equal(fantasyEffectHealing(c, 14, 17), 2); assert.equal(fantasyEffectHealing(c, 15, 18), 0);
  c.hp = 0; assert.equal(fantasyEffectHealing(c, 12, 15), 0);
});
test('enemy hexes and retaliatory combat arts reject targetless use without changes or MP costs', () => {
  for (const utility of ['thorns', 'lifesteal', 'weaken', 'vulnerable', 'blind', 'bleed', 'root', 'silence']) {
    const p = profile(), before = structuredClone(p), result = applyFantasyWorldUtility(p, skill(utility))!;
    assert.equal(result.changed, false); assert.ok(result.error); assert.deepEqual(result.profile, before);
    for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(fantasyWorldUtilityText(result.error!, locale));
  }
  const plain = skill('haste'); delete plain.utility;
  assert.equal(applyFantasyWorldUtility(profile(), plain), undefined);
});
test('effect capacity and incapacitation reject utility use without pruning or overwriting existing effects', () => {
  const p = profile(), c = p.character!; c.hp = 0;
  assert.equal(applyFantasyWorldUtility(p, skill('haste'))!.changed, false);
  c.hp = 1; c.effects = Array.from({ length: 8 }, (_, index) => ({ id: `slot-${index}`, expiresAt: c.hour + 1 }));
  const before = structuredClone(p); assert.equal(applyFantasyWorldUtility(p, skill('haste'))!.changed, false); assert.deepEqual(p, before);
});
test('casting grants no practice; a matching effective check credits paid mana and its source skill exactly once', () => {
  const ability = FANTASY_JOBS.flatMap(job => job.skills).find(skill => skill.utility === 'haste')!;
  const p = applyFantasyWorldUtility(profile(), ability)!.profile, c = p.character!; c.mp -= ability.mp;
  assert.equal(c.skillXp?.[ability.id], undefined); assert.equal(c.mana, undefined); assert.equal(validFantasyUtilityPractice(c), true);
  assert.equal(recordFantasyWorldUtilityUse(p, 'check', 'strength'), false);
  assert.equal(recordFantasyWorldUtilityUse(p, 'check', 'agility'), true);
  const xp = c.skillXp![ability.id], mana = c.mana!.useXp; assert.ok(xp > 0); assert.equal(mana, ability.mp);
  assert.equal(recordFantasyWorldUtilityUse(p, 'check', 'agility'), false); assert.equal(c.skillXp![ability.id], xp); assert.equal(c.mana!.useXp, mana);
  const forged = structuredClone(c); forged.utilityPractice!['skill-haste'].skill = 'mage-insight'; assert.equal(validFantasyUtilityPractice(forged), false);
});
test('a final regeneration tick can earn its one receipt at expiry before expired effects are pruned', () => {
  const ability = FANTASY_JOBS.flatMap(job => job.skills).find(skill => skill.utility === 'regen')!;
  const p = applyFantasyWorldUtility(profile(), ability)!.profile, c = p.character!; const start = c.hour; c.hp = 1;
  c.hour += 3; c.hp += fantasyEffectHealing(c, start, c.hour);
  assert.equal(recordFantasyWorldUtilityUse(p, 'regen'), true); assert.equal(recordFantasyWorldUtilityUse(p, 'regen'), false);
});
