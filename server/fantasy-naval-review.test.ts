import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore, type FantasyCombatPlan } from './fantasy-store.ts';
import { applyFantasyAction, advanceFantasyWorld, fantasyStats, newFantasyProfile, startFantasyActivity } from '../shared/fantasy-engine.ts';
import { fantasyCombatPlayer } from './fantasy-combat-adapter.ts';
import { fantasyRegularEncounterTier } from '../shared/fantasy-adventurer.ts';
import { fantasyCombatStartPlan } from '../shared/fantasy-combat-challenges.ts';
import { validFantasyCombatState } from '../shared/fantasy-combat.ts';
import { FANTASY_NAVAL_HARPOON } from '../shared/fantasy-naval.ts';
import { FANTASY_LOCATIONS } from '../shared/fantasy-data.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';

function traveler(name = 'Naval voyager', location = 'tidehaven'): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name, gender: 'female' }, () => .5).profile, c = p.character!;
  Object.assign(c, { location, hour: 12, level: 80, job: 'warrior', gold: 10000, birthBonuses: {}, fatigue: 0, hunger: 0, foodLots: [],
    inventory: { lantern: 1, 'oak-bow': 1 }, equipment: { weapon: 'oak-bow' }, equippedGear: {}, gear: [], outfit: undefined });
  c.visited = [...new Set(['hearth', location])]; c.charted = FANTASY_LOCATIONS.map(place => place.id); c.jobXp.warrior = 0;
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  const actor = fantasyCombatPlayer(p, 'a'); c.encounterTier = fantasyRegularEncounterTier(actor.stats, actor);
  return p;
}
function voyage(mode: 'ship' | 'working-ship' = 'ship') {
  const p = traveler();
  const started = startFantasyActivity(p, { type: 'travel', destination: 'verdant-quay', transport: mode }, 12, () => 39.5 / 4294967296);
  assert.equal(started.error, undefined); assert.ok(started.profile.activity);
  const stopped = advanceFantasyWorld(started.profile, started.profile.activity.endsAt, { ambush: true }).profile;
  assert.ok(stopped.event); assert.equal(stopped.activity, undefined); assert.equal(stopped.character!.travelPosition!.transport, mode);
  for (let index = 0; index < 100; index++) {
    stopped.character!.name = `Naval voyager ${index}`;
    if (fantasyCombatStartPlan(stopped, 'encounter', stopped.event!)?.enemies[0].template === 'monster-juvenile-kraken') {
      return { profile: stopped, paidGold: started.profile.character!.gold, originalGold: p.character!.gold, originalJourney: started.profile.activity };
    }
  }
  assert.fail('A tier-six naval encounter must offer a juvenile kraken for a deterministic voyage fixture');
}
function fixture(t: TestContext, profiles: Record<string, FantasyProfile>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-naval-store-'));
  t.after(() => { const target = path.resolve(dir); assert.equal(path.dirname(target), path.resolve(os.tmpdir())); assert.ok(path.basename(target).startsWith('fantasy-naval-store-')); fs.rmSync(target, { recursive: true, force: true }); });
  const file = path.join(dir, 'fantasy.json'); fs.writeFileSync(file, JSON.stringify(profiles));
  let hour = Math.max(...Object.values(profiles).map(profile => profile.character!.hour)), fail = false;
  const options = { combatEnabled: true, ambush: false, worldHour: () => hour, onError: () => {}, save: (target: string, text: string) => { if (fail) throw Error('Naval save failed'); fs.writeFileSync(target, text); } };
  let store = new FantasyStore(file, options); assert.equal(store.loadError, undefined);
  const plan = (user = 'a', source: FantasyCombatPlan['source'] = 'encounter', target = store.profile(user).event!): FantasyCombatPlan => ({ user, source, target, session: 'ship-session', generation: store.profile(user).generation ?? 1, location: store.profile(user).character!.location });
  return { get store() { return store; }, plan, file, fail: (value: boolean) => { fail = value; }, time: (value: number) => { hour = value; },
    reload: () => { store = new FantasyStore(file, options); assert.equal(store.loadError, undefined); } };
}
function start(f: ReturnType<typeof fixture>) {
  const result = f.store.startCombat([f.plan()], () => .5);
  assert.equal(result.error, undefined); assert.ok(result.state!.naval);
  assert.equal(result.state!.fighters.find(fighter => fighter.side === 'enemies')!.template, 'monster-juvenile-kraken');
  assert.equal(validFantasyCombatState(result.state), true);
  return result.state!;
}
test('a crew member escaping an active party naval battle clears their own encounter', t => {
  const a = voyage().profile, b = structuredClone(a); b.character!.name = 'Remaining crew'; b.event = null;
  const f = fixture(t, { a, b }); let state = start(f);
  const joined = f.store.joinCombat('b', 'ship-session', state.id); assert.equal(joined.error, undefined); state = joined.state!;
  for (let n = 0; n < 16 && !state.fighters.find(f => f.userId === 'a')!.fled; n++) {
    let result = f.store.combatOrder('a', 'ship-session', state.id, state.revision, { type: 'escape' }); assert.equal(result.error, undefined); state = result.state!;
    result = f.store.combatOrder('b', 'ship-session', state.id, state.revision, { type: 'guard' }); assert.equal(result.error, undefined); state = result.state!;
  }
  assert.equal(state.status, 'active'); assert.equal(state.fighters.find(f => f.userId === 'a')!.fled, true);
  assert.equal(f.store.profile('a').combatId, undefined);
  assert.equal(f.store.profile('a').event, null);
  const escaped = f.store.profile('a'), position = escaped.character!.travelPosition!, gold = escaped.character!.gold;
  const resumed = f.store.apply('a', escaped.revision, { type: 'travel', destination: position.to, transport: position.transport! }, () => .5);
  assert.equal(resumed.error, undefined); assert.equal(resumed.profile.character!.gold, gold);
  assert.equal(resumed.profile.activity!.travel!.legs[0].startFraction, position.fraction);
  assert.equal(f.store.profile('b').combatId, state.id);
});

