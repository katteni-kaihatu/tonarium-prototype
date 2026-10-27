import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_RECIPES } from './fantasy-data.ts';
import { FANTASY_EXPANDED_ITEMS, FANTASY_EXPANDED_RECIPES } from './fantasy-items-expansion.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from './fantasy-engine.ts';
import { canBuyItem, canSellItem, fantasyBuildings, FANTASY_MAPS } from './fantasy-town.ts';
import { foodMeta, reconcileFoodLots } from './fantasy-life.ts';
import type { FantasyAction, FantasyProfile } from './fantasy.ts';

const high = () => 0.999;
function player(job = 'unassigned'): FantasyProfile {
  const result = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: '道具試験', gender: 'female' }, high);
  assert.equal(result.error, undefined);
  const character = result.profile.character!;
  character.job = job; character.jobXp[job] = 0;
  return result.profile;
}
function step(profile: FantasyProfile, action: FantasyAction, rng = high) {
  const original = structuredClone(profile);
  const result = applyFantasyAction(profile, action, rng);
  assert.equal(result.error, undefined, result.error ?? action.type);
  assert.equal(result.changed, true);
  assert.equal(result.profile.revision, profile.revision + 1);
  assert.deepEqual(profile, original);
  return result.profile;
}

test('expanded item and recipe catalogs keep the original IDs and remain within the prototype scope', () => {
  assert.equal(FANTASY_EXPANDED_ITEMS.length, 97);
  assert.equal(FANTASY_ITEMS.length, 165);
  assert.equal(FANTASY_EXPANDED_RECIPES.length, 20);
  assert.equal(FANTASY_RECIPES.length, 86);
  assert.equal(new Set(FANTASY_ITEMS.map(item => item.id)).size, FANTASY_ITEMS.length);
  assert.equal(new Set(FANTASY_RECIPES.map(recipe => recipe.id)).size, FANTASY_RECIPES.length);
  for (const id of ['herb', 'ore', 'wood', 'fish', 'crystal', 'relic', 'meal', 'potion', 'ingot', 'blade', 'spice', 'silk', 'antidote', 'gem', 'meat', 'bread', 'jerky']) assert.ok(FANTASY_ITEMS.some(item => item.id === id));
  for (const item of FANTASY_EXPANDED_ITEMS) {
    assert.ok(/^[a-z0-9-]+$/.test(item.id));
    assert.ok(Number.isInteger(item.price) && item.price >= 1);
    for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(item.names?.[locale] && item.descriptions?.[locale]);
    if (item.drop) {
      assert.ok(item.drop.chance > 0 && item.drop.chance <= 1);
      assert.ok(FANTASY_LOCATIONS.some(location => (!item.drop!.kinds || item.drop!.kinds.includes(location.kind)) && location.danger >= (item.drop!.minDanger ?? 0)), item.id);
    }
    if (item.food) assert.deepEqual(foodMeta(item.id), { item: item.id, ...item.food });
  }
});

test('every recipe references registered positive materials, a profession and a usable output', () => {
  for (const recipe of FANTASY_RECIPES) {
    assert.ok(FANTASY_JOBS.some(job => job.id === recipe.job), recipe.id);
    assert.ok(FANTASY_ITEMS.some(item => item.id === recipe.output) || FANTASY_MAPS.some(map => map.item === recipe.output), recipe.id);
    assert.ok(Number.isInteger(recipe.dc) && recipe.dc > 0);
    assert.ok(Number.isInteger(recipe.count) && recipe.count > 0);
    for (const [id, count] of Object.entries(recipe.inputs)) {
      assert.ok(FANTASY_ITEMS.some(item => item.id === id), `${recipe.id}:${id}`);
      assert.ok(Number.isInteger(count) && count > 0);
    }
  }
});

test('every expanded item can be bought at a real facility, found in its terrain, or crafted', () => {
  for (const item of FANTASY_EXPANDED_ITEMS) {
    const sold = FANTASY_LOCATIONS.some(location => canBuyItem({ location: location.id }, item.id));
    assert.ok(sold || item.drop || FANTASY_RECIPES.some(recipe => recipe.output === item.id), item.id);
  }
  for (const item of FANTASY_ITEMS.filter(item => item.category === 'artifact')) {
    assert.ok(item.drop && item.drop.chance <= 0.06 && (item.drop.minDanger ?? 0) >= 3);
    assert.ok(FANTASY_LOCATIONS.every(location => !canBuyItem({ location: location.id }, item.id)));
  }
});

