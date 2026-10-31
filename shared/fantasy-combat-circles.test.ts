import test from 'node:test';
import assert from 'node:assert/strict';
import { createFantasyCombat, submitFantasyCombatOrder, fantasyCombatOrderError, validFantasyCombatState, type FantasyCombatSkill, type FantasyCombatState } from './fantasy-combat.ts';
import { fantasyCombatEnemy } from './fantasy-combat-catalog.ts';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyCompileCircle, grantFantasyCircleBasics, learnFantasyCircleBook } from './fantasy-magic-circle.ts';
import { fantasyCombatPlayer } from '../server/fantasy-combat-adapter.ts';
const names = { ko: '술식', en: 'Circle', ja: '術式' };
const circle = (overrides: Partial<FantasyCombatSkill> = {}): FantasyCombatSkill => ({ id: 'circle', names, kind: 'attack', power: 25, mp: 10, magic: true, range: 'magic', reach: 6, radius: 1, selfOnly: false, effects: {}, ...overrides });
function battle(skill = circle(), seed = 42) {
  const stats = { hp: 500, mp: 100, attack: 20, defense: 5, agility: 90, intelligence: 30, accuracy: 100, magicResist: 5 };
  const state = createFantasyCombat({ id: 'circles', source: 'hunt:monster-stone-golem', location: 'oldwatch', seed, hour: 12, tactical: true,
    players: [0, 1].map(i => ({ id: `p${i}`, userId: `u${i}`, generation: 1, names, stats: { ...stats }, hp: 500, mp: 100, position: 'rear', range: 'magic', skills: i ? [] : [skill] })),
    enemies: [{ id: 'e0', template: 'monster-stone-golem' }, { id: 'e1', template: 'monster-stone-golem' }, { id: 'e2', template: 'monster-stone-golem' }] });
  state.fighters[0].tile = { x: 1, y: 3 }; state.fighters[1].tile = { x: 2, y: 3 };
  for (let i = 0; i < 3; i++) { const e = state.fighters[2 + i]; e.tile = { x: 5 + (i === 2 ? 3 : 0), y: 3 + (i === 1 ? 1 : 0) }; e.stats.hp = e.hp = 800; e.stats.agility = 0; }
  return state;
}
function cast(state: FantasyCombatState, target = 'e0') {
  let result = submitFantasyCombatOrder(state, 'u0', state.revision, { type: 'skill', skill: 'circle', target }, state.hour); assert.equal(result.error, undefined);
  result = submitFantasyCombatOrder(result.state, 'u1', result.state.revision, { type: 'guard' }, state.hour); assert.equal(result.error, undefined); assert.ok(validFantasyCombatState(result.state)); return result;
}
test('circle scatter damages only visible foes in its actual radius, charges once, and credits one effective cast', () => {
  const result = cast(battle());
  assert.ok(result.state.fighters[2].hp < 800); assert.ok(result.state.fighters[3].hp < 800); assert.equal(result.state.fighters[4].hp, 800);
  assert.equal(result.state.fighters[0].mp, 90); assert.equal(result.usedSkills?.filter(use => use.skill === 'circle').length, 1);
});
test('circle reach and self-only restrictions validate both the order and a forged persisted target', () => {
  const state = battle(circle({ reach: 3 }));
  assert.equal(fantasyCombatOrderError(state, 'u0', { type: 'skill', skill: 'circle', target: 'e0' }), 'range');
  state.orders.u0 = { type: 'skill', skill: 'circle', target: 'e0' };
  const result = submitFantasyCombatOrder(state, 'u1', state.revision, { type: 'guard' }, state.hour);
  assert.equal(result.state.fighters[0].mp, 100); assert.equal(result.state.fighters[2].hp, 800);
  const blessing = battle(circle({ kind: 'blessing', selfOnly: true, effects: { guard: 15 } }));
  assert.equal(fantasyCombatOrderError(blessing, 'u0', { type: 'skill', skill: 'circle', target: 'p1' }), 'target');
});
test('cleanse removes real ailments with MP and effective credit only when needed', () => {
  const state = battle(circle({ kind: 'cleanse', radius: 0, effects: { cleanse: true } }));
  assert.equal(fantasyCombatOrderError(state, 'u0', { type: 'skill', skill: 'circle', target: 'p1' }), 'unnecessary');
  state.fighters[1].effects = [{ id: 'poison', power: 5, turns: 3 }, { id: 'frost', power: 1, turns: 3 }];
  const result = cast(state, 'p1'); assert.deepEqual(result.state.fighters[1].effects, []); assert.equal(result.state.fighters[0].mp, 90); assert.equal(result.usedSkills?.length, 1);
});
test('miracle alone revives downed player allies, and safely relocates an occupied downed tile', () => {
  const state = battle(circle({ kind: 'miracle', radius: 0, power: 35, effects: { revive: true } })); state.fighters[1].hp = 0;
  state.fighters[2].tile = { ...state.fighters[1].tile! };
  assert.equal(fantasyCombatOrderError(state, 'u0', { type: 'skill', skill: 'circle', target: 'e0' }), 'target');
  assert.equal(fantasyCombatOrderError(state, 'u0', { type: 'skill', skill: 'circle', target: 'missing' }), 'target');
  const result = submitFantasyCombatOrder(state, 'u0', state.revision, { type: 'skill', skill: 'circle', target: 'p1' }, state.hour);
  assert.equal(result.error, undefined); assert.ok(result.state.fighters[1].hp > 0); assert.ok(validFantasyCombatState(result.state)); assert.equal(result.state.fighters[0].mp, 90);
  for (const kind of ['heal', 'guard'] as const) { const s = battle(circle({ kind })); s.fighters[1].hp = 0; assert.equal(fantasyCombatOrderError(s, 'u0', { type: 'skill', skill: 'circle', target: 'p1' }), 'target'); }
});
test('golem and slime traits cause bounded actual physical-versus-magic damage differences', () => {
  assert.ok(fantasyCombatEnemy('monster-stone-golem')!.physicalMultiplier! < 1);
  assert.ok(fantasyCombatEnemy('monster-meadow-slime')!.magicMultiplier! < 1);
  const physical = battle(circle({ magic: false })), magical = battle(circle({ magic: true }));
  physical.fighters[0].stats.intelligence = 0; physical.fighters[0].stats.attack = 50; magical.fighters[0].stats.intelligence = 0; magical.fighters[0].stats.attack = 125;
  for (const s of [physical, magical]) for (const e of s.fighters.slice(2)) { e.stats.defense = 0; e.stats.magicResist = 0; }
  assert.ok(800 - cast(physical).state.fighters[2].hp < 800 - cast(magical).state.fighters[2].hp);
});
test('persisted circle data is strictly bounded and rejects unknown injected effect keys', () => {
  const state = battle(); assert.ok(validFantasyCombatState(JSON.parse(JSON.stringify(state))));
  for (const patch of [{ reach: 99 }, { radius: -1 }, { selfOnly: 'yes' }, { effects: { immunity: true } }]) { const forged = structuredClone(state); Object.assign(forged.fighters[0].skills[0], patch); assert.equal(validFantasyCombatState(forged), false); }
});


