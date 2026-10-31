import { FANTASY_ITEMS } from '../shared/fantasy-data.ts';
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FantasyBusiness } from '../shared/fantasy-business.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { applyFantasyPropertyCommand, newFantasyPropertyLedger } from '../shared/fantasy-property.ts';
import { newFantasyPropertyExtension } from '../shared/fantasy-property-extensions.ts';
import { fantasyCookingWarehouse } from './fantasy-cooking-warehouse.ts';
import { FantasyStore } from './fantasy-store.ts';

const action = { type: 'cookMix', station: 'kitchen', recipe: 'cook-meal', workshop: 'hearth-commercial', storage: 'hearth-commercial', ingredients: [{ item: 'fish', count: 1 }, { item: 'herb', count: 1 }] } as const;

function fixture(t: TestContext, configure?: (state: ReturnType<typeof applyFantasyPropertyCommand>) => void) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-cooking-warehouse-'));
  t.after(() => {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('fantasy-cooking-warehouse-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const file = path.join(directory, 'state.json');
  const profiles: Record<string, FantasyProfile> = Object.fromEntries(['a', 'b'].map(user => {
    const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: user }, () => .99).profile;
    const c = profile.character!;
    c.job = 'cook'; c.jobXp.cook = 1000; c.gold = 90_000; c.inventory = {}; c.foodLots = [];
    c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
    return [user, profile];
  }));
  const state = applyFantasyPropertyCommand(newFantasyPropertyLedger(), profiles, 'a', { type: 'buy', plot: 'hearth-commercial', revision: 0, requestId: 'warehouse-buy' }, 8);
  state.ledger.plots['hearth-commercial'].business = {
    inventory: { herb: 2 }, treasury: 100, lastAt: 8,
    parcels: [{ id: 'fish-parcel', goods: { item: 'fish', count: 2, food: [{ id: 'fish-lot', item: 'fish', count: 2, createdAt: 8 }] } }],
  };
  configure?.(state);
  fs.writeFileSync(file, JSON.stringify({ version: 2, profiles: state.profiles, combats: {}, properties: state.ledger }));
  let hour = 8, fail = false;
  const errors: unknown[] = [];
  const options = { worldHour: () => hour, onError: (error: unknown) => { errors.push(error); }, save: (target: string, value: string) => { if (fail) throw new Error('warehouse save failure'); fs.writeFileSync(target, value); } };
  let store = new FantasyStore(file, options);
  assert.equal(store.loadError, undefined, errors.map(String).join('\n'));
  const saved = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    get store() { return store; }, file, saved,
    fail(value: boolean) { fail = value; },
    clock(value: number) { hour = value; },
    at(value: number, online = new Set<string>()) { hour = value; return store.tick(online); },
    reload() { store = new FantasyStore(file, options); },
    warehouse() { return saved().properties.plots['hearth-commercial'].business; },
  };
}

test('warehouse portions retain original parcel identities, preservation and unrelated equipment', () => {
  const business: FantasyBusiness = {
    inventory: { herb: 2 }, treasury: 55, lastAt: 8,
    parcels: [
      { id: 'old', goods: { item: 'fish', count: 2, quality: 'stale', food: [{ id: 'reused-id', item: 'fish', count: 2, createdAt: 0, preservedHours: 2 }] } },
      { id: 'new', goods: { item: 'fish', count: 3, food: [{ id: 'reused-id', item: 'fish', count: 3, createdAt: 8 }] } },
      { id: 'blade', goods: { item: 'blade', count: 1, instance: 'blade-1', gear: { id: 'blade-1', item: 'blade', quality: 2, createdAt: 0 } } },
    ],
  };
  const original = structuredClone(business), source = fantasyCookingWarehouse(business);
  assert.equal(source.stock.inventory.fish, 5);
  assert.equal(source.stock.inventory.blade, undefined);
  assert.equal(new Set(source.stock.foodLots.map(lot => lot.id)).size, 2);
  source.stock.inventory.herb--;
  source.stock.inventory.fish--;
  source.stock.foodLots.find(lot => lot.createdAt === 0)!.count--;
  const remaining = source.remaining();
  assert.deepEqual(business, original);
  assert.deepEqual(remaining.parcels![0], { ...original.parcels![0], goods: { ...original.parcels![0].goods, count: 1, food: [{ ...original.parcels![0].goods.food![0], count: 1 }] } });
  assert.deepEqual(remaining.parcels!.slice(1), original.parcels!.slice(1));
  assert.equal(remaining.inventory.herb, 1);
});

