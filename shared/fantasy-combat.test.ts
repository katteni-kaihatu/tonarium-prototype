import { benchmarkOrder } from '../scripts/fantasy-balance-fixtures.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceFantasyCombat, createFantasyCombat, fantasyCombatOrderError, fantasyCombatTelegraph, fantasyCombatRageMultiplier, isFantasyCombatOrder,
  submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatOptions, type FantasyCombatOrder, type FantasyCombatPlayer, type FantasyCombatState,
} from './fantasy-combat.ts';
import { FANTASY_COMBAT_ENEMIES } from './fantasy-combat-catalog.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyElderBenchmarkSquad, runFantasyElderBenchmark } from './fantasy-elder-benchmark-fixture.ts';
import { fantasyCombatPlayer, fantasyCombatSupplies } from '../server/fantasy-combat-adapter.ts';
import { fantasyAdventurerGrade, fantasyCombatPower } from './fantasy-adventurer.ts';
import type { FantasyAction, FantasyProfile } from './fantasy.ts';

const names = (value: string) => ({ ko: value, en: value, ja: value });
function player(index = 0): FantasyCombatPlayer {
  return { id: `p-${index}`, userId: `u-${index}`, names: names(`Traveler ${index}`), generation: 1,
    stats: { hp: 250, mp: 80, attack: 40, defense: 12, agility: 30, intelligence: 35, accuracy: 95, magicResist: 10 }, hp: 250, mp: 80, position: 'front', range: 'melee',
    skills: [
      { id: 'heal', names: names('Healing'), kind: 'heal', mp: 8, power: 50 },
      { id: 'ward', names: names('Ward'), kind: 'guard', mp: 6, power: 40 },
      { id: 'fire', names: names('Fire'), kind: 'attack', mp: 7, power: 15, magic: true, range: 'magic' },
    ] };
}
const enemy = 'monster-goblin-raider';
function battle(count = 1, seed = 42, overrides: Partial<Parameters<typeof createFantasyCombat>[0]> = {}) {
  return createFantasyCombat({ id: 'battle-1', source: `hunt:${enemy}`, location: 'oldwatch', hour: 12, seed,
    players: Array.from({ length: count }, (_, index) => player(index)), enemies: [{ id: 'enemy-1', template: enemy }], ...overrides });
}
function choose(state: FantasyCombatState, user: string, order: FantasyCombatOrder, options: FantasyCombatOptions = {}) {
  const result = submitFantasyCombatOrder(state, user, state.revision, order, state.hour, options);
  assert.equal(result.error, undefined); assert.equal(result.changed, true); assert.ok(validFantasyCombatState(result.state)); return result;
}
function guardAll(state: FantasyCombatState) {
  let next = state;
  for (const fighter of state.fighters.filter(fighter => fighter.side === 'players' && fighter.hp > 0 && !fighter.fled)) next = choose(next, fighter.userId!, { type: 'guard' }).state;
  return next;
}

test('one to six participants receive a saved fixed scaling snapshot and small deterministic enemy variation', () => {
  const solo = battle(), party = battle(6);
  assert.ok(validFantasyCombatState(solo)); assert.equal(party.scaling.participantIds.length, 6);
  const base = solo.fighters.at(-1)!, scaled = party.fighters.at(-1)!;
  assert.equal(base.variation, scaled.variation); assert.ok(base.variation! >= .92 && base.variation! <= 1.08);
  assert.ok(scaled.stats.hp > base.stats.hp); assert.ok(scaled.stats.attack >= base.stats.attack);
  assert.deepEqual(battle(), solo); assert.deepEqual(JSON.parse(JSON.stringify(party)), party);
  assert.throws(() => battle(7)); assert.throws(() => battle(2, 42, { players: [player(), player()] }));
});

