import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExampleCode, catalogExampleMap } from './catalog-example.ts';
import { validateSystemMap } from '../../../shared/systems.ts';
import { validateSystemSubmission } from '../../../server/system-catalog.ts';
import { fileURLToPath } from 'node:url';

test('catalog connection examples satisfy the published target and config contracts without pinning versions', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const catalog = validateSystemSubmission(root).catalog;
  assert.deepEqual([...new Set(catalog.entries.map(entry => entry.id))].sort(), ['button', 'camera-trigger', 'chair', 'timer']);
  for (const { manifest } of catalog.entries) {
    const map = catalogExampleMap(manifest);
    assert.doesNotThrow(() => validateSystemMap(map, catalog));
    assert.equal(map.systems[0].systemId, manifest.id);
    assert.equal(Object.hasOwn(map.systems[0], 'version'), false);
    const code = catalogExampleCode(manifest);
    assert.match(code, /createSystemMap/);
    assert.doesNotMatch(code, /"version"/);
  }
  const long = structuredClone(catalog.entries.find(entry => entry.id === 'button')!);
  long.id = long.manifest.id = 'a'.repeat(64);
  long.manifest.targets = { ['b'.repeat(64)]: long.manifest.targets.target };
  long.manifest.interaction!.target = 'b'.repeat(64);
  assert.doesNotThrow(() => validateSystemMap(catalogExampleMap(long.manifest), { ...catalog, entries: [long] }));
});
