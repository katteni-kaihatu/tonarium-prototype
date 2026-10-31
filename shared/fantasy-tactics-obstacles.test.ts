import test from 'node:test';
import assert from 'node:assert/strict';
import { isFantasyCombatOrder } from './fantasy-combat.ts';
import { fantasyCombatCoverTile, fantasyCombatPlaceObstacle, fantasyCombatBarricadeField, fantasyCombatRangedTiles, fantasyCombatBreakObstacle, fantasyCombatField, fantasyCombatLineOfSight, fantasyCombatPath, fantasyCombatValidField } from './fantasy-combat-tactics.ts';
import type { FantasyCombatFighter, FantasyCombatState } from './fantasy-combat.ts';
import type { FantasyCombatBattlefield, FantasyCombatTile } from './fantasy-combat-tactics.ts';

const fighter = (id: string, tile: FantasyCombatTile, body?: { small?: boolean; large?: boolean; flying?: boolean }) =>
  ({ id, side: 'players', hp: 10, fled: false, tile, ...(body ? { body } : {}) } as unknown as FantasyCombatFighter);
const state = (battlefield: FantasyCombatBattlefield, actor: FantasyCombatFighter) =>
  ({ battlefield, fighters: [actor], units: [], orders: {} } as unknown as FantasyCombatState);

test('the combat order accepts a break target on a battlefield tile', () => {
  assert.equal(isFantasyCombatOrder({ type: 'break', tile: { x: 1, y: 1 } }), true);
  assert.equal(isFantasyCombatOrder({ type: 'break', tile: { x: 99, y: 1 } }), false);
  assert.equal(isFantasyCombatOrder({ type: 'break', tile: { x: 1, y: 1 }, extra: 1 }), false);
});

test('battlefields accept obstacle placements and reject unknown, duplicate or overlapping ones', () => {
  const base = fantasyCombatField();
  assert.equal(fantasyCombatValidField(base), true);
  const withObstacle = { ...base, obstacles: [{ kind: 'boulder', tile: { x: 1, y: 1 } }] };
  assert.equal(fantasyCombatValidField(withObstacle), true);
  assert.equal(fantasyCombatValidField({ ...base, obstacles: [{ kind: 'unknown', tile: { x: 1, y: 1 } }] }), false);
  assert.equal(fantasyCombatValidField({ ...base, obstacles: [{ kind: 'boulder', tile: { x: 1, y: 1 } }, { kind: 'hole', tile: { x: 1, y: 1 } }] }), false);
  assert.equal(fantasyCombatValidField({ ...base, obstacles: [{ kind: 'boulder', tile: { x: 4, y: 0 } }] }), false);
  assert.equal(fantasyCombatValidField({ ...base, obstacles: 'nope' as never }), false);
});

test('a boulder forces a detour while a small body slips under a fallen log', () => {
  const field = { ...fantasyCombatField(), obstacles: [{ kind: 'boulder', tile: { x: 1, y: 2 } }] };
  const walker = fighter('walker', { x: 0, y: 2 });
  const path = fantasyCombatPath(state(field, walker), walker, { x: 2, y: 2 })!;
  assert.deepEqual(path.at(-1), { x: 2, y: 2 });
  assert.ok(path.length > 3, 'the direct step is blocked so the path must go around');
  assert.ok(!path.some(tile => tile.x === 1 && tile.y === 2));

  const hole = { ...fantasyCombatField(), obstacles: [{ kind: 'fallen-log', tile: { x: 1, y: 2 } }] };
  const key = (tile: { x: number; y: number }) => `${tile.x},${tile.y}`;
  const small = fighter('small', { x: 0, y: 2 }, { small: true });
  assert.deepEqual(fantasyCombatPath(state(hole, small), small, { x: 2, y: 2 })!.map(key), ['0,2', '1,2', '2,2']);
  assert.equal(fantasyCombatPath(state(hole, small), small, { x: 1, y: 2 }), undefined);
  const normal = fighter('normal', { x: 0, y: 2 });
  assert.ok(fantasyCombatPath(state(hole, normal), normal, { x: 2, y: 2 })!.length > 3);
  const flyer = fighter('flyer', { x: 0, y: 2 }, { flying: true });
  assert.deepEqual(fantasyCombatPath(state(hole, flyer), flyer, { x: 2, y: 2 })!.map(key), ['0,2', '1,2', '2,2']);
});

