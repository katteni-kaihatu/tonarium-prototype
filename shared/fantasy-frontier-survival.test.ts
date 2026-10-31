import { fantasyCombatEnemy } from './fantasy-combat-catalog.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from './fantasy-engine.ts';
import { FANTASY_ITEMS, FANTASY_QUESTS } from './fantasy-data.ts';
import { FANTASY_FRONTIER_BASE, FANTASY_FRONTIER_DUNGEONS, FANTASY_FRONTIER_ENCOUNTERS, FANTASY_FRONTIER_FORAGE_ITEMS, FANTASY_FRONTIER_LOCATIONS } from './fantasy-frontier-data.ts';
import { FANTASY_FRONTIER_SUPPLIES } from './fantasy-expedition.ts';
import { FANTASY_MAPS, FANTASY_SETTLEMENTS, canBuyItem, fantasyBuildings, fantasyBuildingStock, fantasyLibraryHoldings } from './fantasy-town.ts';
import { fantasyGatheringOptions, fantasyHuntTargets, fantasyFishingError, fantasyFishingOptions } from './fantasy-gathering.ts';
import { fantasyRegularCombatEnemy } from './fantasy-encounters.ts';
import { fantasyCombatHuntOptions, fantasyCombatStartPlan } from './fantasy-combat-challenges.ts';
import { fantasyMapMerchantStock } from './fantasy-map-merchant.ts';
import { applyFantasyEconomyCommand, fantasyEconomyState, newFantasyEconomyLedger, validFantasyEconomyLedger } from './fantasy-economy.ts';
import { FantasyStore } from '../server/fantasy-store.ts';

function player(name = 'Explorer', location = FANTASY_FRONTIER_BASE) {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name }, () => .5).profile, c = p.character!;
  Object.assign(c, { location, hour: 12, level: 20, gold: 10000, job: 'warrior', encounterTier: 4, inventory: { lantern: 1 }, foodLots: [] });
  c.jobXp.warrior = 0; c.visited.push(location); c.expedition = { route: 'guild', issuedAt: 8 };
  c.guildProgress = { version: 1, grade: 4, completedAtGrade: 0, creditedQuests: [] };
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  return p;
}

test('frontier forage food is obtainable by the actual herb gathering action', () => {
  for (const [location, food] of Object.entries(FANTASY_FRONTIER_FORAGE_ITEMS)) {
    const p = player('Forager', location), option = fantasyGatheringOptions(p.character!).find(option => option.resource === 'herbs')!;
    assert.equal(option.available, true); assert.ok(food.every(item => option.items.includes(item)));
    const received = new Set<string>();
    for (let draw = 0; draw < 32; draw++) {
      const ready = structuredClone(p); ready.character!.buff = { effect: 'check', power: 40 };
      const result = applyFantasyAction(ready, { type: 'gather', resource: 'herbs' }, () => (draw + .5) / 32);
      assert.equal(result.error, undefined);
      for (const item of food) if ((result.profile.character!.inventory[item] ?? 0) > 0) {
        received.add(item); assert.ok(FANTASY_ITEMS.find(entry => entry.id === item)?.food);
        assert.ok(result.profile.character!.foodLots.some(lot => lot.item === item && lot.count > 0));
      }
    }
    assert.deepEqual(received, new Set(food), location);
  }
});

test('ordinary expedition members can shore fish at frontier waters while sea fishing stays specialized', () => {
  for (const location of ['frontier-kelp-coast', 'frontier-river-bend', 'frontier-reed-marsh']) {
    const p = player('Angler', location), c = p.character!;
    assert.equal(fantasyFishingError(c, 'pier'), undefined, location);
    assert.ok(fantasyFishingError(c, 'sea'), location);
    c.buff = { effect: 'check', power: 40 };
    const result = applyFantasyAction(p, { type: 'fish', mode: 'pier' }, () => .999);
    assert.equal(result.error, undefined);
    assert.ok(result.profile.character!.foodLots.some(lot => ['fish', 'trout', 'salmon'].includes(lot.item) && lot.count > 0));
    const novice = fantasyFishingOptions(c).find(option => option.mode === 'pier')!;
    c.job = 'fisher'; c.jobXp.fisher = 0;
    assert.ok(fantasyFishingOptions(c).find(option => option.mode === 'pier')!.dc < novice.dc);
    assert.ok(fantasyFishingError(c, 'sea'));
  }
  assert.ok(fantasyFishingError(player('Dry', 'frontier-amber-dunes').character!, 'pier'));
  assert.ok(fantasyFishingError(player('Old coast', 'tidehaven').character!, 'pier'));
});

