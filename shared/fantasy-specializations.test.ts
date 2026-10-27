import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from './fantasy-engine.ts';
import { FANTASY_ITEMS } from './fantasy-data.ts';
import { NPC_PUBLIC } from './npc.ts';
import { fantasyGmReply } from './fantasy-gm.ts';
import { fantasyApprenticeshipError, fantasyNpcMentorSkills } from './fantasy-apprenticeship.ts';
import { npcAllowedFacts, npcCanonicalReply } from '../server/npc.ts';
import { npcInformationSpeech } from '../server/npc-info-speech.ts';
import { FANTASY_MAIN_QUESTS, FANTASY_MAIN_REVEALS } from './fantasy-second-content.ts';
import { FANTASY_FINAL_ISLE_ID } from './fantasy-isle-access.ts';
import {
  applyFantasySpecialization, fantasyCompanionBonus, fantasyCompanyCapacity, fantasySpecializationHours, fantasySpecializationSummary,
  fantasySpellCapacity, FANTASY_ALCHEMY_FORMULAS, FANTASY_COMPANIONS, FANTASY_MAGIC_COMBINATIONS, settleFantasyCompanions, validFantasySpecialization,
  type FantasySpecializationAction, type FantasySpecializationContext,
} from './fantasy-specializations.ts';

function player(job = 'leader', location = 'hearth') {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Specialist', gender: 'female' }, () => .999).profile;
  const c = profile.character!; c.job = job; c.jobXp[job] = 0; c.location = location; c.visited = [...new Set(['hearth', location])]; c.gold = 100;
  return profile;
}
function context(profile: ReturnType<typeof player>, success = true): FantasySpecializationContext {
  return { stats: fantasyStats(profile.character!), check: () => success,
    addItem: (p, id, count) => { p.character!.inventory[id] = (p.character!.inventory[id] ?? 0) + count; }, hurt: (p, amount) => { p.character!.hp = Math.max(0, p.character!.hp - amount); } };
}
function run(profile: ReturnType<typeof player>, action: FantasySpecializationAction, success = true) {
  return applyFantasySpecialization(profile, action, () => .5, context(profile, success))!;
}

test('specialty state is optional for legacy saves and rejects forged roster, slot and status values', () => {
  const profile = player(); assert.ok(validFantasySpecialization(profile.character!));
  for (const state of [{ spells: [{ slot: 2, element: 'light', form: 'mend' }] }, { companies: { troop: { members: [{ id: 'summon-wisp', condition: 'ready', hp: 20, assigned: true, missions: 0 }] } } }, { spells: [{ slot: 1, element: 'void', form: 'grant' }] }]) {
    profile.character!.specialization = state as never; assert.equal(validFantasySpecialization(profile.character!), false);
  }
});

test('company capacity uses its own profession proficiency and unrelated jobs cannot hire or gain its bonus', () => {
  let profile = player(); const original = JSON.stringify(profile);
  const hired = run(profile, { type: 'command', kind: 'troop', operation: 'hire', member: 'troop-guard' });
  assert.equal(hired.error, undefined); assert.equal(JSON.stringify(profile), original);
  assert.equal(hired.profile.revision, profile.revision); assert.equal(hired.profile.character!.hour, profile.character!.hour);
  profile = run(hired.profile, { type: 'command', kind: 'troop', operation: 'assign', member: 'troop-guard' }).profile;
  assert.equal(fantasyCompanionBonus(profile.character!).guard, 2);
  profile.character!.job = 'cook'; assert.deepEqual(fantasyCompanionBonus(profile.character!), { check: 0, guard: 0 });
  assert.ok(run(profile, { type: 'command', kind: 'troop', operation: 'hire', member: 'troop-scout' }).error);
  profile.character!.jobXp.leader = 30; assert.equal(fantasyCompanyCapacity(profile.character!, 'troop'), 3);
  profile.character!.jobXp.leader = 100; assert.equal(fantasyCompanyCapacity(profile.character!, 'troop'), 4);
});

