import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceFantasyCombat, createFantasyCombat, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatSkill, type FantasyCombatState } from './fantasy-combat.ts';
import { fantasyCombatApplyFields, fantasyCombatCreateFields } from './fantasy-combat-fields.ts';
import { fantasyCombatMoveRange, fantasyCombatPath } from './fantasy-combat-tactics.ts';
import { FANTASY_ALCHEMY_SYNTHESIS_ITEMS } from './fantasy-alchemy-catalog.ts';

const names = { ko: '시험', en: 'Test', ja: '試験' };
function battle() {
  const stats = { hp: 500, mp: 100, attack: 10, defense: 100, intelligence: 10, agility: 100, accuracy: 100, magicResist: 100 };
  const skill = { id: 'prepared-spell-1', names, kind: 'attack', mp: 5, power: 10, reach: 8, radius: 1, magic: true, field: 'fire' } as FantasyCombatSkill;
  const s = createFantasyCombat({ id: 'fields', source: 'hunt:monster-forest-wolf', location: 'greenwood', seed: 42, hour: 12, tactical: true,
    players: [{ id: 'p', userId: 'u', names, generation: 1, stats, hp: 500, mp: 100, position: 'rear', range: 'magic', skills: [skill] }], enemies: [{ id: 'e', template: 'monster-forest-wolf' }] });
  s.fighters[0].tile = { x: 1, y: 3 }; s.fighters[1].tile = { x: 5, y: 3 }; s.fighters[1].hp = s.fighters[1].stats.hp = 1000; s.fighters[1].stats.agility = 0; s.fighters[1].stats.attack = 0;
  return s;
}
function cast(s = battle()) { return submitFantasyCombatOrder(s, 'u', s.revision, { type: 'skill', skill: 'prepared-spell-1', target: 'e' }, s.hour); }

test('a synthesized flame leaves visible persistent fire at its actual cast center and expires after bounded rounds', () => {
  const result = cast(); assert.equal(result.error, undefined);
  assert.ok(result.state.fields?.some(field => field.kind === 'fire' && field.tile.x === 5 && field.tile.y === 3));
  assert.ok(validFantasyCombatState(JSON.parse(JSON.stringify(result.state))));
  const later = advanceFantasyCombat(result.state, result.state.deadline + 2).state;
  assert.deepEqual(later.fields, []);
});

test('persistent tiles affect both sides once per round and never invent repeated skill receipts', () => {
  const initial = cast().state, control = structuredClone(initial); control.fields = [];
  initial.fighters[0].tile = { x: 5, y: 2 }; control.fighters[0].tile = { x: 5, y: 2 };
  initial.fighters[1].tile = { x: 6, y: 3 }; control.fighters[1].tile = { x: 6, y: 3 };
  const hit = advanceFantasyCombat(initial, initial.deadline), ordinary = advanceFantasyCombat(control, control.deadline);
  assert.equal(ordinary.state.fighters[0].hp - hit.state.fighters[0].hp, 2);
  assert.equal(ordinary.state.fighters[1].hp - hit.state.fighters[1].hp, 2);
  assert.equal(hit.usedSkills, undefined);
});

test('persisted fields reject forged power, lifetime, ownership, kind and coordinates', () => {
  const initial = cast().state; assert.ok(initial.fields?.length);
  for (const patch of [{ power: 99 }, { expiresRound: 9999 }, { source: 'invented' }, { kind: 'instant-death' }, { tile: { x: -1, y: 0 } }, { appliedRound: { invented: 1 } }]) {
    const s = structuredClone(initial); Object.assign(s.fields![0], patch); assert.equal(validFantasyCombatState(s), false);
  }
});

test('field damage can finish combat and cannot revive a downed target', () => {
  const s = cast().state; s.fighters[1].tile = { x: 5, y: 3 }; s.fighters[1].hp = 1;
  assert.equal(advanceFantasyCombat(s, s.deadline).state.status, 'victory');
  const down = cast().state; down.fighters[0].hp = 0;
  assert.equal(advanceFantasyCombat(down, down.deadline).state.fighters[0].hp, 0);
});