test('native tier 4 to 6 quarry is offered and accepted by the canonical combat hunting path', () => {
  for (const place of FANTASY_FRONTIER_LOCATIONS.filter(place => place.id !== FANTASY_FRONTIER_BASE)) {
    const p = player('Hunter', place.id), targets = fantasyHuntTargets(p.character!);
    p.character!.encounterTier = 6;
    assert.ok(targets.length > 0); assert.deepEqual(new Set(targets.map(target => target.id)), new Set(FANTASY_FRONTIER_ENCOUNTERS[place.id].filter(id=>!fantasyCombatEnemy(id)?.navalOnly)));
    const offered = fantasyCombatHuntOptions(p.character!);
    assert.deepEqual(new Set(offered.map(target => target.id)), new Set(targets.map(target => target.id)), place.id);
    for (const target of offered) {
      assert.ok(target.tier >= 4 && target.tier <= 6 && target.kinds.includes(place.kind));
      assert.ok(fantasyCombatStartPlan(p, 'hunt', target.id), `${place.id}: ${target.id}`);
    }
    for (const strength of [4, 5] as const) {
      p.character!.encounterTier = strength;
      assert.ok(fantasyCombatHuntOptions(p.character!).every(target => target.tier >= 4 && target.tier <= strength));
    }
    assert.equal(fantasyCombatStartPlan(p, 'hunt', 'monster-elder-dragon'), undefined);
  }
});

test('regular frontier encounters stay native and choose the closest available tier to combat power', () => {
  for (const place of FANTASY_FRONTIER_LOCATIONS.filter(place => place.id !== FANTASY_FRONTIER_BASE)) for (const strength of [4, 5, 6] as const) {
    const c = player('Encounter', place.id).character!; c.encounterTier = strength;
    const native = fantasyHuntTargets(c);
    for (let hour = 0; hour < 48; hour++) {
      c.hour = hour;
      const enemy = fantasyRegularCombatEnemy(c, 'frontier-survival')!;
      assert.ok(enemy && enemy.tier >= 4 && enemy.tier <= 6); assert.ok(FANTASY_FRONTIER_ENCOUNTERS[place.id].includes(enemy.id));
      assert.ok(enemy.kinds.includes(place.kind));
      const possible = new Set([strength, Math.max(1, strength - 1), Math.max(1, strength - 2)].map(desired => {
        const distance = Math.min(...native.map(target => Math.abs(target.tier - desired)));
        return Math.min(...native.filter(target => Math.abs(target.tier - desired) === distance).map(target => target.tier));
      }));
      assert.ok(possible.has(enemy.tier));
    }
  }
});

test('the landing exposes only finite supplies with no settlement, lodging, library or hunting', () => {
  const p = player(), c = p.character!;
  assert.equal(FANTASY_SETTLEMENTS[c.location], undefined);
  assert.deepEqual(fantasyBuildings(c).map(building => building.id), ['market']);
  assert.deepEqual(fantasyBuildings(c)[0].npcIds, ['frontier-landing-sena']);
  assert.deepEqual(fantasyLibraryHoldings(c), []); assert.deepEqual(fantasyHuntTargets(c), []); assert.deepEqual(fantasyCombatHuntOptions(c), []);
  assert.equal(fantasyRegularCombatEnemy(c, 'frontier-survival'), undefined);
  assert.deepEqual(new Set(fantasyBuildingStock(c, 'market')), new Set(Object.keys(FANTASY_FRONTIER_SUPPLIES)));
  for (const item of ['steel-sword', 'meal', 'map-aurelia', `map-dungeon-${FANTASY_FRONTIER_DUNGEONS[0].id}`]) assert.equal(canBuyItem(c, item), false, item);
  assert.ok(applyFantasyAction(p, { type: 'lodge', room: 'common' }).error);
});

