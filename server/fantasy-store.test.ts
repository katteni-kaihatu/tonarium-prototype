import { markFantasyPlatformDataCurrent } from './fantasy-platform-reset.ts';
import { readFantasySavedProfiles } from './fantasy-test-saved-profiles.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { FantasyStore, handleFantasyAction, isFantasyAction } from './fantasy-store.ts';
import { COMPAT_VERSION, isRoomClientMsg } from '../shared/protocol.ts';
import { FANTASY_EVENTS, FANTASY_ITEMS, FANTASY_JOBS, FANTASY_QUESTS, FANTASY_RACES } from '../shared/fantasy-data.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import type { FantasyProfile, FantasyWorldClock } from '../shared/fantasy.ts';
import { FANTASY_FOOD_META } from '../shared/fantasy-life.ts';
import { FANTASY_MAPS } from '../shared/fantasy-town.ts';
import { FantasyClock } from './fantasy-clock.ts';
import { fantasyEventEligible, fantasyQuestEligible } from '../shared/fantasy-access.ts';
import type { FantasyGmReply } from '../shared/fantasy-gm.ts';
import type { FantasyCommunityState } from '../shared/fantasy-community.ts';
import { testServerEnv } from './test-db.ts';

test('expanded optional mana, equipment, effects, reputation and mentor state persist without resetting legacy progress', t => {
  const { file } = temporary(t);
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Veteran', gender: 'female' }, () => .999).profile;
  const c = profile.character!;
  c.inventory.blade = 1; c.equipment = { weapon: 'blade' };
  c.mana = { stage: 2, mastery: 6, strain: 25, affinity: 'balanced' };
  c.learnedSkills = ['mentor-parry']; c.permanentBonuses = { strength: 2, hp: 10 };
  c.effects = [{ id: 'poison', expiresAt: c.hour + 6, periodicHp: -2, check: -1 }];
  c.reputation = { lands: { aurelia: 3 }, regions: { hearth: 7 }, towns: { hearth: 9 } };
  c.bargains = { food: { location: 'hearth', discount: .1, expiresAt: c.hour + 8, nextAt: c.hour + 4 } };
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ veteran: profile }));
  const store = new FantasyStore(file);
  assert.equal(store.loadError, undefined);
  assert.deepEqual(store.profile('veteran'), profile);
});

test('forged expansion fields never get silently accepted or replace existing saves', t => {
  const { file } = temporary(t);
  const base = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Safe', gender: 'female' }, () => .999).profile;
  const patches: object[] = [
    { mana: { stage: 5, mastery: 0, strain: 0, affinity: 'balanced' } }, { mana: { stage: 1, mastery: 6, strain: 0, affinity: 'balanced' } },
    { equipment: { weapon: 'blade' } }, { learnedSkills: ['mana-ward'] }, { learnedSkills: ['mentor-parry', 'mentor-parry'] },
    { permanentBonuses: { strength: 4 } }, { effects: [{ id: 'poison', expiresAt: 10, periodicHp: -999 }] },
    { reputation: { lands: { invented: 5 }, regions: {}, towns: {} } }, { bargains: { goods: { location: 'hearth', discount: .9, expiresAt: 15, nextAt: 12 } } },
  ];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const patch of patches) {
    const broken = structuredClone(base); Object.assign(broken.character!, patch);
    const original = JSON.stringify({ safe: broken }); fs.writeFileSync(file, original);
    const store = new FantasyStore(file, { onError: () => {} });
    assert.ok(store.loadError, JSON.stringify(patch));
    assert.equal(store.apply('safe', 0, { type: 'draw' }).changed, false);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
  }
});

test('expired legitimate max-resource effects are pruned and clamped once during migration', t => {
  const { file } = temporary(t);
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Restored', gender: 'male' }, () => .999).profile;
  const item = FANTASY_ITEMS.find(item => (item.use?.effect?.stats?.vitality ?? 0) > 0)!;
  const c = profile.character!; const { hours: _, ...effect } = item.use!.effect!;
  c.effects = [{ ...effect, expiresAt: c.hour }];
  c.hp = fantasyStats({ ...c, effects: [{ ...effect, expiresAt: c.hour + 1 }] }).hp;
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ restored: profile }));
  const loaded = new FantasyStore(file);
  assert.equal(loaded.loadError, undefined);
  assert.deepEqual(loaded.profile('restored').character!.effects, []);
  assert.equal(loaded.profile('restored').character!.hp, fantasyStats(loaded.profile('restored').character!).hp);
  assert.deepEqual(new FantasyStore(file).profile('restored'), loaded.profile('restored'));
});

test('new action payloads validate exact operator fields and reject supplied rewards or invented slots', () => {
  for (const action of [{ type: 'manaTrain', exercise: 'sense' }, { type: 'learn', skill: 'mentor-parry', npcId: 'hearth-galen' }, { type: 'equip', item: 'blade' }, { type: 'unequip', slot: 'offhand' }, { type: 'unequip', slot: 'head' }, { type: 'equip', item: 'ruby-ring', slot: 'ring2' }, { type: 'haggle', service: 'food' }]) assert.ok(isFantasyAction(action));
  for (const action of [{ type: 'manaTrain', exercise: 'grant' }, { type: 'manaTrain', exercise: 'sense', mastery: 20 }, { type: 'learn', skill: 'mentor-focus', npcId: {} }, { type: 'equip', item: 'blade', stats: {} }, { type: 'unequip', slot: 'invented-slot' }, { type: 'haggle', service: 'all', discount: 1 }]) assert.equal(isFantasyAction(action), false);
});

test('effective MP use grows mana only after the reserved action completes and survives restart once', t => {
  const { file } = temporary(t); let hour = 8;
  let store = new FantasyStore(file, { worldHour: () => hour });
  const created = store.apply('mana-student', 0, { type: 'create', source: 'human', name: 'Student', gender: 'female' }, () => .999);
  const retired = store.apply('mana-student', created.profile.revision, { type: 'manaTrain', exercise: 'sense' });
  assert.ok(retired.error); assert.equal(retired.changed, false);
  const prepared = store.apply('mana-student', created.profile.revision, { type: 'skill', skill: 'human-ingenuity' });
  assert.equal(prepared.error, undefined);
  const before = prepared.profile.character!;
  const started = store.apply('mana-student', prepared.profile.revision, { type: 'explore' }, () => 1 / 4294967296);
  assert.equal(started.error, undefined);
  assert.equal(started.profile.activity!.endsAt, 11);
  assert.equal(started.profile.character!.mana!.useXp, undefined);
  assert.equal(started.profile.character!.mp, before.mp);
  hour = 8.5; store = new FantasyStore(file, { worldHour: () => hour });
  assert.equal(store.synchronize('mana-student').profile.character!.mana!.useXp, undefined);
  hour = 11;
  const completed = store.synchronize('mana-student');
  assert.equal(completed.error, undefined);
  assert.equal(completed.profile.activity, undefined);
  assert.equal(completed.profile.character!.mana!.useXp, 6);
  assert.ok(completed.profile.character!.skillXp!['human-ingenuity'] > 0);
  const once = new FantasyStore(file, { worldHour: () => hour }).synchronize('mana-student').profile;
  assert.deepEqual(once, completed.profile);
});

