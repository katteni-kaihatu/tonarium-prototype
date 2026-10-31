import { fantasyCombatMoveAttempt } from './fantasy-combat-move-attempt.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { addFantasyCombatParticipant, advanceFantasyCombat, createFantasyCombat, fantasyCombatOrderError, isFantasyCombatOrder, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatOrder, type FantasyCombatPlayer } from './fantasy-combat.ts';
import { fantasyCombatCover, fantasyCombatDistance, fantasyCombatMoveRange, fantasyCombatPath, fantasyCombatWithinRange } from './fantasy-combat-tactics.ts';
import { fantasyCombatApplyCompanions, fantasyCombatPlayer } from '../server/fantasy-combat-adapter.ts';
import { newFantasyProfile, applyFantasyAction } from './fantasy-engine.ts';

const names = (value: string) => ({ ko: value, en: value, ja: value });
function hero(index = 0, companion = false): FantasyCombatPlayer {
  const stats = { hp: 250, mp: 80, attack: 40, defense: 12, agility: 30, intelligence: 35, accuracy: 95, magicResist: 10 };
  return { id: `p-${index}`, userId: `u-${index}`, generation: 1, names: names(`Hero ${index}`), stats, hp: 250, mp: 80, position: 'front', range: 'melee', skills: [],
    ...(companion ? { companions: [{ id: 'troop-guard', kind: 'troop' as const, names: names('Guard'), stats: { ...stats, hp: 40, attack: 15 }, hp: 40, mp: 10, range: 'melee' as const, skills: [] }] } : {}),
  };
}
const create = (players = [hero()], template = 'monster-stone-golem') => createFantasyCombat({ id: 'tactics', location: 'oldwatch', source: `hunt:${template}`, players, enemies: [{ id: 'enemy', template }], hour: 12, seed: 42, tactical: true });
const order = (state: ReturnType<typeof create>, user: string, action: FantasyCombatOrder) => {
  const result = submitFantasyCombatOrder(state, user, state.revision, action, state.hour);
  assert.equal(result.error, undefined); assert.ok(validFantasyCombatState(result.state)); return result.state;
};

test('tactical maps persist deterministic positions while old row-only saves remain valid', () => {
  const state = create([hero(0, true), hero(1, true)]);
  assert.ok(validFantasyCombatState(state)); assert.equal(state.battlefield?.width, 10); assert.equal(state.units?.length, 2);
  assert.deepEqual(create([hero(0, true), hero(1, true)]), state); assert.ok(validFantasyCombatState(JSON.parse(JSON.stringify(state))));
  const occupied = [...state.fighters, ...state.units!].map(f => `${f.tile!.x}:${f.tile!.y}`); assert.equal(new Set(occupied).size, occupied.length);
  const old = createFantasyCombat({ id: 'old', location: 'oldwatch', source: 'hunt:monster-stone-golem', players: [hero()], enemies: [{ id: 'enemy', template: 'monster-stone-golem' }], hour: 12, seed: 42 });
  assert.equal(old.battlefield, undefined); assert.ok(validFantasyCombatState(old));
});

test('movement uses real reachable paths, occupancy, walls, turn movement and chill', () => {
  const state = create(), actor = state.fighters[0];
  assert.equal(fantasyCombatMoveRange(actor), 3);
  assert.equal(fantasyCombatOrderError(state, 'u-0', { type: 'moveTo', tile: { x: 5, y: 1 } }), 'blocked');
  assert.equal(fantasyCombatOrderError(state, 'u-0', { type: 'moveTo', tile: { x: 4, y: 0 } }), 'blocked');
  assert.equal(fantasyCombatOrderError(state, 'u-0', { type: 'moveTo', tile: { x: 0, y: 7 } }), undefined);
  assert.ok(fantasyCombatMoveAttempt(state,actor,{x:0,y:7})!.extra > 0);
  assert.equal(fantasyCombatOrderError(state, 'u-0', { type: 'moveTo', tile: { x: 4, y: 1 } }), 'unnecessary');
  const path = fantasyCombatPath(state, actor, { x: 2, y: 2 }); assert.equal(path?.length, 4);
  const next = order(state, 'u-0', { type: 'moveTo', tile: { x: 2, y: 2 } }); assert.deepEqual(next.fighters[0].tile, { x: 2, y: 2 });
  actor.effects.push({ id: 'frost', power: 1, turns: 2 }); assert.equal(fantasyCombatMoveRange(actor), 2);
  assert.equal(isFantasyCombatOrder({ type: 'moveTo', tile: { x: 10, y: 0 } }), false);
});

