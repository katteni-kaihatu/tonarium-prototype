import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { createFantasyGear } from '../shared/fantasy-equipment.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
import type { FantasyCivicCommand } from '../shared/fantasy-civics.ts';
import type { FantasyEconomyCommand } from '../shared/fantasy-economy.ts';

const context = { session: 'realm-public', publicSession: true, peers: ['a', 'b'] };
function profile(name: string): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name }, () => .5).profile, c = p.character!;
  c.inventory['arcane-bag-3']=1;c.bag='arcane-bag-3';
  c.gold = 1000; c.hour = 8; c.level = 10; c.job = 'warrior'; c.jobXp.warrior = 100; c.location = 'hearth'; c.visited = ['hearth', 'greenwood', 'sunmeadow'];
  c.inventory.herb = 20; c.inventory.ore = 10; c.inventory.meal = 2; c.foodLots = [{ id: `${name}-meal`, item: 'meal', count: 2, createdAt: 5 }];
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  return p;
}
function fixture(t: TestContext, configure?: (people: Record<string, FantasyProfile>) => void) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-realm-integration-'));
  t.after(() => { const resolved = path.resolve(directory); assert.equal(path.dirname(resolved), path.resolve(os.tmpdir())); assert.ok(path.basename(resolved).startsWith('fantasy-realm-integration-')); fs.rmSync(resolved, { recursive: true, force: true }); });
  const file = path.join(directory, 'fantasy.json'), people = { a: profile('아라'), b: profile('보라') }; configure?.(people); fs.writeFileSync(file, JSON.stringify(people));
  let hour = 8, fail = false, writes = 0;
  const options = { worldHour: () => hour, combatEnabled: true, onError: () => {}, save: (target: string, value: string) => { if (fail) throw new Error('Test disk full'); writes++; fs.writeFileSync(target, value); } };
  const store = new FantasyStore(file, options); assert.equal(store.loadError, undefined);
  const request = (user: string, domain: 'economy' | 'civic', command: unknown, ctx = context) => store.realmRequest(user, { domain, command }, ctx);
  assert.equal(request('a', 'civic', { type: 'sync' }).error, undefined); assert.equal(request('a', 'economy', { type: 'sync' }).error, undefined);
  let serial = 0;
  const civic = (actor: string, value: Record<string, unknown>) => request(actor, 'civic', { ...value, revision: store.realmState(actor, context).civic.revision, requestId: `civic-qa-${serial++}` } as FantasyCivicCommand);
  const economy = (actor: string, command: FantasyEconomyCommand) => request(actor, 'economy', command);
  const trade = () => { assert.equal(economy('a', { type: 'open', peer: 'b' }).error, undefined); return store.realmState('a', context).economy.trades.find(entry => entry.status === 'open')!; };
  const quote = (actor = 'a', item = 'lantern') => { const shop = store.realmState(actor, context).economy.shops.find(shop => shop.building === 'market')!; const lot = shop.lots.find(lot => lot.item === item && lot.id === `stock-${item}`)!; assert.ok(lot, item); return { shop, lot }; };
  return { store, file, options, request, civic, economy, trade, quote, setHour: (next: number) => { hour = next; }, fail: (next: boolean) => { fail = next; }, writes: () => writes };
}

test('two-sided direct trading commits actual gold and items once and survives a store restart', t => {
  const f = fixture(t), trade = f.trade();
  assert.equal(f.economy('a', { type: 'offer', trade: trade.id, revision: 0, gold: 100, items: [{ item: 'herb', count: 3 }] }).error, undefined);
  assert.equal(f.economy('b', { type: 'offer', trade: trade.id, revision: 1, gold: 25, items: [{ item: 'ore', count: 2 }] }).error, undefined);
  assert.equal(f.economy('a', { type: 'confirm', trade: trade.id, revision: 2 }).error, undefined); assert.equal(f.store.profile('a').character!.gold, 1000);
  assert.equal(f.economy('b', { type: 'confirm', trade: trade.id, revision: 2 }).error, undefined);
  assert.equal(f.store.profile('a').character!.gold, 925); assert.equal(f.store.profile('b').character!.gold, 1075);
  assert.equal(f.store.profile('a').character!.inventory.herb, 17); assert.equal(f.store.profile('b').character!.inventory.herb, 23);
  assert.equal(f.store.profile('a').character!.inventory.ore, 12); assert.equal(f.store.profile('b').character!.inventory.ore, 8);
  const restored = new FantasyStore(f.file, f.options); assert.equal(restored.loadError, undefined); assert.deepEqual(restored.profile('a'), f.store.profile('a')); assert.deepEqual(restored.profile('b'), f.store.profile('b'));
  assert.ok(restored.realmRequest('b', { domain: 'economy', command: { type: 'confirm', trade: trade.id, revision: 2 } }, context).error);
});

