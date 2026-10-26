import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { validateSystemManifest } from '../shared/systems.ts';
import type { SystemCatalog, SystemEntry, SystemManifest } from '../shared/system-types.ts';
import { atomicJSON, hashBytes, readRegular } from './shared-catalog.ts';

const MAX_MANIFEST = 256 * 1024;
const MAX_TOTAL = 32 * 1024 * 1024;
const MAX_ENTRIES = 1024;
const key = (entry: Pick<SystemEntry, 'id' | 'version'>) => `${entry.id}@${entry.version}`;
const check = (value: unknown, message: string): void => { if (!value) throw new Error(message); };
const sorted = (entries: SystemEntry[]) => [...entries].sort((a, b) => key(a).localeCompare(key(b), 'en'));
const releaseId = (value: string) => /^[a-f0-9]{40}$/.test(value) || /^content-sha256-[a-f0-9]{64}$/.test(value);
export interface SystemBundle { catalog: SystemCatalog; objects: Map<string, Buffer> }

function filesAt(root: string, prefix = '', budget = { count: 0 }): string[] {
  check(!fs.lstatSync(root).isSymbolicLink(), 'system directory symlink');
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    check(++budget.count <= 4096, 'system directory entry limit');
    check(!entry.isSymbolicLink(), 'system symlink');
    const name = prefix + entry.name;
    return entry.isDirectory() ? filesAt(path.join(root, entry.name), name + '/', budget) : [name];
  }).sort();
}

export function validateSystemSubmission(root: string, commit?: string, previous?: SystemCatalog): SystemBundle {
  if (commit) check(releaseId(commit), 'system release requires an exact commit or content hash');
  const directory = path.join(root, 'shared-systems');
  const objects = new Map<string, Buffer>();
  const entries: SystemEntry[] = [];
  let bytes = 0;
  for (const file of fs.existsSync(directory) ? filesAt(directory) : []) {
    check(/^[a-z][a-z0-9-]{0,63}\/\d+\.\d+\.\d+\/system\.json$/.test(file), `unlisted system file: ${file}`);
    const raw = readRegular(directory, file, MAX_MANIFEST);
    check((bytes += raw.length) <= MAX_TOTAL && entries.length < MAX_ENTRIES, 'system submission limit');
    const manifest: unknown = JSON.parse(raw.toString('utf8'));
    validateSystemManifest(manifest);
    check(file === `${manifest.id}/${manifest.version}/system.json`, 'system path identity mismatch');
    const integrity = hashBytes(raw);
    entries.push({ id: manifest.id, version: manifest.version, integrity, manifest });
    objects.set(integrity, raw);
  }
  const ordered = sorted(entries);
  const byKey = new Map(ordered.map(entry => [key(entry), entry]));
  if (previous) for (const old of previous.entries) check(byKey.get(key(old))?.integrity === old.integrity, `published system immutable: ${key(old)}`);
  const digest = createHash('sha256').update(JSON.stringify(ordered.map(({ id, version, integrity }) => ({ id, version, integrity })))).digest('hex');
  return { catalog: { schema: 1, commit: commit || `content-sha256-${digest}`, entries: ordered }, objects };
}

function validateCatalog(value: unknown): asserts value is SystemCatalog {
  check(value && typeof value === 'object' && !Array.isArray(value), 'invalid system catalog');
  const catalog = value as SystemCatalog;
  check(catalog.schema === 1 && typeof catalog.commit === 'string' && releaseId(catalog.commit), 'invalid system catalog release');
  check(Array.isArray(catalog.entries) && catalog.entries.length <= MAX_ENTRIES, 'system catalog entry limit');
  const seen = new Set<string>();
  for (const entry of catalog.entries) {
    check(entry && typeof entry === 'object', 'invalid system entry');
    validateSystemManifest(entry.manifest);
    check(entry.id === entry.manifest.id && entry.version === entry.manifest.version && /^sha256-[a-f0-9]{64}$/.test(entry.integrity), 'invalid system entry identity');
    check(!seen.has(key(entry)), 'duplicate system entry'); seen.add(key(entry));
  }
}