test('only sight-blocking obstacles break line of sight', () => {
  const boulder = { ...fantasyCombatField(), obstacles: [{ kind: 'boulder', tile: { x: 1, y: 1 } }] };
  assert.equal(fantasyCombatLineOfSight(state(boulder, fighter('a', { x: 0, y: 1 })), { x: 0, y: 1 }, { x: 2, y: 1 }), false);
  const vine = { ...fantasyCombatField(), obstacles: [{ kind: 'thick-vine', tile: { x: 1, y: 1 } }] };
  assert.equal(fantasyCombatLineOfSight(state(vine, fighter('a', { x: 0, y: 1 })), { x: 0, y: 1 }, { x: 2, y: 1 }), true);
});

test('attacks wear an obstacle down and open the path once it breaks', () => {
  const field = { ...fantasyCombatField(), obstacles: [{ kind: 'boulder', tile: { x: 1, y: 2 } }] };
  const actor = fighter('actor', { x: 0, y: 2 });
  const stateValue = state(field, actor);
  assert.deepEqual(fantasyCombatBreakObstacle(stateValue, { x: 1, y: 2 }, 7, 'pierce'), { destroyed: false, dealt: 7 });
  assert.equal(fantasyCombatPath(stateValue, actor, { x: 2, y: 2 })!.length > 3, true);
  assert.deepEqual(fantasyCombatBreakObstacle(stateValue, { x: 1, y: 2 }, 7, 'pierce'), { destroyed: true, dealt: 7 });
  assert.equal(fantasyCombatPath(stateValue, actor, { x: 2, y: 2 })!.length, 3);
  assert.equal(fantasyCombatBreakObstacle(stateValue, { x: 1, y: 2 }, 5, 'blunt'), undefined);
  assert.equal(fantasyCombatBreakObstacle(state(fantasyCombatField(), actor), { x: 1, y: 2 }, 5, 'blunt'), undefined);
});

test('a weakness hit doubles damage and an unbreakable obstacle cannot be broken', () => {
  const field = { ...fantasyCombatField(), obstacles: [{ kind: 'thick-vine', tile: { x: 1, y: 2 } }, { kind: 'hole', tile: { x: 3, y: 2 } }] };
  const stateValue = state(field, fighter('actor', { x: 0, y: 2 }));
  assert.deepEqual(fantasyCombatBreakObstacle(stateValue, { x: 1, y: 2 }, 3, 'fire'), { destroyed: true, dealt: 6 });
  assert.equal(fantasyCombatBreakObstacle(stateValue, { x: 3, y: 2 }, 50, 'blunt'), undefined);
});
test('the barricade field is valid, dense and leaves the far side for ranged enemies', () => {
  const field = fantasyCombatBarricadeField(7);
  assert.equal(fantasyCombatValidField(field), true);
  assert.ok((field.obstacles ?? []).length >= 6);
  for (const entry of field.obstacles ?? []) assert.ok(['thick-vine', 'boulder', 'great-ice', 'fallen-log', 'rubble', 'barrel', 'low-wall', 'hole'].includes(entry.kind));
  assert.equal(fantasyCombatBarricadeField(7).obstacles!.map(entry => entry.kind).join(','), field.obstacles!.map(entry => entry.kind).join(','));
  const tiles = fantasyCombatRangedTiles(4);
  assert.equal(tiles.length, 4);
  for (const tile of tiles) assert.ok(tile.x >= 6);
  assert.ok(!field.obstacles!.some(entry => tiles.some(tile => tile.x === entry.tile.x && tile.y === entry.tile.y)));
});
test('a shield skill can place one temporary cover tile and cannot stack on occupied ground', () => {
  const field = fantasyCombatBarricadeField(3);
  const actor = fighter('shield', { x: 2, y: 3 });
  const enemy = fighter('enemy', { x: 8, y: 3 });
  const stateValue = state(field, actor);
  stateValue.fighters.push(enemy);
  const cover = fantasyCombatCoverTile(stateValue, actor);
  assert.ok(cover);
  assert.equal(fantasyCombatPlaceObstacle(stateValue, 'low-wall', cover!), true);
  assert.equal(fantasyCombatPlaceObstacle(stateValue, 'low-wall', cover!), false);
  assert.equal(fantasyCombatPlaceObstacle(stateValue, 'low-wall', { x: 8, y: 3 }), false);
  assert.equal(fantasyCombatPlaceObstacle(stateValue, 'unknown', { x: 1, y: 1 }), false);
  assert.equal(fantasyCombatValidField(stateValue.battlefield!), true);
});