import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, advanceFantasyWorld, fantasyStats, fantasyTransports, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { fantasyAmbushHit } from './fantasy-ambush.ts';
import { fantasyTravelPosition, validFantasyTravel, validFantasyTravelPosition } from './fantasy-travel.ts';
import { FANTASY_LOCATIONS } from './fantasy-data.ts';
import { FANTASY_FRONTIER_BASE, FANTASY_FRONTIER_DEPARTURE } from './fantasy-frontier-data.ts';
import type { FantasyProfile } from './fantasy.ts';

function voyager(from = FANTASY_FRONTIER_BASE): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'Interrupted voyager' }, () => .5).profile, c = p.character!;
  Object.assign(c, { location: from, hour: 12, job: 'warrior', level: 20, gold: 10000 }); c.jobXp.warrior = 0;
  c.visited.push(from); c.charted = FANTASY_LOCATIONS.map(place => place.id); c.inventory.lantern = 1;
  c.expedition = { route: 'guild', issuedAt: 8 }; c.guildProgress = { version: 1, grade: 4, completedAtGrade: 0, creditedQuests: [] };
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp; return p;
}
function interrupted(from = FANTASY_FRONTIER_BASE, to = FANTASY_FRONTIER_DEPARTURE, mode = 'ship') {
  const p = voyager(from), started = startFantasyActivity(p, { type: 'travel', destination: to, transport: mode }, 12, () => (39 + .5) / 4294967296);
  assert.equal(started.error, undefined); assert.ok(started.profile.activity);
  const hit = fantasyAmbushHit(started.profile.activity, started.profile.activity.endsAt)!; assert.equal(hit.slot, 0);
  const stopped = advanceFantasyWorld(started.profile, started.profile.activity.endsAt, { ambush: true }).profile;
  assert.equal(stopped.activity, undefined); assert.ok(stopped.event); assert.ok(stopped.character!.travelPosition);
  const escaped = applyFantasyAction(stopped, { type: 'event', choice: 'escape' }, () => .999); assert.equal(escaped.error, undefined); assert.equal(escaped.profile.event, null);
  return { initial: p, started: started.profile, stopped, escaped: escaped.profile, hit };
}

test('seed39 frontier return survives a real sea ambush and resumes the paid remainder after escape', () => {
  const f = interrupted(), position = f.escaped.character!.travelPosition!;
  assert.equal(position.transport, 'ship'); assert.ok(position.remainingHours! > 0);
  const quotes = fantasyTransports(f.escaped.character!, FANTASY_FRONTIER_DEPARTURE);
  assert.equal(quotes.length, 1); assert.equal(quotes[0].id, 'ship'); assert.equal(quotes[0].cost, 0);
  assert.equal(quotes[0].hours, f.started.activity!.endsAt - f.hit.hour);
  const resumed = startFantasyActivity(f.escaped, { type: 'travel', destination: FANTASY_FRONTIER_DEPARTURE, transport: 'ship' }, f.escaped.character!.hour, () => .5);
  assert.equal(resumed.error, undefined); assert.ok(validFantasyTravel(resumed.profile.character!, resumed.profile.activity));
  assert.equal(resumed.profile.character!.gold, f.started.character!.gold);
  assert.equal(resumed.profile.activity!.travel!.legs[0].startFraction, position.fraction);
  const done = advanceFantasyWorld(resumed.profile, resumed.profile.activity!.endsAt).profile;
  assert.equal(done.character!.location, FANTASY_FRONTIER_DEPARTURE); assert.equal(done.character!.travelPosition, undefined);
  assert.equal(done.character!.gold, f.started.character!.gold); assert.equal(done.activity, undefined);
});

