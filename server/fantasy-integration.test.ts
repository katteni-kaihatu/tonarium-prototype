import { readFantasySavedProfiles } from './fantasy-test-saved-profiles.ts';
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { COMPAT_VERSION } from '../shared/protocol.ts';
import { FantasyStore, handleFantasyAction, isFantasyAction } from './fantasy-store.ts';
import { FantasyContracts, type FantasyContractActor } from './fantasy-contracts.ts';
import type { FantasyAction, FantasyProfile } from '../shared/fantasy.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { validFantasyBirth } from '../shared/fantasy-birth.ts';
import { recordFantasyDeath } from '../shared/fantasy-mortality.ts';
import { FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { fantasyContractIssuer, fantasyPersonalQuest, type FantasyContractBoard, type FantasyContractGrant } from '../shared/fantasy-contracts.ts';

const high = () => .999;
function temporary(t: TestContext) {
  const prefix = path.join(os.tmpdir(), 'tonarium-fantasy-integration-');
  const directory = fs.mkdtempSync(prefix);
  t.after(() => {
    if (!path.resolve(directory).startsWith(path.resolve(prefix))) throw new Error('Unexpected test directory');
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { directory, file: path.join(directory, 'fantasy.json') };
}
function player(job = 'unassigned', location = 'hearth'): FantasyProfile {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Integration', gender: 'female', source: 'human' }, high).profile;
  const c = profile.character!;
  c.job = job; c.jobXp[job] = 0; c.location = location; c.visited = [...new Set(['hearth', location])]; c.gold = 300;
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  return profile;
}
function put(file: string, profiles: Record<string, FantasyProfile>) { fs.writeFileSync(file, JSON.stringify(profiles)); }
function actor(store: FantasyStore, id = 'alice'): FantasyContractActor {
  return { id, session: 'test-world', world: 'fantasy', character: store.profile(id).character ?? undefined };
}

test('birth variation persists once, stays authoritative and cannot be supplied in action payloads', t => {
  const { file } = temporary(t); let hour = 73;
  let store = new FantasyStore(file, { worldHour: () => hour });
  const created = store.apply('alice', 0, { type: 'create', name: 'Birth', gender: 'female', source: 'human' }, high);
  assert.equal(created.error, undefined); assert.ok(validFantasyBirth(created.profile.character!));
  const bonuses = structuredClone(created.profile.character!.birthBonuses);
  assert.equal(Object.keys(bonuses!).length, 7); assert.equal(created.profile.character!.lifeStartedAt, hour);
  hour += .5; store = new FantasyStore(file, { worldHour: () => hour });
  const synced = store.synchronize('alice').profile;
  assert.deepEqual(synced.character!.birthBonuses, bonuses);
  let rolls = 0;
  for (const action of [
    { type: 'create', name: 'Reroll', gender: 'female', source: 'human' },
    { type: 'create', name: 'Forged', gender: 'male', source: 'human', birthBonuses: { strength: 999 } },
    { type: 'sync', birthBonuses: {} },
  ]) assert.equal(store.apply('alice', synced.revision, action, () => { rolls++; return .5; }).changed, false);
  assert.equal(rolls, 0); assert.deepEqual(new FantasyStore(file).profile('alice').character!.birthBonuses, bonuses);
});

test('invalid birth data blocks loading without repairing or overwriting the save', t => {
  const { file } = temporary(t); const base = player();
  for (const bonuses of [null, [], { hp: 6 }, { mp: -4 }, { strength: 2 }, { luck: .5 }, { dexterity: 1 }, { unknown: 0 }, { vitality: '1' }]) {
    const broken = structuredClone(base); broken.character!.birthBonuses = bonuses as never;
    const original = JSON.stringify({ alice: broken }); fs.writeFileSync(file, original);
    const store = new FantasyStore(file, { onError: () => {} });
    assert.ok(store.loadError, JSON.stringify(bonuses)); assert.equal(fs.readFileSync(file, 'utf8'), original);
    assert.equal(store.apply('alice', base.revision, { type: 'work' }).changed, false);
  }
});

test('legacy birthless characters keep their base stats and never receive a retroactive reroll', t => {
  const { file } = temporary(t); const legacy = player(); const c = legacy.character!;
  delete c.birthBonuses; c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  legacy.revision = 19; legacy.draft = { remaining: 1, candidate: null, kept: 'elf' };
  put(file, { alice: legacy }); const store = new FantasyStore(file);
  assert.equal(store.loadError, undefined); assert.deepEqual(store.profile('alice'), legacy);
  assert.equal(fantasyStats(store.profile('alice').character!).hp, 100);
});

test('legacy discontinued mana reservations cancel once without consuming resources or restoring draw chances', t => {
  const { file } = temporary(t); const legacy = player('mage'); legacy.revision = 27;
  legacy.draft = { remaining: 2, candidate: null, kept: 'elf' };
  legacy.activity = { action: { type: 'manaTrain', exercise: 'sense' }, startedAt: 8, endsAt: 9, seed: 123 };
  put(file, { alice: legacy }); let writes = 0;
  const save = (target: string, text: string) => { writes++; fs.writeFileSync(target, text); };
  const store = new FantasyStore(file, { save, worldHour: () => 8.5 });
  assert.equal(store.loadError, undefined); const restored = store.profile('alice');
  const expected = structuredClone(legacy); delete expected.activity;
  assert.deepEqual(restored, expected); assert.equal(writes, 1);
  assert.deepEqual(new FantasyStore(file, { save }).profile('alice'), expected); assert.equal(writes, 1);
  assert.equal(store.apply('alice', restored.revision, { type: 'manaTrain', exercise: 'sense' }, high).changed, false);
  assert.equal(store.profile('alice').character!.mana, undefined);
});

test('invalid old reservations remain corrupt and failed migration preserves the original file and progress', t => {
  const { file } = temporary(t); const legacy = player();
  legacy.activity = { action: { type: 'manaTrain', exercise: 'sense' }, startedAt: 8, endsAt: 9, seed: -1 };
  let original = JSON.stringify({ alice: legacy }); fs.writeFileSync(file, original);
  assert.ok(new FantasyStore(file, { onError: () => {} }).loadError); assert.equal(fs.readFileSync(file, 'utf8'), original);
  legacy.activity.seed = 42; original = JSON.stringify({ alice: legacy }); fs.writeFileSync(file, original);
  const failed = new FantasyStore(file, { onError: () => {}, save: () => { throw new Error('test disk full'); } });
  assert.ok(failed.loadError); assert.equal(failed.profile('alice').character!.gold, legacy.character!.gold);
  assert.equal(failed.apply('alice', legacy.revision, { type: 'work' }).changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});

test('new action envelopes accept only exact requests and never accept supplied results, progress or rewards', () => {
  const actions: FantasyAction[] = [
    { type: 'gather', resource: 'herbs' }, { type: 'hunt', monster: 'monster-forest-wolf' }, { type: 'skin' },
    { type: 'fish', mode: 'pier' }, { type: 'boat', mode: 'rent' }, { type: 'rebirth' },
    { type: 'read', book: 'traveler-guide' }, { type: 'wear', item: 'lantern' }, { type: 'terrain', activity: 'trail-reading' },
    { type: 'craft', recipe: 'forge-spear', material: 'starsteel-ingot', gem: 'ruby' },
    { type: 'equip', item: 'blade', instance: 'gear-8-blade-0' }, { type: 'sell', item: 'blade', instance: 'gear-8-blade-0' },
    { type: 'command', kind: 'troop', operation: 'assign', member: 'troop-guard' },
    { type: 'magicPrepare', slot: 1, element: 'tide', form: 'mend' }, { type: 'magicCast', slot: 3 },
    { type: 'alchemy', formula: 'healing' }, { type: 'accept', quest: 'quest-herbalist', offer: 'offer-test' }, { type: 'abandon', quest: 'quest-herbalist' },
  ];
  for (const action of actions) {
    assert.ok(isFantasyAction(action), JSON.stringify(action));
    for (const field of ['gold', 'progress', 'birthBonuses', 'contract', 'quality', 'result', 'profile']) assert.equal(isFantasyAction({ ...action, [field]: {} }), false);
  }
  for (const action of [{ type: 'magicCast', slot: 0 }, { type: 'magicPrepare', slot: 1, element: 'void', form: 'mend' },
    { type: 'command', kind: 'troop', operation: 'promote' }, { type: 'alchemy', formula: 'invented' }, { type: 'hunt', monster: '../file' }]) assert.equal(isFantasyAction(action), false);
});

test('specialty reservations survive restart and finish with their result exactly once', t => {
  const { file } = temporary(t); const mage = player('mage'), leader = player('leader'); put(file, { mage, leader });
  let hour = 8; let store = new FantasyStore(file, { worldHour: () => hour });
  const spell = store.apply('mage', mage.revision, { type: 'magicPrepare', slot: 1, element: 'tide', form: 'mend' }, high);
  const hired = store.apply('leader', leader.revision, { type: 'command', kind: 'troop', operation: 'hire', member: 'troop-guard' }, high);
  assert.equal(spell.error, undefined); assert.equal(hired.error, undefined);
  assert.equal(spell.profile.activity!.endsAt, 9); assert.equal(hired.profile.activity!.endsAt, 10);
  assert.equal(hired.profile.character!.gold, leader.character!.gold); assert.equal(spell.profile.character!.specialization, undefined);
  hour = 9; store = new FantasyStore(file, { worldHour: () => hour });
  const prepared = store.synchronize('mage').profile;
  assert.deepEqual(prepared.character!.specialization!.spells, [{ slot: 1, element: 'tide', form: 'mend' }]);
  assert.ok(store.synchronize('leader').profile.activity);
  hour = 10; store = new FantasyStore(file, { worldHour: () => hour });
  const completed = store.synchronize('leader').profile;
  assert.equal(completed.character!.specialization!.companies!.troop!.members.length, 1);
  assert.ok(completed.character!.gold < leader.character!.gold); assert.equal(completed.activity, undefined);
  store = new FantasyStore(file, { worldHour: () => hour });
  assert.deepEqual(store.synchronize('leader').profile, completed); assert.deepEqual(store.profile('mage'), prepared);
});

test('death and rebirth preserve public traces while preventing actions and old inventory from crossing lives', t => {
  const { file } = temporary(t); const dead = player('mage', 'deepcave'); dead.character!.visited.push('mooncity');
  dead.character!.inventory.crystal = 8; dead.character!.gold = 900; dead.draft.remaining = 1;
  recordFantasyDeath(dead, 'Integration test'); put(file, { dead, observer: player() });
  let store = new FantasyStore(file); assert.equal(store.loadError, undefined);
  assert.equal(store.apply('dead', dead.revision, { type: 'work' }, high).changed, false);
  assert.equal(store.legacies('observer')[0].location, null); assert.ok(!JSON.stringify(store.legacies('observer')).includes('mooncity'));
  const reborn = store.apply('dead', dead.revision, { type: 'rebirth' }, high);
  assert.equal(reborn.error, undefined); assert.equal(reborn.profile.character, null); assert.equal(reborn.profile.generation, 2);
  assert.deepEqual(reborn.profile.pastLives, dead.pastLives); assert.equal(reborn.profile.draft.remaining, 5);
  store = new FantasyStore(file); assert.deepEqual(store.profile('dead'), reborn.profile);
  const fresh = store.apply('dead', reborn.profile.revision, { type: 'create', name: 'Next life', gender: 'male', source: 'human' }, high);
  assert.equal(fresh.error, undefined); assert.equal(fresh.profile.character!.gold, 35); assert.equal(fresh.profile.character!.inventory.crystal ?? 0, 0);
  assert.deepEqual(fresh.profile.pastLives, dead.pastLives); assert.equal(new FantasyStore(file).legacyCount(), 1);
});

test('shared contract grants are committed through the board, persist and reject untrusted alternatives', t => {
  const { directory, file } = temporary(t); put(file, { alice: player(), bob: player() });
  const store = new FantasyStore(file), board = new FantasyContracts(path.join(directory, 'contracts.json'), { lookup: user => store.profile(user) });
  const a = actor(store), b = actor(store, 'bob');
  const offer = board.state(a, 8)!.offers.find(offer => offer.available && offer.mode === 'exclusive')!; assert.ok(offer);
  const before = store.profile('alice');
  assert.equal(store.apply('alice', before.revision, { type: 'accept', quest: offer.quest }, high).changed, false);
  assert.equal(store.apply('alice', before.revision, { type: 'accept', quest: offer.quest, offer: offer.id }, high).changed, false);
  assert.equal(store.apply('alice', before.revision, { type: 'accept', quest: offer.quest, offer: offer.id, contract: { gold: 1e6 } }, high).changed, false);
  const result = board.claim(a, { quest: offer.quest, offer: offer.id }, 8, grant => store.apply('alice', before.revision, { type: 'accept', quest: offer.quest, offer: offer.id }, high, { contract: grant }));
  assert.equal(result.error, undefined); assert.equal(result.result!.error, undefined);
  const accepted = store.profile('alice'); assert.equal(accepted.character!.contracts![offer.quest].gold, offer.gold);
  assert.deepEqual(new FantasyStore(file).profile('alice'), accepted);
  assert.equal(board.claim(b, { quest: offer.quest, offer: offer.id }, 8, () => { throw new Error('Must not double claim'); }).error, 'taken');
  assert.equal(handleFantasyAction(store, { id: 'bob', session: null }, before.revision, { type: 'accept', quest: offer.quest, offer: offer.id }, { contract: accepted.character!.contracts![offer.quest] }).changed, false);
  const abandoned = store.apply('alice', accepted.revision, { type: 'abandon', quest: offer.quest }, high);
  assert.equal(abandoned.error, undefined); assert.equal(abandoned.profile.character!.contracts![offer.quest], undefined);
  assert.ok(board.release('alice', offer.id));
  assert.equal(board.claim(actor(store, 'bob'), { quest: offer.quest, offer: offer.id }, 8, grant => store.apply('bob', before.revision, { type: 'accept', quest: offer.quest, offer: offer.id }, high, { contract: grant })).result!.error, undefined);
});

test('forged saved contract fields fail closed while legitimate expired contracts remain abandonable', t => {
  const { file } = temporary(t); const profile = player();
  const quest = FANTASY_QUESTS.find(q => !fantasyPersonalQuest(q) && !q.races && !q.families && !q.jobs && !q.requiresCompleted && q.giver === 'hearth')!;
  profile.character!.quests = [quest.id];
  const grant: FantasyContractGrant = { offerId: 'offer-restore', issuer: fantasyContractIssuer(quest)!, boardLocation: 'hearth', acceptedAt: 8, expiresAt: 44, progress: 0, gold: quest.gold };
  profile.character!.contracts = { [quest.id]: grant };
  for (const patch of [{ gold: quest.gold * 10 }, { progress: (quest.objective?.count ?? 0) + 1 }, { boardLocation: 'greenwood' }, { issuer: 'unknown-npc' }, { acceptedAt: 9 }, { expiresAt: 8 }, { arbitrary: true }]) {
    const corrupt = structuredClone(profile); Object.assign(corrupt.character!.contracts![quest.id], patch);
    const original = JSON.stringify({ alice: corrupt }); fs.writeFileSync(file, original);
    assert.ok(new FantasyStore(file, { onError: () => {} }).loadError, JSON.stringify(patch)); assert.equal(fs.readFileSync(file, 'utf8'), original);
  }
  profile.character!.hour = 45; put(file, { alice: profile }); const store = new FantasyStore(file);
  assert.equal(store.loadError, undefined); assert.equal(store.apply('alice', profile.revision, { type: 'complete', quest: quest.id }, high).changed, false);
  assert.equal(store.apply('alice', profile.revision, { type: 'abandon', quest: quest.id }, high).error, undefined);
});

test('new Home WebSocket contract routing enforces membership, exclusivity and server-owned grants', { timeout: 25_000 }, async t => {
  const { directory, file } = temporary(t); put(file, { alice: player(), bob: player() });
  const sessions = path.join(directory, 'sessions.json');
  fs.writeFileSync(sessions, JSON.stringify({ name: 'Isolated integration', sessions: [{ id: 'test-world', name: 'Test', world: 'fantasy' }] }));
  const listener = net.createServer(); await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = (listener.address() as net.AddressInfo).port; await new Promise<void>(resolve => listener.close(() => resolve()));
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts', '--dev'], {
    env: { ...process.env, NODE_ENV: 'test', FANTASY_ACCOUNT_TEST_BYPASS: '1', SERVER_PORT: String(port), DATA_DIR: directory, SESSIONS_FILE: sessions, LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '', KOKOAAI_APIKEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = ''; child.stdout.on('data', text => { logs += String(text); }); child.stderr.on('data', text => { logs += String(text); });
  const sockets: WebSocket[] = [];
  const until = async <T>(read: () => T | undefined, timeout = 8_000): Promise<T> => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { const result = read(); if (result !== undefined) return result; await new Promise(resolve => setTimeout(resolve, 15)); }
    throw new Error(`Isolated server timeout: ${logs}`);
  };
  t.after(async () => {
    for (const socket of sockets) socket.terminate(); child.kill();
    await until(() => child.exitCode !== null || child.signalCode ? true : undefined, 3_000).catch(() => child.kill('SIGKILL'));
  });
  await until(() => logs.includes('server on') ? true : undefined);
  type Message = { t: string; profile?: FantasyProfile; board?: FantasyContractBoard; error?: string };
  const peer = async (id: string) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(socket);
    const messages: Message[] = []; socket.on('message', raw => messages.push(JSON.parse(String(raw)) as Message));
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const send = (msg: unknown) => socket.send(JSON.stringify(msg)); send({ t: 'hello', compat: COMPAT_VERSION, id, name: id });
    await until(() => messages.find(msg => msg.t === 'fantasyProfile')); return { send, messages };
  };
  const alice = await peer('alice'), bob = await peer('bob'), same = await peer('alice');
  let from = bob.messages.length; bob.send({ t: 'fantasyContracts' });
  assert.equal((await until(() => bob.messages.slice(from).find(msg => msg.t === 'fantasyContractBoard'))).board, null);
  alice.send({ t: 'join', sid: 'test-world' }); bob.send({ t: 'join', sid: 'test-world' });
  from = alice.messages.length; alice.send({ t: 'fantasyContracts' });
  const board = (await until(() => alice.messages.slice(from).find(msg => msg.board?.offers.length))).board!;
  const offer = board.offers.find(offer => offer.available && offer.mode === 'exclusive')!; assert.ok(offer);
  from = alice.messages.length; alice.send({ t: 'fantasyAction', revision: 1, action: { type: 'accept', quest: offer.quest } });
  assert.ok((await until(() => alice.messages.slice(from).find(msg => msg.t === 'fantasyProfile'))).error);
  const sameFrom = same.messages.length; from = alice.messages.length;
  alice.send({ t: 'fantasyAction', revision: 1, action: { type: 'accept', quest: offer.quest, offer: offer.id }, contract: { gold: 999999 }, profile: { gold: 999999 } });
  const accepted = (await until(() => alice.messages.slice(from).find(msg => msg.profile?.character?.quests.includes(offer.quest)))).profile!;
  assert.equal(accepted.character!.contracts![offer.quest].gold, offer.gold);
  assert.deepEqual((await until(() => same.messages.slice(sameFrom).find(msg => msg.profile?.character?.quests.includes(offer.quest)))).profile, accepted);
  from = bob.messages.length; bob.send({ t: 'fantasyAction', revision: 1, action: { type: 'accept', quest: offer.quest, offer: offer.id } });
  const rejected = await until(() => bob.messages.slice(from).find(msg => msg.t === 'fantasyProfile'));
  assert.ok(rejected.error); assert.equal(rejected.profile!.character!.quests.includes(offer.quest), false);
  assert.equal(readFantasySavedProfiles(file).alice.character!.contracts![offer.quest].gold, offer.gold);
});