test('all players can submit concurrently at the same round revision and cannot order twice or impersonate another slot', () => {
  const original = battle(6), copy = structuredClone(original); let state = original;
  for (let index = 0; index < 6; index++) {
    const result = submitFantasyCombatOrder(state, `u-${index}`, 0, { type: 'guard' }, 12);
    assert.equal(result.error, undefined); state = result.state;
    assert.equal(state.revision, index === 5 ? 1 : 0);
    if (index < 5) assert.equal(submitFantasyCombatOrder(state, `u-${index}`, 0, { type: 'guard' }, 12).error, 'already-ordered');
  }
  assert.deepEqual(original, copy); assert.equal(state.round, 2); assert.deepEqual(state.orders, {});
  assert.equal(submitFantasyCombatOrder(state, 'u-0', 0, { type: 'guard' }, 12).error, 'stale');
  assert.equal(submitFantasyCombatOrder(state, 'intruder', 1, { type: 'guard' }, 12).error, 'not-owner');
  assert.equal(isFantasyCombatOrder({ type: 'attack', target: 'enemy-1', user: 'u-1' }), false);
});

test('saved seeds replay exactly without mutating the earlier state or resolving duplicate orders again', () => {
  const state = battle(), before = structuredClone(state), order: FantasyCombatOrder = { type: 'attack', target: 'enemy-1' };
  const one = choose(state, 'u-0', order), two = choose(JSON.parse(JSON.stringify(state)), 'u-0', order);
  assert.deepEqual(one, two); assert.deepEqual(state, before); assert.notEqual(one.state.seed, state.seed);
  const duplicate = submitFantasyCombatOrder(one.state, 'u-0', state.revision, order, state.hour);
  assert.equal(duplicate.changed, false); assert.deepEqual(duplicate.spentItems, []); assert.equal(duplicate.error, 'stale');
  for (const log of one.state.logs) if (log.roll) { assert.equal(log.roll.sides, 20); assert.ok(log.roll.value >= 1 && log.roll.value <= 20); }
});

test('melee obeys both rows and an enemy screen while bows and spells can reach the rear', () => {
  const state = battle(1, 42, { enemies: [{ id: 'enemy-1', template: enemy }, { id: 'enemy-2', template: enemy, position: 'rear' }] });
  assert.equal(fantasyCombatOrderError(state, 'u-0', { type: 'attack', target: 'enemy-2' }), 'range');
  state.fighters[0].position = 'rear';
  assert.equal(fantasyCombatOrderError(state, 'u-0', { type: 'attack', target: 'enemy-1' }), 'range');
  state.fighters[0].range = 'ranged';
  assert.equal(fantasyCombatOrderError(state, 'u-0', { type: 'attack', target: 'enemy-2' }), undefined);
  assert.equal(fantasyCombatOrderError(state, 'u-0', { type: 'skill', skill: 'fire', target: 'enemy-2' }), undefined);
  state.fighters[0].range = 'melee'; const moved = choose(state, 'u-0', { type: 'move', position: 'front' }).state;
  assert.equal(moved.fighters[0].position, 'front');
});

test('guard reduces real damage and allied wards act before faster enemies and credit actual protection', () => {
  const guarded = choose(battle(), 'u-0', { type: 'guard' }).state;
  const moved = choose(battle(), 'u-0', { type: 'move', position: 'rear' }).state;
  assert.ok(guarded.fighters[0].hp > moved.fighters[0].hp);
  let state = battle(2); state.fighters[0].position = 'front'; state.fighters[1].position = 'rear'; state.fighters[1].stats.agility = 0;
  state = choose(state, 'u-0', { type: 'guard' }).state;
  state = choose(state, 'u-1', { type: 'skill', skill: 'ward', target: 'p-0' }).state;
  assert.equal(state.fighters[0].hp, 250); assert.equal(state.fighters[1].mp, 74);
  assert.ok(state.fighters[1].contribution.effectiveActions > 0); assert.ok(state.fighters[0].contribution.effectiveActions > 0);
  assert.equal(state.fighters[0].ward, 0);
});

test('an announced enemy guard protects against faster players in the same round', () => {
  const first = battle(1, 42, { enemies: [{ id: 'enemy-1', template: 'monster-stone-golem' }] });
  first.fighters[0].stats.agility = 100;
  const second = structuredClone(first); second.round = 3;
  assert.equal(fantasyCombatTelegraph(second.fighters[1], second.round, 'en'), 'It is preparing to guard.');
  const exposed = choose(first, 'u-0', { type: 'attack', target: 'enemy-1' }).state;
  const guarded = choose(second, 'u-0', { type: 'attack', target: 'enemy-1' }).state;
  const openDamage = first.fighters[1].hp - exposed.fighters[1].hp, guardedDamage = second.fighters[1].hp - guarded.fighters[1].hp;
  assert.ok(openDamage > 0); assert.ok(guardedDamage < openDamage);
  assert.ok(guarded.logs.some(log => log.text.en.includes('braces its guard')));
});

