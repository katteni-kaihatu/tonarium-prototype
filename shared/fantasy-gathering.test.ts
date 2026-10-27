import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, fantasyTransports, newFantasyProfile, startFantasyActivity, advanceFantasyWorld } from './fantasy-engine.ts';
import { fantasyBoatError, fantasyFishingError, fantasyGatheringOptions, validFantasyFishing } from './fantasy-gathering.ts';
import { FANTASY_LOCATIONS } from './fantasy-data.ts';

const high = () => 0.999;
const player = () => applyFantasyAction(newFantasyProfile(), { type: 'create', name: '採集者', source: 'human', gender: 'female' }, high).profile;

test('explicit terrain gathering offers forests and mines distinct resources and checks real D6 rolls', () => {
  const p = player(); p.character!.location = 'greenwood'; p.character!.visited.push('greenwood');
  assert.equal(fantasyGatheringOptions(p.character!).find(option => option.resource === 'herbs')!.available, true);
  assert.equal(fantasyGatheringOptions(p.character!).find(option => option.resource === 'minerals')!.available, false);
  const gathered = applyFantasyAction(p, { type: 'gather', resource: 'herbs' }, high);
  assert.equal(gathered.error, undefined); assert.ok(gathered.profile.log.some(log => /d6=/.test(log.text)));
  assert.ok(gathered.profile.character!.practice!.gather! > 0);
  p.character!.location = 'deepcave'; assert.equal(fantasyGatheringOptions(p.character!).find(option => option.resource === 'minerals')!.available, true);
});

test('fishers rent and purchase boats at shipyards, must return within a rental period and receive fresh fish', () => {
  const p = player(), c = p.character!; c.job = 'fisher'; c.jobXp.fisher = 0; c.location = 'tidehaven'; c.visited.push('tidehaven'); c.gold = 300;
  assert.ok(fantasyFishingError(c, 'sea')); assert.equal(fantasyBoatError(c, 'rent'), undefined);
  const rented = applyFantasyAction(p, { type: 'boat', mode: 'rent' }, high).profile;
  assert.equal(rented.character!.gold, 280); assert.equal(validFantasyFishing(rented.character!), true);
  assert.equal(fantasyFishingError(rented.character!, 'sea'), undefined);
  const pending = startFantasyActivity(rented, { type: 'fish', mode: 'sea' }, rented.character!.hour, high).profile;
  assert.equal(pending.character!.inventory.tuna ?? 0, 0);
  const caught = advanceFantasyWorld(pending, pending.activity!.endsAt).profile;
  assert.equal(caught.death, undefined); assert.equal(caught.activity, undefined);
  const fish = caught.character!.foodLots.filter(lot => ['tuna', 'fish', 'glowfish'].includes(lot.item));
  if (fish.length) assert.ok(fish.every(lot => lot.createdAt === caught.character!.hour));
  const expiring = structuredClone(rented.character!); expiring.fishingBoat!.expiresAt = expiring.hour + 3;
  assert.ok(fantasyFishingError(expiring, 'sea'));
  const owned = applyFantasyAction(rented, { type: 'boat', mode: 'buy' }, high).profile;
  assert.equal(owned.character!.fishingBoat!.kind, 'owned'); assert.equal(validFantasyFishing(owned.character!), true);
});

test('every available paid transport is strictly faster than its comparable free travel even at one-hour minimums', () => {
  const c = player().character!; c.level = 3; c.gold = 100000; c.charted = FANTASY_LOCATIONS.map(location => location.id);
  c.buff = { effect: 'travel', power: 100 };
  for (const location of FANTASY_LOCATIONS) {
    const routes = fantasyTransports(c, location.id);
    const foot = routes.find(route => route.id === 'foot' && route.available);
    const working = routes.find(route => route.id === 'working-ship' && route.available);
    for (const route of routes.filter(route => route.available && ['carriage', 'ship', 'airship', 'gate'].includes(route.id))) {
      const free = route.id === 'carriage' ? foot : route.id === 'ship' ? working : foot ?? working;
      if (free) assert.ok(route.hours < free.hours, `${route.id}:${location.id}`);
      assert.ok(route.hours >= 0.25 && Number.isInteger(route.hours * 4));
    }
  }
});
