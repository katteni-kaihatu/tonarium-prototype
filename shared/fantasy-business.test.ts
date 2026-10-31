import { fantasyBusinessDemand } from './fantasy-business-demand.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { newFantasyPropertyLedger, applyFantasyPropertyCommand, FANTASY_PROPERTY_PLOTS, normalizeFantasyPropertyLedger, validFantasyPropertyLedger, fantasyPropertyState, type FantasyPropertyChange } from './fantasy-property.ts';
import { advanceFantasyBusinesses, fantasyWorkforceState, fantasyPropertyStorageCapacity, isFantasyBusinessCommand } from './fantasy-business.ts';
import { fantasyBlackMarketOpening } from './fantasy-black-market.ts';

function person(name = 'Rael') {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name, gender: 'female' }, () => .99).profile;
  p.character!.gold = 90_000; p.character!.hour = 25; p.character!.location = 'hearth';
  p.character!.inventory.herb = 20;
  return p;
}
function setup(): FantasyPropertyChange {
  return applyFantasyPropertyCommand(newFantasyPropertyLedger(), { a: person(), b: person('Else') }, 'a', { type: 'buy', plot: 'hearth-commercial', revision: 0, requestId: 'buy' }, 25);
}
let sequence = 0;
function command(state: FantasyPropertyChange, type: string, extra: Record<string, unknown> = {}, at = 25) {
  const result = applyFantasyPropertyCommand(state.ledger, state.profiles, 'a', { type, plot: 'hearth-commercial', revision: state.ledger.plots['hearth-commercial'].revision, requestId: `request-${++sequence}`, ...extra } as any, at);
  assert.equal(result.error, undefined); return result;
}
function operation() {
  let state = setup();
  state = command(state, 'workerHire', { npc: 'artisan-1', source: 'guild' });
  state = command(state, 'warehouseDeposit', { item: 'herb', count: 10 });
  state = command(state, 'businessDeposit', { amount: 50 });
  return command(state, 'workerAssign', { npc: 'artisan-1', job: 'merchant', mode: 'sell' });
}

test('mansion normalization adds only missing new deeds and preserves every old record', () => {
  const state = setup(), old = structuredClone(state.ledger);
  for (const plot of FANTASY_PROPERTY_PLOTS.filter(p => p.mansion)) delete old.plots[plot.id];
  const normalized = normalizeFantasyPropertyLedger(old)!;
  assert.equal(validFantasyPropertyLedger(normalized), true);
  assert.deepEqual(normalized.plots['hearth-commercial'], state.ledger.plots['hearth-commercial']);
  assert.equal(normalized.revision, old.revision);
  delete old.plots['hearth-residence'];
  assert.equal(normalizeFantasyPropertyLedger(old), undefined);
});

test('a named candidate can be hired by only one owner globally, once per receipt', () => {
  const state = setup(), request = { type: 'workerHire' as const, plot: 'hearth-commercial', revision: state.ledger.plots['hearth-commercial'].revision, requestId: 'hire-once', npc: 'artisan-1', source: 'guild' as const };
  const hired = applyFantasyPropertyCommand(state.ledger, state.profiles, 'a', request, 25);
  assert.equal(hired.error, undefined); assert.equal(hired.ledger.employees!['artisan-1'].user, 'a');
  assert.equal(state.ledger.employees, undefined);
  const retry = applyFantasyPropertyCommand(hired.ledger, hired.profiles, 'a', request, 25);
  assert.equal(retry.changed, false); assert.equal(retry.error, undefined);
  const other = applyFantasyPropertyCommand(hired.ledger, hired.profiles, 'b', { ...request, revision: hired.ledger.plots['hearth-commercial'].revision, requestId: 'else-hire' }, 25);
  assert.equal(other.error, 'unavailable');
  assert.equal(fantasyWorkforceState(hired.ledger, hired.profiles, 'b', 25).candidates.some(n => n.id === 'artisan-1'), false);
});

