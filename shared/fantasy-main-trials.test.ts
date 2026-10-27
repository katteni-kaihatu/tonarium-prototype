import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyFantasyAction, advanceFantasyWorld, fantasyActionHours, fantasyStats, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { FANTASY_MAIN_TRIALS, fantasyMainApproachStat, fantasyMainInvestigationError, fantasyMainProgress, fantasyMainReady, fantasyMainStage, fantasyMainTrial, validFantasyMainTrials } from './fantasy-main-trials.ts';
import { FANTASY_MAIN_QUESTS } from './fantasy-second-content.ts';
import { FANTASY_ITEMS } from './fantasy-data.ts';
import type { FantasyAction, FantasyCharacter, FantasyProfile } from './fantasy.ts';
import { FantasyStore, isFantasyAction } from '../server/fantasy-store.ts';

const high = () => .999;
function player(chapter = 1): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Investigator', gender: 'female', source: 'human' }, () => .5).profile;
  const c = p.character!; c.birthBonuses = {}; c.completed = FANTASY_MAIN_QUESTS.filter(q => q.chapter! < chapter).map(q => q.id);
  c.location = FANTASY_MAIN_QUESTS.find(q => q.chapter === chapter)!.giver;
  if (!c.visited.includes(c.location)) c.visited.push(c.location);
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  return p;
}
const id = (chapter = 1) => FANTASY_MAIN_QUESTS.find(q => q.chapter === chapter)!.id;
const investigate = (chapter = 1, approach = 'analyze'): FantasyAction => ({ type: 'investigate', quest: id(chapter), approach } as FantasyAction);
function move(p: FantasyProfile, location: string) { p.character!.location = location; if (!p.character!.visited.includes(location)) p.character!.visited.push(location); }
const accept = (p = player(), chapter = 1) => applyFantasyAction(p, { type: 'accept', quest: id(chapter) }).profile;
function temporary(t: TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-main-trials-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith('tonarium-main-trials-')); fs.rmSync(directory, { recursive: true, force: true }); });
  return path.join(directory, 'fantasy.json');
}
function boosted(p: FantasyProfile) { p.character!.buff = { effect: 'check', power: 40 }; return p; }

test('all eighteen chapters have ordered contextual stages with smooth difficulty and no level gate', () => {
  assert.equal(FANTASY_MAIN_TRIALS.length, 18);
  for (const trial of FANTASY_MAIN_TRIALS) {
    const quest = FANTASY_MAIN_QUESTS.find(q => q.id === trial.questId)!;
    assert.equal(trial.stages.length, trial.chapter <= 6 ? 2 : 3);
    assert.equal(trial.stages[0].location, quest.destination); assert.equal(trial.stages.at(-1)!.location, quest.reportAt ?? quest.giver);
    if (trial.chapter > 6) assert.equal(trial.stages[1].location, quest.destination);
    for (let index = 0; index < trial.stages.length; index++) {
      const stage = trial.stages[index]; assert.equal(stage.dc, trial.stages[0].dc + index); assert.equal(stage.hours, .5);
      for (const label of Object.values(stage.labels)) assert.ok(label.trim().length > 5);
    }
    const p = accept(player(trial.chapter), trial.chapter); move(p, trial.stages[0].location);
    assert.equal(p.character!.level, 1); assert.equal(fantasyMainInvestigationError(p.character!, investigate(trial.chapter) as Extract<FantasyAction, { type: 'investigate' }>), undefined);
  }
  assert.equal(FANTASY_MAIN_TRIALS[0].stages[0].dc, 13); assert.equal(FANTASY_MAIN_TRIALS.at(-1)!.stages.at(-1)!.dc, 31);
  assert.equal(fantasyMainTrial('quest-herbalist'), undefined);
});

