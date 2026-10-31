import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { fantasyEncounterFor } from '../shared/fantasy-encounters.ts';
import { fantasyCombatStartPlan } from '../shared/fantasy-combat-challenges.ts';
import { validFantasyCombatState, type FantasyCombatState } from '../shared/fantasy-combat.ts';

function fixture(t: TestContext) {
  const created = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'Guardian' }, () => .99);
  assert.equal(created.error, undefined);
  const profile = created.profile, character = profile.character!;
  profile.generation = 1; character.job = 'shieldbearer'; character.jobXp.shieldbearer = 0; character.level = 13;
  character.hour = 1000; character.location = 'ashpeak'; character.visited = ['hearth', 'ashpeak']; character.inventory.lantern = 1;
  character.hp = fantasyStats(character).hp; character.mp = fantasyStats(character).mp;
  profile.event = fantasyEncounterFor('volcano', 'travel-ambush').id;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-enemy-charge-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'fantasy.json'); fs.writeFileSync(file, JSON.stringify({ a: profile }));
  let hour = character.hour, fail = false;
  const load = () => new FantasyStore(file, { combatEnabled: true, worldHour: () => hour, onError: () => {}, save: (target, data) => { if (fail) throw new Error('Injected charge save failure'); fs.writeFileSync(target, data); } });
  let store = load(); assert.equal(store.loadError, undefined);
  const plan = fantasyCombatStartPlan(store.profile('a'), 'encounter', profile.event)!;
  assert.equal(plan.enemies[0].template, 'monster-flame-lizard');
  const started = store.startCombat([{ user: 'a', session: 'charge-session', generation: 1, location: character.location, source: 'encounter', target: profile.event }], () => .5);
  assert.equal(started.error, undefined); assert.ok(started.state);
  const reload = () => { store = load(); assert.equal(store.loadError, undefined); };
  const turn = (state: FantasyCombatState) => {
    const result = store.combatOrder('a', 'charge-session', state.id, state.revision, { type: 'guard' });
    if (result.state) hour = result.state.hour;
    return result;
  };
  return { get store() { return store; }, file, load, reload, turn, fail: (value: boolean) => { fail = value; }, state: started.state! };
}
function prepared(t: TestContext) {
  const f = fixture(t); let state = f.state;
  for (let step = 0; step < 12; step++) {
    const previous = state, result = f.turn(state); assert.equal(result.error, undefined); assert.ok(result.state); state = result.state;
    assert.equal(state.status, 'active'); assert.ok(validFantasyCombatState(state));
    const enemy = state.fighters.find(fighter => fighter.side === 'enemies')!;
    if (!enemy.enemyCharge) continue;
    const skill = enemy.skills.find(skill => skill.id === enemy.enemyCharge!.skill)!;
    assert.ok(skill.magic); assert.ok(skill.mp > 0);
    assert.equal(enemy.mp, previous.fighters.find(fighter => fighter.id === enemy.id)!.mp - skill.mp);
    return { f, state, enemyId: enemy.id };
  }
  assert.fail('Real encounter did not reach a prepared attack');
}

test('actual store reload preserves a pending magic charge and releases it once without paying MP twice', t => {
  const { f, state, enemyId } = prepared(t), beforeProfile = f.store.profile('a'), enemy = state.fighters.find(fighter => fighter.id === enemyId)!;
  const charge = structuredClone(enemy.enemyCharge!), bytes = fs.readFileSync(f.file, 'utf8');
  assert.ok(JSON.parse(bytes).combats[state.id].state.fighters.some((fighter: { enemyCharge?: unknown }) => fighter.enemyCharge));
  f.reload(); assert.deepEqual(f.store.combat('a', 'charge-session'), state); assert.deepEqual(f.store.profile('a'), beforeProfile);
  assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  const result = f.turn(state); assert.equal(result.error, undefined); const after = result.state!, released = after.fighters.find(fighter => fighter.id === enemyId)!;
  assert.equal(released.enemyCharge, undefined); assert.equal(released.mp, enemy.mp); assert.equal(after.revision, state.revision + 1);
  assert.ok(after.logs.some(log => log.round === charge.resolvesRound && log.presentation?.kind === 'attack' && log.presentation.skill === charge.skill));
  assert.equal(f.store.profile('a').character!.hp, after.fighters.find(fighter => fighter.userId === 'a')!.hp);
  f.reload(); assert.deepEqual(f.store.combat('a', 'charge-session'), after);
  const duplicate = f.store.combatOrder('a', 'charge-session', state.id, state.revision, { type: 'guard' });
  assert.equal(duplicate.error, 'stale'); assert.deepEqual(f.store.combat('a', 'charge-session'), after);
});

