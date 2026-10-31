import { learnFantasyMagicBook } from '../shared/fantasy-magic-discovery.ts';
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { FANTASY_LOCATIONS, FANTASY_JOBS } from '../shared/fantasy-data.ts';
import { FANTASY_READABLE_LIBRARY_BOOKS } from '../shared/fantasy-library.ts';
import { applyFantasyJobPath } from '../shared/fantasy-job-paths.ts';
import { fantasyCombatOrderError, type FantasyCombatState } from '../shared/fantasy-combat.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
import { fantasyEncounterFor } from '../shared/fantasy-encounters.ts';

function person(job = 'warrior', location = 'hearth') {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Boundary traveler', gender: 'female' }, () => .5).profile;
  const c = p.character!; c.level = 12; c.gold = 5000; c.job = job; c.jobXp[job] = 0; c.hour = 8; c.location = location;
  c.visited = [...new Set([...c.visited, location])]; c.charted = FANTASY_LOCATIONS.map(place => place.id); c.inventory.lantern = 1;
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp; return p;
}
function fixture(t: TestContext, profile: FantasyProfile) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-store-boundary-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'profiles.json'); fs.writeFileSync(file, JSON.stringify({ traveler: profile }));
  let hour = 8; const errors: unknown[] = [];
  const make = () => new FantasyStore(file, { combatEnabled: true, worldHour: () => hour, onError: error => errors.push(error) });
  const store = make(); assert.equal(store.loadError, undefined);
  return { store, file, errors, make, hour: (value: number) => { hour = value; } };
}

for (const [transport, destination] of [['gate', 'suncourt'], ['airship', 'greenwood'], ['ship', 'dawnport']] as const) {
  test(`a ${transport} journey saves its halfway position and reloads its paid schedule without requoting`, t => {
    const f = fixture(t, person());
    const started = f.store.apply('traveler', f.store.profile('traveler').revision, { type: 'travel', destination, transport }, () => .5);
    assert.equal(started.error, undefined); assert.ok(started.profile.activity);
    const activity = started.profile.activity!, legIndex = activity.travel!.legs.findIndex(leg => leg.transport === transport); assert.ok(legIndex >= 0);
    const elapsed = activity.travel!.legs.slice(0, legIndex).reduce((sum, leg) => sum + leg.hours, 0) + activity.travel!.legs[legIndex].hours / 2;
    const halfway = activity.startedAt + elapsed, gold = started.profile.character!.gold; f.hour(halfway);
    const updates = f.store.tick(new Set(['traveler'])); assert.ok(updates.length); assert.ok(updates.every(update => !update.error));
    const mid = f.store.profile('traveler'); assert.equal(mid.character!.hour, halfway); assert.ok(mid.activity); assert.equal(mid.character!.gold, gold); assert.ok(mid.character!.travelPosition!.fraction > 0);
    const restored = f.make(); assert.equal(restored.loadError, undefined); assert.deepEqual(restored.profile('traveler'), mid);
    f.hour(activity.endsAt); restored.tick(new Set(['traveler']));
    const arrived = restored.profile('traveler'); assert.equal(arrived.activity, undefined); assert.equal(arrived.character!.location, destination); assert.equal(arrived.character!.gold, gold); assert.deepEqual(f.errors, []);
  });
}