test('ordinary ancient, modern and curious relics can be sold only at an archaeology institute', () => {
  for (const item of FANTASY_ITEMS.filter(item => item.category === 'relic')) {
    assert.equal(item.equipment, undefined);
    assert.equal(item.use, undefined);
    assert.equal(canBuyItem({ location: 'hearth' }, item.id), false);
    assert.equal(canSellItem({ location: 'hearth' }, item.id), false);
    assert.equal(canSellItem({ location: 'suncourt' }, item.id), true);
    const p = player(); p.character!.inventory[item.id] = 1;
    assert.equal(applyFantasyAction(p, { type: 'sell', item: item.id }, high).changed, false);
    p.character!.location = 'suncourt';
    const sold = step(p, { type: 'sell', item: item.id });
    assert.equal(sold.character!.inventory[item.id], 0);
    assert.equal(sold.character!.gold - p.character!.gold, Math.floor(item.price * 0.5));
  }
});

test('all eight ores have corresponding smelting recipes and elemental crystals have distinct crafting uses', () => {
  for (const metal of ['copper', 'tin', 'silver', 'gold', 'mithril', 'adamant', 'orichalcum', 'starsteel']) {
    const recipe = FANTASY_RECIPES.find(recipe => recipe.id === `smelt-${metal}`)!;
    assert.equal(recipe.inputs[`${metal}-ore`], 2);
    assert.equal(recipe.output, `${metal}-ingot`);
  }
  for (const id of ['dense-crystal', 'pure-crystal', 'fire-crystal', 'water-crystal', 'wind-crystal', 'earth-crystal', 'light-crystal']) assert.ok(FANTASY_RECIPES.some(recipe => recipe.inputs[id] > 0), id);
});

test('all expanded recipes spend each input exactly once at the required facility and make their catalog output', () => {
  const facility: Record<string, string> = { blacksmith: 'blacksmith', cook: 'restaurant', mage: 'tower', alchemist: 'alchemist' };
  for (const recipe of FANTASY_EXPANDED_RECIPES) {
    const p = player(recipe.job); const c = p.character!;
    c.location = FANTASY_LOCATIONS.find(location => fantasyBuildings({ location: location.id }).some(building => building.id === facility[recipe.job]))!.id;
    c.inventory = { ...recipe.inputs }; reconcileFoodLots(c);
    const result = step(p, { type: 'craft', recipe: recipe.id });
    for (const id of Object.keys(recipe.inputs)) assert.equal(result.character!.inventory[id], 0, `${recipe.id}:${id}`);
    assert.ok(result.character!.inventory[recipe.output] >= recipe.count, recipe.id);
    assert.equal(result.character!.hour, c.hour + 3);
    assert.ok(result.character!.hp <= fantasyStats(result.character!).hp);
    if (foodMeta(recipe.output)) assert.equal(result.character!.foodLots.find(lot => lot.item === recipe.output)?.createdAt, result.character!.hour);
  }
});

test('rare artifacts are actual exploration drops and cannot be obtained by guessing an item-use ID', () => {
  const p = player(); const c = p.character!; c.location = 'eclipsevault';
  const location = FANTASY_LOCATIONS.find(location => location.id === c.location)!;
  const candidates = FANTASY_ITEMS.filter(item => item.drop && (!item.drop.kinds || item.drop.kinds.includes(location.kind)) && location.danger >= (item.drop.minDanger ?? 0));
  const index = candidates.findIndex(item => item.id === 'healing-idol'); assert.ok(index >= 0);
  const rolls = [0.999, 0, 0.999, 0.999, 0, (index + 0.1) / candidates.length, 0, 0.999];
  const found = step(p, { type: 'explore' }, () => rolls.shift() ?? 0.999);
  assert.equal(found.character!.inventory['healing-idol'], 1);
  const original = player();
  assert.equal(applyFantasyAction(original, { type: 'use', item: 'healing-idol' }, high).changed, false);
  assert.equal(original.character!.inventory['healing-idol'], undefined);
});