test('learned skills heal allies and spend MP only when an effective target remains', () => {
  let state = battle(2); state.fighters[1].hp = 30;
  assert.equal(fantasyCombatOrderError(state, 'u-0', { type: 'skill', skill: 'unlearned', target: 'p-1' }), 'invalid');
  assert.equal(fantasyCombatOrderError(state, 'u-0', { type: 'skill', skill: 'heal', target: 'enemy-1' }), 'target');
  state = choose(state, 'u-0', { type: 'skill', skill: 'heal', target: 'p-1' }).state;
  state = choose(state, 'u-1', { type: 'guard' }).state;
  assert.ok(state.fighters[1].hp > 30); assert.equal(state.fighters[0].mp, 72);
  const full = battle(); assert.equal(fantasyCombatOrderError(full, 'u-0', { type: 'skill', skill: 'heal', target: 'p-0' }), 'unnecessary');
  full.fighters[0].mp = 0; assert.equal(fantasyCombatOrderError(full, 'u-0', { type: 'skill', skill: 'fire', target: 'enemy-1' }), 'mana');
});

test('private potion stock is validated externally and only effective use produces one consumption receipt', () => {
  const options: FantasyCombatOptions = { supplies: { 'u-0': { potion: { count: 1, names: names('Red potion'), hp: 80 } } } };
  let state = battle(); state.fighters[0].hp = 20;
  assert.equal(fantasyCombatOrderError(state, 'u-0', { type: 'item', item: 'potion', target: 'p-0' }), 'item');
  const used = choose(state, 'u-0', { type: 'item', item: 'potion', target: 'p-0' }, options);
  assert.deepEqual(used.spentItems, [{ userId: 'u-0', item: 'potion', count: 1 }]); assert.ok(used.state.fighters[0].hp > 20);
  assert.ok(!JSON.stringify(used.state).includes('supplies')); assert.ok(!JSON.stringify(used.state).includes('"count":1'));
  assert.equal(options.supplies!['u-0'].potion.count, 1); assert.equal(fantasyCombatOrderError(battle(), 'u-0', { type: 'item', item: 'potion', target: 'p-0' }, options), 'unnecessary');
  state = battle(2); state.fighters[0].stats.agility = 0; state.fighters[1].position = 'rear'; state.fighters[1].hp = 30; state.fighters[1].skills[0].power = 1000;
  state = choose(state, 'u-0', { type: 'item', item: 'potion', target: 'p-1' }, options).state;
  const noLongerNeeded = choose(state, 'u-1', { type: 'skill', skill: 'heal', target: 'p-1' }, options);
  assert.deepEqual(noLongerNeeded.spentItems, []); assert.equal(noLongerNeeded.state.fighters[1].hp, 250);
});

test('deadline auto-guard never counts as effective participation and overdue resolution survives JSON reload', () => {
  const state = battle(2), before = structuredClone(state);
  assert.equal(advanceFantasyCombat(state, 12.49).changed, false);
  const one = advanceFantasyCombat(state, 12.5), two = advanceFantasyCombat(JSON.parse(JSON.stringify(state)), 12.5);
  assert.deepEqual(one, two); assert.deepEqual(state, before); assert.equal(one.state.round, 2);
  for (const fighter of one.state.fighters.filter(f => f.side === 'players')) assert.deepEqual(fighter.contribution, { effectiveActions: 0, activeRounds: 0, manualActions: 0 });
  assert.deepEqual(one.spentItems, []); assert.ok(one.state.logs.some(log => log.text.en.includes('without an order')));
  const late = submitFantasyCombatOrder(state, 'u-0', 0, { type: 'attack', target: 'enemy-1' }, 12.5);
  assert.equal(late.error, 'stale'); assert.equal(late.changed, true); assert.deepEqual(late.state, one.state);
});

