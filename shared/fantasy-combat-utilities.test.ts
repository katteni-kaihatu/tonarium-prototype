import test from 'node:test';
import assert from 'node:assert/strict';
import { createFantasyCombat, fantasyCombatOrderError, fantasyCombatHitChance, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatSkill, type FantasyCombatState } from './fantasy-combat.ts';
import { fantasyCombatMoveRange } from './fantasy-combat-tactics.ts';
const names = { ko: '상태 기술', en: 'Utility', ja: '状態技' };
const skill = (utility: string, kind: 'boon' | 'hex' = 'boon'): FantasyCombatSkill => ({ id: 'utility', names, kind, utility, power: 8, mp: 5, range: 'magic' });
function battle(ability = skill('regen'), enemy = 'monster-forest-wolf') {
  const stats = { hp: 500, mp: 100, attack: 50, defense: 10, intelligence: 20, agility: 50, accuracy: 90, magicResist: 10 };
  const state = createFantasyCombat({ id: 'utility-battle', location: 'greenwood', source: `hunt:${enemy}`, seed: 42, hour: 12, tactical: true,
    players: [0, 1].map(i => ({ id: `p${i}`, userId: `u${i}`, names, generation: 1, stats: { ...stats }, hp: 500, mp: 100, position: 'front', range: 'melee', skills: i ? [] : [ability] })), enemies: [{ id: 'e', template: enemy }] });
  state.fighters[0].tile = { x: 4, y: 2 }; state.fighters[1].tile = { x: 2, y: 3 }; state.fighters[2].tile = { x: 5, y: 2 }; state.fighters[2].hp = state.fighters[2].stats.hp = 1000;
  return state;
}
function round(state: FantasyCombatState, own: Parameters<typeof submitFantasyCombatOrder>[3]) {
  const one = submitFantasyCombatOrder(state, 'u0', state.revision, own, state.hour); assert.equal(one.error, undefined);
  const two = submitFantasyCombatOrder(one.state, 'u1', one.state.revision, { type: 'guard' }, state.hour); assert.equal(two.error, undefined); assert.ok(validFantasyCombatState(two.state)); return two;
}
test('regeneration costs MP, heals a living ally each round and credits only the first actual recovery', () => {
  const state = battle(); state.fighters[1].hp = 200;
  const one = round(state, { type: 'skill', skill: 'utility', target: 'p1' }); assert.equal(one.state.fighters[0].mp, 95); assert.equal(one.state.fighters[1].hp, 208); assert.equal(one.state.fighters[1].conditions?.[0].turns, 2);
  assert.equal(one.usedSkills?.filter(use => use.kind === 'utility').length, 1);
  const two = round(one.state, { type: 'guard' }); assert.equal(two.state.fighters[1].hp, 216); assert.equal(two.usedSkills?.length ?? 0, 0);
  const three = round(two.state, { type: 'guard' }); assert.equal(three.state.fighters[1].hp, 224); assert.equal(three.state.fighters[1].conditions?.length ?? 0, 0);
});
test('haste changes real mobility and evasion while blind and clarity change the common hit formula', () => {
  const state = battle(skill('haste')); state.fighters[1].stats.agility = 0;
  const one = round(state, { type: 'skill', skill: 'utility', target: 'p1' }).state;
  assert.equal(fantasyCombatMoveRange(one.fighters[1]), fantasyCombatMoveRange(state.fighters[1]) + 1);
  const base = fantasyCombatHitChance(state, state.fighters[2], state.fighters[1]); assert.ok(fantasyCombatHitChance(one, one.fighters[2], one.fighters[1]).accuracy < base.accuracy);
  const plain = battle(); plain.fighters[0].conditions = [{ id: 'blind', power: 8, turns: 3 }]; assert.ok(fantasyCombatHitChance(plain, plain.fighters[0], plain.fighters[2]).accuracy < fantasyCombatHitChance(state, state.fighters[0], state.fighters[2]).accuracy);
  plain.fighters[0].conditions = [{ id: 'clarity', power: 8, turns: 3 }]; const magic = { ...skill('clarity'), kind: 'attack' as const, magic: true }; assert.ok(fantasyCombatHitChance(plain, plain.fighters[0], plain.fighters[2], magic).accuracy > fantasyCombatHitChance(state, state.fighters[0], state.fighters[2], magic).accuracy);
});
test('weaken reduces outgoing damage and vulnerability increases actual received damage', () => {
  const initial = battle(), weakened = structuredClone(initial), exposed = structuredClone(initial);
  weakened.fighters[0].conditions = [{ id: 'weaken', power: 10, turns: 3 }]; exposed.fighters[2].conditions = [{ id: 'vulnerable', power: 10, turns: 3 }];
  const action = { type: 'attack' as const, target: 'e' }, base = round(initial, action).state.fighters[2].hp;
  assert.ok(round(weakened, action).state.fighters[2].hp > base); assert.ok(round(exposed, action).state.fighters[2].hp < base);
});
test('lifesteal and thorns produce real HP changes without recursive reflection', () => {
  const initial = battle(), drained = structuredClone(initial); initial.fighters[0].hp = drained.fighters[0].hp = 200; drained.fighters[0].conditions = [{ id: 'lifesteal', power: 12, turns: 3 }];
  const action = { type: 'attack' as const, target: 'e' }; assert.ok(round(drained, action).state.fighters[0].hp > round(initial, action).state.fighters[0].hp);
  let reflected = false;
  for (let seed = 1; seed < 30 && !reflected; seed++) { const plain = battle(); plain.seed = seed; const spiky = structuredClone(plain); spiky.fighters[0].conditions = [{ id: 'thorns', power: 8, turns: 3 }]; spiky.fighters[2].conditions = [{ id: 'thorns', power: 8, turns: 3 }]; const one = round(spiky, { type: 'guard' }), two = round(plain, { type: 'guard' }); reflected = one.state.fighters[2].hp < two.state.fighters[2].hp; }
  assert.ok(reflected);
});
test('root and silence block real movement and MP skills; cleansing removes hostile conditions and preserves boons', () => {
  const rooted = battle(); rooted.fighters[0].conditions = [{ id: 'root', power: 8, turns: 3 }, { id: 'silence', power: 8, turns: 3 }];
  assert.equal(fantasyCombatOrderError(rooted, 'u0', { type: 'moveTo', tile: { x: 3, y: 2 } }), 'blocked'); assert.equal(fantasyCombatOrderError(rooted, 'u0', { type: 'skill', skill: 'utility', target: 'p0' }), 'silenced');
  const clean = battle({ id: 'utility', names, kind: 'cleanse', power: 1, mp: 5, range: 'magic', reach: 8 }); clean.fighters[1].conditions = [{ id: 'haste', power: 3, turns: 3 }, { id: 'silence', power: 8, turns: 3 }];
  const result = round(clean, { type: 'skill', skill: 'utility', target: 'p1' }); assert.deepEqual(result.state.fighters[1].conditions?.map(status => status.id), ['haste']); assert.equal(result.state.fighters[0].mp, 95);
});
test('resolve absorbs real damage and is consumed to block one hostile status, while bleed damages over time', () => {
  const protectedState = battle(skill('root', 'hex')); protectedState.fighters[2].conditions = [{ id: 'resolve', power: 8, turns: 3 }];
  const blocked = round(protectedState, { type: 'skill', skill: 'utility', target: 'e' }); assert.ok(!blocked.state.fighters[2].conditions?.some(status => status.id === 'root')); assert.ok(!blocked.state.fighters[2].conditions?.some(status => status.id === 'resolve'));
  const bleeding = battle(skill('bleed', 'hex')); const result = round(bleeding, { type: 'skill', skill: 'utility', target: 'e' }); assert.equal(result.state.fighters[2].hp, 992); assert.equal(result.usedSkills?.filter(use => use.kind === 'utility').length, 1);
});
test('utility targets and persistence reject wrong sides, unknown IDs, stacking and forged origins', () => {
  const state = battle(); assert.equal(fantasyCombatOrderError(state, 'u0', { type: 'skill', skill: 'utility', target: 'e' }), 'target');
  const hex = battle(skill('blind', 'hex')); assert.equal(fantasyCombatOrderError(hex, 'u0', { type: 'skill', skill: 'utility', target: 'p1' }), 'target');
  for (const bad of [[{ id: 'unknown', power: 2, turns: 3 }], [{ id: 'haste', power: 99, turns: 3 }], [{ id: 'haste', power: 2, turns: 4 }], [{ id: 'haste', power: 2, turns: 3 }, { id: 'haste', power: 2, turns: 3 }]]) { const forged = structuredClone(state); Object.assign(forged.fighters[0], { conditions: bad }); assert.equal(validFantasyCombatState(forged), false); }
});

