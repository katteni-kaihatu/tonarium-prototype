import assert from 'node:assert/strict';
import test from 'node:test';
import { runEconomySimulation, economyDemandMatrix } from './fantasy-economy-v9-simulation.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { applyFantasyPropertyCommand, newFantasyPropertyLedger } from '../shared/fantasy-property.ts';
import { advanceFantasyBusinesses } from '../shared/fantasy-business.ts';

test('four-player daily stock competition, processing, taxes and wage accounting conserve gold and goods', () => {
  const result = runEconomySimulation('spring', 2);
  assert.equal(result.players, 4);
  assert.equal(result.totals.accountingResidual, 0);
  assert.equal(result.totals.marketHerbsBought, 28);
  assert.equal(result.totals.commissions, 2);
  assert.equal(result.totals.stockProbes, 2);
  assert.ok(result.totals.replayProbes > 20);
  assert.ok(result.businesses.smith.produced > 0);
  assert.ok(result.businesses.smith.sold > 0);
  assert.ok(result.businesses.merchant.sold > 0);
  assert.ok(result.totals.taxes > 0);
  assert.ok(result.totals.wages > 0);
});

test('the local economy simulation refuses accidental unbounded or fractional durations', () => {
  for (const days of [0, -1, 15, Infinity, 1.5]) assert.throws(() => runEconomySimulation('winter', days), /bounded/);
});

test('the seasonal and local demand matrix bounds every shift and keeps product-specific demand differences', () => {
  const matrix = economyDemandMatrix(); assert.equal(matrix.length, 80);
  const demand = (season: string, location: string, item: string) => matrix.find(row => row.season === season && row.location === location && row.item === item)!.dailyCustomers;
  assert.ok(demand('winter', 'hearth', 'quilted-travelcoat') > demand('summer', 'hearth', 'quilted-travelcoat'));
  assert.ok(demand('spring', 'emberhall', 'ingot') > demand('spring', 'hearth', 'ingot'));
  assert.ok(demand('summer', 'sunloom', 'moonmint') > demand('summer', 'hearth', 'moonmint'));
});

test('a capped treasury rejects the whole sale and later withdrawal cannot buy back skipped shifts', () => {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Bound', gender: 'female' }, () => .99).profile;
  Object.assign(p.character!, { gold: 10_000, hour: 12, location: 'hearth', inventory: { herb: 10 } });
  let state = applyFantasyPropertyCommand(newFantasyPropertyLedger(), { a: p }, 'a', { type: 'buy', plot: 'hearth-commercial', revision: 0, requestId: 'bound-buy' }, 12);
  for (const [type, extra] of [
    ['workerHire', { npc: 'artisan-1', source: 'guild' }], ['warehouseDeposit', { item: 'herb', count: 10 }],
    ['businessDeposit', { amount: 100 }], ['workerAssign', { npc: 'artisan-1', job: 'merchant', mode: 'sell', salesItem: 'herb' }],
  ] as const) {
    state = applyFantasyPropertyCommand(state.ledger, state.profiles, 'a', { type, plot: 'hearth-commercial', revision: state.ledger.plots['hearth-commercial'].revision, requestId: `bound-${type}`, ...extra } as any, 12);
    assert.equal(state.error, undefined);
  }
  const b = state.ledger.plots['hearth-commercial'].business!, worker = state.ledger.employees!['artisan-1'];
  b.treasury = 1_000_000;
  const before = structuredClone(b), xp = worker.skills.merchant;
  advanceFantasyBusinesses(state.ledger, state.profiles, 16);
  assert.deepEqual(b, before); assert.equal(worker.skills.merchant, xp); assert.equal(worker.lastAt, 16);
  b.treasury = 100;
  advanceFantasyBusinesses(state.ledger, state.profiles, 16);
  assert.equal(b.inventory.herb, 10); assert.equal(b.treasury, 100);
  advanceFantasyBusinesses(state.ledger, state.profiles, 40);
  assert.ok(b.inventory.herb < 10); assert.ok(b.treasury > 100);
});
