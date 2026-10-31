import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_RECIPES } from './fantasy-data.ts';
import { FANTASY_WORKSHOP_MATERIALS, FANTASY_WORKSHOP_MATERIAL_ITEMS, FANTASY_WORKSHOP_PRODUCT_ITEMS, FANTASY_WORKSHOP_RECIPES, FANTASY_WORKSHOP_REAGENTS, FANTASY_WORKSHOP_ITEM_WEIGHTS, FANTASY_WORKSHOP_GATHER_RESOURCES } from './fantasy-workshop-materials.ts';
import { FANTASY_ALCHEMY_SYNTHESIS_ITEMS } from './fantasy-alchemy-catalog.ts';
import { fantasyItemWeight } from './fantasy-bags.ts';
import { fantasyBuildingStock, canSellItem, fantasyCanCraft } from './fantasy-town.ts';
import { fantasyGatheringOptions } from './fantasy-gathering.ts';
import { FANTASY_MONSTERS } from './fantasy-monsters.ts';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyCompileAlchemy, applyFantasyAlchemySynthesis, fantasyAlchemySynthesisText } from './fantasy-alchemy-synthesis.ts';
import { fantasyAlchemyResultKnown, fantasyAlchemyRecipeStability, learnFantasyAlchemyBook } from './fantasy-alchemy-discovery.ts';

const player = () => applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Workshop', gender: 'female' }, () => .5).profile;
const newFamilies = ['thorn-tonic', 'leech-tonic', 'enfeebling-flask', 'silencing-flask', 'lacerating-flask'];
const pairs = [
  ['iron-thyme', 'thunder-beetle-shell'], ['dawn-rosehip', 'troll-marrow'], ['bitter-sedge', 'basilisk-bile'],
  ['ghost-cap', 'wisp-dew'], ['spring-nettle', 'manticore-sinew'],
];

test('all workshop materials have localized finite sources and real crafting or synthesis consumers', () => {
  assert.equal(FANTASY_WORKSHOP_MATERIALS.length, 36);
  assert.equal(FANTASY_WORKSHOP_REAGENTS.length, 20);
  assert.equal(FANTASY_WORKSHOP_PRODUCT_ITEMS.length, 32);
  assert.equal(new Set(FANTASY_WORKSHOP_RECIPES.map(recipe => recipe.job)).size, 13);
  for (const item of [...FANTASY_WORKSHOP_MATERIAL_ITEMS, ...FANTASY_WORKSHOP_PRODUCT_ITEMS]) {
    assert.equal(FANTASY_ITEMS.filter(value => value.id === item.id).length, 1, item.id);
    for (const locale of ['ko', 'en', 'ja'] as const) { assert.ok(item.names?.[locale]); assert.ok(item.descriptions?.[locale]); }
    assert.equal(fantasyItemWeight(item.id), FANTASY_WORKSHOP_ITEM_WEIGHTS[item.id]);
    assert.ok(fantasyItemWeight(item.id) > 0);
  }
  for (const item of FANTASY_WORKSHOP_MATERIAL_ITEMS) {
    assert.ok(fantasyBuildingStock({ location: 'hearth' }, 'market').includes(item.id));
    assert.ok(FANTASY_LOCATIONS.some(place => item.drop?.kinds?.includes(place.kind) && place.danger >= (item.drop.minDanger ?? 0)), item.id);
    assert.ok(FANTASY_RECIPES.some(recipe => Object.hasOwn(recipe.inputs, item.id)) || FANTASY_WORKSHOP_REAGENTS.some(reagent => reagent.id === item.id && Object.keys(reagent.affinities).length > 0), item.id);
  }
});

test('recipes have usable facilities, positive ingredients and consumable or equipped final products', () => {
  const c = player().character!;
  for (const recipe of FANTASY_WORKSHOP_RECIPES) {
    assert.ok(FANTASY_JOBS.some(job => job.id === recipe.job));
    c.job = recipe.job;
    assert.ok(FANTASY_LOCATIONS.some(place => { c.location = place.id; return fantasyCanCraft(c, recipe); }), recipe.id);
    assert.ok(FANTASY_RECIPES.some(value => value.id === recipe.id));
    for (const [id, count] of Object.entries(recipe.inputs)) { assert.ok(FANTASY_ITEMS.some(item => item.id === id), id); assert.ok(Number.isSafeInteger(count) && count > 0); }
    const output = FANTASY_ITEMS.find(item => item.id === recipe.output)!;
    assert.ok(output.use || output.equipment || FANTASY_RECIPES.some(next => Object.hasOwn(next.inputs, output.id)), recipe.id);
    assert.ok(canSellItem({ location: 'hearth' }, output.id));
  }
});

