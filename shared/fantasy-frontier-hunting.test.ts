import * as challenges from './fantasy-combat-challenges.ts';
import { reconcileFoodLots } from './fantasy-life.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyCombatHuntOptions, fantasyCombatStartError, fantasyCombatStartPlan } from './fantasy-combat-challenges.ts';
import { fantasyCombatEnemy } from './fantasy-combat-catalog.ts';
import { FANTASY_FRONTIER_BASE, FANTASY_FRONTIER_ENCOUNTERS, FANTASY_FRONTIER_LOCATIONS } from './fantasy-frontier-data.ts';
function explorer() {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Native hunt', source: 'human', gender: 'female' }, () => .5).profile;
  Object.assign(p.character!, { location: 'frontier-rainforest', hour: 12, quests: [], contracts: {}, encounterTier: 4 });
  p.character!.inventory.lantern = 1; return p;
}
test('frontier hunting opens native food targets without a guild contract through actual combat plans', () => {
  const p = explorer(), c = p.character!;
  assert.deepEqual(fantasyCombatHuntOptions(c).map(enemy => enemy.id), ['monster-marsh-troll']);
  const plan = fantasyCombatStartPlan(p, 'hunt', 'monster-marsh-troll');
  assert.deepEqual(plan, { source: 'hunt:monster-marsh-troll', enemies: [{ id: 'enemy-1', template: 'monster-marsh-troll', position: 'front' }] });
  assert.equal(fantasyCombatStartError(p, 'hunt', 'monster-marsh-troll'), undefined);
  c.combatVictories = { 'hunt:monster-marsh-troll': c.hour };
  assert.deepEqual(fantasyCombatStartPlan(p, 'hunt', 'monster-marsh-troll'), plan);
});
test('frontier native hunting stays within native terrain and current regular power bands four through six', () => {
  const p = explorer(), c = p.character!;
  for (const place of FANTASY_FRONTIER_LOCATIONS) for (const tier of [1, 4, 5, 6] as const) {
    c.location = place.id; c.encounterTier = tier;
    for (const enemy of fantasyCombatHuntOptions(c)) {
      assert.ok(FANTASY_FRONTIER_ENCOUNTERS[place.id].includes(enemy.id));
      assert.ok(enemy.tier >= 4 && enemy.tier <= Math.max(4, tier) && enemy.tier <= 6);
      assert.equal(enemy.provocationOnly, false); assert.ok(enemy.kinds.includes(place.kind));
      assert.equal(fantasyCombatStartPlan(p, 'hunt', enemy.id)?.enemies[0].template, enemy.id);
    }
  }
  c.location = 'frontier-rainforest'; c.encounterTier = 6;
  assert.ok(fantasyCombatHuntOptions(c).some(enemy => enemy.id === 'monster-chimera'));
  for (const target of ['monster-hydra', 'monster-abyss-hydra', 'monster-void-chimera', 'human-watch-patrol', '__proto__', 'monster-forged']) assert.equal(fantasyCombatStartPlan(p, 'hunt', target), undefined, target);
  c.location = FANTASY_FRONTIER_BASE; assert.deepEqual(fantasyCombatHuntOptions(c), []);
  assert.equal(fantasyCombatStartPlan(p, 'hunt', 'monster-marsh-troll'), undefined);
});
test('native frontier hunts never turn old-land hunting into free contractless challenges', () => {
  const p = explorer(); p.character!.location = 'greenwood';
  assert.deepEqual(fantasyCombatHuntOptions(p.character!), []);
  assert.equal(fantasyCombatStartPlan(p, 'hunt', 'monster-forest-wolf'), undefined);
  assert.equal(fantasyCombatStartPlan(p, 'hunt', 'monster-marsh-troll'), undefined);
  p.character!.location = 'frontier-rainforest';
  assert.equal(fantasyCombatEnemy(fantasyCombatStartPlan(p, 'hunt', 'marsh-troll')!.enemies[0].template)?.tier, 4);
});

test('a native hunt victory grants fresh meat and one existing-style skinning carcass', () => {
  assert.equal(typeof challenges.grantFantasyFrontierHuntLoot, 'function');
  const c = explorer().character!; c.location = 'frontier-frost-basin'; c.inventory.meat = 5;
  c.foodLots.push({ id: 'old-meat', item: 'meat', count: 5, createdAt: 1 });
  const oldLots = structuredClone(c.foodLots);
  const result = challenges.grantFantasyFrontierHuntLoot(c, 'monster-ice-wolf');
  assert.equal(result?.meat, 2); assert.equal(c.inventory.meat, 7);
  assert.deepEqual(c.carcass, { location: 'frontier-frost-basin', hour: 12, monster: 'monster-ice-wolf', hide: 'wolf-hide', count: 1 });
  assert.deepEqual(c.foodLots, oldLots);
  reconcileFoodLots(c);
  assert.equal(c.foodLots.find(lot => lot.id === 'old-meat')?.count, 5);
  assert.equal(c.foodLots.filter(lot => lot.item === 'meat' && lot.createdAt === 12).reduce((sum, lot) => sum + lot.count, 0), 2);
  const before = structuredClone(c);
  assert.equal(challenges.grantFantasyFrontierHuntLoot(c, 'monster-hydra'), undefined);
  assert.deepEqual(c, before);
  c.location = 'greenwood'; const outside = structuredClone(c);
  assert.equal(challenges.grantFantasyFrontierHuntLoot(c, 'monster-ice-wolf'), undefined);
  assert.deepEqual(c, outside);
});
