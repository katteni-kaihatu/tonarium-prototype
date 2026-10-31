import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { createFantasyGear } from './fantasy-equipment.ts';
import { applyFantasyBagAction, fantasyBagState, fantasyEscrowBagOverflow, validFantasyPendingLoot } from './fantasy-bags.ts';
const player = () => applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Delivery', gender: 'female' }, () => .5).profile;
test('automatic reward overflow remains recoverable at its location and claims only quantities fitting both limits', () => {
  const before = player(); before.character!.inventory = { wood: 13 }; before.character!.foodLots = [];
  const reward = structuredClone(before); reward.character!.inventory.wood += 2;
  let saved = fantasyEscrowBagOverflow(before, reward);
  assert.equal(saved.character!.inventory.wood, 13); assert.equal(saved.character!.pendingLoot!.hearth.items.wood, 2); assert.ok(validFantasyPendingLoot(saved.character!));
  assert.ok(applyFantasyBagAction(saved, { type: 'bagClaim' })!.error);
  saved.character!.inventory.wood--; const claimed = applyFantasyBagAction(saved, { type: 'bagClaim' })!;
  assert.equal(claimed.error, undefined); assert.equal(claimed.profile.character!.inventory.wood, 13); assert.equal(claimed.profile.character!.pendingLoot!.hearth.items.wood, 1);
  assert.equal(fantasyBagState(claimed.profile.character!).overloaded, false);
  saved = structuredClone(claimed.profile); saved.character!.location = 'greenwood'; assert.ok(applyFantasyBagAction(saved, { type: 'bagClaim' })!.error);
});
test('deferred equipment preserves its quality and deferred food preserves its original age through a later claim', () => {
  const before = player(); before.character!.inventory = { wood: 13 }; before.character!.foodLots = [];
  const gearReward = structuredClone(before); gearReward.character!.inventory.blade = 1; const gear = createFantasyGear(gearReward.character!, 'blade', () => .99)!;
  let saved = fantasyEscrowBagOverflow(before, gearReward); assert.equal(saved.character!.gear!.length, 0); assert.equal(saved.character!.pendingLoot!.hearth.gear[0].quality, gear.quality);
  saved.character!.inventory.wood = 10; saved.character!.hour += 12; const claimed = applyFantasyBagAction(saved, { type: 'bagClaim' })!.profile;
  assert.equal(claimed.character!.gear![0].quality, gear.quality); assert.equal(claimed.character!.gear![0].createdAt, gear.createdAt); assert.ok(validFantasyPendingLoot(claimed.character!));
  const foodReward = structuredClone(before); foodReward.character!.inventory.bread = 4; foodReward.character!.foodLots = [{ id: 'bread-lot', item: 'bread', count: 4, createdAt: before.character!.hour }];
  saved = fantasyEscrowBagOverflow(before, foodReward); assert.equal(saved.character!.pendingLoot!.hearth.foodLots[0].createdAt, before.character!.hour);
  saved.character!.inventory.wood = 10; saved.character!.hour += 12;
  const foodClaim = applyFantasyBagAction(saved, { type: 'bagClaim' })!.profile;
  assert.ok(foodClaim.character!.foodLots.every(lot => lot.createdAt === before.character!.hour)); assert.equal(foodClaim.character!.inventory.bread, 4);
});
test('pending delivery validation rejects forged namespaces and alias metadata without mutating the record', () => {
  const p = player(); p.character!.pendingLoot = JSON.parse('{"__proto__":{"items":{"wood":1},"gear":[],"foodLots":[]}}');
  const before = JSON.stringify(p); assert.equal(validFantasyPendingLoot(p.character!), false); assert.equal(JSON.stringify(p), before);
  p.character!.pendingLoot = { hearth: { items: { bread: 1 }, gear: [], foodLots: [] } }; assert.equal(validFantasyPendingLoot(p.character!), false);
});
