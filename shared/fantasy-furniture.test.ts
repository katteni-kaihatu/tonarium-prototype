import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile, fantasyStats, startFantasyActivity, advanceFantasyWorld } from './fantasy-engine.ts';
import { applyFantasyPropertyCommand, applyFantasyPropertyUse, newFantasyPropertyLedger, validFantasyPropertyLedger, fantasyPropertyState, reconcileFantasyProperties, type FantasyPropertyCommand } from './fantasy-property.ts';
import { applyFantasyPropertyImprovement } from './fantasy-property-extensions.ts';
const plot = 'hearth-residence';
function fixture() {
  const player = (name: string) => { const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name }, () => .99).profile; p.character!.gold = 5000; p.character!.hour = 25; p.character!.location = 'hearth'; p.character!.inventory['furniture-bed'] = 2; p.character!.inventory['furniture-fine-bed'] = 1; p.character!.inventory['furniture-carved-stool'] = 5; return p; };
  const result = applyFantasyPropertyCommand(newFantasyPropertyLedger(), { a: player('Owner'), b: player('Tenant') }, 'a', { type: 'buy', plot, revision: 0, requestId: 'buy-house' }, 25); assert.equal(result.error, undefined); return result;
}
const furnish = (revision: number, item = 'furniture-bed', requestId = `furnish-${revision}`): FantasyPropertyCommand => ({ type: 'furnish', plot, revision, requestId, item });
test('installed beds consume inventory once, persist in the shared house, and cannot stack across bed grades', () => {
  const state = fixture(), result = applyFantasyPropertyCommand(state.ledger, state.profiles, 'a', furnish(1), 25); assert.equal(result.error, undefined); assert.equal(result.profiles.a.character!.inventory['furniture-bed'], 1); assert.equal(result.ledger.plots[plot].furniture?.[0].item, 'furniture-bed'); assert.ok(validFantasyPropertyLedger(JSON.parse(JSON.stringify(result.ledger))));
  assert.equal(applyFantasyPropertyCommand(result.ledger, result.profiles, 'a', furnish(1), 25).changed, false);
  assert.equal(applyFantasyPropertyCommand(result.ledger, result.profiles, 'a', furnish(2, 'furniture-fine-bed'), 25).error, 'furniture-limit');
  const view = fantasyPropertyState(result.ledger, result.profiles, 'a').owned[0]; assert.equal(view.furniture?.[0].item, 'furniture-bed'); assert.ok(!JSON.stringify(view.furniture).includes('"user"'));
});
test('a crafted bed improves real reserved home rest once and cannot be removed during another occupant rest', () => {
  const owned = fixture(), placed = applyFantasyPropertyCommand(owned.ledger, owned.profiles, 'a', furnish(1), 25); assert.equal(placed.error, undefined);
  const p = placed.profiles.a; p.character!.fatigue = 100; const use = applyFantasyPropertyCommand(placed.ledger, placed.profiles, 'a', { type: 'use', plot, revision: 2, requestId: 'rest' }, 25); assert.equal(use.error, undefined);
  const started = startFantasyActivity(use.profiles.a, { type: 'propertyUse', plot }, 25); assert.equal(started.error, undefined);
  const blocked = applyFantasyPropertyCommand(use.ledger, { ...use.profiles, a: started.profile }, 'a', { type: 'unfurnish', plot, revision: 3, requestId: 'remove-during-rest', item: 'furniture-bed' }, 26); assert.equal(blocked.error, 'busy');
  const done = advanceFantasyWorld(started.profile, 33).profile, improved = applyFantasyPropertyImprovement(done, plot, use.ledger, fantasyStats(done.character!));
  assert.equal(improved.profile.character!.fatigue, 15); assert.equal(applyFantasyPropertyImprovement(improved.profile, plot, use.ledger, fantasyStats(improved.profile.character!)).changed, false);
});
test('furniture stays with a sale or a past-life estate, and removal returns exactly one item', () => {
  const state = fixture(), placed = applyFantasyPropertyCommand(state.ledger, state.profiles, 'a', furnish(1), 25); assert.equal(placed.error, undefined);
  const removed = applyFantasyPropertyCommand(placed.ledger, placed.profiles, 'a', { type: 'unfurnish', plot, revision: 2, requestId: 'remove', item: 'furniture-bed' }, 25); assert.equal(removed.error, undefined); assert.equal(removed.profiles.a.character!.inventory['furniture-bed'], 2); assert.equal(removed.ledger.plots[plot].furniture?.length, 0);
  const listed = applyFantasyPropertyCommand(placed.ledger, placed.profiles, 'a', { type: 'list', plot, revision: 2, requestId: 'list-house', price: 500 }, 25); assert.equal(listed.error, undefined);
  const bought = applyFantasyPropertyCommand(listed.ledger, listed.profiles, 'b', { type: 'buy', plot, revision: 3, requestId: 'buy-furnished' }, 25); assert.equal(bought.error, undefined); assert.deepEqual(bought.ledger.plots[plot].furniture, placed.ledger.plots[plot].furniture);
  placed.profiles.a.death = { location: 'hearth', hour: 25, cause: 'test' }; placed.profiles.a.character!.hp = 0; const estate = reconcileFantasyProperties(placed.ledger, placed.profiles); assert.equal(estate.ledger.plots[plot].owner?.estate, true); assert.deepEqual(estate.ledger.plots[plot].furniture, placed.ledger.plots[plot].furniture);
});