test('warehouse cooking saves each repetition and source deduction together, rolls back disk failure, and resumes once', t => {
  const f = fixture(t);
  assert.equal(f.store.loadError, undefined);
  const started = f.store.apply('a', f.store.profile('a').revision, { ...action, repeats: 2 }, () => .99);
  assert.equal(started.error, undefined);
  assert.equal(f.warehouse().inventory.herb, 2);
  const before = f.store.profile('a'), source = f.warehouse(), propertyBefore = f.store.propertyState('a').plots.find(plot => plot.id === 'hearth-commercial')!.business!, bytes = fs.readFileSync(f.file, 'utf8');
  f.fail(true);
  assert.ok(f.at(11).some(update => update.error));
  assert.deepEqual(f.store.profile('a'), before);
  const propertyAfter = f.store.propertyState('a').plots.find(plot => plot.id === 'hearth-commercial')!.business!;
  assert.deepEqual(propertyAfter.inventory, propertyBefore.inventory);
  assert.deepEqual(propertyAfter.parcels, propertyBefore.parcels);
  assert.deepEqual(f.warehouse(), source);
  assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  f.fail(false); f.at(11);
  assert.equal(f.store.profile('a').activity!.cooking!.completed, 1);
  assert.equal(f.store.profile('a').character!.inventory.fish ?? 0, 0);
  assert.equal(f.warehouse().inventory.herb, 1);
  assert.equal(f.warehouse().parcels[0].goods.food[0].id, 'fish-lot');
  assert.equal(f.warehouse().parcels[0].goods.food[0].createdAt, 8);
  f.reload(); assert.equal(f.store.loadError, undefined);
  f.at(14);
  assert.equal(f.store.profile('a').activity, undefined);
  assert.deepEqual(f.warehouse().inventory, {});
  assert.deepEqual(f.warehouse().parcels, []);
  const finished = f.store.profile('a'); f.at(14); assert.deepEqual(f.store.profile('a'), finished);
});

test('warehouse cooking consumes old food before newer parcels and spoiled portions produce harmful food', t => {
  const f = fixture(t, state => {
    const c = state.profiles.a.character!; c.hour = 20;
    state.ledger.plots['hearth-commercial'].business!.parcels = [
      { id: 'newer', goods: { item: 'fish', count: 1, food: [{ id: 'newer-lot', item: 'fish', count: 1, createdAt: 8 }] } },
      { id: 'older', goods: { item: 'fish', count: 1, food: [{ id: 'older-lot', item: 'fish', count: 1, createdAt: 0 }] } },
    ];
  });
  f.at(20);
  const started = f.store.apply('a', f.store.profile('a').revision, action, () => .99);
  assert.equal(started.error, undefined); f.at(started.profile.activity!.endsAt);
  assert.ok(FANTASY_ITEMS.some(item => item.foodPenalty?.status === 'poison' && (f.store.profile('a').character!.inventory[item.id] ?? 0) > 0));
  assert.deepEqual(f.warehouse().parcels.map((parcel: { id: string }) => parcel.id), ['newer']);
});

test('warehouse sources reject residence, remote plots, missing workshop and another owner', t => {
  const f = fixture(t), before = f.store.profile('b'), source = f.warehouse();
  for (const patch of [
    {}, { workshop: undefined }, { storage: 'hearth-residence', workshop: 'hearth-residence' },
    { storage: 'sunmeadow-commercial', workshop: 'sunmeadow-commercial' }, { station: 'outdoor' },
  ]) {
    const rejected = f.store.apply('b', before.revision, { ...action, ...patch }, () => .99);
    assert.ok(rejected.error); assert.deepEqual(f.store.profile('b'), before); assert.deepEqual(f.warehouse(), source);
  }
});

