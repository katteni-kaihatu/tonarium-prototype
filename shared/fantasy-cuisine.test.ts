import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_ITEMS } from './fantasy-data.ts';
import { FANTASY_CUISINE_FAMILIES, FANTASY_CUISINE_ITEMS, FANTASY_FIVE_INGREDIENT_RECIPES, FANTASY_CUISINE_PANTRY_ITEMS } from './fantasy-cuisine-catalog.ts';
import { applyFantasyAction, newFantasyProfile, fantasyStats, startFantasyActivity, advanceFantasyWorld } from './fantasy-engine.ts';
import { fantasyCookingPlan, fantasyCookingMaxRepeats, validFantasyCookingAction, fantasyCookingError, fantasyCookingOutcome } from './fantasy-cooking.ts';
import type { FantasyCookingAction } from './fantasy-cooking.ts';
import { reconcileFoodLots } from './fantasy-life.ts';
import { validFantasyCookingProgress } from './fantasy-cooking-progress.ts';
const main = ['meat', 'pantry-rice', 'pantry-carrot'];
const free: FantasyCookingAction = { type: 'cookMix', station: 'outdoor', recipe: 'cook-improvised', mains: main, ingredients: main.map(item => ({ item, count: 1 })) };
function player() {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Cuisine', gender: 'female' }, () => .5).profile, c = p.character!;
  c.location = 'hearth'; c.hour = 8; c.job = 'cook'; c.inventory = { meat: 6, 'pantry-rice': 6, 'pantry-carrot': 6, pepper: 6, 'pantry-butter': 6, ore: 3, wood: 6, tinderbox: 1, 'camp-cookpot': 1 }; c.foodLots = [];
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp; reconcileFoodLots(c); return p;
}
test('48 fixed recipes use exactly five distinct registered units and have unique unordered combinations', () => {
  assert.equal(FANTASY_FIVE_INGREDIENT_RECIPES.length, 48); const combinations = new Set<string>();
  for (const recipe of FANTASY_FIVE_INGREDIENT_RECIPES) {
    assert.equal(Object.keys(recipe.inputs).length, 5); assert.deepEqual(Object.values(recipe.inputs), [1, 1, 1, 1, 1]);
    const key = Object.keys(recipe.inputs).sort().join('|'); assert.equal(combinations.has(key), false, recipe.id); combinations.add(key);
    for (const item of [recipe.output, ...Object.keys(recipe.inputs)]) assert.ok(FANTASY_ITEMS.some(known => known.id === item), item);
  }
});
test('20 ordinary and two harmful families contain exactly three distinct localized dishes each', () => {
  assert.equal(FANTASY_CUISINE_FAMILIES.length, 22); assert.equal(FANTASY_CUISINE_ITEMS.length, 114); assert.equal(FANTASY_CUISINE_PANTRY_ITEMS.length, 19);
  const names = new Set<string>();
  for (const family of FANTASY_CUISINE_FAMILIES) {
    assert.equal(family.candidates.length, 3);
    for (const candidate of family.candidates) { assert.equal(names.has(candidate.item), false); names.add(candidate.item); const item = FANTASY_ITEMS.find(item => item.id === candidate.item)!;
      for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(item.names?.[locale] && item.descriptions?.[locale]);
      assert.equal(!!item.foodPenalty, family.id === 'gritty' || family.id === 'toxic');
    }
  }
  assert.equal(names.size, 66);
});
test('free cooking consumes three to five unit slots, including duplicate main ingredients', () => {
  const duplicate: FantasyCookingAction = { ...free, mains: ['meat', 'meat', 'meat'], additions: [{ main: 0, item: 'pepper' }, { main: 1, item: 'pepper' }], ingredients: [{ item: 'meat', count: 3 }, { item: 'pepper', count: 2 }] };
  assert.equal(validFantasyCookingAction(duplicate), true); assert.equal(fantasyCookingPlan(duplicate)!.candidates!.length, 3);
  assert.equal(validFantasyCookingAction({ ...duplicate, additions: [{ main: 0, item: 'pepper' }, { main: 0, item: 'pepper' }] }), false);
  assert.equal(validFantasyCookingAction({ ...duplicate, ingredients: [{ item: 'meat', count: 4 }, { item: 'pepper', count: 2 }] }), false);
  assert.equal(validFantasyCookingAction({ ...free, additions: null }), false);
});
test('addition type and the main ingredient it is attached to change positive candidate weights', () => {
  const append = (target: number): FantasyCookingAction => ({ ...free, additions: [{ main: target, item: 'pepper' }], ingredients: [...free.ingredients, { item: 'pepper', count: 1 }] });
  const a = fantasyCookingPlan(append(0))!, b = fantasyCookingPlan(append(1))!;
  assert.notDeepEqual(a.candidates!.map(x => x.weight), b.candidates!.map(x => x.weight));
  assert.ok(a.candidates!.every(x => x.weight > 0)); assert.deepEqual(a.candidates!.map(x => x.item), b.candidates!.map(x => x.item));
  const results = new Set<string>(), total = a.candidates!.reduce((sum, x) => sum + x.weight, 0); let offset = 0;
  for (const candidate of a.candidates!) { results.add(fantasyCookingOutcome(player().character!, a, true, () => (offset + candidate.weight / 2) / total).item); offset += candidate.weight; }
  assert.equal(results.size, 3);
});
test('max repetition is based on the selected stock and includes fuel separately from material units', () => {
  const c = player().character!; assert.equal(fantasyCookingMaxRepeats(c, free), 6);
  c.inventory.wood = 2; assert.equal(fantasyCookingMaxRepeats(c, free), 2);
  const stored: FantasyCookingAction = { ...free, station: 'kitchen', workshop: 'hearth-commercial', storage: 'hearth-commercial' };
  assert.equal(fantasyCookingMaxRepeats(c, stored), 0);
  assert.equal(fantasyCookingMaxRepeats(c, stored, { stock: { inventory: { meat: 3, 'pantry-rice': 5, 'pantry-carrot': 4 }, foodLots: [] } }), 3);
});
test('repeated cooking settles at each boundary, preserves completed dishes on cancellation and never spends untouched stock', () => {
  const p = player(), action = { ...free, repeats: 3 }, start = startFantasyActivity(p, action, 8, () => .4);
  assert.equal(start.error, undefined); assert.equal(start.profile.activity!.cooking!.completed, 0);
  const first = advanceFantasyWorld(start.profile, 8.5).profile; assert.equal(first.activity!.cooking!.completed, 1);
  assert.equal(first.character!.inventory.meat, 5); assert.equal(first.character!.inventory.wood, 5);
  const dishCount = (profile: typeof p) => Object.entries(profile.character!.inventory).filter(([id]) => id.startsWith('cuisine-free-') || id === 'charred-dish').reduce((sum, [, count]) => sum + count, 0);
  assert.equal(dishCount(first), 1);
  const stopped = applyFantasyAction(first, { type: 'cancel' }).profile; assert.equal(stopped.activity, undefined);
  assert.equal(dishCount(advanceFantasyWorld(stopped, 12).profile), 1); assert.equal(stopped.character!.inventory.meat, 5);
});
test('saved repetition indices preserve all batch outcomes independently of sync chunking and reject forged progress', () => {
  const p = player(), start = startFantasyActivity(p, { ...free, repeats: 3 }, 8, () => .42).profile;
  const immediate = advanceFantasyWorld(start, 9.5).profile;
  let stepped = JSON.parse(JSON.stringify(advanceFantasyWorld(start, 8.5).profile)); stepped = advanceFantasyWorld(stepped, 9).profile; stepped = advanceFantasyWorld(stepped, 9.5).profile;
  assert.deepEqual(stepped.character!.inventory, immediate.character!.inventory); assert.deepEqual(stepped.character!.foodLots, immediate.character!.foodLots);
  assert.deepEqual(advanceFantasyWorld(immediate, 9.5).profile, immediate);
  const forged = structuredClone(start); forged.activity!.cooking!.completed = 2; assert.equal(validFantasyCookingProgress(forged.activity!, forged.character!), false);
  assert.ok(advanceFantasyWorld(forged, 9.5).error);
});
test('requesting more repetitions than available or more than five units fails unchanged before reserving anything', () => {
  const p = player(), before = structuredClone(p); assert.ok(startFantasyActivity(p, { ...free, repeats: 7 }, 8).error); assert.deepEqual(p, before);
  const multiplied: FantasyCookingAction = { type: 'cookMix', station: 'outdoor', recipe: 'camp-stew', ingredients: [{ item: 'meat', count: 4 }, { item: 'herb', count: 2 }, { item: 'spice', count: 2 }] };
  assert.equal(fantasyCookingError(p.character!, multiplied), 'cooking:batch');
  const tooMany: FantasyCookingAction = { ...free, mains: undefined, recipe: undefined, ingredients: [{ item: 'ore', count: 6 }] };
  assert.equal(fantasyCookingError(p.character!, tooMany), 'cooking:slots');
});


