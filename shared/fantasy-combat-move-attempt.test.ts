import test from 'node:test';
import assert from 'node:assert/strict';
import type { FantasyCombatFighter, FantasyCombatState } from './fantasy-combat.ts';
import { fantasyCombatMoveAttempt } from './fantasy-combat-move-attempt.ts';

function battle(agility = 10) {
  const actor: FantasyCombatFighter = { names: { ko: '이동', en: 'Mover', ja: '移動' }, position: 'front', skills: [], fled: false, guarding: false, ward: 0, contribution: { effectiveActions: 0, activeRounds: 0, manualActions: 0 }, id: 'mover', side: 'players', hp: 100, mp: 20, stats: { hp: 100, mp: 20, attack: 10, defense: 10, intelligence: 10, agility, accuracy: 90, magicResist: 10 }, tile: { x: 1, y: 1 }, range: 'melee', effects: [], conditions: [] };
  const state = { round: 1, seed: 99, status: 'active', fighters: [actor], battlefield: { width: 10, height: 8, blocked: [], cover: [], obstacles: [] } } as unknown as FantasyCombatState;
  return { state, actor };
}

test('normal AGI distance succeeds certainly, with the precise beyond-range d20 chance', () => {
  const { state, actor } = battle();
  for (const [x, distance, extra, threshold, chance] of [[3,2,0,0,1],[4,3,1,18,.15],[5,4,2,19,.1],[6,5,3,20,.05],[9,8,6,20,.05]]) {
    const result = fantasyCombatMoveAttempt(state, actor, { x, y: 1 }); assert.ok(result);
    assert.equal(result.distance, distance); assert.equal(result.normalDistance, 2); assert.equal(result.extra, extra); assert.equal(result.threshold, threshold); assert.equal(result.chance, chance);
    assert.deepEqual(result.failureTile, { x: 3, y: 1 });
  }
});

test('AGI, haste and chill alter the same normal range used by actual movement', () => {
  const { state, actor } = battle(19), target = { x: 5, y: 1 };
  assert.equal(fantasyCombatMoveAttempt(state, actor, target)!.normalDistance, 2);
  actor.stats.agility = 20; assert.equal(fantasyCombatMoveAttempt(state, actor, target)!.normalDistance, 3);
  actor.stats.agility = 40; assert.equal(fantasyCombatMoveAttempt(state, actor, target)!.chance, 1);
  actor.stats.agility = 100; assert.equal(fantasyCombatMoveAttempt(state, actor, target)!.normalDistance, 4);
  actor.conditions = [{ id: 'haste', power: 2, turns: 2 }]; assert.equal(fantasyCombatMoveAttempt(state, actor, { x: 6, y: 1 })!.normalDistance, 5);
  actor.effects = [{ id: 'frost', power: 1, turns: 3 }]; assert.equal(fantasyCombatMoveAttempt(state, actor, target)!.normalDistance, 4);
});

test('route distance counts detours rather than jumping through a blocked tile', () => {
  const { state, actor } = battle(); state.battlefield!.blocked = [{ x: 2, y: 1 }];
  const result = fantasyCombatMoveAttempt(state, actor, { x: 3, y: 1 }); assert.ok(result);
  assert.equal(result.distance, 4); assert.equal(result.extra, 2); assert.equal(result.chance, .1);
  assert.ok(result.path.every(tile => tile.x !== 2 || tile.y !== 1)); assert.deepEqual(result.failureTile, result.path[2]);
  state.battlefield!.blocked = Array.from({ length: 8 }, (_, y) => ({ x: 2, y }));
  assert.equal(fantasyCombatMoveAttempt(state, actor, { x: 3, y: 1 }), undefined);
});

test('body passage and carrying use real path rules, with carried weight reducing standard distance', () => {
  const { state, actor } = battle(40); actor.body = { small: true }; state.battlefield!.obstacles = [{ kind: 'low-wall', tile: { x: 2, y: 1 } }];
  assert.equal(fantasyCombatMoveAttempt(state, actor, { x: 3, y: 1 })!.distance, 2);
  actor.carrying = 'patient';
  const carrying = fantasyCombatMoveAttempt(state, actor, { x: 3, y: 1 })!;
  assert.equal(carrying.distance, 4); assert.equal(carrying.normalDistance, 2); assert.equal(carrying.extra, 2); assert.equal(carrying.chance, .1);
  delete actor.carrying; actor.externalCarrying = { user: 'patient', generation: 1 };
  assert.equal(fantasyCombatMoveAttempt(state, actor, { x: 3, y: 1 })!.normalDistance, 2);
});

test('root, occupied destinations, same tile, blocked cells and board bounds cannot become lucky moves', () => {
  const { state, actor } = battle();
  state.fighters.push({ ...actor, id: 'other', tile: { x: 3, y: 1 } });
  for (const tile of [{ x: 3, y: 1 }, { x: 1, y: 1 }, { x: 10, y: 1 }, { x: -1, y: 1 }, { x: 2.5, y: 1 }]) assert.equal(fantasyCombatMoveAttempt(state, actor, tile), undefined);
  state.battlefield!.blocked.push({ x: 2, y: 1 }); assert.equal(fantasyCombatMoveAttempt(state, actor, { x: 2, y: 1 }), undefined);
  actor.conditions = [{ id: 'root', power: 3, turns: 2 }]; assert.equal(fantasyCombatMoveAttempt(state, actor, { x: 1, y: 2 }), undefined);
  actor.conditions = []; actor.hp = 0; assert.equal(fantasyCombatMoveAttempt(state, actor, { x: 1, y: 2 }), undefined);
});

test('preview never consumes seed or mutates input, and returned routes do not alias actor tiles', () => {
  const { state, actor } = battle(), before = structuredClone(state), tile = { x: 9, y: 7 }, result = fantasyCombatMoveAttempt(state, actor, tile)!;
  assert.equal(result.chance, .05); assert.deepEqual(state, before); assert.deepEqual(tile, { x: 9, y: 7 });
  const differentSeed = { ...state, seed: 123456 }; assert.deepEqual(fantasyCombatMoveAttempt(differentSeed, actor, tile), result);
  result.path[0].x = 99; result.failureTile.x = 99; assert.deepEqual(actor.tile, { x: 1, y: 1 }); assert.deepEqual(state, before);
});
