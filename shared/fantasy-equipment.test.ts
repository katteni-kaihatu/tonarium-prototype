import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from './fantasy-engine.ts';
import { createFantasyGear, fantasyCombatStat, fantasyCraftInputs, fantasyEquipGear, fantasySpendItem, validFantasyGear } from './fantasy-equipment.ts';
import { FANTASY_RECIPES } from './fantasy-data.ts';

const player = () => applyFantasyAction(newFantasyProfile(), { type: 'create', name: '装備試験', source: 'human', gender: 'female' }, () => 0.999).profile;

test('material and maker mastery dominate crafted quality, gems add real bounded attributes and random variation stays small', () => {
  const novice = player().character!; novice.job = 'blacksmith'; novice.jobXp.blacksmith = 0; novice.inventory['steel-sword'] = 3;
  const basic = createFantasyGear(novice, 'steel-sword', () => 0.5, 'copper-ingot')!;
  const master = player().character!; master.job = 'blacksmith'; master.jobXp.blacksmith = 600; master.inventory['steel-sword'] = 3;
  const fine = createFantasyGear(master, 'steel-sword', () => 0.5, 'starsteel-ingot', 'ruby')!;
  assert.ok(fine.quality > basic.quality); assert.ok(fine.bonuses!.strength! > basic.bonuses!.strength!);
  const low = createFantasyGear(master, 'steel-sword', () => 0, 'mithril-ingot')!;
  const high = createFantasyGear(master, 'steel-sword', () => 0.999, 'mithril-ingot')!;
  assert.ok(Math.abs(high.quality - low.quality) <= 1);
  assert.equal(validFantasyGear(master), true);
  const before = fantasyStats(master).strength;
  assert.equal(fantasyEquipGear(master, 'steel-sword', fine.id), undefined);
  assert.ok(fantasyStats(master).strength > before);
});

test('craft substitution consumes the chosen material and rejects wrong material families and fake gems', () => {
  const c = player().character!, recipe = FANTASY_RECIPES.find(recipe => recipe.id === 'forge-spear')!;
  c.inventory = { ...recipe.inputs, 'mithril-ingot': 2, ruby: 1 };
  const plan = fantasyCraftInputs(c, recipe, 'mithril-ingot', 'ruby');
  assert.equal(plan.error, undefined); assert.equal(plan.inputs.ingot, undefined); assert.equal(plan.inputs['mithril-ingot'], 2); assert.equal(plan.inputs.ruby, 1);
  assert.ok(fantasyCraftInputs(c, recipe, 'mithril-ore').error);
  assert.ok(fantasyCraftInputs(c, recipe, undefined, '__proto__').error);
});

test('instance-aware selling and delivery preserve the equipped copy and cannot duplicate or strand gear', () => {
  const c = player().character!; c.job = 'blacksmith'; c.jobXp.blacksmith = 600; c.inventory['steel-sword'] = 2;
  const a = createFantasyGear(c, 'steel-sword', () => 0, 'copper-ingot')!;
  const b = createFantasyGear(c, 'steel-sword', () => 0.999, 'starsteel-ingot', 'ruby')!;
  fantasyEquipGear(c, 'steel-sword', b.id);
  assert.equal(fantasySpendItem(c, 'steel-sword', 1, b.id), false);
  assert.equal(fantasySpendItem(c, 'steel-sword', 1, a.id), true);
  assert.equal(c.inventory['steel-sword'], 1); assert.deepEqual(c.gear!.map(gear => gear.id), [b.id]);
  assert.equal(validFantasyGear(c), true); assert.equal(fantasySpendItem(c, 'steel-sword', 1), false);
  c.equipment = {}; c.equippedGear = {}; assert.equal(fantasySpendItem(c, 'steel-sword', 1), true);
  assert.equal(c.gear!.length, 0); assert.equal(c.inventory['steel-sword'], 0);
});

test('bow and crossbow attacks always use agility regardless of the equipped character profession', () => {
  const c = player().character!; c.job = 'warrior';
  for (const weapon of ['oak-bow', 'steel-crossbow']) { c.equipment = { weapon }; assert.equal(fantasyCombatStat(c), 'agility'); }
  c.equipment = { weapon: 'mana-staff' }; assert.equal(fantasyCombatStat(c), 'intelligence');
  c.equipment = { weapon: 'steel-sword' }; assert.equal(fantasyCombatStat(c), 'strength');
});

test('tampered instance ownership, quality bonuses and future creation dates are rejected', () => {
  const c = player().character!; c.inventory['steel-sword'] = 1;
  const gear = createFantasyGear(c, 'steel-sword', () => 0.5)!; assert.equal(validFantasyGear(c), true);
  gear.bonuses = { strength: 999 }; assert.equal(validFantasyGear(c), false);
  gear.bonuses = { strength: 0 }; gear.createdAt = c.hour + 1; assert.equal(validFantasyGear(c), false);
  gear.createdAt = c.hour; c.inventory['steel-sword'] = 0; assert.equal(validFantasyGear(c), false);
});
