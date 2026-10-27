import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { advanceFantasyWorld, applyFantasyAction, fantasySkills, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import type { FantasyAction, FantasyProfile } from './fantasy.ts';
import { FANTASY_JOBS } from './fantasy-data.ts';
import { fantasyWorkInterval, fantasyWorkLogText, fantasyWorkStepRewards, fantasyWorkSteps, FANTASY_WORK_INTERVAL, validFantasyWorkProgress } from './fantasy-work.ts';
import { fantasyEnvironment, fantasyEnvironmentActionError, fantasyEnvironmentPenalty } from './fantasy-environment.ts';
import { FantasyStore } from '../server/fantasy-store.ts';

function player(job = 'thief', level = 25) {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Work test', gender: 'female', source: 'human' }, () => .5).profile;
  Object.assign(profile.character!, { job, level, birthBonuses: {}, hp: 100, mp: 50 });
  profile.character!.jobXp[job] = 0;
  return profile;
}
const start = (profile = player(), hour = 8) => startFantasyActivity(profile, { type: 'work' }, hour, () => .71).profile;
const ticks = (p: FantasyProfile) => p.log.filter(log => log.text.startsWith('仕事の経過［'));
const summaries = (p: FantasyProfile) => p.log.filter(log => log.text.startsWith('仕事の集計［'));

test('work rolls every thirty real seconds, pays sixteen progress steps and settles no reward twice', () => {
  const source = player(), original = structuredClone(source), reserved = start(source);
  assert.deepEqual(source, original);
  assert.equal(FANTASY_WORK_INTERVAL * 60 / 30, .5);
  assert.equal(reserved.activity!.endsAt - reserved.activity!.startedAt, 4);
  assert.equal(reserved.activity!.work!.totalSteps, 16);
  assert.equal(advanceFantasyWorld(reserved, 8.249).profile.character!.gold, source.character!.gold);
  const first = advanceFantasyWorld(reserved, 8.25).profile;
  assert.equal(first.activity!.work!.completed, 1); assert.equal(first.character!.gold, source.character!.gold + 1);
  assert.equal(first.character!.notoriety, 1); assert.equal(ticks(first).length, 1); assert.equal(summaries(first).length, 0);
  assert.equal(fantasyWorkLogText(ticks(first)[0].text, 'ko'), '소매치기 성공 (1/16) · G+1 · XP+1');
  const done = advanceFantasyWorld(first, 12).profile;
  assert.equal(done.activity, undefined); assert.equal(ticks(done).length, 16); assert.equal(summaries(done).length, 1);
  assert.equal(done.character!.gold, source.character!.gold + 14); assert.equal(done.character!.xp, 10);
  assert.equal(done.character!.notoriety, 8); assert.equal(done.character!.jobXp.thief, 6);
  assert.equal(advanceFantasyWorld(done, 12).changed, false);
  assert.deepEqual(advanceFantasyWorld(done, 12).profile, done);
});

test('frequent clock updates, a mid-work reload and one offline catch-up preserve identical checks and rewards', () => {
  const reserved = start(player('alchemist', 1), 8.25), baseline = structuredClone(reserved);
  let frequent = reserved;
  for (let hour = 8.3; hour < 12.25; hour += .1) {
    frequent = advanceFantasyWorld(frequent, hour).profile;
    if (hour > 10 && hour < 10.1) frequent = JSON.parse(JSON.stringify(frequent));
  }
  frequent = advanceFantasyWorld(frequent, 12.25).profile;
  const offline = advanceFantasyWorld(baseline, 12.25).profile;
  assert.deepEqual(frequent, offline);
  assert.equal(ticks(offline).length, 16);
  assert.deepEqual(advanceFantasyWorld(frequent, 100).profile, advanceFantasyWorld(baseline, 100).profile);
});

test('every profession has its own translated progress and keeps the original four-hour reward budget', () => {
  for (const job of FANTASY_JOBS) {
    const source = player(job.id), reserved = start(source), done = advanceFantasyWorld(reserved, 12).profile;
    const bonus = fantasySkills(source.character!).filter(skill => skill.kind === 'passive' && skill.effect === 'reward').reduce((sum, skill) => sum + skill.power, 0);
    assert.equal(ticks(done).length, 16, job.id);
    assert.ok(done.character!.gold - source.character!.gold <= 14 + bonus, job.id);
    assert.ok(done.character!.xp <= 10, job.id);
    for (const locale of ['ko', 'en', 'ja'] as const) {
      const text = fantasyWorkLogText(ticks(done)[0].text, locale)!;
      assert.ok(text && !text.includes('仕事の経過［'), `${job.id}/${locale}`);
      assert.ok(fantasyWorkLogText(summaries(done)[0].text, locale));
    }
  }
});

test('needs still penalize highly skilled capped checks and crime work gets only a conditional night benefit', () => {
  const fresh = start(player('thief', 25)), tired = structuredClone(fresh);
  tired.character!.fatigue = 95; tired.character!.hunger = 95;
  const normal = advanceFantasyWorld(fresh, 8.5).profile, exhausted = advanceFantasyWorld(tired, 8.5).profile;
  assert.match(normal.log.find(log => log.text.includes('d8='))!.text, /補正\+4/);
  assert.match(exhausted.log.find(log => log.text.includes('d8='))!.text, /補正-2/);
  const day = start(player('thief', 1), 8), night = start(player('thief', 1), 20);
  const modifier = (profile: FantasyProfile) => Number(/補正([+-]\d+)/.exec(profile.log.find(log => log.text.includes('d8='))!.text)![1]);
  assert.equal(modifier(advanceFantasyWorld(night, 20.5).profile), modifier(advanceFantasyWorld(day, 8.5).profile) + 1);
  const outdoors = player('thief', 1).character!; outdoors.location = 'greenwood'; outdoors.hour = 20;
  outdoors.inventory = {}; outdoors.foodLots = [];
  assert.equal(fantasyEnvironment(outdoors).night, true);
  assert.equal(fantasyEnvironmentPenalty(outdoors) - fantasyEnvironmentPenalty(outdoors, true), 2);
  assert.ok(fantasyEnvironmentActionError(outdoors, { type: 'gather', resource: 'herbs' }));
  outdoors.job = 'cook'; assert.equal(fantasyEnvironmentPenalty(outdoors), fantasyEnvironmentPenalty(outdoors, true));
});

test('offline partial work is saved atomically and survives restart without exposing failed-save rewards', t => {
  const prefix = path.join(os.tmpdir(), 'tonarium-work-progress-'), directory = fs.mkdtempSync(prefix), file = path.join(directory, 'fantasy.json');
  t.after(() => { if (!path.resolve(directory).startsWith(path.resolve(prefix))) throw Error('Unexpected test directory'); fs.rmSync(directory, { recursive: true, force: true }); });
  const reserved = start(); fs.writeFileSync(file, JSON.stringify({ alice: reserved }));
  let hour = 8.25, fail = true;
  const store = new FantasyStore(file, { worldHour: () => hour, onError: () => {}, save: (target, data) => { if (fail) throw Error('disk full'); fs.writeFileSync(target, data); } });
  assert.ok(store.tick(new Set())[0].error); assert.deepEqual(store.profile('alice'), reserved);
  fail = false; assert.equal(store.tick(new Set())[0].error, undefined);
  const partial = store.profile('alice'); assert.equal(partial.activity!.work!.completed, 1);
  const reloaded = new FantasyStore(file, { worldHour: () => hour }); assert.equal(reloaded.loadError, undefined);
  assert.deepEqual(reloaded.profile('alice'), partial);
  hour = 12; reloaded.tick(new Set());
  assert.deepEqual(reloaded.profile('alice'), advanceFantasyWorld(reserved, 12).profile);
  assert.equal(reloaded.tick(new Set()).length, 0);
});

test('old pending work still settles once and forged progress cannot rewind time or credit rewards', () => {
  const legacy = start(); delete legacy.activity!.work;
  assert.equal(advanceFantasyWorld(legacy, 9).profile.character!.gold, legacy.character!.gold);
  assert.ok(advanceFantasyWorld(legacy, 12).profile.character!.gold > legacy.character!.gold);
  const forged = start(); forged.character!.hour = 10;
  const before = structuredClone(forged), result = advanceFantasyWorld(forged, 12);
  assert.ok(result.error); assert.deepEqual(forged, before); assert.deepEqual(result.profile, before);
  const commands: FantasyAction[] = [{ type: 'pray' }, { type: 'skill', skill: 'human-quick' }, { type: 'equip', item: 'sword' }, { type: 'sell', item: 'bread' }, { type: 'learn', skill: 'mentor-focus', npcId: 'eris' }];
  for (const command of commands) { assert.ok(startFantasyActivity(start(), command, 8).error); assert.ok(applyFantasyAction(start(), command).error); }
});

test('persisted eight-step work keeps its original timing, paid rewards and remaining deterministic checks after upgrade', t => {
  const prefix = path.join(os.tmpdir(), 'tonarium-work-eight-step-'), directory = fs.mkdtempSync(prefix), file = path.join(directory, 'fantasy.json');
  t.after(() => { if (!path.resolve(directory).startsWith(path.resolve(prefix))) throw Error('Unexpected test directory'); fs.rmSync(directory, { recursive: true, force: true }); });
  const reserved = start(); delete reserved.activity!.work!.totalSteps;
  assert.equal(fantasyWorkSteps(reserved.activity!.work!), 8); assert.equal(fantasyWorkInterval(reserved.activity!), .5);
  const early = advanceFantasyWorld(reserved, 8.25).profile;
  assert.equal(early.activity!.work!.completed, 0); assert.equal(early.character!.gold, reserved.character!.gold);
  const partial = advanceFantasyWorld(reserved, 9.5).profile;
  assert.deepEqual(partial.activity!.work, { completed: 3, successes: 3, gold: 4, xp: 3 });
  assert.equal(fantasyWorkLogText(ticks(partial)[0].text, 'ko'), '소매치기 성공 (1/8) · G+1 · XP+1');
  fs.writeFileSync(file, JSON.stringify({ alice: partial }));
  let hour = 9.5;
  const restored = new FantasyStore(file, { worldHour: () => hour });
  assert.equal(restored.loadError, undefined); assert.deepEqual(restored.profile('alice'), partial);
  assert.equal(restored.tick(new Set()).length, 0);
  hour = 9.75; restored.tick(new Set()); assert.equal(restored.profile('alice').activity!.work!.completed, 3);
  hour = 10; restored.tick(new Set()); assert.equal(restored.profile('alice').activity!.work!.completed, 4);
  hour = 12; restored.tick(new Set());
  const done = restored.profile('alice'); assert.equal(done.activity, undefined); assert.equal(ticks(done).length, 8);
  assert.deepEqual(done, advanceFantasyWorld(reserved, 12).profile);
  assert.equal(done.character!.gold - reserved.character!.gold, 14); assert.equal(done.character!.xp, 10);
  assert.equal(restored.tick(new Set()).length, 0);
});

test('both step schedules keep success and failure budgets and reject unsupported or inconsistent saved schedules', () => {
  for (const totalSteps of [8, 16] as const) {
    for (const success of [false, true]) {
      const progress = { completed: 0, successes: 0, gold: 0, xp: 0, totalSteps };
      for (let index = 0; index < totalSteps; index++) {
        const reward = fantasyWorkStepRewards(progress, success);
        progress.completed++; progress.successes += Number(success); progress.gold += reward.gold; progress.xp += reward.xp;
        assert.equal(validFantasyWorkProgress(progress), true);
      }
      assert.equal(progress.gold, success ? 14 : 5); assert.equal(progress.xp, success ? 10 : 4);
    }
  }
  for (const bad of [
    { completed: 9, successes: 0, gold: 0, xp: 0 },
    { completed: 17, successes: 0, gold: 0, xp: 0, totalSteps: 16 },
    { completed: 0, successes: 0, gold: 0, xp: 0, totalSteps: 32 },
    { completed: 0, successes: 0, gold: 0, xp: 0, totalSteps: '16' },
    { completed: 0, successes: 1, gold: 0, xp: 0, totalSteps: 16 },
  ]) assert.equal(validFantasyWorkProgress(bad), false);
});
