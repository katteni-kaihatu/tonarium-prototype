import test from 'node:test';
import assert from 'node:assert/strict';
import { FantasyParty, type FantasyPartyActor } from './fantasy-party.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { beginFantasyDowned, wakeFantasyDowned } from '../shared/fantasy-downed.ts';
import { fantasyTestAcceptHunt } from './fantasy-test-combat-access.ts';
function fixture() {
  const actors = new Map<string, FantasyPartyActor>(['a', 'b'].map(id => { const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: id }, () => .99).profile; profile.character!.job = 'warrior'; profile.character!.jobXp.warrior = 0; profile.character!.level = 12; profile.character!.location = 'greenwood'; profile.character!.visited.push('greenwood'); return [id, { id, name: id, session: 'same', world: 'fantasy', profile: fantasyTestAcceptHunt(profile) }]; }));
  let now = 1000, snapshot: unknown;
  const options = { lookup: (id: string) => actors.get(id), start: () => ({ updates: [] }), startCombat: () => ({ updates: [] }), startTravel: () => ({ updates: [] }), now: () => now, save: (saved: unknown) => { snapshot = structuredClone(saved); return true; } };
  let party = new FantasyParty(options); const request = (id: string, command: unknown) => { now += 1001; return party.request(id, command); };
  assert.equal(request('a', { type: 'create' }).error, undefined); assert.equal(request('a', { type: 'invite', target: 'b' }).error, undefined); const invite = party.state('b').invitations[0]; assert.equal(request('b', { type: 'respond', invite: invite.id, accept: true }).error, undefined);
  return { actors, get party() { return party; }, request, restart: () => { party = new FantasyParty({ ...options, load: () => snapshot }); } };
}
test('downed members remain authoritative allies through state sweeps, restart and waking, with every action blocked while downed', () => {
  const f = fixture(), id = f.party.state('a').id; const b = f.actors.get('b')!.profile; b.character!.hp = 0; beginFantasyDowned(b, b.character!.hour);
  f.party.sweep(); assert.equal(f.party.state('b').id, id); assert.deepEqual(f.party.state('a').members.map(member => member.id), ['a', 'b']);
  f.actors.get('b')!.session = null; assert.equal(f.party.state('a').members.length, 2); f.actors.get('b')!.session = 'same';
  for (const command of [{ type: 'chat', text: 'hello' }, { type: 'readyCombat', source: 'hunt', target: 'monster-forest-wolf' }, { type: 'readyTravel', destination: 'greenwood', transport: 'foot' }, { type: 'combatDecision', proposal: 'old', revision: 0, decision: 'accept' }, { type: 'leave' }]) assert.equal(f.request('b', command).error, 'not-alive');
  f.restart(); assert.equal(f.party.state('b').id, id); assert.equal(wakeFantasyDowned(b, 20), true); assert.equal(f.request('b', { type: 'chat', text: 'awake' }).error, undefined); assert.equal(f.party.state('a').members.length, 2);
});
test('a downed leader stays in the party without retaining actionable proposals or votes', () => {
  const f = fixture(); assert.equal(f.request('a', { type: 'readyCombat', source: 'hunt', target: 'monster-forest-wolf' }).error, undefined); const proposal = f.party.state('b').combatProposal!; assert.ok(proposal);
  assert.equal(f.request('b', { type: 'combatDecision', proposal: proposal.id, revision: proposal.revision, decision: 'accept' }).error, undefined);
  const a = f.actors.get('a')!.profile; a.character!.hp = 0; beginFantasyDowned(a, a.character!.hour); f.party.sweep();
  const state = f.party.state('b'); assert.equal(state.members.find(member => member.id === 'a')?.isLeader, true); assert.equal(state.combatProposal, undefined); assert.ok(!state.members.some(member => member.ready)); assert.equal(state.canStartCombat ?? false, false);
  assert.equal(f.request('a', { type: 'startCombat' }).error, 'not-alive'); assert.equal(wakeFantasyDowned(a, 20), true); assert.equal(f.request('a', { type: 'chat', text: 'awake leader' }).error, undefined);
});
test('permanent death and moving to a different fantasy session still remove membership', () => {
  for (const cause of ['death', 'offline-death', 'session', 'world'] as const) { const f = fixture(), b = f.actors.get('b')!;
    if (cause === 'death' || cause === 'offline-death') { b.profile.character!.hp = 0; b.profile.death = { hour: b.profile.character!.hour, location: b.profile.character!.location, cause: 'test' }; if (cause === 'offline-death') b.session = null; } else if (cause === 'session') b.session = 'elsewhere'; else b.world = 'other';
    f.party.sweep(); assert.equal(f.party.state('b').id, null); assert.deepEqual(f.party.state('a').members.map(member => member.id), ['a']);
  }
});


test('a living leader cannot assign leadership or begin a new combat proposal while a member is downed', () => {
  const f = fixture(), b = f.actors.get('b')!.profile; b.character!.hp = 0; beginFantasyDowned(b, b.character!.hour);
  assert.equal(f.request('a', { type: 'transferLeader', target: 'b' }).error, 'incompatible');
  assert.equal(f.request('a', { type: 'readyCombat', source: 'hunt', target: 'monster-forest-wolf' }).error, 'incompatible'); assert.equal(f.party.state('a').combatProposal, undefined);
});
