import test from 'node:test';
import assert from 'node:assert/strict';
import type { FantasyProfile } from './fantasy.ts';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { createFantasyGear, fantasyEquipGear, validFantasyGear } from './fantasy-equipment.ts';
import { applyFantasyPartyVault, newFantasyPartyVault, returnFantasyPartyDeposits, validFantasyPartyVaults, type FantasyPartyVaultCommand, type FantasyPartyVaults } from './fantasy-party-vault.ts';

function player(name: string) {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name, gender: 'female' }, () => .5).profile;
  p.character!.hour = 100; p.character!.inventory.herb = 8; return p;
}
function fixture() {
  let vaults: FantasyPartyVaults = {}, profiles = new Map<string, FantasyProfile>([['a', player('A')], ['b', player('B')], ['outsider', player('Outsider')]]), sequence = 0;
  const party = { id: 'party-test', leader: 'a', members: ['a', 'b'] };
  const run = (actor: string, command: FantasyPartyVaultCommand) => {
    const before = JSON.stringify({ vaults, profiles: Object.fromEntries(profiles) });
    const result = applyFantasyPartyVault(vaults, profiles, party, actor, command, `token-${++sequence}`);
    assert.equal(JSON.stringify({ vaults, profiles: Object.fromEntries(profiles) }), before, 'Pure operation mutated its input');
    if (result.changed) { vaults = result.vaults; profiles = result.profiles; }
    return result;
  };
  return { party, run, vault: () => vaults[party.id] ?? newFantasyPartyVault(), vaults: () => vaults, profiles: () => profiles };
}

test('all actual members may deposit, but only the leader may approve a requested withdrawal', () => {
  const f = fixture(); assert.equal(f.run('b', { type: 'deposit', revision: 0, item: 'herb', count: 3 }).error, undefined);
  assert.equal(f.profiles().get('b')!.character!.inventory.herb, 5);
  const lot = f.vault().lots[0]; assert.equal(f.run('b', { type: 'requestWithdraw', revision: 1, lot: lot.id, count: 2 }).error, undefined);
  const request = f.vault().requests[0]; assert.equal(f.run('b', { type: 'approveWithdraw', revision: 2, request: request.id, approve: true }).error, 'leader-only');
  assert.equal(f.run('outsider', { type: 'approveWithdraw', revision: 2, request: request.id, approve: true }).error, 'not-alive');
  assert.equal(f.run('a', { type: 'approveWithdraw', revision: 2, request: request.id, approve: true }).error, undefined);
  assert.equal(f.profiles().get('b')!.character!.inventory.herb, 7); assert.equal(f.vault().lots[0].count, 1); assert.equal(f.vault().requests.length, 0);
});

test('stale requests, duplicate requests, excessive counts and forged ownership change nothing', () => {
  const f = fixture(); f.run('a', { type: 'deposit', revision: 0, item: 'herb', count: 2 }); const lot = f.vault().lots[0];
  assert.equal(f.run('b', { type: 'requestWithdraw', revision: 0, lot: lot.id, count: 1 }).error, 'stale');
  assert.equal(f.run('b', { type: 'requestWithdraw', revision: 1, lot: lot.id, count: 3 }).error, 'invalid');
  assert.equal(f.run('outsider', { type: 'deposit', revision: 1, item: 'herb', count: 1 }).changed, false);
  f.run('b', { type: 'requestWithdraw', revision: 1, lot: lot.id, count: 1 });
  assert.equal(f.run('b', { type: 'requestWithdraw', revision: 2, lot: lot.id, count: 1 }).error, 'invalid');
  assert.equal(f.vault().lots[0].count, 2); assert.equal(f.profiles().get('b')!.character!.inventory.herb, 8);
});

test('leader denial removes only the request and preserves the deposited inventory', () => {
  const f = fixture(); f.run('a', { type: 'deposit', revision: 0, item: 'herb', count: 2 });
  f.run('b', { type: 'requestWithdraw', revision: 1, lot: f.vault().lots[0].id, count: 2 });
  assert.equal(f.run('a', { type: 'approveWithdraw', revision: 2, request: f.vault().requests[0].id, approve: false }).error, undefined);
  assert.equal(f.vault().lots[0].count, 2); assert.equal(f.vault().requests.length, 0); assert.equal(f.profiles().get('b')!.character!.inventory.herb, 8);
});

test('food deposits and partial withdrawals preserve creation times rather than refreshing spoilage', () => {
  const f = fixture(), c = f.profiles().get('a')!.character!;
  c.inventory.meal = 5; c.foodLots = [{ id: 'old-meals', item: 'meal', count: 2, createdAt: 10 }, { id: 'new-meals', item: 'meal', count: 3, createdAt: 80 }];
  assert.equal(f.run('a', { type: 'deposit', revision: 0, item: 'meal', count: 3 }).error, undefined);
  assert.deepEqual(f.vault().lots[0].food!.map(food => [food.count, food.createdAt]), [[2, 10], [1, 80]]);
  assert.deepEqual(f.profiles().get('a')!.character!.foodLots.map(food => [food.count, food.createdAt]), [[2, 80]]);
  f.run('b', { type: 'requestWithdraw', revision: 1, lot: f.vault().lots[0].id, count: 2 });
  f.run('a', { type: 'approveWithdraw', revision: 2, request: f.vault().requests[0].id, approve: true });
  assert.equal(f.profiles().get('b')!.character!.foodLots.find(food => food.item === 'meal' && food.id.startsWith('food-shared-'))!.createdAt, 10);
  assert.deepEqual(f.vault().lots[0].food!.map(food => [food.count, food.createdAt]), [[1, 80]]); assert.equal(validFantasyPartyVaults(f.vaults()), true);
});