test('a prepared spell breaking a real combat obstacle grows mana and mage practice without synthetic skill XP', t => {
  const p = person('mage', 'greenwood'); learnFantasyMagicBook(p.character!, 'mana-primer'); learnFantasyMagicBook(p.character!, 'stone-and-flame'); p.character!.specialization = { spells: [{ slot: 1, element: 'flame', form: 'bolt' }] };
  p.event = fantasyEncounterFor('forest', 'exploration').id;
  const f = fixture(t, p), before = f.store.profile('traveler').character!;
  const started = f.store.startCombat([{ user: 'traveler', generation: 1, location: 'greenwood', session: 'same', source: 'encounter', target: p.event }], () => .5);
  assert.equal(started.error, undefined);
  let state: FantasyCombatState = started.state!;
  assert.ok(state.battlefield!.obstacles?.length);
  for (let attempt = 0; attempt < 5 && (f.store.profile('traveler').character!.mana?.useXp ?? 0) === (before.mana?.useXp ?? 0); attempt++) {
    const target: { tile: { x: number; y: number } } | undefined = state.battlefield!.obstacles!.find(obstacle => !fantasyCombatOrderError(state, 'traveler', { type: 'break', tile: obstacle.tile, skill: 'prepared-spell-1' })); assert.ok(target);
    const result = f.store.combatOrder('traveler', 'same', state.id, state.revision, { type: 'break', tile: target.tile, skill: 'prepared-spell-1' });
    assert.equal(result.error, undefined, f.errors.map(String).join('\n')); state = result.state!;
  }
  const c = f.store.profile('traveler').character!; assert.ok((c.mana?.useXp ?? 0) > (before.mana?.useXp ?? 0)); assert.ok(c.jobXp.mage > before.jobXp.mage);
  assert.equal(c.skillXp?.['prepared-spell-1'], undefined); assert.ok(c.mp < before.mp);
  assert.equal(f.make().loadError, undefined); assert.deepEqual(f.errors, []);
});

test('pending departure escort defense cannot be opened remotely after stopping on a road', t => {
  const f = fixture(t, person());
  const accepted = f.store.apply('traveler', f.store.profile('traveler').revision, { type: 'escortAccept', destination: 'sunmeadow' }); assert.equal(accepted.error, undefined);
  const contract = accepted.profile.character!.escort!; assert.equal(contract.defense, 'pending');
  const started = f.store.apply('traveler', f.store.profile('traveler').revision, { type: 'travel', destination: 'greenwood', transport: 'foot' }); assert.equal(started.error, undefined);
  f.hour(8.25); f.store.tick(new Set(['traveler']));
  const stopped = f.store.apply('traveler', f.store.profile('traveler').revision, { type: 'cancel' }); assert.equal(stopped.error, undefined); assert.ok(f.store.onRoad('traveler'));
  const before = f.store.profile('traveler'); assert.equal(f.store.startEscortCombat('traveler', 'same', contract.id).error, 'busy');
  assert.equal(f.store.startCombat([{ user: 'traveler', generation: 1, location: 'hearth', session: 'same', source: 'escort', target: contract.id }]).error, 'busy');
  assert.deepEqual(f.store.profile('traveler'), before); assert.equal(f.store.combat('traveler', 'same'), null);
});

test('a learned fractional maritime travel buff saves and reloads, then grants practice only on real journey use', t => {
  const p = person('merchant'), c = p.character!, job = FANTASY_JOBS.find(job => job.id === 'merchant')!;
  c.jobXp.merchant = 1000; c.readBooks = FANTASY_READABLE_LIBRARY_BOOKS.map(book => book.id); c.skillXp = Object.fromEntries(job.skills.map(skill => [skill.id, 30]));
  c.unlockedSkills = job.skills.filter(skill => skill.unlock?.kind === 'mentor').map(skill => skill.id); c.practice = { explore: 10, craft: 10, gather: 10, hunt: 10, fish: 10, command: 10 };
  assert.equal(applyFantasyJobPath(c, 'merchant-maritime').error, undefined);
  const f = fixture(t, p), skill = 'path-merchant-maritime-art', before = f.store.profile('traveler').character!;
  const prepared = f.store.apply('traveler', f.store.profile('traveler').revision, { type: 'skill', skill }); assert.equal(prepared.error, undefined, f.errors.map(String).join('\n'));
  assert.equal(prepared.profile.character!.buff!.power, .5); assert.equal(prepared.profile.character!.skillXp?.[skill], before.skillXp?.[skill]);
  const restored = f.make(); assert.equal(restored.loadError, undefined); assert.equal(restored.profile('traveler').character!.buff!.power, .5);
  const departure = restored.apply('traveler', restored.profile('traveler').revision, { type: 'travel', destination: 'suncourt', transport: 'carriage' }); assert.equal(departure.error, undefined);
  f.hour(departure.profile.activity!.endsAt); restored.tick(new Set(['traveler'])); const used = restored.profile('traveler').character!;
  assert.ok((used.skillXp?.[skill] ?? 0) > (before.skillXp?.[skill] ?? 0)); assert.equal(used.buff, null); assert.equal(f.make().loadError, undefined);
});
