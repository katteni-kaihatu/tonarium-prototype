import test from 'node:test';
import assert from 'node:assert/strict';
import { newFantasyProfile, applyFantasyAction, fantasyStats } from './fantasy-engine.ts';
import { newFantasyPropertyLedger, applyFantasyPropertyCommand, applyFantasyPropertyUse, validFantasyPropertyLedger, fantasyPropertyState, reconcileFantasyProperties, type FantasyPropertyCommand, type FantasyPropertyChange } from './fantasy-property.ts';
import { advanceFantasyProperties, fantasyPropertyCanUse, applyFantasyPropertyImprovement } from './fantasy-property-extensions.ts';
import type { FantasyProfile } from './fantasy.ts';

const home = 'hearth-residence', farm = 'hearth-farmland', shop = 'hearth-commercial';
function person(name: string): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name }, () => .5).profile;
  Object.assign(p.character!, { gold: 5000, hour: 25, location: 'hearth' }); p.character!.inventory = { wood: 100, ore: 100, herb: 100 }; return p;
}
function fixture(plot = home) { return applyFantasyPropertyCommand(newFantasyPropertyLedger(), { a: person('Alice'), b: person('Bob'), c: person('Cara') }, 'a', { type: 'buy', plot, revision: 0, requestId: 'buy' }, 25); }
let sequence = 0;
function act(s: FantasyPropertyChange, actor: string, type: string, plot = home, extra: Record<string, unknown> = {}, at = 25) {
  const result = applyFantasyPropertyCommand(s.ledger, s.profiles, actor, { type, plot, revision: s.ledger.plots[plot].revision, requestId: `request-${++sequence}`, ...extra } as FantasyPropertyCommand, at);
  assert.equal(result.error, undefined, `${type}: ${result.error}`); assert.equal(validFantasyPropertyLedger(result.ledger), true, type); return result;
}
function tick(s: FantasyPropertyChange, at: number) { const r = advanceFantasyProperties(s.ledger, s.profiles, at); assert.equal(validFantasyPropertyLedger(r.ledger), true); return r; }
const totalGold = (s: FantasyPropertyChange) => Object.values(s.profiles).reduce((sum, p) => sum + p.character!.gold, 0);

