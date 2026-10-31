import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_COMBAT_ENEMIES, FANTASY_APEX_PROVOCATIONS, createFantasyCombatEnemyStats, fantasyCombatEnemy } from './fantasy-combat-catalog.ts';
import { FANTASY_MONSTERS } from './fantasy-monsters.ts';
import { FANTASY_LOCATIONS } from './fantasy-data.ts';
import { FANTASY_STORY_COMBATS } from './fantasy-combat-stories.ts';
import { fantasyCombatHuntOptions } from './fantasy-combat-challenges.ts';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { fantasyMonsterCombatStats } from './fantasy-monster-balance.ts';
import { fantasyMonsterSiteForProvocation } from './fantasy-monster-sites.ts';
import type { FantasyAdventurerGrade } from './fantasy-adventurer.ts';
import { FANTASY_NAVAL_MONSTERS, FANTASY_NAVAL_COMBAT_TEMPLATES, FANTASY_NAVAL_AUXILIARIES } from './fantasy-naval-catalog.ts';

test('the combat bestiary preserves all registered monsters alongside ten variants and five human opponents', () => {
  const navalMonsters = new Set(FANTASY_NAVAL_MONSTERS.map(monster => monster.id)), navalTemplates = new Set(FANTASY_NAVAL_COMBAT_TEMPLATES.map(enemy => enemy.id));
  assert.equal(FANTASY_MONSTERS.filter(monster => !navalMonsters.has(monster.id)).length, 56);
  assert.equal(FANTASY_COMBAT_ENEMIES.filter(enemy => !navalTemplates.has(enemy.id)).length, 71);
  assert.equal(FANTASY_MONSTERS.length, 56 + FANTASY_NAVAL_MONSTERS.length);
  assert.equal(FANTASY_COMBAT_ENEMIES.length, 71 + FANTASY_NAVAL_COMBAT_TEMPLATES.length);
  assert.equal(new Set(FANTASY_COMBAT_ENEMIES.map(enemy => enemy.id)).size, FANTASY_COMBAT_ENEMIES.length);
  const oldIds = new Set(FANTASY_MONSTERS.map(monster => monster.id));
  assert.equal(FANTASY_COMBAT_ENEMIES.filter(enemy => enemy.kind === 'monster' && !oldIds.has(enemy.id) && !enemy.auxiliary).length, 10);
  assert.deepEqual(FANTASY_COMBAT_ENEMIES.filter(enemy => enemy.auxiliary).map(enemy => enemy.id).sort(), FANTASY_NAVAL_AUXILIARIES.map(enemy => enemy.id).sort());
  assert.equal(FANTASY_COMBAT_ENEMIES.filter(enemy => enemy.kind === 'human').length, 5);
  for (const old of FANTASY_MONSTERS) assert.deepEqual(fantasyCombatEnemy(old.id)!.names, old.names);
  assert.equal(fantasyCombatEnemy('not-a-monster'), undefined);
});

test('every opponent has localized presentation, concrete bounded stats and distinct combat behaviors', () => {
  const statShapes = new Set<string>(), patterns = new Set<string>();
  for (const enemy of FANTASY_COMBAT_ENEMIES) {
    for (const locale of ['ko', 'en', 'ja'] as const) {
      assert.ok(enemy.names[locale].trim()); assert.ok(enemy.descriptions[locale].trim());
      assert.doesNotMatch(enemy.descriptions[locale], /\b(?:NPC|server|player)\b|플레이어|サーバー|プレイヤー/);
    }
    assert.deepEqual(Object.keys(enemy.stats).sort(), ['hp', 'mp', 'attack', 'defense', 'agility', 'intelligence', 'accuracy', 'magicResist'].sort());
    for (const value of Object.values(enemy.stats)) assert.ok(Number.isSafeInteger(value) && value >= 0);
    assert.ok(enemy.stats.hp > 0 && enemy.stats.attack > 0 && enemy.stats.accuracy > 0 && enemy.stats.accuracy <= 100);
    assert.ok(enemy.tier >= 1 && enemy.tier <= 8); assert.ok(['normal', 'elite', 'boss'].includes(enemy.rank));
    assert.ok(enemy.kinds.length > 0); assert.ok(enemy.reward.xp >= 0 && enemy.reward.gold >= 0);
    statShapes.add(JSON.stringify(enemy.stats)); patterns.add(enemy.pattern);
  }
  assert.ok(statShapes.size >= 20); assert.ok(patterns.size >= 8);
  for (let tier = 2; tier <= 8; tier++) for (const role of ['slime', 'dragon', 'golem', 'beast'] as const) {
    const lower = fantasyMonsterCombatStats((tier - 1) as FantasyAdventurerGrade, role), higher = fantasyMonsterCombatStats(tier as FantasyAdventurerGrade, role);
    assert.ok(higher.hp > lower.hp, `${role}: tier${tier} HP`);
  }
});

test('individual variation is drawn once, stays within eight percent plus integer rounding and never mutates a template', () => {
  for (const enemy of FANTASY_COMBAT_ENEMIES) {
    const before = structuredClone(enemy.stats); let draws = 0;
    const low = createFantasyCombatEnemyStats(enemy.id, () => { draws++; return 0; });
    assert.equal(draws, 1); const high = createFantasyCombatEnemyStats(enemy.id, () => 1);
    assert.ok(Math.abs(low.variation - .92) < 1e-10); assert.ok(Math.abs(high.variation - 1.08) < 1e-10);
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      assert.ok(low.stats[key] >= Math.floor(before[key] * .92) - 1);
      assert.ok(high.stats[key] <= Math.ceil(before[key] * 1.08) + 1);
      assert.ok(low.stats[key] <= high.stats[key]);
    }
    assert.deepEqual(createFantasyCombatEnemyStats(enemy.id, () => .5).stats, before);
    low.stats.hp = 1; assert.deepEqual(enemy.stats, before);
    const snapshot = JSON.parse(JSON.stringify(high)); assert.deepEqual(snapshot, high);
  }
  for (const draw of [NaN, Infinity, -.1, 1.1]) assert.throws(() => createFantasyCombatEnemyStats(FANTASY_COMBAT_ENEMIES[0].id, () => draw));
  assert.throws(() => createFantasyCombatEnemyStats('unknown'));
});

