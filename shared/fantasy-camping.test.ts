import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FantasyProfile } from './fantasy.ts';
import { advanceFantasyWorld, applyFantasyAction, fantasyStats, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { fantasyCampingKit, fantasyCampLogText } from './fantasy-camping.ts';
import { FANTASY_TRAVEL_GOODS, FANTASY_TRAVEL_RECIPES } from './fantasy-travel-goods.ts';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_RECIPES } from './fantasy-data.ts';
import { FANTASY_LODGINGS, foodDetails, foodMeta, reconcileFoodLots } from './fantasy-life.ts';
import { validFantasyItemState } from './fantasy-effects.ts';
import { canBuyItem, fantasyBuildingStock, fantasyBuildings, fantasyCanCraft, fantasyCraftFacility } from './fantasy-town.ts';
import { fantasyPrice } from './fantasy-reputation.ts';
import { NPC_PUBLIC } from './npc.ts';
import { npcFacilityFacts, npcFacilityKnowledge, npcFacilityReply } from '../server/npc-facility.ts';
import { npcBreaksFourthWall } from '../server/npc-speech.ts';
import { NpcChat } from '../server/npc.ts';
import { FantasyStore } from '../server/fantasy-store.ts';
import { fantasyEconomyShopQuote, fantasyEconomyState, newFantasyEconomyLedger } from './fantasy-economy.ts';
import { fantasyEnvironmentPenalty, fantasyLightStrength } from './fantasy-environment.ts';

function player(inventory: Record<string, number> = {}, location = 'greenwood'): FantasyProfile {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Camp tester', gender: 'female', source: 'human' }, () => .5).profile;
  Object.assign(profile.character!, { location, birthBonuses: {}, hour: 8, lifeStartedAt: 8, hp: 40, mp: 10, gold: 200,
    fatigue: 70, hunger: 10, outfit: 'rain-cape', inventory: { 'rain-cape': 1, ...inventory }, foodLots: [], visited: [...new Set(['hearth', location])] });
  profile.log = [];
  return profile;
}
function sequence(...values: number[]) { let index = 0; return () => values[index++] ?? .999; }
function camp(profile: FantasyProfile, ...rolls: number[]) {
  const original = structuredClone(profile), result = applyFantasyAction(profile, { type: 'rest' }, sequence(...rolls));
  assert.equal(result.error, undefined); assert.equal(result.changed, true); assert.deepEqual(profile, original);
  return result.profile;
}
const fullKit = { 'bedroll': 1, 'fur-bedroll': 1, 'camp-tarp': 1, 'camp-stakes': 1, 'sentinel-bell': 1, 'everglow-lantern': 1, 'pocket-hearth': 1 };

test('travel goods and recipes register once with real ingredients, professions, facilities and complete localizations', () => {
  assert.equal(FANTASY_TRAVEL_GOODS.length, 24); assert.equal(FANTASY_TRAVEL_RECIPES.length, 11);
  assert.equal(new Set(FANTASY_TRAVEL_GOODS.map(item => item.id)).size, 24);
  assert.equal(new Set(FANTASY_TRAVEL_RECIPES.map(recipe => recipe.id)).size, 11);
  assert.equal(FANTASY_TRAVEL_GOODS.filter(item => item.food).length, 12);
  for (const item of FANTASY_TRAVEL_GOODS) {
    assert.equal(FANTASY_ITEMS.filter(value => value.id === item.id).length, 1, item.id);
    assert.ok(item.price > 0);
    for (const locale of ['ko', 'en', 'ja'] as const) assert.ok(item.names![locale] && item.descriptions![locale], `${item.id}/${locale}`);
    if (item.food) assert.deepEqual(foodMeta(item.id), { item: item.id, ...item.food });
  }
  for (const recipe of FANTASY_TRAVEL_RECIPES) {
    assert.equal(FANTASY_RECIPES.filter(value => value.id === recipe.id).length, 1, recipe.id);
    assert.ok(FANTASY_JOBS.some(job => job.id === recipe.job));
    assert.ok(FANTASY_ITEMS.some(item => item.id === recipe.output));
    for (const [id, count] of Object.entries(recipe.inputs)) { assert.ok(FANTASY_ITEMS.some(item => item.id === id), id); assert.ok(Number.isInteger(count) && count > 0); }
    const facility = fantasyCraftFacility(recipe.job), place = FANTASY_LOCATIONS.find(place => fantasyBuildings({ location: place.id }).some(building => building.id === facility));
    assert.ok(place, `${recipe.id}: actual workshop`);
    const profile = player({}, place.id); profile.character!.job = recipe.job;
    assert.equal(fantasyCanCraft(profile.character!, recipe), true, recipe.id);
  }
});