test('a failed final settlement preserves both players, both approvals, inventory and the saved file', t => {
  const f = fixture(t), trade = f.trade();
  f.economy('a', { type: 'offer', trade: trade.id, revision: 0, gold: 70, items: [{ item: 'herb', count: 2 }] }); f.economy('a', { type: 'confirm', trade: trade.id, revision: 1 });
  const before = ['a', 'b'].map(user => f.store.profile(user)), state = f.store.realmState('a', context).economy, bytes = fs.readFileSync(f.file, 'utf8');
  f.fail(true); assert.ok(f.economy('b', { type: 'confirm', trade: trade.id, revision: 1 }).error);
  assert.deepEqual(['a', 'b'].map(user => f.store.profile(user)), before); assert.deepEqual(f.store.realmState('a', context).economy, state); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  f.fail(false); assert.equal(f.economy('b', { type: 'confirm', trade: trade.id, revision: 1 }).error, undefined); assert.equal(f.store.profile('a').character!.gold, 930);
  const settled = ['a', 'b'].map(user => f.store.profile(user)); assert.ok(f.economy('b', { type: 'confirm', trade: trade.id, revision: 1 }).error); assert.deepEqual(['a', 'b'].map(user => f.store.profile(user)), settled);
});

test('trade parcels preserve exact food ages and crafted gear performance through save and reload', t => {
  const f = fixture(t, people => { const c = people.a.character!; c.inventory['steel-sword'] = 1; createFantasyGear(c, 'steel-sword', () => .9, 'starsteel-ingot', 'ruby'); });
  const gear = f.store.profile('a').character!.gear!.find(entry => entry.item === 'steel-sword')!, trade = f.trade();
  assert.equal(f.economy('a', { type: 'offer', trade: trade.id, revision: 0, gold: 0, items: [{ item: 'meal', count: 1 }, { item: 'steel-sword', count: 1, instance: gear.id }] }).error, undefined);
  f.economy('a', { type: 'confirm', trade: trade.id, revision: 1 }); assert.equal(f.economy('b', { type: 'confirm', trade: trade.id, revision: 1 }).error, undefined);
  const restored = new FantasyStore(f.file, f.options), c = restored.profile('b').character!;
  assert.equal(c.foodLots.filter(entry => entry.item === 'meal' && entry.createdAt === 5).reduce((total, entry) => total + entry.count, 0), 3);
  const received = c.gear!.find(entry => entry.item === 'steel-sword')!; assert.deepEqual({ ...received, id: gear.id }, gear);
});

test('unconfirmed offers are cancelled on restart without losing offered belongings', t => {
  const f = fixture(t), trade = f.trade(); f.economy('a', { type: 'offer', trade: trade.id, revision: 0, gold: 100, items: [{ item: 'herb', count: 2 }] });
  const before = ['a', 'b'].map(user => f.store.profile(user)); const restored = new FantasyStore(f.file, f.options); assert.equal(restored.loadError, undefined);
  assert.deepEqual(['a', 'b'].map(user => restored.profile(user)), before); assert.equal(restored.realmState('a', context).economy.trades.find(entry => entry.id === trade.id)?.status, 'cancelled');
});

test('finite market inventory rejects a second claimant and legacy buy cannot recreate depleted goods', t => {
  const f = fixture(t), { shop, lot } = f.quote(), before = f.store.profile('a').character!.inventory.lantern ?? 0;
  const rival = f.quote('b'); assert.equal(rival.shop.revision, shop.revision);
  assert.equal(f.economy('a', { type: 'shopBuy', building: 'market', item: 'lantern', lot: lot.id, count: lot.count, revision: shop.revision, quotedUnitPrice: lot.unitPrice }).error, undefined);
  assert.equal(f.store.profile('a').character!.inventory.lantern, before + lot.count);
  const otherBefore = f.store.profile('b'); assert.ok(f.economy('b', { type: 'shopBuy', building: 'market', item: 'lantern', count: 1, revision: rival.shop.revision }).error); assert.deepEqual(f.store.profile('b'), otherBefore);
  const oldRoute = f.store.apply('b', f.store.profile('b').revision, { type: 'buy', item: 'lantern' }); assert.ok(oldRoute.error); assert.deepEqual(f.store.profile('b'), otherBefore);
  const restored = new FantasyStore(f.file, f.options); assert.equal(restored.realmState('b', context).economy.shops.find(entry => entry.building === 'market')!.lots.find(entry => entry.item === 'lantern')!.count, 0);
  f.setHour(14); assert.equal(f.request('a', 'economy', { type: 'sync' }).error, undefined); assert.equal(f.quote().lot.count, 0);
  f.setHour(30); assert.equal(f.request('a', 'economy', { type: 'sync' }).error, undefined); assert.ok(f.quote().lot.count > 0);
});