test('duplicate hiring, wrong facilities, capacity and insufficient money fail without rewards or mutation', () => {
  let profile = player();
  for (const member of ['troop-guard', 'troop-scout']) profile = run(profile, { type: 'command', kind: 'troop', operation: 'hire', member }).profile;
  const before = JSON.stringify(profile);
  for (const member of ['troop-guard', 'troop-carrier', 'unknown']) assert.ok(run(profile, { type: 'command', kind: 'troop', operation: 'hire', member }).error);
  assert.equal(JSON.stringify(profile), before);
  assert.ok(run(player('leader', 'greenwood'), { type: 'command', kind: 'troop', operation: 'hire', member: 'troop-guard' }).error);
  const poor = player(); poor.character!.gold = 0;
  assert.ok(run(poor, { type: 'command', kind: 'troop', operation: 'hire', member: 'troop-guard' }).error);
});

test('failed companion actions cause an injury or departure and treatment or renewed contract restores them', () => {
  let profile = run(player(), { type: 'command', kind: 'troop', operation: 'hire', member: 'troop-guard' }).profile;
  profile = run(profile, { type: 'command', kind: 'troop', operation: 'assign', member: 'troop-guard' }).profile;
  settleFantasyCompanions(profile, false, () => .5);
  const member = profile.character!.specialization!.companies!.troop!.members[0];
  assert.equal(member.condition, 'injured'); assert.equal(member.assigned, false); assert.equal(fantasyCompanionBonus(profile.character!).guard, 0);
  profile.character!.inventory.potion = 1;
  profile = run(profile, { type: 'command', kind: 'troop', operation: 'recover', member: 'troop-guard' }).profile;
  assert.equal(profile.character!.inventory.potion, 0);
  Object.assign(profile.character!.specialization!.companies!.troop!.members[0], { condition: 'absent', hp: 0 });
  profile = run(profile, { type: 'command', kind: 'troop', operation: 'recontract', member: 'troop-guard' }).profile;
  assert.equal(profile.character!.specialization!.companies!.troop!.members[0].condition, 'ready');
});

test('summon support requires actual MP upkeep and consumes it only when support is settled', () => {
  let profile = run(player('summoner', 'mooncity'), { type: 'command', kind: 'summons', operation: 'hire', member: 'summon-wisp' }).profile;
  profile = run(profile, { type: 'command', kind: 'summons', operation: 'assign', member: 'summon-wisp' }).profile;
  const mp = profile.character!.mp; assert.equal(fantasyCompanionBonus(profile.character!).check, 1);
  assert.equal(settleFantasyCompanions(profile, true, () => .5), 2); assert.equal(profile.character!.mp, mp - 2);
  profile.character!.mp = 0; assert.deepEqual(fantasyCompanionBonus(profile.character!), { check: 0, guard: 0 });
  assert.equal(settleFantasyCompanions(profile, true, () => .5), 0);
  assert.equal(profile.character!.specialization!.companies!.summons!.members[0].assigned, false);
});

test('magic preparation has one initial slot and unlocks a second and third at proficiency 30 and 100', () => {
  let profile = player('mage');
  assert.equal(fantasySpellCapacity(profile.character!), 1);
  assert.ok(run(profile, { type: 'magicPrepare', slot: 2, element: 'tide', form: 'mend' }).error);
  profile = run(profile, { type: 'magicPrepare', slot: 1, element: 'tide', form: 'mend' }).profile;
  profile.character!.jobXp.mage = 30; assert.equal(fantasySpellCapacity(profile.character!), 2);
  profile.character!.jobXp.mage = 100; assert.equal(fantasySpellCapacity(profile.character!), 3);
  profile = run(profile, { type: 'magicPrepare', slot: 3, element: 'stone', form: 'veil' }).profile;
  assert.ok(validFantasySpecialization(profile.character!));
  assert.ok(run(profile, { type: 'magicPrepare', slot: 4, element: 'light', form: 'mend' }).error);
});

