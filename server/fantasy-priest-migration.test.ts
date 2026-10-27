import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { FANTASY_QUESTS } from '../shared/fantasy-data.ts';

function fixture(t: TestContext) {
  const prefix = path.join(os.tmpdir(), 'tonarium-priest-');
  const directory = fs.mkdtempSync(prefix);
  t.after(() => { if (!path.resolve(directory).startsWith(path.resolve(prefix))) throw new Error('Unexpected test path'); fs.rmSync(directory, { recursive: true, force: true }); });
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Faithful', gender: 'female' }, () => .999).profile;
  return { file: path.join(directory, 'fantasy.json'), profile };
}

test('healer progress and pending event migrate to priest once without new supplies or lost proficiency', t => {
  const { file, profile } = fixture(t);
  const c = profile.character!;
  c.job = 'healer'; c.jobXp = { unassigned: 2, healer: 37, merchant: 8 };
  c.hp = 42; c.mp = 11; c.gold = 172;
  profile.revision = 14; profile.event = 'healer-pilgrims';
  profile.activity = { action: { type: 'event', choice: 'remedy' }, startedAt: c.hour, endsAt: c.hour + 2, seed: 19 };
  fs.writeFileSync(file, JSON.stringify({ faithful: profile }));
  const errors: unknown[] = [];
  const store = new FantasyStore(file, { onError: error => errors.push(error) });
  const restored = store.profile('faithful');
  assert.deepEqual(errors, []);
  assert.equal(restored.character!.job, 'priest');
  assert.deepEqual(restored.character!.jobXp, { unassigned: 2, merchant: 8, priest: 37 });
  for (const key of ['gold', 'hp', 'mp', 'inventory', 'quests', 'completed', 'location', 'hour'] as const) assert.deepEqual(restored.character![key], c[key]);
  assert.equal(restored.event, 'priest-pilgrims');
  assert.deepEqual(restored.activity, profile.activity);
  assert.equal(restored.revision, 14);
  assert.deepEqual(restored.log, profile.log);
  const once = fs.readFileSync(file, 'utf8');
  assert.deepEqual(new FantasyStore(file).profile('faithful'), restored);
  assert.equal(fs.readFileSync(file, 'utf8'), once);
});

test('historical healer proficiency and scheduled learning migrate even while another job is active', t => {
  const { file, profile } = fixture(t);
  profile.character!.job = 'merchant';
  profile.character!.jobXp = { unassigned: 0, healer: 9, merchant: 12 };
  profile.activity = { action: { type: 'job', job: 'healer', via: 'gm' }, startedAt: 8, endsAt: 9, seed: 99 };
  fs.writeFileSync(file, JSON.stringify({ traveler: profile }));
  const errors: unknown[] = [];
  const restored = new FantasyStore(file, { onError: error => errors.push(error) }).profile('traveler');
  assert.deepEqual(errors, []);
  assert.equal(restored.character!.job, 'merchant');
  assert.deepEqual(restored.character!.jobXp, { unassigned: 0, merchant: 12, priest: 9 });
  assert.deepEqual(restored.activity?.action, { type: 'job', job: 'priest', via: 'gm' });
});

test('invalid legacy proficiency remains a corrupt save instead of being repaired into valid progress', t => {
  const { file, profile } = fixture(t);
  profile.character!.job = 'healer'; profile.character!.jobXp = { healer: -1 };
  const original = JSON.stringify({ broken: profile }); fs.writeFileSync(file, original);
  const errors: unknown[] = [];
  const store = new FantasyStore(file, { onError: error => errors.push(error) });
  assert.ok(errors.length);
  assert.equal(store.profile('broken').character, null);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});

test('an accepted profession quest survives changing jobs and reload but cannot be completed in the wrong job', t => {
  const quest = FANTASY_QUESTS.find(quest => quest.jobs?.includes('carpenter'))!;
  assert.ok(quest, 'A carpenter contract must be registered');
  const { file, profile } = fixture(t);
  const c = profile.character!;
  c.job = 'carpenter'; c.jobXp.carpenter = 0; c.location = quest.giver;
  c.visited = [...new Set([...c.visited, quest.giver, quest.destination])];
  c.completed = [...(quest.requiresCompleted ?? [])];
  const accepted = applyFantasyAction(profile, { type: 'accept', quest: quest.id }, () => .999);
  assert.equal(accepted.error, undefined);
  const switched = applyFantasyAction(accepted.profile, { type: 'job', job: 'merchant', via: 'gm' }, () => .999);
  assert.equal(switched.error, undefined);
  fs.writeFileSync(file, JSON.stringify({ artisan: switched.profile }));
  const errors: unknown[] = [];
  const restored = new FantasyStore(file, { onError: error => errors.push(error) }).profile('artisan');
  assert.deepEqual(errors, []);
  assert.ok(restored.character!.quests.includes(quest.id));
  assert.ok(applyFantasyAction(restored, { type: 'complete', quest: quest.id }, () => .999).error);
});