test('shared warehouse queues cannot consume the same remaining materials twice', t => {
  const f = fixture(t, state => {
    const record = state.ledger.plots['hearth-commercial'];
    record.extension = newFantasyPropertyExtension(8);
    record.extension.shares = [{ user: 'b', generation: 1, name: 'b', percent: 20 }];
    state.profiles.b.character!.propertyTitles = ['hearth-commercial'];
  });
  for (const user of ['a', 'b']) assert.equal(f.store.apply(user, f.store.profile(user).revision, { ...action, repeats: 2 }, () => .99).error, undefined);
  f.at(14);
  assert.deepEqual(f.warehouse().inventory, {});
  assert.deepEqual(f.warehouse().parcels, []);
  assert.equal(['a', 'b'].filter(user => f.store.profile(user).character!.jobXp.cook > 1000).length, 2);
  for (const user of ['a', 'b']) assert.equal(f.store.profile(user).character!.practice?.craft, 1);
  assert.equal(f.store.profile('b').activity, undefined);
});

test('NPC warehouse use takes priority and stops the remaining queue without consuming its unfinished inputs', t => {
  const f = fixture(t, state => {
    state.ledger.plots['hearth-commercial'].business!.inventory.herb = 3;
    state.ledger.employees = { 'artisan-2': { npc: 'artisan-2', user: 'a', generation: 1, hiredAt: 8, expiresAt: 100, source: 'guild', skills: { cook: 100 }, learning: 3, plot: 'hearth-commercial', job: 'cook', recipe: 'cook-meal', mode: 'craft', lastAt: 8 } };
  });
  const started = f.store.apply('a', f.store.profile('a').revision, { ...action, repeats: 2 }, () => .99);
  assert.equal(started.error, undefined);
  f.at(11); assert.equal(f.store.profile('a').activity!.cooking!.completed, 1);
  const completedXp = f.store.profile('a').character!.jobXp.cook;
  const before = f.store.profile('a'), source = f.warehouse(), bytes = fs.readFileSync(f.file, 'utf8');
  f.fail(true);
  assert.ok(f.at(14).some(update => update.error));
  assert.deepEqual(f.store.profile('a'), before);
  assert.deepEqual(f.warehouse(), source);
  const liveBusiness = f.store.propertyState('a').plots.find(plot => plot.id === 'hearth-commercial')!.business!;
  assert.deepEqual(liveBusiness.inventory, source.inventory);
  assert.equal(f.saved().properties.employees['artisan-2'].lastAt, 8);
  assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
  f.fail(false); f.at(14);
  assert.equal(f.store.profile('a').activity, undefined);
  assert.equal(f.store.profile('a').character!.jobXp.cook, completedXp);
  assert.equal(f.warehouse().inventory.herb, 1);
  assert.equal(f.warehouse().parcels.filter((parcel: { goods: { item: string } }) => parcel.goods.item === 'meal').length, 1);
  assert.equal(f.saved().properties.employees['artisan-2'].lastAt, 12);
  f.reload(); assert.equal(f.store.loadError, undefined);
  const settled = f.saved(); f.at(14); assert.deepEqual(f.saved(), settled);
});

test('canceling after one warehouse repetition retains its output and leaves unstarted source portions in place', t => {
  const f = fixture(t);
  assert.equal(f.store.apply('a', f.store.profile('a').revision, { ...action, repeats: 2 }, () => .99).error, undefined);
  f.at(11);
  const before = f.store.profile('a'), source = f.warehouse();
  const result = f.store.apply('a', before.revision, { type: 'cancel' });
  assert.equal(result.error, undefined);
  assert.equal(result.profile.activity, undefined);
  assert.deepEqual(result.profile.character!.inventory, before.character!.inventory);
  assert.deepEqual(f.warehouse(), source);
});