test('prepared magic produces bounded actual healing or a nonstacking check/guard effect and consumes MP', () => {
  let profile = player('mage'); profile.character!.hp -= 30;
  profile = run(profile, { type: 'magicPrepare', slot: 1, element: 'tide', form: 'mend' }).profile;
  const before = profile.character!.hp; const mp = profile.character!.mp;
  profile = run(profile, { type: 'magicCast', slot: 1 }).profile;
  assert.equal(profile.character!.hp, before + 22); assert.equal(profile.character!.mp, mp - 10);
  profile = run(profile, { type: 'magicPrepare', slot: 1, element: 'gale', form: 'bolt' }).profile;
  profile = run(profile, { type: 'magicCast', slot: 1 }).profile;
  assert.deepEqual(profile.character!.buff, { effect: 'check', power: 4, stat: 'agility', mp: 7 });
  assert.ok(run(profile, { type: 'magicCast', slot: 1 }).error);
});

test('the actual engine applies specialty time and revision once and credits prepared magic only when consumed', () => {
  const base = player('mage');
  const prepared = applyFantasyAction(base, { type: 'magicPrepare', slot: 1, element: 'light', form: 'bolt' }, () => .999);
  assert.equal(prepared.error, undefined); assert.equal(prepared.profile.revision, base.revision + 1); assert.equal(prepared.profile.character!.hour, base.character!.hour + 1);
  const cast = applyFantasyAction(prepared.profile, { type: 'magicCast', slot: 1 }, () => .999);
  assert.equal(cast.error, undefined); assert.equal(cast.profile.character!.mp, prepared.profile.character!.mp - 8);
  assert.equal(cast.profile.character!.mana?.useXp ?? 0, 0);
  const worked = applyFantasyAction(cast.profile, { type: 'work' }, () => .999);
  assert.equal(worked.error, undefined); assert.equal(worked.profile.character!.buff, null);
  assert.ok((worked.profile.character!.mana?.useXp ?? 0) > 0);
});

test('the actual engine gives no practice for empty formation changes but a company mission has a real outcome', () => {
  const base = player();
  const hired = applyFantasyAction(base, { type: 'command', kind: 'troop', operation: 'hire', member: 'troop-guard' }, () => .999);
  assert.equal(hired.error, undefined); assert.equal(hired.profile.character!.jobXp.leader, 0);
  const assigned = applyFantasyAction(hired.profile, { type: 'command', kind: 'troop', operation: 'assign', member: 'troop-guard' }, () => .999);
  assert.equal(assigned.error, undefined); assert.equal(assigned.profile.character!.jobXp.leader, 0);
  const mission = applyFantasyAction(assigned.profile, { type: 'command', kind: 'troop', operation: 'mission' }, () => .999);
  assert.equal(mission.error, undefined); assert.ok(mission.profile.character!.jobXp.leader > 0);
  assert.equal(mission.profile.character!.specialization!.companies!.troop!.members[0].missions, 1);
});

test('alchemy uses registered formulas and actual ingredients, with proficiency dominating small random variation', () => {
  let profile = player('alchemist', 'mooncity'); const formula = FANTASY_ALCHEMY_FORMULAS[0];
  Object.assign(profile.character!.inventory, formula.inputs);
  const low = run(profile, { type: 'alchemy', formula: formula.id }); assert.equal(low.error, undefined);
  assert.equal(low.profile.character!.inventory.herb, 0); assert.equal(low.profile.character!.inventory['hp-potion-1'], 1);
  profile.character!.jobXp.alchemist = 600;
  const high = run(profile, { type: 'alchemy', formula: formula.id }); assert.equal(high.profile.character!.inventory['hp-potion-3'], 1);
  const failed = run(profile, { type: 'alchemy', formula: formula.id }, false);
  assert.equal(failed.profile.character!.inventory.herb, 1);
  assert.ok(run(player('mage', 'mooncity'), { type: 'alchemy', formula: formula.id }).error);
});

