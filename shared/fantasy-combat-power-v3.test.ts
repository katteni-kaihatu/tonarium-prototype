import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyCombatPower, fantasyAdventurerGrade, fantasyCombatPowerIndex } from './fantasy-adventurer.ts';
import type { FantasyCombatPlayer, FantasyCombatSkill, FantasyCombatCompanionInput } from './fantasy-combat.ts';

const names = { ko: '평가', en: 'Rating', ja: '評価' };
const stats = { hp: 300, mp: 60, attack: 60, defense: 20, agility: 20, intelligence: 30, accuracy: 80, magicResist: 20 };
const art = (overrides: Partial<FantasyCombatSkill> = {}): FantasyCombatSkill => ({ id: 'strike', names, kind: 'attack', mp: 10, power: 30, range: 'melee', ...overrides });
const actor = (skills: FantasyCombatSkill[] = []): FantasyCombatPlayer => ({ id: 'player', userId: 'u', generation: 1, names, stats, hp: stats.hp, mp: stats.mp, range: 'melee', position: 'front', skills });
const power = (skills: FantasyCombatSkill[]) => fantasyCombatPower(stats, actor(skills));

test('learned usable attacks affect rating without rewarding duplicate or inferior skillbooks', () => {
  const empty = power([]), trained = power([art()]);
  assert.ok(trained > empty);
  assert.equal(power([art(), art(), art({ id: 'inferior', power: 1, mp: 60 })]), trained);
  assert.equal(power(Array.from({ length: 100 }, (_, i) => art({ id: `equivalent-${i}` }))), trained);
});

test('attack casts share a finite MP budget and unaffordable skills add no rating', () => {
  assert.ok(power([art({ mp: 10 })]) > power([art({ mp: 60 })]));
  assert.equal(power([art({ mp: 61 })]), power([]));
  assert.equal(power([art({ kind: 'miracle', power: 1000, mp: 0 })]), power([]));
  assert.equal(power([art({ kind: 'mana', power: 1000, mp: 0 })]), power([]));
});

test('spell damage follows the ordinary range fallback and explicit-reach physical spell rules', () => {
  assert.equal(power([art({ range: 'magic' })]), power([art({ range: 'magic', magic: true })]));
  assert.ok(power([art({ range: 'magic', reach: 8, magic: true })]) > power([art({ range: 'magic', reach: 8, magic: false })]));
});

test('healing and ward count useful survival while paying their lost attack turns', () => {
  const base = power([]);
  assert.ok(power([art({ kind: 'heal', power: 180, mp: 10, selfOnly: true })]) > base);
  assert.ok(power([art({ kind: 'guard', power: 180, mp: 10 })]) > base);
  assert.equal(power([art({ kind: 'guard', power: 1, mp: 10 })]), base);
  assert.ok(power([art({ kind: 'heal', power: 1000000, mp: 0 })]) < base * 1.5);
  assert.equal(power([art({ kind: 'heal', power: 1000, mp: 61 })]), base);
  const richAttack = art({ mp: 60, power: 60 }), richHeal = art({ id: 'heal', kind: 'heal', mp: 60, power: 180 });
  assert.equal(power([richAttack, richHeal]), Math.max(power([richAttack]), power([richHeal])));
});

test('a durable healer can spend a longer shared resource budget without receiving unlimited survival', () => {
  const durable = { ...stats, hp: 600 }, healing = art({ kind: 'heal', power: 90, mp: 10 });
  const base = fantasyCombatPower(durable, actor()), sustained = fantasyCombatPower(durable, actor([healing]));
  assert.ok(sustained > base * 1.03);
  const limited = { ...durable, mp: 10 };
  const limitedRatio = fantasyCombatPower(limited, actor([healing])) / fantasyCombatPower(limited, actor());
  assert.ok(sustained / base > limitedRatio);
  const fragile = { ...stats, hp: 100 };
  assert.ok(fantasyCombatPower(fragile, actor([art({ kind: 'heal', power: 1000000, mp: 0 })])) < fantasyCombatPower(fragile, actor()) * 1.75);
});