test('failed release save rolls back the full battle, seed, charge, profiles and bytes until one retry commits', t => {
  const { f, state, enemyId } = prepared(t), profile = f.store.profile('a'), bytes = fs.readFileSync(f.file, 'utf8'), enemyMp = state.fighters.find(fighter => fighter.id === enemyId)!.mp;
  f.fail(true);
  const failed = f.turn(state); assert.equal(failed.error, 'save-failed');
  assert.deepEqual(f.store.combat('a', 'charge-session'), state); assert.deepEqual(f.store.profile('a'), profile); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  f.fail(false); f.reload(); assert.deepEqual(f.store.combat('a', 'charge-session'), state);
  const result = f.turn(state); assert.equal(result.error, undefined); const committed = result.state!;
  assert.equal(committed.revision, state.revision + 1); assert.notEqual(committed.seed, state.seed);
  assert.equal(committed.fighters.find(fighter => fighter.id === enemyId)!.mp, enemyMp); assert.equal(committed.fighters.find(fighter => fighter.id === enemyId)!.enemyCharge, undefined);
  const committedProfile = f.store.profile('a'), committedBytes = fs.readFileSync(f.file, 'utf8');
  assert.equal(f.store.combatOrder('a', 'charge-session', state.id, state.revision, { type: 'guard' }).error, 'stale');
  assert.deepEqual(f.store.combat('a', 'charge-session'), committed); assert.deepEqual(f.store.profile('a'), committedProfile); assert.equal(fs.readFileSync(f.file, 'utf8'), committedBytes);
  f.reload(); assert.deepEqual(f.store.combat('a', 'charge-session'), committed); assert.deepEqual(f.store.profile('a'), committedProfile);
});

test('legacy saved enemies without skill metadata load and continue through the actual store', t => {
  const f = fixture(t), saved = JSON.parse(fs.readFileSync(f.file, 'utf8')), state: FantasyCombatState = saved.combats[f.state.id].state;
  for (const enemy of state.fighters.filter(fighter => fighter.side === 'enemies')) { enemy.skills = []; delete enemy.enemyCharge; }
  assert.ok(validFantasyCombatState(state)); fs.writeFileSync(f.file, JSON.stringify(saved)); f.reload();
  assert.deepEqual(f.store.combat('a', 'charge-session'), state);
  const result = f.turn(state); assert.equal(result.error, undefined); assert.ok(validFantasyCombatState(result.state));
  assert.ok(result.state!.fighters.filter(fighter => fighter.side === 'enemies').every(enemy => !enemy.enemyCharge));
});

test('the store rejects forged pending geometry while keeping the valid original save loadable', t => {
  const { f, state, enemyId } = prepared(t), bytes = fs.readFileSync(f.file, 'utf8');
  for (const mutation of ['duplicate', 'outside', 'timing'] as const) {
    const saved = JSON.parse(bytes), battle: FantasyCombatState = saved.combats[state.id].state;
    const pending = battle.fighters.find(fighter => fighter.id === enemyId)!.enemyCharge!;
    if (mutation === 'duplicate') pending.tiles.push({ ...pending.tiles[0] });
    if (mutation === 'outside') pending.tiles.push({ x: 99, y: 99 });
    if (mutation === 'timing') pending.resolvesRound++;
    fs.writeFileSync(f.file, JSON.stringify(saved)); assert.ok(f.load().loadError, mutation);
  }
  fs.writeFileSync(f.file, bytes); f.reload(); assert.deepEqual(f.store.combat('a', 'charge-session'), state);
});
