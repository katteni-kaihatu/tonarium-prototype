import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile, startFantasyActivity, advanceFantasyWorld } from './fantasy-engine.ts';
import { FANTASY_ITEMS } from './fantasy-data.ts';
import { fantasyCookingText } from './fantasy-cooking.ts';
import { FANTASY_OUTDOOR_COOKING_ITEMS, FANTASY_OUTDOOR_COOKING_RECIPES as recipes, type FantasyOutdoorRecipe } from './fantasy-outdoor-cooking-catalog.ts';
import { fantasyOutdoorCookingError, validFantasyOutdoorCookingAction, fantasyOutdoorCookingErrorText, fantasyOutdoorCookingLogText } from './fantasy-outdoor-cooking.ts';
import { reconcileFoodLots } from './fantasy-life.ts';
import { applyFantasyDungeonAction, fantasyDungeonCampError } from './fantasy-dungeon.ts';
import { validFantasyProgression } from './fantasy-progression.ts';

function player(recipe: FantasyOutdoorRecipe = recipes[0]) {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Outdoor cook', gender: 'female', source: 'human' }, () => .5).profile;
  Object.assign(p.character!, { location: 'greenwood', hour: 8, inventory: { ...recipe.inputs, ...Object.fromEntries(recipe.tools.map(id => [id, 1])), tinderbox: 1, wood: 2 }, foodLots: [] });
  reconcileFoodLots(p.character!); return p;
}
test('five recipes and six reusable tools register once with complete translations and valid ingredients', () => {
  assert.equal(recipes.length, 5); assert.equal(new Set(recipes.map(recipe => recipe.id)).size, 5);
  assert.equal(FANTASY_OUTDOOR_COOKING_ITEMS.filter(item => item.category === 'tool').length, 6);
  for (const item of FANTASY_OUTDOOR_COOKING_ITEMS) {
    assert.equal(FANTASY_ITEMS.filter(entry => entry.id === item.id).length, 1);
    for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(item.names?.[locale] && item.descriptions?.[locale]);
  }
  for (const recipe of recipes) {
    assert.ok(recipe.hours > 0); assert.ok(recipe.count > 0);
    for (const id of [recipe.output, ...recipe.tools, ...Object.keys(recipe.inputs)]) assert.ok(FANTASY_ITEMS.some(item => item.id === id), id);
    for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(recipe.names[locale]);
    assert.equal(validFantasyOutdoorCookingAction({ type: 'campCook', recipe: recipe.id }), true);
    assert.equal(validFantasyOutdoorCookingAction({ type: 'campCook', recipe: recipe.id, mageAvailable: true }), false);
  }
});
test('every public cooking action consumes exact ingredients and one wood, retains tools, and timestamps the new food at completion', () => {
  for (const recipe of recipes) {
    const p = player(recipe), before = structuredClone(p), result = applyFantasyAction(p, { type: 'campCook', recipe: recipe.id }, () => .999);
    assert.equal(result.error, undefined, recipe.id); assert.deepEqual(p, before);
    const c = result.profile.character!;
    assert.equal(validFantasyProgression(c), true, 'cooking proficiency must remain saveable');
    assert.equal(c.hour, 8 + recipe.hours); assert.equal(c.inventory.wood, 1); assert.equal(c.inventory.tinderbox, 1);
    for (const tool of recipe.tools) assert.equal(c.inventory[tool], 1);
    for (const id of Object.keys(recipe.inputs)) assert.equal(c.inventory[id], 0);
    assert.equal(c.inventory[recipe.output], recipe.count);
    assert.deepEqual(c.foodLots.filter(lot => lot.item === recipe.output).map(lot => [lot.count, lot.createdAt]), [[recipe.count, c.hour]]);
    const log = result.profile.log.findLast(log => log.text.startsWith('cooking:success:'))!;
    for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(fantasyCookingText(log.text, locale));
  }
});
test('the cook or a supplied nearby mage lights fire for free without fuel or mana expenditure', () => {
  for (const self of [false, true]) {
    const p = player(); delete p.character!.inventory.tinderbox; delete p.character!.inventory.wood;
    if (self) p.character!.job = 'mage';
    const mana = p.character!.mp, result = applyFantasyAction(p, { type: 'campCook', recipe: recipes[0].id }, () => .999, { mageAvailable: !self });
    assert.equal(result.error, undefined); assert.equal(result.profile.character!.mp, mana);
    assert.equal(result.profile.character!.inventory.wood, undefined); assert.equal(result.profile.character!.inventory[recipes[0].output], 1);
  }
});
test('missing tools fuel and ingredients reject atomically with translated reasons', () => {
  for (const defect of ['tool', 'wood', 'ingredient']) {
    const p = player(), c = p.character!;
    if (defect === 'tool') delete c.inventory['folding-grill'];
    if (defect === 'wood') c.inventory.wood = 0;
    if (defect === 'ingredient') c.inventory.meat = 0;
    const before = structuredClone(p), error = fantasyOutdoorCookingError(c, { type: 'campCook', recipe: recipes[0].id })!;
    assert.ok(error, defect);
    for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(fantasyOutdoorCookingErrorText(error, locale));
    const result = applyFantasyAction(p, { type: 'campCook', recipe: recipes[0].id }, () => .999);
    assert.ok(result.error); assert.equal(result.changed, false); assert.deepEqual(result.profile, before); assert.deepEqual(p, before);
  }
});
test('cutting-board batch bonus starts at cooking proficiency 100 only for stew and jerky', () => {
  for (const recipe of recipes) for (const proficiency of [99, 100]) {
    const p = player(recipe); p.character!.job = 'cook'; p.character!.jobXp.cook = proficiency; p.character!.inventory['folding-cutting-board'] = 1;
    const result = applyFantasyAction(p, { type: 'campCook', recipe: recipe.id }, () => .999);
    assert.equal(result.error, undefined);
    assert.equal(result.profile.character!.inventory[recipe.output], recipe.count + (recipe.cookBatch && proficiency === 100 ? 1 : 0));
    assert.equal(result.profile.character!.inventory['folding-cutting-board'], 1);
  }
});
test('scheduled cooking reserves no ingredients and settles exactly once across reload', () => {
  const p = player(), reserved = startFantasyActivity(p, { type: 'campCook', recipe: recipes[0].id }, 8, () => .999).profile;
  assert.equal(reserved.character!.inventory.meat, 1); assert.equal(reserved.character!.inventory.wood, 2);
  const partial = advanceFantasyWorld(reserved, 8.25).profile;
  assert.equal(partial.character!.inventory[recipes[0].output], undefined);
  const done = advanceFantasyWorld(JSON.parse(JSON.stringify(partial)), 8.5).profile;
  assert.equal(done.activity, undefined); assert.equal(done.character!.inventory[recipes[0].output], 1); assert.equal(done.character!.inventory.wood, 1);
  assert.deepEqual(advanceFantasyWorld(done, 8.5).profile, done);
});
test('ingredients spoiling during scheduled cooking leave toxic food and consume ingredients and fuel while keeping tools', () => {
  const recipe = recipes.find(recipe => recipe.id === 'camp-jerky')!, p = player(recipe);
  p.character!.hour = 19;
  const reserved = startFantasyActivity(p, { type: 'campCook', recipe: recipe.id }, 19, () => .999).profile;
  assert.ok(reserved.activity);
  const done = advanceFantasyWorld(reserved, 21).profile;
  assert.equal(done.activity, undefined); assert.equal(done.character!.inventory.meat, 0); assert.equal(done.character!.inventory.wood, 1); assert.equal(FANTASY_ITEMS.filter(item => item.foodPenalty?.status === 'poison').reduce((sum, item) => sum + (done.character!.inventory[item.id] ?? 0), 0), 2);
  assert.equal(done.character!.inventory['folding-grill'], 1); assert.equal(done.character!.inventory.jerky, undefined);
});
test('a batch cannot mix fresh preserved meat with a spoiled younger lot to create fresh food', () => {
  const recipe = recipes.find(recipe => recipe.id === 'camp-stew')!, p = player(recipe);
  p.character!.hour = 14;
  p.character!.foodLots = [
    { id: 'fresh-preserved', item: 'meat', count: 1, createdAt: 0, preservedHours: 11.7, preservationAt: 13 },
    { id: 'spoiled-younger', item: 'meat', count: 1, createdAt: 1 },
  ];
  const before = structuredClone(p), result = applyFantasyAction(p, { type: 'campCook', recipe: recipe.id }, () => .999);
  assert.equal(result.error, undefined); assert.equal(FANTASY_ITEMS.filter(item => item.foodPenalty?.status === 'poison').reduce((sum, item) => sum + (result.profile.character!.inventory[item.id] ?? 0), 0), 2);
  assert.equal(result.profile.character!.inventory.meal ?? 0, 0); assert.deepEqual(p, before);
  p.character!.inventory['folding-grill'] = 1;
  const single = applyFantasyAction(p, { type: 'campCook', recipe: 'camp-skewer' }, () => .999);
  assert.equal(single.error, undefined, 'a spoiled leftover outside the consumed quantity does not block fresh ingredients');
  assert.equal(single.profile.character!.inventory.meat, 1);
  assert.equal(single.profile.character!.foodLots.find(lot => lot.item === 'meat')!.id, 'spoiled-younger');
});
test('public cooking actions work in a secured dungeon room and reject an uninspected room', () => {
  let p = player(); p.character!.location = 'oldwatch'; p.character!.visited.push('oldwatch'); p.character!.inventory.lantern = 1;
  const entered = applyFantasyDungeonAction(p, { type: 'dungeonEnter', site: 'oldwatch' }, () => .999);
  assert.equal(entered.error, undefined); p = entered.profile;
  assert.ok(fantasyDungeonCampError(p.character!));
  assert.ok(applyFantasyAction(p, { type: 'campCook', recipe: recipes[0].id }, () => .999).error);
  const inspected = applyFantasyDungeonAction(p, { type: 'dungeonInspect' }, () => .999);
  assert.equal(inspected.error, undefined); p = inspected.profile;
  assert.equal(fantasyDungeonCampError(p.character!), undefined);
  const result = applyFantasyAction(p, { type: 'campCook', recipe: recipes[0].id }, () => .999);
  assert.equal(result.error, undefined); assert.equal(result.profile.character!.inventory[recipes[0].output], 1);
  assert.deepEqual(result.profile.character!.dungeon!.active, p.character!.dungeon!.active);
});