test('unused utility buffs expire without a receipt and cannot stack or fabricate a source', () => {
  const state = battle(skill('clarity'));
  let one = round(state, { type: 'skill', skill: 'utility', target: 'p1' }); assert.equal(one.usedSkills, undefined);
  assert.equal(fantasyCombatOrderError(one.state, 'u0', { type: 'skill', skill: 'utility', target: 'p1' }), 'unnecessary');
  const forged = structuredClone(one.state); forged.fighters[1].conditions![0].source!.owner = 'outsider'; assert.equal(validFantasyCombatState(forged), false);
  one = round(one.state, { type: 'guard' }); one = round(one.state, { type: 'guard' }); assert.equal(one.usedSkills, undefined); assert.equal(one.state.fighters[1].conditions?.length, 0);
});

test('silenced enemies spend no mana and rooted enemies cannot approach a distant target', () => {
  const rooted = battle(skill('root', 'hex')); rooted.fighters[2].tile = { x: 8, y: 2 };
  const bound = round(rooted, { type: 'skill', skill: 'utility', target: 'e' }); assert.deepEqual(bound.state.fighters[2].tile, rooted.fighters[2].tile); assert.equal(bound.usedSkills?.filter(use => use.kind === 'utility').length, 1);
  const state = battle(skill('silence', 'hex'), 'monster-lich'); state.fighters[2].stats.mp = state.fighters[2].mp = 40;
  const quiet = round(state, { type: 'skill', skill: 'utility', target: 'e' }); assert.equal(quiet.state.fighters[2].mp, 40); assert.equal(quiet.usedSkills?.filter(use => use.kind === 'utility').length, 1);
});

test('canonical vocation bonuses change actual matching attacks and previews without helping unrelated targets', () => {
  const state = battle(), matching = structuredClone(state); matching.fighters[0].vocation = { job: 'hunter' };
  assert.ok(fantasyCombatHitChance(matching, matching.fighters[0], matching.fighters[2]).accuracy > fantasyCombatHitChance(state, state.fighters[0], state.fighters[2]).accuracy);
  const action = { type: 'attack' as const, target: 'e' }; assert.ok(round(matching, action).state.fighters[2].hp < round(state, action).state.fighters[2].hp);
  const forged = structuredClone(state); Object.assign(forged.fighters[0], { vocation: { job: 'hunter', path: 'mage-flame' } }); assert.equal(validFantasyCombatState(forged), false);
});
