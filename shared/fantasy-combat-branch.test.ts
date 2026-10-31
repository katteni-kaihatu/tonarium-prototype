import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceFantasyCombat, createFantasyCombat, fantasyCombatOrderError, fantasyCombatTelegraph, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatPlayer, type FantasyCombatOrder, type FantasyCombatState } from './fantasy-combat.ts';
import { fantasyCombatPlayer } from '../server/fantasy-combat-adapter.ts';
import { applyFantasyAction, fantasySkills, fantasyStats, newFantasyProfile } from './fantasy-engine.ts';
import { FANTASY_JOBS } from './fantasy-data.ts';
import { FANTASY_READABLE_LIBRARY_BOOKS } from './fantasy-library.ts';
import { applyFantasyJobPath, FANTASY_JOB_PATHS, fantasyJobPathCombatPassive, fantasyJobPathCombatSkill, fantasyJobPathSkills } from './fantasy-job-paths.ts';
import type { FantasyProfile } from './fantasy.ts';
import { fantasyCombatDistance, fantasyCombatMoveRange, fantasyCombatPath, fantasyCombatWithinRange } from './fantasy-combat-tactics.ts';

const names = (value: string) => ({ ko: value, en: value, ja: value });
function player(index = 0): FantasyCombatPlayer {
  return { id: `p-${index}`, userId: `u-${index}`, generation: 1, names: names(`Hero ${index}`),
    stats: { hp: 400, mp: 80, attack: 30, defense: 20, agility: 30, intelligence: 20, accuracy: 80, magicResist: 15 }, hp: 400, mp: 80,
    position: 'front', range: 'melee', skills: [
      { id: 'focus', names: names('Clarity'), kind: 'focus', power: 10, mp: 8, range: 'magic' },
      { id: 'fire', names: names('Flame'), kind: 'attack', power: 5, mp: 7, magic: true, range: 'magic', onHit: { id: 'burn', power: 2, turns: 3, chance: 1 } },
    ],
  };
}
const battle = (count = 2, seed = 42) => createFantasyCombat({ id: 'branches', location: 'oldwatch', source: 'hunt:monster-stone-golem', players: Array.from({ length: count }, (_, index) => player(index)), enemies: [{ id: 'enemy', template: 'monster-stone-golem' }], seed, hour: 12 });
function choose(state: FantasyCombatState, user: string, action: FantasyCombatOrder) {
  const result = submitFantasyCombatOrder(state, user, state.revision, action, state.hour);
  assert.equal(result.error, undefined); assert.ok(validFantasyCombatState(result.state)); return result;
}

test('elemental riders need damaging unguarded hits, cost finite MP and preserve the saved random outcome', () => {
  const state = battle(1), input: FantasyCombatOrder = { type: 'skill', skill: 'fire', target: 'enemy' };
  const one = choose(state, 'u-0', input), two = choose(JSON.parse(JSON.stringify(state)), 'u-0', input);
  assert.deepEqual(one, two); assert.equal(one.state.fighters[0].mp, 73);
  assert.ok(one.state.fighters[1].effects.some(effect => effect.id === 'burn' && effect.power === 2 && effect.turns === 2));
  const guarding = battle(1); guarding.round = 3;
  assert.equal(fantasyCombatTelegraph(guarding.fighters[1], guarding.round, 'en'), 'It is preparing to guard.');
  const guarded = choose(guarding, 'u-0', input); assert.ok(guarded.state.logs.some(entry => entry.text.en.includes('braces its guard')));
  assert.equal(guarded.state.fighters[1].effects.length, 0);
  let misses = 0;
  for (let seed = 0; seed < 80; seed++) {
    const result: FantasyCombatState = choose(battle(1, seed), 'u-0', input).state;
    if (result.logs.some(entry => entry.roll && !entry.roll.success && entry.text.en.includes('evades Hero 0'))) { misses++; assert.equal(result.fighters[0].mp, 80); assert.equal(result.fighters[1].effects.length, 0); }
  }
  assert.ok(misses > 0);
});