test('camping selects the best bedroll, adds one hearth bonus and never stacks duplicate equipment or lights', () => {
  assert.equal(fantasyCampingKit(player().character!).fatigue, 15);
  assert.equal(fantasyCampingKit(player({ bedroll: 2 }).character!).fatigue, 25);
  assert.equal(fantasyCampingKit(player({ bedroll: 2, 'fur-bedroll': 3 }).character!).fatigue, 33);
  const equipped = fantasyCampingKit(player(fullKit).character!);
  assert.equal(equipped.fatigue, 38); assert.equal(equipped.mp, .2); assert.equal(equipped.hp, .2);
  assert.ok(equipped.fatigue < FANTASY_LODGINGS[0].fatigueRecovery);
  const duplicates = Object.fromEntries(Object.keys(fullKit).map(id => [id, 9]));
  assert.deepEqual(fantasyCampingKit(player(duplicates).character!), equipped);
  assert.equal(fantasyCampingKit(player({ ...fullKit, lantern: 3 }).character!).riskMultiplier, equipped.riskMultiplier);
  assert.ok(equipped.riskMultiplier > 0 && equipped.riskMultiplier < 1);
  const normal = camp(player(), .999), protectedCamp = camp(player(fullKit), .999);
  assert.equal(normal.character!.fatigue, 55); assert.equal(protectedCamp.character!.fatigue, 32);
  assert.equal(normal.character!.hp, 60); assert.equal(protectedCamp.character!.hp, 60);
  assert.equal(normal.character!.mp, 18); assert.equal(protectedCamp.character!.mp, 20);
  assert.equal(protectedCamp.character!.hunger, 26); assert.equal(protectedCamp.character!.hour, 16);
});

test('rental bedroll and lantern improve basic camping but remain weaker than bought and crafted gear', () => {
  const bare = player(), rental = player({ 'guild-loan-bedroll': 1, 'guild-loan-lantern': 1 }), bought = player({ bedroll: 1, lantern: 1 }), crafted = player({ 'fur-bedroll': 1, 'everglow-lantern': 1 });
  const campers = [bare, rental, bought, crafted];
  assert.deepEqual(campers.map(p => fantasyCampingKit(p.character!).fatigue), [15, 20, 25, 33]);
  assert.deepEqual(campers.map(p => fantasyLightStrength(p.character!.inventory)), [0, 1, 2, 3]);
  const risks = campers.map(p => fantasyCampingKit(p.character!).riskMultiplier);
  assert.deepEqual(risks, [1, .97, .9, .8]);
  for (const p of campers) p.character!.hour = 20;
  const penalties = campers.map(p => fantasyEnvironmentPenalty(p.character!));
  for (let i = 1; i < penalties.length; i++) assert.equal(penalties[i - 1] - penalties[i], 1);
  assert.deepEqual(campers.map(p => camp(p, .999).character!.fatigue), [55, 50, 45, 37]);
});

test('camp defenses reduce incident probability without making the camp completely safe', () => {
  const bare = camp(player(), .1, .5), geared = camp(player(fullKit), .1, .5);
  assert.ok(bare.character!.hp < geared.character!.hp);
  const stillAttacked = camp(player(fullKit), .01, .5);
  assert.ok(stillAttacked.character!.hp < geared.character!.hp, 'even the best reusable kit can be attacked');
  assert.ok(stillAttacked.log.some(log => log.text === '野宿中に小さな襲撃を受けた。'));
});

