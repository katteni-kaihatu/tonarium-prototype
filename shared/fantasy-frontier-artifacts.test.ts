import test from 'node:test';
import assert from 'node:assert/strict';
import type { FantasyCharacter } from './fantasy.ts';
import { FANTASY_FRONTIER_ARTIFACTS, fantasyArtifactEffects, fantasyEquippedArtifact } from './fantasy-frontier-artifacts.ts';
import { advanceFantasyFoodPreservation, fantasyFoodLotAge, validFantasyFoodPreservation } from './fantasy-food-preservation.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyEquipGear } from './fantasy-equipment.ts';
import { FANTASY_ITEMS, FANTASY_LOCATIONS } from './fantasy-data.ts';
import { canBuyItem } from './fantasy-town.ts';
import { fantasyEnvironment, fantasyEnvironmentActionError, fantasyWeatherExposure } from './fantasy-environment.ts';
import { advanceFantasyCamp, fantasyCampingKit, fantasyCampAmbushHit, validFantasyCampProgress } from './fantasy-camping.ts';

function carrier(id = 'frontier-ember-acorn'): FantasyCharacter {
  return { inventory: { [id]: 1 }, equipment: { artifact: id } } as FantasyCharacter;
}

test('only an owned artifact in its dedicated slot provides utility', () => {
  const c = carrier();
  assert.equal(fantasyEquippedArtifact(c)?.id, 'frontier-ember-acorn');
  assert.equal(fantasyArtifactEffects(c).coldRelief, 1);
  c.equipment = {};
  assert.equal(fantasyEquippedArtifact(c), undefined);
  assert.equal(fantasyArtifactEffects(c).coldRelief, 0);
  c.equipment = { necklace: 'frontier-ember-acorn' };
  assert.equal(fantasyArtifactEffects(c).coldRelief, 0);
  c.equipment = { artifact: 'frontier-ember-acorn' };
  for (const count of [0, -1, .5, NaN, Infinity]) {
    c.inventory['frontier-ember-acorn'] = count;
    assert.equal(fantasyEquippedArtifact(c), undefined);
  }
  c.inventory = Object.create({ 'frontier-ember-acorn': 1 });
  assert.equal(fantasyEquippedArtifact(c), undefined);
});

test('copies and other held artifacts do not stack, and swapping replaces all effects', () => {
  const c = carrier();
  c.inventory['frontier-ember-acorn'] = 20;
  c.inventory['frontier-weather-remote'] = 20;
  assert.equal(fantasyArtifactEffects(c).coldRelief, 1);
  assert.equal(fantasyArtifactEffects(c).rainRelief, 0);
  c.equipment!.artifact = 'frontier-weather-remote';
  assert.equal(fantasyArtifactEffects(c).coldRelief, 0);
  assert.equal(fantasyArtifactEffects(c).rainRelief, 1);
  delete c.equipment!.artifact;
  assert.ok(Object.values(fantasyArtifactEffects(c)).every(value => value === 0));
});

test('unknown items, archaeology relics and forged crafted instances cannot provide artifact effects', () => {
  for (const id of ['relic', 'echo-pendant', '__proto__', 'not-an-artifact']) {
    assert.equal(fantasyEquippedArtifact(carrier(id)), undefined);
  }
  const c = carrier();
  c.equippedGear = { artifact: 'missing' };
  assert.equal(fantasyEquippedArtifact(c), undefined);
  c.gear = [{ id: 'missing', item: 'frontier-weather-remote', quality: 1, createdAt: 0 }];
  assert.equal(fantasyEquippedArtifact(c), undefined);
});

test('artifact utilities are isolated values and do not mutate the character or another read', () => {
  const c = carrier('frontier-pocket-refrigerator'), before = structuredClone(c);
  const effects = fantasyArtifactEffects(c);
  assert.equal(effects.foodAgingReduction, .25);
  effects.foodAgingReduction = 100;
  assert.equal(fantasyArtifactEffects(c).foodAgingReduction, .25);
  assert.deepEqual(c, before);
});

