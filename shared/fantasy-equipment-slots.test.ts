import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { createFantasyGear, fantasyEquipGear, fantasySpendItem, validFantasyGear } from './fantasy-equipment.ts';
import { fantasyEquipmentItems, fantasyItemBonuses, validFantasyItemState } from './fantasy-effects.ts';
import { fantasyEquipmentEntries, migrateFantasyEquipment } from './fantasy-equipment-slots.ts';
import { fantasySaleGroups, fantasySell } from './fantasy-sales.ts';
import { FANTASY_ITEMS, FANTASY_RECIPES } from './fantasy-data.ts';
const player = () => applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Slots', source: 'human', gender: 'female' }, () => .5).profile.character!;

test('two identical rings require two owned copies and reserve both against spending', () => {
  const c = player(); c.equipment = {}; c.inventory['ruby-ring'] = 1;
  assert.equal(fantasyEquipGear(c, 'ruby-ring', undefined, 'ring1'), undefined);
  assert.ok(fantasyEquipGear(c, 'ruby-ring', undefined, 'ring2'));
  c.inventory['ruby-ring'] = 2;
  assert.equal(fantasyEquipGear(c, 'ruby-ring', undefined, 'ring2'), undefined);
  assert.deepEqual(c.equipment, { ring1: 'ruby-ring', ring2: 'ruby-ring' });
  assert.equal(fantasyItemBonuses(c, FANTASY_ITEMS).stats.strength, 2);
  assert.equal(validFantasyItemState(c, FANTASY_ITEMS), true);
  assert.equal(fantasySpendItem(c, 'ruby-ring', 1), false);
  c.inventory['ruby-ring'] = 3; assert.equal(fantasySpendItem(c, 'ruby-ring', 1), true);
});
test('a crafted ring instance cannot occupy two fingers or provide duplicate quality bonuses', () => {
  const c = player(); c.equipment = {}; c.inventory['ruby-ring'] = 2;
  const a = createFantasyGear(c, 'ruby-ring', () => .5, 'starsteel-ingot', 'ruby')!;
  assert.equal(fantasyEquipGear(c, 'ruby-ring', a.id, 'ring1'), undefined);
  assert.ok(fantasyEquipGear(c, 'ruby-ring', a.id, 'ring2'));
  assert.equal(fantasyEquipGear(c, 'ruby-ring', undefined, 'ring2'), undefined);
  assert.equal(c.equippedGear?.ring2, undefined);
  c.equippedGear!.ring2 = a.id;
  assert.equal(validFantasyGear(c), false);
  assert.equal(fantasyEquipmentItems(c, FANTASY_ITEMS).length, 1);
});
test('forged ring quantities and incompatible target slots never provide additional stats', () => {
  const c = player(); c.inventory['ruby-ring'] = 1; c.equipment = { ring1: 'ruby-ring', ring2: 'ruby-ring' };
  assert.equal(validFantasyItemState(c, FANTASY_ITEMS), false);
  assert.equal(fantasyItemBonuses(c, FANTASY_ITEMS).stats.strength, 1);
  assert.ok(fantasyEquipGear(c, 'ruby-ring', undefined, 'head'));
});
test('offhand shields activate only for defensive combat jobs and a paladin priest branch', () => {
  const c = player(); c.inventory['iron-shield'] = 1; c.equipment = {};
  assert.ok(fantasyEquipGear(c, 'iron-shield'));
  for (const job of ['warrior', 'knight', 'shieldbearer']) {
    c.job = job; c.equipment = {};
    assert.equal(fantasyEquipGear(c, 'iron-shield'), undefined);
    assert.equal(fantasyItemBonuses(c, FANTASY_ITEMS).guard, 2);
  }
  c.job = 'mage';
  assert.equal(fantasyItemBonuses(c, FANTASY_ITEMS).guard, 0);
  assert.equal(c.equipment.offhand, 'iron-shield');
  assert.equal(validFantasyItemState(c, FANTASY_ITEMS), true);
  c.job = 'priest'; c.priestGrowth = { version: 1, branch: 'paladin', startedAt: 0, service: [], doctrine: [], pilgrimage: [], prayerDays: [], prayerTemples: {}, vows: [], branchChanges: 0 };
  assert.equal(fantasyItemBonuses(c, FANTASY_ITEMS).guard, 2);
  c.priestGrowth.branch = 'saint'; assert.equal(fantasyItemBonuses(c, FANTASY_ITEMS).guard, 0);
});
test('basic wearable items cover each new position through registered recipes', () => {
  for (const id of ['linen-travel-cap', 'linen-travel-trousers', 'leather-travel-boots', 'linen-work-gloves', 'copper-band-ring', 'linen-cord-necklace', 'parrying-dagger']) {
    assert.ok(FANTASY_ITEMS.some(item => item.id === id && item.equipment), id);
    assert.ok(FANTASY_RECIPES.some(recipe => recipe.output === id), id);
  }
});
test('ancillary gear and crafted quality share a bounded combined attribute budget', () => {
  const c = player(); c.equipment = {}; c.inventory['ruby-ring'] = 2; c.inventory['sapphire-charm'] = 1;
  for (const slot of ['ring1', 'ring2'] as const) {
    const gear = createFantasyGear(c, 'ruby-ring', () => .5, 'starsteel-ingot', 'ruby')!;
    assert.equal(fantasyEquipGear(c, 'ruby-ring', gear.id, slot), undefined);
  }
  assert.equal(fantasyItemBonuses(c, FANTASY_ITEMS).stats.strength, 3);
  assert.equal(fantasyItemBonuses(c, FANTASY_ITEMS).stats.hp, 20);
});