test('a ward consumes exactly one seal only when the rolled camp incident is an attack', () => {
  const source = player({ 'ward-seal': 3 }), unwarded = camp(player(), 0, .5), blocked = camp(source, 0, .5);
  assert.equal(blocked.character!.inventory['ward-seal'], 2); assert.equal(source.character!.inventory['ward-seal'], 3);
  assert.equal(blocked.character!.hp, 60); assert.ok(unwarded.character!.hp < 60);
  assert.equal(blocked.log.filter(log => log.text === '野営の結界符が襲撃を防ぎ、1枚燃え尽きた。').length, 1);
  const quiet = camp(source, .999), theft = camp(source, 0, 0), noise = camp(source, 0, .99);
  for (const profile of [quiet, theft, noise]) assert.equal(profile.character!.inventory['ward-seal'], 3);
  assert.equal(quiet.character!.gold, 200); assert.ok(theft.character!.gold < 200);
  assert.equal(noise.character!.fatigue, quiet.character!.fatigue + 8);
  assert.equal(camp(player({ 'ward-seal': 1 }), 0, .5).character!.inventory['ward-seal'], 0);
  const exhausted = player({ 'ward-seal': 0 }); assert.ok(camp(exhausted, 0, .5).character!.hp < 60);
});

test('world-clock reservation, partial progress and reload do not consume a ward or apply rest rewards early', t => {
  const profile = player({ ...fullKit, 'ward-seal': 3 });
  let attack: { reserved: FantasyProfile; finished: FantasyProfile } | undefined;
  for (let seed = 1; seed < 100; seed++) {
    const reserved = startFantasyActivity(profile, { type: 'rest' }, 8, () => seed / 100).profile;
    const finished = advanceFantasyWorld(reserved, 16).profile;
    if (finished.character!.inventory['ward-seal'] === 2) { attack = { reserved, finished }; break; }
  }
  assert.ok(attack, 'a deterministic scheduled attack is available');
  assert.equal(attack.reserved.character!.inventory['ward-seal'], 3);
  assert.equal(attack.reserved.character!.hp, 40); assert.equal(attack.reserved.character!.mp, 10); assert.equal(attack.reserved.character!.fatigue, 70);
  const partial = advanceFantasyWorld(attack.reserved, 15.99).profile;
  assert.equal(partial.character!.inventory['ward-seal'], 3); assert.equal(partial.character!.hp, 40); assert.equal(partial.activity!.endsAt, 16);
  const prefix = path.join(os.tmpdir(), 'tonarium-camp-'), dir = fs.mkdtempSync(prefix), file = path.join(dir, 'fantasy.json');
  t.after(() => { if (!path.resolve(dir).startsWith(path.resolve(prefix))) throw Error('Unexpected test directory'); fs.rmSync(dir, { recursive: true, force: true }); });
  fs.writeFileSync(file, JSON.stringify({ camper: partial }));
  const store = new FantasyStore(file, { worldHour: () => 15.99, onError: error => { throw error; } });
  assert.equal(store.profile('camper').character!.inventory['ward-seal'], 3);
  const resumed = advanceFantasyWorld(store.profile('camper'), 16).profile;
  assert.deepEqual(resumed, attack.finished);
  assert.equal(resumed.character!.inventory['ward-seal'], 2); assert.equal(resumed.activity, undefined);
  assert.equal(advanceFantasyWorld(resumed, 16).changed, false);
  assert.equal(advanceFantasyWorld(resumed, 20).profile.character!.inventory['ward-seal'], 2);
});

test('inn rooms ignore camp equipment, incident rolls and wards while retaining stronger recovery', () => {
  for (const room of FANTASY_LODGINGS) {
    const plain = player({}, 'hearth'), geared = player({ ...fullKit, 'ward-seal': 4 }, 'hearth');
    const a = applyFantasyAction(plain, { type: 'lodge', room: room.id }, () => 0), b = applyFantasyAction(geared, { type: 'lodge', room: room.id }, () => 0);
    assert.equal(a.error, undefined); assert.equal(b.error, undefined);
    for (const key of ['hp', 'mp', 'gold', 'fatigue', 'hunger', 'hour'] as const) assert.equal(a.profile.character![key], b.profile.character![key], `${room.id}/${key}`);
    assert.equal(b.profile.character!.inventory['ward-seal'], 4);
    assert.equal(b.profile.log.some(log => /野営|野宿|燃え尽き/.test(log.text)), false);
    assert.equal(b.profile.character!.fatigue, Math.max(0, 70 - room.fatigueRecovery));
  }
});