test('the first-clear catalog is multilingual, equipable, diverse and has no repeat exploration drop', () => {
  assert.ok(FANTASY_FRONTIER_ARTIFACTS.length >= 24 && FANTASY_FRONTIER_ARTIFACTS.length <= 30);
  assert.equal(new Set(FANTASY_FRONTIER_ARTIFACTS.map(item => item.id)).size, FANTASY_FRONTIER_ARTIFACTS.length);
  const effectKinds = new Set<string>();
  for (const item of FANTASY_FRONTIER_ARTIFACTS) {
    assert.equal(item.category, 'artifact');
    assert.equal(item.equipment?.slot, 'artifact');
    assert.equal(item.drop, undefined, item.id);
    assert.equal(item.use, undefined, item.id);
    for (const locale of ['ko', 'en', 'ja'] as const) {
      assert.ok(item.names?.[locale]?.trim(), `${item.id}:${locale}:name`);
      assert.ok(item.descriptions?.[locale]?.trim(), `${item.id}:${locale}:description`);
    }
    const effects = fantasyArtifactEffects(carrier(item.id));
    for (const [key, value] of Object.entries(effects)) {
      assert.ok(Number.isFinite(value) && value >= 0, `${item.id}:${key}`);
      if (value > 0) effectKinds.add(key);
    }
    assert.ok(effects.coldRelief <= 1 && effects.heatRelief <= 1 && effects.rainRelief <= 1 && effects.darknessRelief <= 1);
    assert.ok(effects.foodAgingReduction <= .25 && effects.campHpBonus <= .05 && effects.campMpBonus <= .05);
    assert.ok(effects.campFatigueBonus <= 5 && effects.campRiskReduction <= .08 && effects.gatherYieldBonus <= 1);
    for (const [stat, bonus] of Object.entries(item.equipment!.stats ?? {})) assert.ok(bonus >= 0 && bonus <= (stat === 'hp' || stat === 'mp' ? 15 : 2), `${item.id}:${stat}`);
    assert.ok((item.equipment!.guard ?? 0) <= 2 && (item.equipment!.check ?? 0) <= 1);
    assert.ok(Object.values(effects).some(value => value > 0) || Object.values(item.equipment!.stats ?? {}).some(value => value > 0) || item.equipment!.check || item.equipment!.guard, item.id);
  }
  assert.equal(effectKinds.size, 10);
});

test('food preservation applies only to equipped elapsed time and cannot be replayed or restored by swapping', () => {
  const c = carrier('frontier-pocket-refrigerator');
  c.inventory.meat = 2;
  c.foodLots = [{ id: 'meal', item: 'meat', count: 2, createdAt: 10 }];
  advanceFantasyFoodPreservation(c, 10, 14);
  assert.equal(fantasyFoodLotAge(14, c.foodLots[0]), 3);
  assert.equal(c.foodLots[0].preservedHours, 1);
  const before = structuredClone(c.foodLots);
  advanceFantasyFoodPreservation(c, 10, 14);
  assert.deepEqual(c.foodLots, before);
  c.equipment = {};
  advanceFantasyFoodPreservation(c, 14, 18);
  assert.equal(fantasyFoodLotAge(18, c.foodLots[0]), 7);
  c.equipment = { artifact: 'frontier-pocket-refrigerator' };
  advanceFantasyFoodPreservation(c, 18, 22);
  assert.equal(fantasyFoodLotAge(22, c.foodLots[0]), 10);
  assert.equal(validFantasyFoodPreservation(c.foodLots[0], 22), true);
});

test('preservation bags use their stronger rate while artifact preservation covers only overflow', () => {
  const c = carrier('frontier-pocket-refrigerator');
  c.inventory.meat = 30; c.inventory['preserve-magic-bag'] = 1; c.magicBags = ['preserve-magic-bag'];
  c.foodLots = [{ id: 'food', item: 'meat', count: 30, createdAt: 10 }];
  advanceFantasyFoodPreservation(c, 10, 20);
  assert.equal(c.foodLots.filter(lot => lot.preservedHours === 9).reduce((sum, lot) => sum + lot.count, 0), 24);
  assert.equal(c.foodLots.filter(lot => lot.preservedHours === 2.5).reduce((sum, lot) => sum + lot.count, 0), 6);
  assert.ok(c.foodLots.every(lot => validFantasyFoodPreservation(lot, 20)));
  c.equipment = {};
  advanceFantasyFoodPreservation(c, 20, 21);
  assert.equal(c.foodLots.find(lot => lot.count === 6)!.preservedHours, 2.5);
});

