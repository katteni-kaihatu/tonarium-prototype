import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile, fantasyStats } from './fantasy-engine.ts';
import { fantasyCookingPlan, fantasyCookingError, validFantasyCookingAction } from './fantasy-cooking.ts';
import type { FantasyCookingAction } from './fantasy-cooking.ts';
import { fantasyCookingMixture } from './fantasy-freeform-cooking.ts';
import { FANTASY_ITEMS } from './fantasy-data.ts';
import { reconcileFoodLots, foodSense } from './fantasy-life.ts';
import { validFantasyItemState } from './fantasy-effects.ts';
function player() {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Freeform cook', source: 'human', gender: 'female' }, () => .5).profile, c = p.character!;
  Object.assign(c, { location: 'greenwood', hour: 8, inventory: { meat: 4, herb: 4, ore: 2, wood: 4, tinderbox: 1, 'camp-cookpot': 1 }, foodLots: [] }); reconcileFoodLots(c); return p;
}
const edible: FantasyCookingAction = { type: 'cookMix', station: 'outdoor', recipe: 'cook-improvised', mains: ['meat', 'meat', 'herb'], ingredients: [{ item: 'meat', count: 2 }, { item: 'herb', count: 1 }] };
const gritty: FantasyCookingAction = { ...edible, mains: ['ore', 'meat', 'herb'], ingredients: [{ item: 'ore', count: 1 }, { item: 'meat', count: 1 }, { item: 'herb', count: 1 }] };
const output = (inventory: Record<string, number>, status?: string) => FANTASY_ITEMS.filter(item => item.foodPenalty?.status === status && item.foodPenalty && (inventory[item.id] ?? 0) > 0);
test('inedible materials produce one of three harmful foods on a successful roll and grant only minor proficiency', () => {
  const p = player(), before = structuredClone(p), result = applyFantasyAction(p, gritty, () => .999), c = result.profile.character!;
  assert.equal(result.error, undefined); assert.deepEqual(p, before); assert.equal(c.inventory.ore, 1); assert.equal(c.inventory.meat, 3);
  assert.equal(fantasyCookingPlan(gritty)!.candidates!.length, 3); assert.equal(output(c.inventory, 'weakness').reduce((sum, item) => sum + c.inventory[item.id], 0), 1);
  assert.equal(c.jobXp.cook, 2);
});
test('failed edible cooking leaves charred food and consumes the three selected units plus fuel', () => {
  const result = applyFantasyAction(player(), edible, () => 0), c = result.profile.character!;
  assert.equal(result.error, undefined); assert.equal(c.inventory['charred-dish'], 1); assert.equal(c.inventory.meat, 2); assert.equal(c.inventory.herb, 3); assert.equal(c.inventory.wood, 3);
});
test('spoiled inputs remain poisonous on either outcome and poisonous dishes cannot be washed by cooking', () => {
  for (const roll of [0, .999]) {
    const p = player(); p.character!.hour = 32; p.character!.foodLots.find(lot => lot.item === 'meat')!.createdAt = 18;
    const result = applyFantasyAction(p, edible, () => roll), c = result.profile.character!;
    assert.equal(result.error, undefined); const poisoned = output(c.inventory, 'poison'); assert.equal(poisoned.length, 1); assert.equal(c.inventory[poisoned[0].id], 1);
    assert.equal(fantasyCookingMixture({ [poisoned[0].id]: 3 }).risk, 'toxic');
  }
});
test('wood material slots reserve an additional fuel unit while a mage can cook the same three units without it', () => {
  const p = player(), action: FantasyCookingAction = { ...edible, mains: ['wood', 'wood', 'wood'], ingredients: [{ item: 'wood', count: 3 }] };
  p.character!.inventory.wood = 3; const before = structuredClone(p); assert.ok(fantasyCookingError(p.character!, action)); assert.deepEqual(applyFantasyAction(p, action).profile, before);
  p.character!.inventory.wood = 4; const result = applyFantasyAction(p, action, () => .999); assert.equal(result.error, undefined); assert.equal(result.profile.character!.inventory.wood, 0);
  p.character!.job = 'mage'; p.character!.inventory.wood = 3; p.character!.hp = fantasyStats(p.character!).hp; p.character!.mp = fantasyStats(p.character!).mp;
  const magic = applyFantasyAction(p, action, () => .999); assert.equal(magic.error, undefined); assert.equal(magic.profile.character!.inventory.wood, 0);
});
test('finished equipment and forged material IDs cannot enter free slots', () => {
  for (const item of ['blade', 'tinderbox', 'lantern', 'invented', '__proto__']) assert.equal(validFantasyCookingAction({ ...edible, mains: [item, 'meat', 'herb'], ingredients: [{ item, count: 1 }, { item: 'meat', count: 1 }, { item: 'herb', count: 1 }] }), false, item);
});
test('legacy harmful food remains usable at full health and hunger and keeps bounded penalties even when stale', () => {
  for (const [item, status] of [['gritty-dish', 'weakness'], ['toxic-dish', 'poison'], ['charred-dish', undefined]] as const) {
    const p = player(), c = p.character!; c.inventory[item] = 1; c.hunger = 0; c.fatigue = 98; reconcileFoodLots(c); c.foodLots.find(lot => lot.item === item)!.createdAt = c.hour - 8;
    const result = applyFantasyAction(p, { type: 'use', item }), after = result.profile.character!;
    assert.equal(result.error, undefined); assert.equal(after.inventory[item], 0); assert.equal(after.fatigue, 100); if (status) assert.ok(after.effects?.some(effect => effect.id === status));
    assert.equal(validFantasyItemState(after, FANTASY_ITEMS), true);
  }
});
test('new hazardous variants expose an intrinsic appearance before spoilage', () => {
  const p = player(), result = applyFantasyAction(p, gritty, () => .999), c = result.profile.character!, dish = output(c.inventory, 'weakness')[0];
  assert.match(foodSense(c, dish.id).appearance.en, /Hard grains/);
});