test('available ranged combat context prices the opening safety window while legacy estimates stay stable', () => {
  const rear = { ...actor(), range: 'ranged' as const, position: 'rear' as const };
  const contextual = fantasyCombatPower(stats, rear), legacy = fantasyCombatPower(stats, { range: 'ranged' });
  assert.ok(contextual > fantasyCombatPower(stats, actor()) * 1.12);
  assert.ok(contextual < fantasyCombatPower(stats, actor()) * 1.18);
  assert.ok(contextual < fantasyCombatPower(stats, actor()) * 1.3);
  assert.equal(legacy, 177);
});

test('attack ward riders grant their actual flat ward and require the explicit-reach spell branch', () => {
  const attack = art({ reach: 1 });
  assert.ok(power([{ ...attack, effects: { guard: 1 } }]) - power([attack]) <= 3);
  assert.equal(power([art({ effects: { guard: 50 } })]), power([art()]));
});

test('actual attack reach, movement, area and on-hit control have bounded tactical value', () => {
  const short = art({ reach: 1 }), base = power([short]);
  assert.ok(power([art({ reach: 5 })]) > base);
  assert.ok(power([art({ range: 'magic', magic: true, reach: 8 })]) > power([art({ range: 'magic', magic: true, reach: 1 })]));
  assert.equal(power([art({ motion: { kind: 'advance', distance: 3 } })]), base);
  assert.ok(power([art({ mp: 0, reach: 4, motion: { kind: 'advance', distance: 3 } })]) > power([art({ mp: 0, reach: 1 })]));
  assert.ok(power([art({ shape: 'cone', reach: 1, secondaryDamage: 60 })]) > base);
  assert.ok(power([art({ reach: 1, hitUtility: { id: 'weaken', power: 3, chance: 1 } })]) > base);
  assert.ok(power([art({ reach: 1000000, radius: 1000000, shape: 'burst', secondaryDamage: 100, motion: { kind: 'dash', distance: 1000000 } })]) < base * 1.25);
  assert.equal(power([art({ reach: 0, selfOnly: true })]), power([]));
  assert.equal(power([art({ id: 'miracle-conditional', mp: 0, power: 100 })]), power([]));
});

test('a useful support utility is bounded and cannot be stacked through a skillbook collection', () => {
  const utility = art({ kind: 'boon', utility: 'regen', power: 12, mp: 5 });
  const fragile = { ...stats, hp: 100 }, rate = (skills: FantasyCombatSkill[]) => fantasyCombatPower(fragile, actor(skills));
  assert.ok(rate([utility]) > rate([]));
  assert.equal(rate(Array.from({ length: 100 }, (_, i) => ({ ...utility, id: `regen-${i}` }))), rate([utility]));
  assert.ok(rate([utility]) < rate([]) * 1.5);
});

test('companions add partial available force once each with a two-unit cap', () => {
  const owner = actor(), base = fantasyCombatPower(stats, owner);
  const companion: FantasyCombatCompanionInput = { id: 'helper', kind: 'troop', names, stats, hp: stats.hp, mp: stats.mp, range: 'melee', skills: [] };
  const rating = (companions: FantasyCombatCompanionInput[]) => fantasyCombatPower(stats, { ...owner, companions });
  const one = rating([companion]);
  assert.ok(one > base && one < base * 1.5);
  assert.equal(rating([companion, companion]), one);
  assert.equal(rating([{ ...companion, id: owner.id }]), base);
  assert.equal(rating([{ ...companion, hp: 0 }]), base);
  assert.ok(rating([{ ...companion, hp: 1 }]) < one);
  const two = rating([companion, { ...companion, id: 'second' }]);
  assert.ok(two > one && two < base * 2);
  assert.equal(rating([companion, { ...companion, id: 'second' }, { ...companion, id: 'third' }]), two);
});

