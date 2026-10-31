import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { applyFantasyPropertyCommand, advanceFantasyProperties, newFantasyPropertyLedger, validFantasyPropertyLedger, type FantasyPropertyChange, type FantasyPropertyCommand } from '../shared/fantasy-property.ts';
import { advanceFantasyBusinesses } from '../shared/fantasy-business.ts';
import { applyFantasyEconomyCommand, fantasyEconomyState, newFantasyEconomyLedger, validFantasyEconomyLedger, type FantasyEconomyCommand } from '../shared/fantasy-economy.ts';
import { applyFantasyCommission, quoteFantasyCommission } from '../shared/fantasy-commissions.ts';
import { fantasyBusinessDemand } from '../shared/fantasy-business-demand.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';

const seasons = { spring: 12, summer: 372, autumn: 732, winter: 1092 } as const;
const owners = [{ actor: 'merchant', location: 'hearth', worker: 'artisan-1', job: 'merchant', item: 'herb' }, { actor: 'smith', location: 'emberhall', worker: 'artisan-3', job: 'blacksmith', item: 'ingot', recipe: 'smith-ingot' }];

function person(name: string, location: string, at: number, inventory: Record<string, number>): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name, gender: 'female' }, () => .99).profile;
  Object.assign(p.character!, { gold: 10_000, hour: at, location, inventory, foodLots: [], gear: [], equipment: {} });
  return p;
}
function wealth(s: FantasyPropertyChange) {
  return Object.values(s.profiles).reduce((sum, p) => sum + p.character!.gold, 0) + Object.values(s.ledger.plots).reduce((sum, record) => sum + (record.business?.treasury ?? 0), 0);
}