test('gear transfers preserve quality, material, gem, bonuses and creation time while worn gear is blocked', () => {
  const f = fixture(), c = f.profiles().get('a')!.character!;
  c.inventory['steel-sword'] = 2; c.jobXp.blacksmith = 600; c.job = 'blacksmith';
  const gear = createFantasyGear(c, 'steel-sword', () => .5, 'orichalcum-ingot', 'ruby')!; assert.ok(gear);
  fantasyEquipGear(c, 'steel-sword', gear.id);
  assert.equal(f.run('a', { type: 'deposit', revision: 0, item: 'steel-sword', count: 1, instance: gear.id }).error, 'equipped');
  delete c.equipment!.weapon; delete c.equippedGear!.weapon;
  const copy = structuredClone(gear); assert.equal(f.run('a', { type: 'deposit', revision: 0, item: 'steel-sword', count: 1, instance: gear.id }).error, undefined);
  assert.deepEqual(f.vault().lots[0].gear, copy);
  f.run('b', { type: 'requestWithdraw', revision: 1, lot: f.vault().lots[0].id, count: 1 }); f.run('a', { type: 'approveWithdraw', revision: 2, request: f.vault().requests[0].id, approve: true });
  const received = f.profiles().get('b')!.character!.gear!.find(item => item.item === 'steel-sword')!;
  assert.deepEqual({ ...received, id: copy.id }, copy); assert.equal(validFantasyGear(f.profiles().get('b')!.character!), true);
});

test('approval cannot give a former member or a new life the previous life’s requested items', () => {
  const f = fixture(); f.run('a', { type: 'deposit', revision: 0, item: 'herb', count: 2 });
  f.run('b', { type: 'requestWithdraw', revision: 1, lot: f.vault().lots[0].id, count: 1 }); const request = f.vault().requests[0].id;
  f.profiles().get('b')!.generation = 2;
  assert.equal(f.run('a', { type: 'approveWithdraw', revision: 2, request, approve: true }).error, 'not-alive');
  f.profiles().get('b')!.generation = 1; f.party.members = ['a'];
  assert.equal(f.run('a', { type: 'approveWithdraw', revision: 2, request, approve: true }).error, 'not-alive'); assert.equal(f.vault().lots[0].count, 2);
});

test('leaving returns only that living donor’s remaining deposits and cannot double return them', () => {
  const f = fixture(); f.run('a', { type: 'deposit', revision: 0, item: 'herb', count: 3 }); f.run('b', { type: 'deposit', revision: 1, item: 'herb', count: 2 });
  const result = returnFantasyPartyDeposits(f.vaults(), f.profiles(), f.party.id, 'a');
  assert.equal(result.changed, true); assert.equal(result.profiles.get('a')!.character!.inventory.herb, 8); assert.equal(result.profiles.get('b')!.character!.inventory.herb, 6);
  assert.equal(result.vaults[f.party.id].lots.length, 1); assert.equal(result.vaults[f.party.id].lots[0].donor, 'b');
  assert.equal(returnFantasyPartyDeposits(result.vaults, result.profiles, f.party.id, 'a').changed, false);
});

test('restart return cannot inherit deposits of a dead or replaced generation', () => {
  const f = fixture(); f.run('a', { type: 'deposit', revision: 0, item: 'herb', count: 3 }); f.run('b', { type: 'deposit', revision: 1, item: 'herb', count: 2 });
  f.profiles().get('a')!.generation = 2;
  const result = returnFantasyPartyDeposits(f.vaults(), f.profiles());
  assert.equal(result.profiles.get('a')!.character!.inventory.herb, 5); assert.equal(result.profiles.get('b')!.character!.inventory.herb, 8);
  assert.equal(result.vaults[f.party.id].lots[0].donor, 'a'); assert.equal(validFantasyPartyVaults(result.vaults), true);
});

test('serialized shared food and gear cannot invent mismatched quantities, items or invalid equipment bonuses', () => {
  const f = fixture(); const c = f.profiles().get('a')!.character!; c.inventory.meal = 1; c.foodLots = [{ id: 'meal-lot', item: 'meal', count: 1, createdAt: 5 }];
  f.run('a', { type: 'deposit', revision: 0, item: 'meal', count: 1 }); assert.equal(validFantasyPartyVaults(f.vaults()), true);
  const badCount = structuredClone(f.vaults()); badCount[f.party.id].lots[0].count = 2; assert.equal(validFantasyPartyVaults(badCount), false);
  const badItem = structuredClone(f.vaults()); badItem[f.party.id].lots[0].food![0].item = 'bread'; assert.equal(validFantasyPartyVaults(badItem), false);
  const duplicate = structuredClone(f.vaults()); duplicate[f.party.id].lots.push(structuredClone(duplicate[f.party.id].lots[0])); assert.equal(validFantasyPartyVaults(duplicate), false);
});
