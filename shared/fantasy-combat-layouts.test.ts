import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_COMBAT_FIELD_TEMPLATES, FANTASY_COMBAT_NORMAL_FIELD_TEMPLATES, fantasyCombatBarricadeField, fantasyCombatField, fantasyCombatPath, fantasyCombatTileKey, fantasyCombatValidField } from './fantasy-combat-tactics.ts';
import { createFantasyCombat, type FantasyCombatFighter, type FantasyCombatState } from './fantasy-combat.ts';

test('every pre-generated variation has connected spawn zones and a clear caravan corridor', () => {
  const variations = new Set<string>();
  for (let seed = 0; seed < 96; seed++) {
    const field = fantasyCombatBarricadeField(seed); assert.ok(fantasyCombatValidField(field)); variations.add(JSON.stringify(field));
    const actor = { id: 'route', hp: 1, fled: false, tile: { x: 1, y: 4 } } as FantasyCombatFighter;
    const state = { battlefield: field, fighters: [actor] } as FantasyCombatState;
    const path = fantasyCombatPath(state, actor, { x: 9, y: 4 }); assert.ok(path, `seed ${seed}: caravan exit reachable`);
    assert.equal(path.length, 9);
    for (const tile of [{ x: 1, y: 1 }, { x: 2, y: 6 }, { x: 8, y: 1 }, { x: 9, y: 5 }]) assert.ok(fantasyCombatPath(state, actor, tile), `${seed}: spawn ${fantasyCombatTileKey(tile)} reachable`);
    assert.ok(field.obstacles!.length >= 8);
    const keys = [...field.blocked, ...field.cover, ...field.obstacles!.map(entry => entry.tile)].map(fantasyCombatTileKey); assert.equal(new Set(keys).size, keys.length);
    assert.deepEqual(fantasyCombatBarricadeField(seed), field);
  }
  assert.ok(variations.size >= 12); assert.ok(variations.size <= 32, 'selection uses a finite template bank');
  assert.ok(fantasyCombatValidField(fantasyCombatField()));
});

test('ordinary seeded fields select twelve connected layouts without shifting any mandatory spawn or escort lane', () => {
  assert.equal(FANTASY_COMBAT_NORMAL_FIELD_TEMPLATES.length, 12); assert.equal(FANTASY_COMBAT_FIELD_TEMPLATES.length, 12);
  const variants = new Set<string>();
  for (let seed = 0; seed < 96; seed++) {
    const field = fantasyCombatField(seed); variants.add(JSON.stringify(field.blocked)); assert.ok(fantasyCombatValidField(field)); assert.equal(field.obstacles, undefined);
    const actor = { id: 'route', hp: 1, fled: false, tile: { x: 0, y: 4 } } as FantasyCombatFighter;
    const state = { battlefield: field, fighters: [actor] } as FantasyCombatState;
    const keys = new Set(field.blocked.map(fantasyCombatTileKey));
    for (const x of [1, 4, 5, 8]) for (let y = 1; y <= 6; y++) { assert.ok(!keys.has(`${x}:${y}`)); assert.ok(fantasyCombatPath(state, actor, { x, y })); }
    assert.equal(fantasyCombatPath(state, actor, { x: 9, y: 4 })!.length, 10);
    for (let x = 0; x < 10; x++) for (let y = 0; y < 8; y++) if (!keys.has(`${x}:${y}`)) assert.ok(fantasyCombatPath(state, actor, { x, y }));
    assert.deepEqual(fantasyCombatField(seed), field);
  }
  assert.equal(variants.size, 12);
  const changed = fantasyCombatField(0); changed.blocked[0].x = 9;
  assert.deepEqual(fantasyCombatField(0).blocked[0], { x: 2, y: 0 });
});

test('ordinary combat creation selects a saved seed template while apex combat retains the canonical arena', () => {
  const stats = { hp: 100, mp: 20, attack: 10, defense: 10, intelligence: 10, agility: 10, accuracy: 90, magicResist: 10 }, names = { ko: '시험', en: 'Test', ja: '試験' };
  const input = { id: 'layout', location: 'greenwood', source: 'hunt:monster-forest-wolf', seed: 0, hour: 12, tactical: true,
    players: [{ id: 'p', userId: 'u', generation: 1, stats, hp: 100, mp: 20, names, position: 'front' as const, range: 'melee' as const, skills: [] }], enemies: [{ id: 'e', template: 'monster-forest-wolf' }] };
  for (const source of ['hunt:monster-forest-wolf', 'story:main-night-01:field', 'dungeon:site:room', 'challenge:human-watch-patrol', 'encounter:encounter-bandits']) {
    const battle = createFantasyCombat({ ...input, source }); assert.notDeepEqual(battle.battlefield!.blocked, fantasyCombatField().blocked);
    assert.deepEqual(battle.battlefield, fantasyCombatField(0)); assert.deepEqual(battle.fighters[0].tile, { x: 4, y: 1 }); assert.deepEqual(battle.fighters[1].tile, { x: 5, y: 1 });
    assert.deepEqual(createFantasyCombat({ ...input, source }), battle);
  }
  for (const seed of [0, 1, 11, 42, 999]) assert.deepEqual(createFantasyCombat({ ...input, seed, source: 'apex:elder-dragon' }).battlefield, fantasyCombatField());
  assert.deepEqual(createFantasyCombat({ ...input, source: 'apex:elder-dragon', terrain: 'barricade' }).battlefield, fantasyCombatField());
  assert.equal(fantasyCombatValidField({ ...fantasyCombatField(), hiddenPower: 999 }), false);
  assert.throws(() => createFantasyCombat({ ...input, seed: Number.NaN }), /Invalid combat creation/);
});
