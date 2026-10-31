import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { fantasyBagState } from '../shared/fantasy-bags.ts';
const player = (name: string) => { const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name }, () => .99).profile; p.character!.gold = 5000; p.character!.hour = 25; p.character!.location = 'hearth'; p.character!.inventory.ore = 1000; return p; };
test('recovering house furniture into a full bag rolls back the complete ledger and item transaction', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-property-bag-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); const file = path.join(dir, 'fantasy.json'), p = player('Owner'); p.character!.inventory['furniture-bed'] = 1; fs.writeFileSync(file, JSON.stringify({ a: p })); const store = new FantasyStore(file, { worldHour: () => 25 }); assert.equal(store.loadError, undefined);
  const plot = 'hearth-residence'; assert.equal(store.propertyRequest('a', { type: 'buy', plot, revision: 0, requestId: 'buy' }).error, undefined); assert.equal(store.propertyRequest('a', { type: 'furnish', plot, revision: 1, requestId: 'place', item: 'furniture-bed' }).error, undefined);
  assert.ok(fantasyBagState(store.profile('a').character!).overloaded); const before = store.profile('a'), view = store.propertyState('a'), text = fs.readFileSync(file, 'utf8');
  assert.equal(store.propertyRequest('a', { type: 'unfurnish', plot, revision: 2, requestId: 'remove', item: 'furniture-bed' }).error, 'bag-full'); assert.deepEqual(store.profile('a'), before); assert.deepEqual(store.propertyState('a'), view); assert.equal(fs.readFileSync(file, 'utf8'), text);
});
test('approving a vault withdrawal into a full recipient bag preserves items, request, stock and disk state', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-vault-bag-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); const file = path.join(dir, 'fantasy.json'), a = player('Leader'), b = player('Recipient'); a.character!.inventory.herb = 5; fs.writeFileSync(file, JSON.stringify({ a, b })); const store = new FantasyStore(file, { worldHour: () => 25 }); assert.equal(store.loadError, undefined); const party = { id: 'party-bag', leader: 'a', members: ['a', 'b'] };
  assert.equal(store.partyVaultRequest(party, 'a', { type: 'deposit', revision: 0, item: 'herb', count: 1 }).error, undefined); const lot = store.partyVault(party.id).lots[0]; assert.equal(store.partyVaultRequest(party, 'b', { type: 'requestWithdraw', revision: 1, lot: lot.id, count: 1 }).error, undefined); const request = store.partyVault(party.id).requests[0];
  const profiles = [store.profile('a'), store.profile('b')], vault = store.partyVault(party.id), text = fs.readFileSync(file, 'utf8'); assert.equal(store.partyVaultRequest(party, 'a', { type: 'approveWithdraw', revision: 2, request: request.id, approve: true }).error, 'capacity'); assert.deepEqual([store.profile('a'), store.profile('b')], profiles); assert.deepEqual(store.partyVault(party.id), vault); assert.equal(fs.readFileSync(file, 'utf8'), text);
});
