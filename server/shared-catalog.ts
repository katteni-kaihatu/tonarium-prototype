import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { check, LIMITS, refKey, safePath, validateManifest, validateMap, type Catalog, type CatalogEntry } from '../shared/shared-assets.ts';

export const hashBytes = (bytes: Uint8Array) => `sha256-${createHash('sha256').update(bytes).digest('hex')}`;
export function readRegular(root: string, name: string, max: number): Buffer {
  safePath(name);
  let file = root;
  check(!fs.lstatSync(root).isSymbolicLink(), 'symlink root');
  for (const part of name.split('/')) { file = path.join(file, part); check(!fs.lstatSync(file).isSymbolicLink(), 'symlink'); }
  const stat = fs.lstatSync(file); check(stat.isFile() && stat.size <= max, 'file type/limit');
  const bytes = fs.readFileSync(file); check(bytes.length <= max && !bytes.subarray(0, 80).toString().startsWith('version https://git-lfs.github.com/spec/v1'), 'unresolved LFS/limit');
  return bytes;
}
function list(root: string, prefix = '', budget = { count: 0 }): string[] {
  check(!fs.lstatSync(root).isSymbolicLink(), 'symlink directory');
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(e => {
    check(++budget.count <= 4096, 'repository file limit');
    check(!e.isSymbolicLink(), 'symlink'); const name = prefix + e.name; safePath(name);
    return e.isDirectory() ? list(path.join(root, e.name), name + '/', budget) : [name];
  });
}
export interface Bundle { catalog: Catalog; objects: Map<string, Buffer> }
export function validateSubmission(root: string, commit: string, previous?: Catalog): Bundle {
  check(/^[a-f0-9]{40}$/.test(commit), 'commit required');
  const objects = new Map<string, Buffer>(); const entries: CatalogEntry[] = []; let total = 0;
  const assetRoot = path.join(root, 'shared-assets');
  if (fs.existsSync(assetRoot)) {
    const files = list(assetRoot); check(files.length <= 4096, 'repository file limit');
    const manifests = files.filter(f => /^[a-z][a-z0-9-]*\/\d+\.\d+\.\d+\/manifest.json$/.test(f));
    const claimed = new Set<string>();
    for (const file of manifests) {
      const bytes = readRegular(assetRoot, file, LIMITS.manifest); total += bytes.length; check(total <= 128 * 1024 * 1024, 'repository bytes limit'); const manifest: unknown = JSON.parse(bytes.toString('utf8')); validateManifest(manifest);
      const base = `${manifest.id}/${manifest.version}/`; check(file === base + 'manifest.json', 'manifest path identity'); claimed.add(file);
      const integrity = hashBytes(bytes); objects.set(integrity, bytes);
      for (const f of manifest.files) { const payload = readRegular(assetRoot, base + f.path, LIMITS.file); total += payload.length; check(total <= 128 * 1024 * 1024, 'repository bytes limit'); check(payload.length === f.bytes && hashBytes(payload) === f.integrity, 'file integrity'); objects.set(f.integrity, payload); claimed.add(base + f.path); }
      entries.push({ id: manifest.id, version: manifest.version, integrity, manifest });
    }
    check(files.every(f => claimed.has(f)), 'unlisted file');
  }
  const byKey = new Map(entries.map(e => [refKey(e), e]));
  if (previous) for (const old of previous.entries) check(byKey.get(refKey(old))?.integrity === old.integrity, 'published asset immutable');
  const visited = new Set<string>(), visiting = new Set<string>();
  function visit(e: CatalogEntry) {
    const key = refKey(e); check(!visiting.has(key), 'dependency cycle'); if (visited.has(key)) return; visiting.add(key);
    for (const ref of e.manifest.dependencies) { const dep = byKey.get(refKey(ref)); check(dep && dep.integrity === ref.integrity, 'dependency lock'); visit(dep); }
    visiting.delete(key); visited.add(key);
  }
  for (const e of entries) visit(e);
  const maps: Catalog['maps'] = []; const mapIntegrity: Record<string, string> = {}; const mapRoot = path.join(root, 'shared-maps');
  if (fs.existsSync(mapRoot)) for (const f of list(mapRoot)) {
    const bytes = readRegular(mapRoot, f, LIMITS.manifest); total += bytes.length; check(total <= 128 * 1024 * 1024, 'repository bytes limit'); const m: unknown = JSON.parse(bytes.toString('utf8')); validateMap(m, entries);
    check(f === `${m.id}/${m.revision}.json`, 'map path identity'); maps.push(m);
    const hash = hashBytes(bytes); objects.set(hash, bytes); mapIntegrity[f] = hash;
  }
  check(maps.length <= 1024, 'maps limit');
  if (previous) {
    for (const old of previous.maps) { const file = `${old.id}/${old.revision}.json`; check(mapIntegrity[file] === previous.mapIntegrity[file], 'published map immutable'); }
  }
  return { catalog: { schema: 2, commit, entries, maps, mapIntegrity }, objects };
}
export function atomicJSON(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true }); const temp = `${file}.${randomUUID()}.tmp`;
  const fd = fs.openSync(temp, 'wx'); let opened = true;
  try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); fs.closeSync(fd); opened = false; fs.renameSync(temp, file); }
  finally { if (opened) fs.closeSync(fd); if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
export class CatalogStore {
  private cache?: { stamp: string; catalog: Catalog };
  constructor(readonly directory: string) { fs.mkdirSync(path.join(directory, 'objects'), { recursive: true }); }
  object(integrity: string) { check(/^sha256-[a-f0-9]{64}$/.test(integrity), 'hash'); return path.join(this.directory, 'objects', integrity); }
  current(): Catalog {
    const file = path.join(this.directory, 'current.json');
    if (!fs.existsSync(file)) return { schema: 2, commit: '0'.repeat(40), entries: [], maps: [], mapIntegrity: {} };
    const stat = fs.statSync(file); const stamp = `${stat.ino}:${stat.mtimeMs}:${stat.size}`;
    if (this.cache?.stamp !== stamp) this.cache = { stamp, catalog: JSON.parse(fs.readFileSync(file, 'utf8')) };
    return this.cache!.catalog;
  }
  read(integrity: string) { const bytes = fs.readFileSync(this.object(integrity)); check(hashBytes(bytes) === integrity, 'stored object corrupt'); return bytes; }
  publish(bundle: Bundle) {
    const lock = path.join(this.directory, 'publish.lock'); fs.mkdirSync(lock);
    try { this.publishLocked(bundle); } finally { fs.rmdirSync(lock); }
  }
  private publishLocked(bundle: Bundle) {
    // 既存参照を失う候補は、オブジェクトの書込み前に拒否する。
    const previous = this.current();
    for (const old of previous.entries) check(bundle.catalog.entries.some(e => refKey(e) === refKey(old) && e.integrity === old.integrity), 'release removes immutable asset');
    for (const old of previous.maps) { const file = `${old.id}/${old.revision}.json`; check(bundle.catalog.mapIntegrity[file] === previous.mapIntegrity[file] && bundle.catalog.maps.some(m => m.id === old.id && m.revision === old.revision), 'release removes immutable map'); }
    for (const [hash, bytes] of bundle.objects) {
      check(hashBytes(bytes) === hash, 'object hash'); const file = this.object(hash);
      if (!fs.existsSync(file)) {
        const temp = `${file}.${randomUUID()}.tmp`; const fd = fs.openSync(temp, 'wx'); let opened = true;
        try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); fs.closeSync(fd); opened = false; fs.renameSync(temp, file); }
        finally { if (opened) fs.closeSync(fd); if (fs.existsSync(temp)) fs.unlinkSync(temp); }
      }
      this.read(hash);
    }
    for (const e of bundle.catalog.entries) { validateManifest(e.manifest); check(hashBytes(this.read(e.integrity)) === e.integrity && JSON.stringify(JSON.parse(this.read(e.integrity).toString('utf8'))) === JSON.stringify(e.manifest), 'manifest mismatch'); for (const f of e.manifest.files) check(this.read(f.integrity).length === f.bytes, 'payload size'); }
    for (const map of bundle.catalog.maps) { validateMap(map, bundle.catalog.entries); check(JSON.stringify(JSON.parse(this.read(bundle.catalog.mapIntegrity[`${map.id}/${map.revision}.json`]).toString('utf8'))) === JSON.stringify(map), 'map bytes mismatch'); }
    const release = path.join(this.directory, 'releases', `${bundle.catalog.commit}.json`);
    if (fs.existsSync(release)) check(fs.readFileSync(release, 'utf8') === JSON.stringify(bundle.catalog), 'commit release immutable');
    else atomicJSON(release, bundle.catalog);
    atomicJSON(path.join(this.directory, 'current.json'), bundle.catalog);
  }
}
