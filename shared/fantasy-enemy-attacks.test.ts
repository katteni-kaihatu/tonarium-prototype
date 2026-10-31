import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_COMBAT_ENEMIES } from './fantasy-combat-catalog.ts';
import type { FantasyCombatState, FantasyCombatFighter } from './fantasy-combat.ts';
import { fantasyEnemyAttacks, fantasyEnemyAttackById, fantasyEnemyAttackForRound, fantasyEnemyChargeTiles } from './fantasy-enemy-attacks.ts';

const enemy = (id: string) => FANTASY_COMBAT_ENEMIES.find(entry => entry.id === id)!;
const field = () => ({ battlefield: { width: 10, height: 8, blocked: [], cover: [] }, fighters: [], units: [] } as unknown as FantasyCombatState);
const actor = () => ({ tile: { x: 2, y: 3 }, range: 'melee' } as FantasyCombatFighter);

test('every catalog enemy has bounded localized ordinary attacks and a stronger prepared attack', () => {
  const families = new Set<string>(), shapes = new Set<string>();
  for (const template of FANTASY_COMBAT_ENEMIES) {
    const before = structuredClone(template), attacks = fantasyEnemyAttacks(template), regular = attacks.filter(attack => !attack.prepare), strong = attacks.filter(attack => attack.prepare);
    assert.ok(regular.length >= 2, template.id); assert.equal(strong.length, 1, template.id);
    assert.equal(new Set(attacks.map(attack => attack.id)).size, attacks.length);
    for (const attack of attacks) {
      assert.equal(attack.kind, 'attack'); assert.ok(attack.reach! >= 1 && attack.reach! <= 8); assert.ok(attack.radius! >= 0 && attack.radius! <= 4);
      for (const value of [attack.mp, attack.power, attack.reach!, attack.radius!, attack.interval, attack.damageScale]) assert.ok(Number.isFinite(value) && value >= 0);
      assert.ok(attack.power <= 18); assert.ok(attack.mp <= 12); assert.ok(attack.interval >= 4 && attack.interval <= 6);
      if (attack.magic) assert.ok(attack.visualElement); assert.ok(attack.visualTier! >= 1 && attack.visualTier! <= 5); assert.ok(attack.damageType);
      for (const locale of ['ko','en','ja'] as const) assert.ok(attack.names[locale].trim().length > 1);
      assert.equal(attack.mp === 0, attack.magic !== true); shapes.add(attack.shape!);
    }
    assert.ok(strong[0].damageScale >= 1.6 && strong[0].damageScale <= 1.85);
    assert.ok(regular.every(attack => attack.damageScale >= .8 && attack.damageScale <= 1));
    assert.ok(strong[0].damageScale / Math.max(...regular.map(attack => attack.damageScale)) >= 1.6);
    families.add(attacks.map(attack => `${attack.names.en}:${attack.shape}:${attack.magic}`).join('|'));
    assert.deepEqual(template, before);
  }
  assert.ok(families.size >= 12); assert.deepEqual([...shapes].sort(), ['burst','cone','fan','line','single']);
});

test('prepared attacks occur on a fixed public cadence and ordinary attacks alternate without RNG', () => {
  for (const id of ['monster-meadow-slime', 'monster-elder-dragon']) {
    const template = enemy(id), attacks = fantasyEnemyAttacks(template), strong = attacks.find(attack => attack.prepare)!;
    assert.equal(strong.interval, template.rank === 'boss' ? 4 : 6);
    for (let round = 1; round <= 24; round++) assert.equal(fantasyEnemyAttackForRound(template, round).prepare, round % strong.interval === 2);
    assert.notEqual(fantasyEnemyAttackForRound(template, 3).id, fantasyEnemyAttackForRound(template, 4).id);
    assert.deepEqual(fantasyEnemyAttackById(template, strong.id), strong); assert.equal(fantasyEnemyAttackById(template, 'forged-attack'), undefined);
  }
});

