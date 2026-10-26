import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { activateBundledSystems, createSystemTemplate, prepareSystemBundle, SystemCatalogStore, validateSystemSubmission } from './system-catalog.ts';
import { runSystemsCLI } from '../scripts/systems.ts';
import { hashBytes } from './shared-catalog.ts';

const temporary = (t: { after(fn: () => void): void }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-systems-catalog-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true })); return directory;
};
function submit(directory: string, version = '1.0.0', title = 'Button') {
  const manifest = { ...createSystemTemplate('test-button'), version, title };
  const folder = path.join(directory, 'shared-systems', manifest.id, version);
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, 'system.json'); fs.writeFileSync(file, JSON.stringify(manifest));
  return file;
}

test('registration CLI scaffolds a valid system without overwriting an existing version', t => {
  const directory = temporary(t);
  runSystemsCLI(['init', 'test-button', directory]);
  const bundle = validateSystemSubmission(directory);
  assert.equal(bundle.catalog.entries.length, 1);
  assert.match(bundle.catalog.commit, /^content-sha256-[a-f0-9]{64}$/);
  assert.equal(bundle.catalog.commit, validateSystemSubmission(directory).catalog.commit);
  assert.throws(() => runSystemsCLI(['init', 'test-button', directory]), /already exists/);
  assert.throws(() => runSystemsCLI(['init', '../escape', directory]));
});

test('PR validation rejects changed/deleted versions, unlisted files, LFS and symlinks', t => {
  const directory = temporary(t), file = submit(directory);
  const previous = validateSystemSubmission(directory).catalog;
  const original = fs.readFileSync(file);
  fs.appendFileSync(file, '\n');
  assert.throws(() => validateSystemSubmission(directory, undefined, previous), /immutable/);
  fs.writeFileSync(file, original);
  fs.writeFileSync(file, 'version https://git-lfs.github.com/spec/v1\noid sha256:bad\nsize 1\n');
  assert.throws(() => validateSystemSubmission(directory), /LFS/);
  fs.writeFileSync(file, original);
  const extra = path.join(path.dirname(file), 'payload.js'); fs.writeFileSync(extra, 'throw 1');
  assert.throws(() => validateSystemSubmission(directory), /unlisted/); fs.unlinkSync(extra);
  if (process.platform !== 'win32') {
    fs.symlinkSync(file, extra); assert.throws(() => validateSystemSubmission(directory), /symlink/); fs.unlinkSync(extra);
  }
  fs.unlinkSync(file); assert.throws(() => validateSystemSubmission(directory, undefined, previous), /immutable/);
});

test('publish retains archived versions across old-image activation and rejects all historical mutations', t => {
  const directory = temporary(t), source = path.join(directory, 'source');
  submit(source);
  const oldBundle = validateSystemSubmission(source, 'a'.repeat(40));
  const store = new SystemCatalogStore(path.join(directory, 'store')); store.publish(oldBundle);
  submit(source, '1.1.0');
  const newBundle = validateSystemSubmission(source, 'b'.repeat(40)); store.publish(newBundle);
  store.publish(oldBundle);
  assert.deepEqual(store.current().entries.map(e => e.version), ['1.0.0', '1.1.0']);
  submit(source, '1.1.0', 'Changed old published title');
  assert.throws(() => store.publish(validateSystemSubmission(source, 'c'.repeat(40))), /immutable/);
  assert.equal(store.current().entries.find(e => e.version === '1.1.0')!.manifest.title, 'Button');
});

test('invalid candidates never replace the active catalog', t => {
  const directory = temporary(t), source = path.join(directory, 'source'); submit(source);
  const store = new SystemCatalogStore(path.join(directory, 'store'));
  const bundle = validateSystemSubmission(source); store.publish(bundle);
  const before = store.current();
  const wrongBytes = validateSystemSubmission(source, 'd'.repeat(40));
  wrongBytes.objects.set(wrongBytes.catalog.entries[0].integrity, Buffer.from('wrong bytes'));
  assert.throws(() => store.publish(wrongBytes), /integrity/);
  assert.deepEqual(store.current(), before);
  const duplicate = structuredClone(bundle.catalog); duplicate.entries.push(duplicate.entries[0]);
  assert.throws(() => store.publish({ catalog: duplicate, objects: bundle.objects }), /duplicate/);
  assert.deepEqual(store.current(), before);
});

test('prepared content activates into a persistent central store and detects corrupted artifacts', t => {
  const directory = temporary(t), source = path.join(directory, 'source'); submit(source);
  const artifact = path.join(directory, 'bundle'); const bundle = validateSystemSubmission(source);
  prepareSystemBundle(bundle, artifact);
  const store = new SystemCatalogStore(path.join(directory, 'store'));
  assert.equal(activateBundledSystems(store, artifact), true);
  const entry = store.current().entries[0];
  assert.equal(hashBytes(store.read(entry.integrity)), entry.integrity);
  const before = store.current();
  fs.writeFileSync(path.join(artifact, 'objects', entry.integrity), 'corrupt');
  assert.throws(() => activateBundledSystems(store, artifact), /integrity/);
  assert.deepEqual(store.current(), before);
  assert.equal(activateBundledSystems(store, path.join(directory, 'absent')), false);
  assert.throws(() => prepareSystemBundle(bundle, artifact), /already exists/);
});

test('the same release identifier cannot describe different submitted content', t => {
  const directory = temporary(t), source = path.join(directory, 'source'); submit(source);
  const store = new SystemCatalogStore(path.join(directory, 'store')); const commit = 'e'.repeat(40);
  store.publish(validateSystemSubmission(source, commit));
  submit(source, '1.1.0');
  assert.throws(() => store.publish(validateSystemSubmission(source, commit)), /release immutable/);
  assert.equal(store.current().entries.length, 1);
});

test('restart rejects catalog metadata that no longer matches its verified original', t => {
  const directory = temporary(t), source = path.join(directory, 'source'); submit(source);
  const storePath = path.join(directory, 'store'), store = new SystemCatalogStore(storePath);
  store.publish(validateSystemSubmission(source));
  const damaged = structuredClone(store.current()); damaged.entries[0].manifest.title = 'Tampered metadata';
  fs.writeFileSync(path.join(storePath, 'current.json'), JSON.stringify(damaged));
  assert.throws(() => new SystemCatalogStore(storePath).current(), /catalog manifest mismatch/);
});
