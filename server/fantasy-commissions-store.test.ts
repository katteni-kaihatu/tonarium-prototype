import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore, isFantasyAction } from './fantasy-store.ts';
import { applyFantasyAction, newFantasyProfile, fantasyStats } from '../shared/fantasy-engine.ts';
import { reconcileFoodLots } from '../shared/fantasy-life.ts';
import { applyFantasyPropertyCommand, newFantasyPropertyLedger } from '../shared/fantasy-property.ts';

function fixture(t: TestContext, worker = false) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-commission-')), file = path.join(folder, 'state.json');
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Commission', gender: 'female' }, () => .99).profile;
  Object.assign(profile.character!, { gold: 5000, hour: 17, inventory: { fish: 4, herb: 4 }, job: 'warrior' });
  profile.character!.jobXp.warrior = 0; profile.character!.hp = Math.min(profile.character!.hp, fantasyStats(profile.character!).hp); reconcileFoodLots(profile.character!);
  const state = applyFantasyPropertyCommand(newFantasyPropertyLedger(), { a: profile }, 'a', { type: 'buy', plot: 'hearth-commercial', revision: 0, requestId: 'fixture-buy' }, 17);
  if (worker) state.ledger.employees = { 'artisan-2': { npc: 'artisan-2', user: 'a', generation: 1, hiredAt: 0, expiresAt: 100, source: 'guild', skills: { cook: 10 }, learning: 3, lastAt: 0 } };
  fs.writeFileSync(file, JSON.stringify({ version: 2, profiles: state.profiles, combats: {}, properties: state.ledger }));
  return { file };
}
const npc = { type: 'commission' as const, recipe: 'cook-meal', npcId: 'artisan-hearth-nella' };

test('commission wire validation allows one provider and rejects ownership payloads or malformed options', () => {
  assert.equal(isFantasyAction(npc), true);
  for (const action of [{ ...npc, workerId: 'artisan-2' }, { ...npc, employees: {} }, { ...npc, material: 123 }, { type: 'commission', recipe: 'cook-meal' }]) assert.equal(isFantasyAction(action), false);
  for (const career of ['combat', 'life']) assert.equal(isFantasyAction({ type: 'work', career }), true);
  assert.equal(isFantasyAction({ type: 'work', career: 'invented' }), false);
});

test('commission waits for real elapsed time, survives reload, and delivers after closing exactly once', t => {
  const { file } = fixture(t); let hour = 17;
  let store = new FantasyStore(file, { worldHour: () => hour }); assert.equal(store.loadError, undefined);
  const before = store.profile('a'), queued = store.apply('a', before.revision, npc, () => .5);
  assert.equal(queued.error, undefined); assert.equal(queued.profile.activity?.action.type, 'commission');
  assert.equal(queued.profile.character!.gold, before.character!.gold); assert.equal(queued.profile.character!.inventory.meal, undefined);
  hour = 19; store.synchronize('a'); assert.ok(store.profile('a').activity);
  store = new FantasyStore(file, { worldHour: () => hour }); assert.equal(store.loadError, undefined);
  hour = 20; const completed = store.synchronize('a'); assert.equal(completed.error, undefined); assert.equal(completed.profile.activity, undefined);
  assert.ok(completed.profile.character!.inventory.meal > 0); assert.ok(completed.profile.character!.gold < before.character!.gold);
  const settled = structuredClone(store.profile('a')); store.synchronize('a'); assert.deepEqual(store.profile('a'), settled);
  assert.equal(settled.character!.foodLots.find(lot => lot.item === 'meal')?.createdAt, 20);
});

test('worker skill and wage settlement share the profile save transaction and retry without duplicates', t => {
  const { file } = fixture(t, true); let hour = 17, reject = false;
  const store = new FantasyStore(file, { worldHour: () => hour, onError: () => {}, save: (target, serialized) => { if (reject) throw new Error('disk full'); fs.writeFileSync(target, serialized); } });
  const before = store.profile('a'), queued = store.apply('a', before.revision, { type: 'commission', recipe: 'cook-meal', workerId: 'artisan-2' }, () => .5);
  assert.equal(queued.error, undefined); assert.ok(queued.profile.activity);
  reject = true; hour = 20; assert.ok(store.synchronize('a').error);
  assert.equal(store.profile('a').character!.gold, before.character!.gold); assert.equal(store.profile('a').character!.inventory.meal, undefined);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).properties.employees['artisan-2'].skills.cook, 10);
  reject = false; assert.equal(store.synchronize('a').error, undefined);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8')); assert.equal(saved.properties.employees['artisan-2'].skills.cook, 13);
  assert.equal(saved.properties.workerProgress['artisan-2'].cook, 13);
  const gold = store.profile('a').character!.gold; store.synchronize('a'); assert.equal(store.profile('a').character!.gold, gold);
});

test('legacy life profession migrates independently and invalid active life profession is rejected', t => {
  const { file } = fixture(t); const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  saved.profiles.a.character.job = 'cook'; saved.profiles.a.character.jobXp.cook = 55; delete saved.profiles.a.character.lifeJob;
  fs.writeFileSync(file, JSON.stringify(saved)); const store = new FantasyStore(file);
  assert.equal(store.loadError, undefined); assert.equal(store.profile('a').character!.job, 'unassigned');
  assert.equal(store.profile('a').character!.lifeJob, 'cook'); assert.equal(store.profile('a').character!.jobXp.cook, 55);
  saved.profiles.a.character.job = 'warrior'; saved.profiles.a.character.lifeJob = 'mage'; fs.writeFileSync(file, JSON.stringify(saved));
  assert.ok(new FantasyStore(file, { onError: () => {} }).loadError);
});

test('legacy crafting and work activities retain their life profession across migration', t => {
  const { file } = fixture(t);
  const base = JSON.parse(fs.readFileSync(file, 'utf8'));
  base.profiles.a.character.job = 'cook'; base.profiles.a.character.jobXp.cook = 55; delete base.profiles.a.character.lifeJob;
  for (const action of [{ type: 'craft', recipe: 'cook-meal' }, { type: 'work' }]) {
    const saved = structuredClone(base);
    saved.profiles.a.activity = { action, seed: 17, startedAt: 17, endsAt: action.type === 'work' ? 21 : 20,
      ...(action.type === 'work' ? { work: { completed: 0, successes: 0, gold: 0, xp: 0, totalSteps: 16 } } : {}) };
    fs.writeFileSync(file, JSON.stringify(saved));
    const store = new FantasyStore(file, { worldHour: () => 17 }); assert.equal(store.loadError, undefined, action.type);
    assert.equal(store.profile('a').character!.lifeJob, 'cook');
    if (action.type === 'work') assert.deepEqual(store.profile('a').activity!.action, { type: 'work', career: 'life' });
    else assert.deepEqual(store.profile('a').activity!.action, action);
  }
});