test('legacy property ledgers migrate lazily without accepting malformed extension fields', () => {
  const ledger = newFantasyPropertyLedger(); assert.equal(validFantasyPropertyLedger(ledger), true);
  const s = fixture(); assert.equal(s.ledger.plots[home].extension!.level, 0);
  for (const mutate of [(x: any) => x.level = 4, (x: any) => x.taxDue = -1, (x: any) => x.extra = true, (x: any) => x.shares = [{ user: 'b', generation: 1, name: 'Bob', percent: 100 }]]) {
    const copy = structuredClone(s.ledger); mutate(copy.plots[home].extension); assert.equal(validFantasyPropertyLedger(copy), false);
  }
});
test('lease offer requires the named tenant consent and transfers the exact prepaid rent once', () => {
  let s = fixture(); const sum = totalGold(s); s = act(s, 'a', 'leaseOffer', home, { target: 'Bob', rent: 5, days: 3 });
  assert.equal(fantasyPropertyCanUse(s.ledger, s.profiles, 'b', home, 25), false);
  const forged = applyFantasyPropertyCommand(s.ledger, s.profiles, 'c', { type: 'leaseAccept', plot: home, revision: s.ledger.plots[home].revision, requestId: 'forge' }, 25);
  assert.equal(forged.error, 'consent');
  s = act(s, 'b', 'leaseAccept'); assert.equal(s.profiles.b.character!.gold, 4985); assert.equal(totalGold(s), sum);
  assert.equal(fantasyPropertyCanUse(s.ledger, s.profiles, 'b', home, 25), true); assert.equal(fantasyPropertyCanUse(s.ledger, s.profiles, 'a', home, 25), false);
  const earlyEviction = applyFantasyPropertyCommand(s.ledger, s.profiles, 'a', { type: 'leaseEnd', plot: home, revision: s.ledger.plots[home].revision, requestId: 'evict' }, 26);
  assert.equal(earlyEviction.error, 'occupied');
  s = tick(s, 97); assert.equal(s.ledger.plots[home].extension!.lease, undefined); assert.equal(fantasyPropertyCanUse(s.ledger, s.profiles, 'b', home, 97), false);
});
test('a valid prepaid tenancy survives the landlord death but does not pass to a new tenant life', () => {
  let s = act(fixture(), 'a', 'leaseOffer', home, { target: 'Bob', rent: 5, days: 3 }); s = act(s, 'b', 'leaseAccept');
  s.profiles.a.death = { location: 'greenwood', hour: 26, cause: 'test' }; s = reconcileFantasyProperties(s.ledger, s.profiles);
  assert.equal(s.ledger.plots[home].owner!.estate, true); assert.equal(fantasyPropertyCanUse(s.ledger, s.profiles, 'b', home, 26), true);
  const auction = applyFantasyPropertyCommand(s.ledger, s.profiles, 'c', { type: 'auctionStart', plot: home, revision: s.ledger.plots[home].revision, requestId: 'estate', price: 100 }, 26); assert.equal(auction.error, 'occupied');
  s.profiles.b.generation = 2; s = reconcileFantasyProperties(s.ledger, s.profiles); assert.equal(s.ledger.plots[home].extension!.lease, undefined);
});
test('coownership is consensual, adds use rights, and sale needs every owner approval', () => {
  let s = act(fixture(), 'a', 'shareOffer', home, { target: 'Bob', percent: 30 });
  assert.equal(fantasyPropertyState(s.ledger, s.profiles, 'b').plots[0].management!.shareOffer!.forMe, true);
  s = act(s, 'b', 'shareAccept'); assert.equal(fantasyPropertyCanUse(s.ledger, s.profiles, 'b', home, 25), true);
  s = act(s, 'a', 'list', home, { price: 1000 }); assert.equal(s.ledger.plots[home].listing, null);
  s = act(s, 'b', 'approveSale'); assert.equal(s.ledger.plots[home].listing!.price, 1000);
  const before = totalGold(s), a = s.profiles.a.character!.gold, b = s.profiles.b.character!.gold;
  s = act(s, 'c', 'buy'); assert.equal(totalGold(s), before); assert.equal(s.profiles.a.character!.gold, a + 700); assert.equal(s.profiles.b.character!.gold, b + 300);
  assert.deepEqual(s.ledger.plots[home].extension!.shares, []); assert.equal(s.ledger.plots[home].owner!.user, 'c');
});
test('construction spends exact materials and time before granting a bounded completion benefit', () => {
  let s = fixture(farm); s = act(s, 'a', 'build', farm, { blueprint: 'irrigation' });
  assert.equal(s.profiles.a.character!.inventory.wood, 95); assert.equal(s.profiles.a.character!.inventory.ore, 99); assert.equal(s.ledger.plots[farm].extension!.level, 0);
  s = tick(s, 28.99); assert.equal(s.ledger.plots[farm].extension!.level, 0);
  s = tick(s, 29); assert.equal(s.ledger.plots[farm].extension!.level, 1);
  const base = applyFantasyPropertyUse(s.profiles.a, farm).profile, herbs = base.character!.inventory.herb;
  const improved = applyFantasyPropertyImprovement(base, farm, s.ledger); assert.equal(improved.profile.character!.inventory.herb, herbs + 1);
  assert.equal(applyFantasyPropertyImprovement(improved.profile, farm, s.ledger).changed, false);
  const failed = structuredClone(base); failed.log.push({ id: failed.log.at(-1)!.id + 1, hour: 29, kind: 'failure', text: '行動を完了できなかった。property:missing-material' });
  assert.equal(applyFantasyPropertyImprovement(failed, farm, s.ledger).changed, false);
  const invalid = applyFantasyPropertyCommand(s.ledger, s.profiles, 'a', { type: 'build', plot: farm, revision: s.ledger.plots[farm].revision, requestId: 'wrong', blueprint: 'bedroom' }, 29); assert.equal(invalid.error, 'invalid');
});
test('daily tax is capped without confiscation; paying restores use while tenant is protected', () => {
  let s = tick(fixture(), 49); assert.equal(s.ledger.plots[home].extension!.taxDue, 2); assert.equal(fantasyPropertyCanUse(s.ledger, s.profiles, 'a', home, 49), false);
  s = act(s, 'a', 'payTax', home, {}, 49); assert.equal(fantasyPropertyCanUse(s.ledger, s.profiles, 'a', home, 49), true);
  s = tick(s, 1_000_000); assert.equal(s.ledger.plots[home].owner!.user, 'a'); assert.ok(s.ledger.plots[home].extension!.taxDue <= 10_000);
});
test('auctions escrow bids, refund an outbid player, conserve money and settle once after restart', () => {
  let s = act(fixture(), 'a', 'auctionStart', home, { price: 100 }); const before = totalGold(s), old = structuredClone(s.profiles);
  s = act(s, 'b', 'bid', home, { amount: 100 }); assert.equal(totalGold(s), before - 100);
  s = act(s, 'c', 'bid', home, { amount: 120 }); assert.equal(s.profiles.b.character!.gold, old.b.character!.gold); assert.equal(totalGold(s), before - 120);
  const bytes = JSON.stringify(s.ledger); s.ledger = JSON.parse(bytes); const original = structuredClone(s.profiles), input = s, snapshot = structuredClone(s); s = tick(s, 49);
  assert.deepEqual(input, snapshot);
  assert.equal(s.ledger.plots[home].owner!.user, 'c'); assert.equal(totalGold(s), before - 2); assert.equal(original.c.character!.propertyTitles, undefined);
  assert.equal(tick(s, 49).changed, false);
});
test('estate auction proceeds stay with the old life and never credit a replacement character', () => {
  let s = fixture(); s.profiles.a.generation = 2; s = reconcileFantasyProperties(s.ledger, s.profiles);
  s = act(s, 'b', 'auctionStart', home, { price: 100 }); s = act(s, 'c', 'bid', home, { amount: 100 }); const before = s.profiles.a.character!.gold;
  s = tick(s, 49); assert.equal(s.profiles.a.character!.gold, before); assert.equal(s.ledger.plots[home].extension!.credits[0].estate, true); assert.equal(s.ledger.plots[home].extension!.credits[0].amount, 100);
});
test('automated work consumes finite stocked inputs and prepaid wages, never runs indefinitely or grants practice', () => {
  let s = fixture(shop); const herbs = s.profiles.a.character!.inventory.herb; const xp = structuredClone(s.profiles.a.character!.jobXp);
  s = act(s, 'a', 'autoStock', shop, { count: 3 }); assert.equal(s.profiles.a.character!.inventory.herb, herbs - 3);
  s = act(s, 'a', 'autoToggle', shop, { enabled: true }); const before = s.profiles.a.character!.gold; s = tick(s, 37);
  assert.equal(s.ledger.plots[shop].extension!.automation!.stock, 0); assert.equal(s.ledger.plots[shop].extension!.automation!.wages, 0); assert.ok(s.profiles.a.character!.gold > before); assert.deepEqual(s.profiles.a.character!.jobXp, xp);
  const earned = s.profiles.a.character!.gold; s = tick(s, 45); assert.equal(s.profiles.a.character!.gold, earned);
});
test('bargaining produces a private reputation based quote and requires explicit purchase approval', () => {
  const base = { ledger: newFantasyPropertyLedger(), profiles: { a: person('Alice'), b: person('Bob') }, changed: false };
  base.profiles.a.character!.reputation = { lands: { aurelia: 100 }, regions: { hearth: 100 }, towns: { hearth: 100 } };
  let s = act(base, 'a', 'bargain'); assert.equal(s.ledger.plots[home].owner, null); assert.equal(s.profiles.a.character!.gold, 5000);
  const quote = fantasyPropertyState(s.ledger, s.profiles, 'a').plots[0].management!.bargain!; assert.equal(quote.target, 75);
  assert.equal(fantasyPropertyState(s.ledger, s.profiles, 'b').plots[0].management!.bargain, undefined);
  s = act(s, 'a', 'acceptBargain'); assert.equal(s.profiles.a.character!.gold, 5000 - quote.price); assert.equal(s.ledger.plots[home].owner!.user, 'a');
});
test('new operations reject extra fields and repeat request IDs without repeating payments', () => {
  let s = fixture(); const cmd = { type: 'leaseOffer', plot: home, revision: s.ledger.plots[home].revision, requestId: 'lease-once', target: 'Bob', rent: 1, days: 1 } as const;
  s = applyFantasyPropertyCommand(s.ledger, s.profiles, 'a', cmd, 25); assert.equal(s.error, undefined);
  const duplicate = applyFantasyPropertyCommand(s.ledger, s.profiles, 'a', cmd, 25); assert.equal(duplicate.changed, false); assert.equal(duplicate.error, undefined);
  assert.equal(applyFantasyPropertyCommand(s.ledger, s.profiles, 'a', { ...cmd, type: 'payTax', extra: true } as any, 25).error, 'invalid');
  const p = s.profiles.a, before = structuredClone(s); s = act(s, 'b', 'leaseAccept'); assert.deepEqual(before.profiles.a, p);
  const maximum = fantasyStats(p.character!); assert.equal(applyFantasyPropertyImprovement(p, home, before.ledger, maximum).changed, false);
});
test('a repeated higher bid from the same buyer escrows only the final total and rejects stale competitors', () => {
  let s = act(fixture(), 'a', 'auctionStart', home, { price: 100 }); s = act(s, 'b', 'bid', home, { amount: 100 });
  const revision = s.ledger.plots[home].revision; s = act(s, 'b', 'bid', home, { amount: 120 }); assert.equal(s.profiles.b.character!.gold, 4880);
  const stale = applyFantasyPropertyCommand(s.ledger, s.profiles, 'c', { type: 'bid', plot: home, revision, requestId: 'stale-bid', amount: 200 }, 25);
  assert.equal(stale.error, 'stale'); assert.equal(stale.profiles.c.character!.gold, 5000);
  s = tick(s, 49); assert.equal(s.ledger.plots[home].owner!.user, 'b'); assert.equal(s.profiles.b.character!.gold, 4880);
});
test('a deceased bidder is not replaced by a new life and their escrow remains an estate credit', () => {
  let s = act(fixture(), 'a', 'auctionStart', home, { price: 100 }); s = act(s, 'b', 'bid', home, { amount: 100 });
  s.profiles.b.generation = 2; const before = s.profiles.b.character!.gold; s = tick(s, 49);
  assert.equal(s.ledger.plots[home].owner!.user, 'a'); assert.equal(s.profiles.b.character!.gold, before);
  assert.equal(s.ledger.plots[home].extension!.credits.find(c => c.user === 'b')!.estate, true);
});
test('unused automated supplies and wages can be recovered after pausing without duplication', () => {
  let s = fixture(shop), gold = s.profiles.a.character!.gold, herb = s.profiles.a.character!.inventory.herb;
  s = act(s, 'a', 'autoStock', shop, { count: 2 }); s = act(s, 'a', 'autoToggle', shop, { enabled: true });
  const blocked = applyFantasyPropertyCommand(s.ledger, s.profiles, 'a', { type: 'autoWithdraw', plot: shop, revision: s.ledger.plots[shop].revision, requestId: 'active-stock', count: 2 }, 25); assert.equal(blocked.error, 'occupied');
  s = act(s, 'a', 'autoToggle', shop, { enabled: false }); s = act(s, 'a', 'autoWithdraw', shop, { count: 2 });
  assert.equal(s.profiles.a.character!.gold, gold); assert.equal(s.profiles.a.character!.inventory.herb, herb); assert.equal(s.ledger.plots[shop].extension!.automation!.stock, 0);
});
test('forged approval identities, unbacked wages and impossible discount quotes fail saved-ledger validation', () => {
  let s = act(fixture(), 'a', 'shareOffer', home, { target: 'Bob', percent: 30 }); s = act(s, 'b', 'shareAccept'); s = act(s, 'a', 'list', home, { price: 100 });
  const bad = structuredClone(s.ledger); bad.plots[home].extension!.sale!.approved.push('forged'); assert.equal(validFantasyPropertyLedger(bad), false);
  const stocked = act(fixture(shop), 'a', 'autoStock', shop, { count: 1 }); stocked.ledger.plots[shop].extension!.automation!.wages = 100; assert.equal(validFantasyPropertyLedger(stocked.ledger), false);
  const quoted = act({ ledger: newFantasyPropertyLedger(), profiles: { a: person('Alice') }, changed: false }, 'a', 'bargain'); quoted.ledger.plots[home].extension!.bargain!.price = 1; assert.equal(validFantasyPropertyLedger(quoted.ledger), false);
});
test('offline operation and auction settlement logs use the world settlement time without advancing personal snapshots', () => {
  let business = act(fixture(shop), 'a', 'autoStock', shop, { count: 1 }); business = act(business, 'a', 'autoToggle', shop, { enabled: true }); business = tick(business, 29);
  assert.equal(business.profiles.a.character!.hour, 25); assert.equal(business.profiles.a.log.findLast(e => e.text.startsWith('property:credit:'))!.hour, 29);
  let farming = act(fixture(farm), 'a', 'autoStock', farm, { count: 1 }); farming = act(farming, 'a', 'autoToggle', farm, { enabled: true }); farming = tick(farming, 29);
  assert.equal(farming.profiles.a.character!.hour, 25); assert.equal(farming.profiles.a.log.findLast(e => e.text.startsWith('property:autoHarvest:'))!.hour, 29);
  let auction = act(fixture(), 'a', 'auctionStart', home, { price: 100 }); auction = act(auction, 'b', 'bid', home, { amount: 100 }); auction = tick(auction, 49);
  assert.equal(auction.profiles.a.character!.hour, 25); assert.equal(auction.profiles.b.character!.hour, 25);
  assert.equal(auction.profiles.a.log.findLast(e => e.text.startsWith('property:credit:'))!.hour, 49); assert.equal(auction.profiles.b.log.findLast(e => e.text.startsWith('property:auctionWon:'))!.hour, 49);
});
test('legacy ownership begins taxation at its first extension migration instead of charging pre-update years', () => {
  let legacy = fixture(); delete legacy.ledger.plots[home].extension;
  assert.equal(validFantasyPropertyLedger(legacy.ledger), true); assert.equal(legacy.ledger.plots[home].owner!.acquiredAt, 25);
  legacy = tick(legacy, 250_000);
  assert.equal(legacy.ledger.plots[home].extension!.taxAt, 250_000); assert.equal(legacy.ledger.plots[home].extension!.taxDue, 0); assert.equal(legacy.ledger.plots[home].extension!.condition, 100);
  assert.equal(legacy.ledger.plots[home].owner!.acquiredAt, 25); assert.equal(fantasyPropertyCanUse(legacy.ledger, legacy.profiles, 'a', home, 250_000), true);
  legacy = tick(legacy, 250_024); assert.equal(legacy.ledger.plots[home].extension!.taxDue, 2); assert.equal(legacy.ledger.plots[home].extension!.condition, 99);
  const fresh = tick(fixture(), 49); assert.equal(fresh.ledger.plots[home].extension!.taxDue, 2);
});
