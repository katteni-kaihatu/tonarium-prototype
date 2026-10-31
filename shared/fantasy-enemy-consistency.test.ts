import test from 'node:test';
import assert from 'node:assert/strict';
import { createFantasyCombat, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatOrder, type FantasyCombatPlayer, type FantasyCombatState } from './fantasy-combat.ts';

const words = { ko: '방호 검사', en: 'Ward control', ja: '防護検査' };
const player = (): FantasyCombatPlayer => ({ id: 'p', userId: 'p', generation: 1, names: words, position: 'front', range: 'melee',
  stats: { hp: 5000, mp: 100, attack: 10, defense: 10, intelligence: 10, agility: 1, accuracy: 90, magicResist: 10 }, hp: 5000, mp: 100,
  skills: [{ id: 'test-ward', names: words, kind: 'guard', power: 5000, mp: 4, range: 'magic' }, { id: 'test-steady', names: words, kind: 'focus', power: 1, mp: 0, range: 'magic' }] });
function battle(template: string, seed = 1) {
  const state = createFantasyCombat({ id: 'enemy-consistency', location: 'sunmeadow', source: `hunt:${template}`, players: [player()], enemies: [{ id: 'foe', template }], seed, hour: 108, tactical: true });
  state.battlefield = { width: 10, height: 8, blocked: [], cover: [] }; state.fighters[0].tile = { x: 4, y: 3 }; state.fighters[1].tile = { x: 5, y: 3 };
  return state;
}
function turn(state: FantasyCombatState, order: FantasyCombatOrder = { type: 'guard' }) {
  const result = submitFantasyCombatOrder(state, 'p', state.revision, order, state.hour); assert.equal(result.error, undefined); assert.ok(result.changed); assert.ok(validFantasyCombatState(result.state)); return result.state;
}
function prepared(template: string, seed = 1) {
  let state = battle(template, seed); state = turn(state); state = turn(state); assert.equal(state.round, 3); assert.ok(state.fighters[1].enemyCharge); return state;
}
const ward: FantasyCombatOrder = { type: 'skill', skill: 'test-ward', target: 'p' };
const steady: FantasyCombatOrder = { type: 'skill', skill: 'test-steady', target: 'p' };

test('a fully absorbed Lich release applies neither its secondary vulnerability nor damage-triggered curse', () => {
  const initial = prepared('monster-lich'), hp = initial.fighters[0].hp;
  const control = turn(structuredClone(initial), steady); assert.ok(control.fighters[0].hp < hp); assert.ok(control.fighters[0].miracles?.afflictions?.includes('curse'));
  const shielded = turn(initial, ward); assert.equal(shielded.fighters[0].hp, hp);
  assert.ok(!shielded.fighters[0].conditions?.some(condition => condition.id === 'vulnerable'));
  assert.ok(!shielded.fighters[0].miracles?.afflictions?.includes('curse'));
});

test('a fully absorbed flame release cannot apply the damage-triggered burn that lands in an unwarded control', () => {
  let observedBurn = false;
  for (let seed = 1; seed <= 16; seed++) {
    const initial = prepared('monster-flame-lizard', seed), hp = initial.fighters[0].hp, control = turn(structuredClone(initial), steady);
    observedBurn ||= control.fighters[0].effects.some(effect => effect.id === 'burn');
    const shielded = turn(initial, ward); assert.equal(shielded.fighters[0].hp, hp); assert.ok(!shielded.fighters[0].effects.some(effect => effect.id === 'burn'), `seed ${seed}`);
  }
  assert.ok(observedBurn);
});

test('a fully absorbed Wight release cannot steal HP without damaging the guarded target', () => {
  const initial = prepared('monster-wight'); initial.fighters[1].hp -= 50;
  const hp = initial.fighters[0].hp, enemyHp = initial.fighters[1].hp;
  const control = turn(structuredClone(initial), steady); assert.ok(control.fighters[0].hp < hp); assert.ok(control.fighters[1].hp > enemyHp);
  const shielded = turn(initial, ward); assert.equal(shielded.fighters[0].hp, hp); assert.equal(shielded.fighters[1].hp, enemyHp);
});

test('a new golem uses its charged action without also gaining the consumed legacy guard', () => {
  const initial = prepared('monster-stone-golem'), next = turn(initial, steady);
  assert.ok(next.logs.some(log => log.round === 3 && log.presentation?.kind === 'attack' && log.presentation.skill === 'enemy-golem-3'));
  assert.ok(!next.logs.some(log => log.round === 3 && log.text.en.includes('braces its guard')));
});

test('a saved golem with legacy empty skills still spends round three guarding instead of attacking', () => {
  let state = battle('monster-stone-golem'); state.fighters[1].skills = []; state = turn(state); state = turn(state);
  const hp = state.fighters[0].hp, next = turn(state, steady);
  assert.equal(next.fighters[0].hp, hp); assert.ok(next.logs.some(log => log.round === 3 && log.text.en.includes('braces its guard')));
  assert.ok(!next.logs.some(log => log.round === 3 && log.presentation?.kind === 'attack' && log.presentation.actor === 'foe'));
});