test('an admitted interrupted voyage cannot disembark, reverse, choose another port or change transport', () => {
  const f = interrupted();
  for (const destination of [FANTASY_FRONTIER_BASE, 'hearth', 'tidehaven', 'frontier-kelp-coast']) assert.deepEqual(fantasyTransports(f.escaped.character!, destination), []);
  for (const transport of ['foot', 'working-ship', 'airship', 'gate']) {
    const result = startFantasyActivity(f.escaped, { type: 'travel', destination: FANTASY_FRONTIER_DEPARTURE, transport }, f.escaped.character!.hour, () => .5);
    assert.ok(result.error); assert.deepEqual(result.profile, f.escaped);
  }
  assert.ok(applyFantasyAction(f.escaped, { type: 'cancel' }).error);
  assert.ok(applyFantasyAction(f.escaped, { type: 'redirect', destination: FANTASY_FRONTIER_BASE }).error);
});

test('continuing a server-owned sea position does not require a second permit or current entry rank', () => {
  const f = interrupted(FANTASY_FRONTIER_DEPARTURE, FANTASY_FRONTIER_BASE);
  delete f.escaped.character!.guildProgress; delete f.escaped.character!.expedition;
  const quote = fantasyTransports(f.escaped.character!, FANTASY_FRONTIER_BASE);
  assert.equal(quote.length, 1); assert.equal(quote[0].available, true); assert.equal(quote[0].cost, 0);
  const fresh = voyager(FANTASY_FRONTIER_DEPARTURE); delete fresh.character!.expedition;
  assert.ok(!fantasyTransports(fresh.character!, FANTASY_FRONTIER_BASE).some(quote => quote.available));
});

test('legacy sea positions infer a paid ship continuation without opening other destinations', () => {
  const c = voyager().character!; c.travelPosition = { from: FANTASY_FRONTIER_BASE, to: FANTASY_FRONTIER_DEPARTURE, fraction: .4 };
  assert.ok(validFantasyTravelPosition(c.travelPosition));
  const quotes = fantasyTransports(c, FANTASY_FRONTIER_DEPARTURE);
  assert.equal(quotes.length, 1); assert.equal(quotes[0].id, 'ship'); assert.equal(quotes[0].cost, 0);
  assert.ok(quotes[0].hours > 0 && quotes[0].hours < 24); assert.deepEqual(fantasyTransports(c, FANTASY_FRONTIER_BASE), []);
});

test('nonland position metadata must match the actual active leg and its remaining duration', () => {
  for (const [transport, from, to] of [['ship', FANTASY_FRONTIER_BASE, FANTASY_FRONTIER_DEPARTURE], ['working-ship', FANTASY_FRONTIER_BASE, FANTASY_FRONTIER_DEPARTURE], ['airship', 'hearth', 'greenwood'], ['gate', 'hearth', 'suncourt']] as const) {
    const p = voyager(from), started = startFantasyActivity(p, { type: 'travel', destination: to, transport }, 12, () => .5).profile;
    const middle = advanceFantasyWorld(started, 12 + (started.activity!.endsAt - 12) / 2).profile;
    assert.equal(middle.character!.travelPosition!.transport, transport); assert.ok(validFantasyTravel(middle.character!, middle.activity));
    for (const mutate of [(p: FantasyProfile) => { p.character!.travelPosition!.transport = transport === 'ship' ? 'working-ship' : 'ship'; }, (p: FantasyProfile) => { p.character!.travelPosition!.remainingHours! += 1; }]) {
      const forged = structuredClone(middle); mutate(forged); assert.equal(validFantasyTravel(forged.character!, forged.activity), false);
    }
    const stopped = structuredClone(middle); delete stopped.activity;
    const quote = fantasyTransports(stopped.character!, stopped.character!.travelPosition!.to);
    assert.equal(quote.length, 1); assert.equal(quote[0].id, transport); assert.equal(quote[0].cost, 0);
    const resumed = startFantasyActivity(stopped, { type: 'travel', destination: stopped.character!.travelPosition!.to, transport }, stopped.character!.hour, () => .5);
    assert.equal(resumed.error, undefined); assert.ok(validFantasyTravel(resumed.profile.character!, resumed.profile.activity));
  }
  const p = voyager('hearth'), land = startFantasyActivity(p, { type: 'travel', destination: 'greenwood', transport: 'foot' }, 12, () => .5).profile;
  assert.deepEqual(fantasyTravelPosition(land.activity!, 12), { from: 'hearth', to: 'greenwood', fraction: 0 });
});
