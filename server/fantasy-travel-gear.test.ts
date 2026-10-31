import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';

test('server persists mid-journey gear changes without moving arrival and rolls back a failed save', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-travel-gear-')); t.after(() => { assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith('fantasy-travel-gear-')); fs.rmSync(directory, { recursive: true, force: true }); });
  const file = path.join(directory, 'save.json'); let hour = 17, fail = false;
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'Gear' }, () => .5).profile;
  Object.assign(p.character!, { hour, inventory: { ...p.character!.inventory, 'rain-cape': 1, 'fur-parka': 1, blade: 1 }, charted: ['hearth', 'greenwood'] });
  fs.writeFileSync(file, JSON.stringify({ a: p }));
  const options = { worldHour: () => hour, ambush: false, save: (name: string, data: string) => { if (fail) throw Error('disk full'); fs.writeFileSync(name, data); }, onError: () => {} };
  const store = new FantasyStore(file, options); assert.equal(store.loadError, undefined);
  const depart = store.apply('a', store.profile('a').revision, { type: 'travel', destination: 'greenwood', transport: 'foot' }, () => .99);
  assert.equal(depart.error, undefined); hour = 18; store.tick(new Set(['a']));
  const before = store.profile('a'), journey = structuredClone(before.activity); assert.ok(journey);
  const changed = store.apply('a', before.revision, { type: 'wear', item: 'rain-cape' });
  assert.equal(changed.error, undefined); assert.deepEqual(changed.profile.activity, journey); assert.equal(changed.profile.character!.hour, hour);
  assert.equal(changed.profile.character!.gold, before.character!.gold);
  const restored = new FantasyStore(file, options); assert.equal(restored.loadError, undefined); assert.equal(restored.profile('a').character!.outfit, 'rain-cape');
  fail = true; const failed = store.apply('a', changed.profile.revision, { type: 'wear', item: 'fur-parka' });
  assert.ok(failed.error); assert.deepEqual(store.profile('a'), changed.profile);
  fail = false; const retry = store.apply('a', changed.profile.revision, { type: 'wear', item: 'fur-parka' });
  assert.equal(retry.error, undefined); assert.deepEqual(retry.profile.activity, journey);
  assert.ok(store.apply('a', retry.profile.revision, { type: 'rest' }).error);
});

test('rain exposure during an active camp survives reload and split ticks do not duplicate or lose recovery', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-weather-save-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith('fantasy-weather-save-')); fs.rmSync(directory, { recursive: true, force: true }); });
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'Rain camp' }, () => .5).profile;
  Object.assign(p.character!, { location: 'greenwood', hour: 8, fatigue: 80, hunger: 0 }); p.character!.visited.push('greenwood');
  let hour = 8; const options = { worldHour: () => hour, ambush: false, onError: () => {} };
  const files = ['split.json', 'whole.json'].map(name => path.join(directory, name));
  for (const file of files) fs.writeFileSync(file, JSON.stringify({ a: p }));
  let split = new FantasyStore(files[0], options); const whole = new FantasyStore(files[1], options);
  for (const store of [split, whole]) assert.equal(store.apply('a', store.profile('a').revision, { type: 'rest' }, () => .5).error, undefined);
  hour = 12; split.tick(new Set(['a']));
  assert.ok((split.profile('a').activity?.camp?.weatherLoss ?? 0) > 0);
  split = new FantasyStore(files[0], options); assert.equal(split.loadError, undefined);
  hour = 16; split.tick(new Set(['a'])); whole.tick(new Set(['a']));
  assert.equal(split.profile('a').activity, undefined);
  assert.equal(split.profile('a').character!.fatigue, whole.profile('a').character!.fatigue);
  assert.ok(split.profile('a').character!.fatigue > 65);
});
