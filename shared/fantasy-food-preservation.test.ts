import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile, advanceFantasyWorld } from './fantasy-engine.ts';
import { FANTASY_ITEMS } from './fantasy-data.ts';
import { applyFantasyBagAction, fantasyBagState, fantasyItemWeight, fantasyPreservedFoodAllocation } from './fantasy-bags.ts';
import { advanceFantasyFoodPreservation, fantasyFoodLotAge, validFantasyFoodPreservation, FANTASY_PRESERVATION_BAG as bag } from './fantasy-food-preservation.ts';
import { FANTASY_FOOD_META, foodDetails } from './fantasy-life.ts';
import { deliverFantasyEconomyParcel, takeFantasyEconomyParcel, applyFantasyEconomyCommand, newFantasyEconomyLedger, validFantasyEconomyLedger, type FantasyEconomyCommand } from './fantasy-economy.ts';

function player() {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Cold food', source: 'human', gender: 'female' }, () => .5).profile;
  Object.assign(p.character!, { hour: 10, inventory: { [bag]: 1 }, magicBags: [bag], foodLots: [] });
  return p;
}
test('preservation food space never frees a main-pack type slot while that food also overflows outside', () => {
  const p = player(), c = p.character!;
  const ordinary = FANTASY_ITEMS.filter(item => item.category !== 'bag' && !FANTASY_FOOD_META.some(food => food.item === item.id)).sort((a, b) => fantasyItemWeight(a) - fantasyItemWeight(b)).slice(0, 23);
  c.inventory = { [bag]: 1, bread: 49, ...Object.fromEntries(ordinary.map(item => [item.id, 1])) };
  assert.equal(fantasyPreservedFoodAllocation(c).counts.bread, 48);
  assert.equal(fantasyBagState(c).overloaded, true, '25 main-pack types exceed the 24-type starter pack');
  c.inventory.bread = 48;
  assert.equal(fantasyBagState(c).overloaded, false, 'all bread is now in the separate food bag');
});
test('each preservation bag holds at most 12kg and eight food types, without unused general capacity', () => {
  const c = player().character!;
  const foods = FANTASY_FOOD_META.slice(0, 9).map(meta => meta.item);
  c.inventory = { [bag]: 1, ...Object.fromEntries(foods.map(id => [id, 1])) };
  assert.equal(Object.keys(fantasyPreservedFoodAllocation(c).counts).length, 8);
  c.inventory = { [bag]: 1, meat: 25 };
  assert.deepEqual(fantasyPreservedFoodAllocation(c), { counts: { meat: 24 }, weight: 12_000, slots: 1 });
  c.inventory = { [bag]: 1, wood: 13 };
  assert.equal(fantasyBagState(c).weightLimit, 20_000);
  assert.equal(fantasyBagState(c).weight, 20_700);
  assert.equal(fantasyBagState(c).overloaded, true);
});
test('only covered quantities age at one tenth, oldest lots first, and replay cannot add preservation', () => {
  const c = player().character!;
  c.inventory.meat = 30;
  c.foodLots = [{ id: 'new', item: 'meat', count: 10, createdAt: 10 }, { id: 'old', item: 'meat', count: 20, createdAt: 8 }];
  advanceFantasyFoodPreservation(c, 10, 20);
  assert.equal(c.foodLots.find(lot => lot.id === 'old')!.count, 20);
  const held = c.foodLots.filter(lot => lot.preservedHours === 9);
  assert.equal(held.reduce((n, lot) => n + lot.count, 0), 24);
  assert.equal(c.foodLots.filter(lot => !lot.preservedHours).reduce((n, lot) => n + lot.count, 0), 6);
  assert.equal(fantasyFoodLotAge(20, c.foodLots.find(lot => lot.id === 'old')!), 3);
  const before = structuredClone(c.foodLots); advanceFantasyFoodPreservation(c, 10, 20);
  assert.deepEqual(c.foodLots, before);
  assert.equal(c.foodLots.reduce((n, lot) => n + lot.count, 0), 30);
  assert.ok(c.foodLots.every(lot => validFantasyFoodPreservation(lot, 20)));
});
test('two bags expand covered quantities without multiplying the rate; merely owning a bag does nothing', () => {
  for (const equipped of [0, 1, 2]) {
    const c = player().character!; c.inventory = { [bag]: 2, meat: 50 }; c.magicBags = Array(equipped).fill(bag);
    c.foodLots = [{ id: 'meat', item: 'meat', count: 50, createdAt: 10 }];
    advanceFantasyFoodPreservation(c, 10, 20);
    assert.equal(c.foodLots.filter(lot => lot.preservedHours === 9).reduce((n, lot) => n + lot.count, 0), equipped * 24);
    assert.ok(c.foodLots.every(lot => (lot.preservedHours ?? 0) <= 9));
  }
});
test('preservation stops at the shelf-life boundary and large advances match smaller saved advances', () => {
  const c = player().character!; c.hour = 0; c.inventory.meat = 1;
  c.foodLots = [{ id: 'fresh', item: 'meat', count: 1, createdAt: 0 }];
  const once = structuredClone(c), incremental = structuredClone(c);
  advanceFantasyFoodPreservation(once, 0, 200);
  for (let from = 0; from < 200; from += 10) advanceFantasyFoodPreservation(incremental, from, from + 10);
  assert.equal(fantasyFoodLotAge(200, once.foodLots[0]), 92);
  assert.equal(fantasyFoodLotAge(200, once.foodLots[0]), fantasyFoodLotAge(200, incremental.foodLots[0]));
  const expired = structuredClone(c); expired.foodLots[0].createdAt = 0;
  advanceFantasyFoodPreservation(expired, 12, 13);
  assert.equal(expired.foodLots[0].preservedHours, 0);
  assert.equal(fantasyFoodLotAge(13, expired.foodLots[0]), 13);
});
test('preservation metadata rejects future clocks, excess saved time, negative and non-finite values', () => {
  const valid = { createdAt: 0, preservedHours: 9, preservationAt: 10 };
  assert.equal(validFantasyFoodPreservation(valid, 10), true);
  for (const change of [{ preservedHours: 9.01 }, { preservationAt: 11 }, { preservedHours: -1 }, { preservationAt: -1 }, { preservedHours: Infinity }, { preservationAt: NaN }, { preservedHours: undefined }, { preservationAt: undefined }]) {
    assert.equal(validFantasyFoodPreservation({ ...valid, ...change }, 10), false);
  }
});
test('equipping cannot restore stale or spoiled food, and unequipping only changes future aging', () => {
  const p = player(), c = p.character!;
  c.inventory.meat = 1; c.foodLots = [{ id: 'old', item: 'meat', count: 1, createdAt: 0 }];
  assert.equal(foodDetails(c, 'meat')!.quality, 'stale');
  advanceFantasyFoodPreservation(c, 10, 20); c.hour = 20;
  assert.equal(foodDetails(c, 'meat')!.quality, 'stale');
  const removed = applyFantasyBagAction(p, { type: 'magicBagRemove', slot: 0 })!;
  assert.equal(removed.error, undefined);
  const later = advanceFantasyWorld(removed.profile, 22).profile;
  assert.equal(foodDetails(later.character!, 'meat')!.age, 13);
  assert.equal(foodDetails(later.character!, 'meat')!.quality, 'spoiled');
  const reequipped = applyFantasyBagAction(later, { type: 'bagEquip', item: bag })!.profile;
  const after = advanceFantasyWorld(reequipped, 24).profile;
  assert.equal(foodDetails(after.character!, 'meat')!.age, 15);
  assert.equal(foodDetails(after.character!, 'meat')!.quality, 'spoiled');
});
test('food parcel splitting and delivery preserve exact effective age and future normal aging', () => {
  const source = player().character!, recipient = player().character!;
  source.inventory.meat = 3; source.foodLots = [{ id: 'food', item: 'meat', count: 3, createdAt: 0, preservedHours: 8.1, preservationAt: 9 }];
  recipient.inventory = {}; recipient.magicBags = [];
  const parcel = takeFantasyEconomyParcel(source, { item: 'meat', count: 2 })!;
  assert.equal(deliverFantasyEconomyParcel(recipient, parcel, 2, 'preservation-test'), true);
  assert.equal(source.foodLots[0].count, 1); assert.equal(recipient.foodLots[0].count, 2);
  assert.equal(fantasyFoodLotAge(10, source.foodLots[0]), fantasyFoodLotAge(10, recipient.foodLots[0]));
  advanceFantasyFoodPreservation(recipient, 10, 15);
  assert.equal(recipient.foodLots[0].preservedHours, 8.1);
  assert.equal(fantasyFoodLotAge(15, recipient.foodLots[0]), 6.9);
  assert.ok(validFantasyFoodPreservation(recipient.foodLots[0], 15));
});