test('base stock is small, shared across users, valid for persistence and replenished only at the next day', () => {
  let ledger = newFantasyEconomyLedger(), profiles = new Map([['a', player('Ara')], ['b', player('Bora')]]), serial = 0;
  const context = (hour = 12) => ({ hour, peers: ['a', 'b'], token: `frontier-stock-${serial++}` });
  const view = (actor: string, hour = 12) => fantasyEconomyState(ledger, profiles, actor, context(hour)).shops.find(shop => shop.building === 'market')!;
  const sync = applyFantasyEconomyCommand(ledger, profiles, 'a', { type: 'sync' }, context());
  assert.equal(sync.error, undefined); ledger = sync.ledger; profiles = sync.profiles;
  assert.ok(validFantasyEconomyLedger(ledger, 12));
  for (const [item, cap] of Object.entries(FANTASY_FRONTIER_SUPPLIES)) {
    assert.ok(cap >= 1 && cap <= 3); assert.equal(view('a').lots.find(lot => lot.item === item)?.count, cap);
  }
  const initial = view('a'), lot = initial.lots.find(lot => lot.item === 'potion')!;
  const buy = applyFantasyEconomyCommand(ledger, profiles, 'a', { type: 'shopBuy', building: 'market', item: 'potion', count: lot.count, revision: initial.revision, lot: lot.id }, context());
  assert.equal(buy.error, undefined); ledger = buy.ledger; profiles = buy.profiles;
  assert.equal(view('b').lots.find(lot => lot.item === 'potion')?.count ?? 0, 0);
  const repeat = applyFantasyEconomyCommand(ledger, profiles, 'b', { type: 'shopBuy', building: 'market', item: 'potion', count: 1, revision: view('b').revision }, context());
  assert.equal(repeat.error, 'stock');
  assert.equal(view('b', 23.999).lots.find(lot => lot.item === 'potion')?.count ?? 0, 0);
  assert.equal(view('b', 24).lots.find(lot => lot.item === 'potion')?.count, FANTASY_FRONTIER_SUPPLIES.potion);
  const poisoned = structuredClone(ledger), other = poisoned.shops[`${FANTASY_FRONTIER_BASE}:market`].lots.find(lot => lot.item === 'lantern')!;
  other.count = FANTASY_FRONTIER_SUPPLIES.lantern + 1; assert.equal(validFantasyEconomyLedger(poisoned, 12), false);
});

test('real base purchases and shared remaining stock survive a FantasyStore restart', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-frontier-stock-'));
  t.after(() => { const resolved = path.resolve(directory); assert.equal(path.dirname(resolved), path.resolve(os.tmpdir())); assert.ok(path.basename(resolved).startsWith('fantasy-frontier-stock-')); fs.rmSync(resolved, { recursive: true, force: true }); });
  const file = path.join(directory, 'fantasy.json'); fs.writeFileSync(file, JSON.stringify({ a: player('Ara'), b: player('Bora') }));
  const options = { worldHour: () => 12, onError: () => {} }, context = { session: 'frontier', publicSession: false, peers: ['a', 'b'] };
  const store = new FantasyStore(file, options); assert.equal(store.loadError, undefined);
  assert.equal(store.realmRequest('a', { domain: 'economy', command: { type: 'sync' } }, context).error, undefined);
  const shop = store.realmState('a', context).economy.shops.find(shop => shop.building === 'market')!, lot = shop.lots.find(lot => lot.item === 'potion')!;
  assert.equal(store.realmRequest('a', { domain: 'economy', command: { type: 'shopBuy', building: 'market', item: lot.item, count: 1, revision: shop.revision, lot: lot.id } }, context).error, undefined);
  const restored = new FantasyStore(file, options); assert.equal(restored.loadError, undefined);
  assert.equal(restored.profile('a').character!.inventory.potion, 1);
  assert.equal(restored.realmState('b', context).economy.shops.find(shop => shop.building === 'market')!.lots.find(lot => lot.item === 'potion')?.count, FANTASY_FRONTIER_SUPPLIES.potion - 1);
});

test('undiscovered frontier dungeon identities never enter public charts, merchant offers or quest boards', () => {
  const ids = new Set(FANTASY_FRONTIER_DUNGEONS.map(site => site.id));
  assert.ok(!FANTASY_MAPS.some(map => map.dungeon && ids.has(map.dungeon)));
  assert.ok(!FANTASY_QUESTS.some(quest => quest.objective?.type === 'dungeon' && ids.has(quest.objective.site)));
  for (const road of ['hearth', 'dawnport', 'frontier-rainforest']) for (let day = 0; day < 24; day++) {
    assert.ok(fantasyMapMerchantStock(road, day).every(lot => !lot.item.startsWith('map-dungeon-frontier-')), `${road}: ${day}`);
  }
});