test('public worker views omit hidden skills and learning until leader or charisma threshold', () => {
  const state = operation();
  const hidden = fantasyPropertyState(state.ledger, state.profiles, 'a').workforce!;
  assert.equal(hidden.canInspect, false);
  assert.equal(hidden.employees[0].details, undefined);
  assert.equal(JSON.stringify(hidden).includes('"learning"'), false);
  assert.equal(JSON.stringify(hidden).includes('"skills"'), false);
  state.profiles.a.character!.job = 'leader'; state.profiles.a.character!.jobXp.leader = 0;
  const visible = fantasyPropertyState(state.ledger, state.profiles, 'a').workforce!;
  assert.equal(visible.canInspect, true); assert.ok(visible.employees[0].details!.learning >= 1);
});

test('work consumes real supplies and wages, grows private XP and never repeats a settled hour', () => {
  const state = operation(), before = structuredClone(state.ledger), xp = state.ledger.employees!['artisan-1'].skills.merchant;
  assert.equal(advanceFantasyBusinesses(state.ledger, state.profiles, 28), false);
  assert.equal(advanceFantasyBusinesses(state.ledger, state.profiles, 29), true);
  assert.equal(state.ledger.employees!['artisan-1'].skills.merchant, xp);
  assert.equal(advanceFantasyBusinesses(state.ledger, state.profiles, 33), true);
  const b = state.ledger.plots['hearth-commercial'].business!;
  assert.equal(b.inventory.herb, 9); assert.ok(b.treasury > 50);
  assert.ok(state.ledger.employees!['artisan-1'].skills.merchant > xp);
  const settled = structuredClone(state.ledger);
  assert.equal(advanceFantasyBusinesses(state.ledger, state.profiles, 33), false); assert.deepEqual(state.ledger, settled);
  assert.equal(before.plots['hearth-commercial'].business!.inventory.herb, 10);
});

test('offline settlement is capped and stocking after missed hours never backfills production', () => {
  const state = operation(); state.ledger.plots['hearth-commercial'].business!.inventory.herb = 100;
  advanceFantasyBusinesses(state.ledger, state.profiles, 25 + 4 * 100);
  const sold = Array.from({ length: 12 }, (_, i) => fantasyBusinessDemand('hearth', 'herb', 425 - (11 - i) * 4, 1, 423 - (11 - i) * 4).quantity).reduce((sum, n) => sum + n, 0);
  assert.equal(state.ledger.plots['hearth-commercial'].business!.inventory.herb, 100 - sold);
  const b = state.ledger.plots['hearth-commercial'].business!; b.inventory = {};
  advanceFantasyBusinesses(state.ledger, state.profiles, 445);
  const stocked = command(state, 'warehouseDeposit', { item: 'herb', count: 1 }, 445);
  assert.equal(stocked.ledger.plots['hearth-commercial'].business!.inventory.herb, 1);
  advanceFantasyBusinesses(stocked.ledger, stocked.profiles, 445);
  assert.equal(stocked.ledger.plots['hearth-commercial'].business!.inventory.herb, 1);
});

test('death keeps workers in the prior life and expires ordinary contracts without inheritance', () => {
  const state = operation(); state.profiles.a.generation = 2;
  advanceFantasyBusinesses(state.ledger, state.profiles, 29);
  assert.equal(state.ledger.employees!['artisan-1'].estate, true);
  assert.equal(fantasyWorkforceState(state.ledger, state.profiles, 'a', 29).employees.length, 0);
  assert.equal(fantasyWorkforceState(state.ledger, state.profiles, 'b', 29).candidates.some(n => n.id === 'artisan-1'), false);
  const normal = operation(); advanceFantasyBusinesses(normal.ledger, normal.profiles, 25 + 720);
  assert.equal(normal.ledger.employees!['artisan-1'], undefined);
});