export function runEconomySimulation(season: keyof typeof seasons, days = 14) {
  assert.ok(Number.isSafeInteger(days) && days >= 1 && days <= 14, 'bounded to fourteen game days');
  const start = seasons[season]; let serial = 0;
  let state: FantasyPropertyChange = { ledger: newFantasyPropertyLedger(), changed: false, profiles: {
    merchant: person('Merchant', 'hearth', start, { herb: 40 }), smith: person('Smith', 'emberhall', start, { ore: 80, wood: 40 }),
    patron: person('Patron', 'hearth', start, { herb: 14 }), rival: person('Rival', 'hearth', start, {}),
  } };
  let economy = newFantasyEconomyLedger();
  const totals = { openingGold: wealth(state), propertyAndHire: 0, taxes: 0, shopSpending: 0, commissionFees: 0, commissions: 0, marketHerbsBought: 0, wages: 0, businessRevenue: 0, produced: 0, sold: 0, replayProbes: 0, stockProbes: 0 };
  const businesses = Object.fromEntries(owners.map(owner => [owner.actor, { produced: 0, sold: 0, revenue: 0, wages: 0, cycles: 0 }]));
  const property = (actor: string, location: string, type: string, extra: object, at: number) => {
    const plot = `${location}-commercial`, request = { type, plot, revision: state.ledger.plots[plot].revision, requestId: `v9-${++serial}`, ...extra } as FantasyPropertyCommand;
    const result = applyFantasyPropertyCommand(state.ledger, state.profiles, actor, request, at);
    assert.equal(result.error, undefined, `${actor}:${type}@${at}`); assert.equal(result.changed, true);
    state = result;
    const replay = applyFantasyPropertyCommand(state.ledger, state.profiles, actor, request, at);
    assert.equal(replay.changed, false, 'same receipt cannot transfer gold or goods again'); assert.equal(replay.error, undefined); totals.replayProbes++;
    assert.ok(validFantasyPropertyLedger(state.ledger));
  };
  const trade = (actor: string, command: FantasyEconomyCommand, at: number) => {
    const result = applyFantasyEconomyCommand(economy, new Map(Object.entries(state.profiles)), actor, command, { hour: at, peers: Object.keys(state.profiles), token: `v9-${++serial}` });
    if (!result.error) { economy = result.ledger; state.profiles = Object.fromEntries(result.profiles); }
    assert.ok(validFantasyEconomyLedger(economy)); return result;
  };
  for (const owner of owners) {
    const before = wealth(state);
    property(owner.actor, owner.location, 'buy', {}, start);
    property(owner.actor, owner.location, 'workerHire', { npc: owner.worker, source: 'guild' }, start);
    totals.propertyAndHire += before - wealth(state);
    for (const [item, count] of Object.entries(state.profiles[owner.actor].character!.inventory)) property(owner.actor, owner.location, 'warehouseDeposit', { item, count }, start);
    property(owner.actor, owner.location, 'businessDeposit', { amount: 300 }, start);
    property(owner.actor, owner.location, 'workerAssign', { npc: owner.worker, job: owner.job, mode: 'sell', ...(owner.recipe ? { recipe: owner.recipe } : { salesItem: owner.item }) }, start);
  }
  const rows: object[] = [];
  for (let step = 0; step <= days * 6; step++) {
    const at = start + step * 4;
    for (const p of Object.values(state.profiles)) p.character!.hour = at;
    if (step) {
      const prior = structuredClone(state.ledger);
      state = advanceFantasyProperties(state.ledger, state.profiles, at);
      for (const owner of owners) {
        const plot = `${owner.location}-commercial`, b = state.ledger.plots[plot].business!, old = prior.plots[plot].business!;
        if (b.report?.at === at && old.report?.at !== at) {
          const report = b.report, sum = businesses[owner.actor];
          sum.produced += report.produced; sum.sold += report.sold; sum.revenue += report.revenue; sum.wages += report.wages; sum.cycles++;
          assert.equal(b.treasury - old.treasury, report.revenue - report.wages);
        } else assert.equal(b.treasury, old.treasury);
        const tax = state.ledger.plots[plot].extension?.taxDue ?? 0;
        if (tax) { property(owner.actor, owner.location, 'payTax', {}, at); totals.taxes += tax; }
      }
      const settled = structuredClone(state.ledger);
      assert.equal(advanceFantasyBusinesses(state.ledger, state.profiles, at), false); assert.deepEqual(state.ledger, settled); totals.replayProbes++;
    }
    if (step % 6 === 0 && step < days * 6) {
      const initial = fantasyEconomyState(economy, new Map(Object.entries(state.profiles)), 'merchant', { hour: at, peers: Object.keys(state.profiles) }).shops.find(shop => shop.building === 'market')!;
      const available = initial.lots.find(lot => lot.item === 'herb' && lot.id === 'stock-herb')!;
      assert.equal(available.count, 14, 'one shared daily restock');
      for (const [actor, count] of [['merchant', 4], ['rival', 10]] as const) {
        const before = wealth(state), view = fantasyEconomyState(economy, new Map(Object.entries(state.profiles)), actor, { hour: at, peers: Object.keys(state.profiles) }).shops.find(shop => shop.building === 'market')!;
        assert.equal(trade(actor, { type: 'shopBuy', building: 'market', item: 'herb', count, revision: view.revision }, at).error, undefined);
        totals.shopSpending += before - wealth(state); totals.marketHerbsBought += count;
      }
      const depleted = fantasyEconomyState(economy, new Map(Object.entries(state.profiles)), 'rival', { hour: at, peers: Object.keys(state.profiles) }).shops.find(shop => shop.building === 'market')!;
      const before = structuredClone(state.profiles);
      assert.equal(trade('rival', { type: 'shopBuy', building: 'market', item: 'herb', count: 1, revision: depleted.revision }, at).error, 'stock');
      assert.deepEqual(state.profiles, before); totals.stockProbes++;
      assert.equal(trade('rival', { type: 'sync' }, at).error, undefined);
      assert.equal(fantasyEconomyState(economy, new Map(Object.entries(state.profiles)), 'merchant', { hour: at, peers: Object.keys(state.profiles) }).shops.find(shop => shop.building === 'market')!.lots.find(lot => lot.item === 'herb')!.count, 0);
      property('merchant', 'hearth', 'warehouseDeposit', { item: 'herb', count: 4 }, at);
      const patronShop = fantasyEconomyState(economy, new Map(Object.entries(state.profiles)), 'patron', { hour: at, peers: Object.keys(state.profiles) }).shops.find(shop => shop.building === 'market')!;
      const beforeFish = wealth(state);
      assert.equal(trade('patron', { type: 'shopBuy', building: 'market', item: 'fish', count: 1, revision: patronShop.revision }, at).error, undefined);
      totals.shopSpending += beforeFish - wealth(state);
      const request = { recipe: 'cook-meal', npcId: 'artisan-hearth-nella' }, p = state.profiles.patron;
      const quote = quoteFantasyCommission(p.character!, request); assert.equal(quote.error, undefined);
      const result = applyFantasyCommission(p, request, () => .5); assert.equal(result.error, undefined);
      state.profiles.patron = result.profile; totals.commissionFees += quote.fee; totals.commissions++;
      rows.push({ day: step / 6 + 1, at, wealth: wealth(state), businesses: structuredClone(businesses) });
    }
    assert.ok(validFantasyPropertyLedger(state.ledger));
  }
  for (const b of Object.values(businesses)) { totals.wages += b.wages; totals.businessRevenue += b.revenue; totals.produced += b.produced; totals.sold += b.sold; }
  const merchant = state.ledger.plots['hearth-commercial'].business!, smith = state.ledger.plots['emberhall-commercial'].business!;
  assert.equal((merchant.inventory.herb ?? 0) + businesses.merchant.sold, 40 + days * 4, 'stock sales conserve real herbs');
  assert.equal((smith.inventory.ore ?? 0) + businesses.smith.produced * 2, 80);
  assert.equal((smith.inventory.wood ?? 0) + businesses.smith.produced, 40);
  assert.equal((smith.inventory.ingot ?? 0) + businesses.smith.sold, businesses.smith.produced);
  assert.equal(state.profiles.patron.character!.inventory.meal, days);
  assert.equal(state.profiles.patron.character!.inventory.fish ?? 0, 0);
  assert.equal(state.profiles.patron.character!.inventory.herb, 14 - days);
  const closingGold = wealth(state), expectedGold = totals.openingGold - totals.propertyAndHire - totals.taxes - totals.shopSpending - totals.commissionFees - totals.wages + totals.businessRevenue;
  assert.equal(closingGold, expectedGold, 'all minted and spent currency is accounted');
  return { season, days, players: 4, start, end: start + days * 24, totals: { ...totals, closingGold, accountingResidual: closingGold - expectedGold }, businesses,
    closing: { merchant: structuredClone(merchant), smith: structuredClone(smith) }, rows };
}

