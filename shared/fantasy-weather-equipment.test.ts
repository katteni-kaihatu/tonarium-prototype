import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile, startFantasyActivity, advanceFantasyWorld } from './fantasy-engine.ts';
import { fantasyEnvironment, fantasyEnvironmentPenalty, fantasyWeatherExposure } from './fantasy-environment.ts';
import { fantasyCampingKit, validFantasyCampProgress } from './fantasy-camping.ts';
import { FANTASY_ITEMS, FANTASY_LOCATIONS, FANTASY_RECIPES } from './fantasy-data.ts';
import { fantasyBuildingStock } from './fantasy-town.ts';
import type { FantasyCharacter, FantasySeason } from './fantasy.ts';

const character = () => {
  const c = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'Weather' }, () => .5).profile.character!;
  c.inventory = { lantern: 1 }; c.hunger = 0; c.fatigue = 70; return c;
};
function climate(season: FantasySeason, weather?: 'rain' | 'clear', kind?: string) {
  const c = character(); c.location = kind ? FANTASY_LOCATIONS.find(p => p.kind === kind)!.id : 'greenwood';
  const offset = ['spring', 'summer', 'autumn', 'winter'].indexOf(season) * 15;
  for (let day = offset; day < offset + 15; day++) for (const hour of [6, 12]) {
    c.hour = day * 24 + hour;
    if (!weather || fantasyEnvironment(c).weather === weather) return c;
  }
  throw Error('Missing deterministic weather fixture');
}

test('seasonal tools and enchanted outfits are sold by the appropriate facilities with three-language facts', () => {
  for (const id of ['travel-umbrella', 'shade-hat', 'frost-charm', 'ember-handwarmer', 'cooling-camp-mat', 'frostweave-cloak', 'emberlined-coat']) {
    const item = FANTASY_ITEMS.find(item => item.id === id);
    assert.ok(item, id);
    for (const locale of ['ko', 'en', 'ja'] as const) { assert.ok(item.names?.[locale]); assert.ok(item.descriptions?.[locale]); }
    const venue = ['travel-umbrella', 'shade-hat'].includes(id) ? 'market' : 'tower';
    const city = FANTASY_LOCATIONS.find(p => fantasyBuildingStock({ location: p.id }, venue).includes(id));
    assert.ok(city, `${venue}: ${id}`);
  }
});

test('weather goods can actually be bought and their recipes use real materials', () => {
  for (const id of ['travel-umbrella', 'frost-charm', 'ember-handwarmer', 'frostweave-cloak', 'emberlined-coat']) {
    const p = newFantasyProfile(); p.character = character(); p.character.gold = 1000;
    const venue = id === 'travel-umbrella' ? 'market' : 'tower';
    p.character.location = FANTASY_LOCATIONS.find(place => fantasyBuildingStock({ location: place.id }, venue).includes(id))!.id;
    const purchase = applyFantasyAction(p, { type: 'buy', item: id, count: 1 });
    assert.equal(purchase.error, undefined, id); assert.equal(purchase.profile.character!.inventory[id], 1);
    assert.ok(purchase.profile.character!.gold < 1000);
  }
  for (const recipe of FANTASY_RECIPES.filter(recipe => ['travel-umbrella', 'frost-charm', 'ember-handwarmer', 'frostweave-cloak', 'emberlined-coat', 'cooling-camp-mat'].includes(recipe.output))) {
    for (const id of Object.keys(recipe.inputs)) assert.ok(FANTASY_ITEMS.some(item => item.id === id), id);
  }
});

test('all four seasons use current weather and drop protection when gear is lost or the player enters a building', () => {
  for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
    const c = climate(season); assert.equal(fantasyEnvironment(c).season, season);
    const bare = fantasyEnvironmentPenalty(c); c.inventory['frost-charm'] = 2; c.inventory['ember-handwarmer'] = 2; c.inventory['travel-umbrella'] = 2;
    const protectedValue = fantasyEnvironmentPenalty(c); assert.ok(protectedValue <= bare);
    c.inventory = { lantern: 1 }; assert.equal(fantasyEnvironmentPenalty(c), bare);
    c.location = FANTASY_LOCATIONS.find(place => place.kind === 'city')!.id; assert.equal(fantasyEnvironmentPenalty(c), 0);
  }
});

test('carried cold and fire enchantments lower their matching exposure without stacking or surviving removal', () => {
  for (const [c, id] of [[climate('summer', 'clear', 'desert'), 'frost-charm'], [climate('winter', undefined, 'snow'), 'ember-handwarmer']] as const) {
    const bare = fantasyEnvironmentPenalty(c); c.inventory[id] = 1;
    const protectedValue = fantasyEnvironmentPenalty(c); assert.ok(protectedValue < bare, id);
    c.inventory[id] = 20; assert.equal(fantasyEnvironmentPenalty(c), protectedValue);
    delete c.inventory[id]; assert.equal(fantasyEnvironmentPenalty(c), bare);
  }
});

