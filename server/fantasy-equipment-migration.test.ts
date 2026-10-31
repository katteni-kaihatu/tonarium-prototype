import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { createFantasyGear } from '../shared/fantasy-equipment.ts';
import { migrateFantasyEquipmentResources } from '../shared/fantasy-equipment-migration.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
function person(item = 'ruby-ring') {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Legacy equipment', source: 'human', gender: 'female' }, () => .5).profile, c = p.character!;
  delete c.equipmentVersion; c.birthBonuses = {}; c.foodLots = []; c.outfit = undefined; c.inventory = { [item]: 1 }; c.equipment = {}; c.equippedGear = {}; c.gear = []; c.job = 'blacksmith'; c.jobXp.blacksmith = 100000;
  const gear = createFantasyGear(c, item, () => .999, 'starsteel-ingot', item === 'sapphire-charm' ? 'sapphire' : 'ruby')!;
  assert.equal(gear.quality, 5); c.job = 'unassigned';
  c.equipment = { accessory: item }; c.equippedGear = { accessory: gear.id };
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  return p;
}
function load(t: TestContext, profile: FantasyProfile) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-equipment-migration-'));
  t.after(() => { assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('fantasy-equipment-migration-')); fs.rmSync(dir, { recursive: true, force: true }); });
  const file = path.join(dir, 'fantasy.json'), bytes = JSON.stringify({ owner: profile }); fs.writeFileSync(file, bytes);
  const store = new FantasyStore(file, { worldHour: () => profile.character!.hour, onError: () => {} });
  return { store, file, bytes };
}
test('a fully healed legacy crafted ruby ring loads with bounded HP124 clamped to120', t => {
  const p = person(); p.character!.hp = 124; const saved = load(t, p);
  assert.equal(saved.store.loadError, undefined);
  const c = saved.store.profile('owner').character!;
  assert.equal(c.hp, 120); assert.equal(c.equipment?.ring1, 'ruby-ring');
  assert.equal(c.inventory['ruby-ring'], 1); assert.equal(c.gear![0].quality, 5);
});
test('legacy crafted mana accessories load only within their exact old resource budget', t => {
  const p = person('sapphire-charm'); p.character!.mp = 50 + 6 * 3 + 26;
  const saved = load(t, p); assert.equal(saved.store.loadError, undefined);
  assert.equal(saved.store.profile('owner').character!.mp, 79);
  p.character!.mp++; const oversized = load(t, p); assert.ok(oversized.store.loadError);
  assert.equal(fs.readFileSync(oversized.file, 'utf8'), oversized.bytes);
});
test('modern over-max resources and forged old ownership remain rejected without rewriting saves', t => {
  for (const change of ['modern', 'over-budget', 'unowned', 'forged-quality'] as const) {
    const p = person(), c = p.character!;
    if (change === 'modern') { c.equipmentVersion = 1; c.equipment = { ring1: 'ruby-ring' }; c.equippedGear = { ring1: c.gear![0].id }; c.hp = 121; }
    if (change === 'over-budget') c.hp = 125;
    if (change === 'unowned') { c.hp = 124; c.inventory['ruby-ring'] = 0; }
    if (change === 'forged-quality') { c.hp = 124; c.gear![0].bonuses!.hp = 10000; }
    const saved = load(t, p); assert.ok(saved.store.loadError, change); assert.equal(fs.readFileSync(saved.file, 'utf8'), saved.bytes, change);
  }
});

test('equipment resource migration never heals or mutates ownership, crafted records or effects', () => {
  const c = person().character!; c.hp = 124; const before = structuredClone(c);
  assert.equal(migrateFantasyEquipmentResources(c), true); assert.equal(c.hp, 120);
  assert.deepEqual(c, { ...before, hp: 120 });
  const migrated = structuredClone(c); assert.equal(migrateFantasyEquipmentResources(c), false); assert.deepEqual(c, migrated);
  c.hp = 17; c.mp = 0; const injured = structuredClone(c);
  assert.equal(migrateFantasyEquipmentResources(c), false); assert.deepEqual(c, injured);
});

test('a modern inactive offhand cannot repeatedly forgive oversized resources', t => {
  const p = person('ancient-aegis'), c = p.character!;
  c.equipment = { offhand: 'ancient-aegis' }; c.equippedGear = { offhand: c.gear![0].id }; c.equipmentVersion = 1;
  c.hp = fantasyStats(c).hp + 1;
  const before = structuredClone(c); assert.equal(migrateFantasyEquipmentResources(c), false); assert.deepEqual(c, before);
  const saved = load(t, p); assert.ok(saved.store.loadError); assert.equal(fs.readFileSync(saved.file, 'utf8'), saved.bytes);
});

test('old inactive shields retain ownership while HP clamps only within the verified old maximum', t => {
  const p = person('ancient-aegis'), c = p.character!;
  c.equipment = { offhand: 'ancient-aegis' }; c.equippedGear = { offhand: c.gear![0].id }; c.hp = 120;
  const preview = structuredClone(c); assert.equal(migrateFantasyEquipmentResources(preview), true); assert.equal(preview.hp, 100);
  const saved = load(t, p); assert.equal(saved.store.loadError, undefined);
  const loaded = saved.store.profile('owner').character!;
  assert.equal(loaded.hp, 100); assert.equal(loaded.equipment?.offhand, 'ancient-aegis'); assert.equal(loaded.inventory['ancient-aegis'], 1);
  assert.equal(loaded.equipmentVersion, 1);
  c.hp = 121; const oversized = load(t, p); assert.ok(oversized.store.loadError);
});

test('old equipment with expired legitimate vitality includes the exact combined historical HP budget', t => {
  const p = person(), c = p.character!;
  c.effects = [{ id: 'spice-skewer-vigor', expiresAt: c.hour, stats: { vitality: 1 } }];
  c.hp = 128;
  const saved = load(t, p); assert.equal(saved.store.loadError, undefined);
  const restored = saved.store.profile('owner').character!;
  assert.equal(restored.hp, 120); assert.equal(restored.equipmentVersion, 1);
  assert.equal(restored.equipment?.ring1, 'ruby-ring'); assert.deepEqual(restored.gear, c.gear);
  assert.deepEqual(restored.inventory, c.inventory);
  const direct = structuredClone(c), before = structuredClone(c);
  assert.equal(migrateFantasyEquipmentResources(direct), true);
  assert.deepEqual(direct, { ...before, hp: 120 });
  c.hp = 129;
  const oversized = load(t, p); assert.ok(oversized.store.loadError);
  assert.equal(fs.readFileSync(oversized.file, 'utf8'), oversized.bytes);
});

test('expired effects cannot extend modern or forged legacy equipment resource budgets', t => {
  for (const change of ['modern', 'forged-effect', 'forged-potency'] as const) {
    const p = person(), c = p.character!;
    c.effects = [{ id: 'spice-skewer-vigor', expiresAt: c.hour, stats: { vitality: 1 } }];
    c.hp = 128;
    if (change === 'modern') c.equipmentVersion = 1;
    if (change === 'forged-effect') c.effects[0].id = 'imaginary-vigor';
    if (change === 'forged-potency') c.effects[0].stats!.vitality = 100;
    const before = structuredClone(c);
    assert.equal(migrateFantasyEquipmentResources(c), false, change);
    assert.deepEqual(c, before, change);
    const saved = load(t, p); assert.ok(saved.store.loadError, change);
    assert.equal(fs.readFileSync(saved.file, 'utf8'), saved.bytes, change);
  }
});
