import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { newFantasyPropertyLedger, type FantasyPropertyCommand, type FantasyPropertyLedger } from '../shared/fantasy-property.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';

function person(name = 'Alice'): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name, source: 'human', gender: 'female' }, () => .999).profile;
  p.character!.gold = 5000; p.character!.hour = 25; p.character!.location = 'hearth'; return p;
}
function fixture(t: { after: (callback: () => void) => void }, profiles: Record<string, FantasyProfile> = { alice: person(), bob: person('Bob') }) {
  const temporaryRoot = path.resolve(os.tmpdir()), directory = fs.mkdtempSync(path.join(temporaryRoot, 'fantasy-property-'));
  t.after(() => { assert.ok(path.resolve(directory).startsWith(temporaryRoot + path.sep)); fs.rmSync(directory, { recursive: true, force: true }); });
  const file = path.join(directory, 'fantasy.json'); fs.writeFileSync(file, JSON.stringify(profiles)); return file;
}
const home = 'hearth-residence', farm = 'hearth-farmland';
const operation = (type: 'buy' | 'use', plot: string, revision: number, requestId = `${type}-${plot}-${revision}`): FantasyPropertyCommand => ({ type, plot, revision, requestId });

test('store property purchases and player-to-player resales survive restart without replay rewards', t => {
  const file = fixture(t); let store = new FantasyStore(file, { worldHour: () => 25 }); assert.equal(store.loadError, undefined);
  const purchase = store.propertyRequest('alice', operation('buy', home, 0)); assert.equal(purchase.error, undefined); assert.equal(purchase.updates.length, 1);
  assert.equal(store.propertyState('alice').owned[0].id, home); const afterBuy = store.profile('alice').character!.gold;
  assert.equal(store.propertyRequest('alice', { type: 'list', plot: home, revision: 1, requestId: 'list-for-bob', price: 650 }).error, undefined);
  const bought = store.propertyRequest('bob', operation('buy', home, 2)); assert.equal(bought.error, undefined); assert.equal(bought.updates.length, 2);
  assert.equal(store.profile('alice').character!.gold, afterBuy + 650); assert.equal(store.profile('bob').character!.gold, 4350);
  store = new FantasyStore(file, { worldHour: () => 25 }); assert.equal(store.loadError, undefined); assert.equal(store.propertyState('bob').owned[0].id, home);
  const before = fs.readFileSync(file, 'utf8'); const duplicate = store.propertyRequest('bob', operation('buy', home, 2));
  assert.equal(duplicate.error, undefined); assert.equal(duplicate.updates.length, 0); assert.equal(fs.readFileSync(file, 'utf8'), before);
});
test('save failure keeps deed, buyer gold, seller gold and listing unchanged in memory and on disk', t => {
  const file = fixture(t); let reject = false;
  const store = new FantasyStore(file, { worldHour: () => 25, onError: () => {}, save: (target, body) => { if (reject) throw new Error('injected transaction failure'); fs.writeFileSync(target, body); } });
  assert.equal(store.propertyRequest('alice', operation('buy', home, 0)).error, undefined);
  assert.equal(store.propertyRequest('alice', { type: 'list', plot: home, revision: 1, requestId: 'sale', price: 650 }).error, undefined);
  const bytes = fs.readFileSync(file, 'utf8'), alice = store.profile('alice'), bob = store.profile('bob'), view = store.propertyState('bob');
  reject = true; assert.equal(store.propertyRequest('bob', operation('buy', home, 2)).error, 'save-failed');
  assert.deepEqual(store.profile('alice'), alice); assert.deepEqual(store.profile('bob'), bob); assert.deepEqual(store.propertyState('bob'), view); assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  reject = false; assert.equal(store.propertyRequest('bob', operation('buy', home, 2)).error, undefined);
});
test('property reservations persist, complete once and retain actual profession practice', t => {
  const p = person(); p.character!.job = 'farmer'; p.character!.jobXp.farmer = 0;
  const file = fixture(t, { alice: p }); let hour = 25, store = new FantasyStore(file, { worldHour: () => hour });
  assert.equal(store.propertyRequest('alice', operation('buy', farm, 0)).error, undefined);
  const herbs = store.profile('alice').character!.inventory.herb ?? 0;
  assert.equal(store.propertyRequest('alice', operation('use', farm, 1)).error, undefined);
  const scheduled = store.profile('alice'); assert.equal(scheduled.activity?.action.type, 'propertyUse'); assert.equal(scheduled.activity?.endsAt, 29);
  assert.equal(scheduled.character!.inventory.herb ?? 0, herbs);
  store = new FantasyStore(file, { worldHour: () => hour }); assert.equal(store.loadError, undefined);
  hour = 28; store.tick(new Set(['alice'])); assert.equal(store.profile('alice').character!.inventory.herb ?? 0, herbs);
  hour = 29; store.tick(new Set(['alice'])); const completed = store.profile('alice');
  assert.equal(completed.activity, undefined); assert.equal(completed.character!.inventory.herb, herbs + 2); assert.ok(completed.character!.jobXp.farmer > 0);
  store = new FantasyStore(file, { worldHour: () => hour }); store.tick(new Set(['alice'])); assert.equal(store.profile('alice').character!.inventory.herb, herbs + 2);
});
test('new generation retains an estate but loses deed access both before and after restart', t => {
  const file = fixture(t); const first = new FantasyStore(file, { worldHour: () => 25 }); assert.equal(first.propertyRequest('alice', operation('buy', home, 0)).error, undefined);
  const envelope = JSON.parse(fs.readFileSync(file, 'utf8')); const next = person('Successor'); next.generation = 2; envelope.profiles.alice = next;
  fs.writeFileSync(file, JSON.stringify(envelope)); const store = new FantasyStore(file, { worldHour: () => 25 }); assert.equal(store.loadError, undefined);
  assert.equal(store.propertyState('alice').owned.length, 0); assert.equal(store.propertyState('alice').legacies[0].ownerName, 'Alice');
  assert.deepEqual(store.profile('alice').character!.propertyTitles ?? [], []);
  assert.equal(store.propertyRequest('bob', operation('buy', home, 2)).error, 'estate');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8')); assert.equal(saved.properties.plots[home].owner.estate, true); assert.equal(saved.properties.plots[home].listing, null);
});
test('forged ownership mirrors cannot authorize property actions through the general action route', t => {
  const p = person(); p.character!.propertyTitles = [farm]; const file = fixture(t, { alice: p });
  const store = new FantasyStore(file, { worldHour: () => 25, onError: () => {} });
  if (store.loadError) return;
  assert.deepEqual(store.profile('alice').character!.propertyTitles ?? [], []);
  const attempted = store.apply('alice', store.profile('alice').revision, { type: 'propertyUse', plot: farm }); assert.equal(attempted.changed, false); assert.ok(attempted.error);
});
test('a forged pending property activity is rejected or neutralized before it can create resources', t => {
  const p = person(); p.character!.propertyTitles = [farm]; p.character!.job = 'farmer'; p.character!.jobXp.farmer = 0;
  p.activity = { action: { type: 'propertyUse', plot: farm }, startedAt: 25, endsAt: 29, seed: 123 };
  const file = fixture(t, { alice: p }), before = fs.readFileSync(file, 'utf8'), herbs = p.character!.inventory.herb ?? 0;
  const store = new FantasyStore(file, { worldHour: () => 29, onError: () => {} });
  if (store.loadError) { assert.equal(fs.readFileSync(file, 'utf8'), before); return; }
  store.tick(new Set(['alice'])); assert.equal(store.profile('alice').character!.inventory.herb ?? 0, herbs); assert.equal(store.profile('alice').character!.jobXp.farmer, 0);
});
test('corrupt property ledgers fail closed without replacing a valid player save', t => {
  const file = fixture(t), p = person(), ledger: FantasyPropertyLedger = newFantasyPropertyLedger(); ledger.plots[home].listing!.price = 1;
  const bytes = JSON.stringify({ version: 2, profiles: { alice: p }, combats: {}, properties: ledger }); fs.writeFileSync(file, bytes);
  const store = new FantasyStore(file, { onError: () => {} }); assert.ok(store.loadError); assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  assert.ok(store.propertyRequest('alice', operation('buy', home, 0)).error);
});
