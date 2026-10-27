import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyFantasyAction, newFantasyProfile, startFantasyActivity, advanceFantasyWorld } from './fantasy-engine.ts';
import { applyFantasyPrayer, fantasyPrayerDisabledReason, fantasyPrayerStatus, validFantasyPrayer } from './fantasy-prayer.ts';
import { FantasyStore } from '../server/fantasy-store.ts';

function character(job = 'priest') {
  const c = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: '기도 검증' }, () => .999).profile.character!;
  c.job = job; c.jobXp[job] = 0; c.hour = 25; c.location = 'hearth'; return c;
}

test('prayer awards priest practice only once on each shared world calendar day', () => {
  const c = character(); c.proficiencyUse = { key: 'work:priest', hour: 24, repeats: 20 };
  const result = applyFantasyPrayer(c);
  assert.deepEqual(result, { priestXp: 3, notorietyReduction: 0, day: 1 }); assert.equal(c.jobXp.priest, 3); assert.equal(c.lastPrayerDay, 1);
  c.hour = 47.99; const before = structuredClone(c);
  assert.ok(applyFantasyPrayer(c).error); assert.deepEqual(c, before);
  c.hour = 48; assert.equal(applyFantasyPrayer(c).priestXp, 3); assert.equal(c.jobXp.priest, 6); assert.equal(c.lastPrayerDay, 2);
});

test('repentance reduces existing notoriety slightly without granting money, standing or free profession mastery', () => {
  const c = character('thief'); c.notoriety = 3; const gold = c.gold, standing = structuredClone(c.reputation);
  assert.equal(applyFantasyPrayer(c).notorietyReduction, 2); assert.equal(c.notoriety, 1); assert.equal(c.jobXp.thief, 0); assert.equal(c.gold, gold); assert.deepEqual(c.reputation, standing);
  assert.ok(applyFantasyPrayer(c).error); assert.equal(c.notoriety, 1);
  c.hour += 24; c.job = 'adventurer'; assert.equal(applyFantasyPrayer(c).notorietyReduction, 1); assert.equal(c.notoriety, 0);
  c.hour += 24; assert.equal(applyFantasyPrayer(c).notorietyReduction, 0); assert.equal(c.notoriety, 0);
});

test('prayer requires an actual temple and preserves daily records on rejected requests', () => {
  const c = character(); c.location = 'greenwood'; const before = structuredClone(c);
  assert.equal(fantasyPrayerStatus(c).reason, 'no-temple'); assert.ok(applyFantasyPrayer(c).error); assert.deepEqual(c, before);
  for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(fantasyPrayerDisabledReason(c, locale));
  c.location = 'hearth'; c.hp = 0; assert.equal(fantasyPrayerStatus(c).reason, 'unwell'); assert.equal(c.lastPrayerDay, undefined);
  c.hp = 10; assert.equal(fantasyPrayerStatus(c).hours, .5); assert.equal(validFantasyPrayer(c), true);
  c.lastPrayerDay = 2; assert.equal(validFantasyPrayer(c), false); c.lastPrayerDay = 1; c.notoriety = 101; assert.equal(validFantasyPrayer(c), false);
  c.notoriety = 0; assert.equal(validFantasyPrayer(c), true);
});

test('shared-time prayer rewards settle after completion, survive reload and cannot be duplicated on the same day', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-prayer-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'fantasy.json');
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: '기도 저장 검증' }, () => .999).profile;
  p.character = character(); p.character.notoriety = 3; let hour = p.character.hour;
  fs.writeFileSync(file, JSON.stringify({ alice: p }));
  const store = new FantasyStore(file, { worldHour: () => hour }); assert.equal(store.loadError, undefined);
  const started = store.apply('alice', p.revision, { type: 'pray' }, () => .5);
  assert.equal(started.error, undefined); assert.equal(started.profile.activity!.endsAt - hour, .5); assert.equal(started.profile.character!.jobXp.priest, 0); assert.equal(started.profile.character!.notoriety, 3);
  hour += .25; const partial = store.synchronize('alice').profile; assert.equal(partial.character!.lastPrayerDay, undefined); assert.equal(partial.character!.jobXp.priest, 0);
  hour += .25; const finished = store.synchronize('alice').profile;
  assert.equal(finished.activity, undefined); assert.equal(finished.character!.lastPrayerDay, 1); assert.equal(finished.character!.jobXp.priest, 3); assert.equal(finished.character!.notoriety, 1);
  const reopened = new FantasyStore(file, { worldHour: () => hour }); assert.equal(reopened.loadError, undefined);
  const blocked = reopened.apply('alice', reopened.profile('alice').revision, { type: 'pray' }); assert.ok(blocked.error); assert.equal(blocked.profile.character!.jobXp.priest, 3);
  hour = 48; reopened.synchronize('alice'); const again = reopened.apply('alice', reopened.profile('alice').revision, { type: 'pray' }, () => .5); assert.equal(again.error, undefined);
  hour += .5; const nextDay = reopened.synchronize('alice').profile; assert.equal(nextDay.character!.jobXp.priest, 6); assert.equal(nextDay.character!.notoriety, 0);
});

test('a prayer crossing midnight consumes only the completed calendar day and leaves its source untouched', () => {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: '자정 기도' }, () => .999).profile;
  p.character = character(); p.character.hour = 23.75; const before = structuredClone(p);
  const started = startFantasyActivity(p, { type: 'pray' }, 23.75, () => .5); assert.equal(started.error, undefined); assert.deepEqual(p, before);
  const completed = advanceFantasyWorld(started.profile, 24.25).profile; assert.equal(completed.character!.lastPrayerDay, 1); assert.equal(completed.character!.jobXp.priest, 3);
  assert.ok(startFantasyActivity(completed, { type: 'pray' }, 24.25).error);
});
