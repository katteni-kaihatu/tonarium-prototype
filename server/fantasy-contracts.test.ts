import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FantasyContracts, type FantasyContractActor } from './fantasy-contracts.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
import { FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { NPC_PUBLIC } from '../shared/npc.ts';
import { fantasyContractCandidates, fantasyContractIssuer, fantasyContractErrorText, fantasyPersonalQuest, type FantasyContractGrant, type FantasyContractVisibleOffer } from '../shared/fantasy-contracts.ts';

function file(t: { after(fn: () => void): void }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-contracts-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true })); return path.join(directory, 'contracts.json');
}
function actor(id: string): FantasyContractActor & { character: NonNullable<FantasyProfile['character']> } {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: id, gender: 'female' }, () => .999).profile;
  return { id, session: 'fantasy', world: 'fantasy', character: profile.character! };
}
function opening(service: FantasyContracts, user: ReturnType<typeof actor>, mode: 'exclusive' | 'raid' = 'exclusive') {
  for (let now = 8; now < 608; now += 6) {
    user.character.hour = now;
    const offer = service.state(user, now)?.offers.find(offer => offer.available && offer.mode === mode);
    if (offer) return { offer, now };
  }
  throw new Error(`No eligible ${mode} offer generated`);
}
function committed(user: ReturnType<typeof actor>, offer: FantasyContractVisibleOffer, grant: FantasyContractGrant): FantasyProfile {
  const profile = newFantasyProfile(); profile.character = structuredClone(user.character); profile.revision = 1;
  profile.character.quests.push(offer.quest); (profile.character.contracts ??= {})[offer.quest] = grant;
  return profile;
}

test('seeded postings are shared across users, have real local issuers and never publish personal story chapters', t => {
  const service = new FantasyContracts(file(t)); const alice = actor('alice'); const bob = actor('bob');
  const a = service.state(alice, 8)!; const b = service.state(bob, 8)!;
  assert.deepEqual(a, b); assert.ok(a.offers.length <= 3);
  for (const offer of a.offers) {
    const quest = FANTASY_QUESTS.find(q => q.id === offer.quest)!;
    assert.equal(fantasyPersonalQuest(quest), false);
    assert.ok(NPC_PUBLIC.some(npc => npc.id === offer.issuer && npc.homeLocation === quest.giver));
    assert.equal(offer.expiresAt - offer.createdAt, 12); assert.equal(offer.deadline - offer.createdAt, 36);
  }
  assert.deepEqual(new FantasyContracts((service as unknown as { file: string }).file).state(alice, 8), a);
});

test('exclusive claim is persisted before profile mutation and concurrent or repeated claims cannot double-accept', t => {
  const profiles = new Map<string, FantasyProfile>(); const service = new FantasyContracts(file(t), { lookup: user => profiles.get(user) ?? newFantasyProfile() });
  const alice = actor('alice'); const bob = actor('bob'); const { offer, now } = opening(service, alice);
  let competing: string | undefined; let calls = 0;
  const first = service.claim(alice, { quest: offer.quest, offer: offer.id }, now, grant => {
    competing = service.claim(bob, { quest: offer.quest, offer: offer.id }, now, () => { throw new Error('Cannot reach a second profile transaction'); }).error;
    calls++; const profile = committed(alice, offer, grant); profiles.set(alice.id, profile); return { profile, changed: true };
  });
  assert.equal(first.error, undefined); assert.equal(competing, 'taken'); assert.equal(calls, 1);
  assert.equal(service.claim(alice, { quest: offer.quest, offer: offer.id }, now, () => { throw new Error('duplicate'); }).error, 'already');
  const visible = service.state(bob, now)!.offers.find(value => value.id === offer.id)!;
  assert.equal(visible.available, false); assert.equal(visible.participants, 1);
  assert.ok(!JSON.stringify(visible).includes('alice')); assert.ok(!JSON.stringify(visible).includes('claims'));
});

