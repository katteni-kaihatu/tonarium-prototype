import test from 'node:test';
import assert from 'node:assert/strict';
import { createFantasyCombat, fantasyCombatOrderError, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatState } from './fantasy-combat.ts';
const names = { ko: '명상', en: 'Meditation', ja: '瞑想' };
function battle() {
  const stats = { hp: 300, mp: 100, attack: 10, defense: 10, intelligence: 20, agility: 99, accuracy: 95, magicResist: 10 };
  return createFantasyCombat({ id: 'mana-battle', location: 'greenwood', source: 'hunt:monster-forest-wolf', seed: 42, hour: 12,
    players: [0, 1].map(i => ({ id: `p${i}`, userId: `u${i}`, names, generation: 1, stats: { ...stats }, hp: 300, mp: i ? 20 : 50, position: 'rear', range: 'magic',
      skills: i ? [] : [{ id: 'meditation', names, kind: 'mana', mp: 4, power: 22, range: 'magic' }] })), enemies: [{ id: 'e', template: 'monster-forest-wolf' }] });
}
function resolve(state: FantasyCombatState, target: string) {
  const first = submitFantasyCombatOrder(state, 'u0', state.revision, { type: 'skill', skill: 'meditation', target }, state.hour); assert.equal(first.error, undefined);
  const last = submitFantasyCombatOrder(first.state, 'u1', first.state.revision, { type: 'guard' }, state.hour); assert.equal(last.error, undefined); assert.ok(validFantasyCombatState(last.state)); return last;
}
test('mana support restores real allied MP, pays one caster cost and emits one effective receipt', () => {
  const result = resolve(battle(), 'p1'); assert.equal(result.state.fighters[0].mp, 46); assert.equal(result.state.fighters[1].mp, 50); assert.equal(result.state.fighters[0].manaRecoveryUsed, true);
  assert.deepEqual(result.usedSkills, [{ userId: 'u0', skill: 'meditation', mp: 4, kind: 'mana' }]);
  const saved = JSON.parse(JSON.stringify(result.state)); assert.ok(validFantasyCombatState(saved)); assert.equal(fantasyCombatOrderError(saved, 'u0', { type: 'skill', skill: 'meditation', target: 'p1' }), 'unnecessary');
});
test('self meditation has bounded net MP gain and cannot revive a downed target', () => {
  const state = battle(); const self = resolve(state, 'p0'); assert.equal(self.state.fighters[0].mp, 76);
  const down = battle(); down.fighters[1].hp = 0;
  assert.equal(fantasyCombatOrderError(down, 'u0', { type: 'skill', skill: 'meditation', target: 'p1' }), 'target');
  assert.equal(fantasyCombatOrderError(battle(), 'u0', { type: 'skill', skill: 'meditation', target: 'e' }), 'target');
});

test('self recovery near maximum restores the MP cost before clamping and never reduces mana',()=>{
  const state=battle();state.fighters[0].mp=99;
  const result=resolve(state,'p0');assert.equal(result.state.fighters[0].mp,100);
  assert.equal(result.state.fighters[0].manaRecoveryUsed,true);
  assert.equal(result.usedSkills?.filter(receipt=>receipt.kind==='mana').length,1);
});
test('unnecessary, unavailable and forged-target mana restoration never creates free MP or training', () => {
  const full = battle(); full.fighters[1].mp = 100; assert.equal(fantasyCombatOrderError(full, 'u0', { type: 'skill', skill: 'meditation', target: 'p1' }), 'unnecessary');
  const poor = battle(); poor.fighters[0].mp = 3; assert.equal(fantasyCombatOrderError(poor, 'u0', { type: 'skill', skill: 'meditation', target: 'p1' }), 'mana');
  const forged = battle(); forged.orders.u0 = { type: 'skill', skill: 'meditation', target: 'e' };
  const result = submitFantasyCombatOrder(forged, 'u1', forged.revision, { type: 'guard' }, forged.hour); assert.equal(result.error, undefined); assert.equal(result.state.fighters[0].mp, 50); assert.equal(result.state.fighters[0].manaRecoveryUsed, undefined); assert.equal(result.usedSkills, undefined);
});
