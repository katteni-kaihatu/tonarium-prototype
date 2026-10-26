export const ASSET_SDK = 'tonarium-rules/0.2' as const;
export const LIMITS = Object.freeze({ manifest: 256 * 1024, file: 8 * 1024 * 1024, bundle: 32 * 1024 * 1024, files: 64, instances: 128, rules: 64, commands: 32, state: 16 * 1024, connections: 128 });
export type Scope = 'session' | 'instance' | 'participant';
export interface AssetRef { id: string; version: string; integrity: string }
export interface Field { initial: number; min: number; max: number; scope: Scope }
export interface Rule { event: string; field: string; op: 'add' | 'set'; value: number }
export interface AssetManifest {
  schema: 2; id: string; version: string; title: string; kind: 'spatial' | 'system'; sdk: typeof ASSET_SDK;
  dependencies: AssetRef[]; files: { path: string; integrity: string; bytes: number }[];
  fields: Record<string, Field>; inputs: string[]; outputs: string[]; rules: Rule[];
  presentation?: { label: string; field: string; color: string; solid: boolean };
}
export interface Placement { instanceId: string; asset: AssetRef; transform: { x: number; y: number; z: number; ry: number; scale: number }; config: Record<string, number> }
export interface Connection { from: string; output: string; to: string; input: string }
export interface SharedMap { schema: 2; id: string; revision: number; placements: Placement[]; connections: Connection[] }
export interface CatalogEntry extends AssetRef { manifest: AssetManifest }
export interface Catalog { schema: 2; commit: string; entries: CatalogEntry[]; maps: SharedMap[]; mapIntegrity: Record<string, string> }
export interface AssetView { revision: number; map: SharedMap; values: Record<string, Record<string, number>> }
export type AssetCommand = { id: string; revision: number } & ({ kind: 'map'; map: SharedMap } | { kind: 'events'; events: { instanceId: string; event: string }[] });
export const identifier = (s: unknown): s is string => typeof s === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(s);
export const version = (s: unknown): s is string => typeof s === 'string' && /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(s);
export const integrity = (s: unknown): s is string => typeof s === 'string' && /^sha256-[a-f0-9]{64}$/.test(s);
export function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
export function record(v: unknown): asserts v is Record<string, any> { check(!!v && typeof v === 'object' && !Array.isArray(v), 'object required'); }
export function keys(v: Record<string, unknown>, allowed: string[]) { check(Object.keys(v).every(k => allowed.includes(k)), 'unknown field'); }
export function finite(v: unknown, min: number, max: number): asserts v is number { check(typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max, 'number out of range'); }
export function ref(v: unknown): asserts v is AssetRef { record(v); keys(v, ['id', 'version', 'integrity']); check(identifier(v.id) && version(v.version) && integrity(v.integrity), 'invalid asset reference'); }
export const refKey = (v: AssetRef) => `${v.id}@${v.version}`;
export function safePath(v: unknown): asserts v is string { check(typeof v === 'string' && v.length < 160 && /^[a-z0-9][a-z0-9/._-]*$/.test(v) && v.split('/').every(p => p !== '.' && p !== '..' && p.length > 0 && !p.endsWith('.') && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/.test(p)), 'unsafe path'); }
export function validateManifest(v: unknown): asserts v is AssetManifest {
  record(v); keys(v, ['schema', 'id', 'version', 'title', 'kind', 'sdk', 'dependencies', 'files', 'fields', 'inputs', 'outputs', 'rules', 'presentation']);
  check(v.schema === 2 && identifier(v.id) && version(v.version) && v.sdk === ASSET_SDK && ['spatial', 'system'].includes(v.kind), 'unsupported manifest');
  check(typeof v.title === 'string' && v.title.trim().length > 0 && v.title.length <= 100, 'invalid title');
  check(Array.isArray(v.dependencies) && v.dependencies.length <= 16, 'dependencies limit');
  const deps = new Set<string>();
  for (const d of v.dependencies) { ref(d); check(!deps.has(d.id) && d.id !== v.id, 'duplicate/self dependency'); deps.add(d.id); }
  check(Array.isArray(v.files) && v.files.length <= LIMITS.files, 'files limit');
  const paths = new Set<string>(); let size = 0;
  for (const f of v.files) { record(f); keys(f, ['path', 'integrity', 'bytes']); safePath(f.path); check(f.path !== 'manifest.json' && integrity(f.integrity) && !paths.has(f.path), 'invalid file'); finite(f.bytes, 1, LIMITS.file); check(Number.isInteger(f.bytes), 'file size'); size += f.bytes; paths.add(f.path); }
  check(size <= LIMITS.bundle, 'bundle limit'); record(v.fields); check(Object.keys(v.fields).length <= 32, 'fields limit');
  for (const [name, f] of Object.entries(v.fields)) { check(identifier(name), 'field id'); record(f); keys(f, ['initial', 'min', 'max', 'scope']); finite(f.min, -1e9, 1e9); finite(f.max, f.min, 1e9); finite(f.initial, f.min, f.max); check(['session', 'instance', 'participant'].includes(f.scope), 'scope'); }
  for (const list of [v.inputs, v.outputs]) check(Array.isArray(list) && list.length <= 16 && list.every(identifier) && new Set(list).size === list.length, 'ports');
  check(Array.isArray(v.rules) && v.rules.length <= LIMITS.rules, 'rules limit');
  for (const r of v.rules) { record(r); keys(r, ['event', 'field', 'op', 'value']); check(v.inputs.includes(r.event) && Object.hasOwn(v.fields, r.field) && ['set', 'add'].includes(r.op), 'rule'); finite(r.value, -1e9, 1e9); }
  if (v.presentation !== undefined) { record(v.presentation); const p = v.presentation; keys(p, ['label', 'field', 'color', 'solid']); check(typeof p.label === 'string' && p.label.length <= 80 && Object.hasOwn(v.fields, p.field) && /^#[a-fA-F0-9]{6}$/.test(p.color) && typeof p.solid === 'boolean', 'presentation'); check((v.kind === 'spatial' && v.fields[p.field].scope !== 'participant') || !p.solid, 'collision scope'); }
}
export function validateMap(v: unknown, entries: CatalogEntry[]): asserts v is SharedMap {
  record(v); keys(v, ['schema', 'id', 'revision', 'placements', 'connections']); check(v.schema === 2 && identifier(v.id) && Number.isSafeInteger(v.revision) && v.revision >= 1, 'map identity');
  check(Array.isArray(v.placements) && v.placements.length <= LIMITS.instances && Array.isArray(v.connections) && v.connections.length <= LIMITS.connections, 'map limits');
  const placed = new Map<string, AssetManifest>();
  const sessionDefaults = new Map<string, number>();
  for (const p of v.placements) {
    record(p); keys(p, ['instanceId', 'asset', 'transform', 'config']); check(identifier(p.instanceId) && !placed.has(p.instanceId), 'instanceId'); ref(p.asset);
    const entry = entries.find(e => refKey(e) === refKey(p.asset) && e.integrity === p.asset.integrity); check(entry, 'asset unavailable'); placed.set(p.instanceId, entry.manifest);
    record(p.transform); keys(p.transform, ['x', 'y', 'z', 'ry', 'scale']); for (const a of ['x', 'y', 'z', 'ry']) finite(p.transform[a], -10000, 10000); finite(p.transform.scale, 0.05, 100);
    record(p.config); check(Object.keys(p.config).length <= 32, 'config limit');
    for (const [k, value] of Object.entries(p.config)) { check(Object.hasOwn(entry.manifest.fields, k), 'config field'); const f = entry.manifest.fields[k]; finite(value, f.min, f.max); }
    for (const [name, field] of Object.entries(entry.manifest.fields)) if (field.scope === 'session') { const key = `${refKey(p.asset)}:${name}`; const value = p.config[name] ?? field.initial; check(!sessionDefaults.has(key) || sessionDefaults.get(key) === value, 'session default conflict'); sessionDefaults.set(key, value); }
  }
  const links = new Set<string>();
  for (const c of v.connections) { record(c); keys(c, ['from', 'output', 'to', 'input']); check(placed.get(c.from)?.outputs.includes(c.output) && placed.get(c.to)?.inputs.includes(c.input), 'connection compatibility'); const key = JSON.stringify(c); check(!links.has(key), 'duplicate connection'); links.add(key); }
}
export const emptyMap = (): SharedMap => ({ schema: 2, id: 'draft', revision: 1, placements: [], connections: [] });
