import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_COMBAT_LOOT_ITEMS, FANTASY_COMBAT_LOOT_RECIPES } from './fantasy-combat-loot.ts';
import { FANTASY_COMBAT_ENEMIES } from './fantasy-combat-catalog.ts';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_RECIPES } from './fantasy-data.ts';
import { canBuyItem } from './fantasy-town.ts';
import { fantasyMaterialGrade, createFantasyGear } from './fantasy-equipment.ts';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';

test('apex rewards provide four rare materials and six crafted equipment options with localized names', () => {
  assert.equal(FANTASY_COMBAT_LOOT_ITEMS.length, 10); assert.equal(new Set(FANTASY_COMBAT_LOOT_ITEMS.map(item => item.id)).size, 10);
  const materials = FANTASY_COMBAT_LOOT_ITEMS.filter(item => item.category === 'apex-material'), gear = FANTASY_COMBAT_LOOT_ITEMS.filter(item => item.equipment);
  assert.equal(materials.length, 4); assert.equal(gear.length, 6); assert.equal(FANTASY_COMBAT_LOOT_RECIPES.length, 6);
  assert.ok(gear.some(item => item.id.includes('bow'))); assert.ok(gear.some(item => item.id.includes('staff'))); assert.ok(gear.some(item => item.equipment!.slot === 'armor')); assert.ok(gear.some(item => item.equipment!.slot === 'offhand'));
  for (const item of FANTASY_COMBAT_LOOT_ITEMS) {
    for (const locale of ['ko', 'en', 'ja'] as const) { assert.ok(item.names![locale]); assert.ok(item.descriptions![locale]); }
    assert.equal(item.tier, 5); assert.ok(FANTASY_ITEMS.some(registered => registered.id === item.id));
    if (!item.equipment) { assert.equal(item.drop, undefined); assert.equal(item.use, undefined); }
  }
});

test('all six apex recipes reference real inputs, outputs and professions and require an earned apex material', () => {
  const materialIds = new Set(FANTASY_COMBAT_LOOT_ITEMS.filter(item => item.category === 'apex-material').map(item => item.id));
  for (const recipe of FANTASY_COMBAT_LOOT_RECIPES) {
    assert.ok(FANTASY_RECIPES.some(registered => registered.id === recipe.id)); assert.ok(FANTASY_JOBS.some(job => job.id === recipe.job));
    assert.ok(FANTASY_ITEMS.find(item => item.id === recipe.output)?.equipment); assert.equal(recipe.count, 1);
    assert.ok(Object.keys(recipe.inputs).some(id => materialIds.has(id)));
    for (const [id, count] of Object.entries(recipe.inputs)) { assert.ok(FANTASY_ITEMS.some(item => item.id === id), id); assert.ok(Number.isSafeInteger(count) && count > 0); }
    assert.ok(recipe.dc >= 20);
  }
});

test('optional apex fights drop materials and honorary records rather than finished weapons or armor', () => {
  const materials = new Set(FANTASY_COMBAT_LOOT_ITEMS.filter(item => item.category === 'apex-material').map(item => item.id));
  const apex = FANTASY_COMBAT_ENEMIES.filter(enemy => enemy.provocationOnly);
  assert.equal(apex.length, 4); assert.equal(new Set(apex.map(enemy => enemy.reward.honor!.id)).size, 4);
  for (const enemy of apex) for (const drop of enemy.reward.materials) {
    assert.ok(materials.has(drop.item)); assert.ok(drop.count > 0); assert.equal(FANTASY_ITEMS.find(item => item.id === drop.item)!.equipment, undefined);
  }
});

test('rare apex materials and their finished equipment cannot be bought from any ordinary settlement shop', () => {
  for (const place of FANTASY_LOCATIONS) for (const item of FANTASY_COMBAT_LOOT_ITEMS) assert.equal(canBuyItem({ location: place.id }, item.id), false, `${place.id}/${item.id}`);
});

test('pre-existing top materials can craft maximum-quality gear without first defeating an apex monster', () => {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Veteran crafter', gender: 'female' }, () => .5).profile;
  const c = p.character!; c.job = 'blacksmith'; c.jobXp.blacksmith = 1000;
  const advanced = ['starsteel-ingot', 'adamant-ingot', 'orichalcum-ingot'].map(id => FANTASY_ITEMS.find(item => item.id === id)!);
  assert.ok(advanced.every(item => !!item && fantasyMaterialGrade(item) >= 4));
  for (const material of advanced) {
    assert.ok(!FANTASY_COMBAT_LOOT_ITEMS.some(item => item.id === material.id));
    const made = createFantasyGear(c, 'steel-sword', () => .999, material.id, 'diamond')!;
    assert.equal(made.quality, 5); assert.equal(made.material, material.id);
  }
  const equipmentRecipes = FANTASY_RECIPES.filter(recipe => !FANTASY_COMBAT_LOOT_RECIPES.some(apex => apex.id === recipe.id) && FANTASY_ITEMS.find(item => item.id === recipe.output)?.equipment);
  assert.ok(equipmentRecipes.length > 0); assert.ok(equipmentRecipes.every(recipe => !Object.keys(recipe.inputs).some(id => FANTASY_COMBAT_LOOT_ITEMS.some(item => item.id === id))));
});
