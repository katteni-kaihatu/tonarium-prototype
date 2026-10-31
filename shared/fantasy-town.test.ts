import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_ITEMS, FANTASY_LOCATIONS, FANTASY_ROUTES } from './fantasy-data.ts';
import { NPC_PUBLIC } from './npc.ts';
import { FANTASY_LIBRARY_BOOKS } from './fantasy-library.ts';
import { FANTASY_FINAL_ISLE_ID } from './fantasy-isle-access.ts';
import {
  FANTASY_LIBRARY_HOLDINGS, FANTASY_MAPS, FANTASY_SETTLEMENTS, canAcquireJob, canBuyItem, canTradeItem,
  fantasyBuildings, fantasyBuildingStock, fantasyFrontierLocations, fantasyKnownLocations, fantasyLibraryHoldings,
} from './fantasy-town.ts';

test('profession teachers require the right NPC, region and an actual local building', () => {
  const learner = { location: 'hearth', job: 'unassigned' };
  assert.ok(canAcquireJob(learner, 'cook', 'npc', 'rin'));
  assert.ok(canAcquireJob(learner, 'merchant', 'npc', 'rin'));
  assert.ok(!canAcquireJob(learner, 'blacksmith', 'npc', 'rin'));
  assert.ok(!canAcquireJob(learner, 'blacksmith', 'npc', 'borin'));
  assert.ok(canAcquireJob({ ...learner, location: 'emberhall' }, 'blacksmith', 'npc', 'borin'));
  for (const job of ['mage', 'alchemist']) assert.ok(canAcquireJob({ ...learner, location: 'mooncity' }, job, 'npc', 'eris'));
  assert.ok(!canAcquireJob(learner, 'cook', 'npc', 'unknown-npc'));
  assert.ok(!canAcquireJob({ ...learner, location: 'sunmeadow' }, 'cook', 'npc', 'rin'));
});

test('guilds teach ordinary work while an explicit GM request can teach crime professions', () => {
  const learner = { location: 'hearth', job: 'unassigned' };
  assert.ok(canAcquireJob(learner, 'cook', 'guild'));
  assert.ok(canAcquireJob({ ...learner, location: 'emberhall' }, 'cook', 'guild'));
  assert.ok(!canAcquireJob({ ...learner, location: 'tidehaven' }, 'cook', 'guild'));
  for (const job of ['thief', 'smuggler', 'assassin', 'bandit', 'spy', 'crimeboss']) {
    assert.ok(!canAcquireJob(learner, job, 'guild'));
    assert.ok(canAcquireJob({ ...learner, location: 'greenwood' }, job, 'gm'));
    assert.ok(!canAcquireJob(learner, job, 'npc', 'rin'));
  }
  for (const job of ['unassigned', 'missing-job']) assert.ok(!canAcquireJob(learner, job, 'gm'));
  assert.ok(!canAcquireJob({ ...learner, job: 'cook' }, 'cook', 'gm'));
});

test('each settlement has its explicit specialty, independent of legacy service tags', () => {
  assert.deepEqual(fantasyBuildings({ location: 'hearth' }).map(b => b.id), ['market', 'inn', 'restaurant', 'guild', 'library', 'temple']);
  assert.deepEqual(fantasyBuildings({ location: 'emberhall' }).map(b => b.id), ['market', 'blacksmith', 'inn', 'guild', 'merchantGuild']);
  assert.deepEqual(fantasyBuildings({ location: 'mooncity' }).map(b => b.id), ['library', 'alchemist', 'inn', 'temple', 'archaeology', 'tower']);
  assert.deepEqual(fantasyBuildings({ location: 'starspire' }).map(b => b.id), ['tower', 'library']);
  assert.ok(FANTASY_LOCATIONS.find(location => location.id === 'mooncity')!.services.includes('market'));
  assert.ok(!fantasyBuildings({ location: 'mooncity' }).some(b => b.id === 'market'));
  assert.ok(!fantasyBuildings({ location: 'emberhall' }).some(b => b.id === 'library'));
});

test('temples are limited to the two dawn sanctuaries and the covenant shrine', () => {
  const temples = FANTASY_LOCATIONS.flatMap(location => fantasyBuildings({ location: location.id }).filter(building => building.id === 'temple').map(building => ({ location: location.id, name: building.name })));
  assert.deepEqual(temples.map(temple => temple.location).sort(), ['hearth', 'mooncity', 'suncourt']);
  for (const temple of temples) {
    if (temple.location === 'mooncity') assert.deepEqual(temple.name, { ko: '계약의 사당', en: 'Covenant shrine', ja: '契約の祠' });
    else assert.deepEqual(temple.name, { ko: '새벽 신전', en: 'Dawn temple', ja: '夜明けの神殿' });
    for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(temple.name[locale]);
  }
});

