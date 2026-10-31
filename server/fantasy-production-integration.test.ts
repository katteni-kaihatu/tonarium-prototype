import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';

function fixture(t: TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fantasy-production-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'save.json'), p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Records', gender: 'female' }, () => .5).profile;
  const c = p.character!; c.inventory['rune-record-physical'] = 1;
  fs.writeFileSync(file, JSON.stringify({ reader: p }));
  return { file, make: () => new FantasyStore(file, { onError: () => {} }) };
}
test('owned rune record consumption and learned book/rune knowledge persist together across a real store reload', t => {
  const f = fixture(t), store = f.make(); assert.equal(store.loadError, undefined);
  const before = store.profile('reader'), result = store.apply('reader', before.revision, { type: 'use', item: 'rune-record-physical' });
  assert.equal(result.error, undefined); assert.equal(result.profile.character!.inventory['rune-record-physical'], 0);
  assert.ok(result.profile.character!.readBooks!.includes('rune-physical')); assert.ok(result.profile.character!.circleKnowledge!.cores.includes('physical'));
  const loaded = f.make(); assert.equal(loaded.loadError, undefined); assert.deepEqual(loaded.profile('reader'), result.profile);
  assert.ok(loaded.apply('reader', result.profile.revision, { type: 'use', item: 'rune-record-physical' }).error);
});
test('forged ruins production receipts reject loading without deleting or replacing the saved bytes', t => {
  const f = fixture(t), parsed = JSON.parse(fs.readFileSync(f.file, 'utf8')); parsed.reader.character.productionClaims = ['oldwatch:archive'];
  const bytes = JSON.stringify(parsed); fs.writeFileSync(f.file, bytes); const store = f.make();
  assert.ok(store.loadError); assert.equal(fs.readFileSync(f.file, 'utf8'), bytes);
});
