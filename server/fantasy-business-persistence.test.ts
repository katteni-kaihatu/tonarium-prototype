import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { FANTASY_PROPERTY_PLOTS, applyFantasyPropertyCommand, newFantasyPropertyLedger } from '../shared/fantasy-property.ts';

function fixture() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-workers-')), file = path.join(folder, 'state.json');
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'Saver' }, () => .99).profile;
  profile.character!.gold = 90_000; profile.character!.hour = 25;
  const state = applyFantasyPropertyCommand(newFantasyPropertyLedger(), { a: profile }, 'a', { type: 'buy', plot: 'hearth-commercial', revision: 0, requestId: 'fixture-buy' }, 25);
  return { folder, file, state };
}

test('adding mansion deeds on load does not force a constructor write or overwrite old ownership', () => {
  const { folder, file, state } = fixture();
  try {
    for (const plot of FANTASY_PROPERTY_PLOTS.filter(p => p.mansion)) delete state.ledger.plots[plot.id];
    const serialized = JSON.stringify({ version: 2, profiles: state.profiles, combats: {}, properties: state.ledger });
    fs.writeFileSync(file, serialized);
    let writes = 0;
    const store = new FantasyStore(file, { worldHour: () => 25, save: () => { writes++; } });
    assert.equal(store.loadError, undefined); assert.equal(writes, 0); assert.equal(fs.readFileSync(file, 'utf8'), serialized);
    const property = store.propertyState('a');
    assert.equal(property.plots.find(p => p.id === 'hearth-commercial')!.ownedByMe, true);
    assert.ok(property.plots.some(p => p.mansion));
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

test('failed atomic employment save does not spend gold or reserve the named candidate', () => {
  const { folder, file, state } = fixture();
  try {
    fs.writeFileSync(file, JSON.stringify({ version: 2, profiles: state.profiles, combats: {}, properties: state.ledger }));
    let reject = false;
    const store = new FantasyStore(file, { worldHour: () => 25, onError: () => {}, save: (target, serialized) => { if (reject) throw new Error('disk full'); fs.writeFileSync(target, serialized); } });
    assert.equal(store.loadError, undefined);
    const before = store.profile('a').character!.gold, view = store.propertyState('a');
    reject = true;
    const result = store.propertyRequest('a', { type: 'workerHire', plot: 'hearth-commercial', revision: view.plots.find(p => p.id === 'hearth-commercial')!.revision, requestId: 'atomic-hire', npc: 'artisan-1', source: 'guild' });
    assert.ok(result.error); assert.equal(store.profile('a').character!.gold, before);
    assert.equal(store.propertyState('a').workforce!.candidates.some(n => n.id === 'artisan-1'), true);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
