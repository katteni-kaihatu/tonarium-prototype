import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { FANTASY_MAIN_QUESTS } from '../shared/fantasy-second-content.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';

function file(t: TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-gate-migration-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith('tonarium-gate-migration-')); fs.rmSync(directory, { recursive: true, force: true }); });
  return path.join(directory, 'fantasy.json');
}
function queued(from = 'hearth', destination = 'greenwood', hours = 1): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'Old traveler' }, () => .5).profile;
  p.character!.location = from; if (!p.character!.visited.includes(from)) p.character!.visited.push(from);
  p.character!.completed = FANTASY_MAIN_QUESTS.filter(quest => quest.chapter! <= 12).map(quest => quest.id);
  p.character!.quests = ['main-night-13']; p.character!.hour = 8 + Math.min(.5, hours / 2);
  p.activity = { action: { type: 'travel', destination, transport: 'gate' }, startedAt: 8, endsAt: 8 + hours, seed: 42 };
  return p;
}

test('legacy one-hour gate reservations are cancelled without arrival, payment, rewards or any character rewrite', t => {
  const target = file(t);
  for (const [from, destination] of [['hearth', 'greenwood'], ['greenwood', 'mooncity'], ['mooncity', 'hearth']]) {
    const old = queued(from, destination), before = structuredClone(old.character), revision = old.revision;
    fs.writeFileSync(target, JSON.stringify({ user: old }));
    const store = new FantasyStore(target, { onError: () => {} }); assert.equal(store.loadError, undefined);
    const current = store.profile('user'); assert.equal(current.activity, undefined); assert.deepEqual(current.character, before);
    assert.equal(current.revision, revision + 1); assert.ok(current.log.some(entry => /旧仕様の転移予約を解除/.test(entry.text)));
    assert.equal(current.character!.mainTrials, undefined); assert.equal(current.character!.completed.length, 12);
    assert.deepEqual(new FantasyStore(target).profile('user'), current);
  }
});

test('malformed new gate reservations remain errors and are never disguised as a legacy cancellation', t => {
  const target = file(t);
  const bad = [queued('greenwood', 'mooncity', .25), queued('hearth', 'greenwood', .25), queued('hearth', 'mooncity', .5), queued('hearth', 'mooncity', 2), queued('hearth', 'not-a-place', 1)];
  const extra = queued(); (extra.activity!.action as unknown as Record<string, unknown>).fare = 0; bad.push(extra);
  for (const profile of bad) {
    const bytes = JSON.stringify({ bad: profile }); fs.writeFileSync(target, bytes);
    const store = new FantasyStore(target, { onError: () => {} }); assert.ok(store.loadError);
    assert.equal(fs.readFileSync(target, 'utf8'), bytes);
  }
});

test('valid new quarter-hour gate reservations stay pending and retain their personal investigation state', t => {
  const target = file(t), p = queued('hearth', 'mooncity', .25); p.character!.gold = 2000;
  p.character!.mainTrials = { 'main-night-13': { acceptedAt: 8, proofs: [], attempts: 0 } };
  fs.writeFileSync(target, JSON.stringify({ user: p }));
  const store = new FantasyStore(target, { onError: () => {} }); assert.equal(store.loadError, undefined); assert.deepEqual(store.profile('user'), p);
});
