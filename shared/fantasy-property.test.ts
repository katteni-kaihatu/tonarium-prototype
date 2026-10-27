import test from 'node:test';
import assert from 'node:assert/strict';
import { newFantasyProfile, applyFantasyAction, startFantasyActivity, advanceFantasyWorld, fantasyStats } from './fantasy-engine.ts';
import type { FantasyProfile } from './fantasy.ts';
import { FANTASY_PROPERTY_PLOTS, newFantasyPropertyLedger, applyFantasyPropertyCommand, reconcileFantasyProperties, fantasyPropertyState, validFantasyPropertyLedger, validFantasyPropertyTitles,
  isFantasyPropertyCommand, fantasyPropertyUseError, fantasyPropertyUseHours, applyFantasyPropertyUse, fantasyPropertyText, type FantasyPropertyCommand, type FantasyPropertyLedger } from './fantasy-property.ts';
import { FANTASY_SETTLEMENTS } from './fantasy-town.ts';

function person(name = 'Alice'): FantasyProfile {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name }, () => .99).profile;
  p.character!.gold = 5000; p.character!.hour = 25; p.character!.location = 'hearth'; return p;
}
const home = 'hearth-residence', farm = 'hearth-farmland', shop = 'hearth-commercial';
const command = (type: 'buy' | 'use' | 'cancel', plot: string, revision: number, requestId = `${type}-${plot}-${revision}`): FantasyPropertyCommand => ({ type, plot, revision, requestId });
function acquire(plot = home) {
  const a = person(), b = person('Bob');
  const result = applyFantasyPropertyCommand(newFantasyPropertyLedger(), { a, b }, 'a', command('buy', plot, 0), 25);
  assert.equal(result.error, undefined); return result;
}

