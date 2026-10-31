import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, fantasyTransports, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { FANTASY_LOCATIONS } from './fantasy-data.ts';
import type { FantasyProfile } from './fantasy.ts';

function playerAt(location: string): FantasyProfile {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Redirect test', gender: 'female', source: 'human' }, () => .5).profile;
  const c = profile.character!;
  c.location = location;
  if (!c.visited.includes(location)) c.visited.push(location);
  c.gold = 400;
  return profile;
}
const footTo = (profile: FantasyProfile, id: string) => fantasyTransports(profile.character!, id).find(route => route.id === 'foot');

function cityStart() {
  for (const city of FANTASY_LOCATIONS.filter(place => place.kind === 'city')) {
    const profile = playerAt(city.id);
    const options = FANTASY_LOCATIONS.filter(place => place.id !== city.id && footTo(profile, place.id)?.available);
    if (options.length >= 2) return { profile, options };
  }
  return undefined;
}

test('a traveller on foot can change course and stays at the origin', () => {
  const start = cityStart();
  assert.ok(start, 'a city with two walkable destinations should exist');
  const [first, second] = start!.options;
  const started = startFantasyActivity(start!.profile, { type: 'travel', destination: first.id, transport: 'foot' }, 8, () => .5);
  assert.equal(started.error, undefined);
  const changed = applyFantasyAction(started.profile, { type: 'redirect', destination: second.id }, () => .5);
  assert.equal(changed.error, undefined);
  assert.deepEqual(changed.profile.activity!.action, { type: 'travel', destination: second.id, transport: 'foot' });
  assert.equal(changed.profile.character!.location, start!.profile.character!.location);
  assert.equal(changed.profile.character!.hour, started.profile.character!.hour);
  assert.ok(changed.profile.log.some(entry => entry.text.startsWith('進路を変え')));
  assert.equal(applyFantasyAction(changed.profile, { type: 'cancel' }).profile.activity, undefined);
});

test('ships and escorts cannot change course mid-journey', () => {
  const start = cityStart();
  assert.ok(start);
  const ship: FantasyProfile = { ...structuredClone(start!.profile), activity: { action: { type: 'travel', destination: start!.options[0].id, transport: 'ship' }, startedAt: 8, endsAt: 10, seed: 3 } };
  const ships = applyFantasyAction(ship, { type: 'redirect', destination: start!.options[1].id });
  assert.equal(ships.changed, false); assert.match(ships.error!, /船/);
  const escort: FantasyProfile = { ...structuredClone(start!.profile), activity: { action: { type: 'travel', destination: start!.options[0].id, transport: 'escort' }, startedAt: 8, endsAt: 20, seed: 4 } };
  const escorts = applyFantasyAction(escort, { type: 'redirect', destination: start!.options[1].id });
  assert.equal(escorts.changed, false); assert.match(escorts.error!, /護衛/);
});

test('stepping off a carriage continues on foot without a refund', () => {
  const carriage = FANTASY_LOCATIONS.filter(place => place.kind === 'city').flatMap(city => {
    const profile = playerAt(city.id);
    return FANTASY_LOCATIONS.flatMap(place => {
      if (place.id === city.id) return [];
      const paid = fantasyTransports(profile.character!, place.id).find(route => route.id === 'carriage' && route.available);
      return paid ? [{ profile, place }] : [];
    });
  })[0];
  assert.ok(carriage, 'a city with an available carriage route should exist');
  const started = startFantasyActivity(carriage!.profile, { type: 'travel', destination: carriage!.place.id, transport: 'carriage' }, 8, () => .5);
  assert.equal(started.error, undefined);
  const gold = started.profile.character!.gold;
  const alternative = FANTASY_LOCATIONS.find(place => place.id !== carriage!.profile.character!.location && place.id !== carriage!.place.id && footTo(started.profile, place.id)?.available);
  assert.ok(alternative);
  const changed = applyFantasyAction(started.profile, { type: 'redirect', destination: alternative!.id }, () => .5);
  assert.equal(changed.error, undefined);
  assert.equal(changed.profile.activity!.action.type === 'travel' && changed.profile.activity!.action.transport, 'foot');
  assert.equal(changed.profile.character!.gold, gold);
});

test('redirect only works while travelling', () => {
  const start = cityStart();
  assert.ok(start);
  const idle = applyFantasyAction(start!.profile, { type: 'redirect', destination: start!.options[0].id });
  assert.equal(idle.changed, false); assert.match(idle.error!, /移動中/);
  const working = startFantasyActivity(start!.profile, { type: 'work' }, 8, () => .5).profile;
  const refused = applyFantasyAction(working, { type: 'redirect', destination: start!.options[0].id });
  assert.equal(refused.changed, false); assert.match(refused.error!, /移動中/);
});
