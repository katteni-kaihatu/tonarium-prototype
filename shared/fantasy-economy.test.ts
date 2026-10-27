import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { createFantasyGear, fantasyEquipGear, validFantasyGear } from './fantasy-equipment.ts';
import { applyFantasyEconomyCommand, closeFantasyEconomyTrades, fantasyEconomyLogText, fantasyEconomyShopQuote, fantasyEconomyState, isFantasyEconomyCommand, newFantasyEconomyLedger, validFantasyEconomyLedger, type FantasyEconomyCommand } from './fantasy-economy.ts';
import type { FantasyProfile } from './fantasy.ts';

let serial = 0;
function person(name = '여행자'): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name, source: 'human', gender: 'female' }, () => .5).profile;
  const c = p.character!; c.hour = 12; c.gold = 1000; c.inventory = { herb: 20, ore: 10, meal: 2 }; c.foodLots = [{ id: `food-${name}`, item: 'meal', count: 2, createdAt: 5 }]; return p;
}
function setup() { return { ledger: newFantasyEconomyLedger(), profiles: new Map([['a', person('아라')], ['b', person('보라')], ['outsider', person('차라')]]) }; }
function step(s: ReturnType<typeof setup>, actor: string, command: FantasyEconomyCommand, hour = 12, peers = ['a', 'b']) {
  const result = applyFantasyEconomyCommand(s.ledger, s.profiles, actor, command, { hour, peers, token: `qa-${serial++}` });
  if (!result.error) { assert.ok(validFantasyEconomyLedger(result.ledger), 'Generated ledger must validate'); s.ledger = result.ledger; s.profiles = result.profiles; }
  return result;
}
function open(s: ReturnType<typeof setup>) { assert.equal(step(s, 'a', { type: 'open', peer: 'b' }).error, undefined); return Object.values(s.ledger.trades).find(trade => trade.status === 'open')!; }
function quote(s: ReturnType<typeof setup>, actor = 'a', item = 'herb', hour = 12) {
  return fantasyEconomyShopQuote(fantasyEconomyState(s.ledger, s.profiles, actor, { hour, peers: ['a', 'b'] }), 'market', item)!;
}

