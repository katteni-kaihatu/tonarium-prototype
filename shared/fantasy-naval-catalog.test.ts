import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_MONSTERS } from './fantasy-monsters.ts';
import { FANTASY_COMBAT_ENEMIES, fantasyCombatEnemy } from './fantasy-combat-catalog.ts';
import { FANTASY_NAVAL_ENCOUNTERS, FANTASY_NAVAL_MONSTERS, FANTASY_NAVAL_AUXILIARIES } from './fantasy-naval-catalog.ts';
import { fantasyEnemyAttacks } from './fantasy-enemy-attacks.ts';
import { fantasyMonsterCombatStats } from './fantasy-monster-balance.ts';
import { FANTASY_ITEMS, FANTASY_LOCATIONS } from './fantasy-data.ts';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyHuntTargets } from './fantasy-gathering.ts';
import { fantasyRegularCombatEnemy } from './fantasy-encounters.ts';
import { createFantasyCombat, submitFantasyCombatOrder, validFantasyCombatState, type FantasyCombatPlayer } from './fantasy-combat.ts';

test('naval encounters cover grades one through six without duplicating the existing deepwater serpent', () => {
  assert.deepEqual(FANTASY_NAVAL_ENCOUNTERS.map(entry => entry.tier).sort(), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(new Set(FANTASY_NAVAL_ENCOUNTERS.map(entry => entry.role)), new Set(['boarder', 'offshore', 'kraken']));
  for (const entry of FANTASY_NAVAL_ENCOUNTERS) {
    const registered = FANTASY_COMBAT_ENEMIES.filter(enemy => enemy.id === entry.template);
    assert.equal(registered.length, 1, entry.template);
    assert.equal(registered[0].tier, entry.tier); assert.equal(entry.spawn, 'regular');
    assert.equal(registered[0].provocationOnly, false);
  }
  assert.equal(FANTASY_MONSTERS.filter(monster => monster.id === 'monster-deep-serpent').length, 1);
  assert.ok(!FANTASY_NAVAL_MONSTERS.some(monster => monster.id === 'monster-deep-serpent'));
});

test('new naval creatures and appendages have complete multilingual definitions and real bounded reward materials', () => {
  assert.equal(FANTASY_NAVAL_MONSTERS.length, 5);
  assert.equal(new Set([...FANTASY_NAVAL_MONSTERS, ...FANTASY_NAVAL_AUXILIARIES].map(entry => entry.id)).size, 7);
  for (const entry of [...FANTASY_NAVAL_MONSTERS, ...FANTASY_NAVAL_AUXILIARIES]) {
    const template = fantasyCombatEnemy(entry.id)!; assert.ok(template, entry.id);
    for (const locale of ['ko', 'en', 'ja'] as const) {
      assert.ok(entry.names[locale].trim()); assert.ok(entry.descriptions[locale].trim());
    }
    for (const value of Object.values(template.stats)) assert.ok(Number.isSafeInteger(value) && value >= 0);
    for (const multiplier of [template.physicalMultiplier ?? 1, template.magicMultiplier ?? 1]) assert.ok(multiplier >= .9 && multiplier <= 1.1);
    for (const drop of template.reward.materials) assert.ok(FANTASY_ITEMS.some(item => item.id === drop.item) && drop.count > 0);
  }
});

test('kraken appendages share one encounter health budget and add only negligible independent damage', () => {
  const entry = FANTASY_NAVAL_ENCOUNTERS.find(entry => entry.role === 'kraken')!;
  assert.ok(entry); assert.deepEqual(entry.parts?.map(part => part.count), [2, 1]);
  const core = fantasyCombatEnemy(entry.template)!, baseline = fantasyMonsterCombatStats(6, 'beast');
  let health = 0, attack = core.stats.attack;
  for (const part of entry.parts!) {
    const auxiliary = fantasyCombatEnemy(part.template)!;
    assert.equal(auxiliary.auxiliary, true);
    assert.deepEqual(auxiliary.reward, { xp: 0, gold: 0, materials: [] });
    assert.ok(auxiliary.stats.attack <= 1);
    health += auxiliary.stats.hp * part.count; attack += auxiliary.stats.attack * part.count;
  }
  assert.ok(Math.abs(health - core.stats.hp) <= 2);
  assert.ok(core.stats.hp <= baseline.hp && attack <= baseline.attack);
});

test('auxiliary parts and sea-only creatures are absent from ordinary hunting and stationary random encounters at every player grade', () => {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Naval catalog', gender: 'female' }, () => .5).profile, c = p.character!;
  const ids = new Set(FANTASY_NAVAL_AUXILIARIES.map(part => part.id));
  const seaOnly = new Set(FANTASY_NAVAL_MONSTERS.map(monster => monster.id));
  assert.equal(ids.size, 2);
  assert.ok(FANTASY_MONSTERS.every(monster => !ids.has(monster.id)));
  for (const place of FANTASY_LOCATIONS) {
    c.location = place.id;
    assert.ok(fantasyHuntTargets(c).every(monster => !ids.has(monster.id) && !seaOnly.has(monster.id)));
    for (const grade of [1, 2, 3, 4, 5, 6] as const) {
      c.encounterTier = grade;
      for (let hour = 0; hour < 12; hour++) {
        c.hour = hour;
        const id = fantasyRegularCombatEnemy(c, 'naval-catalog')?.id ?? '';
        assert.ok(!ids.has(id) && !seaOnly.has(id), `${place.id}:${grade}:${hour}`);
      }
    }
  }
  c.location = 'frontier-kelp-coast';
  assert.ok(fantasyHuntTargets(c).some(monster => monster.id === 'monster-deep-serpent'));
});

test('naval attack profiles distinguish deck claws, ranged sea attacks and ink while appendages have no tier-sized skill bonus', () => {
  const crab = fantasyCombatEnemy('monster-deck-crab')!, serpent = fantasyCombatEnemy('monster-deep-serpent')!, kraken = fantasyCombatEnemy('monster-juvenile-kraken')!;
  assert.ok(crab && kraken);
  assert.equal(fantasyEnemyAttacks(crab)[0].range, 'melee'); assert.equal(fantasyEnemyAttacks(crab)[0].reach, 1);
  assert.ok(fantasyEnemyAttacks(serpent).every(attack => attack.range === 'ranged'));
  assert.ok(fantasyEnemyAttacks(kraken).some(attack => attack.hitUtility?.id === 'blind'));
  assert.ok(fantasyEnemyAttacks(kraken).some(attack => attack.prepare && attack.reach! >= 5));
  for (const entry of FANTASY_NAVAL_ENCOUNTERS) for (const attack of fantasyEnemyAttacks(fantasyCombatEnemy(entry.template)!)) {
    for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(attack.names[locale]);
    assert.ok(attack.reach! >= 1 && attack.reach! <= 8);
    if (attack.hitUtility) assert.ok(attack.hitUtility.chance > 0 && attack.hitUtility.chance <= .5 && attack.hitUtility.power <= 4);
  }
  for (const part of FANTASY_NAVAL_AUXILIARIES) for (const attack of fantasyEnemyAttacks(fantasyCombatEnemy(part.id)!)) {
    assert.equal(attack.power, 0); assert.equal(attack.mp, 0);
    assert.equal(attack.onHit, undefined); assert.equal(attack.hitUtility, undefined);
  }
});

test('the juvenile kraken ink profile applies its bounded blindness through real enemy combat', () => {
  const names = { ko: '선원', en: 'Deckhand', ja: '船員' };
  const sailor: FantasyCombatPlayer = { id: 'sailor', userId: 'sailor', names, generation: 1, position: 'front', range: 'melee',
    hp: 4000, mp: 0, stats: { hp: 4000, mp: 0, attack: 1, defense: 0, agility: 1, intelligence: 1, accuracy: 95, magicResist: 0 },
    skills: [{ id: 'keep-steady', names, kind: 'focus', power: 1, mp: 0, range: 'magic' }] };
  let observed = false;
  for (let seed = 1; seed <= 32; seed++) {
    const state = createFantasyCombat({ id: 'naval-ink-profile', location: 'tidehaven', source: 'benchmark:naval-profile', hour: 12, seed, tactical: true,
      players: [sailor], enemies: [{ id: 'kraken', template: 'monster-juvenile-kraken' }] });
    state.battlefield = { width: 10, height: 8, blocked: [], cover: [] };
    state.fighters[0].tile = { x: 6, y: 3 }; state.fighters[1].tile = { x: 8, y: 3 };
    const result = submitFantasyCombatOrder(state, 'sailor', state.revision, { type: 'skill', skill: 'keep-steady', target: 'sailor' }, state.hour);
    assert.equal(result.error, undefined); assert.equal(validFantasyCombatState(result.state), true);
    const target = result.state.fighters.find(fighter => fighter.id === 'sailor')!;
    const blind = target.conditions?.find(condition => condition.id === 'blind');
    if (blind) { observed = true; assert.ok(blind.power > 0 && blind.power <= 2); assert.ok(target.hp < sailor.hp); }
  }
  assert.equal(observed, true);
});