test('healing cannot revive a target killed earlier in the initiative order and spends no MP on that dead target', () => {
  let found = false;
  for (let seed = 1; seed < 40 && !found; seed++) {
    let state = battle(2, seed); state.fighters[0].position = 'rear'; state.fighters[0].stats.agility = 0;
    state.fighters[1].hp = 1; state.fighters[1].position = 'front';
    state = choose(state, 'u-0', { type: 'skill', skill: 'heal', target: 'p-1' }).state;
    state = choose(state, 'u-1', { type: 'guard' }).state;
    if (state.fighters[1].hp === 0) { found = true; assert.equal(state.fighters[0].mp, 80); assert.equal(fantasyCombatOrderError(state, 'u-0', { type: 'skill', skill: 'heal', target: 'p-1' }), 'target'); }
  }
  assert.equal(found, true);
});

test('an antidote removes only its listed condition and an irrelevant cure is not consumed', () => {
  const options: FantasyCombatOptions = { supplies: { 'u-0': { antidote: { count: 1, names: names('Antidote'), cleanse: ['poison'] } } } };
  const state = battle(); state.fighters[0].effects = [{ id: 'poison', turns: 3, power: 3 }, { id: 'burn', turns: 3, power: 2 }, { id: 'frost', turns: 3, power: 1 }];
  const healed = choose(state, 'u-0', { type: 'item', item: 'antidote', target: 'p-0' }, options);
  assert.equal(healed.spentItems.length, 1); assert.ok(!healed.state.fighters[0].effects.some(effect => effect.id === 'poison'));
  assert.ok(healed.state.fighters[0].effects.some(effect => effect.id === 'burn')); assert.ok(healed.state.fighters[0].effects.some(effect => effect.id === 'frost'));
  const unrelated = battle(); unrelated.fighters[0].effects = [{ id: 'frost', turns: 3, power: 1 }];
  assert.equal(fantasyCombatOrderError(unrelated, 'u-0', { type: 'item', item: 'antidote', target: 'p-0' }, options), 'unnecessary');
});

test('an escape changes only its owner and cannot shrink the encounter after another player stays', () => {
  let escaped: FantasyCombatState | undefined, usedSeed = 0;
  for (let seed = 1; seed < 100 && !escaped; seed++) {
    let state = battle(2, seed); state = choose(state, 'u-0', { type: 'escape' }).state; state = choose(state, 'u-1', { type: 'guard' }).state;
    if (state.fighters[0].fled) { escaped = state; usedSeed = seed; }
  }
  assert.ok(escaped); assert.equal(escaped.status, 'active'); assert.equal(escaped.scaling.participantIds.length, 2);
  assert.deepEqual(escaped.fighters.at(-1)!.stats, battle(2, usedSeed).fighters.at(-1)!.stats);
  assert.equal(fantasyCombatOrderError(escaped, 'u-0', { type: 'guard' }), 'down');
  assert.equal(escaped.fighters[1].fled, false);
});

test('apex threats require a provocation source and telegraph their dangerous turns before orders', () => {
  const apex = FANTASY_COMBAT_ENEMIES.find(enemy => enemy.provocationOnly && enemy.pattern === 'breath')!;
  assert.ok(apex); assert.throws(() => battle(1, 42, { enemies: [{ id: 'enemy-1', template: apex.id }] }));
  const p = player(); p.hp = p.stats.hp = 10000;
  let state = battle(1, 42, { source: 'apex:warning-confirmed', players: [p], enemies: [{ id: 'enemy-1', template: apex.id }] });
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const first = fantasyCombatTelegraph(state.fighters[1], 1, locale), warning = fantasyCombatTelegraph(state.fighters[1], 3, locale);
    assert.ok(warning); assert.notEqual(first, warning);
  }
  state = guardAll(guardAll(state)); assert.equal(state.round, 3); assert.ok(validFantasyCombatState(state));
  const before = structuredClone(state.fighters[0]); state = guardAll(state);
  assert.ok(state.fighters[0].hp < before.hp); assert.equal(state.fighters[0].effects.length, 0);
});

