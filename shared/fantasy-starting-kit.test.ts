import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceFantasyWorld, applyFantasyAction, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { FANTASY_ITEMS, FANTASY_RACES, FANTASY_RACE_FAMILIES } from './fantasy-data.ts';
import { FANTASY_FOOD_META, migrateFantasyLife } from './fantasy-life.ts';
import { FANTASY_FAMILY_GIFT_ITEMS, FANTASY_RACIAL_GIFT_CHANCE, FANTASY_RACIAL_GIFT_ITEMS, FANTASY_RANDOM_GIFT_CHANCE, FANTASY_RANDOM_GIFT_ITEMS, FANTASY_STARTING_GOLD, FANTASY_STARTING_INVENTORY, fantasyStartingInventory } from './fantasy-starting-kit.ts';
import type { FantasyAction, FantasyProfile } from './fantasy.ts';

const human = FANTASY_RACES.find(race => race.id === 'human')!;
const extraCount = (inventory: Record<string, number>) => Object.entries(inventory).reduce((sum, [id, count]) => sum + count - (FANTASY_STARTING_INVENTORY[id] ?? 0), 0);
const sequence = (...values: number[]) => () => values.shift() ?? 0.999;

test('the official baseline preserves 35 gold, seven supplies and the new reusable lantern', () => {
  assert.equal(FANTASY_STARTING_GOLD, 35);
  assert.deepEqual(FANTASY_STARTING_INVENTORY, { herb: 2, ore: 2, wood: 2, meal: 1, lantern: 1 });
  assert.equal(FANTASY_RACIAL_GIFT_CHANCE, 0.35);
  assert.equal(FANTASY_RANDOM_GIFT_CHANCE, 0.20);
  const inventory = fantasyStartingInventory(human, () => 0.999);
  assert.deepEqual(inventory, FANTASY_STARTING_INVENTORY);
  inventory.herb = 100;
  assert.equal(FANTASY_STARTING_INVENTORY.herb, 2);
});

test('gift chance boundaries are strict and the two rolls are independent', () => {
  assert.equal(extraCount(fantasyStartingInventory(human, sequence(0.35, 0.20))), 0);
  assert.equal(extraCount(fantasyStartingInventory(human, sequence(0.35 - Number.EPSILON, 0.20))), 1);
  assert.equal(extraCount(fantasyStartingInventory(human, sequence(0.35, 0.20 - Number.EPSILON, 0))), 1);
  assert.equal(extraCount(fantasyStartingInventory(human, sequence(0, 0, 0))), 2);
  const zero = fantasyStartingInventory(human, () => 0);
  assert.equal(zero.bread, 1);
  assert.equal(zero.herb, 3);
});

test('all 46 races and 15 families map to existing ordinary registered items', () => {
  assert.deepEqual(new Set(Object.keys(FANTASY_RACIAL_GIFT_ITEMS)), new Set(FANTASY_RACES.map(race => race.id)));
  assert.deepEqual(new Set(Object.keys(FANTASY_FAMILY_GIFT_ITEMS)), new Set(FANTASY_RACE_FAMILIES.map(family => family.id)));
  for (const id of [...Object.values(FANTASY_RACIAL_GIFT_ITEMS), ...Object.values(FANTASY_FAMILY_GIFT_ITEMS), ...FANTASY_RANDOM_GIFT_ITEMS]) assert.ok(FANTASY_ITEMS.some(item => item.id === id), id);
  for (const race of FANTASY_RACES) {
    const inventory = fantasyStartingInventory(race, sequence(0, 1));
    assert.equal(extraCount(inventory), 1, race.id);
    const gift = FANTASY_RACIAL_GIFT_ITEMS[race.id];
    assert.equal(inventory[gift], (FANTASY_STARTING_INVENTORY[gift] ?? 0) + 1, race.id);
  }
  const future = fantasyStartingInventory({ id: 'future-race', family: 'seafolk' }, sequence(0, 1));
  assert.equal(future.fish, 1);
});