test('stockpiled materials and old visits cannot replace post-accept ordered proof and final supplies are spent only once', () => {
  const quest = FANTASY_MAIN_QUESTS[0]; let p = player(); p.character!.inventory.relic = 10; p.character!.visited.push(quest.destination);
  move(p, quest.destination); assert.equal(applyFantasyAction(p, investigate(), high).changed, false);
  move(p, quest.giver); p = accept(p);
  const acceptedAt = p.character!.hour; assert.equal(p.character!.mainTrials![quest.id].acceptedAt, acceptedAt);
  assert.equal(applyFantasyAction(p, { type: 'complete', quest: quest.id }, high).changed, false);
  assert.equal(applyFantasyAction(p, investigate(), high).changed, false);
  const gold = p.character!.gold; move(p, quest.destination);
  p = applyFantasyAction(boosted(p), investigate(), high).profile;
  assert.equal(fantasyMainProgress(p.character!, quest.id), 1); assert.equal(p.character!.mainTrials![quest.id].proofs[0].hour, acceptedAt + .5);
  assert.equal(p.character!.inventory.relic, 10); assert.equal(p.character!.gold, gold);
  assert.equal(applyFantasyAction(p, investigate(), high).changed, false);
  move(p, quest.giver); p = applyFantasyAction(boosted(p), investigate(1, 'restore'), high).profile;
  assert.equal(fantasyMainReady(p.character!, quest.id), true);
  const done = applyFantasyAction(p, { type: 'complete', quest: quest.id }, high);
  assert.equal(done.changed, true); assert.equal(done.profile.character!.inventory.relic, 9);
  assert.equal(done.profile.character!.completed.includes(quest.id), true);
  assert.equal(done.profile.character!.mainTrials![quest.id].proofs.length, 2);
  assert.equal(applyFantasyAction(done.profile, { type: 'complete', quest: quest.id }, high).changed, false);
});

test('failure retains earlier proof, adds limited fatigue and damages only dangerous field work', () => {
  let p = accept(); const quest = FANTASY_MAIN_QUESTS[0]; move(p, quest.destination);
  const hp = p.character!.hp, xp = p.character!.xp;
  const failed = applyFantasyAction(p, investigate(), () => 0); assert.equal(failed.changed, true);
  assert.equal(fantasyMainProgress(failed.profile.character!, quest.id), 0); assert.equal(failed.profile.character!.mainTrials![quest.id].attempts, 1);
  assert.equal(failed.profile.character!.fatigue, 4); assert.equal(failed.profile.character!.hp, hp - 3); assert.equal(failed.profile.character!.xp, xp);
  p = applyFantasyAction(boosted(failed.profile), investigate(), high).profile;
  const proof = structuredClone(p.character!.mainTrials![quest.id].proofs); move(p, quest.giver);
  const before = p.character!.hp;
  p = applyFantasyAction(p, investigate(), () => 0).profile;
  assert.deepEqual(p.character!.mainTrials![quest.id].proofs, proof); assert.equal(p.character!.hp, before); assert.equal(fantasyMainProgress(p.character!, quest.id), 1);
  assert.ok(p.character!.fatigue >= 8);
});

test('abandoning and reaccepting preserve clues and cannot farm the same stage experience', () => {
  let p = accept(), quest = FANTASY_MAIN_QUESTS[0]; move(p, quest.destination);
  p = applyFantasyAction(boosted(p), investigate(), high).profile;
  const record = structuredClone(p.character!.mainTrials![quest.id]), xp = p.character!.xp;
  p = applyFantasyAction(p, { type: 'abandon', quest: quest.id }).profile;
  assert.deepEqual(p.character!.mainTrials![quest.id], record); assert.equal(validFantasyMainTrials(p.character!), true);
  assert.equal(applyFantasyAction(p, investigate(), high).changed, false);
  move(p, quest.giver); p = accept(p);
  assert.deepEqual(p.character!.mainTrials![quest.id], record); assert.equal(p.character!.xp, xp);
  assert.equal(fantasyMainStage(p.character!, quest.id)!.id, 'compare');
  move(p, quest.destination); assert.equal(applyFantasyAction(p, investigate(), high).changed, false);
});

