import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyAdventurerGrade, fantasyCombatPower, type FantasyAdventurerGrade } from './fantasy-adventurer.ts';
import { createFantasyCombat, type FantasyCombatPlayer } from './fantasy-combat.ts';
import { FANTASY_COMBAT_ENEMIES } from './fantasy-combat-catalog.ts';
import { fantasyMonsterBenchmarkStats } from './fantasy-monster-benchmark-fixture.ts';
import { fantasyMonsterGradePowerReference, fantasyMonsterSoloWinTarget, fantasyMonsterCombatStats, type FantasyMonsterCombatRole } from './fantasy-monster-balance.ts';

const grades: FantasyAdventurerGrade[] = [1, 2, 3, 4, 5, 6, 7, 8];
function player(grade: FantasyAdventurerGrade): FantasyCombatPlayer {
  const stats = fantasyMonsterBenchmarkStats(grade);
  return { id: 'reference', userId: 'reference', names: { ko: '기준 모험가', en: 'Reference adventurer', ja: '基準冒険者' }, generation: 1, stats,
    hp: stats.hp, mp: stats.mp, position: 'front', range: 'melee', skills: [] };
}

test('synthetic reference shapes cover all eight actual power grades without changing grade thresholds', () => {
  for (const grade of grades) {
    const stats = fantasyMonsterBenchmarkStats(grade), reference = fantasyMonsterGradePowerReference(grade);
    assert.equal(fantasyAdventurerGrade(stats), grade);
    assert.ok(Math.abs(fantasyCombatPower(stats) - reference.reference) <= 1);
    assert.ok(reference.reference >= reference.minimum);
    if (reference.maximum !== undefined) assert.ok(reference.reference <= reference.maximum);
  }
});

test('the latest regular and exceptional solo targets are a specification, not measured results', () => {
  for (const grade of grades.filter(grade => grade <= 6)) {
    assert.deepEqual(fantasyMonsterSoloWinTarget(grade, grade), { min: .6, max: .8 });
    if (grade > 1) assert.deepEqual(fantasyMonsterSoloWinTarget(grade, grade - 1 as FantasyAdventurerGrade), { min: .8, max: 1 });
    if (grade < 6) assert.deepEqual(fantasyMonsterSoloWinTarget(grade, grade + 1 as FantasyAdventurerGrade), { min: .1, max: .4 });
  }
  assert.deepEqual(fantasyMonsterSoloWinTarget(6, 7), { min: 0, max: .05 });
  assert.deepEqual(fantasyMonsterSoloWinTarget(7, 7), { min: .35, max: .45 });
  assert.deepEqual(fantasyMonsterSoloWinTarget(8, 7), { min: .55, max: .65 });
  assert.deepEqual(fantasyMonsterSoloWinTarget(7, 8), { min: 0, max: .2 });
  assert.deepEqual(fantasyMonsterSoloWinTarget(8, 8), { min: .45, max: .55 });
  assert.equal(fantasyMonsterSoloWinTarget(1, 8), undefined);
});

test('the same species and seed keep the same solo enemy stats against every challenger grade', () => {
  for (const template of FANTASY_COMBAT_ENEMIES.filter(enemy => !enemy.auxiliary)) {
    const encounters = grades.map(grade => createFantasyCombat({ id: 'reference-invariance', location: 'oldwatch', source: `${template.provocationOnly ? 'apex' : 'benchmark'}:${template.id}`, hour: 12, seed: 234567,
      players: [player(grade)], enemies: [{ id: 'opponent', template: template.id }] }));
    const baseline = encounters[0].fighters.find(fighter => fighter.side === 'enemies')!;
    for (const encounter of encounters.slice(1)) {
      const opponent = encounter.fighters.find(fighter => fighter.side === 'enemies')!;
      assert.deepEqual(opponent.stats, baseline.stats);
      assert.equal(opponent.variation, baseline.variation);
    }
  }
});

test('monster tuning preserves the five pre-existing human adversary stat lines', () => {
  const expected = [
    ['human-road-bandit', { hp: 41, mp: 4, attack: 13, defense: 3, agility: 12, intelligence: 5, accuracy: 71, magicResist: 2 }],
    ['human-poacher', { hp: 72, mp: 8, attack: 20, defense: 6, agility: 14, intelligence: 7, accuracy: 73, magicResist: 4 }],
    ['human-ironmask-marine', { hp: 144, mp: 15, attack: 30, defense: 14, agility: 10, intelligence: 10, accuracy: 72, magicResist: 7 }],
    ['human-watch-patrol', { hp: 92, mp: 8, attack: 20, defense: 9, agility: 9, intelligence: 7, accuracy: 70, magicResist: 4 }],
    ['human-order-knight', { hp: 345, mp: 42, attack: 54, defense: 29, agility: 14, intelligence: 19, accuracy: 77, magicResist: 16 }],
  ] as const;
  for (const [id, stats] of expected) {
    const human = FANTASY_COMBAT_ENEMIES.find(enemy => enemy.id === id)!;
    assert.deepEqual(human.stats, stats);
    assert.equal(human.physicalMultiplier, undefined);
    assert.equal(human.magicMultiplier, undefined);
  }
});


test('fixed tier progression retains durability and reliable accuracy while apex trades attack for endurance', () => {
  const roles: FantasyMonsterCombatRole[] = ['slime','swarm','beast','skirmisher','armored','undead','caster','flying','dragon','golem'];
  for (const role of roles) for (let tier=2;tier<=8;tier++) {
    const lower=fantasyMonsterCombatStats((tier-1) as FantasyAdventurerGrade,role),higher=fantasyMonsterCombatStats(tier as FantasyAdventurerGrade,role);
    for (const key of ['hp','mp','defense','agility','intelligence','accuracy','magicResist'] as const) assert.ok(higher[key]>=lower[key],`${role} tier${tier} ${key}: ${higher[key]} < ${lower[key]}`);
    if(tier<8)assert.ok(higher.attack>=lower.attack);
    else {
      assert.ok(higher.attack>=lower.attack*.7);
      assert.ok(higher.hp*higher.attack>=lower.hp*lower.attack,`${role}: apex endurance must offset lower attack`);
    }
  }
});

test('fixed boss profiles account for pattern duty, casting and regeneration without challenger input', () => {
 const samples=[['monster-red-dragon',798,132],['monster-obsidian-guardian',870,143],['monster-lich',676,101],['monster-elder-dragon',941,96],['monster-void-chimera',850,77]] as const;
 for(const [id,hp,attack] of samples){const enemy=FANTASY_COMBAT_ENEMIES.find(value=>value.id===id)!;assert.equal(enemy.stats.hp,hp,id);assert.equal(enemy.stats.attack,attack,id);}
 const lich=FANTASY_COMBAT_ENEMIES.find(value=>value.id==='monster-lich')!,guardian=FANTASY_COMBAT_ENEMIES.find(value=>value.id==='monster-obsidian-guardian')!;
 assert.ok(lich.stats.hp<guardian.stats.hp);
 assert.ok(lich.stats.attack<guardian.stats.attack);
});