test('every new fixed recipe actually consumes five units and produces its own localized dish', () => {
  const seen = { ko: new Set<string>(), en: new Set<string>(), ja: new Set<string>() };
  for (const item of [...FANTASY_CUISINE_ITEMS, ...FANTASY_CUISINE_PANTRY_ITEMS]) {
    for (const locale of ['ko', 'en', 'ja'] as const) {
      assert.ok(item.names?.[locale]?.trim(), `${item.id}:${locale}`);
      assert.ok(item.descriptions?.[locale]?.trim(), `${item.id}:${locale}:description`);
      assert.equal(seen[locale].has(item.names![locale]), false, `duplicate localized name:${item.id}:${locale}`);
      seen[locale].add(item.names![locale]);
    }
  }
  for (const recipe of FANTASY_FIVE_INGREDIENT_RECIPES) {
    const p = player(), c = p.character!;
    c.inventory = { ...recipe.inputs }; c.foodLots = []; c.jobXp.cook = 10_000; reconcileFoodLots(c);
    const before = structuredClone(p);
    const result = applyFantasyAction(p, { type: 'cookMix', station: 'kitchen', recipe: recipe.id, ingredients: Object.entries(recipe.inputs).map(([item, count]) => ({ item, count })) }, () => .999);
    assert.equal(result.error, undefined, recipe.id); assert.deepEqual(p, before, recipe.id);
    assert.equal(result.profile.character!.inventory[recipe.output], 1, recipe.id);
    for (const id of Object.keys(recipe.inputs)) assert.equal(result.profile.character!.inventory[id], 0, `${recipe.id}:${id}`);
    assert.deepEqual(result.profile.character!.foodLots.filter(lot => lot.item === recipe.output).map(lot => [lot.count, lot.createdAt]), [[1, 11]], recipe.id);
  }
});

