import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyCombatAttackTiles, fantasyAttackGeometry } from './fantasy-attack-shapes.ts';
import { fantasyWeaponAttackProfile, fantasyWeaponTechniqueReady } from './fantasy-weapon-attacks.ts';
import { createFantasyCombat, submitFantasyCombatOrder, validFantasyCombatState } from './fantasy-combat.ts';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyCombatPlayer } from '../server/fantasy-combat-adapter.ts';
import { FANTASY_ITEMS } from './fantasy-data.ts';
import type { FantasyCombatFighter, FantasyCombatSkill, FantasyCombatState } from './fantasy-combat.ts';

const actor = { id: 'player', tile: { x: 2, y: 3 }, range: 'melee' } as FantasyCombatFighter;
const field = () => ({ battlefield: { width: 10, height: 8, blocked: [], cover: [] } }) as unknown as FantasyCombatState;
const skill = (shape: FantasyCombatSkill['shape'], reach = 3): FantasyCombatSkill => ({ id: 'shape', names: { ko: '공격', en: 'Attack', ja: '攻撃' }, kind: 'attack', power: 10, mp: 5, reach, radius: 0, shape });
const has = (tiles: { x: number; y: number }[], x: number, y: number) => tiles.some(tile => tile.x === x && tile.y === y);

test('lines, cones, fans and bursts select different visible cells', () => {
  const aim = { x: 4, y: 3 };
  const line = fantasyCombatAttackTiles(field(), actor, aim, skill('line'));
  assert.ok(has(line, 3, 3)); assert.ok(has(line, 5, 3)); assert.ok(!has(line, 3, 4));
  const cone = fantasyCombatAttackTiles(field(), actor, aim, skill('cone'));
  assert.ok(has(cone, 3, 4)); assert.ok(!has(cone, 2, 4)); assert.ok(!has(cone, 1, 3));
  const fan = fantasyCombatAttackTiles(field(), actor, aim, skill('fan'));
  assert.ok(has(fan, 2, 4)); assert.ok(!has(fan, 1, 3)); assert.ok(!has(fan, 2, 3));
  const burst = fantasyCombatAttackTiles(field(), actor, aim, { ...skill('burst'), radius: 1 });
  assert.ok(has(burst, 5, 3)); assert.ok(has(burst, 4, 4)); assert.ok(!has(burst, 3, 4));
});
test('directional cells respect range, walls and invalid aiming without changing legacy shapes', () => {
  const battle = field(); battle.battlefield!.blocked.push({ x: 3, y: 3 });
  assert.deepEqual(fantasyCombatAttackTiles(battle, actor, { x: 4, y: 3 }, skill('line')), []);
  assert.deepEqual(fantasyCombatAttackTiles(field(), actor, { x: 6, y: 3 }, skill('line')), []);
  assert.deepEqual(fantasyCombatAttackTiles(field(), actor, actor.tile!, skill('cone')), []);
  assert.equal(fantasyAttackGeometry({ radius: 1 }), 'burst');
  assert.equal(fantasyAttackGeometry({}), 'single');
});
test('weapon and anatomy bonuses are bounded and do not turn breathing into weapon attacks', () => {
  const attack = skill(undefined);
  const spear = fantasyWeaponAttackProfile(attack, { weapon: 'steel-spear', traits: [] });
  assert.equal(spear.shape, 'line'); assert.equal(spear.reach, 2);
  assert.equal(fantasyWeaponAttackProfile(attack, { weapon: 'steel-spear', traits: ['large'] }).reach, 3);
  assert.equal(fantasyWeaponAttackProfile(attack, { weapon: 'longbow', traits: ['keen'] }).reach, 9);
  const precise = fantasyWeaponAttackProfile({ ...attack, id: 'tech-hunter-aimed-shot' }, { weapon: 'longbow', traits: ['keen'] });
  assert.equal(precise.reach, 10);
  const breath = fantasyWeaponAttackProfile({ ...attack, id: 'dragonblood-flame' }, { weapon: 'longbow', traits: ['large', 'keen'] });
  assert.equal(breath.reach, 3); assert.equal(breath.shape, 'cone'); assert.equal(breath.magic, true);
  assert.deepEqual(fantasyWeaponAttackProfile({ ...attack, kind: 'guard' }, { weapon: 'longbow', traits: ['keen'] }), { ...attack, kind: 'guard' });
  assert.equal(fantasyWeaponTechniqueReady('tech-archer-volley', 'iron-sword'), false);
  assert.equal(fantasyWeaponTechniqueReady('tech-spearfighter-thrust', 'steel-spear'), true);
  const kick = fantasyWeaponAttackProfile({ ...attack, id: 'tech-pugilist-sweep' }, { weapon: 'steel-spear', traits: [] });
  assert.equal(kick.reach, 1); assert.equal(kick.shape, 'fan');
});