test('physical range, spell reach and solid walls affect actual targets', () => {
  const state = create(), actor = state.fighters[0], target = state.fighters[1];
  assert.equal(fantasyCombatWithinRange(state, actor, target, 'melee'), true);
  target.tile = { x: 8, y: 1 }; assert.equal(fantasyCombatWithinRange(state, actor, target, 'melee'), false);
  assert.equal(fantasyCombatWithinRange(state, actor, target, 'ranged'), true);
  state.battlefield!.blocked.push({ x: 6, y: 1 }); assert.equal(fantasyCombatWithinRange(state, actor, target, 'magic'), false);
  assert.equal(fantasyCombatOrderError(state, 'u-0', { type: 'attack', target: 'enemy' }), 'range');
});

test('cover reduces actual damage with the same saved roll', () => {
  const covered = create(), open = structuredClone(covered);
  for (const state of [covered, open]) { state.fighters[0].tile = { x: 4, y: 2 }; state.fighters[1].tile = { x: 3, y: 2 }; }
  open.battlefield!.cover = [];
  assert.equal(fantasyCombatCover(covered, covered.fighters[1]), true);
  const one = order(covered, 'u-0', { type: 'attack', target: 'enemy' }), two = order(open, 'u-0', { type: 'attack', target: 'enemy' });
  assert.ok(covered.fighters[1].hp - one.fighters[1].hp < open.fighters[1].hp - two.fighters[1].hp);
});

test('companions accept separate owner-only orders and do not count as extra players or reward recipients', () => {
  let state = create([hero(0, true), hero(1, true)]); const unit = state.units![0], other = state.units![1];
  assert.equal(state.scaling.participantIds.length, 2); assert.equal(state.fighters.filter(f => f.side === 'players').length, 2);
  assert.equal(fantasyCombatOrderError(state, 'u-1', { type: 'unit', unit: unit.id, order: { type: 'guard' } }), 'not-owner');
  assert.equal(isFantasyCombatOrder({ type: 'unit', unit: unit.id, order: { type: 'item', item: 'potion', target: 'p-0' } }), false);
  state = order(state, 'u-0', { type: 'unit', unit: unit.id, order: { type: 'guard' } });
  assert.equal(fantasyCombatOrderError(state, 'u-0', { type: 'unit', unit: unit.id, order: { type: 'guard' } }), 'already-ordered');
  state = order(state, 'u-0', { type: 'guard' }); state = order(state, 'u-1', { type: 'guard' }); assert.equal(state.round, 1);
  state = order(state, 'u-1', { type: 'unit', unit: other.id, order: { type: 'guard' } }); assert.equal(state.round, 2);
  assert.deepEqual(state.unitOrders, {});
});

test('deadline guards units without inventing participation and owner withdrawal ends their independent actions', () => {
  const initial = create([hero(0, true)]), advanced = advanceFantasyCombat(initial, 12.5).state;
  assert.equal(advanced.round, 2); assert.equal(advanced.units![0].contribution.manualActions, 0); assert.equal(advanced.fighters[0].contribution.effectiveActions, 0);
  const copy = structuredClone(initial); copy.fighters[0].fled = true; copy.status = 'escaped';
  assert.equal(fantasyCombatOrderError(copy, 'u-0', { type: 'unit', unit: copy.units![0].id, order: { type: 'guard' } }), 'not-active');
});

test('a commanded companion deals actual damage and credits its commander without an independent reward slot', () => {
  let state = create([hero(0, true)]); state.units![0].tile = { x: 6, y: 1 }; state.units![0].stats.agility = 100; state.units![0].stats.accuracy = 100;
  const before = state.fighters[1].hp;
  state = order(state, 'u-0', { type: 'unit', unit: state.units![0].id, order: { type: 'attack', target: 'enemy' } });
  state = order(state, 'u-0', { type: 'guard' });
  assert.ok(state.fighters[1].hp < before); assert.ok(state.fighters[0].contribution.effectiveActions > 0);
  assert.ok(state.units![0].contribution.effectiveActions > 0);
  assert.deepEqual(state.scaling.participantIds, ['u-0']); assert.equal(state.units![0].userId, undefined);
});

