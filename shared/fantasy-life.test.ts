import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FantasyAction, FantasyCharacter, FantasyProfile } from './fantasy.ts';
import { advanceFantasyWorld, applyFantasyAction, fantasyActionHours, fantasyStats, fantasyTransports, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { FANTASY_WORLD_TIME_RATE } from './fantasy.ts';
import { FANTASY_EVENTS, FANTASY_LOCATIONS } from './fantasy-data.ts';
import { canInspectFood, FANTASY_DINING, FANTASY_FOOD_META, FANTASY_LODGINGS, fantasyNeedPenalty, foodDetails, foodSense, migrateFantasyLife, reconcileFoodLots } from './fantasy-life.ts';
import { FANTASY_MAPS } from './fantasy-town.ts';

const high = () => 0.999;
function player(job = 'adventurer') {
  const result = applyFantasyAction(newFantasyProfile(), { type: 'create', name: '旅人', gender: 'female', source: 'human', job }, high);
  assert.equal(result.error, undefined);
  result.profile.character!.birthBonuses = {};
  result.profile.character!.hp = fantasyStats(result.profile.character!).hp;
  result.profile.character!.mp = fantasyStats(result.profile.character!).mp;
  result.profile.character!.job = job;
  result.profile.character!.jobXp[job] = 0;
  return result.profile;
}
function step(profile: FantasyProfile, action: FantasyAction, rng = high) {
  const before = structuredClone(profile);
  const result = applyFantasyAction(profile, action, rng);
  assert.equal(result.error, undefined, result.error ?? action.type);
  assert.equal(result.changed, true);
  assert.equal(result.profile.revision, profile.revision + 1);
  assert.deepEqual(profile, before);
  const c = result.profile.character!;
  assert.ok(c.fatigue >= 0 && c.fatigue <= 100);
  assert.ok(c.hunger >= 0 && c.hunger <= 100);
  for (const food of FANTASY_FOOD_META) assert.equal(c.foodLots.filter(lot => lot.item === food.item).reduce((n, lot) => n + lot.count, 0), c.inventory[food.item] ?? 0);
  assert.equal(new Set(c.foodLots.map(lot => lot.id)).size, c.foodLots.length);
  return result.profile;
}
function reject(profile: FantasyProfile, action: FantasyAction) {
  const before = structuredClone(profile);
  const result = applyFantasyAction(profile, action, high);
  assert.ok(result.error);
  assert.equal(result.changed, false);
  assert.deepEqual(profile, before);
}

test('creation starts rested and fed, with an inventory-consistent initial food lot', () => {
  const c = player().character!;
  assert.equal(c.fatigue, 0);
  assert.equal(c.hunger, 0);
  assert.deepEqual(c.charted, []);
  assert.equal(c.foodLots.length, 1);
  assert.equal(c.foodLots[0].item, 'meal');
  assert.equal(c.foodLots[0].createdAt, c.hour);
  assert.equal(c.foodLots[0].count, c.inventory.meal);
});

test('legacy migration only supplies absent life fields and timestamps old food at current game time', () => {
  const original = player().character!;
  const legacy = structuredClone(original) as unknown as Record<string, unknown>;
  for (const field of ['fatigue', 'hunger', 'foodLots', 'charted']) delete legacy[field];
  const next = migrateFantasyLife(legacy as unknown as FantasyCharacter);
  assert.equal(next.hour, original.hour);
  assert.equal(next.gold, original.gold);
  assert.deepEqual(next.inventory, original.inventory);
  assert.equal(next.foodLots[0].createdAt, original.hour);
  assert.equal(next.fatigue, 0);
  assert.equal(next.hunger, 0);
  assert.deepEqual(next.charted, []);
  assert.equal(legacy.foodLots, undefined);
  const corrupt = { ...original, fatigue: -10, hunger: 101, foodLots: null, charted: null };
  assert.deepEqual(migrateFantasyLife(corrupt as unknown as FantasyCharacter), corrupt);
});

test('work, exploration, travel and job change charge elapsed time exactly once', () => {
  const cases: { action: FantasyAction; hours: number; job?: string }[] = [
    { action: { type: 'work' }, hours: 4 }, { action: { type: 'explore' }, hours: 3 },
    { action: { type: 'travel', destination: 'greenwood', transport: 'foot' }, hours: 2 },
    { action: { type: 'job', job: 'cook' }, hours: 1 },
  ];
  for (const entry of cases) {
    const p = player(entry.job);
    const next = step(p, entry.action);
    assert.equal(next.character!.hour - p.character!.hour, entry.hours);
    assert.equal(next.character!.fatigue, entry.hours * 3);
    assert.equal(next.character!.hunger, entry.hours * 2);
  }
});

test('crafting and profession events also charge elapsed time exactly once', () => {
  const p = player('cook');
  p.character!.inventory.fish = 1;
  const cooked = step(p, { type: 'craft', recipe: 'cook-meal' });
  assert.equal(cooked.character!.hour - p.character!.hour, 3);
  assert.equal(cooked.character!.fatigue, 9);
  assert.equal(cooked.character!.hunger, 6);
  const event = FANTASY_EVENTS.find(event => event.job === 'cook')!;
  const q = player('cook'); q.event = event.id;
  const resolved = step(q, { type: 'event', choice: event.choices[0].id });
  assert.equal(resolved.character!.hour - q.character!.hour, 2);
  assert.equal(resolved.character!.fatigue, 6);
  assert.equal(resolved.character!.hunger, 4);
});

test('free camping recovers part of HP MP and fatigue while hunger still advances', () => {
  const p = player();
  Object.assign(p.character!, { hp: 10, mp: 0, fatigue: 80, hunger: 10, buff: { effect: 'guard', power: 8 } });
  const next = step(p, { type: 'rest' });
  assert.equal(next.character!.gold, p.character!.gold);
  assert.equal(next.character!.hour - p.character!.hour, 8);
  assert.equal(next.character!.hp, 30);
  assert.equal(next.character!.mp, 8);
  assert.equal(next.character!.fatigue, 65);
  assert.equal(next.character!.hunger, 26);
  assert.equal(next.character!.buff, null);
});

test('all three inn rooms apply distinct costs and recovery without counting resting as exertion', () => {
  const hp: number[] = [], mp: number[] = [], fatigue: number[] = [];
  for (const room of FANTASY_LODGINGS) {
    const p = player();
    Object.assign(p.character!, { gold: 100, hp: 1, mp: 0, fatigue: 100, hunger: 0 });
    const next = step(p, { type: 'lodge', room: room.id });
    assert.equal(next.character!.gold, 100 - room.cost);
    assert.equal(next.character!.hour - p.character!.hour, room.hours);
    assert.equal(next.character!.fatigue, 100 - room.fatigueRecovery);
    assert.equal(next.character!.hunger, 16);
    assert.equal(next.character!.hp, Math.min(100, 1 + Math.ceil(100 * room.hpRecovery)));
    assert.equal(next.character!.mp, Math.ceil(50 * room.mpRecovery));
    hp.push(next.character!.hp); mp.push(next.character!.mp); fatigue.push(next.character!.fatigue);
  }
  assert.ok(hp[0] < hp[1] && hp[1] < hp[2]);
  assert.ok(mp[0] < mp[1] && mp[1] < mp[2]);
  assert.ok(fatigue[0] > fatigue[1] && fatigue[1] > fatigue[2]);
});

test('lodging validates actual town facilities, money, and untrusted room IDs', () => {
  const p = player(); p.character!.location = 'starspire';
  reject(p, { type: 'lodge', room: 'common' });
  p.character!.location = 'hearth'; p.character!.gold = 0;
  reject(p, { type: 'lodge', room: 'common' });
  reject(p, { type: 'lodge', room: '__proto__' } as unknown as FantasyAction);
  assert.ok(step(p, { type: 'rest' }).character!.hp > 0);
});

test('instant meals consume half a game hour and apply their own cost nutrition and recovery', () => {
  for (const meal of FANTASY_DINING) {
    const p = player();
    Object.assign(p.character!, { gold: 100, hp: 10, mp: 0, hunger: 80 });
    const next = step(p, { type: 'eat', meal: meal.id });
    assert.equal(next.character!.gold, 100 - meal.cost);
    assert.equal(next.character!.hour - p.character!.hour, .5);
    assert.equal(next.character!.hunger, Math.max(0, 80 - meal.nutrition));
    assert.equal(next.character!.fatigue, 0);
    assert.equal(next.character!.hp, 10 + meal.hp);
    assert.equal(next.character!.mp, meal.mp);
  }
});

test('meals require an actual inn or restaurant and reject shortages and invalid choices', () => {
  const p = player(); p.character!.location = 'greenwood';
  reject(p, { type: 'eat', meal: 'simple' });
  p.character!.location = 'hearth'; p.character!.gold = 0;
  reject(p, { type: 'eat', meal: 'simple' });
  reject(p, { type: 'eat', meal: 'constructor' } as unknown as FantasyAction);
});

test('high needs reduce capped D8 work performance and walking speed but preserve paid transport alternatives', () => {
  const p = player();
  const tired = structuredClone(p);
  tired.character!.fatigue = 95; tired.character!.hunger = 95;
  assert.equal(fantasyNeedPenalty(tired.character!), 6);
  const freshRoll = step(p, { type: 'work' }).log.find(l => l.text.includes('d8='))!.text;
  const tiredRoll = step(tired, { type: 'work' }).log.find(l => l.text.includes('d8='))!.text;
  assert.match(freshRoll, /補正\+0/);
  assert.match(tiredRoll, /補正-4/);
  const a = fantasyTransports(p.character!, 'greenwood');
  const b = fantasyTransports(tired.character!, 'greenwood');
  assert.ok(b.find(t => t.id === 'foot')!.hours > a.find(t => t.id === 'foot')!.hours);
  assert.equal(b.find(t => t.id === 'carriage')!.hours, a.find(t => t.id === 'carriage')!.hours);
});

test('starvation and exhaustion stay bounded and damage bypasses combat guard buffs', () => {
  const p = player();
  Object.assign(p.character!, { fatigue: 99, hunger: 99, hp: 100, buff: { effect: 'guard', power: 30 } });
  const next = step(p, { type: 'work' });
  assert.equal(next.character!.fatigue, 100);
  assert.equal(next.character!.hunger, 100);
  assert.ok(next.character!.hp < 100);
  assert.equal(next.character!.buff?.power, 30);
});

test('penniless depleted characters can work and be rescued without an irreversible resource lock', () => {
  const p = player();
  Object.assign(p.character!, { location: 'greenwood', gold: 0, hp: 1, hunger: 100, fatigue: 100 });
  const next = step(p, { type: 'work' });
  assert.equal(next.character!.location, 'hearth');
  assert.ok(next.character!.hp > 0);
  assert.ok(next.character!.gold >= 5);
  assert.ok(next.character!.hunger < 100 && next.character!.fatigue < 100);
  assert.ok(step(next, { type: 'buy', item: 'bread' }).character!.inventory.bread > 0);
});

test('free camping remains a partial recovery path without money or inventory', () => {
  let p = player();
  Object.assign(p.character!, { location: 'greenwood', hp: 1, mp: 0, gold: 0, inventory: {}, foodLots: [], hunger: 100, fatigue: 100 });
  for (let i = 0; i < 4; i++) p = step(p, { type: 'rest' });
  assert.ok(p.character!.hp > 1);
  assert.ok(p.character!.mp > 0);
  assert.ok(p.character!.fatigue < 100);
  assert.equal(p.character!.gold, 0);
});

test('camping incidents include theft and attacks while settlement risk is lower', () => {
  const theft = player();
  let rolls = [0, 0];
  const stolen = step(theft, { type: 'rest' }, () => rolls.shift() ?? 0.99);
  assert.ok(stolen.character!.gold < theft.character!.gold);
  assert.match(stolen.log.at(-1)!.text, /盗まれた/);
  const attacked = player(); attacked.character!.location = 'greenwood'; attacked.character!.hp = 50;
  rolls = [0, 0.5];
  const injured = step(attacked, { type: 'rest' }, () => rolls.shift() ?? 0.99);
  assert.ok(injured.character!.hp < 70);
  const city = player(); city.character!.fatigue = 50;
  const wilderness = structuredClone(city); wilderness.character!.location = 'greenwood';
  assert.equal(step(city, { type: 'rest' }, () => 0.1).character!.fatigue, 35);
  rolls = [0.1, 0.99];
  assert.equal(step(wilderness, { type: 'rest' }, () => rolls.shift() ?? 0.99).character!.fatigue, 43);
});

test('food age never deletes inventory automatically and only cooks see precise inspection', () => {
  const p = player();
  p.character!.hour += 25;
  const sense = foodSense(p.character!, 'meal');
  assert.equal(sense.known, undefined);
  for (const locale of ['ko', 'en', 'ja'] as const) { assert.ok(sense.appearance[locale]); assert.ok(sense.smell[locale]); }
  assert.equal(p.character!.inventory.meal, 1);
  assert.equal(p.character!.foodLots[0].count, 1);
  const cook = structuredClone(p.character!); cook.job = 'cook';
  assert.equal(canInspectFood(cook), true);
  assert.deepEqual(foodSense(cook, 'meal').known, { age: 25, shelfLife: 24, nutrition: 38, quality: 'spoiled' });
  cook.job = 'hunter'; assert.equal(canInspectFood(cook), false); assert.equal(foodSense(cook, 'meal').known, undefined);
  cook.job = 'alchemist'; assert.equal(canInspectFood(cook), false);
});

test('food quality boundaries follow the oldest portion, including the exact shelf-life boundary', () => {
  const c = player().character!;
  c.hour = 8 + 24 * 0.65;
  assert.equal(foodDetails(c, 'meal')!.quality, 'stale');
  c.hour = 32;
  assert.equal(foodDetails(c, 'meal')!.quality, 'stale');
  c.hour = 33;
  assert.equal(foodDetails(c, 'meal')!.quality, 'spoiled');
  assert.equal(foodDetails(c, 'potion'), undefined);
  assert.equal(foodSense(c, 'potion').known, undefined);
});

test('food consumption uses the oldest lot first and reduced recovery from older food', () => {
  const p = player();
  Object.assign(p.character!, { hour: 16, hp: 50, hunger: 70, inventory: { meal: 3 }, foodLots: [
    { id: 'old', item: 'meal', count: 1, createdAt: 0 }, { id: 'new', item: 'meal', count: 2, createdAt: 10 },
  ] });
  const next = step(p, { type: 'use', item: 'meal' });
  assert.equal(next.character!.hunger, 70 - Math.floor(38 * 0.6));
  assert.equal(next.character!.hp, 65);
  assert.deepEqual(next.character!.foodLots.map(lot => [lot.id, lot.count]), [['new', 2]]);
});

test('selling selects a condition batch while quest delivery retains FIFO order', () => {
  const p = player();
  p.character!.inventory = { fish: 4 };
  p.character!.foodLots = [{ id: 'old', item: 'fish', count: 2, createdAt: 0 }, { id: 'new', item: 'fish', count: 2, createdAt: 6 }];
  const sold = step(p, { type: 'sell', item: 'fish', quality: 'stale' });
  assert.deepEqual(sold.character!.foodLots.map(lot => [lot.id, lot.count]), [['old', 1], ['new', 2]]);
  p.character!.quests = ['quest-fish']; p.character!.visited.push('tidehaven');
  const delivered = step(p, { type: 'complete', quest: 'quest-fish' });
  assert.deepEqual(delivered.character!.foodLots.map(lot => [lot.id, lot.count]), [['new', 1]]);
});

test('buying twice at the same hour creates unique fresh lots with matching inventory', () => {
  let p = player();
  p = step(p, { type: 'buy', item: 'bread' });
  p = step(p, { type: 'buy', item: 'bread' });
  const lots = p.character!.foodLots.filter(lot => lot.item === 'bread');
  assert.equal(lots.length, 2);
  assert.equal(lots[0].createdAt, p.character!.hour);
  assert.notEqual(lots[0].id, lots[1].id);
});

test('hunters gather meat in forests and event food rewards receive fresh lots', () => {
  const p = player('hunter'); p.character!.location = 'greenwood';
  const next = step(p, { type: 'explore' });
  assert.ok(next.character!.inventory.meat >= 1);
  assert.ok(next.character!.foodLots.some(lot => lot.item === 'meat' && lot.createdAt === next.character!.hour));
  const q = player(); q.event = 'adventurer-rescue';
  const rewarded = step(q, { type: 'event', choice: 'endure' });
  assert.equal(rewarded.character!.inventory.meal, 2);
  assert.ok(rewarded.character!.foodLots.some(lot => lot.item === 'meal' && lot.createdAt === rewarded.character!.hour));
});

test('jerky recipes consume old meat first and create preserved food at completion time', () => {
  const p = player('cook');
  p.character!.inventory = { meat: 3, spice: 1 };
  p.character!.foodLots = [{ id: 'old', item: 'meat', count: 1, createdAt: 2 }, { id: 'new', item: 'meat', count: 2, createdAt: 6 }];
  const next = step(p, { type: 'craft', recipe: 'cook-jerky' });
  assert.equal(next.character!.inventory.jerky, 2);
  assert.deepEqual(next.character!.foodLots.filter(lot => lot.item === 'meat').map(lot => [lot.id, lot.count]), [['new', 1]]);
  assert.ok(next.character!.foodLots.some(lot => lot.item === 'jerky' && lot.count === 2 && lot.createdAt === next.character!.hour));
  assert.equal(foodDetails(next.character!, 'jerky')!.shelfLife, 168);
});

test('spoiled food has reduced nutrition and recovery and can cause unprotected HP damage', () => {
  const p = player();
  Object.assign(p.character!, { hour: 33, hp: 50, hunger: 80, buff: { effect: 'guard', power: 50 } });
  const next = step(p, { type: 'use', item: 'meal' }, () => 0);
  assert.equal(next.character!.hp, 46);
  assert.equal(next.character!.hunger, 71);
  assert.equal(next.character!.buff?.power, 50);
  assert.equal(next.character!.inventory.meal, 0);
});

test('spoiled ingredients cannot be laundered into fresh crafted food', () => {
  const p = player('cook');
  p.character!.hour = 30; p.character!.inventory = { meat: 2, spice: 1 };
  p.character!.foodLots = [{ id: 'old', item: 'meat', count: 2, createdAt: 0 }];
  reject(p, { type: 'craft', recipe: 'cook-jerky' });
});

test('potions restore resources without acting as meals or gaining food lots', () => {
  const p = player();
  p.character!.inventory.potion = 1; p.character!.hp = 10; p.character!.hunger = 70;
  const next = step(p, { type: 'use', item: 'potion' });
  assert.equal(next.character!.hunger, 70);
  assert.equal(next.character!.hp, 45);
  assert.ok(!next.character!.foodLots.some(lot => lot.item === 'potion'));
});

test('explicit building stocks allow specialized shops but reject absent facilities', () => {
  const p = player(); p.character!.location = 'mooncity'; p.character!.gold = 100;
  assert.ok(step(p, { type: 'buy', item: 'bread' }).character!.inventory.bread);
  assert.ok(step(p, { type: 'buy', item: 'potion' }).character!.inventory.potion);
  reject(p, { type: 'buy', item: 'ore' });
  const cook = player('cook'); cook.character!.location = 'mooncity'; cook.character!.inventory = { fish: 1, herb: 1 };
  reject(cook, { type: 'craft', recipe: 'cook-meal' });
  reject(p, { type: 'job', job: 'cook' });
});

test('hidden remote destinations reject guessed IDs and purchased maps reveal without fake visits', () => {
  let p = player(); p.character!.gold = 100;
  assert.ok(fantasyTransports(p.character!, 'ashpeak').every(t => !t.available));
  reject(p, { type: 'travel', destination: 'ashpeak', transport: 'working-ship' });
  p.character!.location = 'dawnport'; p.character!.visited.push('dawnport');
  p = step(p, { type: 'buy', item: 'map-glass-ash' });
  p = step(p, { type: 'use', item: 'map-glass-ash' });
  assert.equal(p.character!.inventory['map-glass-ash'], 0);
  assert.ok(p.character!.charted.includes('ashpeak'));
  assert.ok(!p.character!.visited.includes('ashpeak'));
  assert.ok(fantasyTransports(p.character!, 'ashpeak').some(t => t.id === 'foot' && t.available));
  assert.equal(new Set(p.character!.charted).size, p.character!.charted.length);
  assert.ok(FANTASY_MAPS.every(map => map.locationIds.every(id => FANTASY_LOCATIONS.some(place => place.id === id))));
});

test('reconciliation removes oldest excess batches and leaves unrelated inventory intact', () => {
  const c = player().character!;
  c.inventory = { bread: 2, ore: 7 };
  c.foodLots = [{ id: 'old', item: 'bread', count: 2, createdAt: 0 }, { id: 'new', item: 'bread', count: 2, createdAt: 4 }];
  reconcileFoodLots(c);
  assert.deepEqual(c.foodLots.map(lot => [lot.id, lot.count]), [['new', 2]]);
  assert.equal(c.inventory.ore, 7);
});

test('the common world pace is fixed at thirty game minutes per real minute', () => {
  assert.equal(FANTASY_WORLD_TIME_RATE, 30);
  assert.equal(60 / FANTASY_WORLD_TIME_RATE, 2);
  assert.equal(4 * 60 / FANTASY_WORLD_TIME_RATE, 8);
  assert.equal(8 * 60 / FANTASY_WORLD_TIME_RATE, 16);
  assert.equal(24 * 60 / FANTASY_WORLD_TIME_RATE, 48);
});

test('a timed action reserves its duration without exposing rewards or jumping time', () => {
  const p = player('unassigned');
  const original = structuredClone(p);
  const result = startFantasyActivity(p, { type: 'work' }, 8.25, high);
  assert.equal(result.error, undefined);
  assert.equal(result.profile.revision, p.revision + 1);
  assert.deepEqual(p, original);
  assert.equal(result.profile.character!.hour, 8.25);
  assert.equal(result.profile.character!.gold, p.character!.gold);
  assert.equal(result.profile.character!.xp, 0);
  assert.deepEqual(result.profile.activity?.action, { type: 'work' });
  assert.equal(result.profile.activity?.startedAt, 8.25);
  assert.equal(result.profile.activity?.endsAt, 12.25);
  assert.ok(Number.isSafeInteger(result.profile.activity?.seed));
});

test('pending actions block every game mutation while allowing synchronization', () => {
  const p = startFantasyActivity(player('unassigned'), { type: 'work' }, 8, high).profile;
  const commands: FantasyAction[] = [{ type: 'work' }, { type: 'rest' }, { type: 'buy', item: 'bread' }, { type: 'use', item: 'meal' }, { type: 'job', job: 'merchant', via: 'gm' }, { type: 'explore' }];
  for (const command of commands) {
    assert.ok(startFantasyActivity(p, command, 9, high).error);
    assert.ok(applyFantasyAction(p, command, high).error);
  }
  assert.equal(startFantasyActivity(p, { type: 'sync' }, 9, high).error, undefined);
  assert.equal(applyFantasyAction(p, { type: 'sync' }).changed, false);
});

test('work ticks pay progress before the exact deadline and finish once', () => {
  const source = player('unassigned');
  const reserved = startFantasyActivity(source, { type: 'work' }, 8, high).profile;
  const partial = advanceFantasyWorld(reserved, 11.999).profile;
  assert.ok(partial.activity);
  assert.equal(partial.revision, reserved.revision + 15);
  assert.equal(partial.activity.work?.completed, 15);
  assert.ok(partial.character!.gold > source.character!.gold);
  assert.equal(partial.character!.hunger, 6);
  assert.equal(partial.character!.fatigue, 9);
  const done = advanceFantasyWorld(partial, 12).profile;
  assert.equal(done.activity, undefined);
  assert.equal(done.revision, reserved.revision + 16);
  assert.equal(done.character!.hour, 12);
  assert.equal(done.character!.hunger, 8);
  assert.equal(done.character!.fatigue, 12);
  assert.ok(done.character!.gold >= source.character!.gold + 5);
  assert.equal(advanceFantasyWorld(done, 12).changed, false);
});

test('persisting and reloading an activity preserves deterministic checks and rewards', () => {
  const reserved = startFantasyActivity(player('unassigned'), { type: 'work' }, 8, () => 0.321).profile;
  const reloaded = JSON.parse(JSON.stringify(reserved)) as FantasyProfile;
  const snapshot = structuredClone(reserved);
  assert.deepEqual(advanceFantasyWorld(reserved, 12), advanceFantasyWorld(reloaded, 12));
  assert.deepEqual(reserved, snapshot);
});

test('two characters share the same hour regardless of their individual actions', () => {
  const a = startFantasyActivity(player('unassigned'), { type: 'work' }, 8, high).profile;
  const b = startFantasyActivity(player('unassigned'), { type: 'explore' }, 8, high).profile;
  const first = advanceFantasyWorld(a, 11).profile;
  const second = advanceFantasyWorld(b, 11).profile;
  assert.equal(first.character!.hour, 11);
  assert.equal(second.character!.hour, 11);
  assert.ok(first.activity);
  assert.equal(second.activity, undefined);
  assert.equal(second.character!.hour, first.character!.hour);
});

test('offline idle time ages food fully without increasing hunger fatigue or damage', () => {
  const p = player();
  p.character!.hunger = 95;
  p.character!.fatigue = 99;
  const done = advanceFantasyWorld(p, 1000).profile;
  assert.equal(done.character!.hour, 1000);
  assert.equal(done.character!.hunger, 95);
  assert.equal(done.character!.fatigue, 99);
  assert.equal(done.character!.hp, p.character!.hp);
  assert.equal(foodDetails(done.character!, 'meal')!.age, 992);
  assert.equal(foodDetails(done.character!, 'meal')!.quality, 'spoiled');
  assert.equal(done.character!.inventory.meal, 1);
});

test('offline pending actions accrue only their action duration before becoming protected idle', () => {
  const p = startFantasyActivity(player('unassigned'), { type: 'work' }, 8, high).profile;
  const done = advanceFantasyWorld(p, 100).profile;
  assert.equal(done.activity, undefined);
  assert.equal(done.character!.hour, 100);
  assert.equal(done.character!.hunger, 8);
  assert.equal(done.character!.fatigue, 12);
  assert.ok(done.log.some(log => log.hour === 12 && log.text.includes('金貨')));
});

test('fractional online ticks do not lose or duplicate integer need accrual', () => {
  const p = player('unassigned');
  let frequent = p;
  for (const hour of [8.1, 8.7, 8.99, 9, 9.1, 9.9, 10]) frequent = advanceFantasyWorld(frequent, hour, { accrueIdleNeeds: true }).profile;
  const single = advanceFantasyWorld(p, 10, { accrueIdleNeeds: true }).profile;
  assert.equal(frequent.character!.hunger, 4);
  assert.equal(frequent.character!.fatigue, 2);
  assert.deepEqual(frequent.character, single.character);
});

test('scheduled lodging applies recovery once without another eight-hour jump', () => {
  const p = player('unassigned');
  p.character!.hp = 10;
  p.character!.mp = 1;
  p.character!.fatigue = 80;
  p.character!.hunger = 10;
  const reserved = startFantasyActivity(p, { type: 'lodge', room: 'common' }, 8, high).profile;
  assert.equal(reserved.character!.gold, 35);
  const done = advanceFantasyWorld(reserved, 16).profile;
  assert.equal(done.character!.hour, 16);
  assert.equal(done.character!.fatigue, 35);
  assert.equal(done.character!.hunger, 26);
  assert.equal(done.character!.hp, 10 + Math.ceil(fantasyStats(p.character!).hp * FANTASY_LODGINGS[0].hpRecovery));
  assert.equal(done.character!.gold, 27);
});

test('travel does not disclose its destination or intermediate visits before arrival', () => {
  const p = player('unassigned');
  const reserved = startFantasyActivity(p, { type: 'travel', destination: 'greenwood', transport: 'foot' }, 8, high).profile;
  assert.equal(reserved.activity?.endsAt, 10);
  const pending = advanceFantasyWorld(reserved, 9.5).profile;
  assert.equal(pending.character!.location, 'hearth');
  assert.deepEqual(pending.character!.visited, ['hearth']);
  const done = advanceFantasyWorld(pending, 10).profile;
  assert.equal(done.character!.location, 'greenwood');
  assert.ok(done.character!.visited.includes('greenwood'));
  assert.equal(done.character!.hour, 10);
});

test('instant actions and new characters use the world hour and create fresh initial food', () => {
  const created = startFantasyActivity(newFantasyProfile(), { type: 'create', name: '時計', gender: 'female', source: 'human' }, 500, high).profile;
  assert.equal(created.character!.hour, 500);
  assert.equal(created.character!.foodLots[0].createdAt, 500);
  assert.equal(created.log[0].hour, 500);
  assert.equal(created.activity, undefined);
  const bought = startFantasyActivity(created, { type: 'buy', item: 'bread' }, 500, high).profile;
  assert.equal(bought.activity, undefined);
  assert.equal(bought.character!.hour, 500);
  assert.equal(bought.character!.inventory.bread, 1);
  assert.equal(bought.character!.foodLots.find(lot => lot.item === 'bread')?.createdAt, 500);
});

test('reservation validates actions and invalid clocks without spending or changing state', () => {
  const p = player('unassigned');
  const original = structuredClone(p);
  assert.ok(startFantasyActivity(p, { type: 'travel', destination: 'ashpeak', transport: 'foot' }, 8).error);
  assert.ok(startFantasyActivity(p, { type: 'lodge', room: 'suite' }, 8).error);
  for (const hour of [NaN, Infinity, -1]) {
    assert.ok(startFantasyActivity(p, { type: 'work' }, hour).error);
    assert.ok(advanceFantasyWorld(p, hour).error);
  }
  assert.deepEqual(p, original);
  assert.equal(fantasyActionHours(p, { type: 'work' }), 4);
  assert.equal(fantasyActionHours(p, { type: 'buy', item: 'bread' }), 0);
});

test('a legacy action whose deadline equals the saved hour still settles exactly once', () => {
  const reserved = startFantasyActivity(player('unassigned'), { type: 'work' }, 8, high).profile;
  delete reserved.activity!.work;
  reserved.character!.hour = 12;
  const done = advanceFantasyWorld(reserved, 12).profile;
  assert.equal(done.activity, undefined);
  assert.equal(done.revision, reserved.revision + 1);
  assert.ok(done.character!.gold > reserved.character!.gold);
});

test('collapse cancels an unfinished journey and rescues without moving the world clock', () => {
  const p = player('unassigned');
  p.character!.hp = 1;
  p.character!.hunger = 100;
  const reserved = startFantasyActivity(p, { type: 'travel', destination: 'greenwood', transport: 'foot' }, 8, high).profile;
  const done = advanceFantasyWorld(reserved, 20).profile;
  assert.equal(done.activity, undefined);
  assert.equal(done.character!.hour, 20);
  assert.equal(done.character!.location, 'hearth');
  assert.deepEqual(done.character!.visited, ['hearth']);
  assert.ok(done.character!.hp > 0);
  assert.ok(done.log.some(log => log.text.includes('行動は中止')));
  assert.ok(done.log.every(log => log.hour <= 20));
});

test('food that spoils during crafting cancels cleanly without spending ingredients', () => {
  const p = player('cook');
  p.character!.hour = 10;
  p.character!.inventory.meat = 2;
  p.character!.inventory.spice = 1;
  p.character!.foodLots.push({ id: 'old-meat', item: 'meat', count: 2, createdAt: 0 });
  const reserved = startFantasyActivity(p, { type: 'craft', recipe: 'cook-jerky' }, 10, high).profile;
  assert.ok(reserved.activity);
  const done = advanceFantasyWorld(reserved, 13).profile;
  assert.equal(done.activity, undefined);
  assert.equal(done.character!.inventory.meat, 2);
  assert.equal(done.character!.inventory.spice, 1);
  assert.equal(done.character!.inventory.jerky ?? 0, 0);
  assert.equal(done.character!.hour, 13);
  assert.ok(done.log.some(log => log.text.includes('行動を完了できなかった')));
});

test('an offline journey keeps its reserved deadline after needs slow future travel and after a restart', () => {
  const p = player('unassigned');
  p.character!.hunger = 49;
  p.character!.fatigue = 49;
  const reserved = startFantasyActivity(p, { type: 'travel', destination: 'greenwood', transport: 'foot' }, 8, high).profile;
  assert.equal(reserved.activity!.endsAt, 10);
  const partial = advanceFantasyWorld(reserved, 9.25).profile;
  const reloaded = JSON.parse(JSON.stringify(partial)) as FantasyProfile;
  const done = advanceFantasyWorld(reloaded, 1000).profile;
  assert.deepEqual(done, advanceFantasyWorld(reserved, 1000).profile);
  assert.equal(done.activity, undefined);
  assert.equal(done.character!.location, 'greenwood');
  assert.equal(done.character!.hour, 1000);
  assert.equal(done.character!.hunger, 53);
  assert.equal(done.character!.fatigue, 55);
  assert.ok(done.log.some(log => log.hour === 10 && log.text.includes('2時間')));
  assert.equal(fantasyTransports(done.character!, 'hearth').find(transport => transport.id === 'foot')?.hours, 3);
});