test('the starting village now has an inn, while wilderness and unknown locations stay empty', () => {
  assert.equal(FANTASY_SETTLEMENTS.sunmeadow.kind, 'village');
  assert.deepEqual(fantasyBuildings({ location: 'sunmeadow' }).map(building => building.id), ['inn']);
  assert.deepEqual(fantasyLibraryHoldings({ location: 'sunmeadow' }), []);
  for (const location of ['greenwood', 'deepcave', 'mushroom-isle', 'missing-place']) {
    assert.deepEqual(fantasyBuildings({ location }), [], location);
    assert.deepEqual(fantasyLibraryHoldings({ location }), [], location);
  }
});

test('ports provide shipyards without inheriting every city facility', () => {
  for (const location of ['tidehaven', 'dawnport']) {
    assert.deepEqual(new Set(fantasyBuildings({ location }).map(b => b.id)), new Set(['market', 'inn', 'shipyard']));
    assert.ok(!fantasyBuildings({ location }).some(b => b.id === 'restaurant' || b.id === 'guild' || b.id === 'library'));
  }
});

test('NPCs are attached only to their actual home location and building', () => {
  const seen: string[] = [];
  for (const location of FANTASY_LOCATIONS) {
    for (const building of fantasyBuildings({ location: location.id })) {
      for (const id of building.npcIds) {
        const npc = NPC_PUBLIC.find(npc => npc.id === id)!;
        assert.equal(npc.homeLocation, location.id);
        assert.equal(npc.building, building.id);
        seen.push(id);
      }
      for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(building.name[locale]);
    }
  }
  assert.deepEqual(seen.sort(), NPC_PUBLIC.filter(npc => npc.building !== 'residence').map(npc => npc.id).sort());
  assert.deepEqual(fantasyBuildings({ location: 'hearth' }).find(b => b.id === 'inn')!.npcIds, ['rin']);
  assert.deepEqual(fantasyBuildings({ location: 'emberhall' }).find(b => b.id === 'blacksmith')!.npcIds, ['borin']);
  assert.deepEqual(fantasyBuildings({ location: 'mooncity' }).find(b => b.id === 'library')!.npcIds, ['eris', 'mooncity-nalin']);
});

test('libraries share common books while specialty books are only in their owning libraries', () => {
  const shared = ['traveler-guide'];
  for (const location of ['hearth', 'suncourt', 'mooncity', 'starspire']) {
    const holdings = fantasyLibraryHoldings({ location });
    for (const id of shared) assert.ok(holdings.includes(id));
    assert.ok(holdings.every(id => FANTASY_LIBRARY_BOOKS.some(book => book.id === id)));
    assert.deepEqual(holdings, FANTASY_LIBRARY_HOLDINGS[location]);
    assert.equal(new Set(holdings).size, holdings.length);
    assert.ok(!holdings.includes('world-bible'));
  }
  assert.ok(fantasyLibraryHoldings({ location: 'starspire' }).includes('gate-records'));
  assert.ok(!fantasyLibraryHoldings({ location: 'hearth' }).includes('gate-records'));
  assert.ok(fantasyLibraryHoldings({ location: 'mooncity' }).includes('archive-records'));
  assert.ok(!fantasyLibraryHoldings({ location: 'starspire' }).includes('archive-records'));
  assert.deepEqual(fantasyLibraryHoldings({ location: 'emberhall' }), []);
});

test('building and library helpers return independent arrays without modifying registry data', () => {
  const buildings = fantasyBuildings({ location: 'hearth' });
  buildings[0].name.en = 'Changed'; buildings[1].npcIds.push('borin');
  const books = fantasyLibraryHoldings({ location: 'hearth' }); books.push('gate-records');
  assert.equal(fantasyBuildings({ location: 'hearth' })[0].name.en, 'Market');
  assert.ok(!fantasyBuildings({ location: 'hearth' }).some(b => b.npcIds.includes('borin')));
  assert.ok(!fantasyLibraryHoldings({ location: 'hearth' }).includes('gate-records'));
});

test('known locations are exactly valid visited and used-map entries, with duplicates removed', () => {
  assert.deepEqual(fantasyKnownLocations({ visited: ['hearth'], charted: [] }), ['hearth']);
  const known = fantasyKnownLocations({ visited: ['hearth', 'greenwood'], charted: ['mooncity', 'hearth', 'missing-place'] });
  assert.deepEqual(new Set(known), new Set(['hearth', 'greenwood', 'mooncity']));
  assert.ok(!known.includes('ironridge'));
  assert.deepEqual(fantasyKnownLocations({ visited: ['hearth'] } as Parameters<typeof fantasyKnownLocations>[0]), ['hearth']);
});

