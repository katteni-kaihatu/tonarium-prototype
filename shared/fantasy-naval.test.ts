import test from 'node:test';
import assert from 'node:assert/strict';
import { createFantasyCombat, fantasyCombatOrderError, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatPlayer, type FantasyCombatState } from './fantasy-combat.ts';
import { fantasyCombatPath } from './fantasy-combat-tactics.ts';
const names = { ko: '선원', en: 'Sailor', ja: '船員' };
function sailor(user = 'a', range: FantasyCombatPlayer['range'] = 'melee'): FantasyCombatPlayer {
  return { id: `sailor-${user}`, userId: user, names, generation: 1, position: 'front', range, hp: 5000, mp: 100,
    stats: { hp: 5000, mp: 100, attack: 600, defense: 100, agility: 80, intelligence: 80, magicResist: 100, accuracy: 95 },
    skills: [{ id: 'test-dash', names, kind: 'attack', mp: 0, power: 1, range: 'melee', reach: 6, shape: 'line', motion: { kind: 'dash', distance: 6 } }] };
}
function naval(players = [sailor()]) {
  return createFantasyCombat({ id: 'naval-test', location: 'frontier-landing', source: 'encounter:encounter-reef-beast', players, enemies: [{ id: 'core', template: 'monster-deep-serpent' }], seed: 4, hour: 12, tactical: true, naval: true });
}
test('explicit naval combat separates walkable deck from water while legacy shoreline combat remains ordinary', () => {
  const state = naval(); assert.ok(state.naval); assert.equal(state.battlefield!.water!.length, 24);
  assert.equal(validFantasyCombatState(state), true);
  const actor = state.fighters.find(f => f.userId === 'a')!;
  assert.equal(fantasyCombatPath(state, actor, { x: 7, y: 1 }), undefined);
  assert.equal(fantasyCombatOrderError(state, 'a', { type: 'moveTo', tile: { x: 7, y: 1 } }), 'blocked');
  assert.equal(fantasyCombatOrderError(state, 'a', { type: 'skill', skill: 'test-dash', target: 'core' }), 'blocked');
  const ordinary = createFantasyCombat({ id: 'shore', location: 'frontier-kelp-coast', source: 'hunt:monster-deep-serpent', players: [sailor()], enemies: [{ id: 'core', template: 'monster-deep-serpent' }], seed: 4, hour: 12, tactical: true });
  assert.equal(ordinary.naval, undefined); assert.equal(ordinary.battlefield!.water, undefined); assert.equal(validFantasyCombatState(ordinary), true);
});
test('ranged attacks reach offshore bodies and the shared ship harpoon exposes a body for melee without MP', () => {
  const state = naval(), actor = state.fighters.find(f => f.userId === 'a')!;
  assert.equal(fantasyCombatOrderError(state, 'a', { type: 'attack', target: 'core' }), 'range');
  actor.range = 'ranged'; assert.equal(fantasyCombatOrderError(state, 'a', { type: 'attack', target: 'core' }), undefined); actor.range = 'melee';
  assert.ok(actor.skills.some(skill => skill.id === 'naval-deck-harpoon'));
  const result = submitFantasyCombatOrder(state, 'a', state.revision, { type: 'skill', skill: 'naval-deck-harpoon', target: 'core' }, state.hour);
  assert.equal(result.error, undefined); assert.equal(result.state.fighters.find(f => f.id === 'core')!.tile!.x, 6);
  assert.equal(result.state.fighters.find(f => f.userId === 'a')!.mp, 100);
  assert.equal(fantasyCombatOrderError(result.state, 'a', { type: 'skill', skill: 'naval-deck-harpoon', target: 'core' }), 'cooldown');
  assert.equal(validFantasyCombatState(result.state), true);
});
import { addFantasyCombatParticipant, type FantasyCombatOrder } from './fantasy-combat.ts';
import { fantasyCombatDistance, fantasyCombatMoveRange } from './fantasy-combat-tactics.ts';
import { FANTASY_NAVAL_HARPOON, ensureFantasyNavalSkills, fantasyNavalAuxiliary, fantasyNavalRewardEnemies } from './fantasy-naval.ts';
function kraken(players = [sailor()]) {
  return createFantasyCombat({ id: 'kraken-test', location: 'frontier-landing', source: 'encounter:encounter-reef-beast', players, enemies: [{ id: 'kraken', template: 'monster-juvenile-kraken' }], seed: 4, hour: 12, tactical: true, naval: true });
}
function act(state: FantasyCombatState, user: string, order: FantasyCombatOrder): FantasyCombatState {
  const result = submitFantasyCombatOrder(state, user, state.revision, order, state.hour);
  assert.equal(result.error, undefined, JSON.stringify({ order, round: state.round, error: result.error }));
  assert.equal(validFantasyCombatState(result.state), true); return result.state;
}
function closeOrAttack(state: FantasyCombatState, user: string, targetId: string): FantasyCombatOrder {
  const actor = state.fighters.find(f => f.userId === user)!, target = state.fighters.find(f => f.id === targetId)!;
  if (fantasyCombatDistance(actor.tile!, target.tile!) <= 1) return { type: 'attack', target: targetId };
  const paths = [{ x: target.tile!.x - 1, y: target.tile!.y }, { x: target.tile!.x + 1, y: target.tile!.y }, { x: target.tile!.x, y: target.tile!.y - 1 }, { x: target.tile!.x, y: target.tile!.y + 1 }]
    .map(tile => fantasyCombatPath(state, actor, tile)).filter((path): path is NonNullable<typeof path> => !!path).sort((a,b) => a.length - b.length);
  return paths[0] ? { type: 'moveTo', tile: paths[0][Math.min(paths[0].length - 1, fantasyCombatMoveRange(actor))] } : { type: 'guard' };
}
test('a melee-only crew wins by cutting all bound deck appendages with exactly one core damage share per cut', () => {
  const players = ['a','b','c'].map(user => { const p = sailor(user); p.stats.attack = 130; p.stats.agility = 40; p.stats.defense = 70; p.stats.hp = 700; p.hp = 700; p.stats.mp = 0; p.mp = 0; return p; });
  let state = kraken(players), maximum = state.fighters.find(f => f.id === 'kraken')!.stats.hp;
  assert.equal(state.naval!.offshore[0].parts.length, 3);
  assert.equal(fantasyNavalRewardEnemies(state).length, 1);
  assert.equal(state.fighters.filter(f => fantasyNavalAuxiliary(state, f)).length, 3);
  let previous = maximum, priorSevered = 0;
  for (let round = 0; round < 40 && state.status === 'active'; round++) {
    for (const player of players) {
      if (state.status !== 'active') break;
      const target = state.naval!.offshore[0].parts.find(link => !link.severed)!.id;
      state = act(state, player.userId, closeOrAttack(state, player.userId, target));
      const core = state.fighters.find(f => f.id === 'kraken')!, count = state.naval!.offshore[0].parts.filter(link => link.severed).length;
      assert.equal(previous - core.hp, Math.min(previous, (count - priorSevered) * Math.ceil(maximum / 3)));
      previous = core.hp; priorSevered = count;
    }
  }
  assert.equal(state.status, 'victory'); assert.equal(state.fighters.find(f => f.id === 'kraken')!.hp, 0);
  assert.equal(state.naval!.offshore[0].parts.every(link => link.severed), true);
  assert.equal(state.logs.some(log => log.presentation?.skill === FANTASY_NAVAL_HARPOON), false);
});
test('a ranged core kill clears living appendages and only the core remains eligible for rewards', () => {
  const player = sailor('a', 'ranged'); player.stats.attack = 1500;
  const state = act(kraken([player]), 'a', { type: 'attack', target: 'kraken' });
  assert.equal(state.status, 'victory'); assert.equal(state.fighters.filter(f => f.side === 'enemies').every(f => f.hp === 0), true);
  assert.deepEqual(fantasyNavalRewardEnemies(state).map(f => f.id), ['kraken']);
});
test('harpoon cooldown is shared across a crew, temporary skill refresh is idempotent, and tether expires after two further rounds', () => {
  let state = naval([sailor('a'), sailor('b')]);
  state = act(state, 'a', { type: 'skill', skill: FANTASY_NAVAL_HARPOON, target: 'core' });
  assert.equal(fantasyCombatOrderError(state, 'b', { type: 'skill', skill: FANTASY_NAVAL_HARPOON, target: 'core' }), 'cooldown');
  state = act(state, 'b', { type: 'guard' });
  for (let n = 0; n < 2; n++) { state = act(state, 'a', { type: 'guard' }); state = act(state, 'b', { type: 'guard' }); }
  assert.equal(state.round, 4); assert.equal(state.naval!.tether, undefined); assert.equal(state.fighters.find(f => f.id === 'core')!.tile!.x, 8);
  assert.equal(fantasyCombatOrderError(state, 'a', { type: 'skill', skill: FANTASY_NAVAL_HARPOON, target: 'core' }), undefined);
  const actor = state.fighters.find(f => f.userId === 'a')!; actor.skills = [];
  ensureFantasyNavalSkills(state, actor); ensureFantasyNavalSkills(state, actor);
  assert.equal(actor.skills.filter(skill => skill.id === FANTASY_NAVAL_HARPOON).length, 1); assert.equal(validFantasyCombatState(state), true);
});
test('late crew joins preserve severed shares and wounds, receive the common tool, and stay on the deck', () => {
  let state = kraken();
  for (let n = 0; n < 8 && !state.naval!.offshore[0].parts[0].severed; n++) state = act(state, 'a', closeOrAttack(state, 'a', 'kraken-part-1'));
  assert.equal(state.naval!.offshore[0].parts[0].severed, true);
  const oldCore = state.fighters.find(f => f.id === 'kraken')!, ratio = oldCore.hp / oldCore.stats.hp;
  const joined = addFantasyCombatParticipant(state, sailor('b'), state.hour); assert.equal(joined.error, undefined); state = joined.state;
  assert.equal(validFantasyCombatState(state), true);
  const core = state.fighters.find(f => f.id === 'kraken')!; assert.ok(Math.abs(core.hp / core.stats.hp - ratio) < .005);
  assert.equal(state.fighters.find(f => f.id === 'kraken-part-1')!.hp, 0);
  assert.equal(state.naval!.offshore[0].parts.every(link => link.damage === Math.ceil(core.stats.hp / 3)), true);
  const actor = state.fighters.find(f => f.userId === 'b')!; assert.ok(actor.tile!.x <= 6); assert.ok(actor.skills.some(skill => skill.id === FANTASY_NAVAL_HARPOON));
});
test('flying fighters can cross the water, while malformed bindings and forged ship skills fail validation', () => {
  const player = sailor(); player.body = { flying: true }; const state = naval([player]), actor = state.fighters.find(f => f.userId === 'a')!;
  assert.ok(fantasyCombatPath(state, actor, { x: 7, y: 0 }));
  assert.equal(fantasyCombatOrderError(state, 'a', { type: 'moveTo', tile: { x: 7, y: 0 } }), undefined);
  assert.equal(fantasyCombatOrderError(state, 'a', { type: 'skill', skill: 'test-dash', target: 'core' }), undefined);
  for (const mutate of [
    (c: FantasyCombatState) => { c.naval!.offshore[0].home.x = 6; },
    (c: FantasyCombatState) => { c.naval!.offshore.push(structuredClone(c.naval!.offshore[0])); },
    (c: FantasyCombatState) => { c.fighters[0].skills.find(s => s.id === FANTASY_NAVAL_HARPOON)!.power = 999; },
    (c: FantasyCombatState) => { c.battlefield!.water!.pop(); },
    (c: FantasyCombatState) => { (c.naval!.offshore as unknown[])[0] = {}; },
  ]) { const corrupt = structuredClone(state); mutate(corrupt); assert.equal(validFantasyCombatState(corrupt), false); }
});
test('grounded long-reach melee and melee splash cannot hit an offshore core until it is tethered', () => {
  const player = sailor(); player.stats.attack = 20;
  player.skills.push({ id: 'long-cleave', names, kind: 'attack', mp: 0, power: 0, range: 'melee', reach: 4, shape: 'burst', radius: 3 });
  const state = kraken([player]), actor = state.fighters.find(f => f.userId === 'a')!; actor.tile = { x: 6, y: 1 };
  assert.equal(fantasyCombatOrderError(state, 'a', { type: 'skill', skill: 'long-cleave', target: 'kraken' }), 'range');
  const maximum = state.fighters.find(f => f.id === 'kraken')!.hp;
  const next = act(state, 'a', { type: 'skill', skill: 'long-cleave', target: 'kraken-part-1' });
  assert.equal(next.naval!.offshore[0].parts.every(link => !link.severed), true);
  assert.equal(next.fighters.find(f => f.id === 'kraken')!.hp, maximum);
});
test('a melee sailor can actually defeat an offshore serpent using the temporary ship tool', () => {
  let state = act(naval(), 'a', { type: 'skill', skill: FANTASY_NAVAL_HARPOON, target: 'core' });
  state = act(state, 'a', closeOrAttack(state, 'a', 'core'));
  for (let n = 0; n < 2 && state.status === 'active'; n++) state = act(state, 'a', { type: 'attack', target: 'core' });
  assert.equal(state.status, 'victory'); assert.equal(state.fighters.find(f => f.userId === 'a')!.mp, 100);
});
test('offshore enemies stay at sea, warn for a full round, and deliver real charged damage to the deck', () => {
  const player = sailor(); player.stats.agility = 1; player.stats.defense = 0;
  let state = naval([player]), sawWarning = false, chargedDamage = false;
  for (let n = 0; n < 12 && !chargedDamage; n++) {
    const before = state.fighters.find(f => f.userId === 'a')!.hp, charge = state.fighters.find(f => f.id === 'core')!.enemyCharge;
    state = act(state, 'a', { type: 'guard' });
    const core = state.fighters.find(f => f.id === 'core')!;
    assert.equal(core.tile!.x, 8);
    if (core.enemyCharge) { sawWarning = true; assert.equal(core.enemyCharge.resolvesRound, state.round); assert.ok(core.enemyCharge.tiles.length > 0); }
    if (charge && state.fighters.find(f => f.userId === 'a')!.hp < before) chargedDamage = true;
  }
  assert.equal(sawWarning, true); assert.equal(chargedDamage, true);
});
test('tether expiry chooses free water when a flying fighter occupies the original offshore home', () => {
  const player = sailor(); player.body = { flying: true };
  let state = act(naval([player]), 'a', { type: 'skill', skill: FANTASY_NAVAL_HARPOON, target: 'core' });
  state.fighters.find(f => f.userId === 'a')!.tile = { ...state.naval!.offshore[0].home };
  state = act(state, 'a', { type: 'guard' }); state = act(state, 'a', { type: 'guard' });
  const actor = state.fighters.find(f => f.userId === 'a')!, core = state.fighters.find(f => f.id === 'core')!;
  assert.equal(state.naval!.tether, undefined); assert.ok(core.tile!.x >= 7); assert.notDeepEqual(core.tile, actor.tile); assert.equal(validFantasyCombatState(state), true);
});