test('every family reaches each of its three named outcomes with actual unit-slot cooking', () => {
  const representatives: Record<string, string> = { meat: 'meat', fish: 'fish', grain: 'pantry-rice', vegetable: 'pantry-carrot', fruit: 'pantry-apple', herb: 'herb', dairy: 'pantry-milk', sweet: 'pantry-sugar', egg: 'pantry-egg', mushroom: 'pantry-mushroom', spice: 'pepper', other: 'ore' };
  for (const family of FANTASY_CUISINE_FAMILIES) {
    const mains = family.groups.map(group => representatives[group]);
    if (family.id === 'toxic') mains[0] = 'toxic-dish';
    const ingredients = Object.entries(mains.reduce<Record<string, number>>((counts, item) => { counts[item] = (counts[item] ?? 0) + 1; return counts; }, {})).map(([item, count]) => ({ item, count }));
    const action: FantasyCookingAction = { type: 'cookMix', station: 'outdoor', recipe: 'cook-improvised', mains, ingredients };
    const p = player(), c = p.character!; c.inventory = { ...Object.fromEntries(ingredients.map(i => [i.item, i.count])), wood: 1, tinderbox: 1, 'camp-cookpot': 1 }; c.foodLots = []; c.jobXp.cook = 10_000; reconcileFoodLots(c);
    const plan = fantasyCookingPlan(action)!; assert.deepEqual(plan.candidates!.map(x => x.item), family.candidates.map(x => x.item), family.id);
    for (let index = 0; index < 3; index++) {
      let rolls = 0; const result = applyFantasyAction(p, action, () => rolls++ === 0 ? .999 : (index + .5) / 3);
      assert.equal(result.error, undefined, `${family.id}:${index}`);
      const outcome = family.candidates[index].item;
      const inputCount = ingredients.find(i => i.item === outcome)?.count ?? 0;
      assert.equal(result.profile.character!.inventory[outcome], 1, outcome);
      for (const input of ingredients) assert.equal(result.profile.character!.inventory[input.item], input.item === outcome ? 1 : 0, `${outcome}:${input.item}:${inputCount}`);
      assert.equal(result.profile.character!.inventory.wood, 0);
      assert.equal(result.profile.character!.jobXp.cook - c.jobXp.cook, family.id === 'gritty' || family.id === 'toxic' ? 2 : 6);
    }
  }
});