test('frontier contains only current graph neighbors and never reveals the entire continent', () => {
  const direct = FANTASY_ROUTES.filter(route => route.mode !== 'gate').flatMap(route => route.from === 'hearth' ? [route.to] : route.to === 'hearth' ? [route.from] : []);
  assert.deepEqual(new Set(fantasyFrontierLocations({ location: 'hearth' })), new Set(direct));
  assert.ok(!fantasyFrontierLocations({ location: 'hearth' }).includes('deepcave'));
  assert.ok(!fantasyFrontierLocations({ location: 'hearth' }).includes('mooncity'), 'an undiscovered remote gate does not reveal its destination');
  assert.ok(fantasyFrontierLocations({ location: 'hearth' }).includes('greenwood'));
  assert.ok(fantasyFrontierLocations({ location: 'greenwood' }).includes('hearth'));
  assert.deepEqual(fantasyFrontierLocations({ location: 'missing-place' }), []);
});

test('local maps cover settled lands but exclude the uncharted continent and story-earned island', () => {
  const assigned = FANTASY_MAPS.flatMap(map => map.locationIds);
  assert.deepEqual(new Set(assigned), new Set(FANTASY_LOCATIONS.filter(place => place.land !== 'frontier' && place.id !== FANTASY_FINAL_ISLE_ID).map(place => place.id)));
  for (const map of FANTASY_MAPS) {
    assert.ok(map.price > 0);
    assert.ok(map.locationIds.every(id => FANTASY_LOCATIONS.some(location => location.id === id)));
    assert.equal(new Set(map.locationIds).size, map.locationIds.length);
    if (!map.legacy) assert.ok(map.locationIds.length <= 3);
    for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(map.name[locale] && map.description[locale]);
  }
  const character = { visited: ['hearth'], charted: [], inventory: { 'map-noctis': 1 } };
  assert.deepEqual(fantasyKnownLocations(character), ['hearth']);
  const charted = FANTASY_MAPS.find(map => map.item === 'map-noctis')!.locationIds;
  assert.ok(fantasyKnownLocations({ visited: ['hearth'], charted }).includes('mooncity'));
  assert.ok(!fantasyKnownLocations({ visited: ['hearth'], charted }).includes('deepcave'));
});

test('shops expose only their local building stock, including specialized shops without a market', () => {
  const mooncity = { location: 'mooncity' };
  assert.ok(canBuyItem(mooncity, 'potion'));
  assert.ok(canBuyItem(mooncity, 'crystal'));
  assert.ok(!canBuyItem(mooncity, 'ore'));
  assert.ok(!canBuyItem(mooncity, 'map-noctis'));
  assert.deepEqual(fantasyBuildingStock(mooncity, 'market'), []);
  const stock = fantasyBuildingStock(mooncity, 'alchemist');
  for (const id of ['potion', 'antidote', 'crystal']) assert.ok(stock.includes(id));
  assert.ok(!stock.includes('blade'));
  assert.ok(canTradeItem(mooncity, 'potion'));
  assert.ok(canBuyItem({ location: 'sunmeadow' }, 'meal'));
  assert.ok(!canBuyItem({ location: 'hearth' }, 'missing-item'));
});

test('markets sell ordinary goods and local charts while rare items and legacy charts stay unavailable', () => {
  const market = fantasyBuildingStock({ location: 'hearth' }, 'market');
  for (const id of ['herb', 'bread', 'ore']) assert.ok(market.includes(id));
  for (const item of FANTASY_ITEMS.filter(item => ['artifact', 'relic', 'elixir'].includes(item.category ?? ''))) assert.ok(!market.includes(item.id));
  for (const map of FANTASY_MAPS.filter(map => map.legacy)) assert.ok(!market.includes(map.item));
  assert.ok(market.includes('map-hearth-fields'));
  assert.ok(!market.includes('map-sylvara-coast'));
  const shipyard = fantasyBuildingStock({ location: 'dawnport' }, 'shipyard');
  for (const map of FANTASY_MAPS.filter(map => !map.legacy && map.soldAt?.includes('dawnport'))) assert.ok(shipyard.includes(map.item));
  assert.ok(shipyard.includes('repair-plank'));
  assert.deepEqual(fantasyBuildingStock({ location: 'starspire' }, 'inn'), []);
  const smith = fantasyBuildingStock({ location: 'emberhall' }, 'blacksmith');
  for (const id of ['ore', 'ingot', 'blade']) assert.ok(smith.includes(id));
  assert.ok(!smith.includes('potion'));
});
