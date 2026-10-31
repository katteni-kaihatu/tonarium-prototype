import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyCombatDashLanding, fantasyCombatSkillMovePath, fantasyCombatSkillMoveRange } from './fantasy-combat-movement.ts';
import { createFantasyCombat, isFantasyCombatOrder, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatFighter, type FantasyCombatSkill, type FantasyCombatState } from './fantasy-combat.ts';
import { fantasyCombatAttackTiles } from './fantasy-attack-shapes.ts';

const names = { ko: '기동', en: 'Mobility', ja: '機動' };
const move: FantasyCombatSkill = { id: 'reposition', names, kind: 'focus', power: 1, mp: 7, motion: { kind: 'reposition', distance: 6 } };
const dash: FantasyCombatSkill = { id: 'dash', names, kind: 'attack', power: 9, mp: 10, reach: 3, range: 'melee', shape: 'line', secondaryDamage: 75, motion: { kind: 'dash', distance: 4 } };
function fixture() {
  const actor = { id: 'p', side: 'players', hp: 100, fled: false, tile: { x: 1, y: 3 }, effects: [], conditions: [], range: 'melee' } as unknown as FantasyCombatFighter;
  const target = { id: 'e', side: 'enemies', hp: 100, fled: false, tile: { x: 4, y: 3 } } as unknown as FantasyCombatFighter;
  const battle = { fighters: [actor, target], battlefield: { width: 10, height: 8, blocked: [], cover: [] } } as unknown as FantasyCombatState;
  return { actor, target, battle };
}
test('tactical reposition uses path distance and respects roots frost occupied ends and obstacles', () => {
  const { actor, target, battle } = fixture(); target.tile = { x: 9, y: 7 };
  assert.equal(fantasyCombatSkillMovePath(battle, actor, move, { x: 7, y: 3 })?.length, 7);
  actor.effects = [{ id: 'frost', power: 1, turns: 2 }]; assert.equal(fantasyCombatSkillMoveRange(actor, move), 5);
  assert.equal(fantasyCombatSkillMovePath(battle, actor, move, { x: 7, y: 3 }), undefined);
  actor.effects = []; actor.conditions = [{ id: 'root', power: 1, turns: 2 }]; assert.equal(fantasyCombatSkillMoveRange(actor, move), 0);
  actor.conditions = []; target.tile = { x: 7, y: 3 }; assert.equal(fantasyCombatSkillMovePath(battle, actor, move, target.tile), undefined);
});
test('piercing dash crosses enemies to behind target while approach stops before and cannot cross them', () => {
  const { actor, target, battle } = fixture();
  const middle = { ...target, id: 'middle', tile: { x: 3, y: 3 } }; battle.fighters.push(middle);
  assert.deepEqual(fantasyCombatDashLanding(battle, actor, target, dash), { x: 5, y: 3 });
  assert.ok(fantasyCombatAttackTiles(battle, actor, target.tile!, dash).some(tile => tile.x === 3 && tile.y === 3));
  middle.side = 'players'; assert.equal(fantasyCombatDashLanding(battle, actor, target, dash), undefined);
  battle.fighters.pop();
  const advance: FantasyCombatSkill = { ...dash, shape: 'single', reach: 4, motion: { kind: 'advance', distance: 3 } };
  assert.deepEqual(fantasyCombatDashLanding(battle, actor, target, advance), { x: 3, y: 3 });
  battle.fighters.push({ ...target, id: 'block', tile: { x: 2, y: 3 } });
  assert.equal(fantasyCombatDashLanding(battle, actor, target, advance), undefined);
  battle.fighters.pop(); battle.battlefield!.blocked.push({ x: 5, y: 3 });
  assert.equal(fantasyCombatDashLanding(battle, actor, target, dash), undefined);
});
test('movement orders are server validated and consume one MP payment and skill receipt', () => {
  const stats = { hp: 500, mp: 100, attack: 30, defense: 30, agility: 500, intelligence: 10, accuracy: 100, magicResist: 30 };
  const battle = createFantasyCombat({ id: 'movement', source: 'hunt:monster-stone-golem', location: 'oldwatch', hour: 12, seed: 42, tactical: true,
    players: [{ id: 'p', userId: 'u', generation: 1, names, stats, hp: 500, mp: 100, range: 'melee', position: 'front', skills: [move] }], enemies: [{ id: 'e', template: 'monster-stone-golem' }] });
  battle.battlefield = { width: 10, height: 8, blocked: [], cover: [] }; battle.fighters[0].tile = { x: 1, y: 3 }; battle.fighters[1].tile = { x: 9, y: 6 };
  const order = { type: 'skillMove' as const, skill: move.id, tile: { x: 7, y: 3 } };
  assert.ok(isFantasyCombatOrder(order)); assert.equal(isFantasyCombatOrder({ ...order, distance: 99 }), false);
  const result = submitFantasyCombatOrder(battle, 'u', battle.revision, order, battle.hour);
  assert.equal(result.error, undefined); assert.ok(validFantasyCombatState(result.state));
  assert.deepEqual(result.state.fighters[0].tile, order.tile); assert.equal(result.state.fighters[0].mp, 93);
  assert.equal(result.usedSkills?.filter(use => use.skill === move.id).length, 1);
});

