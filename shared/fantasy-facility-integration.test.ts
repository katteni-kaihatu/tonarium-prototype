import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyFantasyAction, advanceFantasyWorld, startFantasyActivity, fantasyStats, newFantasyProfile } from './fantasy-engine.ts';
import { FantasyStore } from '../server/fantasy-store.ts';
import { NPC_PUBLIC } from './npc.ts';
import { addFantasyStatus } from './fantasy-effects.ts';
import { fantasyTempleTreatment } from './fantasy-facility-hours.ts';
import type { FantasyAction, FantasyProfile } from './fantasy.ts';

function person(hour = 12, job = 'priest') {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Service boundary', gender: 'female' }, () => .5).profile;
  const c = p.character!; c.hour = hour; c.job = job; c.jobXp[job] = 0; c.gold = 500; c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  return p;
}
function fixture(t: TestContext, p: FantasyProfile) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-facility-boundary-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith('fantasy-facility-boundary-')); fs.rmSync(directory, { recursive: true, force: true }); });
  const file = path.join(directory, 'profiles.json'); fs.writeFileSync(file, JSON.stringify({ traveler: p }));
  let hour = p.character!.hour, fail = false, wall = 1000;
  const options = { worldHour: () => hour, now: () => wall, onError: () => {}, save: (file: string, text: string) => { if (fail) throw new Error('Expected save failure'); fs.writeFileSync(file, text); } };
  const store = new FantasyStore(file, options); assert.equal(store.loadError, undefined);
  return { store, file, fail: (value: boolean) => { fail = value; }, time: (value: number) => { hour = value; wall += 1100; }, reload: () => new FantasyStore(file, options) };
}

test('real night actions retain inn and guild access while ordinary closed services reject without changes', () => {
  const p = person(22), c = p.character!;
  for (const action of [{ type: 'read', book: 'mana-primer' }, { type: 'pray' }, { type: 'buy', item: 'potion' }, { type: 'sell', item: 'herb' }, { type: 'priestVow', quest: 'quest-herbalist' }, { type: 'priestBranch', branch: 'care' }] as FantasyAction[]) {
    const r = applyFantasyAction(p, action, () => .5); assert.ok(r.error?.includes('夜間'), JSON.stringify(action)); assert.equal(r.changed, false); assert.deepEqual(r.profile, p);
  }
  const inn = applyFantasyAction(p, { type: 'lodge', room: 'common' }, () => .5); assert.equal(inn.error, undefined); assert.equal(inn.profile.character!.gold, c.gold - 8);
  const guild = applyFantasyAction(p, { type: 'escortAccept', destination: 'sunmeadow' }, () => .5); assert.equal(guild.error, undefined); assert.ok(guild.profile.character!.escort);
  const teacher = NPC_PUBLIC.find(npc => npc.building === 'tower' && npc.trainableJobs?.includes('mage'))!; assert.ok(teacher);
  const atTower = person(22); atTower.character!.location = teacher.homeLocation!;
  assert.ok(applyFantasyAction(atTower, { type: 'job', job: 'mage', via: 'npc', npcId: teacher.id }, () => .5).error?.includes('夜間'));
});
test('night temple wake-and-treat requires a living real patient and payment, cures actual ailments and opens no other service', () => {
  const healthy = person(22); assert.ok(applyFantasyAction(healthy, { type: 'templeTreat' }, () => .5).error);
  const poor = person(22); poor.character!.hp -= 20; poor.character!.gold = 0; assert.deepEqual(applyFantasyAction(poor, { type: 'templeTreat' }).profile, poor);
  const dead = person(22); dead.character!.hp = 0; assert.ok(applyFantasyAction(dead, { type: 'templeTreat' }).error);
  const patient = person(22), c = patient.character!; c.hp -= 20; addFantasyStatus(c, 'poison'); addFantasyStatus(c, 'frost');
  const offer = fantasyTempleTreatment(c, fantasyStats(c).hp), result = applyFantasyAction(patient, { type: 'templeTreat' }, () => .5);
  assert.equal(result.error, undefined); assert.equal(result.profile.character!.gold, c.gold - offer.cost); assert.equal(result.profile.character!.hp, fantasyStats(c).hp);
  assert.equal(result.profile.character!.effects?.some(effect => ['poison', 'frost'].includes(effect.id)), false);
  assert.ok(applyFantasyAction(result.profile, { type: 'pray' }, () => .5).error?.includes('夜間'));
  const illOnly = person(22); addFantasyStatus(illOnly.character!, 'poison'); const cured = applyFantasyAction(illOnly, { type: 'templeTreat' }, () => .5);
  assert.equal(cured.error, undefined); assert.equal(cured.profile.character!.gold, illOnly.character!.gold - 5);
});
test('direct goods negotiation obeys the closed market while inn room negotiation stays available at night', () => {
  const p = person(22);
  const goods = applyFantasyAction(p, { type: 'haggle', service: 'goods' }, () => 0);
  assert.ok(goods.error?.includes('夜間')); assert.equal(goods.changed, false); assert.deepEqual(goods.profile, p);
  assert.equal(applyFantasyAction(p, { type: 'haggle', service: 'room' }, () => 0).error, undefined);
});
test('canceling actual reserved reading or prayer grants no knowledge, daily receipt or pity change', () => {
  for (const action of [{ type: 'read', book: 'mana-primer' }, { type: 'pray' }] as FantasyAction[]) {
    const p = person(), reserved = startFantasyActivity(p, action, 12, () => .5); assert.equal(reserved.error, undefined); assert.ok(reserved.profile.activity);
    const midway = advanceFantasyWorld(reserved.profile, 12.25).profile;
    assert.equal(midway.character!.magicKnowledge!.elements.length, 0); assert.equal(midway.character!.lastPrayerDay, undefined);
    const canceled = applyFantasyAction(midway, { type: 'cancel' }); assert.equal(canceled.error, undefined);
    const later = advanceFantasyWorld(canceled.profile, 14).profile;
    assert.equal(later.character!.magicKnowledge!.elements.length, 0); assert.equal(later.character!.magicKnowledge!.forms.length, 0);
    assert.equal(later.character!.magicKnowledge!.prayerFailures, 0); assert.equal(later.character!.magicKnowledge!.prayerDay, undefined); assert.equal(later.character!.lastPrayerDay, undefined);
    assert.equal(later.character!.readBooks?.includes('mana-primer') ?? false, false);
  }
});
test('completed reading publishes knowledge only after atomic save and reloads the same receipt once', t => {
  const f = fixture(t, person()), initial = f.store.profile('traveler');
  const reserved = f.store.apply('traveler', initial.revision, { type: 'read', book: 'mana-primer' }, () => .5); assert.equal(reserved.error, undefined);
  const pending = f.store.profile('traveler'), bytes = fs.readFileSync(f.file, 'utf8'); f.time(13); f.fail(true);
  assert.ok(f.store.synchronize('traveler').error); assert.deepEqual(f.store.profile('traveler'), pending); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  f.fail(false); const done = f.store.synchronize('traveler'); assert.equal(done.error, undefined);
  assert.deepEqual(done.profile.character!.magicKnowledge!.elements, ['gale']); assert.deepEqual(done.profile.character!.magicKnowledge!.forms, ['bolt']);
  assert.equal(done.profile.character!.magicKnowledge!.discoveries.filter(id => id === 'book:mana-primer').length, 1);
  const reloaded = f.reload(); assert.equal(reloaded.loadError, undefined); assert.deepEqual(reloaded.profile('traveler'), done.profile);
  assert.deepEqual(reloaded.synchronize('traveler').profile, done.profile);
});

