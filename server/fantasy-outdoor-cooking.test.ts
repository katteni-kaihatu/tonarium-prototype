import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { FantasyParty } from './fantasy-party.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';

function fixture(t: TestContext, partyMage = true) {
  const prefix = path.join(os.tmpdir(), 'fantasy-outdoor-'), dir = fs.mkdtempSync(prefix), file = path.join(dir, 'save.json');
  t.after(() => { if (!path.resolve(dir).startsWith(path.resolve(prefix))) throw Error('Unexpected test path'); fs.rmSync(dir, { recursive: true, force: true }); });
  const profiles = Object.fromEntries(['a', 'b', 'outsider'].map(user => {
    const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: user }, () => .5).profile;
    Object.assign(p.character!, { hour: 8, location: 'greenwood', hp: 30, mp: 10, inventory: {}, foodLots: [] }); p.character!.visited.push('greenwood');
    if (user === 'b' && partyMage || user === 'outsider') { p.character!.job = 'mage'; p.character!.jobXp.mage = 0; }
    if (user === 'a') { p.character!.inventory = { meat: 1, 'folding-grill': 1 }; p.character!.foodLots = [{ id: 'meat', item: 'meat', count: 1, createdAt: 8 }]; }
    return [user, p];
  }));
  fs.writeFileSync(file, JSON.stringify(profiles)); let hour = 8;
  const store = new FantasyStore(file, { worldHour: () => hour, ambush: false, onError: error => { throw error; } });
  assert.equal(store.loadError, undefined);
  const party = new FantasyParty({ lookup: user => ({ id: user, name: user, session: 's', world: 'fantasy', profile: store.profile(user) }), start: () => ({ users: [], updates: [], error: 'unavailable' }), transaction: (run, snapshot) => store.partyTransaction(run, snapshot), load: () => store.partyState(), now: (() => { let time = 0; return () => time += 1001; })() });
  party.request('a', { type: 'create' }); party.request('a', { type: 'invite', target: 'b' });
  party.request('b', { type: 'respond', invite: party.state('b').invitations[0].id, accept: true });
  store.tick(new Set(['a', 'b', 'outsider']));
  return { store, file, at: (value: number) => { hour = value; return store.tick(new Set(['a', 'b', 'outsider'])); } };
}
test('authoritative server uses a co-located online party mage and saves one completed cooking result', t => {
  const f = fixture(t);
  assert.equal(f.store.campMageAvailable('a'), true);
  const started = f.store.apply('a', f.store.profile('a').revision, { type: 'campCook', recipe: 'camp-skewer' }, () => .999);
  assert.equal(started.error, undefined); assert.equal(started.profile.activity!.cookingMage, true);
  assert.equal(started.profile.character!.inventory.meat, 1);
  f.at(8.5);
  const done = f.store.profile('a'); assert.equal(done.activity, undefined); assert.equal(done.character!.inventory['camp-roast'], 1); assert.equal(done.character!.inventory.meat, 0);
  assert.equal(done.character!.inventory.wood, undefined); assert.equal(done.character!.inventory['folding-grill'], 1);
  const reload = new FantasyStore(f.file, { worldHour: () => 8.5, onError: error => { throw error; } });
  assert.equal(reload.loadError, undefined); assert.equal(reload.profile('a').character!.inventory['camp-roast'], 1);
  assert.equal(reload.tick(new Set(['a', 'b'])).length, 0);
});
test('offline, occupied, remote and unrelated mages cannot supply authoritative free ignition', t => {
  for (const condition of ['offline', 'occupied', 'remote', 'unrelated']) {
    const f = fixture(t, condition !== 'unrelated');
    let store = f.store;
    if (condition === 'offline') store.tick(new Set(['a', 'outsider']));
    if (condition === 'occupied') assert.equal(store.apply('b', store.profile('b').revision, { type: 'work' }, () => .999).error, undefined);
    if (condition === 'remote') {
      const disk = JSON.parse(fs.readFileSync(f.file, 'utf8')); disk.profiles.b.character.location = 'hearth'; fs.writeFileSync(f.file, JSON.stringify(disk));
      store = new FantasyStore(f.file, { worldHour: () => 8, onError: error => { throw error; } }); store.tick(new Set(['a', 'b', 'outsider']));
    }
    assert.equal(store.campMageAvailable('a'), false, condition);
    const before = store.profile('a'), result = store.apply('a', before.revision, { type: 'campCook', recipe: 'camp-skewer' }, () => .999);
    assert.ok(result.error, condition); assert.equal(result.changed, false); assert.deepEqual(store.profile('a'), before);
  }
});