export class SystemCatalogStore {
  private cache?: { stamp: string; catalog: SystemCatalog };
  constructor(readonly directory: string) { fs.mkdirSync(path.join(directory, 'objects'), { recursive: true }); }
  private objectPath(integrity: string) {
    check(/^sha256-[a-f0-9]{64}$/.test(integrity), 'invalid system integrity');
    return path.join(this.directory, 'objects', integrity);
  }
  current(): SystemCatalog {
    const file = path.join(this.directory, 'current.json');
    if (!fs.existsSync(file)) return { schema: 1, commit: '0'.repeat(40), entries: [] };
    const stat = fs.statSync(file); const stamp = `${stat.ino}:${stat.mtimeMs}:${stat.size}`;
    if (this.cache?.stamp === stamp) return this.cache.catalog;
    const bytes = readRegular(this.directory, 'current.json', MAX_TOTAL);
    const catalog: unknown = JSON.parse(bytes.toString('utf8')); validateCatalog(catalog);
    for (const entry of catalog.entries) {
      const original = this.read(entry.integrity);
      check(JSON.stringify(JSON.parse(original.toString('utf8'))) === JSON.stringify(entry.manifest), 'stored system catalog manifest mismatch');
    }
    this.cache = { stamp, catalog };
    return catalog;
  }
  read(integrity: string): Buffer {
    const bytes = readRegular(this.directory, `objects/${path.basename(this.objectPath(integrity))}`, MAX_MANIFEST);
    check(hashBytes(bytes) === integrity, 'stored system object corrupt');
    return bytes;
  }
  publish(bundle: SystemBundle): void {
    const lock = path.join(this.directory, 'publish.lock'); fs.mkdirSync(lock);
    try { this.publishLocked(bundle); } finally { fs.rmdirSync(lock); }
  }
  private publishLocked(bundle: SystemBundle): void {
    validateCatalog(bundle.catalog);
    const prior = this.current();
    const entries = new Map(prior.entries.map(entry => [key(entry), entry]));
    for (const entry of bundle.catalog.entries) {
      const old = entries.get(key(entry));
      check(!old || old.integrity === entry.integrity, `published system immutable: ${key(entry)}`);
      const bytes = bundle.objects.get(entry.integrity);
      check(bytes && bytes.length <= MAX_MANIFEST && hashBytes(bytes) === entry.integrity, 'system object integrity mismatch');
      check(JSON.stringify(JSON.parse(bytes!.toString('utf8'))) === JSON.stringify(entry.manifest), 'system manifest bytes mismatch');
      entries.set(key(entry), entry);
    }
    check(entries.size <= MAX_ENTRIES, 'archived system entry limit');
    const current = { ...bundle.catalog, entries: sorted([...entries.values()]) };
    check(Buffer.byteLength(JSON.stringify(current)) <= MAX_TOTAL, 'archived system catalog byte limit');
    for (const entry of bundle.catalog.entries) {
      const target = this.objectPath(entry.integrity);
      if (!fs.existsSync(target)) {
        const temporary = `${target}.${randomUUID()}.tmp`;
        const fd = fs.openSync(temporary, 'wx'); let opened = true;
        try {
          fs.writeFileSync(fd, bundle.objects.get(entry.integrity)!); fs.fsyncSync(fd); fs.closeSync(fd); opened = false;
          fs.renameSync(temporary, target);
        } finally { if (opened) fs.closeSync(fd); if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
      }
      this.read(entry.integrity);
    }
    // 古いイメージへ戻しても、稼働中の配置が参照する版を消さない。
    for (const entry of entries.values()) this.read(entry.integrity);
    const release = path.join(this.directory, 'releases', `${bundle.catalog.commit}.json`);
    if (fs.existsSync(release)) check(fs.readFileSync(release, 'utf8') === JSON.stringify(bundle.catalog), 'system release immutable');
    else atomicJSON(release, bundle.catalog);
    atomicJSON(path.join(this.directory, 'current.json'), current);
  }
}

export function prepareSystemBundle(bundle: SystemBundle, directory: string): void {
  check(!fs.existsSync(directory), 'system bundle output already exists');
  const store = new SystemCatalogStore(directory); store.publish(bundle);
  atomicJSON(path.join(directory, 'catalog.json'), bundle.catalog);
}

export function readSystemBundle(directory: string): SystemBundle {
  const bytes = readRegular(directory, 'catalog.json', MAX_TOTAL);
  const catalog: unknown = JSON.parse(bytes.toString('utf8')); validateCatalog(catalog);
  const objects = new Map<string, Buffer>();
  let total = 0;
  for (const entry of catalog.entries) {
    const raw = readRegular(directory, `objects/${entry.integrity}`, MAX_MANIFEST);
    check(hashBytes(raw) === entry.integrity && (total += raw.length) <= MAX_TOTAL, 'bundled system integrity/size');
    check(JSON.stringify(JSON.parse(raw.toString('utf8'))) === JSON.stringify(entry.manifest), 'bundled system manifest mismatch');
    objects.set(entry.integrity, raw);
  }
  return { catalog, objects };
}

export function activateBundledSystems(store: SystemCatalogStore, directory: string): boolean {
  if (!fs.existsSync(path.join(directory, 'catalog.json'))) return false;
  store.publish(readSystemBundle(directory));
  return true;
}

export function createSystemTemplate(id: string): SystemManifest {
  const manifest: SystemManifest = {
    schema: 1, sdk: 'tonarium-systems/1', id, version: '1.0.0', title: id,
    description: 'Describe what this system does and how to bind it.', license: 'UNLICENSED', credits: [],
    targets: { target: { capabilities: ['interact'], required: true } }, config: {}, state: {},
    inputs: { press: { payload: {} } }, outputs: { pressed: { payload: { user: 'user' } } },
    handlers: { press: [{ op: 'emit', port: 'pressed', payload: { user: { actor: true } } }] },
    interaction: { target: 'target', input: 'press' },
  };
  validateSystemManifest(manifest); return manifest;
}