test('winter clothing must be owned and actually worn, and wearing it in summer adds heat burden', () => {
  const c = climate('winter', undefined, 'snow'), bare = fantasyEnvironmentPenalty(c);
  c.outfit = 'fur-parka'; assert.equal(fantasyEnvironmentPenalty(c), bare);
  c.outfit = undefined; c.inventory['fur-parka'] = 1; assert.equal(fantasyEnvironmentPenalty(c), bare);
  const p = newFantasyProfile(); p.character = c;
  const result = applyFantasyAction(p, { type: 'wear', item: 'fur-parka' }, () => .99);
  assert.equal(result.error, undefined); assert.ok(fantasyEnvironmentPenalty(result.profile.character!) < bare);
  const summer = climate('summer', 'clear', 'desert'); summer.inventory['fur-parka'] = 1;
  const unwrapped = fantasyEnvironmentPenalty(summer); summer.outfit = 'fur-parka';
  assert.ok(fantasyEnvironmentPenalty(summer) > unwrapped);
});

test('umbrella blocks rain outside camp, while tarp and unspent ward protect only the campsite', () => {
  const c = climate('autumn', 'rain'), exposed = fantasyEnvironmentPenalty(c), recovery = fantasyCampingKit(c).fatigue;
  c.inventory['ward-seal'] = 1;
  assert.equal(fantasyEnvironmentPenalty(c), exposed);
  assert.ok(fantasyCampingKit(c).fatigue > recovery);
  assert.equal(c.inventory['ward-seal'], 1);
  delete c.inventory['ward-seal']; assert.equal(fantasyCampingKit(c).fatigue, recovery);
  c.inventory['camp-tarp'] = 1; assert.ok(fantasyCampingKit(c).fatigue > recovery);
  assert.equal(fantasyEnvironmentPenalty(c), exposed);
  c.inventory['travel-umbrella'] = 1; assert.equal(fantasyEnvironmentPenalty(c), exposed - 1);
});

test('summer travelwear and rain clothing work through the actual wear action in their matching weather', () => {
  for (const [c, id] of [[climate('summer', 'clear', 'desert'), 'summer-wrap'], [climate('autumn', 'rain'), 'rain-cape']] as const) {
    const before = fantasyEnvironmentPenalty(c), p = newFantasyProfile(); c.inventory[id] = 1; p.character = c;
    const result = applyFantasyAction(p, { type: 'wear', item: id }); assert.equal(result.error, undefined);
    assert.ok(fantasyEnvironmentPenalty(result.profile.character!) < before, id);
  }
});

test('winter summer and rain camping protections improve real recovery, not only item descriptions', () => {
  for (const [c, id] of [[climate('winter', undefined, 'snow'), 'fur-bedroll'], [climate('summer', 'clear', 'desert'), 'cooling-camp-mat'], [climate('autumn', 'rain'), 'ward-seal']] as const) {
    const p = newFantasyProfile(); p.character = c;
    const bare = applyFantasyAction(p, { type: 'rest' }, () => .99); assert.equal(bare.error, undefined);
    const equipped = structuredClone(p); equipped.character!.inventory[id] = 1;
    const protectedRest = applyFantasyAction(equipped, { type: 'rest' }, () => .99); assert.equal(protectedRest.error, undefined);
    assert.ok(protectedRest.profile.character!.fatigue < bare.profile.character!.fatigue, id);
  }
});

test('hourly camping across weather transitions gives identical recovery to one advance and remains valid', () => {
  const p = newFantasyProfile(); p.character = climate('autumn', 'rain');
  const start = startFantasyActivity(p, { type: 'rest' }, p.character.hour, () => .999, { camp: true });
  assert.equal(start.error, undefined); assert.ok(start.profile.activity);
  const end = start.profile.activity.endsAt;
  const one = advanceFantasyWorld(start.profile, end, { ambush: false }).profile;
  let many = start.profile;
  for (let hour = p.character.hour + .5; hour <= end + 1e-6; hour += .5) {
    many = advanceFantasyWorld(many, hour, { ambush: false }).profile;
    if (many.activity) assert.equal(validFantasyCampProgress(many.activity, many.character!), true);
  }
  assert.equal(many.character!.fatigue, one.character!.fatigue);
});
test('night tools have distinct relief but even the best lantern leaves a darkness penalty', () => {
  const c = character(); c.location = 'greenwood'; c.hour = 20;
  const values = [];
  for (const id of [undefined, 'guild-loan-lantern', 'lantern', 'everglow-lantern']) {
    c.inventory = id ? { [id]: 1, 'rain-cape': 1 } : { 'rain-cape': 1 }; c.outfit = 'rain-cape';
    values.push(fantasyEnvironmentPenalty(c));
  }
  assert.deepEqual(values, [4, 3, 2, 1]);
  c.inventory['everglow-lantern'] = 20; assert.equal(fantasyEnvironmentPenalty(c), 1);
  c.inventory = { 'rain-cape': 1 }; assert.equal(fantasyWeatherExposure(c, { camping: true, campfire: true }).darkness, 2);
  c.race = 'batkin'; assert.equal(fantasyEnvironmentPenalty(c), 0);
});
test('being between regions does not inherit indoor protection from the departure city', () => {
  const c = character(); c.location = 'hearth'; c.hour = 20; c.inventory = {};
  c.travelPosition = { from: 'hearth', to: 'greenwood', fraction: .25 };
  assert.equal(fantasyEnvironment(c).indoors, false);
  assert.ok(fantasyEnvironmentPenalty(c) >= 4);
});
