import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { applyFantasyPropertyCommand, newFantasyPropertyLedger, type FantasyPropertyChange } from './fantasy-property.ts';
import { advanceFantasyBusinesses, isFantasyBusinessCommand, fantasyBusinessView } from './fantasy-business.ts';
import { validFantasyEconomyParcel } from './fantasy-economy.ts';
import { FANTASY_RECIPES } from './fantasy-data.ts';

function setup() {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Rael', gender: 'female' }, () => .99).profile;
  Object.assign(p.character!, { gold: 5000, hour: 12, location: 'hearth', inventory: { grain: 20, herb: 5 }, foodLots: [] });
  return applyFantasyPropertyCommand(newFantasyPropertyLedger(), { a: p }, 'a', { type: 'buy', plot: 'hearth-commercial', revision: 0, requestId: 'buy-production' }, 12);
}
let sequence = 0;
function command(state: FantasyPropertyChange, type: string, extra: Record<string, unknown> = {}) {
  return applyFantasyPropertyCommand(state.ledger, state.profiles, 'a', { type, plot: 'hearth-commercial', revision: state.ledger.plots['hearth-commercial'].revision, requestId: `production-${++sequence}`, ...extra } as any, 12);
}

test('farmer and fisher jobs validate as real manufacturing assignments', () => {
  for (const job of ['farmer', 'fisher']) assert.equal(isFantasyBusinessCommand({ type: 'workerAssign', plot: 'hearth-commercial', revision: 0, requestId: job, npc: job === 'farmer' ? 'artisan-31' : 'artisan-32', job, mode: 'craft', recipe: `${job}-example` }), true);
});

test('hired farmer manufactures from warehouse materials, wages and bounded training exactly once per elapsed cycle', async () => {
  const { FANTASY_RECIPES } = await import('./fantasy-data.ts');
  const recipe = FANTASY_RECIPES.find(recipe => recipe.job === 'farmer' && Object.keys(recipe.inputs).every(item => item === 'grain'));
  assert.ok(recipe, 'farmer has a grain processing recipe');
  let state = setup();
  for (const [type, extra] of [
    ['workerHire', { npc: 'artisan-31', source: 'guild' }], ['warehouseDeposit', { item: 'grain', count: 10 }], ['businessDeposit', { amount: 30 }],
    ['workerAssign', { npc: 'artisan-31', job: 'farmer', mode: 'craft', recipe: recipe.id }],
  ] as const) { state = command(state, type, extra); assert.equal(state.error, undefined); }
  const priorXp = state.ledger.employees!['artisan-31'].skills.farmer;
  assert.equal(advanceFantasyBusinesses(state.ledger, state.profiles, 16), true);
  const business = state.ledger.plots['hearth-commercial'].business!;
  assert.equal(business.inventory.grain, 10 - recipe.inputs.grain);
  assert.equal(business.inventory[recipe.output], recipe.count);
  assert.equal(business.treasury, 27); assert.ok(state.ledger.employees!['artisan-31'].skills.farmer > priorXp);
  const settled = structuredClone(state.ledger);
  assert.equal(advanceFantasyBusinesses(state.ledger, state.profiles, 16), false); assert.deepEqual(state.ledger, settled);
  business.inventory = {}; const before = business.treasury;
  advanceFantasyBusinesses(state.ledger, state.profiles, 20); assert.equal(business.treasury, before); assert.deepEqual(business.inventory, {});
});

test('a recovering or assigned fighter cannot be repurposed into production', () => {
  let state = setup();
  state.ledger.employees = { 'artisan-25': { npc: 'artisan-25', user: 'a', generation: 1, hiredAt: 0, expiresAt: Number.MAX_SAFE_INTEGER, source: 'blackMarket', skills: { farmer: 1 }, learning: 4, lastAt: 0 } };
  state.profiles.a.character!.specialization = { companies: { troop: { members: [{ id: 'worker-artisan-25', condition: 'injured', hp: 0, assigned: false, missions: 0 }] } } };
  const result = command(state, 'workerAssign', { npc: 'artisan-25', job: 'farmer', mode: 'sell', salesItem: 'herb' });
  assert.ok(result.error); assert.equal(result.changed, false); assert.equal(result.ledger, state.ledger);
});