test('apex rage is warned before round twenty, rises only damage every three rounds, and is capped without affecting ordinary story bosses', () => {
  const apex = FANTASY_COMBAT_ENEMIES.find(enemy => enemy.provocationOnly && enemy.pattern === 'breath')!;
  const p = player(); p.hp = p.stats.hp = 10000;
  const state = battle(1, 42, { source: 'apex:warning-confirmed', players: [p], enemies: [{ id: 'enemy-1', template: apex.id }] });
  const foe = state.fighters[1], normal = battle().fighters[1], original = structuredClone(foe.stats);
  assert.equal(fantasyCombatRageMultiplier(foe, 19), 1); assert.equal(fantasyCombatRageMultiplier(foe, 20), 1.1);
  assert.equal(fantasyCombatRageMultiplier(foe, 22), 1.1); assert.equal(fantasyCombatRageMultiplier(foe, 23), 1.2);
  assert.equal(fantasyCombatRageMultiplier(foe, 1000), 2); assert.equal(fantasyCombatRageMultiplier(normal, 1000), 1);
  for (const locale of ['ko', 'en', 'ja'] as const) { assert.match(fantasyCombatTelegraph(foe, 18, locale), /20/); assert.match(fantasyCombatTelegraph(foe, 20, locale), /10%/); }
  assert.deepEqual(foe.stats, original);
});

test('arcane, frost and life-drain enemies spend finite MP on hits and switch to a physical front-line attack when empty', () => {
  for (const pattern of ['arcane', 'frost', 'drain'] as const) {
    const template = FANTASY_COMBAT_ENEMIES.find(enemy => !enemy.provocationOnly && enemy.pattern === pattern && enemy.stats.mp >= 4)!;
    const p0 = player(), p1 = player(1); p0.stats.hp = p0.hp = p1.stats.hp = p1.hp = 10000; p1.position = 'rear';
    let state = battle(2, 42, { players: [p0, p1], enemies: [{ id: 'enemy-1', template: template.id }] });
    state.fighters[2].mp = 4; state = guardAll(state);
    assert.equal(state.fighters[2].mp, 0, pattern);
    for (const locale of ['ko', 'en', 'ja'] as const) {
      const text = fantasyCombatTelegraph(state.fighters[2], state.round, locale);
      assert.match(text, /직접 공격|direct attack|直接攻撃/);
    }
    const rearHp = state.fighters[1].hp, originalMp = state.fighters[2].mp;
    const one = guardAll(state), two = guardAll(JSON.parse(JSON.stringify(state)));
    assert.deepEqual(one, two); assert.equal(one.fighters[2].mp, originalMp); assert.equal(one.fighters[1].hp, rearHp);
    assert.ok(validFantasyCombatState(one));
  }
});

test('a dragon breath spends six MP once per effective volley and empty mana removes its area attack', () => {
  const template = FANTASY_COMBAT_ENEMIES.find(enemy => enemy.provocationOnly && enemy.pattern === 'breath')!;
  const p0 = player(), p1 = player(1); p0.stats.hp = p0.hp = p1.stats.hp = p1.hp = 10000;
  let state = battle(2, 42, { source: 'apex:mana-test', players: [p0, p1], enemies: [{ id: 'enemy-1', template: template.id }] });
  state.round = 3; state.fighters[2].mp = 6; state = guardAll(state);
  assert.equal(state.fighters[2].mp, 0);
  state.round = 6; const previousLog = state.logs.at(-1)!.id;
  state = guardAll(state);
  assert.equal(state.fighters[2].mp, 0); assert.equal(state.logs.filter(log => log.id > previousLog && log.roll).length, 1);
  assert.ok(state.fighters.filter(f => f.side === 'players').every(f => f.effects.length === 0));
});

test('a fully missed magical attack does not spend MP, matching player attack-skill consumption', () => {
  const template = FANTASY_COMBAT_ENEMIES.find(enemy => !enemy.provocationOnly && enemy.pattern === 'arcane')!;
  let found = false;
  for (let seed = 1; seed < 80 && !found; seed++) {
    let state = battle(1, seed, { enemies: [{ id: 'enemy-1', template: template.id }] }); state.fighters[1].mp = 4;
    state = guardAll(state);
    const roll = state.logs.find(log => !!log.roll)?.roll;
    if (roll && !roll.success) { found = true; assert.equal(state.fighters[1].mp, 4); }
  }
  assert.equal(found, true);
});

