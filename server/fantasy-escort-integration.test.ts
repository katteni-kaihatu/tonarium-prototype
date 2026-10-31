import { fantasyTestClearRoute } from '../shared/fantasy-combat-test-tactics.ts';
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { fantasyCombatOrderError, validFantasyCombatState, type FantasyCombatOrder, type FantasyCombatState } from '../shared/fantasy-combat.ts';
import { fantasyCombatDistance, fantasyCombatMoveRange, fantasyCombatPath, fantasyCombatWithinRange } from '../shared/fantasy-combat-tactics.ts';
import { fantasyEscortAdvanceTile, fantasyEscortBattleWon } from '../shared/fantasy-escort-battle.ts';
import { fantasyEscortPair, fantasyEscortTransportError } from '../shared/fantasy-escort.ts';
import { FANTASY_AMBUSH_SLOT_HOURS, fantasyAmbushHit } from '../shared/fantasy-ambush.ts';
import { FANTASY_ESCORT_AMBUSH_ENCOUNTER } from '../shared/fantasy-encounters.ts';
import type { FantasyAction, FantasyProfile } from '../shared/fantasy.ts';

function person(name: string, level = 30, job = 'warrior') {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name, source: 'human', gender: 'female' }, () => .5).profile, c = p.character!;
  p.generation = 1; c.combatStoryVersion = 1; c.job = job; c.jobXp[job] = 0; c.level = level; c.hour = 12; c.gold = 1000;
  c.location = 'hearth'; c.visited = ['hearth', 'greenwood', 'sunmeadow']; c.hunger = c.fatigue = 0; c.inventory.lantern = 1;
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp; return p;
}
function fixture(t: TestContext, input: Record<string, FantasyProfile> = { a: person('호위자'), b: person('동료') }, options: { ambush?: boolean } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-escort-integration-'));
  t.after(() => { const resolved = path.resolve(directory); assert.equal(path.dirname(resolved), path.resolve(os.tmpdir())); assert.ok(path.basename(resolved).startsWith('fantasy-escort-integration-')); fs.rmSync(resolved, { recursive: true, force: true }); });
  const file = path.join(directory, 'fantasy.json'); fs.writeFileSync(file, JSON.stringify(input)); let hour = 12, wall = 1000, fail = false;
  const errors: string[] = [], make = () => new FantasyStore(file, { combatEnabled: true, ambush: options.ambush === true, worldHour: () => hour, now: () => wall, onError: error => errors.push(String(error)), save: (target, text) => { if (fail) throw new Error('Test save failure'); fs.writeFileSync(target, text); } });
  let store = make(); assert.equal(store.loadError, undefined);
  const apply = (user: string, action: FantasyAction) => { wall += 1100; return store.apply(user, store.profile(user).revision, action, () => .999); };
  return { get store() { return store; }, file, errors, apply, time: (value: number) => { hour = value; }, fail: (value: boolean) => { fail = value; }, restart: () => { store = make(); assert.equal(store.loadError, undefined); return store; },
    editFixture: (edit: (saved: any) => void) => { const saved = JSON.parse(fs.readFileSync(file, 'utf8')); edit(saved); fs.writeFileSync(file, JSON.stringify(saved)); store = make(); assert.equal(store.loadError, undefined); },
  };
}
type Fixture = ReturnType<typeof fixture>;
function accept(f: Fixture, user = 'a') {
  const result = f.apply(user, { type: 'escortAccept', destination: 'sunmeadow' }); assert.equal(result.error, undefined); const contract = f.store.profile(user).character!.escort!; assert.equal(contract.defense, 'pending'); return contract;
}
function start(f: Fixture, user = 'a') {
  const contract = f.store.profile(user).character!.escort ?? accept(f, user), result = f.store.startEscortCombat(user, 'same', contract.id, () => .5);
  assert.equal(result.error, undefined, f.errors.join('\n')); assert.ok(result.state); assert.ok(validFantasyCombatState(result.state)); return result.state;
}
function choose(f: Fixture, state: FantasyCombatState, user: string, order: FantasyCombatOrder) {
  const result = f.store.combatOrder(user, 'same', state.id, state.revision, order); assert.equal(result.error, undefined, `${f.errors.join('\n')} order=${JSON.stringify(order)} valid=${validFantasyCombatState(state)} round=${state.round}`); assert.ok(result.state); assert.ok(validFantasyCombatState(result.state)); return result.state;
}
function action(state: FantasyCombatState, user: string, useSkills = false): FantasyCombatOrder {
  const actor = state.fighters.find(f => f.userId === user)!, enemy = state.fighters.find(f => f.side === 'enemies' && f.hp > 0 && !f.fled);
  if (!enemy) return fantasyEscortAdvanceTile(state) ? { type: 'guard' } : fantasyTestClearRoute(state, user, useSkills) ?? { type: 'guard' };
  if (useSkills) for (const skill of actor.skills.filter(skill => skill.kind === 'attack')) { const order: FantasyCombatOrder = { type: 'skill', skill: skill.id, target: enemy.id }; if (!fantasyCombatOrderError(state, user, order)) return order; }
  const attack: FantasyCombatOrder = { type: 'attack', target: enemy.id }; if (!fantasyCombatOrderError(state, user, attack)) return attack;
  const range = actor.range === 'melee' ? 1 : actor.range === 'ranged' ? 7 : 8;
  const paths = Array.from({ length: 80 }, (_, i) => ({ x: i % 10, y: Math.floor(i / 10) })).filter(tile => enemy.tile && fantasyCombatWithinRange(state, { ...actor, tile }, enemy, actor.range)).flatMap(tile => { const path = fantasyCombatPath(state, actor, tile); return path && path.length > 1 ? [path] : []; }).sort((a, b) => a.length - b.length);
  return paths[0] ? { type: 'moveTo', tile: paths[0][Math.min(paths[0].length - 1, fantasyCombatMoveRange(actor))] } : fantasyTestClearRoute(state, user, useSkills) ?? { type: 'guard' };
}
function win(f: Fixture, initial: FantasyCombatState, useSkills = false) {
  let state = initial;
  for (let n = 0; n < 45 && state.status === 'active'; n++) {
    for (const player of state.fighters.filter(f => f.side === 'players' && f.hp > 0 && !f.fled)) state = choose(f, state, player.userId!, action(state, player.userId!, useSkills));
    if (state.status !== 'active') break;
    const tile = fantasyEscortAdvanceTile(state); state = choose(f, state, state.escort!.owner, { type: 'escort', order: tile ? { type: 'moveTo', tile } : { type: 'guard' } });
  }
  assert.equal(state.status, 'victory', `${f.errors.join('\n')} wagon=${JSON.stringify(state.escort?.wagon.tile)} actors=${JSON.stringify(state.fighters.map(f=>({id:f.id,tile:f.tile,hp:f.hp,mp:f.mp})))} obstacles=${JSON.stringify(state.battlefield?.obstacles)} logs=${JSON.stringify(state.logs.slice(-8).map(log=>log.text.en))}`); assert.ok(fantasyEscortBattleWon(state)); return state;
}