function temporary(t: { after: (fn: () => void) => void }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-fantasy-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, file: path.join(directory, 'data', 'fantasy.json') };
}

test('creation always starts unassigned and profession acquisition is validated by route', (t) => {
  const { file } = temporary(t);
  const store = new FantasyStore(file);
  assert.ok(isFantasyAction({ type: 'create', name: 'Learner', gender: 'male', source: 'human' }));
  const created = store.apply('learner', 0, { type: 'create', name: 'Learner', gender: 'male', source: 'human', job: 'assassin' });
  assert.equal(created.error, undefined);
  assert.equal(created.profile.character!.job, 'unassigned');
  assert.equal(store.apply('unknown', 0, { type: 'create', name: 'X', gender: 'male', source: 'human', job: 'invented-job' }).changed, false);
  const invalidGuild = store.apply('learner', created.profile.revision, { type: 'job', job: 'assassin', via: 'guild' });
  assert.equal(invalidGuild.changed, false);
  const invalidNpc = store.apply('learner', created.profile.revision, { type: 'job', job: 'assassin', via: 'npc', npcId: 'rin' });
  assert.equal(invalidNpc.changed, false);
  const learned = store.apply('learner', created.profile.revision, { type: 'job', job: 'cook', via: 'npc', npcId: 'rin' });
  assert.equal(learned.error, undefined);
  assert.equal(learned.profile.character!.job, 'unassigned');
  assert.equal(learned.profile.character!.lifeJob, 'cook');
  const gm = store.apply('learner', learned.profile.revision, { type: 'job', job: 'assassin', via: 'gm' });
  assert.equal(gm.error, undefined);
  assert.equal(new FantasyStore(file).profile('learner').character!.job, 'assassin');
  assert.equal(new FantasyStore(file).profile('learner').character!.lifeJob, 'cook');
  for (const action of [{ type: 'job', job: 'cook', via: 'hack' }, { type: 'job', job: 'cook', npcId: {} }, { type: 'job', job: 'cook', via: ['gm'] }, { type: 'job', job: 'cook', character: {} }]) assert.equal(isFantasyAction(action), false);
});

test('two users share one clock and a reserved action never jumps time or grants its outcome early', t => {
  const { directory, file } = temporary(t);
  let now = 1_000_000;
  const clock = new FantasyClock(path.join(directory, 'world-clock.json'), { now: () => now });
  const store = new FantasyStore(file, { now: () => now, worldHour: () => clock.snapshot().hour });
  for (const user of ['alice', 'bob']) assert.equal(store.apply(user, 0, { type: 'create', name: user, gender: 'female', source: 'human' }).error, undefined);
  const alice = store.profile('alice');
  const reserved = store.apply('alice', alice.revision, { type: 'job', job: 'cook', via: 'gm' }, () => 0.7);
  assert.equal(reserved.error, undefined);
  assert.deepEqual(reserved.profile.activity?.action, { type: 'job', job: 'cook', via: 'gm' });
  assert.equal(reserved.profile.activity?.startedAt, 8);
  assert.equal(reserved.profile.activity?.endsAt, 9);
  assert.equal(reserved.profile.character!.job, 'unassigned');
  assert.equal(reserved.profile.character!.hour, 8);
  assert.equal(store.profile('bob').character!.hour, 8);
  assert.equal(clock.snapshot().hour, 8);
  assert.equal(store.apply('alice', reserved.profile.revision, { type: 'work' }).changed, false);
  assert.equal(isFantasyAction({ type: 'clock', rate: 999 }), false);
  assert.equal(isFantasyAction({ type: 'work', rate: 999, endsAt: 8 }), false);
  store.tick(new Set(['alice', 'bob']));
  now += 60_000;
  store.tick(new Set(['alice', 'bob']));
  assert.equal(store.profile('alice').character!.job, 'unassigned');
  assert.equal(store.profile('alice').character!.hour, 8.5);
  assert.equal(store.profile('bob').character!.hour, 8.5);
  now += 60_000;
  const finished = store.tick(new Set(['alice', 'bob']));
  assert.ok(finished.some(update => update.user === 'alice'));
  assert.equal(store.profile('alice').character!.job, 'unassigned');
  assert.equal(store.profile('alice').character!.lifeJob, 'cook');
  assert.equal(store.profile('alice').activity, undefined);
  assert.equal(store.profile('alice').character!.hour, 9);
  assert.equal(store.profile('bob').character!.hour, 9);
  const revision = store.profile('alice').revision;
  store.tick(new Set(['alice', 'bob']));
  assert.equal(store.profile('alice').revision, revision);
});

test('pending work survives restart, completes once while offline, and stale revisions cannot execute it twice', t => {
  const { file } = temporary(t);
  let hour = 8;
  let now = 0;
  const options = { worldHour: () => hour, now: () => now };
  let store = new FantasyStore(file, options);
  const created = store.apply('alice', 0, { type: 'create', name: 'Alice', gender: 'female', source: 'human' });
  const pending = store.apply('alice', created.profile.revision, { type: 'work' }, () => 0.7);
  assert.equal(pending.error, undefined);
  assert.equal(pending.profile.character!.gold, created.profile.character!.gold);
  const seed = pending.profile.activity!.seed;
  store = new FantasyStore(file, options);
  assert.equal(store.loadError, undefined);
  assert.equal(store.profile('alice').activity!.seed, seed);
  hour = 12; now = 10_000;
  const stale = store.apply('alice', pending.profile.revision, { type: 'work' });
  assert.ok(stale.error);
  assert.equal(stale.profile.activity, undefined);
  assert.equal(stale.profile.revision, pending.profile.revision + 16);
  const gold = stale.profile.character!.gold;
  store = new FantasyStore(file, options);
  assert.equal(store.profile('alice').character!.gold, gold);
  assert.equal(store.tick(new Set()).length, 0);
  assert.equal(store.apply('alice', -99, { type: 'sync' }).profile.revision, stale.profile.revision);
});

