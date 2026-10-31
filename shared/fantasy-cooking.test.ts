import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile, startFantasyActivity, advanceFantasyWorld } from './fantasy-engine.ts';
import { reconcileFoodLots } from './fantasy-life.ts';
import { fantasyCookingMatches, fantasyCookingPlan, fantasyCookingTrial, validFantasyCookingAction, fantasyCookingRecipes, type FantasyCookingAction } from './fantasy-cooking.ts';
import { validFantasyProgression } from './fantasy-progression.ts';
import { parseFantasyRoll } from './fantasy-roll.ts';
import { FANTASY_ITEMS, FANTASY_RECIPES } from './fantasy-data.ts';
import { fantasyItemWeight, fantasyBagState } from './fantasy-bags.ts';
const mix: FantasyCookingAction = { type: 'cookMix', station: 'outdoor', ingredients: [{ item: 'meat', count: 2 }, { item: 'spice', count: 1 }], recipe: 'camp-jerky' };
function player() {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Ingredient cook', gender: 'female', source: 'human' }, () => .5).profile;
  Object.assign(p.character!, { inventory: { meat: 4, spice: 2, wood: 2, tinderbox: 1, 'folding-grill': 1 }, foodLots: [], location: 'greenwood', hour: 8 });
  reconcileFoodLots(p.character!); return p;
}
test('ingredient quantities match complete exact batches and reject extra, fractional, duplicate or forged selections', () => {
  assert.equal(validFantasyCookingAction(mix), true); assert.equal(fantasyCookingPlan(mix)!.batches, 1);
  assert.equal(fantasyCookingPlan({ ...mix, ingredients: [{ item: 'meat', count: 4 }, { item: 'spice', count: 2 }] })!.batches, 2);
  for (const action of [{ ...mix, station: ['outdoor'] }, { ...mix, station: ['kitchen'] }, { ...mix, station: new String('outdoor') }, { ...mix, success: true }, { ...mix, ingredients: [{ item: 'meat', count: 1.5 }] }, { ...mix, ingredients: [{ item: 'meat', count: 1 }, { item: 'meat', count: 1 }] }, { ...mix, ingredients: [{ item: '__proto__', count: 1 }] }, { ...mix, ingredients: [{ item: 'meat', count: 100 }] }]) assert.equal(validFantasyCookingAction(action), false);
  assert.equal(fantasyCookingMatches({ ...mix, ingredients: [{ item: 'meat', count: 3 }, { item: 'spice', count: 1 }] }).length, 0);
  assert.equal(fantasyCookingPlan({ ...mix, ingredients: [{ item: 'meat', count: 22 }, { item: 'spice', count: 11 }] }), undefined);
});
test('explicit registered recipes with mismatched ingredients reject unchanged before spending materials or reserving time', () => {
  const p = player(), before = structuredClone(p), invalid = { ...mix, ingredients: [{ item: 'meat', count: 3 }, { item: 'spice', count: 1 }] };
  for (const result of [applyFantasyAction(p, invalid, () => 0), startFantasyActivity(p, invalid, 8, () => 0)]) { assert.ok(result.error); assert.equal(result.changed, false); assert.deepEqual(result.profile, before); }
  assert.deepEqual(p, before);
});
test('valid failed cooking consumes selected ingredients fuel and time, grants smaller cook-only proficiency and leaves charred food', () => {
  const p = player(), before = structuredClone(p), result = applyFantasyAction(p, mix, () => 0);
  assert.equal(result.error, undefined); assert.equal(result.changed, true); assert.deepEqual(p, before);
  const c = result.profile.character!;
  assert.equal(c.hour, 10); assert.equal(c.inventory.meat, 2); assert.equal(c.inventory.spice, 1); assert.equal(c.inventory.wood, 1); assert.equal(c.inventory.tinderbox, 1); assert.equal(c.inventory['folding-grill'], 1);
  assert.equal(c.inventory.jerky ?? 0, 0); assert.equal(c.inventory['charred-dish'], 2); assert.equal(c.jobXp.cook, 2); assert.equal(c.jobXp[c.job], before.character!.jobXp[c.job]);
  assert.equal(c.foodLots.find(lot => lot.item === 'meat')!.count, 2); assert.equal(validFantasyProgression(c), true);
  assert.equal(parseFantasyRoll(result.profile.log.find(log => parseFantasyRoll(log.text))!.text)!.success, false);
});
test('repeated exact recipes produce fresh batches at their completion times and charge one fire each', () => {
  const p = player(), result = applyFantasyAction(p, { ...mix, repeats: 2 }, () => .999);
  assert.equal(result.error, undefined); const c = result.profile.character!;
  assert.equal(c.hour, 12); assert.equal(c.inventory.meat, 0); assert.equal(c.inventory.spice, 0); assert.equal(c.inventory.wood, 0); assert.equal(c.inventory.jerky, 4);
  assert.equal(c.jobXp.cook, 9); assert.deepEqual(c.foodLots.map(lot => [lot.item, lot.count, lot.createdAt]), [['jerky', 2, 10], ['jerky', 2, 12]]);
});
test('proficiency increases chance while stale consumed ingredients and harder recipes reduce it; natural endpoints remain', () => {
  const c = player().character!, plan = fantasyCookingPlan(mix)!;
  const novice = fantasyCookingTrial(c, plan); c.jobXp.cook = 900; const trained = fantasyCookingTrial(c, plan);
  assert.ok(trained.chance > novice.chance); assert.ok(trained.chance <= .95 && novice.chance >= .05);
  c.hour = 16; assert.ok(fantasyCookingTrial(c, plan).chance < trained.chance);
  const easy = { ...plan, recipe: { ...plan.recipe, dc: 7 } }, hard = { ...plan, recipe: { ...plan.recipe, dc: 18 } };
  assert.ok(fantasyCookingTrial(c, easy).chance > fantasyCookingTrial(c, hard).chance);
});
test('saved seeds make cooking success and failure identical through partial progress and reload', () => {
  const p = player();
  const outcomes = new Set<boolean>();
  for (let seed = 1; seed < 30; seed++) {
    const reserved = startFantasyActivity(p, mix, 8, () => seed / 30).profile;
    assert.equal(reserved.character!.inventory.meat, 4); assert.equal(reserved.character!.jobXp.cook ?? 0, 0);
    const partial = advanceFantasyWorld(reserved, 9).profile, loaded = JSON.parse(JSON.stringify(partial));
    const done = advanceFantasyWorld(loaded, 10).profile;
    assert.deepEqual(done, advanceFantasyWorld(reserved, 10).profile);
    outcomes.add((done.character!.inventory.jerky ?? 0) > 0);
    assert.deepEqual(advanceFantasyWorld(done, 10).profile, done);
  }
  assert.deepEqual([...outcomes].sort(), [false, true]);
});
test('cancelled cooking never consumes ingredients or grants cooking proficiency', () => {
  const p = player(), reserved = startFantasyActivity(p, mix, 8, () => .1).profile;
  const partial = advanceFantasyWorld(reserved, 9).profile, cancelled = applyFantasyAction(partial, { type: 'cancel' }).profile;
  assert.equal(cancelled.activity, undefined); assert.equal(cancelled.character!.inventory.meat, 4); assert.equal(cancelled.character!.inventory.wood, 2); assert.equal(cancelled.character!.jobXp.cook ?? 0, 0);
});
test('kitchen matching includes every cook production recipe and preserves profession and actual kitchen requirements', () => {
  assert.ok(fantasyCookingRecipes('kitchen').length > 10);
  const p = player(), action: FantasyCookingAction = { type: 'cookMix', station: 'kitchen', ingredients: [{ item: 'fish', count: 1 }, { item: 'herb', count: 1 }], recipe: 'cook-meal' };
  p.character!.inventory = { fish: 1, herb: 1 }; p.character!.foodLots = []; reconcileFoodLots(p.character!);
  assert.ok(applyFantasyAction(p, action, () => .999).error);
  p.character!.job = 'cook'; p.character!.jobXp.cook = 0; assert.ok(applyFantasyAction(p, action, () => .999).error);
  p.character!.location = 'hearth';
  const result = applyFantasyAction(p, action, () => .999); assert.equal(result.error, undefined); assert.equal(result.profile.character!.inventory.meal, 1); assert.equal(result.profile.character!.hour, 11);
});
test('identical ingredient formulas require an explicit matching dish before time or materials can be spent', () => {
  const base = FANTASY_RECIPES.find(recipe => recipe.id === 'cook-meal')!, duplicate = { ...base, id: 'cook-ambiguous-qa', output: 'jerky' };
  FANTASY_RECIPES.push(duplicate);
  try {
    const p = player(); Object.assign(p.character!, { job: 'cook', location: 'hearth', inventory: { fish: 1, herb: 1 }, foodLots: [] }); reconcileFoodLots(p.character!);
    const action: FantasyCookingAction = { type: 'cookMix', station: 'kitchen', ingredients: [{ item: 'fish', count: 1 }, { item: 'herb', count: 1 }] };
    assert.equal(fantasyCookingMatches(action).length, 2); assert.equal(fantasyCookingPlan(action), undefined);
    const before = structuredClone(p), rejected = startFantasyActivity(p, action, 8, () => .999);
    assert.equal(rejected.error, 'cooking:choose'); assert.deepEqual(rejected.profile, before);
    const result = applyFantasyAction(p, { ...action, recipe: duplicate.id }, () => .999);
    assert.equal(result.error, undefined); assert.equal(result.profile.character!.inventory.jerky, 1); assert.equal(result.profile.character!.inventory.meal ?? 0, 0);
  } finally { FANTASY_RECIPES.splice(FANTASY_RECIPES.indexOf(duplicate), 1); }
});
test('each exact d20 threshold produces the documented chance and legacy commands cannot bypass failure', () => {
  const initial = player(), trial = fantasyCookingTrial(initial.character!, fantasyCookingPlan(mix)!);
  let successes = 0;
  for (let face = 1; face <= 20; face++) {
    const result = applyFantasyAction(player(), mix, () => (face - .5) / 20);
    assert.equal(result.error, undefined); const success = (result.profile.character!.inventory.jerky ?? 0) > 0;
    assert.equal(success, face >= trial.threshold); if (success) successes++;
  }
  assert.equal(successes / 20, trial.chance);
  const legacy = applyFantasyAction(player(), { type: 'campCook', recipe: 'camp-jerky' }, () => 0);
  assert.equal(legacy.error, undefined); assert.equal(legacy.profile.character!.inventory.jerky ?? 0, 0); assert.equal(legacy.profile.character!.inventory.meat, 2); assert.equal(legacy.profile.character!.jobXp.cook, 2);
});
test('repeated successful and failed cooking uses diminishing proficiency and keeps it through actual job changes', () => {
  let p = player(); p.character!.inventory = { herb: 16, wood: 8, tinderbox: 1, 'camp-kettle': 1 };
  const tea: FantasyCookingAction = { type: 'cookMix', station: 'outdoor', ingredients: [{ item: 'herb', count: 2 }] };
  const gains: number[] = [];
  for (let i = 0; i < 4; i++) { const xp = p.character!.jobXp.cook ?? 0; p = applyFantasyAction(p, tea, () => .999).profile; gains.push(p.character!.jobXp.cook - xp); }
  assert.deepEqual(gains, [6, 3, 1, 1]);
  const oldJobXp = p.character!.jobXp[p.character!.job]; p.character!.location = 'hearth'; p.character!.gold = 500;
  const xp = p.character!.jobXp.cook, change = applyFantasyAction(p, { type: 'job', job: 'cook' }, () => .999);
  assert.equal(change.error, undefined); assert.equal(change.profile.character!.jobXp.cook, xp); assert.equal(change.profile.character!.jobXp[p.character!.job], oldJobXp);
  const failed = player(); failed.character!.inventory = { herb: 8, wood: 4, tinderbox: 1, 'camp-kettle': 1 };
  const one = applyFantasyAction(failed, tea, () => 0).profile, two = applyFantasyAction(one, tea, () => 0).profile;
  assert.equal(one.character!.jobXp.cook, 2); assert.equal(two.character!.jobXp.cook, 3);
});
test('queued cooking overflow stays recoverable with fresh birth times and no repeated reward', () => {
  const p = player(), light = FANTASY_ITEMS.filter(item => !item.food && !['meat', 'spice', 'wood', 'tinderbox', 'folding-grill', 'jerky'].includes(item.id) && item.category !== 'bag').sort((a, b) => fantasyItemWeight(a) - fantasyItemWeight(b)).slice(0, 19);
  for (const item of light.slice(0, 18)) p.character!.inventory[item.id] = 1;
  assert.equal(fantasyBagState(p.character!).slots, 23);
  let reserved = startFantasyActivity(p, mix, 8, () => .1).profile;
  for (let seed = 1; seed < 30; seed++) { const candidate = startFantasyActivity(p, mix, 8, () => seed / 30).profile; if ((advanceFantasyWorld(candidate, 10).profile.character!.inventory.jerky ?? 0) > 0) { reserved = candidate; break; } }
  reserved.character!.inventory[light[18].id] = 1;
  const done = advanceFantasyWorld(reserved, 10).profile;
  assert.equal(done.character!.inventory.jerky ?? 0, 0); assert.equal(done.character!.pendingLoot!.greenwood.items.jerky, 2);
  assert.deepEqual(done.character!.pendingLoot!.greenwood.foodLots.map(lot => [lot.item, lot.count, lot.createdAt]), [['jerky', 2, 10]]);
  assert.deepEqual(advanceFantasyWorld(done, 10).profile, done);
});
