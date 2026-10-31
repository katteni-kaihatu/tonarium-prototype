import test from 'node:test';
import assert from 'node:assert/strict';
import { createFantasyCombat, fantasyCombatOrderError, submitFantasyCombatOrder, type FantasyCombatSkill } from './fantasy-combat.ts';
const names = { ko: '사제', en: 'Priest', ja: '司祭' };
function battle(skill: FantasyCombatSkill, tactical = true, count = 2) {
  const stats = { hp: 500, mp: 100, attack: 10, defense: 100, intelligence: 10, agility: 100, accuracy: 100, magicResist: 100 };
  const state = createFantasyCombat({ id: 'support-range', source: 'hunt:monster-forest-wolf', location: 'greenwood', seed: 42, hour: 12, tactical,
    players: Array.from({ length: count }, (_, index) => ({ id: `p${index}`, userId: `u${index}`, names, generation: 1, stats: { ...stats }, hp: 100, mp: 100, position: 'rear' as const, range: 'melee' as const, skills: index ? [] : [skill] })), enemies: [{ id: 'e', template: 'monster-forest-wolf' }] });
  if (tactical) { state.fighters[0].tile = { x: 1, y: 3 }; state.fighters[1].tile = { x: 3, y: 3 }; if (count === 3) state.fighters[2].tile = { x: 4, y: 3 }; state.fighters[count].tile = { x: 8, y: 6 }; }
  return state;
}
const healing: FantasyCombatSkill = { id: 'healing', names, kind: 'heal', mp: 5, power: 10, magic: true, reach: 2, radius: 0 };

test('support orders check actual positive reach and retain zero-range self healing', () => {
  for (const kind of ['heal', 'guard', 'blessing', 'mana'] as const) {
    const s = battle({ ...healing, kind }); s.fighters[1].mp = 10;
    assert.equal(fantasyCombatOrderError(s, 'u0', { type: 'skill', skill: 'healing', target: 'p1' }), undefined);
    s.fighters[1].tile = { x: 4, y: 3 };
    assert.equal(fantasyCombatOrderError(s, 'u0', { type: 'skill', skill: 'healing', target: 'p1' }), 'range');
    s.fighters[0].skills[0].reach = 0;
    assert.equal(fantasyCombatOrderError(s, 'u0', { type: 'skill', skill: 'healing', target: 'p1' }), 'range');
    assert.equal(fantasyCombatOrderError(s, 'u0', { type: 'skill', skill: 'healing', target: 'p0' }), kind === 'mana' ? 'unnecessary' : undefined);
  }
});
test('zero reach support cannot target another traveler in a legacy row battle', () => {
  const s = battle({ ...healing, reach: 0 }, false);
  assert.equal(fantasyCombatOrderError(s, 'u0', { type: 'skill', skill: 'healing', target: 'p1' }), 'range');
});
test('an allied healing splash cannot extend beyond the caster reach and ordinary single-target healing uses magic reach', () => {
  const splash = battle({ ...healing, radius: 2 }, true, 3);
  const first = submitFantasyCombatOrder(splash, 'u0', splash.revision, { type: 'skill', skill: 'healing', target: 'p1' }, splash.hour);
  const second = submitFantasyCombatOrder(first.state, 'u1', first.state.revision, { type: 'guard' }, first.state.hour);
  const done = submitFantasyCombatOrder(second.state, 'u2', second.state.revision, { type: 'guard' }, second.state.hour);
  assert.ok(done.state.fighters[0].hp > 100); assert.ok(done.state.fighters[1].hp > 100); assert.equal(done.state.fighters[2].hp, 100);
  const normal = battle({ id: 'healing', names, kind: 'heal', mp: 5, power: 10 });
  assert.equal(fantasyCombatOrderError(normal, 'u0', { type: 'skill', skill: 'healing', target: 'p1' }), undefined);
});