test('new foods retain per-lot spoilage and stale meals cannot grant their fresh-food buffs', () => {
  const foods = FANTASY_TRAVEL_GOODS.filter(item => item.food);
  for (const item of foods) {
    const profile = player({ [item.id]: 2 }); reconcileFoodLots(profile.character!);
    assert.equal(foodDetails(profile.character!, item.id)!.quality, 'fresh');
    profile.character!.hour = 8 + item.food!.shelfLife * .65;
    assert.equal(foodDetails(profile.character!, item.id)!.quality, 'stale');
    profile.character!.hour = 8 + item.food!.shelfLife + .1;
    assert.equal(foodDetails(profile.character!, item.id)!.quality, 'spoiled');
  }
  for (const item of foods.filter(item => item.use?.effect)) {
    const fresh = player({ [item.id]: 1 }), stale = player({ [item.id]: 1 });
    reconcileFoodLots(fresh.character!); reconcileFoodLots(stale.character!);
    stale.character!.hour += item.food!.shelfLife * .8;
    const a = applyFantasyAction(fresh, { type: 'use', item: item.id }, () => .999), b = applyFantasyAction(stale, { type: 'use', item: item.id }, () => .999);
    assert.equal(a.error, undefined); assert.equal(b.error, undefined);
    assert.ok(a.profile.character!.effects?.some(effect => effect.id === item.use!.effect!.id));
    assert.equal(b.profile.character!.effects?.some(effect => effect.id === item.use!.effect!.id) ?? false, false);
    assert.equal(a.profile.character!.inventory[item.id], 0); assert.equal(b.profile.character!.inventory[item.id], 0);
  }
});

test('food and novelty effects actually apply, remain valid and survive saved-state loading', t => {
  const profiles: Record<string, FantasyProfile> = {};
  for (const item of FANTASY_TRAVEL_GOODS.filter(item => item.use)) {
    const profile = player({ [item.id]: 1 });
    profile.character!.hunger = 80;
    if (item.use?.cure?.includes('frost')) profile.character!.effects = [{ id: 'frost', expiresAt: 12, stats: { agility: -2, strength: -1 }, diceFaces: 'lower' }];
    const result = applyFantasyAction(profile, { type: 'use', item: item.id }, () => .999);
    assert.equal(result.error, undefined, item.id);
    const c = result.profile.character!;
    assert.equal(c.inventory[item.id], 0, item.id); assert.equal(validFantasyItemState(c, FANTASY_ITEMS), true, item.id);
    if (item.use!.hunger) assert.equal(c.hunger, 80 - item.use!.hunger);
    if (item.use!.fatigue) assert.equal(c.fatigue, 70 - item.use!.fatigue);
    if (item.use!.mp) assert.equal(c.mp, Math.min(fantasyStats(c).mp, 10 + item.use!.mp));
    if (item.use!.effect) assert.ok(c.effects!.some(effect => effect.id === item.use!.effect!.id));
    if (item.use!.cure?.includes('frost')) assert.equal(c.effects?.some(effect => effect.id === 'frost') ?? false, false);
    profiles[item.id] = result.profile;
  }
  const duck = player({ 'lucky-duck': 1 }), before = fantasyStats(duck.character!);
  assert.ok(applyFantasyAction(duck, { type: 'use', item: 'lucky-duck' }).error);
  assert.deepEqual(fantasyStats(duck.character!), before); assert.equal(duck.character!.inventory['lucky-duck'], 1);
  const prefix = path.join(os.tmpdir(), 'tonarium-travel-effects-'), dir = fs.mkdtempSync(prefix), file = path.join(dir, 'fantasy.json');
  t.after(() => { if (!path.resolve(dir).startsWith(path.resolve(prefix))) throw Error('Unexpected test directory'); fs.rmSync(dir, { recursive: true, force: true }); });
  fs.writeFileSync(file, JSON.stringify(profiles));
  const store = new FantasyStore(file, { worldHour: () => 8, onError: error => { throw error; } });
  for (const [id, profile] of Object.entries(profiles)) assert.deepEqual(store.profile(id), profile, id);
});