test('stat selection respects real available attributes and existing skill, body, equipment and need checks run', () => {
  let p = accept(); const c = p.character!, stage = fantasyMainStage(c, id())!, archive = fantasyMainTrial(id())!.stages.at(-1)!;
  const stats = { ...fantasyStats(c), agility: 14, vitality: 19, strength: 4, luck: 3 };
  assert.equal(fantasyMainApproachStat(stats, stage, 'observe'), 'vitality'); assert.equal(fantasyMainApproachStat(stats, stage, 'restore'), 'strength');
  assert.equal(fantasyMainApproachStat({ ...stats, dexterity: 18 }, stage, 'restore'), 'dexterity');
  assert.equal(fantasyMainApproachStat(stats, archive, 'observe'), 'luck'); assert.equal(fantasyMainApproachStat({ ...stats, charisma: 18 }, archive, 'observe'), 'charisma');
  assert.equal(fantasyMainApproachStat(stats, archive, 'restore'), 'agility');
  move(p, stage.location); c.hunger = 95; c.fatigue = 80;
  c.effects = [{ id: 'poison', expiresAt: c.hour + 8, check: -2 }];
  p = applyFantasyAction(boosted(p), investigate(), high).profile;
  assert.equal(p.character!.buff, null); assert.equal(fantasyMainProgress(p.character!, id()), 1);
  assert.ok(p.log.some(log => /2d20/.test(log.text)), 'prepared skill changes the actual investigation dice');
  assert.ok(p.log.some(log => /DC13/.test(log.text)));
});

test('investigation uses the existing body, gear, hunger, fatigue and debuff modifiers rather than a separate lightweight roll', () => {
  const base = accept(); move(base, FANTASY_MAIN_QUESTS[0].destination);
  const modifier = (p: FantasyProfile) => {
    const result = applyFantasyAction(p, investigate(), high); assert.equal(result.error, undefined);
    return Number(result.profile.log.findLast(log => /DC13/.test(log.text))!.text.match(/補正([+-]\d+)/)![1]);
  };
  const normal = modifier(base), tired = structuredClone(base), poisoned = structuredClone(base), elf = structuredClone(base), equipped = structuredClone(base);
  tired.character!.hunger = 90; tired.character!.fatigue = 90; assert.equal(modifier(tired), normal - 6);
  poisoned.character!.effects = [{ id: 'weakness', check: -2, expiresAt: 12 }]; assert.equal(modifier(poisoned), normal - 2);
  elf.character!.race = 'elf'; elf.character!.hp = fantasyStats(elf.character!).hp; elf.character!.mp = fantasyStats(elf.character!).mp;
  assert.equal(modifier(elf), normal + 2, 'keen body +3 replaces the human intelligence passive +1');
  const gear = FANTASY_ITEMS.find(item => (item.equipment?.stats?.intelligence ?? 0) >= 2); assert.ok(gear);
  equipped.character!.inventory[gear.id] = 1; equipped.character!.equipment = { [gear.equipment!.slot]: gear.id };
  assert.equal(modifier(equipped), normal + Math.floor(gear.equipment!.stats!.intelligence! / 2));
});

test('the half-hour scheduler never leaks or consumes a preflight roll and survives a halfway saved clock', t => {
  const file = temporary(t); let p = accept(); move(p, FANTASY_MAIN_QUESTS[0].destination); boosted(p);
  let randomCalls = 0; const before = structuredClone(p);
  const queued = startFantasyActivity(p, investigate(), p.character!.hour, () => { randomCalls++; return .42; });
  assert.equal(queued.changed, true); assert.equal(randomCalls, 1); assert.equal(fantasyActionHours(p, investigate()), .5);
  assert.deepEqual(p, before); assert.deepEqual(queued.profile.character, before.character);
  assert.equal(queued.profile.log.slice(before.log.length).some(log => /d20=|主調査/.test(log.text)), false);
  let hour = p.character!.hour + .25;
  const half = advanceFantasyWorld(queued.profile, hour).profile;
  assert.equal(half.character!.buff?.power, 40); assert.equal(fantasyMainProgress(half.character!, id()), 0);
  fs.writeFileSync(file, JSON.stringify({ user: half }));
  let store = new FantasyStore(file, { worldHour: () => hour, onError: () => {} }); assert.equal(store.loadError, undefined);
  assert.deepEqual(store.profile('user').activity, half.activity);
  hour += .25; const completed = store.synchronize('user');
  assert.equal(completed.error, undefined); assert.equal(fantasyMainProgress(completed.profile.character!, id()), 1);
  assert.equal(completed.profile.character!.buff, null); assert.equal(completed.profile.activity, undefined);
  store = new FantasyStore(file, { worldHour: () => hour }); assert.equal(store.loadError, undefined);
  const revision = store.profile('user').revision; assert.equal(store.synchronize('user').changed, false); assert.equal(store.profile('user').revision, revision);
});

