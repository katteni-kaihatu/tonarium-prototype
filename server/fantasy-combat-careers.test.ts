import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile, fantasyStats } from '../shared/fantasy-engine.ts';
import { FANTASY_JOBS } from '../shared/fantasy-data.ts';
import { FANTASY_READABLE_LIBRARY_BOOKS } from '../shared/fantasy-library.ts';
import { FANTASY_COMBAT_CAPABILITIES } from '../shared/fantasy-combat-capabilities.ts';
import { createFantasyCombat, fantasyCombatHitChance, fantasyCombatOrderError, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatOrder, type FantasyCombatPlayer, type FantasyCombatState } from '../shared/fantasy-combat.ts';
import { FANTASY_MENTOR_SKILLS } from '../shared/fantasy-apprenticeship.ts';
import { fantasyCombatPlayer, fantasyCombatSupplies } from './fantasy-combat-adapter.ts';

const lifeJobs = ['alchemist', 'cook', 'baker', 'blacksmith', 'carpenter', 'tailor', 'weaver', 'leatherworker', 'gemcutter', 'herbalist', 'farmer', 'fisher', 'scribe', 'merchant', 'shipwright', 'potter'];
function profile(job: string) {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Role tester', gender: 'female' }, () => .5).profile;
  const c = p.character!; c.job = job; c.level = 10; c.hour = 108; c.fatigue = c.hunger = 0;
  c.jobXp = Object.fromEntries(FANTASY_JOBS.map(j => [j.id, 1000]));
  c.skillXp = Object.fromEntries(FANTASY_JOBS.flatMap(j => j.skills.map(s => [s.id, 1000])));
  c.unlockedSkills = FANTASY_JOBS.flatMap(j => j.skills.filter(s => s.unlock?.kind === 'mentor').map(s => s.id));
  c.readBooks = FANTASY_READABLE_LIBRARY_BOOKS.map(b => b.id);
  c.practice = { explore: 1000, craft: 1000, gather: 1000, hunt: 1000, fish: 1000, command: 1000 };
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp; return p;
}
function battle(player: FantasyCombatPlayer) {
  const ally = fantasyCombatPlayer(profile('warrior'), 'ally');
  const state = createFantasyCombat({ id: 'career-effects', location: 'sunmeadow', source: 'hunt:monster-forest-wolf', seed: 42, hour: 108,
    players: [player, ally], enemies: [{ id: 'foe', template: 'monster-forest-wolf' }] });
  state.fighters[2].stats.hp = state.fighters[2].hp = 10000;
  return state;
}
function round(state: FantasyCombatState, order: FantasyCombatOrder, ally: FantasyCombatOrder = { type: 'guard' }) {
  const first = submitFantasyCombatOrder(state, 'role', state.revision, order, state.hour); assert.equal(first.error, undefined);
  const last = submitFantasyCombatOrder(first.state, 'ally', first.state.revision, ally, state.hour); assert.equal(last.error, undefined);
  assert.ok(validFantasyCombatState(last.state)); return last.state;
}

test('all sixteen life careers keep learned history without combat actions or passive stat gains', () => {
  for (const job of lifeJobs) {
    const p = profile(job), c = p.character!, before = structuredClone(c.skillXp);
    const player = fantasyCombatPlayer(p, 'role');
    const ids = new Set(FANTASY_JOBS.find(j => j.id === job)!.skills.map(s => s.id));
    assert.ok(!player.skills.some(s => ids.has(s.id)), `${job} must not turn work/healing skills into combat actions`);
    assert.ok(FANTASY_COMBAT_CAPABILITIES.filter(s => s.owner === job).every(s => s.mode === 'outside-combat'), `${job} catalogue`);
    assert.deepEqual(c.skillXp, before);
    c.skillXp = Object.fromEntries(Object.keys(c.skillXp!).map(id => [id, 0]));
    assert.deepEqual(fantasyCombatPlayer(p, 'role').stats, player.stats, `${job} practice must not improve combat passives`);
  }
});

test('adding any life career to a combat career grants no direct combat actions or passive stat gains', () => {
  const p = profile('warrior'), baseline = fantasyCombatPlayer(p, 'role');
  for (const job of lifeJobs) {
    p.character!.lifeJob = job;
    const player = fantasyCombatPlayer(p, 'role');
    assert.deepEqual(player.stats, baseline.stats, job);
    assert.deepEqual(player.skills, baseline.skills, job);
  }
});