test('four apex opponents and seven rank-seven site bosses have eleven distinct map-gated provocations', () => {
  const apex = FANTASY_COMBAT_ENEMIES.filter(enemy => enemy.tier === 8);
  assert.equal(apex.length, 4); assert.equal(FANTASY_APEX_PROVOCATIONS.length, 11);
  assert.equal(new Set(FANTASY_APEX_PROVOCATIONS.map(action => action.enemy)).size, 11);
  assert.equal(FANTASY_APEX_PROVOCATIONS.filter(action => fantasyCombatEnemy(action.enemy)!.tier === 7).length, 7);
  for (const action of FANTASY_APEX_PROVOCATIONS) {
    const enemy = fantasyCombatEnemy(action.enemy)!, site = fantasyMonsterSiteForProvocation(action.id)!;
    assert.ok(site, action.id); assert.equal(site.enemy, enemy.id); assert.equal(site.location, action.location);
    assert.ok(enemy.tier === 7 || enemy.tier === 8);
  }
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Observer', gender: 'female' }, () => .5).profile;
  for (const enemy of apex) {
    assert.equal(enemy.provocationOnly, true); assert.equal(enemy.rank, 'boss'); assert.ok(enemy.reward.honor);
    assert.equal(enemy.reward.gold, 0); assert.ok(enemy.reward.materials.length > 0);
    assert.ok(!FANTASY_STORY_COMBATS.some(scene => scene.enemy === enemy.id));
    const action = FANTASY_APEX_PROVOCATIONS.find(value => value.enemy === enemy.id)!;
    assert.ok(action); assert.ok(action.action); assert.ok(FANTASY_LOCATIONS.some(place => place.id === action.location));
    for (const locale of ['ko', 'en', 'ja'] as const) { assert.ok(action.warning[locale].length > 50); assert.ok(action.confirmation[locale].length > 10); assert.ok(enemy.reward.honor!.names[locale]); }
  }
  for (const place of FANTASY_LOCATIONS) {
    p.character!.location = place.id;
    assert.ok(fantasyCombatHuntOptions(p.character!).every(enemy => !enemy.provocationOnly && enemy.tier < 8));
  }
  assert.ok(FANTASY_STORY_COMBATS.some(scene => scene.quest === 'main-night-01'));
  assert.ok(FANTASY_STORY_COMBATS.some(scene => Number(scene.quest.slice(-2)) >= 14));
});

test('human opponents have an actual hostile cause and never classify all people by ancestry or player profession', () => {
  const humans = FANTASY_COMBAT_ENEMIES.filter(enemy => enemy.kind === 'human');
  assert.equal(humans.filter(enemy => enemy.humanCause === 'crime-enforcement').length, 2);
  for (const enemy of humans) {
    assert.ok(['banditry', 'poaching', 'fleet-violence', 'crime-enforcement'].includes(enemy.humanCause!));
    assert.equal(enemy.provocationOnly, false); assert.ok(enemy.tier < 8);
    assert.ok(!Object.hasOwn(enemy, 'enemyRace')); assert.ok(!Object.hasOwn(enemy, 'enemyJob'));
  }
});

test('all apex species use the fixed tier-eight policy and retain their distinct challenges and rewards', () => {
  for (const id of ['monster-elder-dragon', 'monster-ancient-frost-dragon', 'monster-ancient-storm-dragon']) assert.deepEqual(fantasyCombatEnemy(id)!.stats, fantasyMonsterCombatStats(8, 'dragon', id));
  assert.deepEqual(fantasyCombatEnemy('monster-void-chimera')!.stats, fantasyMonsterCombatStats(8, 'beast', 'monster-void-chimera'));
  const elder = fantasyCombatEnemy('monster-elder-dragon')!;
  assert.notDeepEqual(fantasyCombatEnemy('monster-ancient-frost-dragon')!.stats, elder.stats);
  assert.notDeepEqual(fantasyCombatEnemy('monster-void-chimera')!.stats, elder.stats);
  assert.equal(elder.provocationOnly, true); assert.equal(elder.reward.xp, 320); assert.equal(elder.reward.gold, 0);
  assert.deepEqual(elder.reward.materials, [{ item: 'elder-dragon-scale', count: 2 }]); assert.equal(elder.reward.honor?.id, 'honor-ember-oath');
});


test('fixed species profiles require their own tier and return isolated stats for later encounters', () => {
  const id = 'monster-elder-dragon', baseline = structuredClone(fantasyCombatEnemy(id)!.stats);
  const wrongTier = fantasyMonsterCombatStats(6, 'dragon', id);
  assert.deepEqual(wrongTier, fantasyMonsterCombatStats(6, 'dragon'));
  assert.notDeepEqual(wrongTier, baseline);
  const altered = fantasyMonsterCombatStats(8, 'dragon', id);
  altered.hp = 1; altered.attack = 1;
  assert.deepEqual(fantasyMonsterCombatStats(8, 'dragon', id), baseline);
  assert.deepEqual(fantasyCombatEnemy(id)!.stats, baseline);
  assert.deepEqual(createFantasyCombatEnemyStats(id, () => .5).stats, baseline);
});