test('black-market workers require both a clue and an actually open intermittent market', () => {
  const state = setup(), realm = 'night-realm';
  let at = 20;
  while (!fantasyBlackMarketOpening('hearth', at, realm).open && at < 2000) at += 24;
  assert.ok(at < 2000);
  assert.equal(fantasyWorkforceState(state.ledger, state.profiles, 'a', at, realm).candidates.some(n => n.source === 'blackMarket'), false);
  state.profiles.a.character!.blackMarketClues = ['hearth'];
  assert.equal(fantasyWorkforceState(state.ledger, state.profiles, 'a', at, realm).candidates.filter(n => n.source === 'blackMarket').length, 6);
  assert.equal(fantasyWorkforceState(state.ledger, state.profiles, 'a', at + 12, realm).candidates.some(n => n.source === 'blackMarket'), false);
});

test('desk and drawers expand a small residence while strict warehouse commands reject extra fields', () => {
  const record = newFantasyPropertyLedger().plots['hearth-residence'];
  assert.equal(fantasyPropertyStorageCapacity('hearth-residence', record).capacity, 12_000);
  record.furniture = [{ item: 'furniture-desk', user: 'a', generation: 1, hour: 0 }, { item: 'furniture-drawers', user: 'a', generation: 1, hour: 0 }];
  assert.equal(fantasyPropertyStorageCapacity('hearth-residence', record).capacity, 60_000);
  assert.equal(isFantasyBusinessCommand({ type: 'warehouseDeposit', plot: 'hearth-residence', revision: 0, requestId: 'x', item: 'ore', count: 1, skills: { merchant: 999 } }), false);
});

test('food storage retains original timestamps and withdrawal preserves spoilage', () => {
  let state = setup();
  const c = state.profiles.a.character!; c.inventory.bread = 2; c.foodLots = [{ id: 'original-bread', item: 'bread', count: 2, createdAt: 1 }];
  state = command(state, 'warehouseDeposit', { item: 'bread', count: 2, quality: 'fresh' });
  const parcel = state.ledger.plots['hearth-commercial'].business!.parcels![0];
  assert.equal(parcel.goods.food![0].createdAt, 1); assert.equal(state.profiles.a.character!.inventory.bread??0, 0);
  state.profiles.a.character!.hour = 60;
  state = command(state, 'warehouseWithdraw', { item: 'bread', count: 2, parcel: parcel.id }, 60);
  assert.equal(state.profiles.a.character!.foodLots[0].createdAt, 1);
});


test('season and location alter actual customer quantities for the same product', () => {
  const total = (location: string, item: string, start: number) => Array.from({ length: 12 }, (_, i) => fantasyBusinessDemand(location, item, start + i * 4).quantity).reduce((sum, n) => sum + n, 0);
  assert.ok(total('hearth', 'quilted-travelcoat', 1080) > total('hearth', 'quilted-travelcoat', 360));
  assert.ok(total('tidehaven', 'jerky', 25) > total('emberhall', 'jerky', 25));
  assert.equal(total('tidehaven','jerky',25),total('hearth','jerky',25),'both actual seaports share the preserved-food demand bonus');
  assert.ok(total('emberhall', 'ingot', 25) > total('hearth', 'ingot', 25));
  assert.ok(total('sunloom', 'moonmint', 360) > total('hearth', 'moonmint', 360));
  assert.deepEqual(fantasyBusinessDemand('hearth', 'quilted-travelcoat', 364), fantasyBusinessDemand('hearth', 'quilted-travelcoat', 364));
});

test('low demand leaves crafted stock while craft-only mode never converts goods into gold', () => {
  let state = setup(); state = command(state, 'workerHire', { npc: 'artisan-1', source: 'guild' });
  state.ledger.plots['hearth-commercial'].business = { inventory: { linen: 12, 'wolf-hide': 4 }, treasury: 50, lastAt: 360 };
  state.ledger.employees!['artisan-1'].hiredAt = 360; state.ledger.employees!['artisan-1'].expiresAt = 1080;
  state = command(state, 'workerAssign', { npc: 'artisan-1', job: 'tailor', mode: 'sell', recipe: 'tailor-quilted-coat' }, 372);
  advanceFantasyBusinesses(state.ledger, state.profiles, 376);
  const b = state.ledger.plots['hearth-commercial'].business!;
  assert.equal(b.report!.produced, 1); assert.equal(b.report!.sold, 0); assert.equal(b.parcels!.filter(p => p.goods.item === 'quilted-travelcoat').length, 1);
  const treasury = b.treasury;
  state = command(state, 'workerAssign', { npc: 'artisan-1', job: 'tailor', mode: 'craft', recipe: 'tailor-quilted-coat' }, 376);
  advanceFantasyBusinesses(state.ledger, state.profiles, 380);
  assert.equal(state.ledger.plots['hearth-commercial'].business!.report!.sold, 0);
  assert.equal(state.ledger.plots['hearth-commercial'].business!.treasury, treasury - 3);
});