test('markets, restaurants and actual tower staff expose only their real travel-goods stock and current prices', async () => {
  let generated = 0;
  const service = new NpcChat({ fetch: (async () => { generated++; throw Error('No model needed for stock'); }) as typeof fetch });
  const market = fantasyBuildingStock({ location: 'hearth' }, 'market'), tower = fantasyBuildingStock({ location: 'starspire' }, 'tower');
  for (const item of FANTASY_TRAVEL_GOODS) {
    if (item.category === 'magic-tool') { assert.equal(market.includes(item.id), false, item.id); assert.equal(tower.includes(item.id), true, item.id); }
    if (item.food) assert.ok(fantasyBuildingStock({ location: 'hearth' }, 'restaurant').includes(item.id), item.id);
    const npc = NPC_PUBLIC.find(npc => npc.building === (item.category === 'magic-tool' ? 'tower' : item.food ? 'restaurant' : 'market') && fantasyBuildingStock({ location: npc.homeLocation }, npc.building).includes(item.id));
    assert.ok(npc, `${item.id}: real seller`);
    const profile = player({}, npc.homeLocation), c = profile.character!;
    c.bargains = { goods: { location: c.location, discount: .2, expiresAt: 16, nextAt: 12 } };
    const economy = fantasyEconomyState(newFantasyEconomyLedger(), new Map([['tester',profile]]), 'tester', { hour:c.hour,peers:[] });
    const building = fantasyBuildings(c).find(building => building.id === npc.building);
    assert.ok(building);
    const quote = fantasyEconomyShopQuote(economy,building.id,item.id)!;
    assert.ok(quote && quote.count > 0, `${item.id}: current finite shop lot`);
    const dynamicFacts = { hour:c.hour,location:c.location,shops:economy.shops,rumors:[] };
    assert.ok(npcFacilityKnowledge(npc.id, c, dynamicFacts).stock.includes(item.id));
    for (const locale of ['ko', 'en', 'ja'] as const) {
      const query = `${item.names![locale]} 가격 price 値段`;
      const reply: string = npcFacilityReply(locale, npc.id, query, c, undefined, dynamicFacts)!;
      assert.ok(reply.includes(item.names![locale]), `${item.id}/${locale}`);
      assert.ok(reply.includes(`${quote.unitPrice}G`)); assert.match(reply, new RegExp(`(?:^|\\D)${quote.count}(?:개|個|(?=\\s|[,.]))`)); assert.equal(npcBreaksFourthWall(reply), false);
      assert.ok(npcFacilityFacts(npc.id, locale, c, query, dynamicFacts).some(fact => fact.includes(item.names![locale]) && fact.includes(`${quote.unitPrice}G ×${quote.count}`)));
      const response = await service.chat(`${item.id}-${locale}`, { requestId: crypto.randomUUID(), npcId: npc.id, locale, text: query }, { character: c, dynamicFacts });
      assert.equal(response.source, 'canon'); assert.equal(response.error, undefined); assert.ok(response.text.includes(item.names![locale]));
      assert.ok(response.text.includes(`${quote.unitPrice}G`)); assert.match(response.text, new RegExp(`(?:^|\\D)${quote.count}(?:개|個|(?=\\s|[,.]))`));
    }
  }
  for (const id of ['mana-staff', 'sacred-book']) assert.ok(tower.includes(id), `${id}: real selected weapon`);
  assert.equal(generated, 0);
});

test('buying remains authoritative to the current settlement and charges only a real local seller price', () => {
  for (const item of FANTASY_TRAVEL_GOODS.filter(item => item.category === 'magic-tool')) {
    const wrong = player({}, 'hearth'), original = structuredClone(wrong);
    assert.equal(canBuyItem(wrong.character!, item.id), false);
    const failed = applyFantasyAction(wrong, { type: 'buy', item: item.id });
    assert.ok(failed.error); assert.equal(failed.changed, false); assert.deepEqual(failed.profile, original);
    const right = player({}, 'starspire'); right.character!.gold = 500;
    right.character!.bargains = { goods: { location: 'starspire', discount: .2, expiresAt: 16, nextAt: 12 } };
    const purchased = applyFantasyAction(right, { type: 'buy', item: item.id });
    assert.equal(purchased.error, undefined, item.id); assert.equal(purchased.profile.character!.inventory[item.id], 1);
    assert.equal(purchased.profile.character!.gold, 500 - fantasyPrice(right.character!, item.price, 'goods'));
  }
  const wild = player({}, 'greenwood'); assert.ok(applyFantasyAction(wild, { type: 'buy', item: 'bedroll' }).error);
  const seller = NPC_PUBLIC.find(npc => npc.homeLocation === 'hearth' && npc.building === 'market')!;
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const ward = FANTASY_ITEMS.find(item => item.id === 'ward-seal')!;
    const response = npcFacilityReply(locale, seller.id, `${ward.names![locale]} 가격 price 値段`, player({}, 'hearth').character!)!;
    assert.equal(response.includes(`${ward.price}G`), false);
  }
});
