import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogStore, hashBytes, validateSubmission } from './shared-catalog.ts';
import { SharedRuntime, type RuntimeState } from './shared-runtime.ts';
import { SharedService } from './shared-service.ts';
import { validateManifest, validateMap, type AssetCommand } from '../shared/shared-assets.ts';
import { sharedSolids } from '../shared/shared-presentation.ts';
import { assetDelta, applyAssetDelta } from '../shared/shared-sync.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commit = 'a'.repeat(40), nextCommit = 'b'.repeat(40);
const bundle = () => validateSubmission(root, commit);
const temp = (t: { after(fn: () => void): void }) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-shared-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; };
const command = (revision: number, id: string, instanceId = 'gate-1'): AssetCommand => ({ kind: 'events', id, revision, events: [{ instanceId, event: 'advance' }] });

test('submitted rules reusable across two maps, instances, rooms and participant scopes', () => {
  const catalog = bundle().catalog; assert.equal(catalog.maps.length, 2);
  const rooms = catalog.maps.map(map => { const room = new SharedRuntime(() => catalog, () => {}); room.apply('alice', { kind: 'map', id: 'install', revision: 0, map }); return room; });
  rooms[0].apply('alice', command(1, 'first'));
  const a = rooms[0].view('alice'), b = rooms[0].view('bob'), other = rooms[1].view('alice');
  assert.equal(a.values['gate-1'].charge, 7); assert.equal(a.values['gate-2'].charge, 0);
  assert.equal(a.values['gate-1'].total, 1); assert.equal(a.values['gate-2'].total, 1);
  assert.equal(a.values['gate-1'].visits, 1); assert.equal(b.values['gate-1'].visits, 0);
  assert.equal(other.values['gate-1'].charge, 0); assert.equal(a.values.score.score, 3);
  assert.equal(sharedSolids(a, catalog).length, 1); assert.equal(sharedSolids(other, catalog).length, 0);
});
test('per-recipient delta recovery rejects stale, duplicate, missing and out-of-order delivery', () => {
  const catalog = bundle().catalog; const room = new SharedRuntime(() => catalog, () => {});
  room.apply('alice', { kind: 'map', id: 'install', revision: 0, map: catalog.maps[0] });
  const before = room.view('bob'); room.apply('alice', command(1, 'first')); const after = room.view('bob'); const delta = assetDelta(before, after);
  assert.deepEqual(applyAssetDelta(before, delta), after); assert.equal(delta.values['gate-1'].visits, 0);
  assert.equal(applyAssetDelta(after, delta), 'stale'); assert.equal(applyAssetDelta(undefined, delta), 'resync');
  assert.equal(applyAssetDelta(before, { ...delta, from: 2, revision: 3 }), 'resync');
});
test('save before publication, replay, conflicts, reconnect and atomic multiple events', () => {
  const catalog = bundle().catalog; let saved: RuntimeState | undefined; let fail = false;
  const room = new SharedRuntime(() => catalog, state => { if (fail) throw new Error('disk full'); saved = structuredClone(state); });
  room.apply('alice', { kind: 'map', id: 'install', revision: 0, map: catalog.maps[0] });
  const request = command(1, 'first'); fail = true;
  assert.throws(() => room.apply('alice', request)); assert.equal(room.view('alice').revision, 1);
  fail = false; room.apply('alice', request); assert.equal(room.apply('alice', request), 'duplicate');
  assert.throws(() => room.apply('alice', { ...request, revision: 2 }));
  assert.throws(() => room.apply('bob', command(1, 'old')));
  const reconnected = new SharedRuntime(() => catalog, () => {}, saved!); assert.deepEqual(reconnected.view('alice'), room.view('alice')); assert.equal(reconnected.apply('alice', request), 'duplicate');
  assert.throws(() => room.apply('alice', { kind: 'events', id: 'batch', revision: 2, events: [{ instanceId: 'gate-1', event: 'advance' }, { instanceId: 'missing', event: 'advance' }] }));
  assert.equal(room.view('alice').values['gate-1'].charge, 7);
});
test('connection cycles exhaust bounded budget and roll back all changes', () => {
  const catalog = bundle().catalog; const map = structuredClone(catalog.maps[0]); map.connections = [{ from: 'gate-1', output: 'advance', to: 'gate-1', input: 'advance' }];
  const room = new SharedRuntime(() => catalog, () => {}); room.apply('alice', { kind: 'map', id: 'install', revision: 0, map });
  assert.throws(() => room.apply('alice', command(1, 'cycle')), /budget/); assert.equal(room.view('alice').values['gate-1'].charge, 0);
});
test('persistent originals survive service disposal, cache removal and failed promotion', t => {
  const directory = temp(t); const store = new CatalogStore(path.join(directory, 'shared-originals')); const release = bundle(); store.publish(release);
  const before = store.current(); const ref = before.entries[0].integrity; const bytes = store.read(ref);
  assert.equal(hashBytes(bytes), ref); assert.equal(store.current().commit, commit);
  const broken = bundle(); broken.catalog.commit = nextCommit; broken.objects.set(ref, Buffer.from('corrupt'));
  assert.throws(() => store.publish(broken)); assert.equal(store.current().commit, commit);
  const service = new SharedService(directory); service.apply('room-a', 'alice', { kind: 'map', id: 'install', revision: 0, map: before.maps[0] }); service.apply('room-a', 'alice', command(1, 'first')); service.release('room-a');
  const restarted = new SharedService(directory); assert.equal(restarted.view('room-a', 'alice').values['gate-1'].charge, 7); assert.deepEqual(restarted.catalog.read(ref), bytes);
  const missing = bundle(); missing.catalog.entries = []; assert.throws(() => store.publish(missing)); assert.deepEqual(store.current(), before);
});
test('manifest contracts reject code, URI, SDK, invalid ranges and incompatible ports', () => {
  const catalog = bundle().catalog; const manifest = catalog.entries[0].manifest;
  for (const patch of [{ sdk: 'javascript' }, { script: 'while(true){}' }, { files: [{ path: 'https://example.org/x', integrity: 'sha256-' + 'a'.repeat(64), bytes: 1 }] }, { inputs: ['ok', 'ok'] }]) assert.throws(() => validateManifest({ ...manifest, ...patch }));
  const map = structuredClone(catalog.maps[0]); map.connections[0].input = 'unknown'; assert.throws(() => validateMap(map, catalog.entries));
  map.connections = []; map.placements[0].asset.integrity = 'sha256-' + 'f'.repeat(64); assert.throws(() => validateMap(map, catalog.entries));
});
test('CI rejects immutable modifications/deletions, unlisted files, unresolved LFS and symlinks', t => {
  const directory = temp(t); const release = bundle();
  for (const folder of ['shared-assets', 'shared-maps']) fs.cpSync(path.join(root, folder), path.join(directory, folder), { recursive: true });
  assert.deepEqual(validateSubmission(directory, nextCommit, release.catalog).catalog.entries, release.catalog.entries);
  const file = path.join(directory, 'shared-assets/pulse-gate/1.0.0/manifest.json'); const original = fs.readFileSync(file);
  fs.writeFileSync(file, original.toString() + '\n'); assert.throws(() => validateSubmission(directory, nextCommit, release.catalog), /immutable/); assert.throws(() => validateSubmission(directory, nextCommit), /asset unavailable/); fs.writeFileSync(file, original);
  fs.writeFileSync(file, 'version https://git-lfs.github.com/spec/v1\noid sha256:aaa\nsize 1\n'); assert.throws(() => validateSubmission(directory, commit), /LFS/); fs.writeFileSync(file, original);
  const extra = path.join(directory, 'shared-assets/pulse-gate/1.0.0/extra.js'); fs.writeFileSync(extra, 'throw 1'); assert.throws(() => validateSubmission(directory, commit), /unlisted/); fs.unlinkSync(extra);
  if (process.platform !== 'win32') { fs.symlinkSync(file, extra); assert.throws(() => validateSubmission(directory, commit), /symlink/); fs.unlinkSync(extra); }
  fs.unlinkSync(file); assert.throws(() => validateSubmission(directory, nextCommit, release.catalog), /immutable/);
});
