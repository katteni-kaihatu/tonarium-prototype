import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFantasyAction, newFantasyProfile, startFantasyActivity, advanceFantasyWorld } from './fantasy-engine.ts';
import { fantasyDungeonSiteFor, newFantasyDungeonProgress, fantasyDungeonActionError, validFantasyDungeon } from './fantasy-dungeon.ts';
import { applyFantasyInteriorMapAction, fantasyInteriorMapText, fantasyInteriorMapValue, validFantasyInteriorMapCopy, validFantasyInteriorMaps, FANTASY_INTERIOR_MAP_ITEM } from './fantasy-interior-maps.ts';
import { takeFantasyEconomyParcel, deliverFantasyEconomyParcel, validFantasyEconomyParcel, applyFantasyEconomyCommand, newFantasyEconomyLedger, fantasyEconomyState, validFantasyEconomyLedger } from './fantasy-economy.ts';
import { fantasySaleGroups, fantasySell } from './fantasy-sales.ts';
import { fantasyEscrowBagOverflow, validFantasyPendingLoot } from './fantasy-bags.ts';
import { FANTASY_ITEMS } from './fantasy-data.ts';

function player(name = 'Surveyor') {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', name, source: 'human', gender: 'female' }, () => .5).profile, c = p.character!;
  c.hour = 12; c.location = 'oldwatch'; c.visited.push('oldwatch'); c.job = 'scribe'; c.jobXp.scribe = 250;
  c.jobPaths = { scribe: { path: 'scribe-maps', hour: 0 } };
  c.inventory = { 'scribe-paper': 10, 'scribe-ink': 10, linen: 10, lantern: 1 }; c.foodLots = [];
  const progress = newFantasyDungeonProgress(7); progress.revealed = ['entrance']; progress.visited = ['entrance']; progress.inspected = ['entrance'];
  c.dungeon = { active: { site: 'oldwatch', room: 'entrance' }, sites: { oldwatch: progress } };
  return p;
}
function crafted() {
  const result = applyFantasyInteriorMapAction(player(), { type: 'interiorMapCraft', site: 'oldwatch' }, () => .8);
  assert.equal(result.error, undefined); return result.profile;
}
test('only the current cartography path can consume supplies and record a genuine partial seeded interior map', () => {
  const p = player(), c = p.character!, progress = c.dungeon!.sites.oldwatch, site = fantasyDungeonSiteFor(c, 'oldwatch')!;
  const mappedOnly = site.rooms.find(room => room.id !== 'entrance')!.id; progress.revealed.push(mappedOnly);
  const before = structuredClone(p), result = applyFantasyInteriorMapAction(p, { type: 'interiorMapCraft', site: 'oldwatch' }, () => .8);
  assert.equal(result.error, undefined); assert.deepEqual(p, before);
  const target = result.profile.character!, copy = target.interiorMaps![0];
  assert.equal(copy.layoutSeed, 7); assert.deepEqual(copy.rooms, ['entrance']); assert.deepEqual(copy.inspected, ['entrance']);
  assert.equal(copy.author, c.name); assert.equal(target.inventory['scribe-paper'], 8); assert.equal(target.inventory['scribe-ink'], 9); assert.equal(target.inventory.linen, 9);
  assert.equal(target.hour, 15); assert.ok(target.jobXp.scribe > c.jobXp.scribe); assert.ok(validFantasyInteriorMaps(target));
  assert.ok(!JSON.stringify(copy).includes('reward')); assert.ok(!JSON.stringify(copy).includes('trap'));
  for (const path of [undefined, 'scribe-court', 'scribe-rune']) {
    const denied = player(); if (path) denied.character!.jobPaths!.scribe.path = path; else delete denied.character!.jobPaths;
    const original = structuredClone(denied); assert.ok(applyFantasyInteriorMapAction(denied, { type: 'interiorMapCraft', site: 'oldwatch' }).error); assert.deepEqual(denied, original);
  }
});
test('bought map binds an uninitialized layout and reveals topology without personal investigation or reward completion', () => {
  const source = crafted().character!, copy = source.interiorMaps![0], buyer = player('Buyer'), c = buyer.character!; c.hour = 20;
  delete c.dungeon; c.interiorMaps = [structuredClone(copy)]; c.inventory[FANTASY_INTERIOR_MAP_ITEM] = 1;
  const result = applyFantasyInteriorMapAction(buyer, { type: 'interiorMapUse', copy: copy.id }); assert.equal(result.error, undefined);
  const target = result.profile.character!, progress = target.dungeon!.sites.oldwatch;
  assert.equal(progress.layoutSeed, 7); assert.deepEqual(progress.revealed, ['entrance']); assert.deepEqual(progress.visited, []);
  for (const key of ['inspected', 'findings', 'detected', 'disarmed', 'sprung', 'cleared', 'claimed'] as const) assert.deepEqual(progress[key], []);
  assert.equal(target.inventory[FANTASY_INTERIOR_MAP_ITEM], 0); assert.deepEqual(target.interiorMaps, []); assert.ok(validFantasyDungeon(target));
  assert.ok(applyFantasyInteriorMapAction(result.profile, { type: 'interiorMapUse', copy: copy.id }).error);
  assert.ok(validFantasyInteriorMaps(target));
});
test('a map cannot replace a saved layout and same-layout use preserves every existing personal finding', () => {
  const source = crafted().character!, copy = source.interiorMaps![0], buyer = player('Buyer'), c = buyer.character!; c.hour = 20;
  c.interiorMaps = [structuredClone(copy)]; c.inventory[FANTASY_INTERIOR_MAP_ITEM] = 1;
  c.dungeon!.sites.oldwatch.layoutSeed = 9;
  const before = structuredClone(buyer); assert.ok(applyFantasyInteriorMapAction(buyer, { type: 'interiorMapUse', copy: copy.id }).error); assert.deepEqual(buyer, before);
  c.dungeon!.sites.oldwatch.layoutSeed = 7; c.dungeon!.sites.oldwatch.findings = ['entrance'];
  copy.rooms.push(fantasyDungeonSiteFor(c, 'oldwatch')!.rooms.find(room => room.id !== 'entrance')!.id); c.interiorMaps = [structuredClone(copy)];
  const result = applyFantasyInteriorMapAction(buyer, { type: 'interiorMapUse', copy: copy.id }); assert.equal(result.error, undefined);
  assert.deepEqual(result.profile.character!.dungeon!.sites.oldwatch.findings, ['entrance']); assert.deepEqual(result.profile.character!.dungeon!.sites.oldwatch.inspected, ['entrance']);
});
test('map knowledge does not permit retreating past an undefeated guard into rooms never visited', () => {
  const p = player(), c = p.character!, progress = c.dungeon!.sites.oldwatch, site = fantasyDungeonSiteFor(c, 'oldwatch')!;
  const guard = site.rooms.find(room => room.enemy && room.exits.length > 1)!;
  progress.revealed = site.rooms.map(room => room.id); progress.visited = ['entrance', guard.id]; c.dungeon!.active!.room = guard.id;
  const exit = guard.exits.find(id => !progress.visited!.includes(id))!;
  assert.ok(fantasyDungeonActionError(p, { type: 'dungeonMove', room: exit }));
});
test('physical copies travel through parcels and sales with original identity, seed, author and quality', () => {
  const p = crafted(), c = p.character!, copy = structuredClone(c.interiorMaps![0]), recipient = player('Recipient').character!; recipient.hour = 20;
  assert.equal(takeFantasyEconomyParcel(c, { item: FANTASY_INTERIOR_MAP_ITEM, count: 1 }), undefined);
  const parcel = takeFantasyEconomyParcel(c, { item: FANTASY_INTERIOR_MAP_ITEM, count: 1, instance: copy.id })!;
  assert.ok(validFantasyEconomyParcel(parcel)); assert.deepEqual(parcel.interiorMap, copy); assert.equal(c.inventory[FANTASY_INTERIOR_MAP_ITEM], 0);
  assert.ok(deliverFantasyEconomyParcel(recipient, parcel, 1, 'copy-delivery')); assert.deepEqual(recipient.interiorMaps, [copy]);
  const before = structuredClone(recipient); assert.equal(deliverFantasyEconomyParcel(recipient, parcel, 1, 'duplicate'), false); assert.deepEqual(recipient, before);
  delete recipient.dungeon!.active; recipient.location = 'hearth'; const group = fantasySaleGroups(recipient, FANTASY_INTERIOR_MAP_ITEM)[0];
  assert.equal(group.instance, copy.id); assert.equal(group.unitPrice, Math.floor(fantasyInteriorMapValue(copy) / 2));
  assert.ok(fantasySell(recipient, { item: FANTASY_INTERIOR_MAP_ITEM }).error);
  assert.equal(fantasySell(recipient, { item: FANTASY_INTERIOR_MAP_ITEM, instance: copy.id }).error, undefined);
  assert.ok(fantasySell(recipient, { item: FANTASY_INTERIOR_MAP_ITEM, instance: copy.id }).error); assert.ok(validFantasyInteriorMaps(recipient));
});
test('market resale and buyback preserve actual copy metadata and reject repeating stale sale requests', () => {
  let p = crafted(); delete p.character!.dungeon!.active; p.character!.location = 'hearth'; p.character!.gold = 10000;
  let ledger = newFantasyEconomyLedger(), profiles = new Map([['a', p]]); const copy = structuredClone(p.character!.interiorMaps![0]);
  const shop = fantasyEconomyState(ledger, profiles, 'a', { hour: 15, peers: ['a'] }).shops.find(shop => shop.building === 'market')!;
  const command = { type: 'shopSell' as const, building: 'market' as const, item: FANTASY_INTERIOR_MAP_ITEM, count: 1, instance: copy.id, revision: shop.revision };
  const sold = applyFantasyEconomyCommand(ledger, profiles, 'a', command, { hour: 15, peers: ['a'], token: 'map-sale' }); assert.equal(sold.error, undefined);
  ledger = sold.ledger; profiles = sold.profiles; const lot = ledger.shops['hearth:market'].lots.find(lot => lot.interiorMap?.id === copy.id)!;
  assert.deepEqual(lot.interiorMap, copy); assert.ok(validFantasyEconomyLedger(ledger));
  assert.ok(applyFantasyEconomyCommand(ledger, profiles, 'a', command, { hour: 15, peers: ['a'], token: 'map-sale-repeat' }).error);
  const bought = applyFantasyEconomyCommand(ledger, profiles, 'a', { type: 'shopBuy', building: 'market', item: FANTASY_INTERIOR_MAP_ITEM, lot: lot.id, count: 1, revision: ledger.shops['hearth:market'].revision }, { hour: 15, peers: ['a'], token: 'map-buyback' });
  assert.equal(bought.error, undefined); assert.deepEqual(bought.profiles.get('a')!.character!.interiorMaps, [copy]);
});
test('timed recording creates one copy only on completion and retains no output after cancellation', () => {
  const p = player(), started = startFantasyActivity(p, { type: 'interiorMapCraft', site: 'oldwatch' }, 12, () => .8);
  assert.equal(started.error, undefined); assert.equal(started.profile.activity!.endsAt, 15); assert.equal(started.profile.character!.inventory[FANTASY_INTERIOR_MAP_ITEM] ?? 0, 0);
  assert.equal(advanceFantasyWorld(started.profile, 14).profile.character!.inventory[FANTASY_INTERIOR_MAP_ITEM] ?? 0, 0);
  const done = advanceFantasyWorld(started.profile, 15); assert.equal(done.profile.character!.inventory[FANTASY_INTERIOR_MAP_ITEM], 1);
  assert.equal(advanceFantasyWorld(done.profile, 16).profile.character!.inventory[FANTASY_INTERIOR_MAP_ITEM], 1);
  const cancelled = applyFantasyAction(started.profile, { type: 'cancel' }); assert.equal(advanceFantasyWorld(cancelled.profile, 16).profile.character!.inventory[FANTASY_INTERIOR_MAP_ITEM] ?? 0, 0);
});
test('bag overflow and later collection keep physical copy metadata together with its stack count', () => {
  const before = player(); delete before.character!.dungeon!.active;
  const ids = FANTASY_ITEMS.filter(item => item.id !== FANTASY_INTERIOR_MAP_ITEM && !item.food && !item.equipment).slice(0, 24).map(item => item.id);
  before.character!.inventory = Object.fromEntries(ids.map(id => [id, 1])); before.character!.interiorMaps = [];
  const after = structuredClone(before), copy = crafted().character!.interiorMaps![0]; after.character!.hour = 15;
  after.character!.interiorMaps = [copy]; after.character!.inventory[FANTASY_INTERIOR_MAP_ITEM] = 1;
  const stored = fantasyEscrowBagOverflow(before, after), c = stored.character!;
  assert.ok(validFantasyPendingLoot(c)); assert.ok(validFantasyInteriorMaps(c)); assert.deepEqual(c.pendingLoot!.oldwatch.interiorMaps, [copy]);
  for (const id of ids) c.inventory[id] = 0;
  const claimed = applyFantasyAction(stored, { type: 'bagClaim' }); assert.equal(claimed.error, undefined); assert.deepEqual(claimed.profile.character!.interiorMaps, [copy]); assert.ok(validFantasyInteriorMaps(claimed.profile.character!));
});
test('forged copy shape, duplicate IDs and metadata-less generic map inventory are rejected with localized feedback', () => {
  const p = crafted(), c = p.character!, copy = c.interiorMaps![0];
  assert.equal(validFantasyInteriorMapCopy({ ...copy, reward: 99 }), false); assert.equal(validFantasyInteriorMapCopy({ ...copy, rooms: ['invented-room'] }), false);
  c.interiorMaps!.push(structuredClone(copy)); c.inventory[FANTASY_INTERIOR_MAP_ITEM]++; assert.equal(validFantasyInteriorMaps(c), false);
  delete c.interiorMaps; assert.equal(validFantasyInteriorMaps(c), false);
  for (const locale of ['ko', 'en', 'ja'] as const) { assert.ok(fantasyInteriorMapText('interior-map:crafted', locale)); assert.ok(fantasyInteriorMapText('interior-map:used', locale)); }
});
