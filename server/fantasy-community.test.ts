import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyCommunity, type CommunityActor } from './fantasy-community.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';

function fixture(t: { after(fn: () => void): void }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-community-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, 'community.json');
}
function actor(id = 'alice', location = 'hearth'): CommunityActor {
  const character = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: id, gender: 'female' }, () => .999).profile.character!;
  character.location = location;
  return { id, session: 'game', world: 'fantasy', character };
}
const request = (revision = 0, npcId = 'rin', requestId = crypto.randomUUID()) => ({ revision, npcId, requestId });

test('shared contributions survive restart and three players create a real local NPC cooperation notice', t => {
  const file = fixture(t); let service = new FantasyCommunity(file);
  const players = [actor('alice'), actor('bob'), actor('carol')];
  for (const [revision, player] of players.entries()) {
    assert.equal(service.contribute(player, request(revision)).error, undefined);
    service = new FantasyCommunity(file);
  }
  const state = service.state(players[0])!;
  assert.equal(state.revision, 3);
  assert.equal(state.projects.find(p => p.id === 'supplies')!.completions, 1);
  assert.equal(state.notices.length, 1);
  assert.equal(state.notices[0].npcIds.length, 2);
  assert.ok(service.facts(players[1], 'ko').some(fact => fact.includes('린')));
  assert.deepEqual(service.state(actor('other', 'emberhall'))!.notices, []);
  assert.ok(!JSON.stringify(state).includes('alice'));
  assert.ok(!JSON.stringify(state).includes('requests'));
});

test('revision races, duplicate requests, owner cooldown and active actions cannot double-count progress', t => {
  const service = new FantasyCommunity(fixture(t)); const alice = actor();
  const first = request(0);
  assert.equal(service.contribute(alice, first).error, undefined);
  assert.equal(service.contribute(alice, first).error, 'duplicate');
  assert.equal(service.contribute(actor('bob'), request(0)).error, 'stale');
  assert.equal(service.contribute(alice, request(1)).error, 'cooldown');
  assert.equal(service.contribute({ ...actor('bob'), busy: true }, request(1)).error, 'busy');
  alice.character!.hour += 6;
  assert.equal(service.contribute(alice, request(1)).error, undefined);
  assert.equal(service.state(alice)!.revision, 2);
});

test('membership and current local NPC permissions come only from server actor context', t => {
  const service = new FantasyCommunity(fixture(t)); const user = actor();
  for (const bad of [{ ...user, session: null }, { ...user, world: 'city' }, { ...user, character: undefined }]) assert.equal(service.contribute(bad, request()).error, 'invalid');
  assert.equal(service.contribute(user, request(0, 'borin')).error, 'invalid');
  assert.equal(service.contribute(user, request(0, '__proto__')).error, 'invalid');
  assert.equal(service.contribute(user, request(0, 'unknown-npc')).error, 'invalid');
  assert.equal(service.contribute(actor('local', 'sunmeadow'), request(0, 'sunmeadow-lark')).error, undefined);
  assert.equal(service.state({ ...user, world: 'city' }), null);
});

test('save failure leaves shared revision and private idempotency receipts untouched for a safe retry', t => {
  let fail = true; const file = fixture(t);
  const service = new FantasyCommunity(file, { save: (file, text) => { if (fail) throw new Error('disk'); fs.writeFileSync(file, text); }, onError: () => {} });
  const user = actor(); const same = request();
  assert.equal(service.contribute(user, same).error, 'unavailable');
  assert.equal(service.state(user)!.revision, 0);
  fail = false;
  assert.equal(service.contribute(user, same).error, undefined);
  assert.equal(new FantasyCommunity(file).contribute(user, same).error, 'duplicate');
});

test('corrupt shared state stays on disk and cannot be silently replaced', t => {
  const file = fixture(t); const original = '{"version":1,"revision":99,"players":{},"projects":{},"notices":[null]}';
  fs.writeFileSync(file, original);
  const service = new FantasyCommunity(file, { onError: () => {} });
  assert.equal(service.loadError, 'unavailable');
  assert.equal(service.contribute(actor(), request()).error, 'unavailable');
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});
