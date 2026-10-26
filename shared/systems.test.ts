import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { systemDemoMap } from './system-demo.ts';
import { createSystemMap } from './system-map.ts';
import { latestSystem, migrateSystem, validatePayload, validateSystemManifest, validateSystemMap } from './systems.ts';
import type { ResolvedSystem, SystemCatalog, SystemEntry, SystemManifest } from './system-types.ts';

function entry(manifest: SystemManifest): SystemEntry { return { id: manifest.id, version: manifest.version, manifest, integrity: 'sha256-' + createHash('sha256').update(JSON.stringify(manifest)).digest('hex') }; }
const entries = ['button', 'timer', 'chair'].map(id => {
  const manifest: unknown = JSON.parse(fs.readFileSync(new URL(`../shared-systems/${id}/1.0.0/system.json`, import.meta.url), 'utf8'));
  validateSystemManifest(manifest); return entry(manifest);
});
const catalog: SystemCatalog = { schema: 1, commit: 'a'.repeat(40), entries };

test('code-authored map binds independent objects and typed system events without pinned versions', () => {
  validateSystemMap(systemDemoMap, catalog);
  assert.equal(systemDemoMap.systems.find(s => s.instanceId === 'countdown')?.systemId, 'timer');
  assert.equal(Object.hasOwn(systemDemoMap.systems[0], 'version'), false);
  const builder = createSystemMap('empty'); const first = builder.build(); first.objects.push(systemDemoMap.objects[0]);
  assert.equal(builder.build().objects.length, 0);
  validatePayload({ user: 'alice' }, { user: 'user' });
  assert.throws(() => validatePayload({ user: 1 }, { user: 'user' }), /payload/);
});

test('binding capabilities, cardinality, payload types and competing controllers fail before execution', () => {
  const missing = structuredClone(systemDemoMap); missing.objects.find(o => o.id === 'timer-text')!.capabilities = [];
  assert.throws(() => validateSystemMap(missing, catalog), /capability/);
  const absent = structuredClone(systemDemoMap); absent.systems.find(s => s.instanceId === 'seat')!.bindings.seat = [];
  assert.throws(() => validateSystemMap(absent, catalog), /cardinality/);
  const duplicateController = structuredClone(systemDemoMap); duplicateController.systems.push({ ...structuredClone(duplicateController.systems.find(s => s.instanceId === 'countdown')!), instanceId: 'other-timer' });
  assert.throws(() => validateSystemMap(duplicateController, catalog), /control conflict/);
  const wrongPayload = structuredClone(systemDemoMap); wrongPayload.connections.push({ from: 'countdown', output: 'finished', to: 'seat', input: 'sit' });
  assert.throws(() => validateSystemMap(wrongPayload, catalog), /payload type/);
  const stand = structuredClone(entries.find(e => e.id === 'chair')!.manifest); stand.id = 'stand-only'; delete stand.inputs.sit; delete stand.handlers.sit;
  const competingSeat = structuredClone(systemDemoMap); competingSeat.systems.push({ instanceId: 'other-seat-controller', systemId: stand.id, bindings: { seat: ['chair-object'] }, config: {} });
  assert.throws(() => validateSystemMap(competingSeat, { ...catalog, entries: [...catalog.entries, entry(stand)] }), /control conflict/);
});

test('semantic duplicate links are rejected regardless of JSON property order', () => {
  const map = structuredClone(systemDemoMap); const link = map.connections.at(-1)!;
  map.connections.push({ mapping: { user: 'user' }, input: link.input, to: link.to, output: link.output, from: link.from });
  assert.throws(() => validateSystemMap(map, catalog), /duplicate/);
});

test('malformed programs, unbound capabilities and prototype-sensitive names are rejected', () => {
  const invalid = structuredClone(entries[0].manifest) as any; invalid.handlers.press = [{ op: 'eval', source: 'process.exit()' }];
  assert.throws(() => validateSystemManifest(invalid), /unsupported/);
  const target = structuredClone(entries[0].manifest) as any; target.handlers.press = [{ op: 'move', target: 'target', offset: [0, 0, 0] }];
  assert.throws(() => validateSystemManifest(target), /capability/);
  const reserved = structuredClone(entries[0].manifest); Object.defineProperty(reserved.state, 'constructor', { value: { type: 'number', default: 0 }, enumerable: true });
  assert.throws(() => validateSystemManifest(reserved), /dictionary/);
  const unknown = structuredClone(entries[0].manifest) as any; unknown.admin = true;
  assert.throws(() => validateSystemManifest(unknown), /unknown field/);
  const recursive = structuredClone(entries[0].manifest) as any; let expression: any = true;
  for (let i = 0; i < 10; i++) expression = { calc: 'not', args: [expression] };
  recursive.handlers.press = [{ op: 'if', condition: expression, then: [] }];
  assert.throws(() => validateSystemManifest(recursive), /depth/);
});