test('a delayed focus survives a save and emits one real-use receipt without charging MP a second time', () => {
  let state = choose(battle(), 'u-0', { type: 'skill', skill: 'focus', target: 'p-1' }).state;
  const prepared = choose(state, 'u-1', { type: 'guard' }); state = prepared.state;
  assert.equal(prepared.usedSkills, undefined); assert.equal(state.fighters[0].mp, 72); assert.equal(state.fighters[1].aim?.turns, 1);
  assert.ok(validFantasyCombatState(JSON.parse(JSON.stringify(state))));
  const pending = choose(state, 'u-0', { type: 'guard' }).state, attack: FantasyCombatOrder = { type: 'attack', target: 'enemy' };
  const used = choose(pending, 'u-1', attack), retry = choose(JSON.parse(JSON.stringify(pending)), 'u-1', attack);
  assert.deepEqual(used, retry); assert.deepEqual(used.usedSkills, [{ userId: 'u-0', skill: 'focus', mp: 8 }]);
  assert.equal(used.state.fighters[0].mp, 72); assert.equal(used.state.fighters[1].aim, undefined);
  assert.equal(submitFantasyCombatOrder(used.state, 'u-1', pending.revision, attack, 12).error, 'stale');
  assert.equal(advanceFantasyCombat(used.state, used.state.deadline).usedSkills, undefined);
});

test('focus changes the next attack threshold once without permanent stat growth', () => {
  const normal = battle(), aided = battle(); normal.fighters[1].stats.accuracy = aided.fighters[1].stats.accuracy = 50;
  const plain = choose(choose(normal, 'u-0', { type: 'guard' }).state, 'u-1', { type: 'attack', target: 'enemy' });
  const boosted = choose(choose(aided, 'u-0', { type: 'skill', skill: 'focus', target: 'p-1' }).state, 'u-1', { type: 'attack', target: 'enemy' });
  const plainRoll = plain.state.logs.find(entry => entry.roll && entry.text.en.includes('Hero 1') && (entry.text.en.includes('Hero 1 →') || entry.text.en.includes('evades Hero 1')))!.roll!;
  const boostRoll = boosted.state.logs.find(entry => entry.roll && entry.text.en.includes('Hero 1') && (entry.text.en.includes('Hero 1 →') || entry.text.en.includes('evades Hero 1')))!.roll!;
  assert.equal(boostRoll.value, plainRoll.value); assert.ok(boostRoll.target < plainRoll.target);
  assert.equal(boosted.state.fighters[1].stats.accuracy, 50); assert.equal(boosted.state.fighters[1].aim, undefined);
});

test('focus cannot stack, expires without a growth receipt and rejects forged origins', () => {
  let state = choose(choose(battle(), 'u-0', { type: 'skill', skill: 'focus', target: 'p-1' }).state, 'u-1', { type: 'guard' }).state;
  assert.equal(fantasyCombatOrderError(state, 'u-0', { type: 'skill', skill: 'focus', target: 'p-1' }), 'unnecessary');
  const forged = structuredClone(state); forged.fighters[1].aim!.generation = 9; assert.equal(validFantasyCombatState(forged), false);
  const unknown = structuredClone(state); unknown.fighters[1].aim!.skill = 'unknown-focus'; assert.equal(validFantasyCombatState(unknown), false);
  state = choose(state, 'u-0', { type: 'guard' }).state;
  const expired = choose(state, 'u-1', { type: 'guard' }); assert.equal(expired.state.fighters[1].aim, undefined); assert.equal(expired.usedSkills, undefined); assert.equal(expired.state.fighters[0].mp, 72);
});

test('withdrawn focus owners cannot receive delayed-use receipts and automated guards never trigger them', () => {
  let state = choose(choose(battle(), 'u-0', { type: 'skill', skill: 'focus', target: 'p-1' }).state, 'u-1', { type: 'guard' }).state;
  state.fighters[0].fled = true; assert.ok(validFantasyCombatState(state));
  const used = choose(state, 'u-1', { type: 'attack', target: 'enemy' }); assert.equal(used.usedSkills, undefined);
  const automatic = advanceFantasyCombat(choose(choose(battle(), 'u-0', { type: 'skill', skill: 'focus', target: 'p-1' }).state, 'u-1', { type: 'guard' }).state, 12.5);
  assert.equal(automatic.usedSkills, undefined);
});