test('walking across multiple allied fire tiles takes one dose even after the turn-start dose', () => {
  const s = battle(), actor = s.fighters[0]; s.fighters[1].tile = { x: 9, y: 6 };
  fantasyCombatCreateFields(s, actor, actor.tile!, actor.skills[0]);
  const control = structuredClone(s); control.fields = [];
  const move = (state: FantasyCombatState) => submitFantasyCombatOrder(state, 'u', state.revision, { type: 'moveTo', tile: { x: 2, y: 3 } }, state.hour).state;
  const burned = move(s), ordinary = move(control);
  assert.deepEqual(burned.fighters[0].tile, { x: 2, y: 3 }); assert.equal(ordinary.fighters[0].hp - burned.fighters[0].hp, 2);
});

test('same-kind recasts refresh rather than stack, while frost and storm apply bounded real debuffs', () => {
  const s = battle(), actor = s.fighters[0], skill = actor.skills[0];
  fantasyCombatCreateFields(s, actor, actor.tile!, skill); const count = s.fields!.length;
  s.round = 2; fantasyCombatCreateFields(s, actor, actor.tile!, skill);
  assert.equal(s.fields!.length, count); assert.equal(s.fields![0].expiresRound, 5);
  for (const kind of ['frost', 'storm'] as const) fantasyCombatCreateFields(s, actor, actor.tile!, { ...skill, field: kind });
  const range = fantasyCombatMoveRange(actor); fantasyCombatApplyFields(s, actor);
  assert.equal(fantasyCombatMoveRange(actor), range - 1); assert.equal(actor.conditions?.find(condition => condition.id === 'blind')?.power, 2);
  const hp = actor.hp; assert.deepEqual(fantasyCombatApplyFields(s, actor), []); assert.equal(actor.hp, hp);
});

test('NPC routing prefers a safe detour over a direct harmful field', () => {
  const s = battle(), actor = s.fighters[1]; actor.tile = { x: 5, y: 3 }; s.fighters[0].tile = { x: 1, y: 1 };
  fantasyCombatCreateFields(s, s.fighters[0], { x: 4, y: 3 }, { ...s.fighters[0].skills[0], radius: 0 });
  assert.ok(fantasyCombatPath(s, actor, { x: 3, y: 3 })!.some(tile => tile.x === 4 && tile.y === 3));
  const safe = fantasyCombatPath(s, actor, { x: 3, y: 3 }, true)!;
  assert.ok(!safe.some(tile => tile.x === 4 && tile.y === 3)); assert.equal(safe.length, 5);
});

test('summons receive field damage while a downed summon stays down and earns no field XP', () => {
  const s = battle(), actor = s.fighters[0]; s.fighters[1].tile = { x: 9, y: 6 };
  const unit = { ...structuredClone(actor), id: 'summon', userId: undefined, generation: undefined, tile: { x: 2, y: 3 }, hp: 30,
    companion: { ownerId: 'u', generation: 1, member: 'summon-wisp', kind: 'summons' as const } };
  s.units = [unit]; s.unitOrders = {};
  fantasyCombatCreateFields(s, actor, unit.tile, { ...actor.skills[0], radius: 0 });
  const result = advanceFantasyCombat(s, s.deadline); assert.equal(result.state.units![0].hp, 28); assert.equal(result.usedSkills, undefined);
  result.state.units![0].hp = 0;
  assert.equal(advanceFantasyCombat(result.state, result.state.deadline).state.units![0].hp, 0);
});

test('catalog fire, frost and acid flasks persist their fields while consuming one item and no spell credit', () => {
  for (const [itemId, field] of [['fire-bomb', 'fire'], ['frost-flask', 'frost'], ['acid-flask', 'poison']] as const) {
    const s = battle(), item = FANTASY_ALCHEMY_SYNTHESIS_ITEMS.find(item => item.id === itemId)!;
    const combat = { id: `item-${item.id}`, names, ...item.combatUse!, mp: 0 } as FantasyCombatSkill;
    const options = { supplies: { u: { [item.id]: { count: 1, names, combat } } } };
    const result = submitFantasyCombatOrder(s, 'u', s.revision, { type: 'item', item: item.id, target: 'e' }, s.hour, options);
    assert.equal(result.error, undefined); assert.ok(result.state.fields?.some(entry => entry.kind === field)); assert.equal(result.state.fighters[0].mp, 100);
    assert.deepEqual(result.spentItems, [{ userId: 'u', item: item.id, count: 1 }]); assert.equal(result.usedSkills, undefined);
    assert.ok(validFantasyCombatState(JSON.parse(JSON.stringify(result.state))));
  }
});

export { battle, cast };