test('property catalog covers existing settlements with local kinds and three-language effects', () => {
  assert.equal(new Set(FANTASY_PROPERTY_PLOTS.map(plot => plot.location)).size, 20);
  assert.equal(new Set(FANTASY_PROPERTY_PLOTS.map(plot => plot.id)).size, FANTASY_PROPERTY_PLOTS.length);
  assert.ok(FANTASY_PROPERTY_PLOTS.every(plot => FANTASY_SETTLEMENTS[plot.location].kind !== 'tower' && ['ko', 'en', 'ja'].every(locale => !!plot.names[locale as 'ko'])));
  assert.equal(FANTASY_PROPERTY_PLOTS.some(plot => plot.location === 'starspire'), false);
  assert.equal(FANTASY_PROPERTY_PLOTS.some(plot => plot.id === 'sunmeadow-commercial'), false);
  assert.equal(FANTASY_PROPERTY_PLOTS.some(plot => plot.id === 'tidehaven-farmland'), false);
});
test('property ledger validates strict prices, record keys and receipt identity', () => {
  assert.equal(validFantasyPropertyLedger(newFantasyPropertyLedger()), true);
  for (const mutate of [(l: FantasyPropertyLedger) => { l.plots[home].listing!.price = 1; }, (l: FantasyPropertyLedger) => { l.plots[home].revision = -1; },
    (l: FantasyPropertyLedger) => { (l as unknown as Record<string, unknown>).secret = true; }, (l: FantasyPropertyLedger) => { l.receipts.forged = { actor: 'a', generation: 1, requestId: 'x', plot: home, operation: 'buy', hour: 1 }; }]) {
    const l = newFantasyPropertyLedger(); mutate(l); assert.equal(validFantasyPropertyLedger(l), false);
  }
  assert.equal(validFantasyPropertyLedger(acquire().ledger), true);
  assert.equal(isFantasyPropertyCommand({ type: 'buy', plot: home, revision: 0, requestId: 'one', price: 1 }), false);
  assert.equal(isFantasyPropertyCommand({ type: 'list', plot: home, revision: 0, requestId: 'one', price: .1 }), false);
});
test('buying applies server price once and rejects a concurrent stale buyer', () => {
  const original = { a: person(), b: person('Bob') }, ledger = newFantasyPropertyLedger(), price = ledger.plots[home].listing!.price;
  const first = applyFantasyPropertyCommand(ledger, original, 'a', command('buy', home, 0), 25);
  assert.equal(first.profiles.a.character!.gold, 5000 - price); assert.deepEqual(first.profiles.a.character!.propertyTitles, [home]);
  assert.equal(original.a.character!.gold, 5000); assert.equal(ledger.plots[home].owner, null);
  const duplicate = applyFantasyPropertyCommand(first.ledger, first.profiles, 'a', command('buy', home, 0), 25);
  assert.equal(duplicate.changed, false); assert.equal(duplicate.error, undefined);
  const second = applyFantasyPropertyCommand(first.ledger, first.profiles, 'b', command('buy', home, 0), 25);
  assert.equal(second.error, 'stale'); assert.equal(second.profiles.b.character!.gold, 5000);
});
test('resale moves the same deed and conserves buyer/seller gold atomically', () => {
  const owned = acquire();
  const listed = applyFantasyPropertyCommand(owned.ledger, owned.profiles, 'a', { type: 'list', plot: home, revision: 1, requestId: 'list-once', price: 777 }, 25);
  assert.equal(listed.error, undefined);
  const totalBefore = listed.profiles.a.character!.gold + listed.profiles.b.character!.gold;
  const bought = applyFantasyPropertyCommand(listed.ledger, listed.profiles, 'b', command('buy', home, 2), 25);
  assert.equal(bought.error, undefined); assert.equal(bought.ledger.plots[home].owner!.user, 'b');
  assert.equal(bought.profiles.b.character!.gold, 4223); assert.equal(bought.profiles.a.character!.gold + bought.profiles.b.character!.gold, totalBefore);
  assert.deepEqual(bought.profiles.a.character!.propertyTitles, []); assert.deepEqual(bought.profiles.b.character!.propertyTitles, [home]);
  assert.equal(bought.ledger.plots[home].listing, null); assert.equal(validFantasyPropertyLedger(bought.ledger), true);
});
test('ownership, location, funds, current activity and a three-property limit are enforced', () => {
  const a = person(), b = person('Bob'), ledger = newFantasyPropertyLedger(); a.character!.gold = 0;
  assert.equal(applyFantasyPropertyCommand(ledger, { a }, 'a', command('buy', home, 0), 25).error, 'insufficient-gold');
  a.character!.gold = 5000; a.character!.location = 'greenwood';
  assert.equal(applyFantasyPropertyCommand(ledger, { a }, 'a', command('buy', home, 0), 25).error, 'unavailable');
  a.character!.location = 'hearth'; a.combatId = 'battle';
  assert.equal(applyFantasyPropertyCommand(ledger, { a }, 'a', command('buy', home, 0), 25).error, 'busy'); delete a.combatId;
  let state = applyFantasyPropertyCommand(ledger, { a, b }, 'a', command('buy', home, 0), 25);
  for (const plot of [farm, shop]) state = applyFantasyPropertyCommand(state.ledger, state.profiles, 'a', command('buy', plot, 0), 25);
  state.profiles.a.character!.location = 'sunmeadow';
  assert.equal(applyFantasyPropertyCommand(state.ledger, state.profiles, 'a', command('buy', 'sunmeadow-residence', 0), 25).error, 'limit');
  assert.equal(applyFantasyPropertyCommand(state.ledger, state.profiles, 'b', { type: 'list', plot: home, revision: 1, requestId: 'steal-deed', price: 1 }, 25).error, 'not-owner');
});
test('death preserves an estate and a new generation neither inherits nor trades it', () => {
  const state = acquire(); state.profiles.a.death = { location: 'greenwood', hour: 26, cause: 'test' }; state.profiles.a.character!.hp = 0;
  const reconciled = reconcileFantasyProperties(state.ledger, state.profiles);
  assert.equal(reconciled.changed, true); assert.equal(reconciled.ledger.plots[home].owner!.estate, true); assert.equal(reconciled.ledger.plots[home].listing, null);
  assert.deepEqual(reconciled.profiles.a.character!.propertyTitles, []); assert.equal(validFantasyPropertyLedger(reconciled.ledger), true);
  const next = person('Next'); next.generation = 2; const profiles = { ...reconciled.profiles, a: next };
  const view = fantasyPropertyState(reconciled.ledger, profiles, 'a'); assert.equal(view.owned.length, 0); assert.equal(view.legacies[0].ownerName, 'Alice');
  assert.equal(applyFantasyPropertyCommand(reconciled.ledger, profiles, 'a', command('buy', home, 2, 'inherit'), 27).error, 'estate');
  assert.equal(fantasyPropertyUseError(next, home), 'property:not-owner');
  assert.equal(JSON.stringify(view).includes('"user"'), false);
});
test('generation change without a death flag still becomes a historical estate', () => {
  const state = acquire(); state.profiles.a.generation = 2;
  const reconciled = reconcileFantasyProperties(state.ledger, state.profiles);
  assert.equal(reconciled.ledger.plots[home].owner!.estate, true); assert.deepEqual(reconciled.profiles.a.character!.propertyTitles, []);
  assert.equal(reconcileFantasyProperties(reconciled.ledger, reconciled.profiles).changed, false);
});
test('public state contains only current local plots and the owner’s known properties', () => {
  const state = acquire(); state.profiles.b.character!.location = 'greenwood';
  const view = fantasyPropertyState(state.ledger, state.profiles, 'b'); assert.equal(view.plots.length, 0); assert.equal(view.owned.length, 0); assert.equal(view.legacies.length, 0);
  state.profiles.a.character!.location = 'greenwood';
  const own = fantasyPropertyState(state.ledger, state.profiles, 'a'); assert.equal(own.owned.length, 1); assert.equal(own.plots.length, 0);
});
test('a listed property must be withdrawn before using, and cancellation keeps ownership', () => {
  const own = acquire(), listed = applyFantasyPropertyCommand(own.ledger, own.profiles, 'a', { type: 'list', plot: home, revision: 1, requestId: 'listing', price: 1 }, 25);
  assert.equal(applyFantasyPropertyCommand(listed.ledger, listed.profiles, 'a', command('use', home, 2), 25).error, 'listed');
  const cancel = applyFantasyPropertyCommand(listed.ledger, listed.profiles, 'a', command('cancel', home, 2), 25);
  assert.equal(cancel.error, undefined); assert.equal(cancel.ledger.plots[home].listing, null); assert.equal(cancel.ledger.plots[home].owner!.user, 'a');
});
test('using farmland is a timed reservation and harvest does not happen before completion', () => {
  const state = acquire(farm), p = state.profiles.a; p.character!.job = 'farmer'; p.character!.jobXp.farmer = 0;
  const before = p.character!.inventory.herb ?? 0;
  const reservation = applyFantasyPropertyCommand(state.ledger, state.profiles, 'a', command('use', farm, 1), 25);
  assert.deepEqual(reservation.activity, { user: 'a', action: { type: 'propertyUse', plot: farm } }); assert.equal(reservation.profiles.a.character!.inventory.herb ?? 0, before);
  const started = startFantasyActivity(p, reservation.activity!.action, 25, () => .9);
  assert.equal(started.error, undefined); assert.equal(started.profile.activity!.endsAt, 29);
  assert.equal(advanceFantasyWorld(started.profile, 28.99).profile.character!.inventory.herb ?? 0, before);
  const done = advanceFantasyWorld(started.profile, 29).profile;
  assert.equal(done.activity, undefined); assert.equal(done.character!.inventory.herb, before + 2); assert.ok(done.character!.jobXp.farmer > 0);
});
test('farmland yields follow relevant proficiency and repeated use gives diminishing mastery', () => {
  let p = acquire(farm).profiles.a; p.character!.job = 'farmer'; p.character!.jobXp.farmer = 100;
  const before = p.character!.inventory.herb ?? 0, first = applyFantasyPropertyUse(p, farm);
  assert.equal(first.profile.character!.inventory.herb, before + 3); assert.equal(first.profile.character!.jobXp.farmer, 103);
  const second = applyFantasyPropertyUse(first.profile, farm); assert.equal(second.profile.character!.jobXp.farmer, 104);
  p = acquire(farm).profiles.a; p.character!.job = 'mage'; p.character!.jobXp.mage = 600;
  assert.equal(applyFantasyPropertyUse(p, farm).profile.character!.inventory.herb, (p.character!.inventory.herb ?? 0) + 2);
});
test('business consumes real supplies and grants mastery only for relevant jobs', () => {
  const p = acquire(shop).profiles.a; p.character!.inventory.herb = 1; p.character!.job = 'merchant'; p.character!.jobXp.merchant = 0;
  const gold = p.character!.gold, result = applyFantasyPropertyUse(p, shop);
  assert.equal(result.profile.character!.inventory.herb, undefined); assert.ok(result.profile.character!.gold > gold); assert.equal(result.profile.character!.jobXp.merchant, 3);
  assert.equal(fantasyPropertyUseError(result.profile, shop), 'property:missing-material');
  p.character!.job = 'mage'; p.character!.jobXp.mage = 0; assert.equal(applyFantasyPropertyUse(p, shop).profile.character!.jobXp.mage, 0);
});
test('home rest respects current HP/MP maxima and never advances the clock itself', () => {
  const p = acquire().profiles.a; p.character!.fatigue = 90; p.character!.hp = 1; p.character!.mp = 0;
  const maximum = fantasyStats(p.character!), result = applyFantasyPropertyUse(p, home, maximum), c = result.profile.character!;
  assert.equal(c.fatigue, 15); assert.equal(c.hp, Math.min(maximum.hp, 31)); assert.equal(c.mp, Math.min(maximum.mp, 15)); assert.equal(c.hour, p.character!.hour);
  assert.equal(fantasyPropertyUseHours(home), 8); assert.equal(fantasyPropertyUseHours(farm), 4); assert.equal(fantasyPropertyUseHours('unknown'), 0);
});
test('deed mirrors and transaction/activity messages are strict and localized', () => {
  const c = person().character!; assert.equal(validFantasyPropertyTitles(c), true); c.propertyTitles = [home, home]; assert.equal(validFantasyPropertyTitles(c), false);
  c.propertyTitles = ['forged']; assert.equal(validFantasyPropertyTitles(c), false); c.propertyTitles = [home]; assert.equal(validFantasyPropertyTitles(c), true);
  for (const locale of ['ko', 'en', 'ja'] as const) for (const message of ['property:busy', 'estate', `property:bought:${home}:360`, `property:harvest:${farm}:herb:2`, `property:rest:${home}:75`, `property:operate:${shop}:17`]) assert.ok(fantasyPropertyText(message, locale));
});
