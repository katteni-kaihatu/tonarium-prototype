import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, fantasyStats, fantasyTransports, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { FANTASY_LOCATIONS } from '../shared/fantasy-data.ts';
import { FANTASY_FRONTIER_BASE, FANTASY_FRONTIER_DEPARTURE } from '../shared/fantasy-frontier-data.ts';

function fixture(t: TestContext, location = FANTASY_FRONTIER_BASE) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-frontier-resume-'));
  t.after(() => { const resolved = path.resolve(directory); assert.equal(path.dirname(resolved), path.resolve(os.tmpdir())); assert.ok(path.basename(resolved).startsWith('fantasy-frontier-resume-')); fs.rmSync(resolved, { recursive: true, force: true }); });
  const file = path.join(directory, 'state.json'), p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'Returning explorer' }, () => .5).profile, c = p.character!;
  Object.assign(c, { location, hour: 12, job: 'warrior', level: 20, gold: 10000 }); c.jobXp.warrior = 0;
  c.visited = [...new Set([...c.visited, location])]; c.charted = FANTASY_LOCATIONS.map(place => place.id); c.inventory.lantern = 1;
  c.expedition = { route: 'guild', issuedAt: 8 }; c.guildProgress = { version: 1, grade: 4, completedAtGrade: 0, creditedQuests: [] };
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp; fs.writeFileSync(file, JSON.stringify({ traveler: p }));
  let hour = 12, ambush = true;
  const errors: unknown[] = [], make = () => new FantasyStore(file, { combatEnabled: true, ambush, worldHour: () => hour, onError: error => errors.push(error) });
  const store = make(); assert.equal(store.loadError, undefined);
  return { store, make, file, errors, hour: (value: number) => { hour = value; }, ambush: (value: boolean) => { ambush = value; } };
}

test('a real seed39 return ambush saves, escapes, reloads and resumes without charging the ship fare twice', t => {
  const f = fixture(t), from = f.store.profile('traveler'), quote = fantasyTransports(from.character!, FANTASY_FRONTIER_DEPARTURE).find(quote => quote.id === 'ship')!;
  const start = f.store.apply('traveler', from.revision, { type: 'travel', destination: FANTASY_FRONTIER_DEPARTURE, transport: 'ship' }, () => (39 + .5) / 4294967296);
  assert.equal(start.error, undefined); const paidGold = start.profile.character!.gold; assert.equal(paidGold, from.character!.gold - quote.cost);
  f.hour(12 + 1 / 12); f.store.tick(new Set(['traveler']));
  const halted = f.store.profile('traveler'); assert.equal(halted.activity, undefined); assert.equal(halted.event, 'encounter-reef-beast'); assert.equal(halted.character!.travelPosition!.transport, 'ship');
  const restored = f.make(); assert.equal(restored.loadError, undefined); assert.deepEqual(restored.profile('traveler'), halted);
  const escape = restored.apply('traveler', halted.revision, { type: 'event', choice: 'escape' }, () => .999); assert.equal(escape.error, undefined);
  f.hour(escape.profile.activity!.endsAt); restored.tick(new Set(['traveler'])); const escaped = restored.profile('traveler'); assert.equal(escaped.event, null);
  f.ambush(false); const ready = f.make(); assert.equal(ready.loadError, undefined);
  const current = ready.profile('traveler'), remaining = current.character!.travelPosition!.remainingHours!;
  const resume = ready.apply('traveler', current.revision, { type: 'travel', destination: FANTASY_FRONTIER_DEPARTURE, transport: 'ship' }, () => .5);
  assert.equal(resume.error, undefined); assert.equal(resume.profile.character!.gold, paidGold);
  assert.ok(Math.abs(resume.profile.activity!.endsAt - resume.profile.activity!.startedAt - remaining) < 1e-8);
  const sailing = f.make(); assert.equal(sailing.loadError, undefined); assert.deepEqual(sailing.profile('traveler'), resume.profile);
  f.hour(resume.profile.activity!.endsAt); sailing.tick(new Set(['traveler']));
  const arrived = sailing.profile('traveler'); assert.equal(arrived.activity, undefined); assert.equal(arrived.character!.location, FANTASY_FRONTIER_DEPARTURE);
  assert.equal(arrived.character!.travelPosition, undefined); assert.equal(arrived.character!.gold, paidGold); assert.deepEqual(f.errors, []);
});

test('legacy stored sea positions resume with a free ship remainder and gain authoritative metadata', t => {
  const f = fixture(t), p = f.store.profile('traveler');
  p.character!.travelPosition = { from: FANTASY_FRONTIER_BASE, to: FANTASY_FRONTIER_DEPARTURE, fraction: .5 };
  fs.writeFileSync(f.file, JSON.stringify({ traveler: p })); f.ambush(false);
  const store = f.make(); assert.equal(store.loadError, undefined);
  const before = store.profile('traveler'), result = store.apply('traveler', before.revision, { type: 'travel', destination: FANTASY_FRONTIER_DEPARTURE, transport: 'ship' }, () => .5);
  assert.equal(result.error, undefined); assert.equal(result.profile.character!.gold, before.character!.gold); assert.equal(result.profile.character!.travelPosition!.transport, 'ship');
  assert.equal(f.make().loadError, undefined);
});

for (const [transport, destination] of [['airship', 'greenwood'], ['gate', 'suncourt']] as const) test(`an interrupted ${transport} continuation keeps its partial paid schedule through a real store save`, t => {
  const f = fixture(t, 'hearth'); f.ambush(false); const store = f.make();
  const initial = store.profile('traveler'), start = store.apply('traveler', initial.revision, { type: 'travel', destination, transport }, () => .5);
  assert.equal(start.error, undefined); f.hour(12 + (start.profile.activity!.endsAt - 12) / 2); store.tick(new Set(['traveler']));
  const p = store.profile('traveler'); delete p.activity; fs.writeFileSync(f.file, JSON.stringify({ traveler: p }));
  const paused = f.make(); assert.equal(paused.loadError, undefined);
  const before = paused.profile('traveler'), resumed = paused.apply('traveler', before.revision, { type: 'travel', destination, transport }, () => .5);
  assert.equal(resumed.error, undefined); assert.equal(resumed.profile.character!.gold, start.profile.character!.gold);
  assert.ok(resumed.profile.activity!.endsAt - resumed.profile.activity!.startedAt < start.profile.activity!.endsAt - 12);
  assert.equal(f.make().loadError, undefined);
});