test('two-sided trading transfers preservation accrued after the offer through confirmation and restart', () => {
  const source = player(), recipient = player();
  source.character!.inventory.meat = 2; source.character!.foodLots = [{ id: 'trade-food', item: 'meat', count: 2, createdAt: 10 }];
  recipient.character!.inventory = {}; recipient.character!.magicBags = [];
  let profiles = new Map([['a', source], ['b', recipient]]), ledger = newFantasyEconomyLedger(), serial = 0;
  const step = (actor: string, command: FantasyEconomyCommand, hour = 10) => {
    const result = applyFantasyEconomyCommand(ledger, profiles, actor, command, { hour, peers: ['a', 'b'], token: `cold-trade-${serial++}` });
    assert.equal(result.error, undefined); ledger = result.ledger; profiles = result.profiles;
    assert.equal(validFantasyEconomyLedger(ledger, hour), true);
  };
  step('a', { type: 'open', peer: 'b' }); const id = Object.keys(ledger.trades)[0];
  step('a', { type: 'offer', trade: id, revision: 0, gold: 0, items: [{ item: 'meat', count: 1 }] });
  profiles.set('a', advanceFantasyWorld(profiles.get('a')!, 10.5).profile);
  profiles.set('b', advanceFantasyWorld(profiles.get('b')!, 10.5).profile);
  const offeredFood = structuredClone(profiles.get('a')!.character!.foodLots[0]);
  step('a', { type: 'confirm', trade: id, revision: 1 }, 10.5);
  step('b', { type: 'confirm', trade: id, revision: 1 }, 10.5);
  const reloaded = JSON.parse(JSON.stringify(profiles.get('b')!));
  assert.equal(ledger.trades[id].status, 'completed');
  assert.equal(reloaded.character.foodLots[0].createdAt, offeredFood.createdAt);
  assert.equal(reloaded.character.foodLots[0].preservedHours, .45);
  assert.equal(reloaded.character.foodLots[0].preservationAt, 10.5);
  assert.equal(fantasyFoodLotAge(10.5, reloaded.character.foodLots[0]), fantasyFoodLotAge(10.5, offeredFood));
  assert.equal(profiles.get('a')!.character!.foodLots[0].count, 1);
});