test('trait attacks distinguish ranged poachers, shield knights, elemental dragons and poison webs', () => {
  assert.ok(fantasyEnemyAttacks(enemy('human-poacher')).every(attack => attack.range === 'ranged' && attack.reach! >= 5));
  assert.ok(fantasyEnemyAttacks(enemy('human-order-knight')).some(attack => attack.effects?.guard));
  assert.ok(fantasyEnemyAttacks(enemy('monster-frost-dragon')).some(attack => attack.onHit?.id === 'frost'));
  assert.ok(fantasyEnemyAttacks(enemy('monster-red-dragon')).some(attack => attack.onHit?.id === 'burn'));
  assert.ok(fantasyEnemyAttacks(enemy('monster-venom-spider')).some(attack => attack.hitUtility?.id === 'root'));
  assert.ok(fantasyEnemyAttacks(enemy('monster-venom-spider')).some(attack => attack.onHit?.id === 'poison'));
});

test('charge geometry permits dodging a marked line and respects walls and reach', () => {
  const state = field(), foe = actor(), attack = fantasyEnemyAttacks(enemy('human-poacher')).find(attack => attack.prepare)!;
  const before = structuredClone({ state, foe, attack }), tiles = fantasyEnemyChargeTiles(state, foe, attack, { x: 6, y: 3 });
  assert.ok(tiles.some(tile => tile.x === 6 && tile.y === 3)); assert.ok(!tiles.some(tile => tile.x === 6 && tile.y === 4));
  state.battlefield!.blocked.push({ x: 4, y: 3 });
  assert.equal(fantasyEnemyChargeTiles(state, foe, attack, { x: 6, y: 3 }).length, 0);
  assert.equal(fantasyEnemyChargeTiles(field(), foe, { ...attack, reach: 2 }, { x: 6, y: 3 }).length, 0);
  assert.deepEqual(foe, before.foe); assert.deepEqual(attack, before.attack);
  assert.deepEqual(fantasyEnemyChargeTiles({} as FantasyCombatState, foe, attack, { x: 6, y: 3 }), []);
});

test('self-aim bursts mark the caster vicinity and returned attack data cannot leak mutation', () => {
  const template = enemy('monster-stone-golem'), foe = actor(), attacks = fantasyEnemyAttacks(template), strong = attacks.find(attack => attack.prepare)!;
  assert.equal(strong.aim, 'self');
  const tiles = fantasyEnemyChargeTiles(field(), foe, strong, { x: 8, y: 7 });
  assert.ok(tiles.some(tile => tile.x === 2 && tile.y === 3)); assert.ok(tiles.some(tile => tile.x === 3 && tile.y === 3));
  assert.ok(!tiles.some(tile => tile.x === 8 && tile.y === 7));
  const preserved = structuredClone(attacks); attacks[0].names.en = 'changed'; if (strong.effects) strong.effects.guard = 999;
  assert.deepEqual(fantasyEnemyAttacks(template), preserved);
});

test('ordinary weapons and fangs retain physical effects while elemental traits keep their elements', () => {
  for (const id of ['human-road-bandit','human-poacher','human-order-knight','monster-forest-wolf','monster-orc-raider']) {
    for (const attack of fantasyEnemyAttacks(enemy(id))) assert.equal(attack.visualElement, undefined, id + ':' + attack.id);
  }
  for (const [id, element] of [['monster-stone-golem','earth'],['monster-meadow-slime','water'],['monster-venom-spider','poison'],['monster-red-dragon','fire'],['monster-frost-dragon','frost'],['monster-storm-dragon','storm'],['monster-lich','star']] as const) {
    for (const attack of fantasyEnemyAttacks(enemy(id))) assert.equal(attack.visualElement, element, id + ':' + attack.id);
  }
});

test('high-tier golem quakes cover a larger zone than ordinary stone golems',()=>{
 const strong=(id:string)=>fantasyEnemyAttacks(enemy(id)).find(attack=>attack.prepare)!;
 assert.equal(strong('monster-obsidian-guardian').radius,4);
 assert.equal(strong('monster-stone-golem').radius,3);
});
