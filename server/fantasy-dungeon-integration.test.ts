import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { FantasyParty } from './fantasy-party.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { applyFantasyDungeonAction, fantasyDungeonCombatPlan } from '../shared/fantasy-dungeon.ts';
import type { FantasyDungeonAction } from '../shared/fantasy-dungeon.ts';
function fixture(t: TestContext, room = 'entrance', rolls: number[] = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-dungeon-store-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  const profiles = Object.fromEntries(['a', 'b'].map(user => {
    let p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: user, gender: 'female' }, () => .5).profile;
    const c = p.character!; c.location = 'oldwatch'; c.visited.push('oldwatch'); c.inventory.lantern = 1; c.level = 12; c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
    p = applyFantasyDungeonAction(p, { type: 'dungeonEnter', site: 'oldwatch' }).profile;
    if (room !== 'entrance') p = applyFantasyDungeonAction(p, { type: 'dungeonMove', room }).profile; return [user, p];
  }));
  fs.writeFileSync(file, JSON.stringify(profiles)); let fail = false, wall = 1000;
  const make = () => new FantasyStore(file, { combatEnabled: true, worldHour: () => 8, onError: () => {}, save: (target, bytes) => { if (fail) throw Error('disk'); fs.writeFileSync(target, bytes); } });
  const store = make(); assert.equal(store.loadError, undefined);
  const party = new FantasyParty({ lookup: user => ({ id: user, name: user, session: 'same', world: 'fantasy', profile: store.profile(user) }), start: plans => store.startGroupInvestigation(plans), startDungeon: (plans, context) => store.startGroupDungeon(plans, context, () => rolls.shift() ?? .999),
    startCombat: (plans, context) => store.startCombat(plans, () => .5, context), now: () => wall, transaction: (run, snapshot) => store.partyTransaction(run, snapshot), load: () => store.partyState() });
  const request = (user: string, command: unknown) => { wall += 1001; return party.request(user, command); };
  request('a', { type: 'create' }); request('a', { type: 'invite', target: 'b' }); request('b', { type: 'respond', invite: party.state('b').invitations[0].id, accept: true });
  return { store, party, request, file, make, fail: (v: boolean) => { fail = v; } };
}
test('room moves require each member’s concrete consent and a failed save moves nobody', t => {
  const f = fixture(t); assert.equal(f.request('b', { type: 'readyDungeon', action: { type: 'dungeonMove', room: 'archive' } }).error, 'leader-only');
  assert.equal(f.request('a', { type: 'readyDungeon', action: { type: 'dungeonMove', room: 'archive' } }).error, undefined);
  const proposal = f.party.state('b').dungeonProposal!; assert.equal(f.request('a', { type: 'startDungeon' }).error, 'not-ready');
  assert.equal(f.request('b', { type: 'dungeonDecision', proposal: proposal.id, revision: proposal.revision, accept: true }).error, undefined);
  const before = ['a', 'b'].map(user => f.store.profile(user)); f.fail(true); assert.equal(f.request('a', { type: 'startDungeon' }).error, 'save-failed'); assert.deepEqual(['a', 'b'].map(user => f.store.profile(user)), before);
  f.fail(false); assert.equal(f.request('a', { type: 'startDungeon' }).error, undefined); assert.equal(f.store.profile('b').character!.dungeon!.active!.room, 'archive'); assert.equal(f.make().loadError, undefined);
});
test('a shared successful inspection warns companions while their separate movement traps remain personal', t => {
  const rolls = [.999, 0], f = fixture(t, 'archive', rolls);
  const group = (action: FantasyDungeonAction) => { assert.equal(f.request('a', { type: 'readyDungeon', action }).error, undefined); const p = f.party.state('b').dungeonProposal!; f.request('b', { type: 'dungeonDecision', proposal: p.id, revision: p.revision, accept: true }); assert.equal(f.request('a', { type: 'startDungeon' }).error, undefined); };
  group({ type: 'dungeonInspect' });
  assert.ok(['a', 'b'].every(user => f.store.profile(user).character!.dungeon!.sites.oldwatch.findings.includes('archive')));
  assert.deepEqual(f.store.profile('b').character!.dungeon!.sites.oldwatch.disarmed, []);
  const before = ['a', 'b'].map(user => f.store.profile(user).character!.hp); rolls.push(.999, 0); group({ type: 'dungeonMove', room: 'entrance' });
  assert.equal(f.store.profile('a').character!.hp, before[0]); assert.ok(f.store.profile('b').character!.hp < before[1]);
  assert.equal(f.store.profile('a').character!.dungeon!.active!.room, f.store.profile('b').character!.dungeon!.active!.room);
});
test('a dungeon guard opens a real saved tactical fight and credits same-room sit-outs without loot once', t => {
  const f = fixture(t, 'barracks'); assert.equal(f.request('a', { type: 'readyCombat', source: 'dungeon', target: 'oldwatch:barracks' }).error, undefined);
  const proposal = f.party.state('b').combatProposal!; f.request('b', { type: 'combatDecision', proposal: proposal.id, revision: proposal.revision, decision: 'sit-out' });
  const started = f.request('a', { type: 'startCombat' }); assert.equal(started.error, undefined);
  const battle = f.store.combat('a', 'same')!; assert.equal(battle.source, 'dungeon:oldwatch:barracks'); assert.ok(battle.battlefield); assert.ok(fantasyDungeonCombatPlan(f.store.profile('b').character!, 'oldwatch:barracks'));
  const disk = JSON.parse(fs.readFileSync(f.file, 'utf8')); const saved = disk.combats[battle.id].state, actor = saved.fighters.find((f: any) => f.userId === 'a'), enemy = saved.fighters.find((f: any) => f.side === 'enemies');
  actor.tile = { x: 7, y: 4 }; actor.stats.attack = 1000; enemy.tile = { x: 8, y: 4 }; enemy.hp = 1; fs.writeFileSync(f.file, JSON.stringify(disk));
  const store = f.make(), before = store.profile('b'); f.fail(true);
  assert.equal(store.combatOrder('a', 'same', battle.id, saved.revision, { type: 'attack', target: enemy.id }).error, 'save-failed'); assert.deepEqual(store.profile('b'), before);
  f.fail(false); const victory = store.combatOrder('a', 'same', battle.id, saved.revision, { type: 'attack', target: enemy.id }); assert.equal(victory.state!.status, 'victory');
  const after = store.profile('b'); assert.ok(after.character!.dungeon!.sites.oldwatch.cleared.includes('barracks')); assert.equal(after.character!.gold, before.character!.gold); assert.equal(after.character!.xp, before.character!.xp); assert.deepEqual(after.character!.inventory, before.character!.inventory);
  assert.equal(f.make().loadError, undefined); assert.ok(store.startCombat([{ user: 'a', generation: 1, location: 'oldwatch', session: 'same', source: 'dungeon', target: 'oldwatch:barracks' }]).error);
});
test('discovery and room loot commit together, fail without publication, and cannot be claimed after reload', t => {
  const f = fixture(t, 'archive');
  for (const action of [{ type: 'dungeonInspect' }, { type: 'dungeonDisarm' }] as const) assert.equal(f.store.apply('a', f.store.profile('a').revision, action, () => .999).error, undefined);
  const before = f.store.profile('a'), bytes = fs.readFileSync(f.file, 'utf8'); f.fail(true);
  const failed = f.store.apply('a', before.revision, { type: 'dungeonInteract' }); assert.ok(failed.error); assert.deepEqual(f.store.profile('a'), before); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  f.fail(false); const claimed = f.store.apply('a', before.revision, { type: 'dungeonInteract' }); assert.equal(claimed.error, undefined); assert.equal(claimed.profile.character!.gold, before.character!.gold + 9);
  assert.ok(claimed.profile.character!.dungeon!.sites.oldwatch.claimed.includes('archive')); assert.ok(claimed.profile.character!.magicKnowledge?.forms.includes('veil'));
  const restored = f.make(); assert.equal(restored.loadError, undefined); const settled = restored.profile('a'); assert.ok(restored.apply('a', settled.revision, { type: 'dungeonInteract' }).error); assert.deepEqual(restored.profile('a'), settled);
});