test('only explicitly cooperative raids let multiple players join the same offer', t => {
  const saved = file(t); const alice = actor('alice'); const bob = actor('bob');
  const initial = opening(new FantasyContracts(saved), alice);
  const quest = FANTASY_QUESTS.find(quest => quest.id === initial.offer.quest)!; const prior = quest.group; const objective = quest.objective;
  quest.group = true; quest.objective = { type: 'hunt', monster: 'monster-goblin-raider', count: 4 };
  try {
    const service = new FantasyContracts(`${saved}.raid`); const { offer, now } = opening(service, alice, 'raid');
    for (const user of [alice, bob]) {
      const result = service.claim(user, { quest: offer.quest, offer: offer.id }, now, grant => ({ profile: committed(user, offer, grant), changed: true }));
      assert.equal(result.error, undefined);
    }
    assert.equal(service.state(actor('carol'), now)!.offers.find(value => value.id === offer.id)!.participants, 2);
    alice.character.location = quest.destination;
    service.recordHunt(alice, 2, now, 'raid:one', 'monster-goblin-raider');
    assert.equal(service.progress('alice', offer.id), 2); assert.equal(service.progress('bob', offer.id), 2);
    service.recordHunt(alice, 2, now, 'raid:one', 'monster-goblin-raider');
    assert.equal(service.progress('bob', offer.id), 2);
  } finally { if (prior === undefined) delete quest.group; else quest.group = prior; if (objective === undefined) delete quest.objective; else quest.objective = objective; }
});

test('profile save rejection rolls back the reservation and a different player may then claim it', t => {
  const service = new FantasyContracts(file(t)); const alice = actor('alice'); const bob = actor('bob'); const { offer, now } = opening(service, alice);
  const rejected = service.claim(alice, { quest: offer.quest, offer: offer.id }, now, () => ({ profile: newFantasyProfile(), changed: false, error: 'disk' }));
  assert.equal(rejected.result!.changed, false);
  assert.equal(service.claim(bob, { quest: offer.quest, offer: offer.id }, now, grant => ({ profile: committed(bob, offer, grant), changed: true })).error, undefined);
});

test('crash after profile commit leaves a locked durable pending claim which restart reconciles to accepted', t => {
  const saved = file(t); const profiles = new Map<string, FantasyProfile>(); let failFinal = false;
  const service = new FantasyContracts(saved, { lookup: user => profiles.get(user) ?? newFantasyProfile(), onError: () => {}, save: (file, text) => {
    if (failFinal && text.includes('"phase":"accepted"')) throw new Error('final write interrupted'); fs.writeFileSync(file, text);
  } });
  const alice = actor('alice'); const bob = actor('bob'); const { offer, now } = opening(service, alice);
  failFinal = true;
  const result = service.claim(alice, { quest: offer.quest, offer: offer.id }, now, grant => {
    const profile = committed(alice, offer, grant); profiles.set(alice.id, profile); return { profile, changed: true };
  });
  assert.equal(result.pending, true); assert.equal(result.result!.changed, true);
  const restarted = new FantasyContracts(saved, { lookup: user => profiles.get(user) ?? newFantasyProfile() });
  assert.equal(restarted.claim(bob, { quest: offer.quest, offer: offer.id }, now, () => { throw new Error('occupied'); }).error, 'taken');
  assert.ok(fs.readFileSync(saved, 'utf8').includes('"phase":"accepted"'));
});

test('crash before profile commit restores availability and an expired posting cannot be accepted', t => {
  const saved = file(t); let failRollback = false;
  const service = new FantasyContracts(saved, { onError: () => {}, save: (file, text) => { if (failRollback && !text.includes('"phase":"pending"')) throw new Error('rollback interrupted'); fs.writeFileSync(file, text); } });
  const alice = actor('alice'); const { offer, now } = opening(service, alice); failRollback = true;
  assert.equal(service.claim(alice, { quest: offer.quest, offer: offer.id }, now, () => ({ profile: newFantasyProfile(), changed: false })).pending, true);
  const restarted = new FantasyContracts(saved, { lookup: () => newFantasyProfile() });
  assert.equal(restarted.state(alice, now)!.offers.find(value => value.id === offer.id)!.available, true);
  assert.equal(restarted.claim(alice, { quest: offer.quest, offer: offer.id }, offer.expiresAt, () => { throw new Error('expired'); }).error, 'expired');
});

