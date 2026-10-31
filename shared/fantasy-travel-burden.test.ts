import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FantasyActivity, FantasyTravelLeg, FantasyTransport } from './fantasy.ts';
import { FANTASY_LOCATIONS } from './fantasy-data.ts';
import { advanceFantasyWorld, applyFantasyAction, fantasyTransports, fantasyTravelRedirectQuote, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { fantasyTravelBurden, fantasyTravelBurdenHours, fantasyTravelBurdenModeFactor, fantasyTravelBurdenQuote } from './fantasy-travel-burden.ts';
import { fantasyTravelPartyPace, fantasyTravelPoint, fantasyTravelPosition, validFantasyTravel } from './fantasy-travel.ts';
import { FantasyStore } from '../server/fantasy-store.ts';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} !== ${expected}`);
function player(location = 'hearth') {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Baggage', gender: 'female', source: 'human' }, () => .5).profile;
  Object.assign(p.character!, { location, gold: 5000, level: 3, inventory: {}, foodLots: [], charted: FANTASY_LOCATIONS.map(place => place.id), visited: [...new Set(['hearth', location])] });
  return p;
}
test('burden follows real carried weight, independent of added capacity, with separate bag-size costs', () => {
  const c = player().character!;
  assert.equal(fantasyTravelBurden(c).penalty, 0);
  c.inventory = { herb: 500, 'canvas-bag-1': 1, 'canvas-bag-3': 1, 'arcane-bag-1': 2 };
  const unselected = fantasyTravelBurden(c);
  assert.equal(unselected.weight, 13_400); close(unselected.loadPenalty, .134);
  c.bag = 'canvas-bag-1'; const small = fantasyTravelBurden(c);
  c.bag = 'canvas-bag-3'; const large = fantasyTravelBurden(c);
  assert.equal(large.loadPenalty, small.loadPenalty); assert.equal(large.weight, small.weight);
  assert.ok(large.weightLimit > small.weightLimit); close(large.sizePenalty - small.sizePenalty, .08);
  c.magicBags = ['arcane-bag-1', 'arcane-bag-1']; const extra = fantasyTravelBurden(c);
  assert.equal(extra.weight, large.weight); close(extra.sizePenalty, .14); close(extra.penalty, .274);
  c.inventory.herb += 500; assert.ok(fantasyTravelBurden(c).loadPenalty > extra.loadPenalty);
});
test('weight burden caps at 66 percentage points and total burden caps at 80', () => {
  const c = player().character!; c.inventory = { herb: 5000, 'canvas-bag-3': 1, 'arcane-bag-1': 2 }; c.bag = 'canvas-bag-3'; c.magicBags = ['arcane-bag-1', 'arcane-bag-1'];
  const result = fantasyTravelBurden(c);
  close(result.loadPenalty, .66); close(result.sizePenalty, .14); close(result.penalty, .8); close(result.multiplier, 1.8);
  c.inventory.herb *= 10; close(fantasyTravelBurden(c).multiplier, 1.8);
});
test('foot takes full burden, carriage and escort take one fifth, and sea flight and gates take none', () => {
  const c = player().character!; c.inventory.herb = 500;
  for (const [mode, factor] of [['foot', 1], ['carriage', .2], ['escort', .2], ['ship', 0], ['working-ship', 0], ['airship', 0], ['gate', 0]] as const) {
    assert.equal(fantasyTravelBurdenModeFactor(mode), factor); close(fantasyTravelBurdenHours(c, 10, mode), 10 + factor);
  }
});
test('mixed quote changes only affected segment durations, retains fares and fractional starts, and never mutates its input', () => {
  const c = player().character!; c.inventory.herb = 500;
  const legs: FantasyTravelLeg[] = [
    { from: 'sunmeadow', to: 'hearth', transport: 'foot', hours: 2, cost: 0, startFraction: .25 },
    { from: 'hearth', to: 'suncourt', transport: 'carriage', hours: 3, cost: 12 },
    { from: 'suncourt', to: 'tidehaven', transport: 'ship', hours: 4, cost: 8 },
  ];
  const quote = { id: 'ship', hours: 9, legs, cost: 20, path: ['sunmeadow', 'hearth', 'suncourt', 'tidehaven'] }, before = structuredClone(quote);
  const result = fantasyTravelBurdenQuote(c, quote);
  assert.deepEqual(quote, before); close(result.hours, 9.26);
  close(result.legs![0].hours, 2.2); close(result.legs![1].hours, 3.06); assert.equal(result.legs![2].hours, 4);
  assert.equal(result.cost, 20); assert.deepEqual(result.path, quote.path); assert.deepEqual(result.legs!.map(leg => leg.cost), [0, 12, 8]); assert.equal(result.legs![0].startFraction, .25);
  for (const mode of ['ship', 'airship', 'gate']) {
    const untouched = { id: mode, hours: .1 + .2, legs: [{ from: 'hearth', to: 'suncourt', transport: mode, hours: .1 + .2, cost: 7 }] };
    assert.equal(fantasyTravelBurdenQuote(c, untouched).hours, untouched.hours, 'zero-burden modes retain exact floating-point quote');
  }
});
test('real feeder carriage itineraries apply each mode factor once and keep the same route and fare', () => {
  const light = player('sunmeadow'), heavy = structuredClone(light); heavy.character!.inventory.herb = 500;
  const base = fantasyTransports(light.character!, 'emberhall').find(quote => quote.id === 'carriage')!, loaded = fantasyTransports(heavy.character!, 'emberhall').find(quote => quote.id === 'carriage')!;
  assert.equal(base.available, true); assert.equal(loaded.available, true); assert.deepEqual(base.legs!.map(leg => leg.transport), ['foot', 'carriage']);
  assert.deepEqual(loaded.path, base.path); assert.equal(loaded.cost, base.cost);
  loaded.legs!.forEach((leg, i) => close(leg.hours, base.legs![i].hours * (leg.transport === 'foot' ? 1.1 : 1.02)));
  close(loaded.hours, loaded.legs!.reduce((hours, leg) => hours + leg.hours, 0));
  const start = startFantasyActivity(heavy, { type: 'travel', destination: 'emberhall', transport: 'carriage' }, 8, () => .999);
  assert.equal(start.error, undefined); assert.deepEqual(start.profile.activity!.travel!.legs, loaded.legs);
  assert.equal(start.profile.character!.gold, heavy.character!.gold - loaded.cost); close(start.profile.activity!.endsAt, 8 + loaded.hours);
});
test('real ship itineraries apply baggage only to walking feeder legs, preserving sea times and fares', () => {
  const light = player(), heavy = structuredClone(light); heavy.character!.inventory.herb = 500;
  const candidate = FANTASY_LOCATIONS.map(place => ({ place, quote: fantasyTransports(light.character!, place.id).find(quote => quote.id === 'ship' && quote.available) }))
    .find(({ quote }) => quote?.legs?.some(leg => leg.transport === 'foot') && quote.legs.some(leg => leg.transport === 'ship'));
  assert.ok(candidate, 'a real walking plus sea itinerary exists');
  for (const mode of ['ship', 'working-ship']) {
    const base: FantasyTransport = fantasyTransports(light.character!, candidate.place.id).find(quote => quote.id === mode)!, loaded: FantasyTransport = fantasyTransports(heavy.character!, candidate.place.id).find(quote => quote.id === mode)!;
    assert.equal(loaded.available, true); assert.equal(loaded.cost, base.cost); assert.deepEqual(loaded.path, base.path);
    loaded.legs!.forEach((leg, i) => close(leg.hours, base.legs![i].hours * (leg.transport === 'foot' ? 1.1 : 1)));
    close(loaded.hours, loaded.legs!.reduce((hours, leg) => hours + leg.hours, 0));
  }
});
test('repeated fractional road redirects apply burden once to remaining distance and retain the exact physical point', () => {
  const p = player(); p.character!.inventory.herb = 500;
  const s = startFantasyActivity(p, { type: 'travel', destination: 'greenwood', transport: 'foot' }, 8, () => .999).profile;
  close(s.activity!.endsAt - 8, 2.2);
  const at = 8 + (s.activity!.endsAt - 8) / 4, mid = advanceFantasyWorld(s, at).profile;
  const point = fantasyTravelPoint(mid.character!.travelPosition!);
  let current = mid;
  for (const destination of ['hearth', 'greenwood', 'hearth', 'greenwood']) {
    const redirected = applyFantasyAction(current, { type: 'redirect', destination }, () => .999);
    assert.equal(redirected.error, undefined); current = redirected.profile;
    close(current.activity!.endsAt - current.activity!.startedAt, destination === 'hearth' ? .55 : 1.65);
    assert.deepEqual(fantasyTravelPoint(fantasyTravelPosition(current.activity!, at)!), point);
    assert.equal(current.character!.gold, p.character!.gold); assert.equal(validFantasyTravel(current.character!, current.activity), true);
  }
  const saved = JSON.parse(JSON.stringify(current)), done = advanceFantasyWorld(saved, saved.activity.endsAt).profile;
  assert.equal(done.character!.location, 'greenwood'); assert.equal(done.character!.travelPosition, undefined);
});

function itinerary(hours: number[], transport = 'foot', costs = [0, 0], startFraction = .2): FantasyActivity {
  const legs: FantasyTravelLeg[] = [
    { from: 'hearth', to: 'greenwood', transport, hours: hours[0], cost: costs[0], startFraction },
    { from: 'greenwood', to: 'whispergrove', transport, hours: hours[1], cost: costs[1] },
  ];
  return { action: { type: 'travel', destination: 'whispergrove', transport }, startedAt: 8, endsAt: 8 + hours[0] + hours[1], seed: 1, travel: { legs, paid: costs[0] + costs[1], ambushChecked: 0 } };
}
test('party pace copies the slowest personal segment schedule, so every member shares coordinates while keeping modes and fares', () => {
  const walk = itinerary([2, 4]), ride = itinerary([3, 1], 'carriage', [9, 5]), originalRide = structuredClone(ride);
  assert.equal(fantasyTravelPartyPace([ride, walk]), 14);
  assert.deepEqual(ride.travel!.legs.map(leg => leg.hours), [2, 4]); assert.equal(ride.endsAt, walk.endsAt);
  assert.deepEqual(ride.action, originalRide.action); assert.equal(ride.travel!.paid, originalRide.travel!.paid);
  assert.deepEqual(ride.travel!.legs.map(leg => [leg.transport, leg.cost, leg.startFraction]), originalRide.travel!.legs.map(leg => [leg.transport, leg.cost, leg.startFraction]));
  for (const hour of [8, 8.5, 9.999, 10, 10.5, 13.999, 14]) {
    assert.deepEqual(fantasyTravelPosition(ride, hour), fantasyTravelPosition(walk, hour));
  }
  for (const activity of [walk, ride]) assert.equal(validFantasyTravel({ hour: 8, travelPosition: fantasyTravelPosition(activity, 8) }, activity), true);
});
test('party pace rejects different routes, starts and edge fractions without publishing any partial schedule change', () => {
  for (const defect of ['route', 'time', 'fraction']) {
    const first = itinerary([2, 4]), second = itinerary([3, 1]);
    if (defect === 'route') second.travel!.legs[1].to = 'ironridge';
    if (defect === 'time') second.startedAt += .1;
    if (defect === 'fraction') second.travel!.legs[0].startFraction = .3;
    const before = structuredClone([first, second]);
    assert.equal(fantasyTravelPartyPace([first, second]), undefined, defect); assert.deepEqual([first, second], before);
  }
});
test('fractional transfer times cannot create a negative position fraction from floating-point subtraction', () => {
  const activity = itinerary([1.1, 3.06]);
  for (const hour of [9.1, 9.1 - 1e-10]) {
    const position = fantasyTravelPosition(activity, hour)!;
    assert.deepEqual(position, { from: 'greenwood', to: 'whispergrove', fraction: 0 });
    assert.equal(validFantasyTravel({ hour, travelPosition: position }, activity), true);
  }
});
test('the actual server shares loaded party segment times through transfers, save and redirect without changing individual fares', t => {
  const prefix = path.join(os.tmpdir(), 'fantasy-load-party-'), dir = fs.mkdtempSync(prefix), file = path.join(dir, 'save.json');
  t.after(() => { if (!path.resolve(dir).startsWith(path.resolve(prefix))) throw Error('Unexpected test path'); fs.rmSync(dir, { recursive: true, force: true }); });
  const light = player('sunmeadow'), heavy = player('sunmeadow'); heavy.character!.inventory.herb = 500;
  fs.writeFileSync(file, JSON.stringify({ light, heavy })); let hour = 8;
  const opts = { worldHour: () => hour, ambush: false, onError: (error: unknown) => { throw error; } };
  let store = new FantasyStore(file, opts); assert.equal(store.loadError, undefined);
  const quoted = [light, heavy].map(p => fantasyTransports(p.character!, 'emberhall').find(quote => quote.id === 'carriage')!);
  const plans = ['light', 'heavy'].map((user, i) => ({ user, generation: 1, location: 'sunmeadow', destination: 'emberhall', transport: 'carriage', quotedCost: quoted[i].cost, quotedHours: quoted[i].hours }));
  const started = store.startGroupTravel(plans, undefined, () => .999);
  assert.equal(started.error, undefined); assert.equal(started.updates.length, 2);
  const schedule = store.profile('heavy').activity!;
  for (const user of ['light', 'heavy']) {
    const p = store.profile(user);
    assert.deepEqual(p.activity!.travel!.legs.map(leg => leg.hours), quoted[1].legs!.map(leg => leg.hours));
    assert.equal(p.character!.gold, 5000 - quoted[0].cost);
  }
  const transfer = schedule.startedAt + schedule.travel!.legs[0].hours;
  for (const at of [transfer - .001, transfer, transfer + .1]) {
    hour = at; store.tick(new Set(['light', 'heavy']));
    assert.deepEqual(store.profile('light').character!.travelPosition, store.profile('heavy').character!.travelPosition);
    assert.equal(store.profile('light').character!.gold, 5000 - quoted[0].cost);
    assert.equal(store.profile('heavy').character!.gold, 5000 - quoted[1].cost);
  }
  store = new FantasyStore(file, opts); assert.equal(store.loadError, undefined);
  const before = ['light', 'heavy'].map(user => store.profile(user));
  const redirectPlans = ['light', 'heavy'].map((user, i) => {
    const quote = fantasyTravelRedirectQuote(before[i], 'hearth', 'foot')!;
    assert.ok(quote); return { user, generation: 1, location: before[i].character!.location, destination: 'hearth', transport: 'foot', quotedAt: hour, quotedHours: quote.hours, quotedCost: quote.cost };
  });
  const redirected = store.startGroupRedirect(redirectPlans);
  assert.equal(redirected.error, undefined);
  assert.equal(store.profile('light').activity!.endsAt, store.profile('heavy').activity!.endsAt);
  hour = (hour + store.profile('heavy').activity!.endsAt) / 2; store.tick(new Set(['light', 'heavy']));
  assert.deepEqual(store.profile('light').character!.travelPosition, store.profile('heavy').character!.travelPosition);
  hour = store.profile('heavy').activity!.endsAt; store.tick(new Set(['light', 'heavy']));
  for (const [i, user] of ['light', 'heavy'].entries()) {
    const p = store.profile(user); assert.equal(p.activity, undefined); assert.equal(p.character!.location, 'hearth'); assert.equal(p.character!.gold, before[i].character!.gold);
  }
});