test('new contracts require actual caravan defense before escort departure, while six-field legacy contracts remain usable', t => {
  const f = fixture(t), contract = accept(f), before = f.store.profile('a'), bytes = fs.readFileSync(f.file, 'utf8');
  assert.ok(fantasyEscortTransportError(before.character!, contract.destination)); assert.ok(f.apply('a', { type: 'travel', destination: contract.destination, transport: 'escort' }).error); assert.deepEqual(f.store.profile('a'), before); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  const old = person('옛 호위자'); old.character!.escort = { ...contract }; delete old.character!.escort.defense;
  const legacy = fixture(t, { a: old }); assert.equal(fantasyEscortTransportError(legacy.store.profile('a').character!, contract.destination), undefined);
  assert.equal(legacy.apply('a', { type: 'travel', destination: contract.destination, transport: 'escort' }).error, undefined); assert.ok(legacy.store.profile('a').activity);
});
test('a defended convoy unlocks travel but pays the contract reward only once after actual arrival', t => {
  const f = fixture(t), contract = accept(f), state = win(f, start(f));
  assert.equal(f.store.profile('a').character!.escort!.defense, 'cleared'); assert.equal(f.store.profile('a').character!.location, contract.from); assert.equal(f.store.profile('a').combatId, undefined);
  const defended = f.store.profile('a'), gold = defended.character!.gold;
  assert.equal(f.store.startEscortCombat('a', 'same', contract.id).error, 'incompatible'); assert.equal(f.store.combatOrder('a', 'same', state.id, state.revision, { type: 'guard' }).error, 'not-owner');
  assert.equal(f.apply('a', { type: 'travel', destination: contract.destination, transport: 'escort' }).error, undefined); const reserved = f.store.profile('a'); assert.equal(reserved.character!.gold, gold); assert.equal(reserved.character!.location, contract.from);
  f.time(reserved.activity!.endsAt - .01); f.store.tick(new Set(['a'])); assert.equal(f.store.profile('a').character!.gold, gold);
  f.time(reserved.activity!.endsAt); f.store.tick(new Set(['a'])); const arrived = f.store.profile('a');
  assert.equal(arrived.character!.location, contract.destination); assert.equal(arrived.character!.gold, gold + contract.reward); assert.equal(arrived.character!.escort, undefined); assert.ok(arrived.character!.escortHistory![fantasyEscortPair(contract.from, contract.destination)] !== undefined);
  f.store.tick(new Set(['a'])); assert.equal(f.store.profile('a').character!.gold, arrived.character!.gold); f.restart(); assert.equal(f.store.profile('a').character!.gold, arrived.character!.gold);
});
test('starting and finalizing caravan defense save atomically and retry without duplicate effects', t => {
  const f = fixture(t), contract = accept(f), initial = f.store.profile('a'), bytes = fs.readFileSync(f.file, 'utf8'); f.fail(true);
  assert.equal(f.store.startEscortCombat('a', 'same', contract.id).error, 'save-failed'); assert.deepEqual(f.store.profile('a'), initial); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  f.fail(false); let state = start(f);
  for (let n = 0; n < 40 && state.status === 'active'; n++) {
    state = choose(f, state, 'a', action(state, 'a')); const cleared = state.fighters.filter(fighter => fighter.side === 'enemies').every(fighter => fighter.hp <= 0);
    const tile = cleared ? fantasyEscortAdvanceTile(state) : undefined, order: FantasyCombatOrder = { type: 'escort', order: tile ? { type: 'moveTo', tile } : { type: 'guard' } };
    if (state.fighters.filter(fighter => fighter.side === 'enemies').every(fighter => fighter.hp <= 0) && tile?.x === state.escort!.exit.x && tile?.y === state.escort!.exit.y) {
      const before = f.store.profile('a'), disk = fs.readFileSync(f.file, 'utf8'), pending = structuredClone(state); f.fail(true);
      assert.equal(f.store.combatOrder('a', 'same', state.id, state.revision, order).error, 'save-failed'); assert.deepEqual(f.store.profile('a'), before); assert.deepEqual(f.store.combat('a', 'same'), pending); assert.equal(fs.readFileSync(f.file, 'utf8'), disk);
      f.fail(false); state = choose(f, state, 'a', order); assert.equal(state.status, 'victory'); assert.equal(f.store.profile('a').character!.escort!.defense, 'cleared'); assert.equal(f.store.combatOrder('a', 'same', state.id, pending.revision, order).error, 'not-owner'); return;
    }
    state = choose(f, state, 'a', order);
  }
  assert.fail('The convoy never reached its final extraction order');
});
test('restarting a pending convoy preserves its HP, orders, command ownership and exact contract', t => {
  const f = fixture(t), contract = accept(f); let state = start(f); state = choose(f, state, 'a', { type: 'escort', order: { type: 'guard' } });
  const before = f.store.profile('a'); f.restart(); assert.deepEqual(f.store.profile('a'), before); assert.deepEqual(f.store.combat('a', 'same'), state); assert.equal(f.store.combat('b', 'same'), null); assert.equal(f.store.combat('a', 'foreign'), null);
  state = choose(f, state, 'a', action(state, 'a')); state = win(f, state); assert.ok(fantasyEscortBattleWon(state)); assert.equal(f.store.profile('a').character!.escort!.id, contract.id);
});
test('a destroyed convoy cancels its contract without killing or charging surviving heroes', t => {
  const f = fixture(t); accept(f); const started = start(f);
  f.editFixture(saved => { const state = saved.combats[started.id].state; state.escort.wagon.hp = 1; state.fighters.find((fighter: any) => fighter.userId === 'a').tile = { x: 8, y: 7 }; state.fighters.find((fighter: any) => fighter.side === 'enemies').tile = { x: 2, y: 4 }; });
  let state = f.store.combat('a', 'same')!, original = f.store.profile('a');
  for (let n = 0; n < 12 && state.status === 'active'; n++) { state = choose(f, state, 'a', { type: 'guard' }); state = choose(f, state, 'a', { type: 'escort', order: { type: 'guard' } }); }
  assert.equal(state.status, 'defeat'); assert.equal(state.escort!.wagon.hp, 0); const after = f.store.profile('a');
  assert.equal(after.character!.escort, undefined); assert.equal(after.death, undefined); assert.equal(after.character!.hp, original.character!.hp); assert.equal(after.character!.gold, original.character!.gold); assert.equal(after.combatId, undefined); f.restart(); assert.equal(f.store.profile('a').death, undefined);
});
test('retreat closes a pending convoy without contract pay and cannot be replayed to resume it', t => {
  const f = fixture(t), contract = accept(f); let state = start(f); const gold = f.store.profile('a').character!.gold;
  for (let n = 0; n < 20 && state.status === 'active'; n++) { state = choose(f, state, 'a', { type: 'escort', order: { type: 'guard' } }); state = choose(f, state, 'a', { type: 'escape' }); }
  assert.equal(state.status, 'escaped'); assert.equal(f.store.profile('a').character!.escort, undefined); assert.equal(f.store.profile('a').character!.gold, gold); assert.equal(f.store.startEscortCombat('a', 'same', contract.id).error, 'incompatible'); f.restart(); assert.equal(f.store.profile('a').character!.escort, undefined);
});
test('actual player incapacitation uses normal town rescue while convoy failure never invents permanent death', t => {
  const p = person('부상 호위자', 1); p.character!.hp = 1; const f = fixture(t, { a: p }); accept(f); let state = start(f);
  f.editFixture(saved => { saved.combats[state.id].state.fighters.find((fighter: any) => fighter.side === 'enemies').tile = { x: 3, y: 1 }; }); state = f.store.combat('a', 'same')!;
  for (let n = 0; n < 12 && state.status === 'active'; n++) { state = choose(f, state, 'a', { type: 'escort', order: { type: 'guard' } }); state = choose(f, state, 'a', { type: 'guard' }); }
  const after = f.store.profile('a'); assert.equal(state.status, 'defeat'); assert.equal(state.fighters.find(fighter => fighter.userId === 'a')!.hp, 0); assert.equal(after.death, undefined); assert.equal(after.character!.hp,0);assert.ok(after.character!.downed);assert.equal(after.character!.escort,undefined);assert.equal(after.character!.location,'hearth');f.time(after.character!.downed!.expiresAt);const rescued=f.store.synchronize('a').profile;assert.ok(rescued.character!.hp>0);assert.equal(rescued.death,undefined);
});
test('wrong contracts, foreign sessions and strangers cannot control a convoy; eligible local party support keeps its own controls', t => {
  const f = fixture(t), contract = accept(f), initial = f.store.profile('a'); assert.equal(f.store.startEscortCombat('a', 'same', 'forged-contract').error, 'incompatible'); assert.deepEqual(f.store.profile('a'), initial);
  let state = start(f); assert.equal(f.store.combatOrder('b', 'same', state.id, state.revision, { type: 'escort', order: { type: 'guard' } }).error, 'not-owner'); assert.equal(f.store.joinCombat('b', 'foreign', state.id).error, 'not-active');
  const joined = f.store.joinCombat('b', 'same', state.id); assert.equal(joined.error, undefined); state = joined.state!; assert.equal(state.fighters.filter(fighter => fighter.userId).length, 2); assert.equal(state.escort!.contractId, contract.id);
  assert.equal(f.store.combatOrder('b', 'same', state.id, state.revision, { type: 'escort', order: { type: 'guard' } }).error, 'not-owner'); assert.equal(f.store.combatOrder('b', 'same', state.id, state.revision, { type: 'guard' }).error, undefined);
});
test('a body skill still gains actual usage when its owner submits the wagon command last', t => {
  const f = fixture(t, { a: person('마도 호위자', 30, 'mage') }); accept(f); const before = f.store.profile('a'); win(f, start(f), true); const after = f.store.profile('a');
  const skills = Object.entries(after.character!.skillXp ?? {}).filter(([id]) => !id.startsWith('path-')); assert.ok(skills.some(([id, xp]) => xp > (before.character!.skillXp?.[id] ?? 0))); assert.ok(after.character!.mana);
});
test('busy support cannot join convoy defense and retain a simultaneous rest activity', t => {
  const f = fixture(t); const sleeping = f.apply('b', { type: 'rest' }); assert.equal(sleeping.error, undefined); assert.ok(f.store.profile('b').activity);
  const state = start(f), before = f.store.profile('b'); const result = f.store.joinCombat('b', 'same', state.id); assert.ok(result.error); assert.deepEqual(f.store.profile('b'), before); assert.equal(f.store.combat('b', 'same'), null);
});
test('an ambush on an escort journey opens the wagon battle and a destroyed wagon fails the contract', t => {
  const f = fixture(t, { a: person('호위자') }, { ambush: true }), contract = accept(f);
  win(f, start(f));
  assert.equal(f.store.profile('a').character!.escort!.defense, 'cleared');
  assert.equal(f.apply('a', { type: 'travel', destination: contract.destination, transport: 'escort' }).error, undefined);
  const activity = f.store.profile('a').activity!;
  let seed = 0;
  for (; seed < 50000; seed++) if (fantasyAmbushHit({ ...activity, seed }, activity.startedAt + FANTASY_AMBUSH_SLOT_HOURS)?.slot === 0) break;
  assert.ok(seed < 50000, 'a seed that ambushes on the first travel slot');
  f.editFixture(saved => { saved.profiles.a.activity.seed = seed; });
  f.time(activity.startedAt + FANTASY_AMBUSH_SLOT_HOURS + 1e-6);
  f.store.tick(new Set(['a']));
  const ambushed = f.store.profile('a');
  assert.equal(ambushed.activity, undefined, 'the convoy stops on the road');
  assert.equal(ambushed.event, FANTASY_ESCORT_AMBUSH_ENCOUNTER);
  assert.equal(ambushed.character!.location, contract.from);
  assert.equal(ambushed.character!.escort!.id, contract.id);
  const started = f.store.startCombat([{ user: 'a', session: 'same', location: contract.from, generation: 1, source: 'encounter', target: FANTASY_ESCORT_AMBUSH_ENCOUNTER }]);
  assert.equal(started.error, undefined, f.errors.join('\n'));
  const state = started.state!;
  assert.equal(state.source, `escort:${contract.id}`); assert.ok(state.escort);
  assert.equal(state.escort!.contractId, contract.id); assert.equal(state.escort!.destination, contract.destination);
  assert.ok(state.escort!.wagon.hp > 0); assert.ok(validFantasyCombatState(state));
  const fighting = f.store.profile('a');
  assert.equal(fighting.event, null); assert.equal(fighting.combatId, state.id); assert.equal(fighting.character!.escort!.id, contract.id);
  assert.ok(fighting.log.some(entry => entry.text === '護送隊への襲撃だ。馬車を守り抜け。'));
  f.editFixture(saved => {
    const battle = saved.combats[state.id].state;
    battle.escort.wagon.hp = 1;
    battle.fighters.find((fighter: any) => fighter.userId === 'a').tile = { x: 8, y: 7 };
    battle.fighters.find((fighter: any) => fighter.side === 'enemies').tile = { x: 2, y: 4 };
  });
  let battle = f.store.combat('a', 'same')!;
  for (let n = 0; n < 12 && battle.status === 'active'; n++) { battle = choose(f, battle, 'a', { type: 'guard' }); battle = choose(f, battle, 'a', { type: 'escort', order: { type: 'guard' } }); }
  assert.equal(battle.status, 'defeat'); assert.equal(battle.escort!.wagon.hp, 0);
  const after = f.store.profile('a');
  assert.equal(after.character!.escort, undefined, 'losing the wagon ends the escort contract');
  assert.equal(after.event, null); assert.equal(after.combatId, undefined); assert.equal(after.death, undefined);
  f.restart(); assert.equal(f.store.profile('a').character!.escort, undefined); assert.equal(f.store.profile('a').death, undefined);
});
test('a plain road encounter never opens the wagon battle on a cleared escort contract', t => {
  const f = fixture(t, { a: person('호위자') }), contract = accept(f);
  win(f, start(f));
  assert.equal(f.store.profile('a').character!.escort!.defense, 'cleared');
  f.editFixture(saved => { saved.profiles.a.event = 'encounter-woodland-wolf'; });
  assert.equal(f.store.startEscortCombat('a', 'same', contract.id).error, 'busy');
  const normal = f.store.startCombat([{ user: 'a', session: 'same', location: 'hearth', generation: 1, source: 'encounter', target: 'encounter-woodland-wolf' }]);
  assert.equal(normal.error, undefined, f.errors.join('\n'));
  assert.equal(normal.state!.source, 'encounter:encounter-woodland-wolf'); assert.equal(normal.state!.escort, undefined);
});
test('effective mana growth during escort combat keeps the wagon snapshot and saved battle valid', t => {
  const p = person('성장 호위자', 30, 'mage'); p.character!.mana = { stage: 1, mastery: 1, strain: 0, affinity: 'balanced', useXp: 39 }; p.character!.hp = fantasyStats(p.character!).hp; p.character!.mp = fantasyStats(p.character!).mp;
  const f = fixture(t, { a: p }); accept(f); const initial = start(f); const hp = initial.escort!.wagon.stats.hp; const final = win(f, initial, true);
  assert.equal(final.escort!.wagon.stats.hp, hp); assert.ok(f.store.profile('a').character!.mana!.stage >= 2); f.restart(); assert.ok(validFantasyCombatState(f.store.combat('a', 'same')));
});