test('guild membership, current location, ancestry and profession remain authoritative for claims', t => {
  const service = new FantasyContracts(file(t)); const alice = actor('alice'); const { offer, now } = opening(service, alice);
  const no = () => { throw new Error('Unqualified claim must not reach profile mutation'); };
  assert.equal(service.claim({ ...alice, session: null }, { quest: offer.quest, offer: offer.id }, now, no).error, 'invalid');
  const outside = actor('outside'); outside.character.location = 'greenwood';
  assert.equal(service.claim(outside, { quest: offer.quest, offer: offer.id }, now, no).error, 'guildOnly');
  assert.equal(service.claim(alice, { quest: 'made-up', offer: offer.id }, now, no).error, 'expired');
  assert.equal(service.state({ ...alice, world: 'city' }, now), null);
});

test('recorded hunts lower regional pressure, deduplicate receipts and pressure recovers over shared time', t => {
  const saved = file(t); const service = new FantasyContracts(saved); const hunter = actor('hunter');
  const before = service.state(hunter, 8)!.environment.monsterPressure;
  assert.equal(service.recordHunt(hunter, 10, 8, 'hunt:1'), true);
  const after = service.state(hunter, 8)!.environment;
  assert.equal(after.monsterPressure, before - 20); assert.ok(after.bountyMultiplier < 1);
  service.recordHunt(hunter, 10, 8, 'hunt:1'); assert.equal(service.state(hunter, 8)!.environment.monsterPressure, after.monsterPressure);
  assert.equal(new FantasyContracts(saved).state(hunter, 14)!.environment.monsterPressure, after.monsterPressure + 2);
});

test('depleted hunting grounds suppress new bounty postings without cancelling existing contracts and recover over time', t => {
  const saved = file(t), depletedFile = `${saved}.depleted`, hunter = actor('pressure-hunter'); hunter.character.hour = 20;
  const baseline = new FantasyContracts(saved); const original = baseline.state(hunter, 20)!;
  const hunting = original.offers.find(offer => FANTASY_QUESTS.find(quest => quest.id === offer.quest)?.objective?.type === 'hunt');
  assert.ok(hunting, 'The baseline cycle must include a bounty at normal pressure');
  const destinations = [...new Set(FANTASY_QUESTS.filter(quest => quest.objective?.type === 'hunt').map(quest => quest.destination))];
  const deplete = (service: FantasyContracts) => {
    for (const location of destinations) assert.ok(service.recordHunt({ ...hunter, character: { ...hunter.character, location } }, 25, 20, `deplete:${location}`));
  };
  deplete(baseline);
  assert.deepEqual(baseline.state(hunter, 20)!.offers, original.offers, 'Previously posted rewards and reservations remain unchanged');
  const depleted = new FantasyContracts(depletedFile); deplete(depleted);
  const board = depleted.state(hunter, 20)!;
  assert.ok(board.offers.length > 0, 'Ordinary delivery contracts can still be posted');
  assert.ok(board.offers.every(offer => FANTASY_QUESTS.find(quest => quest.id === offer.quest)?.objective?.type !== 'hunt'));
  assert.deepEqual(new FantasyContracts(depletedFile).state(hunter, 20), board);
  hunter.character.hour = 170;
  const recovered = new FantasyContracts(depletedFile).state(hunter, 170)!;
  const normal = new FantasyContracts(`${saved}.recovered`).state(hunter, 170)!;
  assert.deepEqual(recovered.offers, normal.offers, 'Twenty-five recovery cycles restore the ordinary posting pool and rewards');
});