test('old accepted saves without mainTrials load as step zero and completed legacy chapters are retained', t => {
  const file = temporary(t), p = player(13); p.character!.quests.push(id(13)); move(p, FANTASY_MAIN_QUESTS.find(q => q.chapter === 13)!.destination);
  assert.equal(p.character!.mainTrials, undefined); fs.writeFileSync(file, JSON.stringify({ legacy: p }));
  const store = new FantasyStore(file, { onError: () => {} }); assert.equal(store.loadError, undefined);
  assert.deepEqual(store.profile('legacy'), p); assert.equal(fantasyMainProgress(store.profile('legacy').character!, id(13)), 0);
  assert.equal(fantasyMainReady(store.profile('legacy').character!, id(12)), true);
  const advanced = applyFantasyAction(boosted(store.profile('legacy')), investigate(13), high);
  assert.equal(advanced.error, undefined); assert.equal(fantasyMainProgress(advanced.profile.character!, id(13)), 1);
  assert.deepEqual(advanced.profile.character!.completed, p.character!.completed); assert.equal(validFantasyMainTrials(advanced.profile.character!), true);
});

test('forged actions and corrupted proof records are rejected without replacing the stored bytes', t => {
  const file = temporary(t); const p = accept(); move(p, FANTASY_MAIN_QUESTS[0].destination);
  for (const bad of [ { type: 'investigate', quest: id(), approach: 'win' }, { type: 'investigate', quest: id(), approach: 'observe', stage: 'compare' }, { type: 'investigate', quest: id(), approach: 'observe', success: true }, { type: 'investigate', quest: {}, approach: 'analyze' } ]) {
    assert.equal(isFantasyAction(bad), false); assert.equal(applyFantasyAction(p, bad as FantasyAction, high).changed, false);
  }
  const good = applyFantasyAction(boosted(p), investigate(), high).profile;
  const mutations: ((c: FantasyCharacter) => void)[] = [
    c => { c.mainTrials![id()].proofs[0].stage = 'compare'; },
    c => { c.mainTrials![id()].proofs[0].hour = c.mainTrials![id()].acceptedAt; },
    c => { c.mainTrials![id()].proofs[0].hour = c.hour + 1; },
    c => { c.mainTrials![id()].proofs[0].approach = 'grant' as never; },
    c => { c.mainTrials![id()].attempts = 1_000_001; },
    c => { c.mainTrials![id()].acceptedAt = c.hour + 1; },
    c => { c.mainTrials!['quest-herbalist'] = c.mainTrials![id()]; },
    c => { (c.mainTrials![id()] as unknown as Record<string, unknown>).step = 2; },
    c => { c.mainTrials![id()].proofs.push(c.mainTrials![id()].proofs[0]); },
  ];
  for (const mutate of mutations) {
    const corrupt = structuredClone(good); mutate(corrupt.character!); const bytes = JSON.stringify({ user: corrupt }); fs.writeFileSync(file, bytes);
    assert.equal(validFantasyMainTrials(corrupt.character!), false);
    const store = new FantasyStore(file, { onError: () => {} }); assert.ok(store.loadError); assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  }
});

test('investigations obey outdoor darkness and reject malformed persisted timing', t => {
  const file = temporary(t); let p = accept(); move(p, FANTASY_MAIN_QUESTS[0].destination); p.character!.hour = 20; delete p.character!.inventory.lantern;
  assert.match(startFantasyActivity(p, investigate(), 20).error!, /ランタン/);
  p.character!.inventory.lantern = 1; boosted(p);
  const queued = startFantasyActivity(p, investigate(), 20, () => .42).profile; assert.ok(queued.activity);
  queued.activity!.endsAt += .25; const bytes = JSON.stringify({ user: queued }); fs.writeFileSync(file, bytes);
  assert.ok(new FantasyStore(file, { onError: () => {} }).loadError); assert.equal(fs.readFileSync(file, 'utf8'), bytes);
});