test('empty capability and legacy contexts retain grades and depletion does not manipulate assessment', () => {
  assert.equal(fantasyCombatPower(stats), 170);
  assert.equal(fantasyAdventurerGrade(stats, actor()), 4);
  const trained = actor([art(), art({ id: 'heal', kind: 'heal', power: 180 })]);
  const depleted = { ...trained, hp: 1, mp: 0 };
  assert.equal(fantasyCombatPower(stats, depleted), fantasyCombatPower(stats, trained));
});

test('the high-end index preserves its knee and exposes the eased Master entry on one global scale', () => {
  assert.equal(fantasyCombatPowerIndex(295), 295);
  assert.equal(fantasyCombatPowerIndex(440), 440);
  assert.equal(fantasyCombatPowerIndex(472), 520);
  assert.equal(fantasyCombatPowerIndex(504), 600);
  assert.ok(fantasyCombatPowerIndex(439.99) < fantasyCombatPowerIndex(440));
  assert.ok(fantasyCombatPowerIndex(440) < fantasyCombatPowerIndex(440.01));
  assert.ok(fantasyCombatPowerIndex(1000) < fantasyCombatPowerIndex(1001));
  assert.ok(Math.abs(fantasyCombatPowerIndex(440.0001) - 440) < .001);
});

test('only full capability assessment applies the high-end index and legacy references remain raw', () => {
  const strong = { ...stats, hp: 2700 }, full = { ...actor(), stats: strong, hp: strong.hp };
  const legacy = fantasyCombatPower(strong, { range: 'melee' });
  assert.equal(fantasyCombatPower(strong), legacy);
  assert.ok(legacy > 440 && legacy < 520);
  assert.ok(fantasyCombatPower(strong, full) >= 520);
  assert.equal(fantasyAdventurerGrade(strong, full), 8);
  assert.equal(fantasyAdventurerGrade(strong), 7);
});

test('high-end companion support keeps owner-relative bounds and ignores bookkeeping order', () => {
  const strong = { ...stats, hp: 2400 }, owner = { ...actor(), stats: strong, hp: strong.hp };
  const personal = fantasyCombatPower(strong, owner);
  const first: FantasyCombatCompanionInput = { id: 'first', names, kind: 'troop', range: 'melee', stats: { ...strong, attack: 1000 }, hp: strong.hp, mp: stats.mp, skills: [] };
  const second = { ...first, id: 'second', stats: { ...strong, attack: 500 } };
  const rated = (companions: FantasyCombatCompanionInput[]) => fantasyCombatPower(strong, { ...owner, companions });
  assert.ok(rated([first]) <= Math.round(personal * 1.35) + 1);
  assert.ok(rated([first, second]) <= Math.round(personal * 1.7) + 1);
  assert.equal(rated([first, second]), rated([second, first]));
  assert.equal(rated([first, first]), rated([first]));
  assert.equal(rated([{ ...first, hp: 0 }]), personal);
  assert.ok(rated([{ ...first, hp: 1 }]) < rated([first]));
});

test('the high-end index stays finite and within the persisted assessment limit', () => {
  assert.equal(fantasyCombatPowerIndex(1e20), 1e9);
  assert.equal(fantasyCombatPowerIndex(Infinity), 1e9);
  assert.equal(fantasyCombatPowerIndex(NaN), 0);
  assert.equal(fantasyCombatPowerIndex(-1), 0);
  const extreme = { hp: 1000000, mp: 1000000, attack: 1000000, defense: 1000000, agility: 1000000, intelligence: 1000000, accuracy: 100, magicResist: 1000000 };
  const companion: FantasyCombatCompanionInput = { id: 'extreme', kind: 'summons', names, stats: extreme, hp: extreme.hp, mp: extreme.mp, range: 'magic', skills: [] };
  const score = fantasyCombatPower(extreme, { ...actor(), range: 'magic', companions: [companion, { ...companion, id: 'second' }] });
  assert.ok(Number.isSafeInteger(score) && score <= 1e9);
});