test('offline idle needs pause while shared food age advances, and new arrivals start at the shared time', t => {
  const { file } = temporary(t);
  let hour = 100;
  const store = new FantasyStore(file, { worldHour: () => hour });
  const created = store.apply('alice', 0, { type: 'create', name: 'Alice', gender: 'female', source: 'human' });
  assert.equal(created.profile.character!.hour, 100);
  assert.equal(created.profile.character!.foodLots[0].createdAt, 100);
  const before = created.profile.character!;
  hour = 200;
  const synchronized = store.synchronize('alice');
  assert.equal(synchronized.profile.character!.hour, 200);
  assert.equal(synchronized.profile.character!.foodLots[0].createdAt, 100);
  assert.equal(synchronized.profile.character!.hunger, before.hunger);
  assert.equal(synchronized.profile.character!.fatigue, before.fatigue);
  assert.equal(synchronized.profile.character!.hp, before.hp);
  assert.equal(synchronized.profile.revision, created.profile.revision);
  store.tick(new Set(['alice']));
  hour = 201;
  store.tick(new Set(['alice']));
  assert.equal(store.profile('alice').character!.hunger, before.hunger + 2);
  assert.equal(store.profile('alice').character!.fatigue, before.fatigue + 1);
  store.tick(new Set());
  hour = 500;
  store.synchronize('alice');
  assert.equal(store.profile('alice').character!.hunger, before.hunger + 2);
});

