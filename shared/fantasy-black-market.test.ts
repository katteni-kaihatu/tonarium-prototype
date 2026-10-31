import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { NPC_PUBLIC } from './npc.ts';
import { advanceFantasyBlackMarket, applyFantasyBlackMarket, applyFantasyBlackMarketToken, fantasyBlackMarketActionValid, fantasyBlackMarketClue, fantasyBlackMarketOpening, fantasyBlackMarketState, newFantasyBlackMarketLedger, validFantasyBlackMarketClues, validFantasyBlackMarketLedger } from './fantasy-black-market.ts';
import { fantasyJobPathDiscovered } from './fantasy-job-discovery.ts';
import { fantasyJobPathError } from './fantasy-job-paths.ts';
import { FANTASY_ITEMS } from './fantasy-data.ts';

const realm = 'same-realm';
function setup() {
  const resident = NPC_PUBLIC.find(npc => npc.building === 'residence')!;
  const make = (name: string) => { const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name }, () => .99).profile; p.character!.location = resident.homeLocation; p.character!.gold = 10000; p.character!.reputation = { lands: {}, regions: {}, towns: { [resident.homeLocation]: 15 } }; return p; };
  const profiles = new Map([['one', make('一人目')], ['two', make('二人目')]]);
  const location = resident.homeLocation;
  let day = 0; while (!fantasyBlackMarketOpening(location, day * 24 + 20, realm).open) day++;
  return { profiles, resident, hour: day * 24 + 20, ledger: newFantasyBlackMarketLedger() };
}
function known() {
  const s = setup(); let result = applyFantasyBlackMarket(s.ledger, s.profiles, 'one', { type: 'blackMarketLearn', npc: s.resident.id }, s.hour, realm);
  result = applyFantasyBlackMarket(result.ledger, result.profiles, 'two', { type: 'blackMarketLearn', npc: s.resident.id }, s.hour, realm);
  return { ...s, ...result };
}
test('only an actual local resident trusts a locally reputable traveler with the hidden market clue', () => {
  const s = setup(), c = s.profiles.get('one')!.character!;
  assert.equal(fantasyBlackMarketClue(c, s.resident.id).eligible, true);
  c.reputation!.towns[c.location] = 14; assert.equal(fantasyBlackMarketClue(c, s.resident.id).eligible, false);
  c.reputation!.towns[c.location] = 15; assert.equal(fantasyBlackMarketClue(c, 'rin').eligible, false);
  c.location = 'starspire'; assert.equal(fantasyBlackMarketClue(c, s.resident.id).eligible, false);
  assert.equal(fantasyBlackMarketState(s.ledger, c, s.hour, realm).known, false);
});
test('a daytime clue starts no fake auction and a later authoritative sync opens the actual night market', () => {
  const s = setup();
  const learned = applyFantasyBlackMarket(s.ledger, s.profiles, 'one', { type: 'blackMarketLearn', npc: s.resident.id }, s.hour - 8, realm, ['one']);
  assert.equal(Object.keys(learned.ledger.markets).length, 0);
  const night = applyFantasyBlackMarket(learned.ledger, learned.profiles, 'one', { type: 'sync' }, s.hour, realm, ['one']);
  assert.equal(night.error, undefined); assert.equal(Object.keys(night.ledger.markets).length, 1);
  assert.equal(fantasyBlackMarketActionValid({ type: 'sync', spoof: true }), false);
});
test('night openings and generated lots are deterministic, survive reload and remain in the same opening after midnight', () => {
  const s = known(), c = s.profiles.get('one')!.character!, state = fantasyBlackMarketState(s.ledger, c, s.hour, realm);
  assert.equal(state.open, true); assert.ok(state.market!.lots.length >= 3 && state.market!.lots.length <= 5);
  assert.equal(fantasyBlackMarketOpening(c.location, s.hour + 4.5, realm).id, state.market!.id);
  assert.deepEqual(JSON.parse(JSON.stringify(s.ledger)), s.ledger); assert.equal(validFantasyBlackMarketLedger(s.ledger), true);
  assert.equal(fantasyBlackMarketState(s.ledger, c, s.hour, 'other-realm').market, undefined);
  assert.equal(fantasyBlackMarketOpening(c.location, s.hour - 1, realm).open, false);
});
test('player bids escrow actual gold, reject own bid spam and refund the prior living bidder once', () => {
  const s = known(), market = Object.values(s.ledger.markets)[0], lot = market.lots[0], original = structuredClone(s.ledger);
  const first = applyFantasyBlackMarket(s.ledger, s.profiles, 'one', { type: 'blackMarketBid', market: market.id, lot: lot.id, amount: 200, revision: s.ledger.revision }, s.hour, realm);
  assert.equal(first.error, undefined); assert.equal(first.profiles.get('one')!.character!.gold, 9800); assert.deepEqual(s.ledger, original);
  const spam = applyFantasyBlackMarket(first.ledger, first.profiles, 'one', { type: 'blackMarketBid', market: market.id, lot: lot.id, amount: 220, revision: first.ledger.revision }, s.hour, realm);
  assert.ok(spam.error); assert.equal(spam.changed, false);
  const second = applyFantasyBlackMarket(first.ledger, first.profiles, 'two', { type: 'blackMarketBid', market: market.id, lot: lot.id, amount: 250, revision: first.ledger.revision }, s.hour, realm);
  assert.equal(second.error, undefined); assert.equal(second.profiles.get('one')!.character!.gold, 10000); assert.equal(second.profiles.get('two')!.character!.gold, 9750);
  assert.ok(applyFantasyBlackMarket(second.ledger, second.profiles, 'one', { type: 'blackMarketBid', market: market.id, lot: lot.id, amount: 300, revision: 0 }, s.hour, realm).error);
});
test('NPC bids really outbid, refund and stop at finite willingness; offline settlement holds won goods until claimed', () => {
  const s = known(), market = Object.values(s.ledger.markets)[0], lot = market.lots[0];
  const offered = applyFantasyBlackMarket(s.ledger, s.profiles, 'one', { type: 'blackMarketBid', market: market.id, lot: lot.id, amount: lot.reserve, revision: s.ledger.revision }, s.hour, realm);
  const competed = advanceFantasyBlackMarket(offered.ledger, offered.profiles, market.closesAt, realm);
  const final = competed.ledger.markets[market.id].lots[0]; assert.equal(final.settled, true); assert.ok(final.history.some(entry => entry.bidder.type === 'npc'));
  assert.equal(competed.profiles.get('one')!.character!.gold, 10000); assert.ok(final.currentBid <= Math.max(...final.competitors.map(npc => npc.limit)));
  const fresh = known(), m = Object.values(fresh.ledger.markets)[0], l = m.lots[0];
  const bid = applyFantasyBlackMarket(fresh.ledger, fresh.profiles, 'one', { type: 'blackMarketBid', market: m.id, lot: l.id, amount: 5000, revision: fresh.ledger.revision }, fresh.hour, realm);
  const closed = advanceFantasyBlackMarket(JSON.parse(JSON.stringify(bid.ledger)), bid.profiles, m.closesAt + 100, realm);
  assert.equal(closed.profiles.get('one')!.character!.inventory[l.item] ?? 0, 0);
  const claim = applyFantasyBlackMarket(closed.ledger, closed.profiles, 'one', { type: 'blackMarketClaim', market: m.id, lot: l.id, revision: closed.ledger.revision }, m.closesAt + 100, realm);
  assert.equal(claim.error, undefined); assert.equal(claim.profiles.get('one')!.character!.inventory[l.item], l.count);
  assert.ok(applyFantasyBlackMarket(claim.ledger, claim.profiles, 'one', { type: 'blackMarketClaim', market: m.id, lot: l.id, revision: claim.ledger.revision }, m.closesAt + 100, realm).error);
});
test('death and a new generation cannot inherit escrow refunds or claim an older winner’s lot', () => {
  const s = known(), market = Object.values(s.ledger.markets)[0], lot = market.lots[0];
  const placed = applyFantasyBlackMarket(s.ledger, s.profiles, 'one', { type: 'blackMarketBid', market: market.id, lot: lot.id, amount: lot.reserve, revision: s.ledger.revision }, s.hour, realm);
  placed.profiles.get('one')!.generation = 2; placed.profiles.get('one')!.character!.gold = 0;
  const done = advanceFantasyBlackMarket(placed.ledger, placed.profiles, market.closesAt, realm);
  assert.equal(done.profiles.get('one')!.character!.gold, 0);
  const fresh = known(), m = Object.values(fresh.ledger.markets)[0], l = m.lots[0];
  const won = applyFantasyBlackMarket(fresh.ledger, fresh.profiles, 'one', { type: 'blackMarketBid', market: m.id, lot: l.id, amount: 5000, revision: fresh.ledger.revision }, fresh.hour, realm);
  const closed = advanceFantasyBlackMarket(won.ledger, won.profiles, m.closesAt, realm); closed.profiles.get('one')!.generation = 2;
  assert.ok(applyFantasyBlackMarket(closed.ledger, closed.profiles, 'one', { type: 'blackMarketClaim', market: m.id, lot: l.id, revision: closed.ledger.revision }, m.closesAt, realm).error);
});
test('a temporarily downed bidder keeps ownership, receives outbid refunds and can collect after waking', () => {
  const s = known(), market = Object.values(s.ledger.markets)[0], lot = market.lots[0];
  const offered = applyFantasyBlackMarket(s.ledger, s.profiles, 'one', { type: 'blackMarketBid', market: market.id, lot: lot.id, amount: lot.reserve, revision: s.ledger.revision }, s.hour, realm);
  const bidder = offered.profiles.get('one')!.character!; bidder.hp = 0; bidder.downed = { since: s.hour, expiresAt: s.hour + 6 };
  const outbid = advanceFantasyBlackMarket(offered.ledger, offered.profiles, market.closesAt, realm, []);
  assert.equal(outbid.profiles.get('one')!.character!.gold, 10000);

  const fresh = known(), m = Object.values(fresh.ledger.markets)[0], wonLot = m.lots[0];
  const winning = applyFantasyBlackMarket(fresh.ledger, fresh.profiles, 'one', { type: 'blackMarketBid', market: m.id, lot: wonLot.id, amount: 5000, revision: fresh.ledger.revision }, fresh.hour, realm);
  const winner = winning.profiles.get('one')!.character!; winner.hp = 0; winner.downed = { since: fresh.hour, expiresAt: fresh.hour + 6 };
  const later = m.closesAt + 24 * 15;
  const closed = advanceFantasyBlackMarket(winning.ledger, winning.profiles, later, realm, []);
  assert.ok(closed.ledger.markets[m.id], 'temporary unconsciousness must not forfeit escrow during cleanup');
  const state = fantasyBlackMarketState(closed.ledger, closed.profiles.get('one')!.character!, later, realm, { userId: 'one', generation: 1 });
  assert.ok(state.pending.some(market => market.id === m.id)); assert.equal(state.pending.find(market => market.id === m.id)!.lots[0].canClaim, false);
  assert.ok(applyFantasyBlackMarket(closed.ledger, closed.profiles, 'one', { type: 'blackMarketClaim', market: m.id, lot: wonLot.id, revision: closed.ledger.revision }, later, realm, ['one']).error);
  const awakened = closed.profiles.get('one')!.character!; awakened.hp = 1; delete awakened.downed;
  const claimed = applyFantasyBlackMarket(closed.ledger, closed.profiles, 'one', { type: 'blackMarketClaim', market: m.id, lot: wonLot.id, revision: closed.ledger.revision }, later, realm, ['one']);
  assert.equal(claimed.error, undefined); assert.equal(claimed.profiles.get('one')!.character!.inventory[wonLot.item], wonLot.count);
});
test('an overweight claim keeps the lot in escrow and malformed or prototype-looking requests never mutate state', () => {
  const s = known(), m = Object.values(s.ledger.markets)[0], lot = m.lots[0];
  const placed = applyFantasyBlackMarket(s.ledger, s.profiles, 'one', { type: 'blackMarketBid', market: m.id, lot: lot.id, amount: 5000, revision: s.ledger.revision }, s.hour, realm);
  const closed = advanceFantasyBlackMarket(placed.ledger, placed.profiles, m.closesAt, realm); closed.profiles.get('one')!.character!.inventory.ore = 10000;
  const claim = applyFantasyBlackMarket(closed.ledger, closed.profiles, 'one', { type: 'blackMarketClaim', market: m.id, lot: lot.id, revision: closed.ledger.revision }, m.closesAt, realm);
  assert.ok(claim.error); assert.equal(claim.changed, false); assert.equal(claim.ledger.markets[m.id].lots[0].claimed, false);
  assert.equal(fantasyBlackMarketActionValid({ type: 'blackMarketBid', market: m.id, lot: lot.id, amount: NaN, revision: 0 }), false);
  assert.ok(applyFantasyBlackMarket(closed.ledger, closed.profiles, 'one', { type: 'blackMarketClaim', market: '__proto__', lot: 'lot-1', revision: closed.ledger.revision }, m.closesAt, realm).error);
  const malformed = structuredClone(closed.ledger); malformed.markets[m.id].lots[0].competitors[0].limit = 1_000_000;
  assert.equal(validFantasyBlackMarketLedger(malformed), false); assert.equal(validFantasyBlackMarketLedger(closed.ledger), true);
});
test('saved lots stay valid when a later content update adds another weapon to the auction pool', () => {
  const s = known(), saved = JSON.parse(JSON.stringify(s.ledger));
  FANTASY_ITEMS.push({ id: 'future-auction-blade', name: '未来の剣', description: '後日の品。', price: 100, equipment: { slot: 'weapon', stats: { strength: 1 } } });
  try { assert.equal(validFantasyBlackMarketLedger(saved), true); }
  finally { FANTASY_ITEMS.splice(FANTASY_ITEMS.findIndex(item => item.id === 'future-auction-blade'), 1); }
});
test('clue tokens teach actual knowledge once without bypassing proficiency or the star vigil', () => {
  const c = setup().profiles.get('one')!.character!; c.job = 'mage'; c.inventory['black-rune-reach'] = 2;
  assert.equal(applyFantasyBlackMarketToken(c, 'black-rune-reach'), true); const once = structuredClone(c);
  assert.equal(applyFantasyBlackMarketToken(c, 'black-rune-reach'), false); assert.deepEqual(c, once);
  c.job = 'warrior'; c.inventory['black-study-warrior-greatsword'] = 1;
  assert.equal(applyFantasyBlackMarketToken(c, 'black-study-warrior-greatsword'), true);
  assert.equal(fantasyJobPathDiscovered(c, 'warrior-greatsword'), true); assert.ok(fantasyJobPathError(c, 'warrior-greatsword'));
  assert.equal(validFantasyBlackMarketClues(c), true);
  c.job = 'mage'; c.inventory['black-study-mage-star'] = 1; assert.equal(applyFantasyBlackMarketToken(c, 'black-study-mage-star'), false); assert.equal(fantasyJobPathDiscovered(c, 'mage-star'), false);
});
test('rare study relics remain around three percent across actual deterministic opening lots', () => {
  const s = setup(), c = s.profiles.get('one')!.character!; c.blackMarketClues = [c.location]; let ledger = s.ledger, lots = 0, rare = 0, openings = 0;
  for (let day = 0; day < 1200; day++) {
    const hour = day * 24 + 20; if (!fantasyBlackMarketOpening(c.location, hour, realm).open) continue;
    const result = advanceFantasyBlackMarket(ledger, s.profiles, hour, realm); ledger = result.ledger;
    const market = ledger.markets[fantasyBlackMarketOpening(c.location, hour, realm).id]; openings++; lots += market.lots.length; rare += market.lots.filter(lot => lot.item.startsWith('black-study-')).length;
  }
  assert.ok(openings >= 250 && openings <= 350); assert.ok(rare / lots > .015 && rare / lots < .05, `${rare}/${lots}`);
});
test('old completed markets are pruned before the cap blocks a new opening while living winners stay in escrow', () => {
  const s = setup(), c = s.profiles.get('one')!.character!; c.blackMarketClues = [c.location];
  const full = newFantasyBlackMarketLedger(); let kept = '';
  for (let index = 0; index < 512; index++) {
    const oldRealm = `old-${index}`; let hour = 20; while (!fantasyBlackMarketOpening(c.location, hour, oldRealm).open) hour += 24;
    let result = advanceFantasyBlackMarket(newFantasyBlackMarketLedger(), s.profiles, hour, oldRealm, ['one']); const market = Object.values(result.ledger.markets)[0];
    if (index === 0) { kept = market.id; result = applyFantasyBlackMarket(result.ledger, result.profiles, 'one', { type: 'blackMarketBid', market: market.id, lot: market.lots[0].id, amount: 5000, revision: result.ledger.revision }, hour, oldRealm, ['one']); }
    result = advanceFantasyBlackMarket(result.ledger, result.profiles, market.closesAt, oldRealm, ['one']); Object.assign(full.markets, result.ledger.markets);
  }
  assert.equal(Object.keys(full.markets).length, 512);
  let nextHour = 1000 * 24 + 20; while (!fantasyBlackMarketOpening(c.location, nextHour, realm).open) nextHour += 24;
  const next = advanceFantasyBlackMarket(full, s.profiles, nextHour, realm, ['one']);
  assert.ok(next.ledger.markets[fantasyBlackMarketOpening(c.location, nextHour, realm).id]); assert.ok(next.ledger.markets[kept]);
  assert.equal(Object.keys(next.ledger.markets).length, 2); assert.equal(validFantasyBlackMarketLedger(next.ledger), true);
});
test('opening generation follows the scoped realm participants while refunds can still reach an offline former bidder', () => {
  const s = setup(); for (const profile of s.profiles.values()) profile.character!.blackMarketClues = [profile.character!.location];
  const none = advanceFantasyBlackMarket(s.ledger, s.profiles, s.hour, realm, []); assert.equal(Object.keys(none.ledger.markets).length, 0);
  const opened = advanceFantasyBlackMarket(s.ledger, s.profiles, s.hour, realm, ['one']); const market = Object.values(opened.ledger.markets)[0], lot = market.lots[0];
  const bid = applyFantasyBlackMarket(opened.ledger, opened.profiles, 'one', { type: 'blackMarketBid', market: market.id, lot: lot.id, amount: lot.reserve, revision: opened.ledger.revision }, s.hour, realm, ['one']);
  const advanced = advanceFantasyBlackMarket(bid.ledger, bid.profiles, market.closesAt, realm, ['two']); assert.equal(advanced.profiles.get('one')!.character!.gold, 10000);
  assert.ok(applyFantasyBlackMarket(opened.ledger, opened.profiles, 'two', { type: 'blackMarketBid', market: market.id, lot: lot.id, amount: 5000, revision: opened.ledger.revision }, s.hour, realm, ['one']).error);
});