test('prototype-looking player IDs stay ordinary owner keys instead of changing the order dictionary', () => {
  const p = player(); p.userId = '__proto__';
  const state = battle(1, 42, { players: [p] }), result = choose(state, '__proto__', { type: 'guard' });
  assert.ok(validFantasyCombatState(result.state)); assert.equal(result.state.round, 2); assert.deepEqual(result.state.orders, {});
  const p2 = player(); p2.userId = 'toString'; const second = battle(1, 42, { players: [p2] });
  assert.equal(fantasyCombatOrderError(second, 'toString', { type: 'guard' }), undefined);
});

test('corrupt, forged or privacy-bearing saved battle fields are rejected without repair', () => {
  const clean = battle();
  const variants = [
    (state: FantasyCombatState) => { state.fighters[0].hp = state.fighters[0].stats.hp + 1; },
    (state: FantasyCombatState) => { state.scaling = { ...state.scaling, participantIds: [] }; },
    (state: FantasyCombatState) => { state.orders.intruder = { type: 'guard' }; },
    (state: FantasyCombatState) => { state.fighters[0].skills.push({ id: 'bad', names: names('Bad'), kind: 'heal', mp: -1, power: 10 }); },
    (state: FantasyCombatState) => { (state.fighters[0] as unknown as Record<string, unknown>).inventory = { secret: 10 }; },
    (state: FantasyCombatState) => { state.logs[0].text = { ko: '', en: 'Bad', ja: 'Bad' }; },
  ];
  for (const change of variants) { const broken = structuredClone(clean); change(broken); assert.equal(validFantasyCombatState(broken), false); const result = advanceFantasyCombat(broken, 12.5); assert.equal(result.changed, false); assert.equal(result.error, 'invalid'); }
  assert.ok(validFantasyCombatState(clean));
});

function simulate(seed: number, profiles: Map<string, FantasyProfile>, template: string) {
  let state = createFantasyCombat({ id: 'balance-sample', location: 'hearth', source: `hunt:${template}`,
    hour: 12, seed, tactical:true, players: [...profiles].map(([id,p])=>fantasyCombatPlayer(p,id)), enemies:[{id:'foe',template}] });
  let potions=0;
  for(let step=0;state.status==='active'&&step<80;step++){
    const inputs=state.fighters.filter(f=>f.side==='players'&&livingForTest(f)).map(fighter=>({user:fighter.userId!,order:benchmarkOrder(state,'prepared',fantasyCombatSupplies(profiles,[...profiles.keys()]),undefined,fighter.userId!)}));
    for(const input of inputs){
      const result=submitFantasyCombatOrder(state,input.user,state.revision,input.order,state.hour,fantasyCombatSupplies(profiles,[...profiles.keys()]));
      assert.equal(result.error,undefined);assert.ok(validFantasyCombatState(result.state));state=result.state;
      for(const item of result.spentItems){profiles.get(item.userId)!.character!.inventory[item.item]-=item.count;potions++;}
    }
  }
  return {status:state.status,rounds:state.round,survivors:state.fighters.filter(f=>f.side==='players'&&livingForTest(f)).length,potions,enemyRemaining:state.fighters.find(f=>f.side==='enemies')!.hp};
}

const livingForTest = (fighter: FantasyCombatState['fighters'][number]) => fighter.hp > 0 && !fighter.fled;

test('a prepared beginner adventurer can handle an introductory slime using a real guild job, earned ordinary weapon and rest', () => {
  let fresh = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Human beginner', source: 'human', gender: 'female' }, () => .5).profile;
  const preparation: FantasyAction[] = [{ type: 'job', job: 'adventurer', via: 'guild' }, { type: 'work' }, { type: 'buy', item: 'blade' }, { type: 'equip', item: 'blade' }, { type: 'rest' }];
  for (const action of preparation) {
    const next = applyFantasyAction(fresh, action, () => .999);
    assert.equal(next.error, undefined, JSON.stringify({action,hour:fresh.character!.hour})); fresh = next.profile;
  }
  assert.equal(fresh.character!.job, 'adventurer'); assert.equal(fresh.character!.level, 1);
  assert.equal(fresh.character!.equipment!.weapon, 'blade'); assert.equal(fresh.character!.inventory.blade, 1);
  assert.equal(fresh.character!.gold, 1); assert.equal(fresh.character!.hp, fantasyStats(fresh.character!).hp);
  const intro = [1, 2, 3, 4, 5].map(seed => simulate(seed, new Map([['solo', structuredClone(fresh)]]), 'monster-cave-slime'));
  assert.ok(intro.filter(result => result.status === 'victory').length >= 4, JSON.stringify(intro));
  assert.ok(intro.every(result => result.status !== 'active'));
});