test('legacy battles reject false naval markers and linked cores cannot retain more HP than their uncut parts', () => {
  const ordinary = createFantasyCombat({ id: 'legacy', location: 'hearth', source: 'story:test', players: [sailor()], enemies: [{ id: 'slime', template: 'monster-goblin-raider' }], seed: 4, hour: 12 });
  for (const marker of [null, false, 0, '']) { const corrupt = structuredClone(ordinary); (corrupt as unknown as Record<string, unknown>).naval = marker; assert.equal(validFantasyCombatState(corrupt), false); }
  const corrupt = kraken(), part = corrupt.fighters.find(f => f.id === 'kraken-part-1')!; part.hp = 0; corrupt.naval!.offshore[0].parts[0].severed = true;
  assert.equal(validFantasyCombatState(corrupt), false);
});
test('auxiliary templates require an authored naval core binding and cannot form standalone legacy encounters', () => {
  assert.throws(() => createFantasyCombat({ id: 'orphan', location: 'tidehaven', source: 'encounter:encounter-reef-beast', players: [sailor()], enemies: [{ id: 'orphan-arm', template: 'monster-juvenile-kraken-tentacle' }], seed: 4, hour: 12, tactical: true }));
  const forged = createFantasyCombat({ id: 'forged', location: 'tidehaven', source: 'encounter:encounter-reef-beast', players: [sailor()], enemies: [{ id: 'orphan-arm', template: 'monster-goblin-raider' }], seed: 4, hour: 12, tactical: true });
  forged.fighters.find(f => f.side === 'enemies')!.template = 'monster-juvenile-kraken-tentacle';
  assert.equal(validFantasyCombatState(forged), false);
});
