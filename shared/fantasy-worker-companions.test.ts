import assert from 'node:assert/strict';
import test from 'node:test';
import type { FantasyProfile } from './fantasy.ts';
import { applyFantasyAction, newFantasyProfile, fantasyStats } from './fantasy-engine.ts';
import { FANTASY_BUSINESS_WORKERS } from './fantasy-worker-catalog.ts';
import { enlistFantasyWorkerCompanion, fantasyHasWorkerCompany, fantasyIsWorkerCompanion, fantasyWorkerCompanionId, fantasyWorkerCompanionCombat, fantasyWorkerCompanionLevel } from './fantasy-worker-companions.ts';
import { applyFantasySpecialization, fantasyActiveCompanions, fantasyCompanionBonus, settleFantasyCompanions, validFantasySpecialization, FANTASY_COMPANIONS, type FantasySpecializationAction } from './fantasy-specializations.ts';
import { fantasyCombatPlayer, fantasyCombatApplyCompanions } from '../server/fantasy-combat-adapter.ts';
import { createFantasyCombat, submitFantasyCombatOrder, validFantasyCombatState } from './fantasy-combat.ts';

const workers = FANTASY_BUSINESS_WORKERS.filter(worker => !!worker.combatJob);
function player(job = 'cook') {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Employer', gender: 'female' }, () => .5).profile;
  p.character!.job = job; p.character!.jobXp[job] = 0; p.character!.hour = 12; p.character!.gold = 10000; p.character!.inventory.potion = 4;
  return p;
}
function enlist(p: FantasyProfile, index = 0, level = 3) {
  const worker = workers[index]; return enlistFantasyWorkerCompanion(p, { ...worker, job: worker.combatJob!, level });
}
function command(p: FantasyProfile, action: FantasySpecializationAction) {
  return applyFantasySpecialization(p, action, () => .8, { stats: fantasyStats(p.character!), check: () => true,
    addItem: (profile, item, count) => { profile.character!.inventory[item] = (profile.character!.inventory[item] ?? 0) + count; },
    hurt: (profile, amount) => { profile.character!.hp = Math.max(0, profile.character!.hp - amount); } })!;
}
function assign(p: FantasyProfile, index = 0) { const result = command(p, { type: 'command', kind: 'troop', operation: 'assign', member: fantasyWorkerCompanionId(workers[index].id) }); assert.equal(result.error, undefined); return result.profile; }