test('immediate repeated fixed cooking credits each completed successful task batch and not failed batches', () => {
  for (const secondSucceeds of [false, true]) {
    const p = player(), c = p.character!; c.location = 'leafshade'; c.inventory = { meat: 4, spice: 2 }; c.foodLots = []; c.jobXp.cook = 1000;
    c.quests = ['task-leafshade-jerky-batch']; c.taskProgress = { 'task-leafshade-jerky-batch': { acceptedAt: 8, progress: 0, lastAt: 8 } }; reconcileFoodLots(c);
    let rolls = 0;
    const result = applyFantasyAction(p, { type: 'cookMix', station: 'kitchen', recipe: 'cook-jerky', repeats: 2, ingredients: [{ item: 'meat', count: 2 }, { item: 'spice', count: 1 }] }, () => rolls++ === 0 || secondSucceeds ? .999 : 0);
    assert.equal(result.error, undefined); assert.equal(result.profile.revision, p.revision + 1);
    assert.equal(result.profile.character!.taskProgress!['task-leafshade-jerky-batch'].progress, secondSucceeds ? 2 : 1);
    assert.equal(result.profile.character!.inventory.jerky, secondSucceeds ? 4 : 2);
    assert.equal(result.profile.character!.inventory['charred-dish'] ?? 0, secondSucceeds ? 0 : 2);
  }
});


test('a clock caller missing warehouse authority cannot erase or consume an already queued cooking action', () => {
  const p = player(), action: FantasyCookingAction = { ...free, station: 'kitchen', workshop: 'hearth-commercial', storage: 'hearth-commercial', repeats: 2 };
  const stock = { inventory: { meat: 2, 'pantry-rice': 2, 'pantry-carrot': 2 }, foodLots: [] };
  const reserved = startFantasyActivity(p, action, 8, () => .999, { cookingStock: stock }); assert.equal(reserved.error, undefined);
  const before = structuredClone(reserved.profile), originalStock = structuredClone(stock);
  const ignored = advanceFantasyWorld(reserved.profile, 9);
  assert.equal(ignored.error, 'cooking:storage'); assert.equal(ignored.changed, false); assert.deepEqual(ignored.profile, before);
  assert.deepEqual(reserved.profile, before); assert.deepEqual(stock, originalStock);
  const finished = advanceFantasyWorld(reserved.profile, 9, { cookingStock: stock });
  assert.equal(finished.error, undefined); assert.equal(finished.profile.activity!.cooking!.completed, 1);
  assert.equal(stock.inventory.meat, 1);
});