test('shops sell in a daylight 14-18 shift and close for an 18-22 shift', () => {
  const day = fantasyBusinessDemand('hearth', 'wood', 18, 1, 16), night = fantasyBusinessDemand('hearth', 'wood', 22, 1, 20);
  assert.equal(day.open, true); assert.ok(day.quantity > 0);
  assert.equal(night.open, false); assert.equal(night.quantity, 0); assert.equal(night.percent, 0);
  assert.equal(fantasyBusinessDemand('hearth', 'wood', 18).quantity, 0);
  assert.equal(fantasyBusinessDemand('hearth', 'wood', 6).open, true);
});

test('purchased black-market workers remain bound past thirty days, with no duplicate resale', () => {
  let state = setup(); const realm = 'bound-workers'; let at = 20;
  while (!fantasyBlackMarketOpening('hearth', at, realm).open && at < 2000) at += 24;
  state.profiles.a.character!.blackMarketClues = ['hearth'];
  state = applyFantasyPropertyCommand(state.ledger, state.profiles, 'a', { type: 'workerHire', plot: 'hearth-commercial', revision: state.ledger.plots['hearth-commercial'].revision, requestId: 'buy-bound', npc: 'artisan-25', source: 'blackMarket' }, at, realm);
  assert.equal(state.error, undefined);
  advanceFantasyBusinesses(state.ledger, state.profiles, at + 24 * 90);
  assert.equal(state.ledger.employees!['artisan-25'].user, 'a');
  assert.equal(state.ledger.employees!['artisan-25'].expiresAt, Number.MAX_SAFE_INTEGER);
  assert.equal(fantasyWorkforceState(state.ledger, state.profiles, 'a', at + 24 * 90, realm).employees.find(n => n.id === 'artisan-25')!.expiresAt, undefined);
  assert.equal(fantasyWorkforceState(state.ledger, state.profiles, 'b', at + 24 * 90, realm).candidates.some(n => n.id === 'artisan-25'), false);
  state.profiles.a.generation = 2; advanceFantasyBusinesses(state.ledger, state.profiles, at + 24 * 91);
  assert.equal(state.ledger.employees!['artisan-25'].estate, true);
  assert.equal(fantasyWorkforceState(state.ledger, state.profiles, 'a', at + 24 * 91, realm).employees.some(n => n.id === 'artisan-25'), false);
});


test('freeing enlisted workers removes both employer registry and company member atomically', () => {
  let state = setup(); const realm = 'release-company'; let at = 20;
  while (!fantasyBlackMarketOpening('hearth', at, realm).open && at < 2000) at += 24;
  state.profiles.a.character!.blackMarketClues = ['hearth'];
  state = applyFantasyPropertyCommand(state.ledger, state.profiles, 'a', { type: 'workerHire', plot: 'hearth-commercial', revision: state.ledger.plots['hearth-commercial'].revision, requestId: 'buy-release', npc: 'artisan-25', source: 'blackMarket' }, at, realm);
  assert.equal(state.error, undefined);
  state = command(state, 'workerCompany', { npc: 'artisan-25' }, at);
  assert.equal(state.ledger.employees!['artisan-25'].company, true);
  assert.equal(state.profiles.a.character!.specialization!.companies!.troop!.members.some(m => m.id === 'worker-artisan-25'), true);
  const original = structuredClone(state);
  state = command(state, 'workerRelease', { npc: 'artisan-25' }, at);
  assert.equal(state.ledger.employees!['artisan-25'], undefined);
  assert.equal(state.profiles.a.character!.specialization!.companies!.troop!.members.some(m => m.id === 'worker-artisan-25'), false);
  assert.equal(original.ledger.employees!['artisan-25'].company, true);
  assert.equal(original.profiles.a.character!.specialization!.companies!.troop!.members.some(m => m.id === 'worker-artisan-25'), true);
});


