import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { applyFantasyEconomyCommand, fantasyEconomyState, newFantasyEconomyLedger, validFantasyEconomyLedger } from './fantasy-economy.ts';
import { fantasyBuildingStock } from './fantasy-town.ts';

function setup() {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Fresh quotes', source: 'human', gender: 'female' }, () => .7).profile;
  Object.assign(profile.character!, { location: 'hearth', hour: 12, job: 'warrior', gold: 100000, guildProgress: { version: 1, grade: 4, completedAtGrade: 0, creditedQuests: [] } });
  const profiles = new Map([['a', profile]]), context = { hour: 12, peers: ['a'], token: 'stock-test' };
  const { ledger } = applyFantasyEconomyCommand(newFantasyEconomyLedger(), profiles, 'a', { type: 'sync' }, context);
  return { profiles, context, ledger };
}

test('stock callers cannot alter the next building or request by mutating a returned array', () => {
  const first = fantasyBuildingStock({ location: 'hearth' }, 'market'), expected = [...first];
  first.splice(0, first.length, 'forged-item');
  assert.deepEqual(fantasyBuildingStock({ location: 'hearth' }, 'market'), expected);
  assert.deepEqual(fantasyBuildingStock({ location: 'hearth' }, 'inn'), ['meal', 'bread', 'jerky']);
});

test('economy reads are immutable and refresh prices, stock and location on the next request', () => {
  const { profiles, context, ledger } = setup(), before = structuredClone({ profiles, ledger });
  const first = fantasyEconomyState(ledger, profiles, 'a', context);
  assert.deepEqual(fantasyEconomyState(ledger, profiles, 'a', context), first);
  assert.deepEqual({ profiles, ledger }, before);
  const market = first.shops.find(shop => shop.building === 'market')!, lot = market.lots.find(lot => lot.count > 1 && lot.unitPrice >= 5)!;
  const purchased = applyFantasyEconomyCommand(ledger, profiles, 'a', { type: 'shopBuy', building: 'market', item: lot.item, count: 1, revision: market.revision, quotedUnitPrice: lot.unitPrice }, { ...context, token: 'buy-current' });
  assert.equal(purchased.error, undefined);
  const next = fantasyEconomyState(purchased.ledger, purchased.profiles, 'a', context);
  assert.equal(next.shops.find(shop => shop.building === 'market')!.lots.find(value => value.id === lot.id)!.count, lot.count - 1);
  const c = profiles.get('a')!.character!;
  c.bargains = { goods: { location: 'hearth', discount: .2, expiresAt: 20, nextAt: 16 } };
  assert.ok(fantasyEconomyState(ledger, profiles, 'a', context).shops.find(shop => shop.building === 'market')!.lots.find(value => value.id === lot.id)!.unitPrice < lot.unitPrice);
  c.location = 'mooncity';
  assert.equal(fantasyEconomyState(ledger, profiles, 'a', context).location, 'mooncity');
});

test('ledger validation rechecks mutated native lots and keeps allowed stock separate per building', () => {
  const { ledger } = setup();
  assert.equal(validFantasyEconomyLedger(ledger), true);
  const foreign = structuredClone(ledger.shops['hearth:market'].lots.find(lot => !['meal', 'bread', 'jerky'].includes(lot.item))!);
  ledger.shops['hearth:inn'].lots.push(foreign);
  assert.equal(validFantasyEconomyLedger(ledger), false);
  ledger.shops['hearth:inn'].lots.pop();
  assert.equal(validFantasyEconomyLedger(ledger), true);
  ledger.shops['hearth:market'].lots[0].item = 'unknown-stock';
  assert.equal(validFantasyEconomyLedger(ledger), false);
});

test('ledger food validation uses the supplied current time on every call', () => {
  const { ledger } = setup(), food = ledger.shops['hearth:inn'].lots.find(lot => lot.food)!.food![0];
  food.createdAt = 1;
  assert.equal(validFantasyEconomyLedger(ledger, 12), true);
  assert.equal(validFantasyEconomyLedger(ledger, 0), false);
});
