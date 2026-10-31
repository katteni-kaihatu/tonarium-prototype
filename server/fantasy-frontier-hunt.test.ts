import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { fantasyCombatOrderError, type FantasyCombatOrder, type FantasyCombatState } from '../shared/fantasy-combat.ts';
import { fantasyCombatMoveRange, fantasyCombatPath, fantasyCombatWithinRange } from '../shared/fantasy-combat-tactics.ts';
import { fantasyTestClearRoute } from '../shared/fantasy-combat-test-tactics.ts';
function fixture(t: TestContext) {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'Native hunter' }, () => .5).profile, c = p.character!;
  Object.assign(c, { location: 'frontier-frost-basin', hour: 12, level: 70, job: 'warrior', quests: [] });
  c.jobXp.warrior = 1000; c.visited.push(c.location); c.inventory.lantern = 1; c.inventory.meat = 1;
  c.foodLots.push({ id: 'old-meat', item: 'meat', count: 1, createdAt: 10 });
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-native-hunt-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('fantasy-native-hunt-')); fs.rmSync(dir, { recursive: true, force: true }); });
  const file = path.join(dir, 'fantasy.json'); fs.writeFileSync(file, JSON.stringify({ a: p })); let hour = 12;
  const make = () => new FantasyStore(file, { combatEnabled: true, worldHour: () => hour, onError: () => {} }); let store = make();
  assert.equal(store.loadError, undefined);
  return { get store() { return store; }, file, setHour: (value: number) => { hour = value; }, reload: () => { store = make(); assert.equal(store.loadError, undefined); } };
}
function order(state: FantasyCombatState): FantasyCombatOrder {
  const actor = state.fighters.find(f => f.userId === 'a')!, enemy = state.fighters.find(f => f.side === 'enemies' && f.hp > 0)!;
  const attack = { type: 'attack' as const, target: enemy.id };
  if (!fantasyCombatOrderError(state, 'a', attack)) return attack;
  const paths = Array.from({ length: 80 }, (_, n) => ({ x: n % 10, y: Math.floor(n / 10) })).flatMap(tile => {
    if (!fantasyCombatWithinRange(state, { ...actor, tile }, enemy, actor.range)) return [];
    const path = fantasyCombatPath(state, actor, tile); return path && path.length > 1 ? [path] : [];
  }).sort((a, b) => a.length - b.length);
  if (paths[0]) return { type: 'moveTo', tile: paths[0][Math.min(paths[0].length - 1, fantasyCombatMoveRange(actor))] };
  const clear = fantasyTestClearRoute(state, 'a'); assert.ok(clear); return clear;
}
function hunt(f: ReturnType<typeof fixture>) {
  const p = f.store.profile('a'); f.setHour(p.character!.hour);
  const started = f.store.startCombat([{ user: 'a', session: 'native', source: 'hunt', target: 'monster-ice-wolf', generation: p.generation ?? 1, location: p.character!.location }], () => .5);
  assert.equal(started.error, undefined); let state = started.state!;
  for (let round = 0; state.status === 'active' && round < 60; round++) {
    const next = f.store.combatOrder('a', 'native', state.id, state.revision, order(state));
    assert.equal(next.error, undefined); state = next.state!;
  }
  assert.equal(state.status, 'victory'); return state;
}
test('real repeatable native combat grants the fixed meat and one carcass budget with fresh food and no replay', t => {
  const f = fixture(t), first = hunt(f), c = f.store.profile('a').character!;
  assert.equal(c.inventory.meat, 4, 'one existing meat plus one combat material and two native meat');
  assert.equal(c.foodLots.find(lot => lot.id === 'old-meat')?.createdAt, 10);
  assert.equal(c.foodLots.find(lot => lot.id === 'old-meat')?.count, 1);
  const freshMeat = c.foodLots.filter(lot => lot.item === 'meat' && lot.id !== 'old-meat');
  assert.equal(freshMeat.reduce((sum, lot) => sum + lot.count, 0), 3);
  assert.ok(freshMeat.every(lot => lot.createdAt === c.hour));
  assert.deepEqual(c.carcass, { location: 'frontier-frost-basin', hour: c.hour, monster: 'monster-ice-wolf', hide: 'wolf-hide', count: 5 });
  const saved = fs.readFileSync(f.file, 'utf8');
  assert.equal(f.store.combatOrder('a', 'native', first.id, first.revision, { type: 'guard' }).error, 'not-owner');
  assert.equal(fs.readFileSync(f.file, 'utf8'), saved);
  f.setHour(c.hour); f.reload(); assert.equal(f.store.profile('a').character!.inventory.meat, 4);
  const second = hunt(f); assert.notEqual(second.id, first.id);
  assert.equal(f.store.profile('a').character!.inventory.meat, 7);
  assert.equal(f.store.profile('a').character!.carcass?.count, 5);
});
