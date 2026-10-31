import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceFantasyWorld, applyFantasyAction, fantasyTransports, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { fantasyKnownLocations } from './fantasy-town.ts';
import { FANTASY_LOCATIONS, FANTASY_ROUTES } from './fantasy-data.ts';
import type { FantasyProfile } from './fantasy.ts';
import { isFantasyRetreat } from './fantasy-retreats.ts';

function player(location = 'hearth'): FantasyProfile {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Fog test', gender: 'female', source: 'human' }, () => .5).profile;
  profile.character!.location = location;
  if (!profile.character!.visited.includes(location)) profile.character!.visited.push(location);
  profile.character!.gold = 500;
  return profile;
}

const neighboursOf = (id: string) => {
  const found = new Set<string>();
  for (const route of FANTASY_ROUTES) {
    if (route.mode === 'gate') continue;
    if (route.from === id) found.add(route.to);
    if (route.to === id) found.add(route.from);
  }
  return found;
};

/** 経由地があり、その周辺にまだ知らない地域が残る陸路を一つ探す。 */
function multiLegRoute() {
  for (const from of FANTASY_LOCATIONS) for (const to of FANTASY_LOCATIONS) {
    if (from.id === to.id) continue;
    const profile = player(from.id);
    const foot = fantasyTransports(profile.character!, to.id).find(route => route.id === 'foot');
    if (!foot?.available || foot.path.length < 3) continue;
    const known = new Set(fantasyKnownLocations(profile.character!));
    const hidden = [...new Set(foot.path.slice(1, -1).flatMap(id => [...neighboursOf(id)]))]
      .filter(id => !known.has(id) && id !== to.id && !isFantasyRetreat(id));
    if (hidden.length) return { from: from.id, to: to.id, foot, hidden };
  }
  return undefined;
}

test('a multi-region journey lifts the fog around every region it passes through', () => {
  const route = multiLegRoute();
  assert.ok(route, 'a multi-region land route with unknown neighbours should exist');
  const before = new Set(fantasyKnownLocations(player(route!.from).character!));
  const started = startFantasyActivity(player(route!.from), { type: 'travel', destination: route!.to, transport: 'foot' }, 8, () => .5);
  assert.equal(started.error, undefined);
  const done = advanceFantasyWorld(started.profile, started.profile.activity!.endsAt).profile;
  const known = fantasyKnownLocations(done.character!);
  for (const id of route!.foot.path.slice(1, -1)) assert.ok(done.character!.visited.includes(id), `${id} should be recorded as passed`);
  for (const id of route!.hidden) {
    assert.equal(before.has(id), false);
    assert.ok(known.includes(id), `${id} near the route should be revealed`);
    assert.equal(done.character!.visited.includes(id), false, `${id} must not count as a visit`);
  }
  const retreats = [...new Set(route!.foot.path.flatMap(id => [...neighboursOf(id)]))].filter(isFantasyRetreat);
  for (const id of retreats) {
    assert.equal(known.includes(id), false, `${id} stays hidden without its map`);
    assert.equal(done.character!.charted.includes(id), false);assert.equal(done.character!.visited.includes(id), false);
    const mapped=structuredClone(done.character!);mapped.charted.push(id);
    assert.equal(fantasyKnownLocations(mapped).includes(id),true,`${id} is revealed by its map`);
  }
});

test('a single-leg journey does not invent extra revealed regions', () => {
  const from = 'hearth';
  const profile = player(from);
  const direct = FANTASY_LOCATIONS
    .map(to => ({ to: to.id, foot: fantasyTransports(profile.character!, to.id).find(route => route.id === 'foot') }))
    .find(entry => entry.foot?.available && entry.foot.path.length === 2);
  assert.ok(direct, 'a neighbouring land route should exist');
  const started = startFantasyActivity(profile, { type: 'travel', destination: direct!.to, transport: 'foot' }, 8, () => .5);
  const done = advanceFantasyWorld(started.profile, started.profile.activity!.endsAt).profile;
  assert.equal(done.character!.seen, undefined);
  assert.deepEqual(fantasyKnownLocations(done.character!).sort(), [...new Set([...done.character!.visited, ...done.character!.charted])].sort());
});

test('revealed regions join the known map without counting as visits', () => {
  const known = fantasyKnownLocations({ visited: ['hearth'], charted: [], seen: ['greenwood', 'ashpeak'] });
  assert.ok(known.includes('hearth') && known.includes('greenwood') && known.includes('ashpeak'));
  const character = player('hearth').character!;
  character.seen = ['greenwood'];
  assert.ok(fantasyKnownLocations(character).includes('greenwood'));
  assert.equal(character.visited.includes('greenwood'), false);
});
