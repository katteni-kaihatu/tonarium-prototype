import assert from 'node:assert/strict';
import test from 'node:test';
import { addFantasyCombatParticipant, advanceFantasyCombat, createFantasyCombat, fantasyCombatOrderError, isFantasyCombatOrder, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatOrder, type FantasyCombatPlayer, type FantasyCombatState } from './fantasy-combat.ts';
import { fantasyCombatActors, fantasyCombatMoveRange, fantasyCombatPath } from './fantasy-combat-tactics.ts';
import { fantasyEscortAdvanceTile, fantasyEscortAtExit, fantasyEscortBattleWon, fantasyEscortCanCommand } from './fantasy-escort-battle.ts';

function hero(n = 0): FantasyCombatPlayer {
  const stats = { hp: 300, mp: 80, attack: 80, defense: 30, agility: 40, intelligence: 50, accuracy: 100, magicResist: 20 };
  return { id: `p-${n}`, userId: `u-${n}`, generation: 1, names: { ko: `호위자${n}`, en: `Escort ${n}`, ja: `護衛${n}` }, stats, hp: stats.hp, mp: stats.mp, position: 'front', range: 'melee',
    skills: [{ id: 'ward', names: { ko: '방벽', en: 'Ward', ja: '防壁' }, kind: 'guard', power: 50, mp: 6 }, { id: 'fire', names: { ko: '화염', en: 'Flame', ja: '炎' }, kind: 'attack', power: 30, magic: true, range: 'magic', mp: 6 }] };
}
function battle(count = 1, seed = 42, leader?: string, template = 'monster-cave-slime') {
  return createFantasyCombat({ id: 'escort-test', location: 'hearth', source: 'escort:contract-test', players: Array.from({ length: count }, (_, n) => hero(n)), enemies: [{ id: 'enemy', template }], hour: 12, seed, tactical: true,
    escort: { owner: 'u-0', contractId: 'contract-test', destination: 'sunmeadow', ...(leader ? { leader } : {}) } });
}
function choose(state: FantasyCombatState, user: string, order: FantasyCombatOrder) {
  const result = submitFantasyCombatOrder(state, user, state.revision, order, state.hour); assert.equal(result.error, undefined); assert.equal(result.changed, true); assert.ok(validFantasyCombatState(result.state)); return result.state;
}
function guardedRound(state: FantasyCombatState, wagon: 'guard' | { x: number; y: number } = 'guard') {
  let next = state;
  for (const player of next.fighters.filter(f => f.side === 'players' && f.hp > 0 && !f.fled)) next = choose(next, player.userId!, { type: 'guard' });
  return choose(next, next.escort!.owner, { type: 'escort', order: wagon === 'guard' ? { type: 'guard' } : { type: 'moveTo', tile: wagon } });
}