test('bard courage gives a finite allied damage blessing that affects actual attacks', () => {
  const player = fantasyCombatPlayer(profile('bard'), 'role'), state = battle(player), ally = state.fighters[1];
  const initialMp = state.fighters[0].mp;
  const boosted = round(state, { type: 'skill', skill: 'bard-courage', target: ally.id });
  assert.ok(boosted.fighters[1].blessing); assert.equal(boosted.fighters[1].blessing!.turns, 2);
  assert.ok(boosted.fighters[0].mp < initialMp);
  const plain = structuredClone(boosted); delete plain.fighters[1].blessing;
  const attack = { type: 'attack' as const, target: 'foe' };
  const hit = round(boosted, { type: 'guard' }, attack), control = round(plain, { type: 'guard' }, attack);
  assert.ok(hit.fighters[2].hp < control.fighters[2].hp);
  const expired = round(round(boosted, { type: 'guard' }), { type: 'guard' });
  assert.equal(expired.fighters[1].blessing, undefined);
});

test('bard shared refrain restores ally MP once per battle instead of another generic aim action', () => {
  const state = battle(fantasyCombatPlayer(profile('bard'), 'role')); state.fighters[1].mp = 0;
  const order = { type: 'skill' as const, skill: 'job-bard-advanced-6', target: state.fighters[1].id };
  const result = round(state, order); assert.ok(result.fighters[1].mp > 0);
  assert.equal(fantasyCombatOrderError(result, 'role', order), 'unnecessary');
});

test('spy and bandit base skills debuff real enemy hit chance and damage with finite nonstacking conditions', () => {
  for (const [job, id, condition] of [['spy', 'spy-cover', 'blind'], ['bandit', 'bandit-intimidate', 'weaken']]) {
    const state = battle(fantasyCombatPlayer(profile(job), 'role'));
    const order = { type: 'skill' as const, skill: id, target: 'foe' };
    const result = round(state, order); assert.ok(result.fighters[2].conditions?.some(s => s.id === condition && s.turns === 2));
    assert.equal(fantasyCombatOrderError(result, 'role', order), 'unnecessary');
    const control = structuredClone(result); control.fighters[2].conditions = [];
    if (job === 'spy') {
      assert.ok(fantasyCombatHitChance(result, result.fighters[2], result.fighters[0]).accuracy < fantasyCombatHitChance(control, control.fighters[2], control.fighters[0]).accuracy);
    } else {
      let observedReduction = false;
      for (let seed = 1; seed <= 20 && !observedReduction; seed++) {
        result.seed = control.seed = seed;
        const reduced = round(result, { type: 'guard' }), ordinary = round(control, { type: 'guard' });
        observedReduction = reduced.fighters.slice(0, 2).reduce((hp, f) => hp + f.hp, 0) > ordinary.fighters.slice(0, 2).reduce((hp, f) => hp + f.hp, 0);
      }
      assert.ok(observedReduction, 'intimidation must reduce actual enemy damage');
    }
    const expired = round(round(result, { type: 'guard' }), { type: 'guard' });
    assert.ok(!expired.fighters[2].conditions?.some(s => s.id === condition));
  }
});

test('life career still retains racial attacks, learned shared skills, mana skills and carried combat potions', () => {
  const p = profile('alchemist'), c = p.character!; c.race = 'dragonblood'; c.mana = { stage: 4, mastery: 0, strain: 0, affinity: 'balanced', useXp: 240 }; c.inventory.potion = 2;
  const learned = FANTASY_MENTOR_SKILLS.find(s => s.kind === 'active')!; c.learnedSkills = [learned.id];
  const player = fantasyCombatPlayer(p, 'role');
  assert.ok(player.skills.some(s => s.id === 'dragonblood-flame'));
  assert.ok(player.skills.some(s => s.id === learned.id));
  assert.ok(player.skills.some(s => s.id === 'mana-ward'));
  assert.equal(fantasyCombatSupplies(new Map([['role', p]]), ['role']).supplies?.role.potion.count, 2);
});