test('manual unit commands count as owner participation once even when the owner body auto-guards', () => {
  const hero = player(); hero.companions = [{ id: 'scout', kind: 'troop', names: names('Scout'), stats: { ...hero.stats, agility: 100 }, hp: 400, mp: 0, range: 'ranged', skills: [] }];
  let state = createFantasyCombat({ id: 'unit-participation', location: 'oldwatch', source: 'hunt:monster-stone-golem', players: [hero], enemies: [{ id: 'enemy', template: 'monster-stone-golem' }], seed: 42, hour: 12 });
  state = choose(state, 'u-0', { type: 'unit', unit: state.units![0].id, order: { type: 'attack', target: 'enemy' } }).state;
  const actual = advanceFantasyCombat(state, 12.5).state;
  assert.equal(actual.fighters[0].contribution.manualActions, 1); assert.equal(actual.fighters[0].contribution.activeRounds, 1);
  assert.ok(actual.units![0].contribution.effectiveActions > 0); assert.ok(actual.fighters[0].contribution.effectiveActions > 0);
  const idle = advanceFantasyCombat(createFantasyCombat({ id: 'idle-units', location: 'oldwatch', source: 'hunt:monster-stone-golem', players: [hero], enemies: [{ id: 'enemy', template: 'monster-stone-golem' }], seed: 42, hour: 12 }), 12.5).state;
  assert.equal(idle.fighters[0].contribution.manualActions, 0); assert.equal(idle.fighters[0].contribution.activeRounds, 0);
});

test('basic attack practice receipts require a real roll, including misses but excluding skipped turns after a companion kill', () => {
  const hero = player(); hero.companions = [{ id: 'scout', kind: 'troop', names: names('Scout'), stats: { ...hero.stats, attack: 100, agility: 100, accuracy: 100 }, hp: 400, mp: 0, range: 'ranged', skills: [] }];
  let state = createFantasyCombat({ id: 'skipped-attack', location: 'oldwatch', source: 'hunt:monster-cave-slime', players: [hero], enemies: [{ id: 'enemy', template: 'monster-cave-slime' }], seed: 42, hour: 12 });
  state.fighters.find(fighter => fighter.side === 'enemies')!.hp = 1;
  assert.ok(validFantasyCombatState(state));
  state = choose(state, 'u-0', { type: 'unit', unit: state.units![0].id, order: { type: 'attack', target: 'enemy' } }).state;
  const skipped = choose(state, 'u-0', { type: 'attack', target: 'enemy' });
  assert.equal(skipped.state.status, 'victory'); assert.equal(skipped.attemptedAttacks, undefined); assert.equal(skipped.state.fighters[0].contribution.manualActions, 1);
  let misses = 0;
  for (let seed = 0; seed < 40; seed++) {
    const result = choose(battle(1, seed), 'u-0', { type: 'attack', target: 'enemy' });
    assert.deepEqual(result.attemptedAttacks, ['u-0']);
    if (result.state.logs.some(entry => entry.roll && !entry.roll.success && entry.text.en.includes('evades Hero 0'))) misses++;
  }
  assert.ok(misses > 0);
});

function specialized(job: string): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: '갈래 검증자', gender: 'female', source: 'human' }, () => .5).profile, c = p.character!, data = FANTASY_JOBS.find(entry => entry.id === job)!;
  c.job = job; c.jobXp[job] = 1000; c.hour = 100; c.gold = 1000; c.level = 12; c.inventory.lantern = 1;
  c.readBooks = FANTASY_READABLE_LIBRARY_BOOKS.map(book => book.id); c.unlockedSkills = data.skills.filter(skill => skill.unlock?.kind === 'mentor').map(skill => skill.id);
  c.skillXp = Object.fromEntries(data.skills.map(skill => [skill.id, 200])); c.practice = { explore: 10, craft: 10, gather: 10, hunt: 10, fish: 10, command: 10 };
  if (job === 'mage') c.occult = { version: 1, starObservations: [{ hour: 20, location: 'starfall-isle' }], relicClaims: [], relics: [], usedRelics: [] };
  const stats = fantasyStats(c); c.hp = stats.hp; c.mp = stats.mp; return p;
}