test('owned alchemists process ordinary potions into paid claimable parcels without knowledge recipes or replay output', () => {
  for (const recipeId of ['alchemy-potion', 'alchemy-purify']) {
    const recipe = FANTASY_RECIPES.find(recipe => recipe.id === recipeId)!;
    let state = setup(); state.profiles.a.character!.inventory.crystal = 2;
    for (const [type, extra] of [
      ['workerHire', { npc: 'artisan-14', source: 'guild' }], ['warehouseDeposit', { item: 'herb', count: 4 }],
      ['warehouseDeposit', { item: 'crystal', count: 2 }], ['businessDeposit', { amount: 6 }],
    ] as const) { state = command(state, type, extra); assert.equal(state.error, undefined); }
    const view = fantasyBusinessView(state.ledger, state.profiles, 'a', 'hearth-commercial', 12)!;
    assert.ok(view.recipes.some(candidate => candidate.id === recipeId), recipeId);
    assert.ok(!view.recipes.some(candidate => /rune|map/.test(candidate.output)));
    state = command(state, 'workerAssign', { npc: 'artisan-14', job: 'alchemist', mode: 'craft', recipe: recipeId });
    assert.equal(state.error, undefined);
    const before = structuredClone(state), priorXp = state.ledger.employees!['artisan-14'].skills.alchemist;
    advanceFantasyBusinesses(state.ledger, state.profiles, 16);
    const business = state.ledger.plots['hearth-commercial'].business!, parcel = business.parcels![0];
    assert.ok(parcel); assert.equal(parcel.goods.item, recipe.output); assert.equal(parcel.goods.count, recipe.count);
    assert.equal(validFantasyEconomyParcel(parcel.goods), true); assert.equal(business.inventory[recipe.output], undefined);
    assert.equal(business.inventory.herb, 4 - recipe.inputs.herb); assert.equal(business.treasury, 3);
    assert.ok(state.ledger.employees!['artisan-14'].skills.alchemist > priorXp);
    const settled = structuredClone(state.ledger); advanceFantasyBusinesses(state.ledger, state.profiles, 16); assert.deepEqual(state.ledger, settled);
    const claim = { type: 'warehouseWithdraw' as const, plot: 'hearth-commercial', revision: state.ledger.plots['hearth-commercial'].revision, requestId: `claim-${recipeId}`, item: recipe.output, count: recipe.count, parcel: parcel.id };
    state = applyFantasyPropertyCommand(state.ledger, state.profiles, 'a', claim, 16); assert.equal(state.error, undefined);
    assert.equal(state.profiles.a.character!.inventory[recipe.output], recipe.count); assert.equal(state.ledger.plots['hearth-commercial'].business!.parcels!.length, 0);
    const replay = applyFantasyPropertyCommand(state.ledger, state.profiles, 'a', claim, 16);
    assert.equal(replay.error, undefined); assert.equal(replay.changed, false); assert.equal(replay.profiles.a.character!.inventory[recipe.output], recipe.count);
    for (const blocked of ['wages', 'materials', 'parcel-limit'] as const) {
      const stopped = structuredClone(before), stock = stopped.ledger.plots['hearth-commercial'].business!;
      if (blocked === 'wages') stock.treasury = 0;
      if (blocked === 'materials') stock.inventory.herb = 1;
      if (blocked === 'parcel-limit') stock.parcels = Array.from({ length: 64 }, (_, i) => ({ id: `existing-${i}`, goods: { item: 'potion', count: 1 } }));
      const unchanged = structuredClone(stock); advanceFantasyBusinesses(stopped.ledger, stopped.profiles, 16);
      assert.deepEqual(stock, unchanged, blocked); assert.equal(stopped.ledger.employees!['artisan-14'].skills.alchemist, priorXp);
    }
  }
});