test('late joins anchor to the remaining active crew after a fled member sails onward', t => {
  const a = voyage().profile, b = structuredClone(a), c = structuredClone(a); b.character!.name = 'Remaining crew'; b.event = null; c.character!.name = 'Reinforcement'; c.event = null;
  const f = fixture(t, { a, b, c }); let state = start(f);
  const joined = f.store.joinCombat('b', 'ship-session', state.id); assert.equal(joined.error, undefined); state = joined.state!;
  for (let n = 0; n < 16 && !state.fighters.find(f => f.userId === 'a')!.fled; n++) {
    let result = f.store.combatOrder('a', 'ship-session', state.id, state.revision, { type: 'escape' }); assert.equal(result.error, undefined); state = result.state!;
    result = f.store.combatOrder('b', 'ship-session', state.id, state.revision, { type: 'guard' }); assert.equal(result.error, undefined); state = result.state!;
  }
  assert.equal(state.fighters.find(f => f.userId === 'a')!.fled, true); assert.equal(state.status, 'active');
  const escaped = f.store.profile('a'), position = escaped.character!.travelPosition!;
  const resumed = startFantasyActivity(escaped, { type: 'travel', destination: position.to, transport: position.transport! }, escaped.character!.hour, () => .5);
  assert.equal(resumed.error, undefined);
  const moved = advanceFantasyWorld(resumed.profile, resumed.profile.activity!.startedAt + .05, { ambush: false }).profile;
  assert.ok(moved.character!.travelPosition!.fraction > position.fraction);
  f.time(moved.character!.hour);
  const saved = JSON.parse(fs.readFileSync(f.file, 'utf8')); saved.profiles.a = moved; fs.writeFileSync(f.file, JSON.stringify(saved)); f.reload();
  const reinforcement = f.store.joinCombat('c', 'ship-session', state.id);
  assert.equal(reinforcement.error, undefined); assert.ok(reinforcement.state!.fighters.some(f => f.userId === 'c'));
});