test('legacy torso and accessory migrate crafted identity without inventory loss or doubled effects', () => {
  const c = player(); c.inventory['bear-armor'] = 1; c.inventory['ruby-ring'] = 1;
  const gear = createFantasyGear(c, 'ruby-ring', () => .5, 'copper-ingot')!;
  c.equipment = { armor: 'bear-armor', accessory: 'ruby-ring' }; c.equippedGear = { accessory: gear.id };
  const inventory = structuredClone(c.inventory), before = fantasyItemBonuses(c, FANTASY_ITEMS);
  migrateFantasyEquipment(c, FANTASY_ITEMS);
  assert.deepEqual(c.equipment, { body: 'bear-armor', ring1: 'ruby-ring' });
  assert.deepEqual(c.equippedGear, { ring1: gear.id });
  assert.deepEqual(c.inventory, inventory); assert.deepEqual(fantasyItemBonuses(c, FANTASY_ITEMS), before);
  const migrated = structuredClone(c); migrateFantasyEquipment(c, FANTASY_ITEMS); assert.deepEqual(c, migrated);
});
test('legacy and canonical keys cannot double an equipped copy and migration retains ownership', () => {
  const c = player(); c.inventory['bear-armor'] = 1; c.equipment = { body: 'bear-armor', armor: 'bear-armor' };
  assert.equal(fantasyEquipmentEntries(c, FANTASY_ITEMS).length, 1);
  assert.equal(validFantasyItemState(c, FANTASY_ITEMS), false);
  migrateFantasyEquipment(c, FANTASY_ITEMS); assert.deepEqual(c.equipment, { body: 'bear-armor' });
  assert.equal(c.inventory['bear-armor'], 1); assert.equal(validFantasyItemState(c, FANTASY_ITEMS), true);
});
test('both plain rings remain unavailable for sale until an unreserved copy exists', () => {
  const c = player(); c.inventory['ruby-ring'] = 2; c.equipment = { ring1: 'ruby-ring', ring2: 'ruby-ring' };
  assert.equal(fantasySaleGroups(c, 'ruby-ring')[0].reason, 'equipped');
  assert.ok(fantasySell(c, { item: 'ruby-ring' }).error);
  c.inventory['ruby-ring'] = 3; assert.equal(fantasySell(c, { item: 'ruby-ring' }).error, undefined);
  assert.equal(c.inventory['ruby-ring'], 2); assert.ok(fantasySell(c, { item: 'ruby-ring' }).error);
});
test('offhand daggers allow thief and assassin but cannot bypass shield profession restrictions', () => {
  const c = player(); c.inventory['parrying-dagger'] = 1; c.inventory['iron-shield'] = 1; c.equipment = {};
  for (const job of ['thief', 'assassin']) {
    c.job = job; c.equipment = {};
    assert.equal(fantasyEquipGear(c, 'parrying-dagger'), undefined);
    assert.equal(fantasyItemBonuses(c, FANTASY_ITEMS).stats.agility, 1);
    assert.ok(fantasyEquipGear(c, 'iron-shield'));
  }
  c.job = 'warrior'; assert.ok(fantasyEquipGear(c, 'parrying-dagger'));
  assert.equal(fantasyItemBonuses(c, FANTASY_ITEMS).stats.agility, undefined);
});
test('legacy headwear gloves lenses and gaiters migrate to their actual wearable positions', () => {
  for (const [item, oldSlot, newSlot] of [
    ['rime-cooling-wrap', 'armor', 'head'], ['tannin-grip-gloves', 'accessory', 'gloves'],
    ['polished-focus-lens', 'accessory', 'head'], ['weatherproof-gaiters', 'armor', 'legs'],
  ] as const) {
    const c = player(); c.inventory[item] = 1; c.equipment = { [oldSlot]: item };
    migrateFantasyEquipment(c, FANTASY_ITEMS);
    assert.deepEqual(c.equipment, { [newSlot]: item });
  }
});