test('the independent random pool can choose every item and never exceeds two extra units', () => {
  for (let index = 0; index < FANTASY_RANDOM_GIFT_ITEMS.length; index++) {
    const item = FANTASY_RANDOM_GIFT_ITEMS[index];
    const inventory = fantasyStartingInventory(human, sequence(0.35, 0, (index + 0.5) / FANTASY_RANDOM_GIFT_ITEMS.length));
    assert.equal(extraCount(inventory), 1);
    assert.equal(inventory[item], (FANTASY_STARTING_INVENTORY[item] ?? 0) + 1);
  }
  const halfling = FANTASY_RACES.find(race => race.id === 'halfling')!;
  const mealIndex = FANTASY_RANDOM_GIFT_ITEMS.indexOf('meal');
  const same = fantasyStartingInventory(halfling, sequence(0, 0, (mealIndex + 0.5) / FANTASY_RANDOM_GIFT_ITEMS.length));
  assert.equal(same.meal, 3);
  assert.equal(extraCount(same), 2);
  assert.equal(extraCount(fantasyStartingInventory(human, () => 1)), 0);
  assert.equal(extraCount(fantasyStartingInventory(human, () => NaN)), 2);
});

test('invalid creation and an already created character never consume external RNG or issue a kit', () => {
  const actions: FantasyAction[] = [
    { type: 'create', name: '', gender: 'male', source: 'human' },
    { type: 'create', name: 'bad', gender: 'male', source: 'candidate' },
    { type: 'create', name: 'bad', gender: 'male', source: 'human', job: 'missing-job' },
  ];
  for (const action of actions) {
    let calls = 0;
    const rng = () => { calls++; return 0; };
    const p = newFantasyProfile();
    assert.ok(applyFantasyAction(p, action, rng).error);
    assert.ok(startFantasyActivity(p, action, 100, rng).error);
    assert.equal(calls, 0);
    assert.equal(p.character, null);
  }
  const command: FantasyAction = { type: 'create', name: 'done', gender: 'male', source: 'human' };
  const done = applyFantasyAction(newFantasyProfile(), command, () => 0).profile;
  let calls = 0;
  assert.ok(startFantasyActivity(done, command, 100, () => { calls++; return 0; }).error);
  assert.equal(calls, 0);
});

test('creation applies gifts once and every gifted food batch matches inventory at creation time', () => {
  for (const race of FANTASY_RACES) {
    const p = newFantasyProfile(); p.draft.kept = race.id;
    const done = applyFantasyAction(p, { type: 'create', name: '旅人', gender: 'female', source: 'kept' }, () => 0).profile;
    const c = done.character!;
    assert.equal(c.gold, FANTASY_STARTING_GOLD);
    assert.equal(extraCount(c.inventory), 2);
    assert.equal(done.log.filter(log => log.text.startsWith('旅支度の贈り物')).length, 1);
    for (const food of FANTASY_FOOD_META) {
      const lots = c.foodLots.filter(lot => lot.item === food.item);
      assert.equal(lots.reduce((sum, lot) => sum + lot.count, 0), c.inventory[food.item] ?? 0, race.id);
      assert.ok(lots.every(lot => lot.createdAt === c.hour));
    }
    const reloaded = JSON.parse(JSON.stringify(done)) as FantasyProfile;
    assert.deepEqual(advanceFantasyWorld(reloaded, 1000).profile.character!.inventory, c.inventory);
    assert.deepEqual(migrateFantasyLife(reloaded.character!).inventory, c.inventory);
    assert.deepEqual(startFantasyActivity(reloaded, { type: 'sync' }, 1000, () => { throw new Error('sync must not roll'); }).profile.character!.inventory, c.inventory);
  }
});

test('server creation draws one external seed and timestamps all starting food at the shared hour', () => {
  const p = newFantasyProfile(); p.draft.kept = 'catkin';
  let calls = 0;
  const result = startFantasyActivity(p, { type: 'create', name: '時計', gender: 'female', source: 'kept' }, 500, () => { calls++; return 0; });
  assert.equal(result.error, undefined);
  assert.equal(calls, 1);
  assert.equal(result.profile.character!.hour, 500);
  assert.ok(result.profile.character!.foodLots.every(lot => lot.createdAt === 500));
  assert.ok(result.profile.log.every(log => log.hour === 500));
  assert.equal(result.profile.activity, undefined);
});