test('strict economy commands and saved ledgers reject forged keys, items, counts and prototype records', () => {
  assert.ok(validFantasyEconomyLedger(newFantasyEconomyLedger()));
  assert.ok(isFantasyEconomyCommand({ type: 'open', peer: 'b' }));
  for (const command of [{ type: 'sync', gold: 9 }, { type: 'offer', trade: 'trade-test', revision: 0, gold: -1, items: [] }, { type: 'shopBuy', building: 'market', item: '__proto__', count: 1, revision: 0 }, { type: 'shopBuy', building: 'market', item: 'herb', count: 1.5, revision: 0 }, { type: 'open', peer: 'b', reward: 500 }, { type: 'offer', trade: 'trade-test', revision: 0, gold: 0, items: [{ item: 'herb', count: 1 }, { item: 'herb', count: 1 }] }]) assert.equal(isFantasyEconomyCommand(command), false);
  const s = setup(); step(s, 'a', { type: 'sync' }); const forged = structuredClone(s.ledger) as any; forged.shops['__proto__:market'] = forged.shops['hearth:market']; assert.equal(validFantasyEconomyLedger(forged), false);
  const bad = structuredClone(s.ledger) as any; bad.shops['hearth:market'].lots[0].count = Infinity; assert.equal(validFantasyEconomyLedger(bad), false);
});
test('two players explicitly confirm the same offer revision before atomic gold and item settlement', () => {
  const s = setup(), trade = open(s);
  step(s, 'a', { type: 'offer', trade: trade.id, revision: 0, gold: 100, items: [{ item: 'herb', count: 3 }] });
  step(s, 'b', { type: 'offer', trade: trade.id, revision: 1, gold: 25, items: [{ item: 'ore', count: 2 }] });
  const before = structuredClone(s.profiles);
  step(s, 'a', { type: 'confirm', trade: trade.id, revision: 2 }); assert.deepEqual(s.profiles, before);
  step(s, 'b', { type: 'confirm', trade: trade.id, revision: 2 });
  assert.equal(s.profiles.get('a')!.character!.gold, 925); assert.equal(s.profiles.get('b')!.character!.gold, 1075);
  assert.equal(s.profiles.get('a')!.character!.inventory.herb, 17); assert.equal(s.profiles.get('b')!.character!.inventory.herb, 23);
  assert.equal(s.profiles.get('a')!.character!.inventory.ore, 12); assert.equal(s.profiles.get('b')!.character!.inventory.ore, 8);
  assert.equal(s.ledger.trades[trade.id].status, 'completed');
  const after = structuredClone(s.profiles); assert.equal(step(s, 'b', { type: 'confirm', trade: trade.id, revision: 2 }).error, 'expired'); assert.deepEqual(s.profiles, after);
});
test('changing either offer clears both approvals and stale terms cannot settle', () => {
  const s = setup(), trade = open(s); step(s, 'a', { type: 'confirm', trade: trade.id, revision: 0 });
  assert.ok(s.ledger.trades[trade.id].offers[0].confirmed);
  step(s, 'b', { type: 'offer', trade: trade.id, revision: 0, gold: 5, items: [] });
  assert.ok(s.ledger.trades[trade.id].offers.every(offer => !offer.confirmed));
  assert.equal(step(s, 'a', { type: 'confirm', trade: trade.id, revision: 0 }).error, 'stale');
  assert.equal(s.profiles.get('a')!.character!.gold, 1000);
});
test('unescrowed offers never remove inventory and cancellation, expiry and restart preserve belongings', () => {
  const s = setup(), trade = open(s), before = structuredClone(s.profiles);
  step(s, 'a', { type: 'offer', trade: trade.id, revision: 0, gold: 100, items: [{ item: 'herb', count: 2 }] }); assert.deepEqual(s.profiles, before);
  const closed = closeFantasyEconomyTrades(s.ledger); assert.equal(closed.trades[trade.id].status, 'cancelled'); assert.deepEqual(s.profiles, before);
  assert.equal(step(s, 'a', { type: 'confirm', trade: trade.id, revision: 1 }, 13).error, 'expired'); assert.deepEqual(s.profiles, before);
  step(s, 'a', { type: 'sync' }, 13); assert.equal(s.ledger.trades[trade.id].status, 'cancelled');
});
test('a consumed or equipped offered item invalidates settlement with no partial gold or item transfer', () => {
  const s = setup(), trade = open(s);
  step(s, 'a', { type: 'offer', trade: trade.id, revision: 0, gold: 100, items: [{ item: 'herb', count: 20 }] });
  step(s, 'a', { type: 'confirm', trade: trade.id, revision: 1 }); s.profiles.get('a')!.character!.inventory.herb = 0;
  const before = structuredClone(s.profiles); assert.equal(step(s, 'b', { type: 'confirm', trade: trade.id, revision: 1 }).error, 'changed-goods'); assert.deepEqual(s.profiles, before);
});
test('same-session, same-place, current-life and idle conditions are revalidated for both participants', () => {
  for (const change of [(s: ReturnType<typeof setup>) => { s.profiles.get('b')!.character!.location = 'greenwood'; }, (s: ReturnType<typeof setup>) => { s.profiles.get('b')!.generation = 2; }, (s: ReturnType<typeof setup>) => { s.profiles.get('b')!.death = { location: 'hearth', hour: 12, cause: 'test' }; }, (s: ReturnType<typeof setup>) => { s.profiles.get('b')!.event = 'test'; }]) {
    const s = setup(), trade = open(s); change(s); const before = structuredClone(s.profiles); assert.equal(step(s, 'a', { type: 'confirm', trade: trade.id, revision: 0 }).error, 'expired'); assert.deepEqual(s.profiles, before);
  }
  const s = setup(); assert.equal(step(s, 'a', { type: 'open', peer: 'outsider' }).error, 'unavailable');
  const trade = open(s); assert.equal(step(s, 'outsider', { type: 'confirm', trade: trade.id, revision: 0 }, 12, ['a', 'b', 'outsider']).error, 'unavailable');
});
test('exact food lot ages and crafted gear attributes survive direct trading and new IDs avoid collisions', () => {
  const s = setup(), a = s.profiles.get('a')!.character!; a.inventory['steel-sword'] = 1;
  const gear = createFantasyGear(a, 'steel-sword', () => .9, 'starsteel-ingot', 'ruby')!; const original = structuredClone(gear), trade = open(s);
  step(s, 'a', { type: 'offer', trade: trade.id, revision: 0, gold: 0, items: [{ item: 'meal', count: 1 }, { item: 'steel-sword', count: 1, instance: gear.id }] });
  step(s, 'a', { type: 'confirm', trade: trade.id, revision: 1 }); step(s, 'b', { type: 'confirm', trade: trade.id, revision: 1 });
  const b = s.profiles.get('b')!.character!, received = b.gear!.find(g => g.item === 'steel-sword')!;
  assert.notEqual(received.id, original.id); assert.deepEqual({ ...received, id: original.id }, original); assert.ok(validFantasyGear(b));
  assert.ok(b.foodLots.some(lot => lot.item === 'meal' && lot.createdAt === 5 && lot.id.startsWith('food-exchange-')));
  assert.equal(a.inventory['steel-sword'], 1); assert.equal(s.profiles.get('a')!.character!.inventory['steel-sword'], 0);
});
test('worn and unspecified individual equipment cannot be substituted in a trade', () => {
  const s = setup(), c = s.profiles.get('a')!.character!; c.inventory['steel-sword'] = 1;
  const gear = createFantasyGear(c, 'steel-sword', () => .5)!; const trade = open(s);
  assert.equal(step(s, 'a', { type: 'offer', trade: trade.id, revision: 0, gold: 0, items: [{ item: 'steel-sword', count: 1 }] }).error, 'equipped');
  fantasyEquipGear(c, 'steel-sword', gear.id);
  assert.equal(step(s, 'a', { type: 'offer', trade: trade.id, revision: 0, gold: 0, items: [{ item: 'steel-sword', count: 1, instance: gear.id }] }).error, 'equipped');
});
test('an offer cannot count one item twice across plain and individual selections', () => {
  const s = setup(), c = s.profiles.get('a')!.character!; c.inventory['steel-sword'] = 1; const gear = createFantasyGear(c, 'steel-sword', () => .5)!, trade = open(s);
  assert.equal(step(s, 'a', { type: 'offer', trade: trade.id, revision: 0, gold: 0, items: [{ item: 'steel-sword', count: 1, instance: gear.id }, { item: 'steel-sword', count: 1 }] }).error, 'equipped');
});
test('food changing condition between offer and confirmation requires a new offer', () => {
  const s = setup(); s.profiles.get('a')!.character!.foodLots[0].createdAt = 0;
  step(s, 'a', { type: 'open', peer: 'b' }, 15.5); const trade = Object.values(s.ledger.trades)[0]; step(s, 'a', { type: 'offer', trade: trade.id, revision: 0, gold: 0, items: [{ item: 'meal', count: 1 }] }, 15.5);
  assert.equal(step(s, 'a', { type: 'confirm', trade: trade.id, revision: 1 }, 16).error, 'changed-goods');
});
test('shared original shop inventory is finite, concurrent stale purchases fail and global time restocks once', () => {
  const s = setup(), initial = quote(s), beforeGold = s.profiles.get('a')!.character!.gold;
  assert.ok(initial.count > 0); step(s, 'a', { type: 'shopBuy', building: 'market', item: 'herb', count: initial.count, revision: initial.revision });
  assert.equal(quote(s).count, 0); assert.equal(quote(s, 'b').count, 0);
  const bBefore = structuredClone(s.profiles.get('b')); assert.equal(step(s, 'b', { type: 'shopBuy', building: 'market', item: 'herb', count: 1, revision: initial.revision }).error, 'stale'); assert.deepEqual(s.profiles.get('b'), bBefore);
  assert.equal(step(s, 'a', { type: 'shopBuy', building: 'market', item: 'herb', count: 1, revision: quote(s).revision }).error, 'stock');
  assert.equal(s.profiles.get('a')!.character!.gold, beforeGold - initial.unitPrice * initial.count);
  step(s, 'a', { type: 'sync' }, 18); assert.equal(quote(s, 'a', 'herb', 18).count, initial.count);
  const rev = s.ledger.revision; step(s, 'a', { type: 'sync' }, 18); assert.equal(s.ledger.revision, rev);
});
test('each settlement and facility has independent stock, and buying from nonexistent buildings is impossible', () => {
  const s = setup(), initial = quote(s); step(s, 'a', { type: 'shopBuy', building: 'market', item: 'herb', count: 1, revision: initial.revision });
  s.profiles.get('b')!.character!.location = 'suncourt'; assert.equal(quote(s, 'b').count, initial.count);
  assert.equal(step(s, 'a', { type: 'shopBuy', building: 'blacksmith', item: 'herb', count: 1, revision: 0 }).error, 'unavailable');
  const before = structuredClone(s.profiles); assert.equal(step(s, 'a', { type: 'shopBuy', building: 'market', item: 'elder-dragon-scale', count: 1, revision: quote(s).revision }).error, 'stock'); assert.deepEqual(s.profiles, before);
});
test('stock demand raises purchase quotes and excess supply never creates a profitable round trip', () => {
  const s = setup(), initial = quote(s); step(s, 'a', { type: 'shopBuy', building: 'market', item: 'herb', count: 1, revision: initial.revision }); assert.ok(quote(s).unitPrice >= initial.unitPrice);
  const afterBuy = s.profiles.get('a')!.character!.gold, next = quote(s); step(s, 'a', { type: 'shopSell', building: 'market', item: 'herb', count: 1, revision: next.revision });
  assert.ok(s.profiles.get('a')!.character!.gold < 1000); assert.ok(s.profiles.get('a')!.character!.gold >= afterBuy);
});
test('selling food adds a finite resale batch without refreshing its age, buying it preserves that age', () => {
  const s = setup(); step(s, 'a', { type: 'sync' });
  const sh = fantasyEconomyState(s.ledger, s.profiles, 'a', { hour: 12, peers: ['a', 'b'] }).shops.find(shop => shop.building === 'market')!;
  step(s, 'a', { type: 'shopSell', building: 'market', item: 'meal', quality: 'fresh', count: 1, revision: sh.revision });
  const lot = quote(s, 'b', 'meal'), resale = fantasyEconomyState(s.ledger, s.profiles, 'b', { hour: 12, peers: ['a', 'b'] }).shops.find(shop => shop.building === 'market')!.lots.find(lot => lot.item === 'meal' && lot.id.startsWith('resale-'))!;
  step(s, 'b', { type: 'shopBuy', building: 'market', item: 'meal', lot: resale.id, count: 1, revision: lot.revision });
  assert.ok(s.profiles.get('b')!.character!.foodLots.some(f => f.id.startsWith('food-exchange-') && f.createdAt === 5));
});
test('individual crafted equipment survives shop resale and cannot be bought twice', () => {
  const s = setup(), c = s.profiles.get('a')!.character!; c.inventory['steel-sword'] = 1; const original = structuredClone(createFantasyGear(c, 'steel-sword', () => .9, 'starsteel-ingot', 'ruby')!);
  step(s, 'a', { type: 'shopSell', building: 'market', item: 'steel-sword', instance: original.id, count: 1, revision: quote(s).revision });
  const market = fantasyEconomyState(s.ledger, s.profiles, 'b', { hour: 12, peers: ['a', 'b'] }).shops.find(shop => shop.building === 'market')!, lot = market.lots.find(lot => lot.id.startsWith('resale-'))!;
  s.profiles.get('b')!.character!.gold = 10000; step(s, 'b', { type: 'shopBuy', building: 'market', item: lot.item, lot: lot.id, count: 1, revision: market.revision });
  const received = s.profiles.get('b')!.character!.gear!.find(g => g.item === original.item)!; assert.deepEqual({ ...received, id: original.id }, original);
  assert.equal(step(s, 'a', { type: 'shopBuy', building: 'market', item: lot.item, lot: lot.id, count: 1, revision: quote(s).revision }).error, 'stock');
});
test('state discloses only nearby authorized peers and explicitly offered goods, never hidden inventories', () => {
  const s = setup(), trade = open(s); s.profiles.get('b')!.character!.inventory['void-chimera-prism'] = 9;
  const visible = fantasyEconomyState(s.ledger, s.profiles, 'a', { hour: 12, peers: ['a', 'b'] }); assert.deepEqual(visible.peers.map(p => p.id), ['b']); assert.equal(JSON.stringify(visible).includes('void-chimera-prism'), false);
  const outsider = fantasyEconomyState(s.ledger, s.profiles, 'outsider', { hour: 12, peers: ['a', 'b', 'outsider'] }); assert.equal(outsider.trades.some(t => t.id === trade.id), false);
});
test('failed validation leaves both input profiles and world ledger untouched', () => {
  const s = setup(), trade = open(s), ledger = structuredClone(s.ledger), profiles = structuredClone(s.profiles);
  assert.equal(step(s, 'a', { type: 'offer', trade: trade.id, revision: 0, gold: 100000, items: [] }).error, 'insufficient-gold'); assert.deepEqual(s.ledger, ledger); assert.deepEqual(s.profiles, profiles);
});
test('a changed bargain or quote never charges a larger price than the player reviewed', () => {
  const s = setup(), original = quote(s), before = structuredClone(s.profiles);
  assert.equal(step(s, 'a', { type: 'shopBuy', building: 'market', item: 'herb', count: 1, revision: original.revision, quotedUnitPrice: original.unitPrice - 1 }).error, 'stale'); assert.deepEqual(s.profiles, before);
});
test('busy traders may cancel and receive no items or gold', () => {
  const s = setup(), trade = open(s), before = structuredClone(s.profiles); s.profiles.get('a')!.event = 'test'; before.get('a')!.event = 'test';
  assert.equal(step(s, 'a', { type: 'cancel', trade: trade.id, revision: trade.revision }).error, undefined); assert.equal(s.ledger.trades[trade.id].status, 'cancelled'); assert.deepEqual(s.profiles, before);
});
test('commerce journal entries localize item names and exchange outcomes in all three languages', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) { assert.ok(fantasyEconomyLogText('상점에서 herb ×2 구매 · -10G', locale)); assert.ok(fantasyEconomyLogText('아라와 물품 교환을 마쳤습니다.', locale)); }
  assert.match(fantasyEconomyLogText('상점에서 herb ×2 구매 · -10G', 'en'), /^Bought/); assert.match(fantasyEconomyLogText('상점에 herb ×2 판매 · +4G', 'ja'), /売却/); assert.equal(fantasyEconomyLogText('other', 'en'), 'other');
});
