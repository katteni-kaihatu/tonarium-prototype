import { FANTASY_ITEMS } from '../shared/fantasy-data.ts';
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore, isFantasyAction } from './fantasy-store.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { reconcileFoodLots } from '../shared/fantasy-life.ts';

const cooking = { type: 'cookMix', station: 'outdoor', ingredients: [{ item: 'meat', count: 1 }] } as const;
function fixture(t: TestContext, mage = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-cooking-store-'));
  t.after(() => { const target = path.resolve(directory); assert.equal(path.dirname(target), path.resolve(os.tmpdir())); assert.ok(path.basename(target).startsWith('fantasy-cooking-store-')); fs.rmSync(target, { recursive: true, force: true }); }); const file = path.join(directory, 'save.json');
  const profiles = Object.fromEntries(['a', 'b'].map(user => {
    const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: user, gender: 'female', source: 'human' }, () => .99).profile, c = p.character!;
    c.job = user === 'b' ? 'mage' : 'warrior'; c.jobXp[c.job] = 0; c.jobXp.cook = 1000;
    c.location = 'retreat-mirrorlake'; c.visited.push(c.location); c.inventory = { meat: 3, 'folding-grill': 1, ...(mage ? {} : { wood: 2, tinderbox: 1 }) };
    reconcileFoodLots(c); c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp; return [user, p];
  }));
  fs.writeFileSync(file, JSON.stringify(profiles)); let hour = 8, fail = false;
  const options = { worldHour: () => hour, onError: () => {}, save: (file: string, text: string) => { if (fail) throw new Error('disk full'); fs.writeFileSync(file, text); } };
  let store = new FantasyStore(file, options); assert.equal(store.loadError, undefined); store.tick(new Set(['a', 'b']));
  if (mage) assert.ok(store.savePartyState({ parties: [{ members: ['a', 'b'] }] }));
  return { file, get store() { return store; }, fail(value: boolean) { fail = value; }, at(value: number) { hour = value; return store.tick(new Set(['a', 'b'])); }, reload() { store = new FantasyStore(file, options); assert.equal(store.loadError, undefined); } };
}

test('mixing action accepts only registered bounded ingredients and rejects client-authored rewards and authority', () => {
  assert.ok(isFantasyAction(cooking));
  for (const patch of [{ station: ['outdoor'] }, { station: ['kitchen'] }, { station: new String('outdoor') }, { station: 'invented' }, { ingredients: [] }, { ingredients: [{ item: 'invented', count: 1 }] }, { ingredients: [{ item: 'meat', count: 0 }] }, { ingredients: [{ item: 'meat', count: 1.5 }] }, { ingredients: [{ item: 'meat', count: 100 }] }, { ingredients: [{ item: 'meat', count: 1 }, { item: 'meat', count: 1 }] }, { gold: 100 }, { cookingMage: true }, { reward: 'meal' }]) assert.equal(isFantasyAction({ ...cooking, ...patch }), false, JSON.stringify(patch));
});

test('mixing completion and cooking discipline save atomically and restart with the same seed once', t => {
  const f = fixture(t); assert.ok(isFantasyAction(cooking));
  const started = f.store.apply('a', f.store.profile('a').revision, cooking, () => .99); assert.equal(started.error, undefined); assert.ok(started.profile.activity);
  assert.equal(started.profile.character!.inventory.meat, 3); assert.equal(started.profile.character!.jobXp.cook, 1000); assert.equal(started.profile.character!.inventory.wood, 2);
  const activity = structuredClone(started.profile.activity), before = f.store.profile('a'), bytes = fs.readFileSync(f.file, 'utf8'); f.reload();
  assert.deepEqual(f.store.profile('a').activity, activity); f.fail(true); assert.ok(f.at(activity!.endsAt).some(update => update.error));
  assert.deepEqual(f.store.profile('a'), before); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  f.fail(false); f.at(activity!.endsAt); const after = f.store.profile('a'); assert.equal(after.activity, undefined);
  assert.equal(after.character!.job, 'warrior'); assert.equal(after.character!.jobXp.warrior, before.character!.jobXp.warrior);
  assert.ok(after.character!.jobXp.cook > before.character!.jobXp.cook); assert.equal(after.character!.inventory.meat, 2); assert.equal(after.character!.inventory['folding-grill'], 1);
  assert.equal(after.character!.inventory.wood, 1); f.reload(); f.at(activity!.endsAt); assert.deepEqual(f.store.profile('a'), after);
});

test('local consenting party mage fire is captured before a cooking activity is saved and survives restart', t => {
  const f = fixture(t, true); assert.equal(f.store.campMageAvailable('a'), true); assert.ok(isFantasyAction(cooking));
  const started = f.store.apply('a', f.store.profile('a').revision, cooking, () => .99); assert.equal(started.error, undefined);
  assert.equal(started.profile.activity!.cookingMage, true); const end = started.profile.activity!.endsAt;
  assert.ok(f.store.savePartyState({ parties: [{ members: ['a'] }] })); f.reload(); f.at(end);
  const after = f.store.profile('a'); assert.equal(after.activity, undefined); assert.equal(after.character!.inventory.meat, 2); assert.equal(after.character!.inventory.wood ?? 0, 0);
  assert.ok(after.character!.jobXp.cook > 1000); assert.equal(after.character!.jobXp.warrior, 0);
});