test('circle blessing increases actual later damage for three rounds and credits its first useful effect once', () => {
  const initial = battle(circle({ kind: 'blessing', reach: 0, radius: 0, selfOnly: true, effects: { might: 6, guard: 10 } }));
  const blessed = cast(initial, 'p0'); assert.equal(blessed.state.fighters[0].blessing?.turns, 2);
  const control = structuredClone(blessed.state); delete control.fighters[0].blessing;
  const attack = (state: FantasyCombatState) => {
    const first = submitFantasyCombatOrder(state, 'u0', state.revision, { type: 'attack', target: 'e0' }, state.hour); assert.equal(first.error, undefined);
    return submitFantasyCombatOrder(first.state, 'u1', first.state.revision, { type: 'guard' }, state.hour);
  };
  const boosted = attack(blessed.state), ordinary = attack(control);
  assert.ok(boosted.state.fighters[2].hp < ordinary.state.fighters[2].hp);
  assert.equal(boosted.usedSkills?.filter(use => use.skill === 'circle').length, 1);
  const second = attack(boosted.state); assert.equal(second.usedSkills?.filter(use => use.skill === 'circle').length ?? 0, 0); assert.equal(second.state.fighters[0].blessing, undefined);
});

test('circle burn and slow leave real damaging and movement-reducing conditions', () => {
  const burned = cast(battle(circle({ effects: { burn: 3, slow: 1 } }))), plain = cast(battle());
  assert.ok(burned.state.fighters[2].hp <= plain.state.fighters[2].hp - 3);
  assert.ok(burned.state.fighters[2].effects.some(effect => effect.id === 'frost'));
});