test('workshop resources are gatherable in their real terrain including coast snow and swamp minerals', () => {
  const c = player().character!;
  for (const [id, resource] of Object.entries(FANTASY_WORKSHOP_GATHER_RESOURCES)) {
    assert.ok(FANTASY_LOCATIONS.some(place => { c.location = place.id; return fantasyGatheringOptions(c).some(option => option.resource === resource && option.items.includes(id)); }), id);
  }
  for (const reagent of FANTASY_WORKSHOP_REAGENTS.filter(value => value.kind === 'monster')) assert.ok(FANTASY_MONSTERS.some(monster => monster.loot.some(loot => loot.item === reagent.id)), reagent.id);
});

test('weaving consumes actual fibers and produces intermediate cloth through the shared engine', () => {
  const p = player(), c = p.character!; c.job = 'weaver'; c.location='loom-village'; c.jobXp.weaver = 0; c.hour = 8; c.inventory['ramie-fiber'] = 3;
  const result = applyFantasyAction(p, { type: 'craft', recipe: 'weaver-ramie-cloth' }, () => .999);
  assert.equal(result.error, undefined); assert.equal(result.profile.character!.inventory['ramie-fiber'], 0);
  assert.ok(result.profile.character!.inventory['ramie-cloth'] >= 2); assert.equal(c.inventory['ramie-fiber'], 3);
});

test('new synthesis families have finite bounded geometry and genuinely distinct combat utilities', () => {
  const c = player().character!; c.job = 'alchemist'; c.jobXp.alchemist = 100;
  const utilities = ['thorns', 'lifesteal', 'weaken', 'silence', 'bleed'];
  pairs.forEach((pair, index) => {
    const compiled = fantasyCompileAlchemy(c, 'flask', pair)!;
    assert.equal(compiled.family, newFamilies[index]); assert.equal(compiled.combatUse.utility, utilities[index]);
    assert.deepEqual(compiled, fantasyCompileAlchemy(c, 'flask', [...pair].reverse()));
    assert.equal(fantasyAlchemyRecipeStability('flask', pair), 'experimental');
    const variants = FANTASY_ALCHEMY_SYNTHESIS_ITEMS.filter(item => item.id === newFamilies[index] || item.id.startsWith(`${newFamilies[index]}-`));
    assert.equal(variants.length, 9);
    for (const item of variants) { assert.ok(item.combatUse!.power > 0 && item.combatUse!.power <= 40); assert.ok(item.combatUse!.reach! <= 6); assert.ok(item.combatUse!.radius! <= 2); }
  });
});

test('new mixtures stay unknown after a book or failed synthesis and are learned only on successful exact-carrier manufacture', () => {
  for (const pair of pairs) {
    const p = player(), c = p.character!; c.job = 'alchemist'; c.jobXp.alchemist = 0; c.location = 'mooncity'; c.hour = 8;
    c.readBooks = ['remedies-and-rites']; learnFantasyAlchemyBook(c, 'remedies-and-rites');
    for (const id of pair) c.inventory[id] = 2;
    assert.equal(fantasyAlchemyResultKnown(c, 'flask', pair), false);
    const action = { type: 'alchemyCompose' as const, carrier: 'flask' as const, ingredients: pair };
    const failure = applyFantasyAlchemySynthesis(p, action, () => .99)!;
    assert.equal(fantasyAlchemyResultKnown(failure.profile.character!, 'flask', pair), false);
    assert.equal(failure.profile.log.at(-1)!.text, 'alchemy:synthesis:failed');
    for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(fantasyAlchemySynthesisText(failure.profile.log.at(-1)!.text, locale));
    const success = applyFantasyAlchemySynthesis(p, action, () => 0)!;
    const compiled = fantasyCompileAlchemy(c, 'flask', pair)!;
    assert.equal(success.profile.character!.inventory[compiled.item], 1);
    assert.ok(fantasyAlchemyResultKnown(success.profile.character!, 'flask', pair));
    assert.equal(fantasyAlchemyResultKnown(success.profile.character!, 'mist', pair), false);
    for (const id of pair) assert.equal(success.profile.character!.inventory[id], 1);
  }
});

test('new remedies consume items and cure actual conditions while preserving the source profile', () => {
  const p = player(), c = p.character!; c.inventory['aloe-burn-salve'] = 1; c.hp = 1;
  c.effects = [{ id: 'burn', expiresAt: c.hour + 5 }];
  const result = applyFantasyAction(p, { type: 'use', item: 'aloe-burn-salve' }, () => .999);
  assert.equal(result.error, undefined); assert.equal(result.profile.character!.inventory['aloe-burn-salve'], 0);
  assert.ok(result.profile.character!.hp > 1); assert.ok(!result.profile.character!.effects?.some(effect => effect.id === 'burn'));
  assert.equal(c.inventory['aloe-burn-salve'], 1);
});
