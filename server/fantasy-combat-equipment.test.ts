import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { createFantasyGear } from '../shared/fantasy-equipment.ts';
import { migrateFantasyEquipment } from '../shared/fantasy-equipment-slots.ts';
import { FANTASY_ITEMS } from '../shared/fantasy-data.ts';
import { fantasyCombatPlayer } from './fantasy-combat-adapter.ts';
function warrior() {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Adapter', source: 'human', gender: 'female' }, () => .5).profile;
  Object.assign(p.character!, { job: 'warrior', hour: 12, location: 'sunmeadow', inventory: { 'steel-sword': 1, 'bear-armor': 1, 'ruby-ring': 1 }, equipment: { weapon: 'steel-sword', armor: 'bear-armor', accessory: 'ruby-ring' }, equippedGear: {}, fatigue: 0, hunger: 0 });
  return p;
}
test('canonical body and ring migration preserves ordinary defense and resistance grades', () => {
  const p = warrior(), before = fantasyCombatPlayer(p, 'u').stats;
  assert.equal(before.defense, 17); assert.equal(before.magicResist, 11);
  migrateFantasyEquipment(p.character!, FANTASY_ITEMS);
  assert.deepEqual(fantasyCombatPlayer(p, 'u').stats, before);
});
test('canonical body migration preserves substantial masterwork defense and selected quality', () => {
  const p = warrior(), c = p.character!; c.jobXp.warrior = 100000;
  for (const [slot, id, gem] of [['weapon', 'steel-sword', 'ruby'], ['armor', 'bear-armor', 'diamond'], ['accessory', 'ruby-ring', 'ruby']] as const) {
    const gear = createFantasyGear(c, id, () => .999, 'starsteel-ingot', gem)!;
    c.equippedGear![slot] = gear.id;
  }
  const before = fantasyCombatPlayer(p, 'u').stats;
  assert.equal(before.defense, 51); assert.equal(before.magicResist, 21);
  migrateFantasyEquipment(c, FANTASY_ITEMS);
  assert.deepEqual(fantasyCombatPlayer(p, 'u').stats, before);
});
test('additional ring grades use the strongest worn individual without summing or using an unequipped copy', () => {
  const p = warrior(), c = p.character!; c.inventory['ruby-ring'] = 3; c.jobXp.warrior = 100000;
  const ordinary = createFantasyGear(c, 'ruby-ring', () => .5, 'copper-ingot')!;
  const fine = createFantasyGear(c, 'ruby-ring', () => .999, 'starsteel-ingot', 'ruby')!;
  c.equipment = { ring1: 'ruby-ring' }; c.equippedGear = { ring1: ordinary.id };
  const low = fantasyCombatPlayer(p, 'u').stats.magicResist;
  c.equippedGear.ring1 = fine.id;
  const high = fantasyCombatPlayer(p, 'u').stats.magicResist;
  assert.ok(high > low);
  c.equipment.ring2 = 'ruby-ring'; c.equippedGear.ring2 = ordinary.id;
  assert.equal(fantasyCombatPlayer(p, 'u').stats.magicResist, high);
  c.equipment = { ring2: 'ruby-ring' }; c.equippedGear = { ring2: ordinary.id };
  assert.equal(fantasyCombatPlayer(p, 'u').stats.magicResist, low);
});
test('inactive offhand gear never leaks a grade or masterwork bonus into combat', () => {
  const p = warrior(), c = p.character!; c.job = 'mage'; c.equipment = {}; c.equippedGear = {}; c.inventory['iron-shield'] = 1;
  c.jobXp.mage = 100000; const plain = fantasyCombatPlayer(p, 'u').stats;
  const shield = createFantasyGear(c, 'iron-shield', () => .999, 'starsteel-ingot', 'diamond')!;
  c.equipment = { offhand: 'iron-shield' }; c.equippedGear = { offhand: shield.id };
  assert.deepEqual(fantasyCombatPlayer(p, 'u').stats, plain);
});