test('a shaped cast hits only opposing cells, pays once and retains strict save validation', () => {
  const art = { ...skill('line'), secondaryDamage: 75 };
  const names = { ko: '사용자', en: 'Player', ja: '使用者' };
  let hitSecondary = false;
  for (let seed = 1; seed <= 12; seed++) {
    const stats = { hp: 500, mp: 100, attack: 40, defense: 20, agility: 500, intelligence: 10, accuracy: 100, magicResist: 20 };
    const battle = createFantasyCombat({ id: 'shape', source: 'hunt:monster-stone-golem', location: 'oldwatch', seed, hour: 12, tactical: true,
      players: [{ id: 'p0', userId: 'u0', generation: 1, names, stats, hp: 500, mp: 100, position: 'front', range: 'melee', skills: [art] }],
      enemies: [0, 1, 2].map(index => ({ id: `e${index}`, template: 'monster-stone-golem' })) });
    battle.battlefield = { width: 10, height: 8, blocked: [], cover: [] };
    battle.fighters[0].tile = { x: 1, y: 3 };
    for (let index = 0; index < 3; index++) {
      const enemy = battle.fighters[index + 1]; enemy.tile = [{ x: 2, y: 3 }, { x: 3, y: 3 }, { x: 2, y: 4 }][index];
      enemy.stats.hp = enemy.hp = 1000; enemy.stats.agility = 0;
    }
    const result = submitFantasyCombatOrder(battle, 'u0', battle.revision, { type: 'skill', skill: art.id, target: 'e0' }, battle.hour);
    assert.equal(result.error, undefined); assert.ok(validFantasyCombatState(result.state));
    assert.equal(result.state.fighters[3].hp, 1000);
    const receipts = result.usedSkills?.filter(use => use.skill === art.id) ?? [];
    assert.ok(receipts.length <= 1);
    if (receipts.length) assert.equal(result.state.fighters[0].mp, 100 - art.mp);
    hitSecondary ||= result.state.fighters[2].hp < 1000;
    const forged = structuredClone(result.state); forged.fighters[0].skills[0].shape = 'unknown' as FantasyCombatSkill['shape'];
    assert.equal(validFantasyCombatState(forged), false);
    forged.fighters[0].skills[0].shape = 'line'; forged.fighters[0].skills[0].secondaryDamage = 101;
    assert.equal(validFantasyCombatState(forged), false);
  }
  assert.ok(hitSecondary);
});
test('learned weapon techniques are derived on the server and still require their profession and weapon', () => {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Shapes', gender: 'female' }, () => .5).profile;
  const character = profile.character!;
  const spear = FANTASY_ITEMS.find(item => item.equipment?.slot === 'weapon' && /spear|lance|pike/.test(item.id))!;
  assert.ok(spear); character.job = 'spearfighter'; character.jobXp.spearfighter = 30;
  character.inventory[spear.id] = 1; character.equipment = { ...character.equipment, weapon: spear.id };
  const attack = fantasyCombatPlayer(profile, 'u0').skills.find(skill => skill.id === 'tech-spearfighter-thrust');
  assert.equal(attack?.shape, 'line'); assert.ok((attack?.reach ?? 0) >= 2);
  delete character.equipment.weapon;
  assert.ok(!fantasyCombatPlayer(profile, 'u0').skills.some(skill => skill.id === 'tech-spearfighter-thrust'));
  character.job = 'cook';
  assert.ok(!fantasyCombatPlayer(profile, 'u0').skills.some(skill => skill.id === 'tech-spearfighter-thrust'));
});