test('ordinary professions can enlist only real combat candidates with levels 1..6 and cannot bypass the hiring ledger with raw hire', () => {
  const p = player(); assert.ok(enlist(p)); assert.ok(fantasyHasWorkerCompany(p.character!)); assert.ok(validFantasySpecialization(p.character!));
  const member = p.character!.specialization!.companies!.troop!.members[0]; assert.equal(member.workerLevel, 3); assert.ok(fantasyIsWorkerCompanion(member.id));
  assert.equal(enlist(p), false); assert.equal(enlist(player(), 0, 0), false); assert.equal(enlist(player(), 0, 7), false); assert.equal(enlist(player(), 0, 1.5), false);
  const before = structuredClone(p); assert.ok(command(p, { type: 'command', kind: 'troop', operation: 'hire', member: member.id }).error); assert.deepEqual(p, before);
  const leader = player('leader'); assert.ok(command(leader, { type: 'command', kind: 'troop', operation: 'hire', member: member.id }).error);
  const artisan = FANTASY_BUSINESS_WORKERS.find(worker => !worker.combatJob)!;
  assert.equal(enlistFantasyWorkerCompanion(player(), { ...artisan, level: 2 }), false);
});
test('ordinary job keeps an old leader roster while enlisting and commanding its employed fighters only', () => {
  const p = player(), c = p.character!; c.jobXp.leader = 100;
  c.specialization = { companies: { troop: { members: FANTASY_COMPANIONS.filter(template => template.kind === 'troop' && !fantasyIsWorkerCompanion(template.id)).map(template => ({ id: template.id, hp: template.hp, condition: 'ready', assigned: false, missions: 0 })) } } };
  assert.ok(enlist(p)); assert.ok(enlist(p, 1)); assert.equal(enlist(p, 2), false); assert.ok(validFantasySpecialization(c));
  const active = assign(p); assert.equal(fantasyActiveCompanions(active.character!).length, 1);
  assert.ok(command(active, { type: 'command', kind: 'troop', operation: 'assign', member: 'troop-guard' }).error);
  assert.ok(command(active, { type: 'command', kind: 'syndicate', operation: 'hire', member: 'syndicate-runner' }).error);
  assert.ok(command(active, { type: 'command', kind: 'summons', operation: 'hire', member: 'summon-wisp' }).error);
});
test('combat assignment cap combines worker troops with the current crimeboss or summoner company', () => {
  for (const job of ['crimeboss', 'summoner']) {
    let p = player(job); assert.ok(enlist(p)); assert.ok(enlist(p, 1));
    const kind = job === 'crimeboss' ? 'syndicate' as const : 'summons' as const, id = job === 'crimeboss' ? 'syndicate-runner' : 'summon-wisp';
    const template = FANTASY_COMPANIONS.find(template => template.id === id)!;
    p.character!.specialization!.companies![kind] = { members: [{ id, hp: template.hp, condition: 'ready', assigned: true, missions: 0 }] };
    p = assign(p); assert.equal(fantasyActiveCompanions(p.character!).length, 2);
    assert.ok(command(p, { type: 'command', kind: 'troop', operation: 'assign', member: fantasyWorkerCompanionId(workers[1].id) }).error);
    const actor = fantasyCombatPlayer(p, 'employer'); assert.equal(actor.companions!.length, 2); assert.ok(actor.companions!.some(unit => fantasyIsWorkerCompanion(unit.id))); assert.ok(actor.companions!.some(unit => unit.id === id));
  }
});
test('worker member strict shape preserves old five-field saves and rejects forged levels, wrong kinds and extra fields', () => {
  const p = player(); enlist(p); const c = p.character!, member = c.specialization!.companies!.troop!.members[0];
  delete member.workerLevel; assert.ok(validFantasySpecialization(c));
  for (const level of [-1, 0, 7, 1.5, NaN, Infinity]) { member.workerLevel = level; assert.equal(validFantasySpecialization(c), false); }
  member.workerLevel = 3; assert.ok(validFantasySpecialization(c));
  (member as unknown as Record<string, unknown>).power = 999; assert.equal(validFantasySpecialization(c), false); delete (member as unknown as Record<string, unknown>).power;
  const leader = player('leader'), template = FANTASY_COMPANIONS.find(template => template.id === 'troop-guard')!;
  leader.character!.specialization = { companies: { troop: { members: [{ id: template.id, hp: template.hp, condition: 'ready', assigned: false, missions: 0, workerLevel: 2 }] } } };
  assert.equal(validFantasySpecialization(leader.character!), false);
});
test('worker battle stats and job skills reflect hired level and existing mission growth independently of the employer profession', () => {
  for (const [index, worker] of workers.entries()) {
    let p = player(); enlist(p, index, 1); p = assign(p, index);
    const member = p.character!.specialization!.companies!.troop!.members[0], base = fantasyWorkerCompanionCombat(member)!;
    assert.equal(base.job, worker.combatJob); assert.ok(base.skills.length >= 2); for (const skill of base.skills) for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(skill.names[locale]);
    member.workerLevel = 6; member.missions = 32; const grown = fantasyWorkerCompanionCombat(member)!;
    assert.equal(fantasyWorkerCompanionLevel(member), 10); assert.ok(grown.stats.hp > base.stats.hp); assert.ok(grown.stats.attack > base.stats.attack);
    const actor = fantasyCombatPlayer(p, 'employer'), unit = actor.companions![0]; assert.equal(unit.range, grown.range); assert.deepEqual(unit.skills, grown.skills);
    if (worker.combatJob === 'priest') assert.ok(unit.skills.some(skill => skill.kind === 'heal'));
    if (worker.combatJob === 'mage') assert.ok(unit.skills.some(skill => skill.magic && skill.damageType === 'fire'));
    if (worker.combatJob === 'archer' || worker.combatJob === 'ranger') assert.equal(unit.range, 'ranged');
  }
});
test('worker injury, treatment, absence and renewed agreement retain growth and remove invalid combat support', () => {
  let p = player(); enlist(p); p = assign(p); const member = p.character!.specialization!.companies!.troop!.members[0];
  assert.ok(fantasyCompanionBonus(p.character!).guard > 0); settleFantasyCompanions(p, false, () => .8);
  assert.equal(member.condition, 'injured'); assert.equal(member.missions, 1); assert.equal(fantasyCombatPlayer(p, 'employer').companions, undefined);
  p = command(p, { type: 'command', kind: 'troop', operation: 'recover', member: member.id }).profile;
  const healed = p.character!.specialization!.companies!.troop!.members[0]; assert.equal(healed.condition, 'ready'); assert.equal(healed.workerLevel, 3); assert.equal(healed.missions, 1); assert.equal(p.character!.inventory.potion, 3);
  Object.assign(healed, { condition: 'absent', hp: 0, assigned: false });
  p = command(p, { type: 'command', kind: 'troop', operation: 'recontract', member: healed.id }).profile;
  assert.equal(p.character!.specialization!.companies!.troop!.members[0].condition, 'ready'); assert.equal(p.character!.specialization!.companies!.troop!.members[0].workerLevel, 3);
  const removed = command(p, { type: 'command', kind: 'troop', operation: 'dismiss', member: healed.id }); assert.equal(removed.error, undefined); assert.equal(fantasyHasWorkerCompany(removed.profile.character!), false);
});
test('existing combat ownership prevents another player ordering an employed fighter and persists a fallen worker as injured', () => {
  let p = player(); enlist(p); p = assign(p); const owner = fantasyCombatPlayer(p, 'employer'), peer = fantasyCombatPlayer(player('warrior'), 'peer');
  const battle = createFantasyCombat({ id: 'worker-battle', location: 'hearth', source: 'qa-workers', hour: 12, seed: 7, players: [owner, peer], enemies: [{ id: 'enemy', template: 'monster-skeleton-guard', position: 'front' }] });
  const unit = battle.units![0]; assert.ok(validFantasyCombatState(battle));
  const attempted = submitFantasyCombatOrder(battle, 'peer', battle.revision, { type: 'unit', unit: unit.id, order: { type: 'guard' } }, 12);
  assert.equal(attempted.error, 'not-owner');
  unit.hp = 0; assert.ok(fantasyCombatApplyCompanions(p, battle, 'employer'));
  const member = p.character!.specialization!.companies!.troop!.members[0]; assert.equal(member.hp, 0); assert.equal(member.condition, 'injured'); assert.equal(member.assigned, false); assert.equal(member.workerLevel, 3);
  assert.ok(validFantasySpecialization(p.character!));
});
