import test from 'node:test';
import assert from 'node:assert/strict';
import { createFantasyCombat, fantasyCombatOrderError, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatOrder, type FantasyCombatPlayer, type FantasyCombatState } from './fantasy-combat.ts';
import { fantasyCombatPlaceObstacle, fantasyCombatTileKey } from './fantasy-combat-tactics.ts';
import { FANTASY_MIRACLES } from './fantasy-miracle-catalog.ts';

const player = (): FantasyCombatPlayer => ({ id: 'player', userId: 'reference', names: { ko: '모험가', en: 'Adventurer', ja: '冒険者' }, generation: 1, position: 'rear', range: 'ranged',
  stats: { hp: 445, mp: 219, attack: 146, defense: 59, agility: 26, intelligence: 21, accuracy: 85, magicResist: 31 }, hp: 445, mp: 219, skills: [] });
function turn(state: FantasyCombatState, order: FantasyCombatOrder) {
  const result = submitFantasyCombatOrder(state, 'reference', state.revision, order, state.hour);
  assert.equal(result.error, undefined); assert.ok(result.changed); assert.ok(validFantasyCombatState(result.state));
  return result;
}
function preparedLich() {
  let state = createFantasyCombat({ id: 'enemy-counters', location: 'sunmeadow', source: 'hunt:monster-lich', players: [player()], enemies: [{ id: 'foe', template: 'monster-lich' }], seed: 2, hour: 108, tactical: true });
  state = turn(state, { type: 'guard' }).state;
  state = turn(state, { type: 'guard' }).state;
  assert.equal(state.round, 3); assert.ok(state.fighters[1].enemyCharge);
  return state;
}
function withDefenses() {
  const state = preparedLich(), names = { ko: '준비', en: 'Ready', ja: '備え' };
  state.fighters[0].skills = [{ id: 'steady', names, kind: 'focus', power: 1, mp: 0, range: 'magic' }, { id: 'ward', names, kind: 'guard', power: 100, mp: 4, range: 'magic' }];
  return state;
}
const steady: FantasyCombatOrder = { type: 'skill', skill: 'steady', target: 'player' };

test('Resolve blocks the actual Lich release secondary condition that lands in the unprotected control', () => {
  const initial = preparedLich(), protectedState = structuredClone(initial);
  protectedState.fighters[0].conditions = [{ id: 'resolve', power: 12, turns: 3 }];
  const attack: FantasyCombatOrder = { type: 'attack', target: 'foe' };
  const control = turn(initial, attack), protectedResult = turn(protectedState, attack);
  assert.ok(control.state.fighters[0].conditions?.some(condition => condition.id === 'vulnerable'));
  assert.ok(control.state.fighters[0].hp < initial.fighters[0].hp);
  assert.ok(!protectedResult.state.fighters[0].conditions?.some(condition => condition.id === 'vulnerable'));
  assert.ok(!protectedResult.state.fighters[0].conditions?.some(condition => condition.id === 'resolve'));
  assert.ok(protectedResult.state.fighters[0].hp > control.state.fighters[0].hp);
});

test('guard and a legal ward absorb real charged damage against the same non-damaging control action', () => {
  const initial = withDefenses(), hp = initial.fighters[0].hp;
  const control = turn(structuredClone(initial), steady).state;
  const guarded = turn(structuredClone(initial), { type: 'guard' }).state;
  const warded = turn(structuredClone(initial), { type: 'skill', skill: 'ward', target: 'player' }).state;
  const damage = hp - control.fighters[0].hp;
  assert.ok(damage > 0);
  assert.ok(hp - guarded.fighters[0].hp > 0); assert.ok(hp - guarded.fighters[0].hp < damage);
  assert.ok(hp - warded.fighters[0].hp < damage);
  assert.equal(warded.fighters[0].mp, initial.fighters[0].mp - 4);
  assert.ok(!guarded.fighters[0].conditions?.some(condition => condition.id === 'vulnerable'));
});

test('a legal slow-player move exits the locked burst before release without moving its recorded area', () => {
  const initial = withDefenses(), hp = initial.fighters[0].hp, charge = structuredClone(initial.fighters[1].enemyCharge!);
  const destination = { x: 1, y: 4 }, order: FantasyCombatOrder = { type: 'moveTo', tile: destination };
  assert.ok(initial.fighters[1].stats.agility > initial.fighters[0].stats.agility);
  assert.ok(!charge.tiles.some(tile => fantasyCombatTileKey(tile) === fantasyCombatTileKey(destination)));
  assert.equal(fantasyCombatOrderError(initial, 'reference', order), undefined);
  assert.ok(turn(structuredClone(initial), steady).state.fighters[0].hp < hp);
  const moved = turn(initial, order).state;
  assert.deepEqual(moved.fighters[0].tile, destination); assert.equal(moved.fighters[0].hp, hp);
  assert.equal(moved.fighters[1].enemyCharge, undefined);
  const release = moved.logs.find(entry => entry.round === charge.resolvesRound && entry.presentation?.skill === charge.skill && entry.presentation.kind === 'attack');
  assert.deepEqual(release?.presentation?.tiles, charge.tiles);
});

test('new sight-blocking cover prevents a locked release from damaging the shielded victim', () => {
  const initial = withDefenses(), shielded = structuredClone(initial), hp = initial.fighters[0].hp;
  assert.ok(fantasyCombatPlaceObstacle(shielded, 'boulder', { x: 3, y: 1 }));
  assert.ok(validFantasyCombatState(shielded));
  assert.ok(turn(initial, steady).state.fighters[0].hp < hp);
  const protectedState = turn(shielded, steady).state;
  assert.equal(protectedState.fighters[0].hp, hp);
  assert.equal(protectedState.fighters[1].enemyCharge, undefined);
});

test('the real calamity miracle protects its marked tile from the prepared Lich release', () => {
  const initial = withDefenses(), safe = structuredClone(initial), hp = initial.fighters[0].hp;
  const miracle = FANTASY_MIRACLES.find(entry => entry.id === 'miracle-divide-calamity')!.skill;
  safe.fighters[0].vocation = { job: 'priest', path: 'priest-saint' };
  safe.fighters[0].skills.push(structuredClone(miracle));
  assert.ok(turn(initial, steady).state.fighters[0].hp < hp);
  const protectedState = turn(safe, { type: 'skill', skill: miracle.id, target: 'player' }).state;
  assert.equal(protectedState.fighters[0].hp, hp);
  assert.equal(protectedState.fighters[0].mp, safe.fighters[0].mp - miracle.mp);
  assert.ok(!protectedState.fighters[0].conditions?.some(condition => condition.id === 'vulnerable'));
  assert.equal(protectedState.fighters[1].enemyCharge, undefined);
});