test('independent NPC skill growth survives release and rehiring by another player', () => {
  let state = operation(); advanceFantasyBusinesses(state.ledger, state.profiles, 33);
  const learned = structuredClone(state.ledger.employees!['artisan-1'].skills), learning = state.ledger.employees!['artisan-1'].learning;
  state = command(state, 'workerRelease', { npc: 'artisan-1' }, 33);
  assert.equal(state.ledger.employees!['artisan-1'], undefined);
  assert.deepEqual(state.ledger.workerProgress!['artisan-1'], learned);
  state.profiles.b.character!.job = 'leader'; state.profiles.b.character!.jobXp.leader = 0;
  const candidate = fantasyWorkforceState(state.ledger, state.profiles, 'b', 33).candidates.find(n => n.id === 'artisan-1')!;
  assert.deepEqual(candidate.details!.skills, learned);
  state = applyFantasyPropertyCommand(state.ledger, state.profiles, 'b', { type: 'workerHire', plot: 'hearth-commercial', revision: state.ledger.plots['hearth-commercial'].revision, requestId: 'rehire-independent', npc: 'artisan-1', source: 'guild' }, 33);
  assert.equal(state.error, undefined);
  const rehired = Object.values(state.ledger.employees!).find(worker=>worker.npc==='artisan-1');
  assert.ok(rehired);
  assert.equal(rehired.user, 'b'); assert.deepEqual(rehired.skills, learned); assert.equal(rehired.learning, learning);
  assert.equal(rehired.plot, undefined); assert.equal(rehired.job, undefined); assert.equal(rehired.company, undefined);
  assert.equal(rehired.hiredAt, 33); assert.equal(rehired.lastAt, 33);
  assert.equal(Object.keys(state.ledger.workerProgress!['artisan-1']).every(key => key === 'merchant'), true);
});

test('ordinary contract expiry preserves skills without preserving the prior employer or activity', () => {
  let state = operation(); advanceFantasyBusinesses(state.ledger, state.profiles, 33);
  const learned = structuredClone(state.ledger.employees!['artisan-1'].skills);
  advanceFantasyBusinesses(state.ledger, state.profiles, 745);
  assert.equal(state.ledger.employees!['artisan-1'], undefined); assert.deepEqual(state.ledger.workerProgress!['artisan-1'], learned);
  state = applyFantasyPropertyCommand(state.ledger, state.profiles, 'b', { type: 'workerHire', plot: 'hearth-commercial', revision: state.ledger.plots['hearth-commercial'].revision, requestId: 'rehire-after-expiry', npc: 'artisan-1', source: 'guild' }, 745);
  assert.equal(state.error, undefined); const rehired = Object.values(state.ledger.employees!).find(worker=>worker.npc==='artisan-1'); assert.ok(rehired); assert.deepEqual(rehired.skills, learned);
  assert.equal(rehired.user, 'b'); assert.equal(rehired.plot, undefined);
});

test('optional growth archives keep old saves valid and reject identity data or unknown NPC skills', () => {
  const ledger = newFantasyPropertyLedger(); assert.equal(validFantasyPropertyLedger(ledger), true);
  ledger.workerProgress = { 'artisan-1': { merchant: 81, carpenter: 22 } };
  assert.equal(validFantasyPropertyLedger(ledger), true);
  ledger.workerProgress['artisan-1'] = { user: 'a' } as any;
  assert.equal(validFantasyPropertyLedger(ledger), false);
  ledger.workerProgress = { 'not-a-candidate': { merchant: 81 } };
  assert.equal(validFantasyPropertyLedger(ledger), false);
});