test('the fixed benchmark actually knows and exposes every declared prepared mage spell', () => {
  for (const fine of [false, true]) {
    const squad = fantasyElderBenchmarkSquad(fine), mage = squad.get('member-2')!;
    assert.equal(mage.character!.specialization!.spells!.length, 3);
    assert.deepEqual(fantasyCombatPlayer(mage, 'member-2').skills.filter(skill => skill.id.startsWith('prepared-spell-')).map(skill => skill.id), ['prepared-spell-1', 'prepared-spell-2', 'prepared-spell-3']);
  }
});
test('fine gear improves the legacy level-twenty advanced party efficiency even when both gear sets can win', t => {
  const seeds = Array.from({ length: 100 }, (_, index) => index + 1), prepared = runFantasyElderBenchmark(true, seeds), ordinary = runFantasyElderBenchmark(false, seeds);
  const preparedWins = prepared.filter(result => result.status === 'victory').length, ordinaryWins = ordinary.filter(result => result.status === 'victory').length;
  assert.ok(preparedWins >= ordinaryWins, `Advanced-path party gear comparison: ${preparedWins}/100 vs ${ordinaryWins}/100`);
  // 通常職の等級6単独戦に対する5%上限を、6人の上位職編成へ流用しない。
  assert.ok([...prepared, ...ordinary].every(result => result.status !== 'active'));
  assert.ok(prepared.reduce((sum, result) => sum + result.remaining, 0) <= ordinary.reduce((sum, result) => sum + result.remaining, 0));
  const efficiency = (results: typeof prepared) => results.reduce((sum, result) => ({ rounds: sum.rounds + result.rounds, potions: sum.potions + result.potions, survivors: sum.survivors + result.survivors }), { rounds: 0, potions: 0, survivors: 0 });
  const preparedEfficiency = efficiency(prepared), ordinaryEfficiency = efficiency(ordinary);
  assert.ok(preparedEfficiency.rounds < ordinaryEfficiency.rounds, `Fine gear must shorten total combat rounds: ${JSON.stringify({preparedEfficiency,ordinaryEfficiency})}`);
  assert.ok(preparedEfficiency.potions < ordinaryEfficiency.potions, `Fine gear must reduce total potion consumption: ${JSON.stringify({preparedEfficiency,ordinaryEfficiency})}`);
  assert.ok(preparedEfficiency.survivors >= ordinaryEfficiency.survivors, `Fine gear must not reduce aggregate survivors: ${JSON.stringify({preparedEfficiency,ordinaryEfficiency})}`);
  for (const fine of [true, false]) {
    const expected = fine ? prepared : ordinary;
    assert.deepEqual(runFantasyElderBenchmark(fine, [1, 42, 100]), expected.filter(result => [1, 42, 100].includes(result.seed)));
  }
  const squad = fantasyElderBenchmarkSquad(true), before = structuredClone([...squad]);
  const input = { id: 'legacy-party-snapshot', source: 'apex:apex-elder-dragon', location: 'ashpeak', hour: 108, seed: 42, tactical: true, players: [...squad].map(([id, p]) => fantasyCombatPlayer(p, id)), enemies: [{ id: 'foe', template: 'monster-elder-dragon' }] };
  const snapshot = createFantasyCombat(input);
  assert.equal(snapshot.scaling.participantIds.length, 6); assert.deepEqual(createFantasyCombat(input), snapshot); assert.deepEqual([...squad], before);
  const grades = [...squad].map(([id, p]) => { const actor = fantasyCombatPlayer(p, id); return { job: p.character!.job, level: p.character!.level, path: p.character!.jobPaths?.[p.character!.job]?.path, grade: fantasyAdventurerGrade(actor.stats,actor), power: fantasyCombatPower(actor.stats,actor) }; });
  assert.ok(grades.some(entry => entry.path !== undefined));
  t.diagnostic(JSON.stringify({ benchmark: 'legacy advanced-path six-human party efficiency; excluded by latest normal-job solo balance scope', seeds: [1, 100], preparedWins, ordinaryWins, preparedEfficiency, ordinaryEfficiency, grades }));
});