test('partial monster pressure lowers deterministic bounty frequency equally for all players and restarts', t => {
  const saved = file(t), user = actor('frequency-reader');
  const destinations = [...new Set(FANTASY_QUESTS.filter(quest => quest.objective?.type === 'hunt').map(quest => quest.destination))];
  const totals = [0, 0, 0];
  for (let cycle = 0; cycle < 40; cycle++) {
    const now = 8 + cycle * 6; user.character.hour = now;
    for (let scenario = 0; scenario < totals.length; scenario++) {
      let text = '';
      const service = new FantasyContracts(`${saved}.${scenario}.${cycle}`, { save: (_file, content) => { text = content; } });
      if (scenario) for (const location of destinations) service.recordHunt({ ...user, character: { ...user.character, location } }, scenario === 1 ? 13 : 25, now, `frequency:${location}:${cycle}`);
      const board = service.state(user, now)!;
      totals[scenario] += board.offers.filter(offer => FANTASY_QUESTS.find(quest => quest.id === offer.quest)?.objective?.type === 'hunt').length;
      assert.deepEqual(service.state({ ...user, id: 'other-reader' }, now)!.offers, board.offers);
      if (scenario === 1 && cycle === 0) {
        const snapshot = `${saved}.partial`; fs.writeFileSync(snapshot, text);
        assert.deepEqual(new FantasyContracts(snapshot).state(user, now)!.offers, board.offers);
      }
    }
  }
  assert.ok(totals[0] > 0); assert.ok(totals[1] > 0);
  assert.ok(totals[1] < totals[0], `Normal/partial/depleted posting totals: ${totals}`);
  assert.equal(totals[2], 0);
});

test('seasonal pools exclude winter-only postings outside winter and use real fifteen-day seasons', t => {
  const service = new FantasyContracts(file(t)); const user = actor('reader');
  assert.equal(service.state(user, 0)!.environment.season, 'spring');
  assert.equal(service.state(user, 15 * 24)!.environment.season, 'summer');
  assert.equal(service.state(user, 45 * 24)!.environment.season, 'winter');
  for (const quest of fantasyContractCandidates('hearth', 8, 'spring', 1)) assert.ok(!quest.seasons || quest.seasons.includes('spring'));
  assert.ok(fantasyContractCandidates('inkstone-city', 8, 'spring', 1).some(quest => ['mooncity', 'dawnport'].includes(quest.giver)), 'The new Noctis guild brokers its own continental requests');
  assert.ok(!fantasyContractCandidates('hearth', 8, 'spring', 1).some(quest => ['mooncity', 'dawnport', 'pinewatch'].includes(quest.giver)), 'A continent with its own guild does not need foreign brokerage');
  assert.ok(FANTASY_QUESTS.every(quest => !fantasyContractIssuer(quest) || NPC_PUBLIC.some(npc => npc.id === fantasyContractIssuer(quest) && npc.homeLocation === quest.giver)));
});

test('corrupt board state is preserved and all public errors have Korean English and Japanese text', t => {
  const saved = file(t); const original = '{"version":1,"revision":0,"offers":[null],"generated":{},"pressure":{},"hunts":[]}'; fs.writeFileSync(saved, original);
  const service = new FantasyContracts(saved, { onError: () => {} }); assert.equal(service.loadError, 'unavailable');
  assert.equal(service.claim(actor('safe'), { quest: 'anything', offer: 'anything' }, 8, () => { throw new Error('corrupt'); }).error, 'unavailable');
  assert.equal(fs.readFileSync(saved, 'utf8'), original);
  for (const error of ['invalid', 'guildOnly', 'taken', 'expired', 'conditions', 'already', 'unavailable'] as const) for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(fantasyContractErrorText(error, locale));
});

test('the actual engine requires a trusted grant for an offer and accepts at a broker guild while keeping the original delivery giver', () => {
  const quest = FANTASY_QUESTS.find(q => q.giver === 'dawnport' && !q.races && !q.families && !q.jobs && !fantasyPersonalQuest(q))!;
  assert.ok(quest);
  const profile = newFantasyProfile(); profile.character = actor('broker-user').character;
  const grant: FantasyContractGrant = { offerId: 'offer-test', issuer: fantasyContractIssuer(quest)!, boardLocation: 'hearth', acceptedAt: 8, expiresAt: 44, progress: 0, gold: quest.gold };
  const action = { type: 'accept' as const, quest: quest.id, offer: grant.offerId };
  assert.ok(applyFantasyAction(profile, action, () => .999).error);
  const accepted = applyFantasyAction(profile, action, () => .999, { contract: grant });
  assert.equal(accepted.error, undefined);
  assert.equal(accepted.profile.character!.contracts![quest.id].boardLocation, 'hearth');
  assert.equal(FANTASY_QUESTS.find(q => q.id === quest.id)!.giver, 'dawnport');
});