test('reading admitted before closing finishes normally after the library closes', () => {
  const p=person(17.5),reserved=startFantasyActivity(p,{type:'read',book:'mana-primer'},17.5,()=>.5);
  assert.equal(reserved.error,undefined);
  const done=advanceFantasyWorld(reserved.profile,20).profile;
  assert.equal(done.activity,undefined);
  assert.ok(done.character!.readBooks?.includes('mana-primer'));
  assert.ok(done.character!.magicKnowledge!.elements.includes('gale'));
});
test('a successful completed prayer cannot publish discovery before save or reroll after retry, reload or duplicate prayer', t => {
  const p = person(); let winningSeed = -1;
  for (let seed = 0; seed < 4096; seed++) {
    const reserved = startFantasyActivity(p, { type: 'pray' }, 12, () => seed / 4294967296);
    const completed = advanceFantasyWorld(reserved.profile, 12.5).profile;
    if (completed.character!.magicKnowledge!.elements.length + completed.character!.magicKnowledge!.forms.length > 0) { winningSeed = seed; break; }
  }
  assert.ok(winningSeed >= 0, 'A deterministic successful discovery seed must exist');
  const f = fixture(t, p), reserved = f.store.apply('traveler', p.revision, { type: 'pray' }, () => winningSeed / 4294967296); assert.equal(reserved.error, undefined);
  const pending = f.store.profile('traveler'), bytes = fs.readFileSync(f.file, 'utf8'); f.time(12.5); f.fail(true);
  assert.ok(f.store.synchronize('traveler').error); assert.deepEqual(f.store.profile('traveler'), pending); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  f.fail(false); const done = f.store.synchronize('traveler'); assert.equal(done.error, undefined); const knowledge = done.profile.character!.magicKnowledge!;
  assert.equal(knowledge.elements.length + knowledge.forms.length, 1); assert.equal(knowledge.prayerDay, 0); assert.equal(knowledge.prayerFailures, 0);
  const reloaded = f.reload(); assert.equal(reloaded.loadError, undefined); assert.deepEqual(reloaded.profile('traveler').character!.magicKnowledge, knowledge);
  let rolls = 0; const duplicate = applyFantasyAction(done.profile, { type: 'pray' }, () => { rolls++; return 0; });
  assert.ok(duplicate.error); assert.equal(rolls, 0); assert.deepEqual(duplicate.profile, done.profile);
});