test('a real caravan target has independent HP and occupancy without adding players or companions', () => {
  const state = battle(6); assert.ok(validFantasyCombatState(state)); assert.equal(state.scaling.participantIds.length, 6); assert.equal(state.fighters.length, 7); assert.equal(state.units, undefined);
  assert.equal(fantasyCombatActors(state).length, 8); assert.equal(state.escort!.wagon.skills.length, 0); assert.equal(state.escort!.wagon.stats.hp, 250); assert.equal(fantasyCombatMoveRange(state.escort!.wagon), 2);
  assert.ok(validFantasyCombatState(JSON.parse(JSON.stringify(state)))); assert.deepEqual(battle(6), state);
});
test('escort creation requires tactical ground, the exact contract source and an actual commander', () => {
  const input = { id: 'test', location: 'hearth', source: 'escort:contract-test', players: [hero()], enemies: [{ id: 'enemy', template: 'monster-cave-slime' }], seed: 1, hour: 12, tactical: true, escort: { owner: 'u-0', contractId: 'contract-test', destination: 'sunmeadow' } };
  assert.throws(() => createFantasyCombat({ ...input, tactical: false })); assert.throws(() => createFantasyCombat({ ...input, source: 'hunt:test' })); assert.throws(() => createFantasyCombat({ ...input, escort: { ...input.escort, owner: 'outsider' } }));
  assert.throws(() => createFantasyCombat({ ...input, escort: { ...input.escort, destination: 'unknown' } })); assert.throws(() => createFantasyCombat({ ...input, escort: undefined }));
});
test('the owner or bound leader commands the wagon once, while every player still controls their own action', () => {
  let state = battle(3, 42, 'u-1'); assert.ok(fantasyEscortCanCommand(state, 'u-0')); assert.ok(fantasyEscortCanCommand(state, 'u-1')); assert.equal(fantasyEscortCanCommand(state, 'u-2'), false);
  assert.equal(fantasyCombatOrderError(state, 'u-2', { type: 'escort', order: { type: 'guard' } }), 'not-owner');
  state = choose(state, 'u-1', { type: 'escort', order: { type: 'guard' } }); assert.deepEqual(state.orders, {}); assert.equal(state.round, 1);
  assert.equal(fantasyCombatOrderError(state, 'u-0', { type: 'escort', order: { type: 'guard' } }), 'already-ordered');
  assert.equal(fantasyCombatOrderError(state, 'u-2', { type: 'guard' }), undefined);
  assert.equal(isFantasyCombatOrder({ type: 'unit', unit: 'fake', order: { type: 'escort', order: { type: 'guard' } } }), false);
});
test('movement orders use the real wagon path, walls, occupied tiles and a two-tile range', () => {
  const state = battle(), before = structuredClone(state);
  assert.equal(fantasyCombatOrderError(state, 'u-0', { type: 'escort', order: { type: 'moveTo', tile: { x: 1, y: 4 } } }), 'unnecessary');
  assert.equal(fantasyCombatOrderError(state, 'u-0', { type: 'escort', order: { type: 'moveTo', tile: { x: 4, y: 1 } } }), 'blocked');
  assert.equal(fantasyCombatOrderError(state, 'u-0', { type: 'escort', order: { type: 'moveTo', tile: { x: 9, y: 4 } } }), 'blocked');
  state.battlefield!.blocked.push({ x: 2, y: 4 }); assert.equal(fantasyCombatOrderError(state, 'u-0', { type: 'escort', order: { type: 'moveTo', tile: { x: 3, y: 4 } } }), 'blocked');
  const next = guardedRound(before, { x: 3, y: 4 }); assert.deepEqual(next.escort!.wagon.tile, { x: 3, y: 4 }); assert.deepEqual(before.escort!.wagon.tile, { x: 1, y: 4 });
});
test('a body action alone waits for a separate wagon order, and a deadline leaves the wagon guarding in place', () => {
  const original = battle(), waiting = choose(original, 'u-0', { type: 'guard' }); assert.equal(waiting.round, 1); assert.deepEqual(waiting.escort!.wagon.tile, original.escort!.wagon.tile);
  const deadline = advanceFantasyCombat(waiting, waiting.deadline); assert.ok(deadline.changed); assert.ok(validFantasyCombatState(deadline.state)); assert.equal(deadline.state.round, 2); assert.deepEqual(deadline.state.escort!.wagon.tile, original.escort!.wagon.tile);
  assert.equal(deadline.state.escort!.order, undefined); assert.equal(deadline.state.escort!.orderedBy, undefined);
});
test('killing the attackers alone does not finish an escort; the living wagon must reach the actual exit', () => {
  let state = battle(); state.fighters.find(fighter => fighter.side === 'enemies')!.hp = 1; assert.ok(validFantasyCombatState(state));
  state = choose(state, 'u-0', { type: 'skill', skill: 'fire', target: 'enemy' }); state = choose(state, 'u-0', { type: 'escort', order: { type: 'guard' } });
  assert.equal(state.fighters.find(f => f.side === 'enemies')!.hp, 0); assert.equal(state.status, 'active');
  for (let n = 0; n < 5 && state.status === 'active'; n++) { const tile = fantasyEscortAdvanceTile(state); assert.ok(tile); state = guardedRound(state, tile); }
  assert.equal(state.status, 'victory'); assert.ok(fantasyEscortAtExit(state)); assert.ok(fantasyEscortBattleWon(state)); assert.ok(validFantasyCombatState(state));
});
test('reaching the exit with living attackers does not allow a free victory', () => {
  let state = battle(); state.escort!.wagon.tile = { x: 8, y: 4 }; state = guardedRound(state, { x: 9, y: 4 });
  assert.ok(fantasyEscortAtExit(state)); assert.equal(state.status, 'active'); assert.equal(fantasyEscortBattleWon(state), false);
});
test('enemies can destroy the wagon and fail the contract while heroes are still alive', () => {
  let state = battle(); state.fighters[0].tile = { x: 8, y: 7 }; state.fighters[1].tile = { x: 2, y: 4 }; state.escort!.wagon.hp = 1;
  for (let n = 0; n < 8 && state.status === 'active'; n++) state = guardedRound(state);
  assert.equal(state.escort!.wagon.hp, 0); assert.equal(state.status, 'defeat'); assert.ok(state.fighters[0].hp > 0); assert.equal(fantasyEscortBattleWon(state), false); assert.ok(validFantasyCombatState(state));
});
test('wagon guard and real cover reduce enemy damage instead of adding unearned healing', () => {
  let checked = false;
  for (let seed = 1; seed <= 20 && !checked; seed++) {
    const state = battle(1, seed, undefined, 'monster-goblin-raider'); state.fighters[0].tile = { x: 8, y: 7 }; state.fighters[1].tile = { x: 2, y: 4 };
    const guarded = guardedRound(state), moving = guardedRound(structuredClone(state), { x: 1, y: 5 });
    const guardedLoss = state.escort!.wagon.hp - guarded.escort!.wagon.hp, movingLoss = state.escort!.wagon.hp - moving.escort!.wagon.hp;
    if (movingLoss > 1) {
      assert.ok(guardedLoss < movingLoss);
      const covered = structuredClone(state); covered.battlefield!.cover.push({ ...state.escort!.wagon.tile! }); const shielded = guardedRound(covered, { x: 1, y: 5 });
      assert.ok(state.escort!.wagon.hp - shielded.escort!.wagon.hp < movingLoss); checked = true;
    }
  }
  assert.ok(checked);
});
test('players can place a real ward on the wagon and receive credit when that ward absorbs damage', () => {
  let checked = false;
  for (let seed = 1; seed <= 20 && !checked; seed++) {
    const state = battle(1, seed); state.fighters[0].tile = { x: 1, y: 6 }; state.fighters[1].tile = { x: 2, y: 4 };
    const unprotected = guardedRound(structuredClone(state)); if (unprotected.escort!.wagon.hp === state.escort!.wagon.hp) continue;
    let protectedState = choose(state, 'u-0', { type: 'skill', skill: 'ward', target: state.escort!.wagon.id }); protectedState = choose(protectedState, 'u-0', { type: 'escort', order: { type: 'guard' } });
    assert.equal(protectedState.escort!.wagon.hp, state.escort!.wagon.hp); assert.equal(protectedState.fighters[0].mp, state.fighters[0].mp - 6); assert.ok(protectedState.fighters[0].contribution.effectiveActions > 0); checked = true;
  }
  assert.ok(checked);
});
test('movement is rechecked after hero moves, so two actors cannot occupy the selected wagon tile', () => {
  let state = battle(); state = choose(state, 'u-0', { type: 'escort', order: { type: 'moveTo', tile: { x: 3, y: 4 } } });
  state = choose(state, 'u-0', { type: 'moveTo', tile: { x: 3, y: 4 } });
  assert.deepEqual(state.fighters[0].tile, { x: 3, y: 4 }); assert.deepEqual(state.escort!.wagon.tile, { x: 1, y: 4 }); assert.ok(state.logs.some(entry => /blocked route/.test(entry.text.en)));
});
test('late party arrival preserves caravan HP and clears all pending orders for the new round revision', () => {
  let state = battle(); state.escort!.wagon.hp -= 20; state = choose(state, 'u-0', { type: 'escort', order: { type: 'guard' } });
  const join = addFantasyCombatParticipant(state, hero(1), 12); assert.equal(join.error, undefined); assert.ok(validFantasyCombatState(join.state)); assert.equal(join.state.escort!.wagon.hp, state.escort!.wagon.hp); assert.equal(join.state.escort!.order, undefined); assert.equal(join.state.escort!.orderedBy, undefined); assert.deepEqual(join.state.orders, {});
});
test('caravan status damage and losing every authorized commander end the contract without inventing hero deaths', () => {
  let state = battle(); state.escort!.wagon.effects = [{ id: 'burn', power: state.escort!.wagon.hp, turns: 1 }]; state = guardedRound(state); assert.equal(state.status, 'defeat'); assert.ok(state.fighters[0].hp > 0);
  const none = battle(2); none.fighters[0].hp = 0; none.status = 'defeat'; assert.ok(validFantasyCombatState(none)); assert.equal(fantasyEscortBattleWon(none), false);
});
test('forged caravan metadata, extra resources, overlap, false victory and impossible saved stats are rejected', () => {
  const original = battle();
  for (const mutate of [(s: any) => { s.escort.owner = 'outsider'; }, (s: any) => { s.escort.ownerGeneration++; }, (s: any) => { s.escort.exit = { x: 0, y: 0 }; }, (s: any) => { s.escort.wagon.stats.hp++; }, (s: any) => { s.escort.wagon.userId = 'u-0'; }, (s: any) => { s.escort.wagon.tile = s.fighters[0].tile; }, (s: any) => { s.status = 'victory'; }, (s: any) => { s.escort = null; }, (s: any) => { s.escort.order = { type: 'attack', target: 'enemy' }; s.escort.orderedBy = 'u-0'; }]) {
    const forged = structuredClone(original); mutate(forged); assert.equal(validFantasyCombatState(forged), false);
  }
  assert.ok(fantasyCombatPath(original, original.escort!.wagon, { x: 3, y: 4 }));
});