test('failed finite-shop saves keep both the quoted stock and player funds unchanged', t => {
  const f = fixture(t), { shop, lot } = f.quote(), before = f.store.profile('a'), state = f.store.realmState('a', context), bytes = fs.readFileSync(f.file, 'utf8');
  f.fail(true); assert.ok(f.economy('a', { type: 'shopBuy', building: 'market', item: lot.item, count: 1, revision: shop.revision, lot: lot.id }).error);
  assert.deepEqual(f.store.profile('a'), before); assert.deepEqual(f.store.realmState('a', context), state); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
});

test('real civic evidence, custody and sentencing persist while all other action paths stay blocked', t => {
  const f = fixture(t);
  assert.equal(f.civic('a', { type: 'npcCrime', npc: 'rin', kind: 'theft' }).error, undefined); assert.equal(f.civic('a', { type: 'surrender' }).error, undefined);
  assert.equal(f.civic('a', { type: 'hearing', plea: 'admit' }).error, undefined); assert.ok(f.store.civicBlocked('a'));
  const before = f.store.profile('a'), bytes = fs.readFileSync(f.file, 'utf8'), { shop, lot } = f.quote();
  for (const action of [{ type: 'work' }, { type: 'buy', item: 'lantern' }, { type: 'travel', destination: 'greenwood', transport: 'carriage' }]) {
    assert.ok(f.store.apply('a', f.store.profile('a').revision, action).error); assert.equal(f.store.profile('a').activity, undefined);
  }
  assert.ok(f.economy('a', { type: 'shopBuy', building: 'market', item: lot.item, count: 1, revision: shop.revision }).error);
  const plot = f.store.propertyState('a').plots.find(entry => entry.id === 'hearth-residence')!;
  assert.ok(f.store.propertyRequest('a', { type: 'buy', plot: plot.id, revision: plot.revision, requestId: 'blocked-property' }).error);
  assert.ok(f.store.startGroupTravel(['a', 'b'].map(user => ({ user, generation: 1, location: 'hearth', destination: 'greenwood', transport: 'carriage' }))).error);
  assert.ok(f.store.partyVaultRequest({ id: 'test-party', leader: 'a', members: ['a', 'b'] }, 'a', { type: 'deposit', revision: 0, item: 'herb', count: 1 }).error);
  assert.ok(f.store.startCombat([{ user: 'a', generation: 1, location: 'hearth', session: context.session, source: 'hunt', target: 'monster-cave-slime' }]).error);
  assert.deepEqual(f.store.profile('a'), before); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  const restored = new FantasyStore(f.file, f.options); assert.equal(restored.loadError, undefined); assert.ok(restored.civicBlocked('a'));
  f.setHour(9); assert.equal(f.request('a', 'civic', { type: 'sync' }).error, undefined); assert.equal(f.store.civicBlocked('a'), undefined);
  assert.equal(f.store.apply('a', f.store.profile('a').revision, { type: 'work' }).error, undefined); assert.ok(f.store.profile('a').activity);
});

test('a different person cannot settle an old trade with somebody who is now in custody', t => {
  const f = fixture(t), trade = f.trade();
  f.economy('a', { type: 'offer', trade: trade.id, revision: 0, gold: 100, items: [{ item: 'herb', count: 2 }] }); f.economy('a', { type: 'confirm', trade: trade.id, revision: 1 });
  assert.equal(f.civic('a', { type: 'npcCrime', npc: 'rin', kind: 'theft' }).error, undefined); assert.equal(f.civic('a', { type: 'surrender' }).error, undefined);
  const before = ['a', 'b'].map(user => f.store.profile(user)), saved = fs.readFileSync(f.file, 'utf8');
  assert.ok(f.economy('b', { type: 'confirm', trade: trade.id, revision: 1 }).error); assert.deepEqual(['a', 'b'].map(user => f.store.profile(user)), before); assert.equal(fs.readFileSync(f.file, 'utf8'), saved);
});

test('failed civic saves neither commit the crime nor modify gold, evidence, reputation or notices', t => {
  const f = fixture(t), before = f.store.profile('a'), state = f.store.realmState('a', context), bytes = fs.readFileSync(f.file, 'utf8');
  f.fail(true); assert.ok(f.civic('a', { type: 'npcCrime', npc: 'rin', kind: 'theft' }).error); assert.deepEqual(f.store.profile('a'), before); assert.deepEqual(f.store.realmState('a', context), state); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  f.fail(false); assert.equal(f.civic('a', { type: 'npcCrime', npc: 'rin', kind: 'theft' }).error, undefined); assert.equal(f.store.realmState('a', context).civic.ownCases.length, 1);
});

test('unauthorised realm actors and foreign-session counterpart lists cannot transfer belongings', t => {
  const f = fixture(t), before = ['a', 'b'].map(user => f.store.profile(user));
  assert.ok(f.request('a', 'economy', { type: 'open', peer: 'b' }, { ...context, peers: ['b'] }).error);
  assert.ok(f.request('a', 'economy', { type: 'open', peer: 'b' }, { ...context, peers: ['a'] }).error);
  assert.deepEqual(['a', 'b'].map(user => f.store.profile(user)), before);
});