test('tenants may install and recover their own furniture, while owner furnishings are protected and decorations stay bounded', () => {
  let s = fixture(); s = applyFantasyPropertyCommand(s.ledger, s.profiles, 'a', furnish(1), 25);
  s = applyFantasyPropertyCommand(s.ledger, s.profiles, 'a', { type: 'leaseOffer', plot, revision: 2, requestId: 'lease', target: 'Tenant', rent: 1, days: 3 }, 25); assert.equal(s.error, undefined);
  s = applyFantasyPropertyCommand(s.ledger, s.profiles, 'b', { type: 'leaseAccept', plot, revision: 3, requestId: 'accept-lease' }, 25); assert.equal(s.error, undefined);
  assert.equal(applyFantasyPropertyCommand(s.ledger, s.profiles, 'b', { type: 'unfurnish', plot, revision: 4, requestId: 'steal-bed', item: 'furniture-bed' }, 25).error, 'not-owner');
  for (let n = 0; n < 4; n++) { s = applyFantasyPropertyCommand(s.ledger, s.profiles, 'b', furnish(4 + n, 'furniture-carved-stool', `stool-${n}`), 25); assert.equal(s.error, undefined); }
  assert.equal(applyFantasyPropertyCommand(s.ledger, s.profiles, 'b', furnish(8, 'furniture-carved-stool', 'fifth-stool'), 25).error, 'furniture-limit');
  s = applyFantasyPropertyCommand(s.ledger, s.profiles, 'b', { type: 'unfurnish', plot, revision: 8, requestId: 'remove-own-stool', item: 'furniture-carved-stool' }, 25); assert.equal(s.error, undefined); assert.equal(s.profiles.b.character!.inventory['furniture-carved-stool'], 2);
  assert.equal(fantasyPropertyState(s.ledger, s.profiles, 'b').owned[0].furniture?.find(item => item.item === 'furniture-bed')?.canRemove, false);
});
test('furniture persistence rejects unknown items, duplicate bed families and forged placement fields', () => {
  const state = fixture(), placed = applyFantasyPropertyCommand(state.ledger, state.profiles, 'a', furnish(1), 25);
  for (const change of [(entry: any) => { entry.item = 'unregistered-bed'; }, (entry: any) => { entry.generation = -1; }, (entry: any) => { entry.secret = true; }]) { const bad = structuredClone(placed.ledger); change(bad.plots[plot].furniture![0]); assert.equal(validFantasyPropertyLedger(bad), false); }
  const stacked = structuredClone(placed.ledger); stacked.plots[plot].furniture!.push({ ...stacked.plots[plot].furniture![0], item: 'furniture-fine-bed' }); assert.equal(validFantasyPropertyLedger(stacked), false);
});