test('normal restorative items cannot revive downed allies, and enemies ignore downed targets', () => {
  const state = battle(circle({ kind: 'miracle', effects: { revive: true } })); state.fighters[1].hp = 0;
  state.fighters[1].names = { ko: '쓰러진 동료', en: 'Downed Ally', ja: '倒れた仲間' };
  const options = { supplies: { u0: { potion: { count: 1, names, hp: 100 } } } };
  assert.equal(fantasyCombatOrderError(state, 'u0', { type: 'item', item: 'potion', target: 'p1' }, options), 'target');
  const guard = submitFantasyCombatOrder(state, 'u0', state.revision, { type: 'guard' }, state.hour);
  assert.equal(guard.error, undefined); assert.equal(guard.state.fighters[1].hp, 0);
  assert.ok(!guard.state.logs.some(entry => entry.text.en.includes('→ Downed Ally')));
});

test('area effects cannot pass through a wall or spread to the other side', () => {
  const state = battle(circle({ radius: 4 })); state.fighters[1].hp = 100;
  state.battlefield!.blocked.push({ x: 6, y: 3 });
  const result = cast(state);
  assert.equal(result.state.fighters[4].hp, 800); assert.equal(result.state.fighters[1].hp, 100);
});

test('adapter recompiles authoritative circle effects, keeps physical impulse physical, and preserves legacy defense', () => {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Mage', gender: 'female' }, () => .5).profile;
  const c = p.character!; c.job = 'mage'; c.jobXp.mage = 100; c.level = 10; grantFantasyCircleBasics(c); learnFantasyCircleBook(c, 'rune-physical');
  const legacy = fantasyCombatPlayer(p, 'mage');
  c.specialization = { spells: [{ slot: 1, element: 'stone', form: 'bolt', circle: { core: 'physical', runes: ['scatter'] } }] };
  const compiled = fantasyCompileCircle(c, 'physical', ['scatter'])!, actor = fantasyCombatPlayer(p, 'mage'), skill = actor.skills.find(skill => skill.id === 'prepared-spell-1')!;
  assert.equal(skill.magic, false); assert.equal(skill.radius, 2); assert.equal(skill.power, compiled.power); assert.equal(skill.mp, compiled.mp);
  assert.deepEqual(actor.stats, legacy.stats);
  const flame = fantasyCompileCircle(c, 'flame', ['scatter'])!, focus = fantasyCompileCircle(c, 'flame', ['scatter', 'focus'])!, economy = fantasyCompileCircle(c, 'flame', ['scatter', 'economy'])!;
  const skillOf = ({ core: _core, runes: _runes, ...spell }: typeof flame) => circle(spell);
  const baseResult = cast(battle(skillOf(flame))), focusResult = cast(battle(skillOf(focus))), economyResult = cast(battle(skillOf(economy)));
  assert.ok(focusResult.state.fighters[2].hp < baseResult.state.fighters[2].hp); assert.ok(economyResult.state.fighters[2].hp > baseResult.state.fighters[2].hp);
  assert.ok(economyResult.state.fighters[0].mp > baseResult.state.fighters[0].mp);
});

test('attack guard riders protect their caster and never the attacked enemies', () => {
  let protectedCaster = false;
  for (let seed = 1; seed <= 20 && !protectedCaster; seed++) {
    const run = (ward: number) => { const state = battle(circle({ effects: ward ? { guard: ward } : {} }), seed); state.fighters[1].tile = { x: 1, y: 4 }; state.fighters[2].tile = { x: 2, y: 3 }; return cast(state); };
    const guarded = run(20), plain = run(0);
    assert.equal(guarded.state.fighters[2].hp, plain.state.fighters[2].hp);
    assert.equal(guarded.state.fighters[3].hp, plain.state.fighters[3].hp);
    if (guarded.state.fighters[0].hp > plain.state.fighters[0].hp) { protectedCaster = true; assert.equal(guarded.state.fighters[0].mp, 90); assert.equal(guarded.usedSkills?.filter(use => use.skill === 'circle').length, 1); }
  }
  assert.ok(protectedCaster);
});
