import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_ITEMS, FANTASY_RACES } from './fantasy-data.ts';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { FANTASY_BAGS, FANTASY_BAG_ITEMS } from './fantasy-bag-catalog.ts';
import { applyFantasyBagAction, fantasyBagActionValid, fantasyBagChangeError, fantasyBagEquipError, fantasyBagState, fantasyBagText, fantasyItemWeight, validFantasyBag } from './fantasy-bags.ts';
function player() { return applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Bag', gender: 'female' }, () => .5).profile; }
test('current starting supplies fit the implicit pack and every registered item has a positive integer gram weight', () => {
  const p = player(), state = fantasyBagState(p.character!); assert.equal(state.weightLimit, 20_000); assert.equal(state.slotLimit, 24); assert.equal(state.overloaded, false);
  for (const item of FANTASY_ITEMS) { assert.ok(Number.isSafeInteger(fantasyItemWeight(item))); assert.ok(fantasyItemWeight(item) > 0, item.id); }
  assert.ok(fantasyItemWeight('ore') > fantasyItemWeight('herb'));
  for (const race of FANTASY_RACES) { const c = structuredClone(p.character!); c.race = race.id; assert.equal(fantasyBagState(c).overloaded, false); }
});
test('stack quantities contribute full weight while food lots and equipment instances share their item-type slots', () => {
  const c = player().character!; c.inventory = { bread: 4, blade: 2, herb: 0 }; c.foodLots = [{ id: 'a', item: 'bread', count: 2, createdAt: c.hour }, { id: 'b', item: 'bread', count: 2, createdAt: c.hour }];
  c.gear = [{ id: 'a', item: 'blade', quality: 1, createdAt: c.hour }, { id: 'b', item: 'blade', quality: 2, createdAt: c.hour }];
  const state = fantasyBagState(c); assert.equal(state.slots, 2); assert.equal(state.weight, fantasyItemWeight('bread') * 4 + fantasyItemWeight('blade') * 2);
});
test('three market bags, three general tower bags and one food preservation bag register with localized descriptions and real weight', () => {
  assert.equal(FANTASY_BAGS.length, 7); assert.equal(FANTASY_BAG_ITEMS.length, 7);
  for (const kind of ['basic', 'magic']) { const group = FANTASY_BAGS.filter(bag => bag.kind === kind && bag.id !== 'preserve-magic-bag'); assert.equal(group.length, 3); assert.ok(group[0].weightLimit < group[1].weightLimit && group[1].weightLimit < group[2].weightLimit); assert.ok(group[0].slotLimit < group[1].slotLimit && group[1].slotLimit < group[2].slotLimit); }
  for (const item of FANTASY_BAG_ITEMS) for (const locale of ['ko', 'en', 'ja'] as const) { assert.ok(item.names?.[locale]); assert.ok(item.descriptions?.[locale]); }
  const p = player(), bag = FANTASY_BAGS.find(bag => bag.kind === 'magic')!; p.character!.inventory[bag.id] = 1;
  const before = JSON.stringify(p), result = applyFantasyBagAction(p, { type: 'bagEquip', item: bag.id })!;
  assert.equal(result.error, undefined); assert.equal(JSON.stringify(p), before); assert.equal(result.profile.character!.hour, p.character!.hour); assert.ok(validFantasyBag(result.profile.character!));
  assert.equal(fantasyBagState(result.profile.character!).weightLimit, 20_000 + bag.weightLimit);
  assert.equal(fantasyBagState(result.profile.character!).bag, 'starter-pack');
  assert.deepEqual(fantasyBagState(result.profile.character!).magicBags, [bag.id]);
  for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(fantasyBagText(result.profile.log.at(-1)!.text, locale));
});
test('legacy overloaded inventories are retained and can lose goods but cannot worsen excess weight', () => {
  const before = player(); before.character!.inventory = { wood: 30 }; const original = JSON.stringify(before); assert.ok(fantasyBagState(before.character!).overloaded);
  const reduced = structuredClone(before); reduced.character!.inventory.wood--; assert.equal(fantasyBagChangeError(before, reduced), undefined);
  const gained = structuredClone(before); gained.character!.inventory.wood++; assert.ok(fantasyBagChangeError(before, gained));
  assert.equal(JSON.stringify(before), original);
  const normal = structuredClone(before); normal.character!.inventory.wood = 13; const purchase = structuredClone(normal); purchase.character!.inventory.wood++;
  assert.equal(fantasyBagState(normal.character!).overloaded, false); assert.ok(fantasyBagChangeError(normal, purchase));
});
test('distinct-item overflow remains independent of weight and selling one type is allowed', () => {
  const light = FANTASY_ITEMS.filter(item => item.category !== 'bag').sort((a, b) => fantasyItemWeight(a) - fantasyItemWeight(b)).slice(0, 25), before = player();
  before.character!.inventory = Object.fromEntries(light.slice(0, 24).map(item => [item.id, 1])); const after = structuredClone(before); after.character!.inventory[light[24].id] = 1;
  assert.equal(fantasyBagState(before.character!).slots, 24); assert.ok(fantasyBagChangeError(before, after));
  const sold = structuredClone(after); sold.character!.inventory[light[0].id] = 0; assert.equal(fantasyBagChangeError(after, sold), undefined);
});
test('unowned bags and a smaller pack that would spill contents are rejected atomically', () => {
  const p = player(), bag = FANTASY_BAGS.find(bag => bag.id === 'canvas-bag-3')!;
  assert.ok(applyFantasyBagAction(p, { type: 'bagEquip', item: bag.id })!.error);
  p.character!.bag = bag.id; assert.equal(validFantasyBag(p.character!), false);
  p.character!.inventory[bag.id] = 1; p.character!.inventory.wood = 20; assert.ok(validFantasyBag(p.character!));
  const before = JSON.stringify(p), result = applyFantasyBagAction(p, { type: 'bagEquip', item: 'starter-pack' })!;
  assert.ok(result.error); assert.equal(JSON.stringify(p), before);
  assert.ok(fantasyBagActionValid({ type: 'bagEquip', item: bag.id })); assert.equal(fantasyBagActionValid({ type: 'bagEquip', item: bag.id, weightLimit: 999_999 }), false);
});

test('equipping any bag requires the entire existing load to fit its weight limit', () => {
  const p = player(), small = FANTASY_BAGS[0], large = FANTASY_BAGS.find(bag => bag.id === 'canvas-bag-3')!;
  p.character!.inventory = { [small.id]: 1, [large.id]: 1, wood: 100 };
  p.character!.bag = large.id;
  const before = JSON.stringify(p);
  for (const item of [small.id, 'starter-pack']) {
    const error = fantasyBagEquipError(p.character!, item)!;
    assert.equal(fantasyBagText(error, 'en'), 'This exceeds the bag’s weight limit. Remove goods or use a larger bag.');
    const result = applyFantasyBagAction(p, { type: 'bagEquip', item })!;
    assert.equal(result.error, error); assert.equal(result.changed, false); assert.equal(result.profile, p);
    const after = structuredClone(p); if (item === 'starter-pack') delete after.character!.bag; else after.character!.bag = item;
    assert.equal(fantasyBagText(fantasyBagChangeError(p, after)!, 'en'), 'Reduce your goods to fit the remaining bag capacity before removing this bag.');
  }
  const starter = structuredClone(p); delete starter.character!.bag;
  assert.ok(fantasyBagEquipError(starter.character!, large.id));
  assert.equal(JSON.stringify(p), before);
});

test('bag equipment rejects item-type overflow independently and localizes the reason', () => {
  const p = player(), bag = FANTASY_BAGS[0], large = FANTASY_BAGS.find(bag => bag.id === 'canvas-bag-3')!;
  const light = FANTASY_ITEMS.filter(item => item.category !== 'bag').sort((a, b) => fantasyItemWeight(a) - fantasyItemWeight(b)).slice(0, 31);
  p.character!.inventory = { ...Object.fromEntries(light.map(item => [item.id, 1])), [bag.id]: 1, [large.id]: 1 }; p.character!.bag = large.id;
  assert.equal(fantasyBagState(p.character!).slots, 33);
  const before = JSON.stringify(p), result = applyFantasyBagAction(p, { type: 'bagEquip', item: bag.id })!;
  assert.equal(result.changed, false); assert.equal(JSON.stringify(p), before);
  assert.equal(fantasyBagText(result.error!, 'ko'), '가방에 넣을 수 있는 물품 종류가 너무 많습니다.');
  assert.equal(fantasyBagText(result.error!, 'en'), 'This exceeds the number of item types the bag can hold.');
  assert.equal(fantasyBagText(result.error!, 'ja'), '鞄に入れられる品目の種類を超えます。');
});

test('bag equipment permits exact capacity and refuses an unowned bag', () => {
  const p = player(), bag = FANTASY_BAGS[0];
  assert.ok(fantasyBagEquipError(p.character!, bag.id));
  p.character!.inventory = { [bag.id]: 1, herb: (bag.weightLimit - bag.weight) / fantasyItemWeight('herb') };
  assert.equal(fantasyBagEquipError(p.character!, bag.id), undefined);
  const result = applyFantasyBagAction(p, { type: 'bagEquip', item: bag.id })!;
  assert.equal(result.error, undefined); assert.equal(fantasyBagState(result.profile.character!).weight, bag.weightLimit);
});

test('reducing inherited excess never permits switching to an overfull smaller bag', () => {
  const before = player(), large = FANTASY_BAGS.find(bag => bag.id === 'canvas-bag-3')!, small = FANTASY_BAGS[0];
  before.character!.bag = large.id; before.character!.inventory = { [large.id]: 1, [small.id]: 1, wood: 100 };
  const after = structuredClone(before); after.character!.bag = small.id; after.character!.inventory.wood = 30;
  const oldState = fantasyBagState(before.character!), nextState = fantasyBagState(after.character!);
  assert.ok(nextState.weight - nextState.weightLimit < oldState.weight - oldState.weightLimit);
  assert.equal(fantasyBagText(fantasyBagChangeError(before, after)!, 'en'), 'Reduce your goods to fit the remaining bag capacity before removing this bag.');

  const light = FANTASY_ITEMS.filter(item => item.category !== 'bag').sort((a, b) => fantasyItemWeight(a) - fantasyItemWeight(b)).slice(0, 47);
  before.character!.inventory = { ...Object.fromEntries(light.map(item => [item.id, 1])), [large.id]: 1, [small.id]: 1 };
  after.character!.inventory = { ...Object.fromEntries(light.slice(0, 31).map(item => [item.id, 1])), [large.id]: 1, [small.id]: 1 };
  assert.equal(fantasyBagState(before.character!).slots - large.slotLimit, 1);
  assert.equal(fantasyBagState(after.character!).slots - small.slotLimit, 1);
  assert.equal(fantasyBagText(fantasyBagChangeError(before, after)!, 'en'), 'Reduce your goods to fit the remaining bag capacity before removing this bag.');
});

test('one normal bag and two owned supplementary bags coexist, with atomic removal and ownership limits', () => {
  let p = player(); const normal = 'canvas-bag-3', magic = 'arcane-bag-1';
  p.character!.inventory = { [normal]: 1, [magic]: 2, wood: 1 };
  for (const item of [normal, magic, magic]) {
    const result = applyFantasyBagAction(p, { type: 'bagEquip', item })!;
    assert.equal(result.error, undefined); p = result.profile;
  }
  assert.equal(p.character!.bag, normal); assert.deepEqual(p.character!.magicBags, [magic, magic]);
  assert.equal(fantasyBagState(p.character!).weightLimit, 150_000);
  const before = structuredClone(p);
  assert.ok(applyFantasyBagAction(p, { type: 'bagEquip', item: magic })!.error); assert.deepEqual(p, before);
  p.character!.inventory.wood = 70;
  const overRemoval = structuredClone(p), rejected = applyFantasyBagAction(p, { type: 'magicBagRemove', slot: 1 })!;
  assert.ok(rejected.error); assert.equal(rejected.changed, false); assert.deepEqual(p, overRemoval);
  p.character!.inventory.wood = 1;
  const removed = applyFantasyBagAction(p, { type: 'magicBagRemove', slot: 0 })!;
  assert.equal(removed.error, undefined); assert.equal(removed.profile.character!.bag, normal);
  assert.deepEqual(removed.profile.character!.magicBags, [magic]);
  const one = player(); one.character!.inventory = { [magic]: 1 }; one.character!.magicBags = [magic];
  assert.ok(applyFantasyBagAction(one, { type: 'bagEquip', item: magic })!.error);
  assert.equal(validFantasyBag({ inventory: { [magic]: 1 }, magicBags: [magic, magic] }), false);
});

test('legacy single magic bag retains the implicit normal pack and migrates to supplementary slots when equipped', () => {
  const p = player(), magic = 'arcane-bag-2'; p.character!.bag = magic; p.character!.inventory = { [magic]: 1, 'canvas-bag-1': 1 };
  assert.equal(validFantasyBag(p.character!), true); assert.equal(fantasyBagState(p.character!).weightLimit, 100_000);
  const result = applyFantasyBagAction(p, { type: 'bagEquip', item: 'canvas-bag-1' })!;
  assert.equal(result.error, undefined); assert.equal(result.profile.character!.bag, 'canvas-bag-1');
  assert.deepEqual(result.profile.character!.magicBags, [magic]);
  assert.equal(fantasyBagState(result.profile.character!).weightLimit, 105_000);
});
