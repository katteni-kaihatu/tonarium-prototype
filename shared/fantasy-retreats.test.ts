import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, fantasyTransports, newFantasyProfile } from './fantasy-engine.ts';
import { FANTASY_RETREATS, FANTASY_RETREAT_MAPS, FANTASY_RETREAT_ROUTES, fantasyRetreatMarketStock, fantasyRetreatCampSnapshot, fantasyCompleteRetreatCamp, validFantasyRetreatMemory } from './fantasy-retreats.ts';
import { fantasyFrontierLocations, fantasyKnownLocations } from './fantasy-town.ts';

test('four sanctuary maps reveal only their own retreat and require normal travel', () => {
  assert.equal(FANTASY_RETREATS.length, 4);
  for (const retreat of FANTASY_RETREATS) {
    const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Explorer', source: 'human', gender: 'female' }, () => .99).profile, c = p.character!;
    const route = FANTASY_RETREAT_ROUTES.find(r => r.to === retreat.location.id)!; c.location = route.from; c.visited.push(route.from);
    assert.equal(fantasyKnownLocations(c).includes(retreat.location.id), false);
    assert.equal(fantasyFrontierLocations(c).includes(retreat.location.id), false);
    assert.deepEqual(fantasyTransports(c, retreat.location.id), []);
    c.inventory[retreat.map.item] = 1;
    const used = applyFantasyAction(p, { type: 'use', item: retreat.map.item }); assert.equal(used.error, undefined);
    assert.equal(used.profile.character!.location, route.from); assert.ok(used.profile.character!.charted.includes(retreat.location.id));
    assert.ok(fantasyTransports(used.profile.character!, retreat.location.id).length);
    assert.ok(FANTASY_RETREAT_MAPS.filter(m => m.item !== retreat.map.item).every(m => !used.profile.character!.charted.includes(m.locationIds[0])));
    const here = structuredClone(used.profile); here.character!.location = retreat.location.id; here.character!.visited.push(retreat.location.id);
    for (const type of ['explore', 'rest'] as const) for (const roll of [0, .01, .2, .99]) {
      const result = applyFantasyAction(here, { type }, () => roll); assert.equal(result.error, undefined); assert.equal(result.profile.event, null); assert.equal(result.profile.death, undefined);
    }
  }
});

test('retreat market lottery is daily, deterministic and offers at most one chart from designated markets', () => {
  let stocked = 0;
  for (let day = 0; day < 1000; day++) {
    const stock = fantasyRetreatMarketStock('hearth', day); assert.deepEqual(stock, fantasyRetreatMarketStock('hearth', day));
    assert.ok(stock.length <= 1); for (const lot of stock) { assert.equal(lot.count, 1); assert.ok(FANTASY_RETREAT_MAPS.some(m => m.item === lot.item)); stocked++; }
    assert.deepEqual(fantasyRetreatMarketStock('greenwood', day), []);
  }
  assert.ok(stocked > 40 && stocked < 120, `${stocked}/1000 stocked days`);
  assert.deepEqual(fantasyRetreatMarketStock('hearth', -1), []); assert.deepEqual(fantasyRetreatMarketStock('hearth', NaN), []);
});

test('retreat memories require eight hours, successful completion, same life and continuous surviving participants', () => {
  const snapshot = fantasyRetreatCampSnapshot({ sourceUserId: 'a', generation: 1, characterName: 'A', location: 'retreat-mirrorlake', startedAt: 8,
    participants: [{ kind: 'player', key: 'b', name: 'B', generation: 1 }, { kind: 'companion', key: 'guard', name: 'Guard' }] })!;
  const completion = { sourceUserId: 'a', generation: 1, location: snapshot.location, completedAt: 16, successful: true, participants: snapshot.participants };
  for (const patch of [{ completedAt: 15.99 }, { successful: false }, { generation: 2 }, { location: 'retreat-cedarbend' }, { participants: [] }]) assert.deepEqual(fantasyCompleteRetreatCamp([], snapshot, { ...completion, ...patch }), []);
  const once = fantasyCompleteRetreatCamp([], snapshot, completion); assert.equal(once.length, 1); assert.ok(validFantasyRetreatMemory(once[0]));
  assert.deepEqual(fantasyCompleteRetreatCamp(once, snapshot, completion), once);
  const nextLife = { ...completion, participants: [{ kind: 'player' as const, key: 'b', name: 'B', generation: 2 }] };
  assert.deepEqual(fantasyCompleteRetreatCamp([], snapshot, nextLife), []);
});
