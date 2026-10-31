import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, advanceFantasyWorld, fantasyStats, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { fantasyRegularCombatEnemy } from './fantasy-encounters.ts';
import { fantasyCombatStartPlan } from './fantasy-combat-challenges.ts';
import { fantasyCombatEnemy } from './fantasy-combat-catalog.ts';
import { FANTASY_FRONTIER_BASE, FANTASY_FRONTIER_DEPARTURE, FANTASY_FRONTIER_ENCOUNTERS } from './fantasy-frontier-data.ts';
function traveler() {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Road', source: 'human', gender: 'female' }, () => .5).profile, c = p.character!;
  Object.assign(c, { hour: 12, location: FANTASY_FRONTIER_BASE, gold: 5000, job: 'warrior', encounterTier: 6 });
  c.jobXp.warrior = 0; c.visited.push(FANTASY_FRONTIER_BASE); c.charted.push('frontier-rainforest', FANTASY_FRONTIER_DEPARTURE);
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp; return p;
}
test('a stationary frontier landing has no native monster or human encounter pool', () => {
  const c = traveler().character!;
  for (const opponent of ['monster', 'person'] as const) assert.equal(fantasyRegularCombatEnemy(c, 'travel-ambush', opponent), undefined);
  c.travelPosition = { from: FANTASY_FRONTIER_BASE, to: 'frontier-rainforest', fraction: 0 };
  assert.equal(fantasyRegularCombatEnemy(c, 'travel-ambush'), undefined);
});
test('the road adjacent to the frontier landing uses the adjoining wilderness pool', () => {
  const c = traveler().character!;
  for (const [from, to] of [[FANTASY_FRONTIER_BASE, 'frontier-rainforest'], ['frontier-rainforest', FANTASY_FRONTIER_BASE]]) {
    c.travelPosition = { from, to, fraction: .1 };
    for (let hour = 12; hour < 20; hour++) {
      c.hour = hour; const enemy = fantasyRegularCombatEnemy(c, 'travel-ambush');
      assert.ok(enemy); assert.ok(FANTASY_FRONTIER_ENCOUNTERS['frontier-rainforest'].includes(enemy.id));
      assert.equal(enemy.kind, 'monster'); assert.ok(enemy.tier >= 4 && enemy.tier <= 6); assert.equal(enemy.provocationOnly, false);
    }
  }
});
test('both directions of the frontier sea edge use aquatic natives even while the anchor is the old city', () => {
  const c = traveler().character!;
  for (const [from, to] of [[FANTASY_FRONTIER_BASE, FANTASY_FRONTIER_DEPARTURE], [FANTASY_FRONTIER_DEPARTURE, FANTASY_FRONTIER_BASE]]) {
    c.location = from; c.travelPosition = { from, to, fraction: .02 };
    for (const opponent of ['monster', 'person'] as const) {
      const enemy = fantasyRegularCombatEnemy(c, 'travel-ambush', opponent);
      assert.ok(enemy); assert.ok(FANTASY_FRONTIER_ENCOUNTERS['frontier-kelp-coast'].includes(enemy.id));
      assert.equal(enemy.kind, 'monster'); assert.ok(enemy.tier >= 4 && enemy.tier <= 6);
    }
  }
});
test('seed39 ship and land ambushes departing the landing have real fight targets', () => {
  for (const [destination, transport, native] of [[FANTASY_FRONTIER_DEPARTURE, 'ship', 'frontier-kelp-coast'], ['frontier-rainforest', 'foot', 'frontier-rainforest']] as const) {
    const p = traveler();
    const started = startFantasyActivity(p, { type: 'travel', destination, transport }, 12, () => 39 / 4294967296);
    assert.equal(started.error, undefined); assert.equal(started.profile.activity!.seed, 39);
    const stopped = advanceFantasyWorld(started.profile, 14, { ambush: true });
    assert.equal(stopped.error, undefined); assert.ok(stopped.profile.event); assert.ok(stopped.profile.character!.travelPosition!.fraction > 0);
    const plan = fantasyCombatStartPlan(stopped.profile, 'encounter', stopped.profile.event!);
    assert.ok(plan); const enemy = fantasyCombatEnemy(plan.enemies[0].template)!;
    assert.ok(FANTASY_FRONTIER_ENCOUNTERS[native].includes(enemy.id)); assert.equal(enemy.kind, 'monster'); assert.ok(enemy.tier >= 4 && enemy.tier <= 6);
  }
});