test('artifact preservation stops at spoilage and long advances match incremental saves', () => {
  const c = carrier('frontier-pocket-refrigerator');
  c.inventory.meat = 1; c.foodLots = [{ id: 'food', item: 'meat', count: 1, createdAt: 0 }];
  const once = structuredClone(c), incremental = structuredClone(c);
  advanceFantasyFoodPreservation(once, 0, 40);
  for (let hour = 0; hour < 40; hour++) advanceFantasyFoodPreservation(incremental, hour, hour + 1);
  assert.equal(fantasyFoodLotAge(40, once.foodLots[0]), 36);
  assert.equal(fantasyFoodLotAge(40, incremental.foodLots[0]), 36);
  const spoiled = structuredClone(c);
  advanceFantasyFoodPreservation(spoiled, 13, 14);
  assert.equal(fantasyFoodLotAge(14, spoiled.foodLots[0]), 14);
  assert.equal(spoiled.foodLots[0].preservedHours, 0);
  c.equipment = {};
  advanceFantasyFoodPreservation(c, 0, 4);
  assert.equal(fantasyFoodLotAge(4, c.foodLots[0]), 4);
});

test('registered artifacts equip through real gear actions and replace, rather than accumulate, stat bonuses', () => {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Artifact carrier', gender: 'female' }, () => .999).profile;
  const c = p.character!; c.equipment = {};
  const base = fantasyStats(c);
  c.inventory['frontier-bureaucratic-paperweight'] = 3;
  c.inventory['frontier-mana-usb'] = 1;
  assert.equal(fantasyStats(c).strength, base.strength);
  assert.equal(fantasyEquipGear(c, 'frontier-bureaucratic-paperweight'), undefined);
  assert.equal(fantasyStats(c).strength, base.strength + 2);
  assert.equal(fantasyEquipGear(c, 'frontier-mana-usb'), undefined);
  assert.equal(fantasyStats(c).strength, base.strength);
  assert.equal(fantasyStats(c).mp, base.mp + 15);
  c.inventory['frontier-mana-usb'] = 0;
  assert.equal(fantasyStats(c).mp, base.mp);
});

test('first-clear artifacts are registered once and cannot be bought at existing facilities', () => {
  for (const item of FANTASY_FRONTIER_ARTIFACTS) {
    assert.equal(FANTASY_ITEMS.filter(candidate => candidate.id === item.id).length, 1, item.id);
    assert.ok(FANTASY_LOCATIONS.every(place => !canBuyItem({ location: place.id }, item.id)), item.id);
  }
});

function explorer() {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Weather carrier', gender: 'female' }, () => .999).profile;
  Object.assign(p.character!, { location: 'greenwood', hour: 12, inventory: { lantern: 1 }, equipment: {}, outfit: undefined, fatigue: 70, hp: 10, mp: 1 });
  return p;
}

test('weather artifacts reduce actual matching severity only while equipped, including camp weather loss', () => {
  for (const [id, axis, location, hour] of [
    ['frontier-ember-acorn', 'cold', 'frostpass', 24 * 46 + 12],
    ['frontier-sunshade-satellite', 'heat', 'ashpeak', 24 * 16 + 12],
    ['frontier-weather-remote', 'rain', 'greenwood', 12],
  ] as const) {
    const c = explorer().character!; c.location = location; c.hour = hour;
    if (axis === 'rain') while (fantasyEnvironment(c).weather !== 'rain') c.hour += 24;
    const bare = fantasyWeatherExposure(c); assert.ok(bare[axis] > 0, id);
    c.inventory[id] = 10;
    assert.equal(fantasyWeatherExposure(c)[axis], bare[axis]);
    c.equipment = { artifact: id };
    const protectedValue = fantasyWeatherExposure(c);
    assert.equal(protectedValue[axis], bare[axis] - 1, id);
    assert.ok(protectedValue.campFatigueLoss < bare.campFatigueLoss, id);
    assert.equal(protectedValue.penalty, Math.min(6, protectedValue.darkness + protectedValue.rain + Math.max(protectedValue.cold, protectedValue.heat)));
    c.inventory[id] = 0;
    assert.equal(fantasyWeatherExposure(c)[axis], bare[axis]);
  }
});

