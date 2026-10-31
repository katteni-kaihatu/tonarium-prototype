import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_ITEMS, FANTASY_JOBS } from './fantasy-data.ts';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { FANTASY_PRODUCTION_ITEMS, FANTASY_PRODUCTION_RECIPES, FANTASY_PRODUCTION_STUDIES } from './fantasy-production-catalog.ts';
import { applyFantasyProductionStudy, fantasyProductionRecipeError, fantasyProductionText, grantFantasyProductionRuins, validFantasyProductionClaims } from './fantasy-production-expansion.ts';
import { fantasyCircleKnowledge } from './fantasy-magic-circle.ts';
import { FANTASY_MAPS } from './fantasy-town.ts';
import { fantasyBuildingStock } from './fantasy-town.ts';
import { FANTASY_READABLE_LIBRARY_BOOKS } from './fantasy-library.ts';
function player() { return applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Production', gender: 'female' }, () => .5).profile; }
test('finite production catalog has real localized item effects and recipes reference actual professions and ingredients', () => {
  assert.ok(FANTASY_PRODUCTION_ITEMS.length < 40); assert.ok(new Set(FANTASY_PRODUCTION_ITEMS.map(item => item.id)).size === FANTASY_PRODUCTION_ITEMS.length);
  const items = [...FANTASY_ITEMS, ...FANTASY_PRODUCTION_ITEMS];
  for (const recipe of FANTASY_PRODUCTION_RECIPES) {
    for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(recipe.names?.[locale]);
    assert.ok(FANTASY_JOBS.some(job => job.id === recipe.job)); assert.ok(items.some(item => item.id === recipe.output) || FANTASY_MAPS.some(map => map.item === recipe.output));
    for (const [id, count] of Object.entries(recipe.inputs)) { assert.ok(items.some(item => item.id === id), id); assert.ok(Number.isSafeInteger(count) && count > 0); }
  }
  for (const item of FANTASY_PRODUCTION_ITEMS) for (const locale of ['ko', 'en', 'ja'] as const) { assert.ok(item.names?.[locale]); assert.ok(item.descriptions?.[locale]); }
  const foods = FANTASY_PRODUCTION_ITEMS.filter(item => item.food); assert.ok(foods.length >= 8);
  assert.ok(foods.every(item => item.food!.shelfLife > 0 && item.food!.nutrition > 0 && !!item.use));
  for (const kind of ['hp', 'mp', 'effect']) assert.ok(foods.some(item => !!item.use?.[kind as keyof NonNullable<typeof item.use>]));
});
test('restored documents and copied rune records are owned tradeable items that actually teach their source books', () => {
  for (const study of FANTASY_PRODUCTION_STUDIES) {
    const p = player(); p.character!.inventory[study.item] = 1; const before = JSON.stringify(p), result = applyFantasyProductionStudy(p, study.item)!;
    assert.equal(result.error, undefined); assert.equal(JSON.stringify(p), before); assert.equal(result.profile.character!.inventory[study.item], 0);
    assert.ok(result.profile.character!.readBooks!.includes(study.book)); assert.ok(FANTASY_READABLE_LIBRARY_BOOKS.some(book => book.id === study.book));
    if (study.book === 'rune-physical') assert.ok(fantasyCircleKnowledge(result.profile.character!).cores.includes('physical'));
    const retry = applyFantasyProductionStudy(result.profile, study.item)!; assert.ok(retry.error); assert.deepEqual(retry.profile, result.profile);
    for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(fantasyProductionText(result.profile.log.at(-1)!.text, locale));
  }
});
test('rune copying requires an already studied source book and mapmaking requires actual known locations', () => {
  const c = player().character!, copy = FANTASY_PRODUCTION_RECIPES.find(recipe => recipe.output === 'rune-record-physical')!;
  assert.equal(copy.requiresBook, 'rune-physical'); assert.ok(fantasyProductionRecipeError(c, copy)); c.readBooks = ['rune-physical']; assert.equal(fantasyProductionRecipeError(c, copy), undefined);
  const map = FANTASY_PRODUCTION_RECIPES.find(recipe => recipe.output === 'map-hearth-fields')!;
  assert.deepEqual(new Set(map.requiresLocations), new Set(FANTASY_MAPS.find(value => value.item === map.output)!.locationIds));
  assert.ok(fantasyProductionRecipeError(c, map)); c.visited.push('greenwood', 'sunmeadow'); assert.equal(fantasyProductionRecipeError(c, map), undefined);
});
test('an actual ruins claim grants one faded document with a validated replay-proof receipt', () => {
  let p = player(); p.character!.location = 'oldwatch'; p.character!.visited.push('oldwatch'); p.character!.inventory.lantern = 1;
  for (const action of [{ type: 'dungeonEnter', site: 'oldwatch' }, { type: 'dungeonMove', room: 'archive' }, { type: 'dungeonInspect' }, { type: 'dungeonDisarm' }, { type: 'dungeonInteract' }] as const) { const result = applyFantasyAction(p, action, () => .999); assert.equal(result.error, undefined); p = result.profile; }
  const c = p.character!;
  // 接続済みのエンジンでも、直接の再受取でも二重に増えない。
  grantFantasyProductionRuins(c, 'oldwatch', 'archive'); assert.equal(c.inventory['faded-manuscript'], 1);
  assert.deepEqual(grantFantasyProductionRuins(c, 'oldwatch', 'archive'), []); assert.ok(validFantasyProductionClaims(c));
  const clean = [...c.productionClaims!];
  c.productionClaims = ['oldwatch:archive:']; assert.equal(validFantasyProductionClaims(c), false);
  c.productionClaims = [...clean, 'invented:room']; assert.equal(validFantasyProductionClaims(c), false);
});

test('the real engine crafts paper and ink, restores a found volume and consumes it for actual study', () => {
  let p = player(), c = p.character!; c.job = 'scribe'; c.jobXp.scribe = 0; c.inventory.wood = 5; c.inventory.linen = 3; c.inventory.herb = 5; c.inventory['faded-manuscript'] = 1;
  for (const recipe of ['scribe-make-paper', 'scribe-make-ink', 'scribe-restore-archive']) { const result = applyFantasyAction(p, { type: 'craft', recipe }, () => .999); assert.equal(result.error, undefined); p = result.profile; }
  assert.ok(p.character!.inventory['restored-archive'] >= 1); const before = p.character!.inventory['restored-archive'], revision = p.revision;
  const result = applyFantasyAction(p, { type: 'use', item: 'restored-archive' }); assert.equal(result.error, undefined);
  assert.ok(result.profile.character!.readBooks!.includes('archive-records')); assert.equal(result.profile.character!.inventory['restored-archive'], before - 1); assert.equal(result.profile.revision, revision + 1);
  const stock = fantasyBuildingStock({ location: 'hearth' }, 'market'); assert.ok(stock.includes('scribe-paper')); assert.ok(!stock.includes('rune-record-miracle')); assert.ok(!stock.includes('faded-manuscript'));
});