function movingAttackBattle(art: FantasyCombatSkill, hp = 500) {
  const stats = { hp: 500, mp: 100, attack: 30, defense: 30, agility: 500, intelligence: 10, accuracy: 100, magicResist: 30 };
  const state = createFantasyCombat({ id: 'moving-attack', source: 'hunt:monster-stone-golem', location: 'oldwatch', hour: 12, seed: 42, tactical: true,
    players: [{ id: 'p', userId: 'u', generation: 1, names, stats, hp, mp: 100, range: 'melee', position: 'front', skills: [art] }], enemies: [{ id: 'e', template: 'monster-stone-golem' }] });
  state.battlefield = { width: 10, height: 8, blocked: [], cover: [] };
  state.fighters[0].tile = { x: 1, y: 3 }; state.fighters[1].tile = { x: 4, y: 3 };
  state.fighters[1].stats.hp = state.fighters[1].hp = 1000; state.fighters[1].stats.agility = 0;
  return state;
}
test('approach moves before attacking and cannot strike after dying along its approach', () => {
  const art: FantasyCombatSkill = { ...dash, id: 'advance', reach: 4, shape: 'single', motion: { kind: 'advance', distance: 3 } };
  const state = movingAttackBattle(art, 1);
  state.fields = [{ kind: 'fire', tile: { x: 3, y: 3 }, power: 8, source: 'e', expiresRound: 4, appliedRound: {} }];
  const result = submitFantasyCombatOrder(state, 'u', state.revision, { type: 'skill', skill: art.id, target: 'e' }, state.hour);
  assert.equal(result.error, undefined); assert.equal(result.state.fighters[0].hp, 0);
  assert.equal(result.state.fighters[1].hp, 1000); assert.equal(result.state.fighters[0].mp, 90);
  assert.deepEqual(result.state.fighters[0].tile, { x: 3, y: 3 });
  assert.equal(result.usedSkills?.filter(use => use.skill === art.id).length, 1);
});
test('piercing attack pays once and visits hazardous cells before landing behind its target', () => {
  const state = movingAttackBattle(dash);
  state.fields = [{ kind: 'poison', tile: { x: 2, y: 3 }, power: 2, source: 'e', expiresRound: 4, appliedRound: {} }];
  const result = submitFantasyCombatOrder(state, 'u', state.revision, { type: 'skill', skill: dash.id, target: 'e' }, state.hour);
  assert.equal(result.error, undefined); assert.deepEqual(result.state.fighters[0].tile, { x: 5, y: 3 });
  assert.equal(result.state.fighters[0].mp, 90); assert.ok(result.state.fighters[0].hp <= 498);
  assert.equal(result.usedSkills?.filter(use => use.skill === dash.id).length, 1);
  assert.ok(validFantasyCombatState(result.state));
});