test('late lease settlement preserves every authorized repetition and matches smaller ticks', t => {
  const setup = (state: ReturnType<typeof applyFantasyPropertyCommand>) => {
    const record = state.ledger.plots['hearth-commercial'];
    record.extension = newFantasyPropertyExtension(8);
    record.extension.lease = { user: 'b', generation: 1, name: 'b', rent: 1, days: 1, state: 'active', startsAt: 0, endsAt: 24, expiresAt: 0 };
    state.profiles.b.character!.propertyTitles = ['hearth-commercial'];
    state.profiles.a.character!.propertyTitles = [];
  };
  const late = fixture(t, setup), split = fixture(t, setup);
  for (const f of [late, split]) {
    f.at(19);
    assert.equal(f.store.apply('b', f.store.profile('b').revision, { ...action, repeats: 2 }, () => .99).error, undefined);
  }
  split.at(22); split.reload(); split.at(25);
  late.at(25);
  assert.equal(late.store.profile('b').activity, undefined);
  assert.ok(late.store.profile('b').character!.jobXp.cook > 1000);
  assert.equal(late.warehouse().inventory.herb, 1);
  assert.equal(late.warehouse().parcels[0].goods.count, 1);
  assert.deepEqual(late.store.profile('b').character!.inventory, split.store.profile('b').character!.inventory);
  assert.deepEqual(late.warehouse(), split.warehouse());
});

test('preserved warehouse food keeps its recorded freshness credit without gaining new bag preservation', t => {
  const f = fixture(t, state => {
    state.profiles.a.character!.hour = 20;
    state.ledger.plots['hearth-commercial'].business!.parcels = [{
      id: 'preserved-fish', goods: { item: 'fish', count: 2, food: [{
        id: 'preserved-fish-lot', item: 'fish', count: 2, createdAt: 0, preservedHours: 18, preservationAt: 20,
      }] },
    }];
  });
  f.at(20);
  const started = f.store.apply('a', f.store.profile('a').revision, action, () => .99);
  assert.equal(started.error, undefined);
  f.at(started.profile.activity!.endsAt);
  const c = f.store.profile('a').character!;
  assert.ok(Object.values(c.inventory).some(count => count > 0));
  assert.equal(FANTASY_ITEMS.some(item => item.foodPenalty?.status === 'poison' && (c.inventory[item.id] ?? 0) > 0), false);
  assert.deepEqual(f.warehouse().parcels, [{
    id: 'preserved-fish', goods: { item: 'fish', count: 1, food: [{
      id: 'preserved-fish-lot', item: 'fish', count: 1, createdAt: 0, preservedHours: 18, preservationAt: 20,
    }] },
  }]);
  assert.ok(c.foodLots.every(lot => lot.createdAt === 23));
  f.reload(); assert.equal(f.store.loadError, undefined);
});

test('owning the local workshop does not authorize mismatched, remote or outdoor warehouse sources', t => {
  const f = fixture(t), before = f.store.profile('a'), source = f.warehouse();
  for (const patch of [
    { workshop: undefined },
    { storage: 'hearth-residence', workshop: 'hearth-residence' },
    { storage: 'sunmeadow-commercial', workshop: 'sunmeadow-commercial' },
    { storage: 'hearth-commercial', workshop: 'sunmeadow-commercial' },
    { station: 'outdoor' },
  ]) {
    const result = f.store.apply('a', before.revision, { ...action, ...patch }, () => .99);
    assert.ok(result.error);
    assert.deepEqual(f.store.profile('a'), before);
    assert.deepEqual(f.warehouse(), source);
  }
});

test('fractional-clock cooking starts and reloads without rejecting floating-point duration noise', t => {
  const f = fixture(t);
  f.at(15.1);
  const started = f.store.apply('a', f.store.profile('a').revision, action, () => .99);
  assert.equal(started.error, undefined);
  assert.equal(started.profile.activity!.startedAt, 15.1);
  f.reload(); assert.equal(f.store.loadError, undefined);
  f.at(18.1);
  assert.equal(f.store.profile('a').activity, undefined);
  assert.ok(f.store.profile('a').character!.jobXp.cook > 1000);
});