test('summoned wisps use finite personal MP to heal allies and a fallen summon requires renewed agreement', () => {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Summoner', gender: 'female', source: 'human' }, () => .5).profile;
  profile.character!.job = 'summoner'; profile.character!.hp = 40;
  profile.character!.specialization = { companies: { summons: { members: [{ id: 'summon-wisp', condition: 'ready', hp: 20, assigned: true, missions: 0 }] } } };
  let state = create([fantasyCombatPlayer(profile, 'summoner')]); const unit = state.units![0];
  const before = unit.mp;
  state = order(state, 'summoner', { type: 'unit', unit: unit.id, order: { type: 'skill', skill: 'companion-mend', target: state.fighters[0].id } });
  state = order(state, 'summoner', { type: 'guard' });
  assert.equal(state.units![0].mp, before - 4); assert.ok(state.logs.some(entry => entry.text.en.includes('restores')));
  state.units![0].hp = 0; fantasyCombatApplyCompanions(profile, state, 'summoner');
  const member = profile.character!.specialization.companies!.summons!.members[0]; assert.equal(member.condition, 'absent'); assert.equal(member.assigned, false);
});

test('injured or unassigned roster members cannot enter, and defeated units persist as recoverable injuries', () => {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Captain', gender: 'male', source: 'human' }, () => .5).profile;
  profile.character!.job = 'leader'; profile.character!.specialization = { companies: { troop: { members: [
    { id: 'troop-guard', condition: 'ready', hp: 30, assigned: true, missions: 0 },
    { id: 'troop-scout', condition: 'injured', hp: 0, assigned: false, missions: 0 },
    { id: 'troop-carrier', condition: 'ready', hp: 28, assigned: false, missions: 0 },
  ] } } };
  const player = fantasyCombatPlayer(profile, 'captain'); assert.equal(player.companions?.length, 1);
  const state = create([player]); state.units![0].hp = 0;
  assert.equal(fantasyCombatApplyCompanions(profile, state, 'captain'), true);
  const member = profile.character!.specialization.companies!.troop!.members[0]; assert.equal(member.condition, 'injured'); assert.equal(member.assigned, false); assert.equal(member.hp, 0);
  assert.equal(fantasyCombatApplyCompanions(profile, state, 'captain'), false);
  profile.generation = 2; member.hp = 30; member.condition = 'ready'; assert.equal(fantasyCombatApplyCompanions(profile, state, 'captain'), false);
});

test('reinforcement raises scaling without healing prior wounds, resets choices and never shrinks on retreat', () => {
  let state = create([hero()]); state.fighters[1].hp -= 10;
  const result = addFantasyCombatParticipant(state, hero(1, true), 12.1); assert.equal(result.error, undefined); state = result.state;
  assert.ok(validFantasyCombatState(state)); assert.equal(state.scaling.participantIds.length, 2); assert.equal(state.units?.length, 1);
  assert.equal(state.fighters.find(f => f.id === 'enemy')!.stats.hp - state.fighters.find(f => f.id === 'enemy')!.hp, 10);
  assert.equal(state.revision, 1); assert.equal(state.deadline, 12.6); assert.deepEqual(state.orders, {});
  assert.equal(addFantasyCombatParticipant(state, hero(1), 12.2).error, 'not-owner');
  assert.equal(submitFantasyCombatOrder(state, 'u-0', 0, { type: 'guard' }, 12.2).error, 'stale');
  for (let index = 2; index < 6; index++) state = addFantasyCombatParticipant(state, hero(index), 12.1).state;
  assert.equal(addFantasyCombatParticipant(state, hero(6), 12.1).error, 'capacity');
});

test('forged tiles, unowned units and duplicate bindings are rejected by persisted-state validation', () => {
  const state = create([hero(0, true)]);
  const outside = structuredClone(state); outside.fighters[0].tile = { x: 99, y: 0 }; assert.equal(validFantasyCombatState(outside), false);
  const overlap = structuredClone(state); overlap.units![0].tile = overlap.fighters[0].tile; assert.equal(validFantasyCombatState(overlap), false);
  const forged = structuredClone(state); forged.units![0].companion!.ownerId = 'intruder'; assert.equal(validFantasyCombatState(forged), false);
  const duplicate = structuredClone(state), extra = structuredClone(duplicate.units![0]); extra.id += '-copy'; extra.tile = { x: 0, y: 0 }; duplicate.units!.push(extra); assert.equal(validFantasyCombatState(duplicate), false);
});