test('failed reservation and completion saves leave original progress and deterministic retries intact', t => {
  const { file } = temporary(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let hour = 8;
  let fail = false;
  const store = new FantasyStore(file, { worldHour: () => hour, onError: () => {}, save: (target, text) => {
    if (fail) throw new Error('disk full');
    fs.writeFileSync(target, text);
  } });
  const created = store.apply('alice', 0, { type: 'create', name: 'Alice', gender: 'male', source: 'human' });
  fail = true;
  assert.ok(store.apply('alice', created.profile.revision, { type: 'work' }, () => 0.7).error);
  assert.deepEqual(store.profile('alice'), created.profile);
  fail = false;
  const pending = store.apply('alice', created.profile.revision, { type: 'work' }, () => 0.7);
  hour = 12; fail = true;
  assert.ok(store.synchronize('alice').error);
  assert.deepEqual(store.profile('alice'), pending.profile);
  fail = false;
  const completed = store.synchronize('alice');
  assert.equal(completed.error, undefined);
  assert.equal(completed.profile.revision, pending.profile.revision + 16);
  assert.equal(completed.profile.activity, undefined);
  assert.deepEqual(new FantasyStore(file).profile('alice'), completed.profile);
});

test('malformed reserved activities are rejected without resetting or replacing the saved character', t => {
  const { file } = temporary(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let hour = 8;
  const store = new FantasyStore(file, { worldHour: () => hour });
  const created = store.apply('alice', 0, { type: 'create', name: 'Alice', gender: 'male', source: 'human' });
  const valid = store.apply('alice', created.profile.revision, { type: 'work' }, () => 0.7).profile;
  for (const change of [
    (p: FantasyProfile) => { p.activity!.seed = -1; },
    (p: FantasyProfile) => { p.activity!.seed = 2 ** 32; },
    (p: FantasyProfile) => { p.activity!.endsAt = 7; },
    (p: FantasyProfile) => { p.activity!.startedAt = 9; },
    (p: FantasyProfile) => { p.activity!.action = { type: 'create', name: 'X', source: 'human', gender: 'male' }; },
    (p: FantasyProfile) => { p.activity!.action = { type: 'job', job: 'made-up', via: 'gm' }; },
    (p: FantasyProfile) => { p.activity!.action = { type: 'travel', destination: 'made-up', transport: 'foot' }; },
  ]) {
    const broken = structuredClone(valid); change(broken);
    const text = JSON.stringify({ alice: broken }); fs.writeFileSync(file, text);
    const restored = new FantasyStore(file, { onError: () => {} });
    assert.ok(restored.loadError);
    assert.equal(restored.apply('alice', 0, { type: 'draw' }).changed, false);
    assert.equal(fs.readFileSync(file, 'utf8'), text);
  }
});

test('removed titan characters and kept drafts migrate to human without losing progress or draw attempts', t => {
  const { file } = temporary(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const legacy = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Old traveler', gender: 'female', source: 'human' }).profile;
  delete legacy.character!.birthBonuses;
  legacy.revision = 13;
  legacy.draft = { remaining: 2, candidate: 'titan', kept: 'titan' };
  legacy.character!.race = 'titan';
  legacy.character!.hp = 248;
  legacy.character!.mp = 21;
  legacy.character!.gold = 500;
  legacy.character!.quests = ['quest-herbalist'];
  const draft = newFantasyProfile(); draft.draft = { remaining: 0, candidate: 'titan', kept: 'elf' };
  fs.writeFileSync(file, JSON.stringify({ traveler: legacy, draft }));
  let writes = 0;
  const save = (target: string, text: string) => { writes++; fs.writeFileSync(target, text); };
  const store = new FantasyStore(file, { save });
  assert.equal(store.loadError, undefined);
  const migrated = store.profile('traveler');
  assert.equal(migrated.character!.race, 'human');
  assert.equal(migrated.character!.gender, 'female');
  assert.equal(migrated.character!.hp, 100);
  assert.equal(migrated.character!.mp, 21);
  assert.equal(migrated.character!.gold, 500);
  assert.deepEqual(migrated.character!.inventory, legacy.character!.inventory);
  assert.deepEqual(migrated.character!.quests, legacy.character!.quests);
  assert.deepEqual(migrated.log, legacy.log);
  assert.equal(migrated.revision, 13);
  assert.deepEqual(migrated.draft, { remaining: 2, candidate: 'human', kept: 'human' });
  assert.deepEqual(store.profile('draft').draft, { remaining: 0, candidate: 'human', kept: 'elf' });
  assert.equal(writes, 1);
  assert.deepEqual(new FantasyStore(file, { save }).profile('traveler'), migrated);
  assert.equal(writes, 1);
});

test('titan migration preserves corrupt-save refusal and failed saves keep the original file', t => {
  const { file } = temporary(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const legacy = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Old traveler', gender: 'male', source: 'human' }).profile;
  delete legacy.character!.birthBonuses;
  legacy.character!.race = 'titan'; legacy.character!.hp = 248; legacy.character!.mp = 21;
  const original = JSON.stringify({ traveler: legacy }); fs.writeFileSync(file, original);
  const failed = new FantasyStore(file, { onError: () => {}, save: () => { throw new Error('disk full'); } });
  assert.ok(failed.loadError);
  assert.equal(failed.profile('traveler').character!.name, 'Old traveler');
  assert.equal(failed.profile('traveler').draft.remaining, 5);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  for (const field of ['hp', 'mp'] as const) {
    const corrupt = structuredClone(legacy); corrupt.character![field]++;
    const text = JSON.stringify({ traveler: corrupt }); fs.writeFileSync(file, text);
    assert.ok(new FantasyStore(file, { onError: () => {} }).loadError);
    assert.equal(fs.readFileSync(file, 'utf8'), text);
  }
});

test('a jobless racial event reloads for its eligible race while foreign lineage events and quests stay blocked', t => {
  const { file } = temporary(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const event = FANTASY_EVENTS.find(event => !event.job && event.races?.length)!;
  assert.ok(event);
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Traveler', gender: 'female', source: 'human' }).profile;
  const character = profile.character!;
  character.location = event.locations?.[0] ?? 'hearth';
  character.visited = [...new Set(['hearth', character.location])];
  const race = FANTASY_RACES.find(race => fantasyEventEligible({ ...character, race: race.id }, event))!;
  character.race = race.id; character.gender = race.gender ?? 'female';
  character.hp = fantasyStats(character).hp; character.mp = fantasyStats(character).mp;
  profile.event = event.id;
  fs.writeFileSync(file, JSON.stringify({ traveler: profile }));
  const store = new FantasyStore(file);
  assert.equal(store.loadError, undefined);
  assert.equal(store.profile('traveler').event, event.id);
  assert.equal(store.profile('traveler').character!.job, 'unassigned');
  assert.equal(store.apply('traveler', profile.revision, { type: 'event', choice: event.choices[0].id }, () => 0.9).error, undefined);
  const otherRace = FANTASY_RACES.find(candidate => !fantasyEventEligible({ ...character, race: candidate.id }, event))!;
  const corrupt = structuredClone(profile);
  corrupt.character!.race = otherRace.id; corrupt.character!.gender = otherRace.gender ?? 'female';
  corrupt.character!.hp = fantasyStats(corrupt.character!).hp; corrupt.character!.mp = fantasyStats(corrupt.character!).mp;
  let text = JSON.stringify({ traveler: corrupt }); fs.writeFileSync(file, text);
  assert.ok(new FantasyStore(file, { onError: () => {} }).loadError);
  assert.equal(fs.readFileSync(file, 'utf8'), text);
  const human = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Human', gender: 'male', source: 'human' }).profile;
  const quest = FANTASY_QUESTS.find(quest => (quest.races?.length || quest.families?.length) && !fantasyQuestEligible(human.character!, quest))!;
  assert.ok(quest);
  for (const field of ['quests', 'completed'] as const) {
    const invalid = structuredClone(human); invalid.character![field] = [quest.id];
    text = JSON.stringify({ traveler: invalid }); fs.writeFileSync(file, text);
    assert.ok(new FantasyStore(file, { onError: () => {} }).loadError);
    assert.equal(fs.readFileSync(file, 'utf8'), text);
  }
});

test('new profiles leave character creation to the player; action routing uses the home WebSocket', (t) => {
  const { file } = temporary(t);
  const store = new FantasyStore(file);
  const fresh = store.profile('alice');
  assert.equal(fresh.character, null);
  assert.equal(fresh.draft.remaining, 5);
  assert.equal(fs.existsSync(file), false);
  assert.equal(isRoomClientMsg({ t: 'fantasyAction', revision: 0, action: { type: 'draw' } }), false);
  fresh.draft.remaining = 0;
  assert.equal(store.profile('alice').draft.remaining, 5);
});

test('draws are stored atomically and keep their result after reconnect and restart', (t) => {
  const { directory, file } = temporary(t);
  const store = new FantasyStore(file);
  const drawn = store.apply('alice', 0, { type: 'draw' }, () => 0.3);
  assert.equal(drawn.error, undefined);
  assert.equal(drawn.changed, true);
  assert.equal(drawn.profile.revision, 1);
  assert.equal(drawn.profile.draft.remaining, 4);
  assert.ok(drawn.profile.draft.candidate);
  assert.deepEqual(new FantasyStore(file).profile('alice'), drawn.profile);
  assert.deepEqual(store.apply('alice', -100, { type: 'sync' }).profile, drawn.profile);
  assert.deepEqual(fs.readdirSync(path.join(directory, 'data')), ['fantasy.json']);
  drawn.profile.draft.remaining = 5;
  assert.equal(store.profile('alice').draft.remaining, 4);
});

test('stale and invalid revisions cannot consume a draw or advance the random generator', (t) => {
  const { file } = temporary(t);
  const store = new FantasyStore(file);
  const first = store.apply('alice', 0, { type: 'draw' }, () => 0.2);
  let draws = 0;
  for (const revision of [0, -1, 1.5, '1', NaN, null]) {
    const stale = store.apply('alice', revision, { type: 'draw' }, () => { draws++; return 0.5; });
    assert.equal(stale.changed, false);
    assert.ok(stale.error);
    assert.deepEqual(stale.profile, first.profile);
  }
  assert.equal(draws, 0);
});

test('created characters, inventory, time and logs survive a full store restart', (t) => {
  const { file } = temporary(t);
  const store = new FantasyStore(file);
  const created = store.apply('alice', 0, { type: 'create', name: '旅人', gender: 'female', source: 'human', job: FANTASY_JOBS[0].id });
  assert.equal(created.error, undefined);
  assert.equal(created.profile.character?.race, 'human');
  const rested = store.apply('alice', created.profile.revision, { type: 'rest' });
  assert.equal(rested.error, undefined);
  assert.equal(rested.profile.character?.hour, 16);
  assert.ok(rested.profile.log.length >= 2);
  const restored = new FantasyStore(file);
  assert.equal(restored.loadError, undefined);
  assert.deepEqual(restored.profile('alice'), rested.profile);
});

test('the five draw budget survives repeated restarts and other users remain independent', (t) => {
  const { file } = temporary(t);
  let now = 0;
  let store = new FantasyStore(file, { now: () => now });
  for (let attempt = 0; attempt < 5; attempt++) {
    now += 1001;
    const before = store.profile('alice');
    const drawn = store.apply('alice', before.revision, { type: 'draw' }, () => 0.4);
    assert.equal(drawn.error, undefined);
    assert.equal(drawn.profile.draft.remaining, 4 - attempt);
    const skipped = store.apply('alice', drawn.profile.revision, { type: 'skip' });
    assert.equal(skipped.error, undefined);
    store = new FantasyStore(file, { now: () => now });
  }
  const before = store.profile('alice');
  const exhausted = store.apply('alice', before.revision, { type: 'draw' });
  assert.ok(exhausted.error);
  assert.equal(exhausted.changed, false);
  assert.deepEqual(exhausted.profile, before);
  assert.equal(store.profile('bob').draft.remaining, 5);
});

test('saved user keys never become filesystem paths and both users survive a reload', (t) => {
  const { directory, file } = temporary(t);
  const store = new FantasyStore(file);
  const suspicious = '../../outside';
  assert.equal(store.apply(suspicious, 0, { type: 'draw' }, () => 0.3).changed, true);
  assert.equal(store.apply('__proto__', 0, { type: 'draw' }, () => 0.4).changed, true);
  const restored = new FantasyStore(file);
  assert.equal(restored.profile(suspicious).draft.remaining, 4);
  assert.equal(restored.profile('__proto__').draft.remaining, 4);
  assert.deepEqual(fs.readdirSync(directory), ['data']);
});

test('save failures do not acknowledge or mutate progress; retry uses the original revision', (t) => {
  const { file } = temporary(t);
  let failing = true;
  const failures: unknown[] = [];
  const store = new FantasyStore(file, {
    save: (target, data) => {
      if (failing) throw new Error('disk full');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
    },
    onError: (error) => failures.push(error),
  });
  const failed = store.apply('alice', 0, { type: 'draw' }, () => 0.3);
  assert.ok(failed.error);
  assert.equal(failed.changed, false);
  assert.equal(failed.profile.revision, 0);
  assert.equal(failed.profile.draft.remaining, 5);
  assert.equal(fs.existsSync(file), false);
  assert.equal(failures.length, 1);
  failing = false;
  assert.equal(store.apply('alice', 0, { type: 'draw' }, () => 0.4).changed, true);
  assert.equal(new FantasyStore(file).profile('alice').draft.remaining, 4);
});

test('corrupt saves are preserved and block mutations instead of granting a new budget', (t) => {
  const { file } = temporary(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const original = '{"alice":{"version":1,"draft":{"remaining":99}}}';
  fs.writeFileSync(file, original);
  const failures: unknown[] = [];
  const store = new FantasyStore(file, { onError: (error) => failures.push(error) });
  assert.ok(store.loadError);
  assert.equal(failures.length, 1);
  const result = store.apply('alice', 0, { type: 'draw' });
  assert.equal(result.changed, false);
  assert.equal(result.error, store.loadError);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});

test('semantically corrupt profiles are preserved without allowing a replacement save', (t) => {
  const { file } = temporary(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const valid = applyFantasyAction(newFantasyProfile(), { type: 'create', name: '旅人', gender: 'female', source: 'human', job: 'adventurer' }).profile;
  const corruptions: [string, (profile: FantasyProfile) => void][] = [
    ['unknown race', p => { p.character!.race = 'missing-race'; }],
    ['unknown job', p => { p.character!.job = 'missing-job'; }],
    ['unknown location', p => { p.character!.location = 'missing-place'; }],
    ['level zero', p => { p.character!.level = 0; }],
    ['HP above max', p => { p.character!.hp = fantasyStats(p.character!).hp + 1; }],
    ['MP above max', p => { p.character!.mp = fantasyStats(p.character!).mp + 1; }],
    ['fixed gender mismatch', p => { p.character!.race = 'dryad'; p.character!.hp = 1; p.character!.mp = 0; p.character!.gender = 'male'; }],
    ['unfixed genderless human', p => { p.character!.gender = 'none'; }],
    ['duplicate active quests', p => { p.character!.quests = ['quest-herbalist', 'quest-herbalist']; }],
    ['duplicate completed quests', p => { p.character!.completed = ['quest-herbalist', 'quest-herbalist']; }],
    ['active/completed intersection', p => { p.character!.quests = ['quest-herbalist']; p.character!.completed = ['quest-herbalist']; }],
    ['unknown quest', p => { p.character!.quests = ['missing-quest']; }],
    ['unknown visited place', p => { p.character!.visited.push('missing-place'); }],
    ['current place not visited', p => { p.character!.visited = []; }],
    ['unknown inventory item', p => { p.character!.inventory['missing-item'] = 1; }],
    ['unknown job experience', p => { p.character!.jobXp['missing-job'] = 1; }],
    ['missing current job experience', p => { p.character!.jobXp = {}; }],
    ['unknown candidate', p => { p.draft.remaining = 4; p.draft.candidate = 'missing-race'; }],
    ['unknown kept race', p => { p.draft.remaining = 4; p.draft.kept = 'missing-race'; }],
    ['candidate with unspent budget', p => { p.draft.candidate = 'elf'; }],
    ['unknown event', p => { p.event = 'missing-event'; }],
    ['event of another job', p => { p.event = 'cook-contest'; }],
    ['event without a character', p => { p.character = null; p.event = 'adventurer-ruins'; }],
    ['negative buff', p => { p.character!.buff = { effect: 'guard', power: -5 }; }],
  ];
  for (const [name, corrupt] of corruptions) {
    const profile = structuredClone(valid);
    corrupt(profile);
    const original = JSON.stringify({ alice: profile });
    fs.writeFileSync(file, original);
    let writes = 0;
    const store = new FantasyStore(file, { onError: () => {}, save: () => { writes++; } });
    assert.ok(store.loadError, name);
    const result = store.apply('alice', 0, { type: 'draw' });
    assert.equal(result.changed, false, name);
    assert.equal(result.error, store.loadError, name);
    assert.equal(writes, 0, name);
    assert.equal(fs.readFileSync(file, 'utf8'), original, name);
  }
});

test('valid drafts, fixed genders, buffs, events and level growth reload unchanged', (t) => {
  const { file } = temporary(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fresh = newFantasyProfile();
  const drawn = applyFantasyAction(fresh, { type: 'draw' }, () => 0.99).profile;
  const kept = applyFantasyAction(drawn, { type: 'keep' }).profile;
  const created = applyFantasyAction(kept, { type: 'create', name: '旅人', gender: 'female', source: 'kept', job: 'adventurer' }).profile;
  created.character!.job = 'adventurer';
  created.character!.jobXp = { adventurer: 0 };
  const stoneDraft = newFantasyProfile();
  stoneDraft.draft = { remaining: 4, candidate: 'stoneborn', kept: null };
  const stone = applyFantasyAction(stoneDraft, { type: 'create', name: '石の旅人', gender: 'female', source: 'candidate', job: 'blacksmith' }).profile;
  stone.character!.lifeJob = 'blacksmith';
  stone.character!.jobXp = { unassigned: 0, blacksmith: 0 };
  const event = applyFantasyAction(created, { type: 'work' }, () => 0).profile;
  const buff = applyFantasyAction(stone, { type: 'skill', skill: 'stoneborn-echo' }).profile;
  let leveled = created;
  for (let i = 0; i < 25; i++) {
    leveled.character!.fatigue = 0; leveled.character!.hunger = 0;
    leveled = applyFantasyAction(leveled, { type: 'work' }, () => 0.99).profile;
  }
  assert.ok(leveled.character!.level >= 4);
  const profiles = { fresh, drawn, kept, created, stone, event, buff, leveled };
  fs.writeFileSync(file, JSON.stringify(profiles));
  const store = new FantasyStore(file, { onError: () => {} });
  assert.equal(store.loadError, undefined);
  for (const [name, profile] of Object.entries(profiles)) assert.deepEqual(store.profile(name), profile, name);
});

test('runtime action validation rejects injected profiles, invalid fields and unknown operations', (t) => {
  const { file } = temporary(t);
  const store = new FantasyStore(file);
  for (const action of [null, [], {}, { type: 'reset' }, { type: 'draw', remaining: 5 }, { type: 'sync', profile: {} },
    { type: 'create', name: 'X', gender: 'none', source: 'human', job: 'merchant' },
    { type: 'create', name: 'A'.repeat(25), gender: 'male', source: 'human', job: 'merchant' },
    { type: 'travel', destination: '../secret', transport: 'foot' }, { type: 'buy', item: [] },
    { type: 'event', choice: 'A'.repeat(1000) }, { type: 'lodge', room: ['common'] }, { type: 'lodge', room: 'free' }, { type: 'eat', meal: 'royal' }, { type: 'eat', meal: ['simple'] }]) {
    assert.equal(isFantasyAction(action), false);
    assert.equal(store.apply('alice', 0, action).changed, false);
  }
  assert.equal(store.profile('alice').draft.remaining, 5);
  assert.equal(fs.existsSync(file), false);
  assert.equal(isFantasyAction({ type: 'create', name: '旅人', gender: 'female', source: 'kept', job: 'merchant' }), true);
  assert.equal(isFantasyAction({ type: 'lodge', room: 'private' }), true);
  assert.equal(isFantasyAction({ type: 'eat', meal: 'hearty' }), true);
});

test('legacy version-one characters migrate once atomically without resetting identity, money or draw budget', (t) => {
  const { file } = temporary(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const legacy = applyFantasyAction(newFantasyProfile(), { type: 'create', name: '古い旅人', gender: 'female', source: 'human', job: 'adventurer' }).profile;
  legacy.revision = 17;
  legacy.draft = { remaining: 1, candidate: null, kept: 'elf' };
  legacy.character!.gold = 241;
  legacy.character!.hour = 88;
  legacy.character!.inventory = { meal: 2, fish: 1, herb: 3 };
  const character = legacy.character! as unknown as Record<string, unknown>;
  for (const field of ['fatigue', 'hunger', 'foodLots', 'charted']) delete character[field];
  fs.writeFileSync(file, JSON.stringify({ alice: legacy }));
  let writes = 0;
  const save = (target: string, content: string) => { writes++; fs.writeFileSync(target, content); };
  const store = new FantasyStore(file, { save });
  assert.equal(store.loadError, undefined);
  const migrated = store.profile('alice');
  assert.equal(writes, 1);
  assert.equal(migrated.version, 1);
  assert.equal(migrated.revision, 17);
  assert.deepEqual(migrated.draft, legacy.draft);
  assert.equal(migrated.character?.name, '古い旅人');
  assert.equal(migrated.character?.gold, 241);
  assert.equal(migrated.character?.fatigue, 0);
  assert.equal(migrated.character?.hunger, 0);
  assert.deepEqual(migrated.character?.charted, []);
  assert.deepEqual(migrated.character?.inventory, { meal: 2, fish: 1, herb: 3 });
  assert.equal(migrated.character?.foodLots.length, 2);
  assert.ok(migrated.character?.foodLots.every(lot => lot.createdAt === 88));
  assert.deepEqual(new FantasyStore(file, { save }).profile('alice'), migrated);
  assert.equal(writes, 1);
});

test('partial migration preserves existing needs, charted places and the original age of food', (t) => {
  const { file } = temporary(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: '旅人', gender: 'female', source: 'human', job: 'adventurer' }).profile;
  profile.character!.hour = 20;
  profile.character!.hunger = 69;
  profile.character!.charted = ['mooncity'];
  const lots = structuredClone(profile.character!.foodLots);
  delete (profile.character as unknown as Record<string, unknown>).fatigue;
  fs.writeFileSync(file, JSON.stringify({ alice: profile }));
  const store = new FantasyStore(file);
  assert.equal(store.loadError, undefined);
  assert.equal(store.profile('alice').character?.fatigue, 0);
  assert.equal(store.profile('alice').character?.hunger, 69);
  assert.deepEqual(store.profile('alice').character?.charted, ['mooncity']);
  assert.deepEqual(store.profile('alice').character?.foodLots, lots);
});

test('failed legacy migration preserves the original file and visible progress while blocking actions', (t) => {
  const { file } = temporary(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const legacy = applyFantasyAction(newFantasyProfile(), { type: 'create', name: '旅人', gender: 'female', source: 'human', job: 'adventurer' }).profile;
  legacy.draft.remaining = 2;
  legacy.character!.gold = 123;
  delete (legacy.character as unknown as Record<string, unknown>).fatigue;
  const original = JSON.stringify({ alice: legacy });
  fs.writeFileSync(file, original);
  const store = new FantasyStore(file, { save: () => { throw new Error('disk full'); }, onError: () => {} });
  assert.ok(store.loadError);
  assert.equal(store.profile('alice').draft.remaining, 2);
  assert.equal(store.profile('alice').character?.gold, 123);
  assert.equal(store.apply('alice', legacy.revision, { type: 'work' }).changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});

test('food lots, hunger, fatigue and discovered-map corruption never get silently repaired', (t) => {
  const { file } = temporary(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const valid = applyFantasyAction(newFantasyProfile(), { type: 'create', name: '旅人', gender: 'female', source: 'human', job: 'adventurer' }).profile;
  const corruptions: [string, (profile: FantasyProfile) => void][] = [
    ['null fatigue', p => { (p.character as unknown as Record<string, unknown>).fatigue = null; }],
    ['negative fatigue', p => { p.character!.fatigue = -1; }],
    ['excess hunger', p => { p.character!.hunger = 101; }],
    ['fractional hunger', p => { p.character!.hunger = 1.5; }],
    ['null lots', p => { (p.character as unknown as Record<string, unknown>).foodLots = null; }],
    ['missing food lot', p => { p.character!.foodLots = []; }],
    ['wrong food total', p => { p.character!.foodLots[0].count++; }],
    ['zero food count', p => { p.character!.foodLots[0].count = 0; }],
    ['negative food count', p => { p.character!.foodLots[0].count = -1; }],
    ['unknown food item', p => { p.character!.foodLots[0].item = 'potion'; }],
    ['duplicate lot ID', p => { p.character!.foodLots.push(structuredClone(p.character!.foodLots[0])); }],
    ['future food', p => { p.character!.foodLots[0].createdAt = p.character!.hour + 1; }],
    ['negative food date', p => { p.character!.foodLots[0].createdAt = -1; }],
    ['empty lot ID', p => { p.character!.foodLots[0].id = ''; }],
    ['invalid charted array', p => { (p.character as unknown as Record<string, unknown>).charted = null; }],
    ['unknown charted place', p => { p.character!.charted = ['missing-place']; }],
    ['duplicate charted place', p => { p.character!.charted = ['mooncity', 'mooncity']; }],
  ];
  for (const [name, corrupt] of corruptions) {
    const profile = structuredClone(valid); corrupt(profile);
    const original = JSON.stringify({ alice: profile }); fs.writeFileSync(file, original);
    let writes = 0;
    const store = new FantasyStore(file, { save: () => { writes++; }, onError: () => {} });
    assert.ok(store.loadError, name);
    assert.equal(writes, 0, name);
    assert.equal(fs.readFileSync(file, 'utf8'), original, name);
  }
});

test('legitimate food batches, needs, regional charts and map items round-trip unchanged', (t) => {
  const { file } = temporary(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: '旅人', gender: 'female', source: 'human', job: 'adventurer' }).profile;
  const c = profile.character!;
  c.hour = 200; c.fatigue = 100; c.hunger = 47; c.charted = ['mooncity', 'dawnport'];
  c.inventory = Object.fromEntries([...FANTASY_FOOD_META.map(food => [food.item, 2] as const), ...FANTASY_MAPS.map(map => [map.item, 1] as const)]);
  c.foodLots = FANTASY_FOOD_META.flatMap(food => [
    { id: `old-${food.item}`, item: food.item, count: 1, createdAt: 0 },
    { id: `new-${food.item}`, item: food.item, count: 1, createdAt: 200 },
  ]);
  fs.writeFileSync(file, JSON.stringify({ alice: profile }));
  const store = new FantasyStore(file);
  assert.equal(store.loadError, undefined);
  assert.deepEqual(store.profile('alice'), profile);
});

test('actions including sync require membership in a fantasy session', (t) => {
  const { file } = temporary(t);
  const store = new FantasyStore(file);
  for (const context of [{ id: 'alice', session: null }, { id: 'alice', session: 'room-a', world: 'room' }]) {
    for (const action of [{ type: 'draw' }, { type: 'sync' }]) {
      const result = handleFantasyAction(store, context, 0, action);
      assert.equal(result.changed, false);
      assert.ok(result.error);
    }
  }
  assert.equal(handleFantasyAction(store, { id: 'alice', session: 'fantasy-a', world: 'fantasy' }, 0, { type: 'draw' }).changed, true);
});

test('action bursts are rate limited while explicit synchronization remains available', (t) => {
  const { file } = temporary(t);
  let now = 0;
  const store = new FantasyStore(file, { now: () => now });
  for (let n = 0; n < 8; n++) store.apply('alice', 0, { type: 'work' });
  const limited = store.apply('alice', 0, { type: 'draw' });
  assert.match(limited.error ?? '', /操作が続いています/);
  assert.equal(limited.profile.draft.remaining, 5);
  assert.equal(store.apply('alice', undefined, { type: 'sync' }).error, undefined);
  now = 1001;
  assert.equal(store.apply('alice', 0, { type: 'draw' }).changed, true);
});

test('home WebSocket authenticates session context and shares committed progress across the same user tabs', { timeout: 30_000 }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-fantasy-ws-'));
  const sessions = path.join(directory, 'sessions.json');
  fs.writeFileSync(sessions, JSON.stringify({ name: 'Fantasy test', sessions: [{ id: 'fantasy-test', name: 'Fantasy', world: 'fantasy' }, { id: 'fantasy-other', name: 'Other Fantasy', world: 'fantasy' }, { id: 'room-test', name: 'Room' }] }));
  const listener = net.createServer();
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  markFantasyPlatformDataCurrent(directory);
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts', '--dev'], {
    env: { ...process.env, ...(await testServerEnv(t)), TONARIUM_TEST_HELLO_ID: '1', NODE_ENV: 'test', SERVER_PORT: String(port), DATA_DIR: directory, SESSIONS_FILE: sessions, LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += String(chunk); });
  child.stderr.on('data', (chunk) => { logs += String(chunk); });
  const sockets: WebSocket[] = [];
  const until = async <T>(read: () => T | undefined, timeout = 10_000): Promise<T> => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = read();
      if (value !== undefined) return value;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    throw new Error(`Timed out waiting for fantasy WebSocket: ${logs}`);
  };
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    child.kill();
    await until(() => child.exitCode !== null || child.signalCode ? true : undefined, 5000).catch(() => child.kill('SIGKILL'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await until(() => logs.includes('server on') ? true : undefined);
  const peer = async (id: string) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    sockets.push(socket);
    const received: { t: string; profile?: FantasyProfile; clock?: FantasyWorldClock; state?: FantasyCommunityState | null; error?: string; requestId?: string; reply?: FantasyGmReply; source?: string }[] = [];
    socket.on('message', (raw) => received.push(JSON.parse(String(raw))));
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const send = (message: unknown) => socket.send(JSON.stringify(message));
    send({ t: 'hello', compat: COMPAT_VERSION, id, name: id });
    await until(() => received.find((message) => message.t === 'snapshot'));
    const takeProfile = async (from: number) => until(() => received.slice(from).find((message) => message.t === 'fantasyProfile'));
    const barrier = async () => { const from = received.length; send({ t: 'hello', compat: COMPAT_VERSION, id, name: id }); await until(() => received.slice(from).find(message => message.t === 'snapshot')); };
    return { socket, received, send, takeProfile, barrier };
  };
  const alice = await peer('alice');
  const second = await peer('alice');
  const bob = await peer('bob');
  let from = alice.received.length;
  alice.send({ t: 'fantasyAction', revision: 0, action: { type: 'draw' } });
  await alice.barrier();
  assert.equal(alice.received.slice(from).some(message => message.t === 'fantasyProfile'), false);
  from = alice.received.length;
  alice.send({ t: 'fantasyGmChat', requestId: 'gm-outside', text: 'Hello', locale: 'en', profile: { gold: 99999 } });
  await alice.barrier();
  assert.equal(alice.received.slice(from).some(message => message.requestId === 'gm-outside'), false);
  from = alice.received.length;
  alice.send({ t: 'join', sid: 'room-test' });
  alice.send({ t: 'fantasyAction', revision: 0, action: { type: 'sync' } });
  await alice.barrier();
  assert.equal(alice.received.slice(from).some(message => message.t === 'fantasyProfile'), false);
  from = alice.received.length;
  const secondFrom = second.received.length;
  const bobProfiles = bob.received.filter((message) => message.t === 'fantasyProfile').length;
  alice.send({ t: 'join', sid: 'fantasy-test' });
  const entered = await until(() => alice.received.slice(from).find(message => message.t === 'fantasyProfile'));
  assert.equal(entered.profile?.draft.remaining, 5);
  assert.equal(entered.profile?.revision, 0);
  from = alice.received.length;
  alice.send({ t: 'fantasyAction', revision: 0, action: { type: 'draw' } });
  const committed = await alice.takeProfile(from);
  assert.equal(committed.error, undefined);
  assert.equal(committed.profile?.revision, 1);
  assert.equal(committed.profile?.draft.remaining, 4);
  assert.deepEqual((await until(() => second.received.slice(secondFrom).find(message => message.profile?.revision === committed.profile!.revision))).profile, committed.profile);
  assert.equal(bob.received.filter((message) => message.t === 'fantasyProfile').length, bobProfiles);
  from = second.received.length;
  second.send({ t: 'fantasyAction', revision: 0, action: { type: 'draw' } });
  const stale = await second.takeProfile(from);
  assert.ok(stale.error);
  assert.deepEqual(stale.profile, committed.profile);
  from = alice.received.length;
  alice.send({ t: 'fantasyAction', revision: 1, action: { type: 'draw', profile: { gold: 99999 } } });
  assert.ok((await alice.takeProfile(from)).error);
  assert.deepEqual(readFantasySavedProfiles(path.join(directory, 'fantasy.json')).alice, committed.profile);
  for (const peer of [alice, second, bob]) {
    const clock = await until(() => peer.received.find(message => message.t === 'fantasyClock')?.clock);
    assert.equal(clock.rate, 30);
  }
  from = alice.received.length;
  alice.send({ t: 'fantasyAction', revision: 1, action: { type: 'create', name: 'Alice', gender: 'female', source: 'candidate' } });
  const character = await until(() => alice.received.slice(from).find(message => message.profile?.character));
  assert.equal(character.profile!.character!.job, 'unassigned');
  from = bob.received.length;
  bob.send({ t: 'join', sid: 'fantasy-other' });
  bob.send({ t: 'fantasyAction', revision: 0, action: { type: 'create', name: 'Bob', gender: 'male', source: 'human' } });
  const otherCharacter = await until(() => bob.received.slice(from).find(message => message.profile?.character));
  const communityFrom = bob.received.length;
  alice.send({ t: 'communityContribute', requestId: 'shared-one', revision: 0, npcId: 'rin', user: 'bob', location: 'emberhall' });
  const shared = await until(() => bob.received.slice(communityFrom).find(message => message.t === 'communityState' && message.state?.revision === 1));
  assert.equal(shared.state!.location, 'hearth');
  assert.equal(shared.state!.projects.find(project => project.id === 'supplies')!.contributions, 1);
  from = alice.received.length;
  second.send({ t: 'communityContribute', requestId: 'shared-one', revision: 1, npcId: 'rin' });
  const duplicate = await until(() => second.received.find(message => message.t === 'communityState' && message.error === 'duplicate'));
  assert.equal(duplicate.state!.revision, 1);
  const clockBefore = alice.received.filter(message => message.clock).at(-1)!.clock!;
  from = alice.received.length;
  alice.send({ t: 'fantasyAction', revision: character.profile!.revision, action: { type: 'work' } });
  const working = await until(() => alice.received.slice(from).find(message => message.profile?.activity?.action.type === 'work'));
  assert.equal(working.profile!.character!.gold, character.profile!.character!.gold);
  assert.equal(working.profile!.activity!.endsAt - working.profile!.activity!.startedAt, 4);
  assert.equal(otherCharacter.profile!.activity, undefined);
  const clockAfter = await until(() => alice.received.slice(from).find(message => message.clock)?.clock);
  assert.ok(clockAfter.hour - clockBefore.hour < 0.01);
  bob.send({ t: 'fantasyClock', clock: { hour: 999999, rate: 999999, serverTime: 0 } });
  const bobFrom = bob.received.length;
  bob.send({ t: 'fantasyAction', revision: otherCharacter.profile!.revision, action: { type: 'sync' } });
  const bobClock = await until(() => bob.received.slice(bobFrom).find(message => message.clock)?.clock);
  const epoch = (clock: FantasyWorldClock) => clock.hour - clock.serverTime * clock.rate / 3_600_000;
  assert.ok(Math.abs(epoch(clockAfter) - epoch(bobClock)) < 1e-7);
  assert.equal(bobClock.rate, 30);
  assert.ok(bobClock.hour < 9);
  from = alice.received.length;
  alice.send({ t: 'fantasyGmChat', requestId: 'gm-rules', text: '지금 내가 뭐하고 있어?', locale: 'ko', profile: { character: { job: 'crimeboss', gold: 99999 } } });
  const actualGm = await until(() => alice.received.slice(from).find(message => message.requestId === 'gm-rules'));
  assert.equal(actualGm.source, 'rules');
  assert.equal(actualGm.error, undefined);
  assert.ok(actualGm.reply!.text.includes('무직'));
  assert.ok(actualGm.reply!.text.includes('일'));
  assert.ok(!actualGm.reply!.text.includes('99999'));
  assert.deepEqual(actualGm.reply!.suggestions.flatMap(s => s.action ? [s.action] : []), []);
  const stillWorking = readFantasySavedProfiles(path.join(directory, 'fantasy.json')).alice as FantasyProfile;
  assert.ok(stillWorking.activity);
  assert.equal(stillWorking.character!.gold, character.profile!.character!.gold);
});