test('late settlement cannot let a later NPC shift take supplies from earlier completed cooking', t => {
  const setup = (state: ReturnType<typeof applyFantasyPropertyCommand>) => {
    const b = state.ledger.plots['hearth-commercial'].business!;
    b.parcels![0].goods.count = 1; b.parcels![0].goods.food![0].count = 1;
    state.ledger.employees = { 'artisan-2': { npc: 'artisan-2', user: 'a', generation: 1, hiredAt: 8, expiresAt: 100, source: 'guild', skills: { cook: 100 }, learning: 3, plot: 'hearth-commercial', job: 'cook', recipe: 'cook-meal', mode: 'craft', lastAt: 8 } };
  };
  const late = fixture(t, setup), split = fixture(t, setup);
  for (const f of [late, split]) assert.equal(f.store.apply('a', f.store.profile('a').revision, action, () => .99).error, undefined);
  split.at(11); split.at(14); late.at(14);
  assert.ok(late.store.profile('a').character!.jobXp.cook > 1000);
  assert.deepEqual(late.store.profile('a').character!.inventory, split.store.profile('a').character!.inventory);
  assert.deepEqual(late.warehouse(), split.warehouse());
});

test('bounded workshop catch-up checkpoints all sources and resumes remaining repetitions after reload', t => {
  const f = fixture(t, state => {
    const record = state.ledger.plots['hearth-commercial'];
    record.business = { inventory: { herb: 390, ore: 24, wood: 12 }, parcels: [], treasury: 100, lastAt: 8 };
    state.ledger.employees = { 'artisan-2': { npc: 'artisan-2', user: 'b', generation: 1, hiredAt: 8, expiresAt: 200, source: 'guild', skills: { blacksmith: 100 }, learning: 3, plot: 'hearth-commercial', job: 'blacksmith', recipe: 'smith-ingot', mode: 'craft', lastAt: 8 } };
    const c = state.profiles.b.character!; c.level = 100; c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
    record.extension = newFantasyPropertyExtension(8);
    record.extension.lease = { user: 'b', generation: 1, name: 'b', rent: 1, days: 6, state: 'active', startsAt: 0, endsAt: 144, expiresAt: 0 };
    state.profiles.b.character!.propertyTitles = ['hearth-commercial'];
    state.profiles.a.character!.propertyTitles = [];
  });
  const started = f.store.apply('b', f.store.profile('b').revision, {
    ...action, recipe: 'cook-improvised', mains: ['herb', 'herb', 'herb'], ingredients: [{ item: 'herb', count: 3 }], repeats: 130,
  }, () => .99);
  assert.equal(started.error, undefined);
  f.at(150);
  assert.ok(f.store.profile('b').activity);
  assert.equal(f.store.profile('b').activity!.cooking!.completed, 128);
  assert.equal(f.store.profile('b').character!.hour, 136);
  assert.equal(f.warehouse().inventory.herb, 6);
  assert.equal(f.warehouse().inventory.ingot, 12);
  assert.equal(f.saved().properties.employees['artisan-2'].skills.blacksmith, 136);
  assert.equal(f.saved().properties.employees['artisan-2'].lastAt, 136);
  assert.equal(f.store.propertyRequest('a', { type: 'sync' }).error, undefined);
  assert.ok(f.saved().properties.plots['hearth-commercial'].extension.lease);
  f.reload(); assert.equal(f.store.loadError, undefined);
  f.at(150);
  assert.equal(f.store.profile('b').activity, undefined);
  assert.deepEqual(f.warehouse().inventory, { ingot: 12 });
  assert.equal(f.store.profile('b').character!.practice?.craft, 130);
});