test('program validation rejects missing data, invalid defaults and oversized action trees', () => {
  const schedule = structuredClone(entries[1].manifest); schedule.handlers.start = [{ op: 'schedule', key: 'invalid', delayMs: -1, input: 'tick', payload: {} }];
  assert.throws(() => validateSystemManifest(schedule), /range/);
  const payload = structuredClone(entries[0].manifest); payload.handlers.press = [{ op: 'emit', port: 'pressed', payload: {} }];
  assert.throws(() => validateSystemManifest(payload), /payload expression fields/);
  const missingEvent = structuredClone(entries[0].manifest); missingEvent.handlers.press = [{ op: 'emit', port: 'pressed', payload: { user: { event: 'user' } } }];
  assert.throws(() => validateSystemManifest(missingEvent), /event reference/);
  const nullNumber = structuredClone(entries[0].manifest); nullNumber.state.counter = { type: 'number', default: null };
  assert.throws(() => validateSystemManifest(nullNumber), /value type/);
  const oversized = structuredClone(entries[0].manifest); oversized.handlers.press = Array.from({ length: 257 }, () => ({ op: 'emit' as const, port: 'pressed', payload: { user: { actor: true as const } } }));
  assert.throws(() => validateSystemManifest(oversized), /action count/);
});

test('latest resolution orders semantic versions numerically and compatible updates preserve live identity and values', () => {
  const previous = structuredClone(entries[0].manifest); previous.state = { count: { type: 'number', default: 0, min: 0, max: 100 } };
  const next = structuredClone(previous); next.version = '1.10.0'; next.state.extra = { type: 'boolean', default: false }; next.config.enabled = { type: 'boolean', default: true };
  validateSystemManifest(next);
  const old: ResolvedSystem = { instanceId: 'button-one', systemId: previous.id, version: previous.version, integrity: entry(previous).integrity, bindings: { target: ['existing-map-object'] }, config: {}, state: { count: 7 } };
  const updated = migrateSystem(old, previous, entry(next));
  assert.equal(updated.instanceId, old.instanceId); assert.deepEqual(updated.bindings, old.bindings); assert.equal(updated.state.count, 7); assert.equal(updated.state.extra, false); assert.equal(updated.config.enabled, true);
  assert.equal(old.version, '1.0.0'); assert.equal(old.state.count, 7);
  const intermediate = structuredClone(next); intermediate.version = '1.2.0';
  assert.equal(latestSystem({ ...catalog, entries: [entry(previous), entry(next), entry(intermediate)] }, previous.id).version, '1.10.0');
});

test('explicit state rename migrates values while incompatible port/target changes preserve the old instance', () => {
  const previous = structuredClone(entries[0].manifest); previous.state = { count: { type: 'number', default: 0 } };
  const old: ResolvedSystem = { instanceId: 'existing', systemId: previous.id, version: previous.version, integrity: entry(previous).integrity, bindings: { target: ['existing-object'] }, config: {}, state: { count: 12 } };
  const next = structuredClone(previous); next.version = '2.0.0'; next.state = { total: { type: 'number', default: 0 } }; next.migrations = [{ from: '1.0.0', renameState: { count: 'total' } }]; validateSystemManifest(next);
  assert.deepEqual(migrateSystem(old, previous, entry(next)).state, { total: 12 });
  const incompatible = structuredClone(next); delete incompatible.outputs.pressed;
  assert.throws(() => migrateSystem(old, previous, entry(incompatible)), /incompatible outputs/);
  const changedTarget = structuredClone(next); changedTarget.targets.target.capabilities.push('text');
  assert.throws(() => migrateSystem(old, previous, entry(changedTarget)), /incompatible target/);
  assert.deepEqual(old.state, { count: 12 }); assert.deepEqual(old.bindings, { target: ['existing-object'] });
});