export function runEconomySuite() { return Object.keys(seasons).map(season => runEconomySimulation(season as keyof typeof seasons)); }
export function economyDemandMatrix() {
  return Object.entries(seasons).flatMap(([season, start]) => ['hearth', 'emberhall', 'tidehaven', 'pinewatch', 'sunloom'].flatMap(location =>
    ['quilted-travelcoat', 'jerky', 'ingot', 'moonmint'].map(item => {
      const shifts = Array.from({ length: 6 }, (_, i) => fantasyBusinessDemand(location, item, start + i * 4, 1, start + i * 4 - 2));
      assert.ok(shifts.every(shift => shift.quantity >= 0 && shift.quantity <= 3 && (shift.open || shift.quantity === 0)));
      return { season, location, item, dailyCustomers: shifts.reduce((sum, shift) => sum + shift.quantity, 0), shifts: shifts.map(shift => shift.quantity) };
    })));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const results = runEconomySuite(), out = path.resolve(process.argv[2] ?? 'work/qa/institutions-v9-2026-10-31/economy-simulation.json');
  const sourceHashes = Object.fromEntries(['scripts/fantasy-economy-v9-simulation.ts', 'shared/fantasy-business.ts', 'shared/fantasy-business-demand.ts', 'shared/fantasy-economy.ts', 'shared/fantasy-commissions.ts', 'shared/fantasy-property.ts', 'shared/fantasy-property-extensions.ts', 'shared/fantasy-data.ts'].map(file => [file, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify({ version: 1, sourceHashes, results, demandMatrix: economyDemandMatrix() }, null, 2) + '\n');
  console.log(JSON.stringify(results.map(({ season, totals, businesses }) => ({ season, totals, businesses })), null, 2));
}