test('new source mutations wait while a bounded earlier cooking backlog is still due', t => {
  const f = fixture(t, state => {
    const record = state.ledger.plots['hearth-commercial'];
    record.business = { inventory: { herb: 900 }, parcels: [], treasury: 100, lastAt: 8 };
    record.extension = newFantasyPropertyExtension(8);
    record.extension.lease = { user: 'b', generation: 1, name: 'b', rent: 1, days: 15, state: 'active', startsAt: 0, endsAt: 360, expiresAt: 0 };
    state.profiles.b.character!.propertyTitles = ['hearth-commercial']; state.profiles.a.character!.propertyTitles = [];
    const c = state.profiles.b.character!; c.level = 100; c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  });
  assert.equal(f.store.apply('b', f.store.profile('b').revision, {
    ...action, recipe: 'cook-improvised', mains: ['herb', 'herb', 'herb'], ingredients: [{ item: 'herb', count: 3 }], repeats: 300,
  }, () => .99).error, undefined);
  f.at(350);
  assert.equal(f.store.profile('b').activity!.cooking!.completed, 128);
  const attempt = f.store.apply('a', f.store.profile('a').revision, action);
  assert.ok(attempt.error);
  assert.equal(f.store.profile('b').activity!.cooking!.completed, 256);
  assert.equal(f.warehouse().inventory.herb, 132);
  assert.ok(f.saved().properties.plots['hearth-commercial'].extension.lease);
  f.reload(); assert.equal(f.store.loadError, undefined);
  f.at(350);
  assert.equal(f.store.profile('b').activity, undefined);
  assert.equal(f.store.profile('b').character!.practice?.craft, 300);
  assert.deepEqual(f.warehouse().inventory, {});
});

test('another party member can deposit supplies without settling or canceling warehouse cooking', t => {
  const f = fixture(t, state => { state.profiles.b.character!.inventory.herb = 1; });
  assert.equal(f.store.apply('a', f.store.profile('a').revision, { ...action, repeats: 2 }, () => .99).error, undefined);
  const before = f.store.profile('a'), source = f.warehouse(); f.clock(11);
  const deposited = f.store.partyVaultRequest({ id: 'warehouse-party', leader: 'b', members: ['a', 'b'] }, 'b', { type: 'deposit', revision: 0, item: 'herb', count: 1 });
  assert.equal(deposited.error, undefined);
  assert.deepEqual(f.store.profile('a'), before);
  assert.deepEqual(f.warehouse(), source);
  f.at(11); assert.equal(f.store.profile('a').activity!.cooking!.completed, 1);
  assert.equal(f.warehouse().inventory.herb, 1);
  f.reload(); assert.equal(f.store.loadError, undefined);
  f.at(14);
  assert.equal(f.store.profile('a').activity, undefined);
  assert.equal(f.store.profile('a').character!.practice?.craft, 2);
  assert.deepEqual(f.warehouse().inventory, {});
});

test('combat starts and joins cannot replace an active warehouse cooking queue', t => {
  const f = fixture(t, state => { state.profiles.b.event = 'encounter-watch'; });
  assert.equal(f.store.apply('a', f.store.profile('a').revision, { ...action, repeats: 2 }, () => .99).error, undefined);
  f.clock(10.9);
  const fight = f.store.startCombat([{ user: 'b', session: 'warehouse-combat', generation: 1, location: 'hearth', source: 'encounter', target: 'encounter-watch' }], () => .5);
  assert.equal(fight.error, undefined);
  const before = f.store.profile('a'), source = f.warehouse(); f.clock(11);
  const joined = f.store.joinCombat('a', 'warehouse-combat', fight.state!.id);
  assert.equal(joined.error, 'busy');
  assert.deepEqual(f.store.profile('a'), before);
  const started = f.store.startCombat([{ user: 'a', session: 'warehouse-combat', generation: 1, location: 'hearth', source: 'encounter', target: 'encounter-watch' }], () => .5);
  assert.equal(started.error, 'busy');
  assert.deepEqual(f.store.profile('a'), before);
  assert.deepEqual(f.warehouse(), source);
  f.at(11); assert.equal(f.store.profile('a').activity!.cooking!.completed, 1);
  f.at(14);
  assert.equal(f.store.profile('a').activity, undefined);
  assert.equal(f.store.profile('a').character!.practice?.craft, 2);
  assert.deepEqual(f.warehouse().inventory, {});
});