test('persisted mixing rejects forged timing ingredients and mage authority without rewriting the save', t => {
  const f = fixture(t); assert.ok(isFantasyAction(cooking));
  assert.equal(f.store.apply('a', f.store.profile('a').revision, cooking, () => .99).error, undefined);
  const saved = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  for (const patch of [{ endsAt: 9 }, { cookingMage: 1 }, { action: { ...cooking, success: true } }, { action: { ...cooking, ingredients: [{ item: 'meat', count: 100 }] } }]) {
    const broken = structuredClone(saved), people = broken.profiles ?? broken; Object.assign(people.a.activity, patch);
    const file = path.join(path.dirname(f.file), 'forged.json'), bytes = JSON.stringify(broken); fs.writeFileSync(file, bytes);
    assert.ok(new FantasyStore(file, { onError: () => {} }).loadError, JSON.stringify(patch)); assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  }
});

test('public kitchen mixing needs the cook profession and saves no outdoor mage authority', t => {
  const f = fixture(t), action = { type: 'cookMix', station: 'kitchen', ingredients: [{ item: 'fish', count: 1 }, { item: 'herb', count: 1 }], recipe: 'cook-meal' };
  assert.ok(isFantasyAction(action)); const before = f.store.profile('a'); assert.ok(f.store.apply('a', before.revision, action).error); assert.deepEqual(f.store.profile('a'), before);
  const saved = JSON.parse(fs.readFileSync(f.file, 'utf8')), people = saved.profiles ?? saved, c = people.a.character;
  c.job = 'cook'; c.location = 'hearth'; c.inventory = { fish: 1, herb: 1 }; c.foodLots = []; reconcileFoodLots(c); c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  fs.writeFileSync(f.file, JSON.stringify(saved)); f.reload();
  const workshop = { ...action, workshop: 'hearth-commercial' }; assert.ok(isFantasyAction(workshop)); assert.ok(f.store.apply('a', f.store.profile('a').revision, workshop).error);
  const started = f.store.apply('a', f.store.profile('a').revision, action, () => .99); assert.equal(started.error, undefined); assert.equal(started.profile.activity!.endsAt, 11); assert.equal(started.profile.activity!.cookingMage, undefined);
  const reservation = JSON.parse(fs.readFileSync(f.file, 'utf8')), invalid = structuredClone(reservation), invalidPeople = invalid.profiles ?? invalid; invalidPeople.a.activity.cookingMage = true;
  const malformed = path.join(path.dirname(f.file), 'kitchen-mage.json'); fs.writeFileSync(malformed, JSON.stringify(invalid)); assert.ok(new FantasyStore(malformed, { onError: () => {} }).loadError);
  f.reload(); f.at(11); assert.equal(f.store.profile('a').activity, undefined); assert.equal(f.store.profile('a').character!.inventory.fish, 0); assert.ok(f.store.profile('a').character!.jobXp.cook > 1000);
});


test('closed public kitchens reject literal cooking and coerced station packets without touching saved materials', t => {
  const f = fixture(t); f.at(22);
  const saved = JSON.parse(fs.readFileSync(f.file, 'utf8')), people = saved.profiles ?? saved, c = people.a.character;
  c.job = 'cook'; c.location = 'hearth'; c.inventory = { fish: 1, herb: 1 }; c.foodLots = []; reconcileFoodLots(c); c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  fs.writeFileSync(f.file, JSON.stringify(saved)); f.reload();
  const before = f.store.profile('a'), bytes = fs.readFileSync(f.file, 'utf8');
  for (const station of ['kitchen', ['kitchen'], ['outdoor']]) for (const recipe of ['cook-meal', 'cook-improvised']) {
    const action = { type: 'cookMix', station, ingredients: [{ item: 'fish', count: 1 }, { item: 'herb', count: 1 }], recipe };
    assert.equal(isFantasyAction(action), station === 'kitchen');
    const rejected = f.store.apply('a', before.revision, action, () => .99);
    assert.ok(rejected.error); assert.equal(rejected.changed, false);
    assert.deepEqual(f.store.profile('a'), before); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  }
});


test('freeform material cooking persists derived harmful food with one fuel and eating preserves authoritative penalties across reload', t => {
  const f = fixture(t), saved = JSON.parse(fs.readFileSync(f.file, 'utf8')), people = saved.profiles ?? saved;
  people.a.character.inventory.ore = 1; people.a.character.inventory.herb = 1; fs.writeFileSync(f.file, JSON.stringify(saved)); f.reload();
  const action = { type: 'cookMix', station: 'outdoor', recipe: 'cook-improvised', mains: ['ore', 'meat', 'herb'], ingredients: [{ item: 'ore', count: 1 }, { item: 'meat', count: 1 }, { item: 'herb', count: 1 }] };
  assert.ok(isFantasyAction(action)); const started = f.store.apply('a', f.store.profile('a').revision, action, () => .99);
  assert.equal(started.error, undefined); const endsAt = started.profile.activity!.endsAt; f.reload(); f.at(endsAt);
  const cooked = f.store.profile('a'); assert.equal(cooked.activity, undefined); const dish = FANTASY_ITEMS.find(item => item.foodPenalty?.status === 'weakness' && (cooked.character!.inventory[item.id] ?? 0) > 0)!; assert.equal(cooked.character!.inventory[dish.id], 1); assert.equal(cooked.character!.inventory.ore, 0);
  assert.equal(cooked.character!.inventory.wood, 1); assert.ok(cooked.character!.jobXp.cook > 1000);
  const eaten = f.store.apply('a', cooked.revision, { type: 'use', item: dish.id });
  assert.equal(eaten.error, undefined); assert.equal(eaten.profile.character!.inventory[dish.id], 0);
  assert.ok(eaten.profile.character!.effects?.some(effect => effect.id === 'weakness')); f.reload();
  assert.deepEqual(f.store.profile('a'), eaten.profile);
});
