import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { createFantasyGear, fantasyEquipGear } from './fantasy-equipment.ts';
import { fantasySaleGroups, fantasySell } from './fantasy-sales.ts';
import { isFantasyAction } from '../server/fantasy-store.ts';

function character() {
  const c = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: '판매 검증' }, () => .999).profile.character!;
  c.hour = 200; c.inventory.bread = 6;
  c.foodLots = c.foodLots.filter(lot => lot.item !== 'bread');
  c.foodLots.push({ id: 'fresh', item: 'bread', count: 3, createdAt: 190 }, { id: 'stale', item: 'bread', count: 2, createdAt: 160 }, { id: 'spoiled', item: 'bread', count: 1, createdAt: 100 });
  return c;
}

test('selling quotes separate only food condition batches and retain the inventory aggregate', () => {
  const c = character(), before = structuredClone(c);
  const groups = fantasySaleGroups(c, 'bread');
  assert.deepEqual(groups.map(group => [group.quality, group.count, group.unitPrice, group.canSell]), [['fresh', 3, 2, true], ['stale', 2, 1, true], ['spoiled', 1, 0, false]]);
  assert.deepEqual(c, before); assert.equal(groups.at(-1)!.reason, 'spoiled');
  const missingChoice = fantasySell(c, { item: 'bread' }); assert.ok(missingChoice.error); assert.deepEqual(c, before);
});

test('sales use effective food age so preservation does not refresh or misprice older batches', () => {
  const c = character(); c.inventory.bread = 3;
  c.foodLots = [
    { id: 'old-preserved', item: 'bread', count: 1, createdAt: 100, preservedHours: 88.2, preservationAt: 198 },
    { id: 'new-stale', item: 'bread', count: 1, createdAt: 160 },
    { id: 'spoiled', item: 'bread', count: 1, createdAt: 100 },
  ];
  assert.deepEqual(fantasySaleGroups(c, 'bread').map(group => [group.quality, group.count, group.unitPrice, group.canSell]), [['fresh', 1, 2, true], ['stale', 1, 1, true], ['spoiled', 1, 0, false]]);
  assert.equal(fantasySell(c, { item: 'bread', quality: 'fresh' }).price, 2);
  assert.deepEqual(c.foodLots.map(lot => lot.id), ['new-stale', 'spoiled']);
});

test('only the selected condition is sold and an exhausted or newly spoiled condition cannot consume a different batch', () => {
  const c = character(), originalGold = c.gold;
  assert.equal(fantasySell(c, { item: 'bread', quality: 'stale' }).price, 1);
  assert.equal(c.inventory.bread, 5); assert.equal(c.foodLots.find(lot => lot.id === 'fresh')!.count, 3); assert.equal(c.foodLots.find(lot => lot.id === 'stale')!.count, 1); assert.equal(c.gold, originalGold + 1);
  assert.equal(fantasySell(c, { item: 'bread', quality: 'stale' }).price, 1);
  const before = structuredClone(c); assert.ok(fantasySell(c, { item: 'bread', quality: 'stale' }).error); assert.deepEqual(c, before);
  assert.ok(fantasySell(c, { item: 'bread', quality: 'spoiled' }).error); assert.deepEqual(c, before);
  c.hour = 240; const aged = structuredClone(c); assert.ok(fantasySell(c, { item: 'bread', quality: 'fresh' }).error); assert.deepEqual(c, aged);
});

test('shops cannot buy remote items and gear selection preserves the equipped individual', () => {
  const c = character(); c.location = 'greenwood'; const before = structuredClone(c);
  assert.ok(fantasySaleGroups(c, 'bread').every(group => !group.canSell && group.reason === 'location'));
  assert.ok(fantasySell(c, { item: 'bread', quality: 'fresh' }).error); assert.deepEqual(c, before);
  c.location = 'hearth'; c.inventory.blade = 2;
  const worn = createFantasyGear(c, 'blade', () => .1)!, extra = createFantasyGear(c, 'blade', () => .9)!;
  assert.equal(fantasyEquipGear(c, 'blade', worn.id), undefined);
  const groups = fantasySaleGroups(c, 'blade'); assert.equal(groups.length, 2); assert.equal(groups.find(group => group.instance === worn.id)!.reason, 'equipped');
  const equippedBefore = structuredClone(c); assert.ok(fantasySell(c, { item: 'blade', instance: worn.id }).error); assert.deepEqual(c, equippedBefore);
  assert.equal(fantasySell(c, { item: 'blade', instance: extra.id }).price, 24); assert.equal(c.inventory.blade, 1); assert.ok(c.gear!.some(gear => gear.id === worn.id)); assert.equal(c.equippedGear!.weapon, worn.id);
});

test('single condition legacy food sales remain safe and invalid selections never mutate inventory', () => {
  const c = character(); c.foodLots = c.foodLots.filter(lot => lot.item !== 'bread' || lot.id === 'fresh'); c.inventory.bread = 3;
  assert.equal(fantasySell(c, { item: 'bread' }).price, 2); assert.equal(c.inventory.bread, 2);
  const before = structuredClone(c);
  for (const action of [{ item: 'bread', instance: 'gear-forged' }, { item: 'blade', quality: 'fresh' as const }, { item: 'missing' }]) { assert.ok(fantasySell(c, action).error); assert.deepEqual(c, before); }
});

test('the authoritative engine uses the selected food batch while rejecting injected condition and price fields', () => {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: '판매 서버 검증' }, () => .999).profile;
  p.character = character(); const before = structuredClone(p);
  assert.equal(isFantasyAction({ type: 'sell', item: 'bread', quality: 'stale' }), true);
  for (const action of [{ type: 'sell', item: 'bread', quality: 'frozen' }, { type: 'sell', item: 'bread', quality: 'fresh', instance: 'gear-forged' }, { type: 'sell', item: 'bread', quality: 'fresh', price: 1000 }]) assert.equal(isFantasyAction(action), false);
  const result = applyFantasyAction(p, { type: 'sell', item: 'bread', quality: 'stale' }, () => .999);
  assert.equal(result.error, undefined); assert.deepEqual(p, before); assert.equal(result.profile.character!.gold, p.character.gold + 1);
  assert.equal(result.profile.character!.inventory.bread, 5); assert.equal(result.profile.character!.foodLots.find(lot => lot.id === 'fresh')!.count, 3);
});