test('specialty catalogs reference existing items and localized names and duration helpers never change world time', () => {
  for (const formula of FANTASY_ALCHEMY_FORMULAS) for (const id of [...Object.keys(formula.inputs), formula.output]) assert.ok(FANTASY_ITEMS.some(item => item.id === id), id);
  for (const entity of [...FANTASY_COMPANIONS, ...FANTASY_MAGIC_COMBINATIONS, ...FANTASY_ALCHEMY_FORMULAS]) for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(entity.names[locale]);
  const profile = player(); const before = JSON.stringify(profile);
  assert.equal(fantasySpecializationHours(profile, { type: 'command', kind: 'troop', operation: 'mission' }), 4);
  assert.equal(fantasySpecializationHours(profile, { type: 'magicPrepare', slot: 1, element: 'tide', form: 'mend' }), 1);
  assert.equal(fantasySpecializationHours(profile, { type: 'alchemy', formula: 'healing' }), 3);
  assert.equal(JSON.stringify(profile), before);
});

test('new specialist residents have distinct public profiles and rule summaries never mutate or propose mana training', () => {
  assert.ok(NPC_PUBLIC.length >= 74);
  for (const id of ['hearth-daren', 'redweave-voss', 'mooncity-nalin', 'suncourt-velren', 'sunmeadow-bora']) assert.ok(NPC_PUBLIC.some(npc => npc.id === id));
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const profile = player(); const before = JSON.stringify(profile);
    assert.ok(fantasySpecializationSummary(profile.character!, locale));
    assert.ok(!fantasyGmReply(profile, 'mana enhancement', locale).suggestions.some(suggestion => suggestion.action?.type === 'manaTrain'));
    assert.equal(JSON.stringify(profile), before);
  }
});

test('job-specific mentor skills require current profession expertise and the registered proficiency threshold', () => {
  const profile = player('mage', 'mooncity');
  const npc = NPC_PUBLIC.find(npc => npc.id === 'eris')!;
  const advanced = fantasyNpcMentorSkills(npc.id, profile.character!).find(skill => skill.unlock?.kind === 'mentor');
  if (!advanced) return;
  assert.ok(fantasyApprenticeshipError(profile.character!, npc.id, advanced.id));
  profile.character!.jobXp.mage = 100;
  assert.equal(fantasyApprenticeshipError(profile.character!, npc.id, advanced.id), undefined);
  profile.character!.job = 'cook'; assert.ok(fantasyApprenticeshipError(profile.character!, npc.id, advanced.id));
});

test('story conclusions only reach NPC context after their own completed chapter and public resident count matches the expanded world', () => {
  assert.equal(NPC_PUBLIC.length, 137);
  const conclusion = FANTASY_MAIN_REVEALS.at(-1)!;
  assert.ok(!npcAllowedFacts('rin', 'trusted', { completedQuests: [] }).includes(conclusion.text.en));
  assert.ok(!npcAllowedFacts('rin', 'trusted', { completedQuests: ['main-night-01'] }).includes(conclusion.text.en));
  assert.ok(!npcAllowedFacts('rin', 'trusted', { completedQuests: [conclusion.questId] }).includes(conclusion.text.en),'a legacy completed ID cannot reveal an unplayed ending');
  const p=player('unassigned',FANTASY_FINAL_ISLE_ID);p.character!.completed=FANTASY_MAIN_QUESTS.map(quest=>quest.id);
  const ended=applyFantasyAction(p,{type:'finishVoyage'});assert.equal(ended.error,undefined);assert.equal(ended.changed,true);
  const context={completedQuests:ended.profile.character!.completed,character:ended.profile.character!};
  assert.ok(npcAllowedFacts('rin', 'trusted', context).includes(conclusion.text.en));
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const query={ko:'새벽너머섬 항해의 결말은?',en:'Tell me the voyage ending on Beyond-Dawn Isle.',ja:'暁の向こうの島への航海の結末は？'}[locale];
    const hidden = npcCanonicalReply(locale, 'rin', 'trusted', query, {completedQuests:[conclusion.questId]}) ?? '';
    assert.ok(!hidden.includes(conclusion.text[locale]));
    assert.ok(!hidden.includes(npcInformationSpeech('rin',locale,conclusion.text[locale])));
    const answer = npcCanonicalReply(locale, 'rin', 'trusted', query, context);
    assert.ok(answer?.includes(npcInformationSpeech('rin',locale,conclusion.text[locale])));
  }
});