test('darkness artifacts leave a residual penalty and cannot bypass the actual light requirement', () => {
  const c = explorer().character!; c.hour = 20; c.inventory['frontier-night-shift-badge'] = 1;
  c.equipment = { artifact: 'frontier-night-shift-badge' };
  assert.equal(fantasyWeatherExposure(c).darkness, 1);
  c.inventory = { 'frontier-night-shift-badge': 1, 'everglow-lantern': 1 };
  assert.equal(fantasyWeatherExposure(c).darkness, 1);
  delete c.inventory['everglow-lantern'];
  assert.equal(fantasyWeatherExposure(c).darkness, 3);
  assert.ok(fantasyEnvironmentActionError(c, { type: 'explore' }));
  c.race = 'batkin';
  assert.equal(fantasyWeatherExposure(c).darkness, 0);
});

test('camp artifacts improve actual recovery and use one bounded source with no duplicate stacking', () => {
  for (const [id, axis, extra] of [
    ['frontier-dream-pillow', 'hp', .05], ['frontier-coffee-pot', 'mp', .05], ['frontier-hiking-snail', 'baseFatigue', 5],
  ] as const) {
    const p = explorer(), c = p.character!, base = fantasyCampingKit(c);
    const normal = applyFantasyAction(p, { type: 'rest' }, () => .999); assert.equal(normal.error, undefined);
    c.inventory[id] = 12; c.equipment = { artifact: id };
    const enhanced = fantasyCampingKit(c);
    assert.equal(enhanced[axis], base[axis] + extra, id);
    const rest = applyFantasyAction(p, { type: 'rest' }, () => .999); assert.equal(rest.error, undefined);
    if (axis === 'baseFatigue') assert.ok(rest.profile.character!.fatigue < normal.profile.character!.fatigue, id);
    else assert.ok(rest.profile.character![axis] > normal.profile.character![axis], id);
    c.equipment = {}; assert.equal(fantasyCampingKit(c)[axis], base[axis]);
  }
});

test('camp protection changes real ambush outcomes without making a camp completely safe', () => {
  const c = explorer().character!, bare = fantasyCampingKit(c);
  c.inventory['frontier-do-not-disturb'] = 7; c.equipment = { artifact: 'frontier-do-not-disturb' };
  const protectedValue = fantasyCampingKit(c);
  assert.equal(protectedValue.riskMultiplier, bare.riskMultiplier * .92);
  const profile = newFantasyProfile(); profile.character = c;
  const activity = { action: { type: 'rest' }, startedAt: 12, endsAt: 20, seed: 0, camp: { checked: 0, watchHours: 0, fatigueRecovered: 0 } } as NonNullable<typeof profile.activity>;
  let avoided = 0, stillHit = 0;
  for (let seed = 0; seed < 1000; seed++) {
    activity.seed = seed;
    c.equipment = {};
    const before = fantasyCampAmbushHit(activity, c, 5, 19);
    c.equipment = { artifact: 'frontier-do-not-disturb' };
    const after = fantasyCampAmbushHit(activity, c, 5, 19);
    if (before && !after) avoided++;
    if (after) stillHit++;
  }
  assert.ok(avoided > 0);
  assert.ok(stillHit > 0);
});

test('legacy camps without weather history cannot recover fatigue from already elapsed exposure', () => {
  const p = explorer(), c = p.character!;
  Object.assign(c, { location: 'frostpass', hour: 1116, fatigue: 90 });
  const activity = { action: { type: 'rest' }, startedAt: 1116, endsAt: 1124, seed: 10, camp: { checked: 0, watchHours: 0, fatigueRecovered: 0 } } as NonNullable<typeof p.activity>;
  advanceFantasyCamp(c, activity, 1116, 1120); c.hour = 1120;
  const legacy = structuredClone(c), legacyActivity = structuredClone(activity);
  delete legacyActivity.camp!.weatherLoss;
  assert.equal(validFantasyCampProgress(legacyActivity, legacy), true);
  advanceFantasyCamp(c, activity, 1120, 1121);
  advanceFantasyCamp(legacy, legacyActivity, 1120, 1121);
  assert.equal(legacy.fatigue, c.fatigue);
  assert.equal(legacyActivity.camp!.fatigueRecovered, activity.camp!.fatigueRecovered);
  assert.equal(legacyActivity.camp!.weatherLoss, activity.camp!.weatherLoss);
});
