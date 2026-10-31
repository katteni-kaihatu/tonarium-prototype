import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FantasyParty, type FantasyPartyActor } from './fantasy-party.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { fantasyQuestInstitution } from '../shared/fantasy-institutions.ts';
import type { FantasyCombatPlan } from './fantasy-store.ts';

function fixture() {
  const q = FANTASY_QUESTS.find(q => q.group && q.objective?.type === 'hunt' && fantasyQuestInstitution(q) === 'guild')!;
  assert.ok(q);
  const actors = new Map<string, FantasyPartyActor>(), signed = new Set(['owner', 'priest', 'thief']); let plans: FantasyCombatPlan[] = [], hour = 8;
  for (const [id, job] of [['owner', 'warrior'], ['priest', 'priest'], ['thief', 'thief']]) {
    const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: id, gender: 'female' }, () => .5).profile, c = p.character!;
    Object.assign(c, { job, hour: 8, location: q.destination, quests: [q.id], inventory: { lantern: 1 } });
    c.contracts = { [q.id]: { offerId: 'offer-consented-guild', issuer: q.issuer ?? 'guild-contact', boardLocation: 'hearth', acceptedAt: 2, expiresAt: Number.MAX_SAFE_INTEGER, progress: 0, gold: 100, startsAt: 8 } };
    if (id === 'owner') c.guildProgress = { version: 1, grade: 1, completedAtGrade: 0, creditedQuests: [] };
    actors.set(id, { id, name: id, session: 'same', world: 'fantasy', profile: p });
  }
  const party = new FantasyParty({ lookup: id => actors.get(id), start: () => ({ updates: [] }), worldHour: () => hour, guildContract: (user, offer) => signed.has(user) && offer === 'offer-consented-guild', startCombat: current => { plans = current; return { updates: current.map(plan => ({ user: plan.user, profile: actors.get(plan.user)!.profile })) }; } });
  assert.equal(party.request('owner', { type: 'create' }).error, undefined);
  for (const id of ['priest', 'thief']) { assert.equal(party.request('owner', { type: 'invite', target: id }).error, undefined); const invite = party.state(id).invitations[0].id; assert.equal(party.request(id, { type: 'respond', invite, accept: true }).error, undefined); }
  return { party, actors, signed, q, plans: () => plans, setHour: (value: number) => { hour = value; } };
}

test('guild raid companions consent individually and a priest or criminal may sit out without being forced into combat', () => {
  const f = fixture();
  assert.equal(f.party.request('owner', { type: 'readyCombat', source: 'guild', target: 'offer-consented-guild' }).error, undefined);
  assert.equal(f.party.request('owner', { type: 'startCombat' }).error, 'not-ready'); assert.deepEqual(f.plans(), []);
  const proposal = f.party.state('priest').combatProposal!;
  assert.equal(f.party.request('priest', { type: 'combatDecision', proposal: proposal.id, revision: proposal.revision, decision: 'accept' }).error, undefined);
  assert.equal(f.party.request('thief', { type: 'combatDecision', proposal: proposal.id, revision: proposal.revision, decision: 'sit-out' }).error, undefined);
  assert.equal(f.party.request('owner', { type: 'startCombat' }).error, undefined);
  assert.deepEqual(f.plans().map(plan => plan.user), ['owner', 'priest']);
  assert.ok(f.plans().every(plan => plan.source === 'guild' && plan.target === 'offer-consented-guild'));
});

test('guild muster and expiry use the shared world clock while idle profiles await synchronization', () => {
  const f = fixture(); f.actors.get('owner')!.profile.character!.hour = 7;
  assert.equal(f.party.request('owner', { type: 'readyCombat', source: 'guild', target: 'offer-consented-guild' }).error, undefined);
  const grant = f.actors.get('owner')!.profile.character!.contracts![f.q.id]; grant.expiresAt = 9;
  f.setHour(9); assert.equal(f.party.state('owner').combatProposal, undefined);
});

test('guild raid consent rejects forged offers, unsigned copied grants, and stale enrollment', () => {
  const f = fixture();
  assert.ok(f.party.request('owner', { type: 'readyCombat', source: 'guild', target: 'offer-forged' }).error);
  assert.equal(f.party.request('owner', { type: 'readyCombat', source: 'guild', target: 'offer-consented-guild' }).error, undefined);
  const proposal = f.party.state('priest').combatProposal!; f.signed.delete('priest');
  assert.equal(f.party.request('priest', { type: 'combatDecision', proposal: proposal.id, revision: proposal.revision, decision: 'accept' }).error, 'incompatible');
  assert.deepEqual(f.plans(), []);
  delete f.actors.get('owner')!.profile.character!.contracts![f.q.id];
  assert.equal(f.party.state('owner').combatProposal, undefined);
});

test('signed mixed-party leader may propose the owner’s raid but another member’s decline cancels the proposal', () => {
  const f = fixture();
  assert.equal(f.party.request('owner', { type: 'transferLeader', target: 'thief' }).error, undefined);
  assert.equal(f.party.request('thief', { type: 'readyCombat', source: 'guild', target: 'offer-consented-guild' }).error, undefined);
  const proposal = f.party.state('owner').combatProposal!;
  assert.equal(f.party.request('owner', { type: 'combatDecision', proposal: proposal.id, revision: proposal.revision, decision: 'decline' }).error, undefined);
  assert.equal(f.party.state('thief').combatProposal, undefined); assert.deepEqual(f.plans(), []);
});