test('every selected combat path exposes its own real art and one nonduplicated passive; lifestyle arts stay outside combat', () => {
  let combatPaths = 0, lifestylePaths = 0;
  for (const path of FANTASY_JOB_PATHS) {
    const profile = specialized(path.job), baseline = fantasyCombatPlayer(profile, 'traveler'), c = profile.character!;
    assert.equal(applyFantasyJobPath(c, path.id).error, undefined, path.id);
    const world = fantasyJobPathSkills(c), active = world.find(skill => skill.kind === 'active')!, passive = world.find(skill => skill.kind === 'passive')!;
    const actual = fantasyCombatPlayer(profile, 'traveler'), descriptor = fantasyJobPathCombatSkill(active.id), bonus = fantasyJobPathCombatPassive(passive.id);
    if (descriptor) {
      combatPaths++; const art = actual.skills.find(skill => skill.id === active.id)!; assert.ok(art, path.id);
      assert.equal(art.kind, descriptor.kind); assert.equal(art.mp, descriptor.mp); assert.equal(art.power, descriptor.power); assert.equal(art.range, descriptor.range);
      assert.ok(bonus, path.id);
      for (const [key, amount] of Object.entries(bonus!) as [keyof typeof actual.stats, number][]) assert.equal(actual.stats[key] - baseline.stats[key], amount, `${path.id}: ${key}`);
      c.skillXp![passive.id] = 200; c.skillXp![active.id] = 150;
      const trained = fantasyCombatPlayer(profile, 'traveler');
      for (const [key, amount] of Object.entries(bonus!) as [keyof typeof actual.stats, number][]) assert.equal(trained.stats[key] - baseline.stats[key], amount * 3, `${path.id}: trained ${key}`);
      assert.equal(trained.skills.find(skill => skill.id === active.id)!.power, descriptor.power + 3, path.id);
    } else {
      lifestylePaths++; assert.equal(actual.skills.some(skill => skill.id === active.id), false, path.id); assert.deepEqual(actual.stats, baseline.stats, path.id);
    }
    c.job = 'unassigned'; assert.ok(!fantasyCombatPlayer(profile, 'traveler').skills.some(skill => skill.id === active.id), path.id);
  }
  assert.ok(combatPaths >= 70); assert.ok(lifestylePaths >= 60); assert.equal(combatPaths + lifestylePaths, 149);
});

test('all combat path arts perform their stated attack, healing or ward with their own MP and bounded riders', () => {
  let tested = 0, elemental = 0;
  for (const path of FANTASY_JOB_PATHS) {
    const profile = specialized(path.job), c = profile.character!; applyFantasyJobPath(c, path.id);
    const active = fantasySkills(c).find(skill => skill.kind === 'active' && skill.id === `path-${path.id}-art`), descriptor = active && fantasyJobPathCombatSkill(active.id, active.power);
    if (!active || !descriptor) continue;
    let effective = false, rider = !descriptor.onHit;
    for (let seed = 0; seed < (descriptor.onHit ? 40 : 8); seed++) {
      const hero = fantasyCombatPlayer(profile, 'traveler'); if (descriptor.kind === 'heal') hero.hp -= 80;
      let state = createFantasyCombat({ id: `real-${path.id}`, location: 'oldwatch', source: 'hunt:monster-stone-golem', players: [hero], enemies: [{ id: 'enemy', template: 'monster-stone-golem' }], seed, hour: 100, tactical: true });
      const cast: FantasyCombatOrder = { type: 'skill', skill: active.id, target: descriptor.kind === 'attack' ? 'enemy' : hero.id };
      for (let step = 0; step < 4 && fantasyCombatOrderError(state, 'traveler', cast) === 'range'; step++) {
        const actor = state.fighters.find(fighter => fighter.userId === 'traveler')!, target = state.fighters.find(fighter => fighter.id === 'enemy')!;
        const paths = Array.from({ length: 80 }, (_, index) => ({ x: index % 10, y: Math.floor(index / 10) })).flatMap(tile => {
          if (!fantasyCombatWithinRange(state, { ...actor, tile }, target, descriptor.range)) return [];
          const path = fantasyCombatPath(state, actor, tile); return path && path.length > 1 ? [path] : [];
        }).sort((a, b) => a.length - b.length);
        assert.ok(paths[0], path.id); state = choose(state, 'traveler', { type: 'moveTo', tile: paths[0][Math.min(paths[0].length - 1, fantasyCombatMoveRange(actor))] }).state;
      }
      assert.equal(fantasyCombatOrderError(state, 'traveler', cast), undefined, path.id);
      const result = choose(state, 'traveler', cast);
      const own = result.state.fighters.find(fighter => fighter.userId === 'traveler')!;
      if (own.mp === hero.mp - descriptor.mp) effective = true;
      assert.ok(own.mp >= 0 && own.mp <= hero.mp, path.id);
      if (descriptor.kind === 'guard') assert.ok(result.state.logs.some(entry => entry.text.en.includes('wards')), path.id);
      if (descriptor.kind === 'heal') assert.ok(result.state.logs.some(entry => entry.text.en.includes('restores')), path.id);
      if (descriptor.onHit && result.state.fighters.find(fighter => fighter.id === 'enemy')!.effects.some(effect => effect.id === descriptor.onHit!.id)) rider = true;
    }
    assert.ok(effective, `${path.id}: actual effect and MP`); assert.ok(rider, `${path.id}: conditional rider`); tested++; if (descriptor.onHit) elemental++;
  }
  assert.ok(tested >= 70); assert.ok(elemental >= 4);
});
