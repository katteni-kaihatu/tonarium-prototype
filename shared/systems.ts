import type { Capability, Expression, ResolvedSystem, SystemAction, SystemCatalog, SystemEntry, SystemManifest, SystemMap, SystemValue, ValueSchema, ValueType } from './system-types.ts';
import { systemItemDefinition } from './system-items.ts';

export function systemCheck(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export const systemId = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value) && !['constructor', 'prototype'].includes(value);
export const systemVersion = (value: unknown): value is string => typeof value === 'string' && /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(value);
const types = ['number', 'string', 'boolean', 'user', 'object'];
const capabilities = ['interact', 'move', 'text', 'seat'];
function object(value: unknown): asserts value is Record<string, any> { systemCheck(value !== null && typeof value === 'object' && !Array.isArray(value), 'object required'); }
function keys(value: Record<string, unknown>, allowed: string[]) { systemCheck(Object.keys(value).every(k => allowed.includes(k)), `unknown field: ${Object.keys(value).find(k => !allowed.includes(k))}`); }
function dictionary(value: unknown, max: number): asserts value is Record<string, any> { object(value); systemCheck(Object.keys(value).length <= max && Object.keys(value).every(systemId), 'invalid dictionary keys/count'); }
function text(value: unknown, max: number): asserts value is string { systemCheck(typeof value === 'string' && value.length <= max, 'text limit'); }
function number(value: unknown, min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): asserts value is number { systemCheck(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max, 'number range'); }
function vector(value: unknown, positive = false) { systemCheck(Array.isArray(value) && value.length === 3, 'vector3'); for (const n of value) number(n, positive ? 0.001 : -10000, 10000); }
function typeOf(value: unknown, type: ValueType) { return type === 'user' || type === 'object' ? typeof value === 'string' && value.length > 0 && value.length <= 128 : typeof value === type && (type !== 'number' || Number.isFinite(value)); }
export function validateValue(value: unknown, schema: ValueSchema): asserts value is SystemValue {
  systemCheck((value === null && schema.default === null && ['user', 'object'].includes(schema.type)) || typeOf(value, schema.type), `value type: ${schema.type}`);
  if (typeof value === 'number') number(value, schema.min ?? -Number.MAX_SAFE_INTEGER, schema.max ?? Number.MAX_SAFE_INTEGER);
  if (typeof value === 'string') text(value, 2048);
}
export function validatePayload(value: unknown, schema: Record<string, ValueType>): asserts value is Record<string, SystemValue> {
  object(value); systemCheck(Object.keys(value).every(k => Object.hasOwn(schema, k)), 'unknown payload field');
  for (const [name, type] of Object.entries(schema)) { systemCheck(Object.hasOwn(value, name) && typeOf(value[name], type), `payload field: ${name}`); if (typeof value[name] === 'string') text(value[name], 2048); }
}
function valueSchemas(value: unknown) {
  dictionary(value, 32);
  for (const field of Object.values(value)) {
    object(field); keys(field, ['type', 'default', 'min', 'max']); systemCheck(types.includes(field.type) && Object.hasOwn(field, 'default'), 'value schema');
    if (field.min !== undefined) number(field.min); if (field.max !== undefined) number(field.max);
    systemCheck((field.min === undefined && field.max === undefined) || field.type === 'number', 'range requires number');
    systemCheck(field.min === undefined || field.max === undefined || field.min <= field.max, 'inverted range');
    validateValue(field.default, field as ValueSchema);
  }
}
function ports(value: unknown) {
  dictionary(value, 32);
  for (const port of Object.values(value)) { object(port); keys(port, ['payload']); dictionary(port.payload, 16); systemCheck(Object.values(port.payload).every(t => types.includes(t)), 'payload schema'); }
}
function expression(value: unknown, manifest: SystemManifest, payload: Record<string, ValueType>, depth = 0): ValueType | 'null' {
  systemCheck(depth <= 8, 'expression depth');
  if (value === null) return 'null';
  if (typeof value === 'number') { number(value); return 'number'; }
  if (typeof value === 'string') { text(value, 2048); return 'string'; }
  if (typeof value === 'boolean') return 'boolean';
  object(value); systemCheck(Object.keys(value).length === (Object.hasOwn(value, 'calc') ? 2 : 1), 'expression shape');
  if (Object.hasOwn(value, 'state')) { systemCheck(Object.hasOwn(manifest.state, value.state), 'state reference'); return manifest.state[value.state].type; }
  if (Object.hasOwn(value, 'config')) { systemCheck(Object.hasOwn(manifest.config, value.config), 'config reference'); return manifest.config[value.config].type; }
  if (Object.hasOwn(value, 'event')) { systemCheck(Object.hasOwn(payload, value.event), 'event reference'); return payload[value.event]; }
  if (Object.hasOwn(value, 'actor')) { systemCheck(value.actor === true, 'actor expression'); return 'user'; }
  if (Object.hasOwn(value, 'now')) { systemCheck(value.now === true, 'clock expression'); return 'number'; }
  systemCheck(['add', 'sub', 'mul', 'div', 'min', 'max', 'eq', 'gt', 'not', 'ceil', 'clock'].includes(value.calc) && Array.isArray(value.args), 'calculation');
  const arity = ['not', 'ceil', 'clock'].includes(value.calc) ? 1 : 2; systemCheck(value.args.length === arity, 'calculation arity');
  const args = value.args.map((e: unknown) => expression(e, manifest, payload, depth + 1));
  if (value.calc === 'eq') return 'boolean';
  if (value.calc === 'not') { systemCheck(args[0] === 'boolean', 'not requires boolean'); return 'boolean'; }
  systemCheck(args.every((t: string) => t === 'number'), 'calculation requires numbers');
  return value.calc === 'gt' ? 'boolean' : value.calc === 'clock' ? 'string' : 'number';
}
function matches(actual: string, expected: string) { return actual === expected || ((expected === 'user' || expected === 'object') && actual === 'string'); }
function actions(value: unknown, manifest: SystemManifest, payload: Record<string, ValueType>, budget: { count: number }, depth = 0) {
  systemCheck(Array.isArray(value) && depth <= 8, 'action list/depth');
  const expr = (v: unknown) => expression(v, manifest, payload);
  const target = (role: unknown, capability: Capability) => { systemCheck(typeof role === 'string' && Object.hasOwn(manifest.targets, role) && manifest.targets[role].capabilities.includes(capability), `target capability: ${capability}`); };
  const expressions = (v: unknown, schema: Record<string, ValueType>) => { object(v); systemCheck(Object.keys(v).length === Object.keys(schema).length && Object.keys(v).every(k => Object.hasOwn(schema, k)), 'payload expression fields'); for (const [k, type] of Object.entries(schema)) systemCheck(matches(expr(v[k]), type), `payload expression type: ${k}`); };
  for (const action of value) {
    systemCheck(++budget.count <= 256, 'action count'); object(action);
    switch (action.op) {
      case 'set': keys(action, ['op', 'field', 'value']); systemCheck(Object.hasOwn(manifest.state, action.field), 'set field'); systemCheck(matches(expr(action.value), manifest.state[action.field].type) || (action.value === null && manifest.state[action.field].default === null), 'set type'); break;
      case 'emit': keys(action, ['op', 'port', 'payload']); systemCheck(Object.hasOwn(manifest.outputs, action.port), 'output port'); expressions(action.payload, manifest.outputs[action.port].payload); break;
      case 'if': keys(action, ['op', 'condition', 'then', 'else']); systemCheck(expr(action.condition) === 'boolean', 'condition type'); actions(action.then, manifest, payload, budget, depth + 1); if (action.else !== undefined) actions(action.else, manifest, payload, budget, depth + 1); break;
      case 'move': keys(action, ['op', 'target', 'offset']); target(action.target, 'move'); systemCheck(Array.isArray(action.offset) && action.offset.length === 3 && action.offset.every((e: unknown) => expr(e) === 'number'), 'move offset'); break;
      case 'text': keys(action, ['op', 'target', 'value']); target(action.target, 'text'); systemCheck(expr(action.value) !== 'null', 'display cannot be null'); break;
      case 'schedule': keys(action, ['op', 'key', 'delayMs', 'input', 'payload']); systemCheck(systemId(action.key) && Object.hasOwn(manifest.inputs, action.input), 'schedule key/input'); systemCheck(expr(action.delayMs) === 'number', 'schedule delay'); if (typeof action.delayMs === 'number') number(action.delayMs, 0, 86_400_000); expressions(action.payload, manifest.inputs[action.input].payload); break;
      case 'cancel': keys(action, ['op', 'key']); systemCheck(systemId(action.key), 'schedule key'); break;
      case 'seat': keys(action, ['op', 'target', 'user']); target(action.target, 'seat'); systemCheck(matches(expr(action.user), 'user'), 'seat user'); break;
      case 'unseat': keys(action, ['op', 'user']); systemCheck(matches(expr(action.user), 'user') && Object.values(manifest.targets).some(role => role.capabilities.includes('seat')), 'unseat user/seat capability'); break;
      default: throw new Error('unsupported system action');
    }
  }
}
export function validateSystemManifest(value: unknown): asserts value is SystemManifest {
  object(value); keys(value, ['schema', 'sdk', 'id', 'version', 'title', 'description', 'license', 'credits', 'targets', 'config', 'state', 'inputs', 'outputs', 'handlers', 'interaction', 'migrations']);
  systemCheck(value.schema === 1 && value.sdk === 'tonarium-systems/1' && systemId(value.id) && systemVersion(value.version), 'system identity/sdk');
  text(value.title, 100); text(value.description, 4096); text(value.license, 200); systemCheck(value.title.trim() && value.description.trim() && value.license.trim(), 'required metadata');
  systemCheck(Array.isArray(value.credits) && value.credits.length <= 16 && value.credits.every((v: unknown) => typeof v === 'string' && v.length <= 200), 'credits');
  dictionary(value.targets, 16);
  for (const role of Object.values(value.targets)) { object(role); keys(role, ['capabilities', 'required', 'multiple']); systemCheck(Array.isArray(role.capabilities) && role.capabilities.length > 0 && role.capabilities.every((c: unknown) => capabilities.includes(c as string)) && new Set(role.capabilities).size === role.capabilities.length && typeof role.required === 'boolean' && (role.multiple === undefined || typeof role.multiple === 'boolean'), 'target contract'); }
  valueSchemas(value.config); valueSchemas(value.state); ports(value.inputs); ports(value.outputs); object(value.handlers);
  systemCheck(Object.keys(value.handlers).length <= 35 && Object.keys(value.handlers).every(k => Object.hasOwn(value.inputs, k) || ['$mount', '$dispose', '$leave'].includes(k)), 'handler input');
  const manifest = value as SystemManifest; const budget = { count: 0 };
  for (const [input, handler] of Object.entries(value.handlers)) actions(handler, manifest, manifest.inputs[input]?.payload ?? {}, budget);
  if (value.interaction !== undefined) { object(value.interaction); keys(value.interaction, ['target', 'input']); systemCheck(Object.hasOwn(value.targets, value.interaction.target) && value.targets[value.interaction.target].capabilities.includes('interact') && Object.hasOwn(value.inputs, value.interaction.input) && Object.keys(value.inputs[value.interaction.input].payload).length === 0, 'interaction contract'); }
  if (value.migrations !== undefined) {
    systemCheck(Array.isArray(value.migrations) && value.migrations.length <= 32, 'migration count'); const from = new Set<string>();
    for (const migration of value.migrations) { object(migration); keys(migration, ['from', 'renameState']); systemCheck(systemVersion(migration.from) && !from.has(migration.from) && compareVersions(migration.from, value.version) < 0, 'migration version'); from.add(migration.from); if (migration.renameState !== undefined) { dictionary(migration.renameState, 32); systemCheck(Object.values(migration.renameState).every(n => typeof n === 'string' && Object.hasOwn(value.state, n)) && new Set(Object.values(migration.renameState)).size === Object.keys(migration.renameState).length, 'migration state names'); } }
  }
  systemCheck(JSON.stringify(value).length <= 256 * 1024, 'system manifest size');
}
export function compareVersions(a: string, b: string): number { systemCheck(systemVersion(a) && systemVersion(b), 'system version'); const aa = a.split('.').map(Number), bb = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] - bb[i]; return 0; }
export function latestSystem(catalog: SystemCatalog, id: string): SystemEntry {
  const matches = catalog.entries.filter(e => e.id === id).sort((a, b) => compareVersions(b.version, a.version)); systemCheck(matches.length > 0, `system unavailable: ${id}`); return matches[0];
}
function writers(actions: SystemAction[], targets: SystemManifest['targets']): [string, Capability][] {
  return actions.flatMap(action => action.op === 'if' ? [...writers(action.then, targets), ...writers(action.else ?? [], targets)]
    : action.op === 'unseat' ? Object.entries(targets).filter(([, target]) => target.capabilities.includes('seat')).map(([role]): [string, Capability] => [role, 'seat'])
    : ['move', 'text', 'seat'].includes(action.op) ? [[(action as { target: string }).target, action.op as Capability]] : []);
}
export function validateSystemMap(value: unknown, catalog: SystemCatalog, resolved?: Record<string, SystemEntry>): asserts value is SystemMap {
  object(value); keys(value, ['schema', 'id', 'objects', 'systems', 'connections']); systemCheck(value.schema === 1 && systemId(value.id), 'system map identity');
  systemCheck(Array.isArray(value.objects) && value.objects.length <= 128 && Array.isArray(value.systems) && value.systems.length <= 128 && Array.isArray(value.connections) && value.connections.length <= 256, 'system map count');
  const objects = new Map<string, any>();
  for (const item of value.objects) {
    object(item); keys(item, ['id', 'capabilities', 'position', 'rotation', 'size', 'color', 'text', 'solid', 'seatOffset', 'itemId', 'itemMode']);
    systemCheck(systemId(item.id) && !objects.has(item.id), 'object identity'); objects.set(item.id, item); vector(item.position);
    if (item.rotation !== undefined) number(item.rotation, -10000, 10000);
    if (item.size !== undefined) vector(item.size, true);
    if (item.seatOffset !== undefined) vector(item.seatOffset);
    if (item.color !== undefined) systemCheck(/^#[a-fA-F0-9]{6}$/.test(item.color), 'object color');
    if (item.text !== undefined) text(item.text, 2048);
    if (item.solid !== undefined) systemCheck(typeof item.solid === 'boolean', 'object solid');
    systemCheck(Array.isArray(item.capabilities) && item.capabilities.every((c: unknown) => capabilities.includes(c as string)) && new Set(item.capabilities).size === item.capabilities.length, 'object capabilities');
    if (item.itemId !== undefined) {
      const definition = systemItemDefinition(item.itemId);
      systemCheck(definition, 'unknown or unsupported system item ID');
      systemCheck(item.itemMode === undefined || item.itemMode === 'native' || item.itemMode === 'system', 'system item mode');
      systemCheck(item.position[1] === 0, 'system item placement must be on ground');
      systemCheck((item.itemMode ?? 'native') !== 'native' || item.capabilities.length === 0, 'native item cannot have system capabilities');
      systemCheck((item.itemMode ?? 'native') !== 'native' || !item.solid, 'native item cannot have a system collision body');
      systemCheck(!item.capabilities.includes('text') || definition.kind === 'note', 'system item text capability requires note');
    } else systemCheck(item.itemMode === undefined, 'system item mode requires item ID');
  }
  const instances = new Map<string, SystemManifest>(); const controls = new Map<string, string>();
  for (const instance of value.systems) {
    object(instance); keys(instance, ['instanceId', 'systemId', 'bindings', 'config']); systemCheck(systemId(instance.instanceId) && systemId(instance.systemId) && !instances.has(instance.instanceId), 'system instance identity');
    const selected = resolved && Object.hasOwn(resolved, instance.instanceId) ? resolved[instance.instanceId] : latestSystem(catalog, instance.systemId);
    systemCheck(selected.id === instance.systemId, 'resolved system identity');
    const manifest = selected.manifest; instances.set(instance.instanceId, manifest); dictionary(instance.bindings, 16); dictionary(instance.config, 32);
    systemCheck(Object.keys(instance.bindings).every(k => Object.hasOwn(manifest.targets, k)), 'unknown binding');
    for (const [role, contract] of Object.entries(manifest.targets)) { const bound = instance.bindings[role] ?? []; systemCheck(Array.isArray(bound) && bound.every((id: unknown) => typeof id === 'string') && new Set(bound).size === bound.length && bound.length <= (contract.multiple ? 128 : 1) && (!contract.required || bound.length > 0), `binding cardinality: ${role}`); for (const id of bound) { const target = objects.get(id); systemCheck(target && (!target.itemId || target.itemMode === 'system') && contract.capabilities.every(c => target.capabilities.includes(c)), `binding target/capability: ${role}`); } }
    for (const [name, val] of Object.entries(instance.config)) { systemCheck(Object.hasOwn(manifest.config, name), 'unknown config'); validateValue(val, manifest.config[name]); }
    for (const [role, capability] of Object.values(manifest.handlers).flatMap(handler => writers(handler, manifest.targets))) {
      const bound = instance.bindings[role] ?? [];
      if (capability === 'seat') systemCheck(bound.length === 1, 'seat requires one bound target');
      for (const id of bound) { const key = `${id}:${capability}`; systemCheck(!controls.has(key) || controls.get(key) === instance.instanceId, `object control conflict: ${key}`); controls.set(key, instance.instanceId); }
    }
  }
  const links = new Set<string>();
  for (const link of value.connections) {
    object(link); keys(link, ['from', 'output', 'to', 'input', 'mapping']); const from = instances.get(link.from), to = instances.get(link.to); systemCheck(from && to && Object.hasOwn(from.outputs, link.output) && Object.hasOwn(to.inputs, link.input), 'system connection port');
    const out = from.outputs[link.output].payload, input = to.inputs[link.input].payload; const mapping = link.mapping ?? Object.fromEntries(Object.keys(input).map(k => [k, k])); dictionary(mapping, 16);
    systemCheck(Object.keys(mapping).length === Object.keys(input).length && Object.keys(mapping).every(k => Object.hasOwn(input, k)), 'connection mapping fields');
    for (const [target, source] of Object.entries(mapping)) systemCheck(typeof source === 'string' && Object.hasOwn(out, source) && input[target] === out[source], `connection payload type: ${target}`);
    const key = JSON.stringify([link.from, link.output, link.to, link.input, Object.entries(mapping).sort(([a], [b]) => a.localeCompare(b))]); systemCheck(!links.has(key), 'duplicate system connection'); links.add(key);
  }
  systemCheck(JSON.stringify(value).length <= 256 * 1024, 'system map size');
}
export function migrateSystem(old: ResolvedSystem, previous: SystemManifest, next: SystemEntry): ResolvedSystem {
  const manifest = next.manifest; systemCheck(old.systemId === manifest.id && previous.id === manifest.id && previous.version === old.version && next.version === manifest.version && compareVersions(old.version, next.version) < 0, 'upgrade identity/version');
  for (const direction of ['inputs', 'outputs'] as const) for (const [name, port] of Object.entries(previous[direction])) { const replacement = manifest[direction][name]; systemCheck(replacement && JSON.stringify(Object.entries(port.payload).sort()) === JSON.stringify(Object.entries(replacement.payload).sort()), `incompatible ${direction}: ${name}`); }
  for (const [role, contract] of Object.entries(previous.targets)) { const replacement = manifest.targets[role]; systemCheck(replacement && replacement.required === contract.required && !!replacement.multiple === !!contract.multiple && replacement.capabilities.length === contract.capabilities.length && contract.capabilities.every(c => replacement.capabilities.includes(c)), `incompatible target: ${role}`); }
  for (const [role, contract] of Object.entries(manifest.targets)) systemCheck(!contract.required || (old.bindings[role]?.length ?? 0) > 0, `new required target: ${role}`);
  const config = structuredClone(old.config);
  for (const [name, field] of Object.entries(previous.config)) systemCheck(manifest.config[name]?.type === field.type, `incompatible config: ${name}`);
  for (const [name, field] of Object.entries(manifest.config)) { const val = Object.hasOwn(config, name) ? config[name] : field.default; validateValue(val, field); config[name] = val; }
  const renames = manifest.migrations?.find(m => m.from === old.version)?.renameState ?? {};
  const state: Record<string, SystemValue> = {};
  for (const [name, field] of Object.entries(previous.state)) { const target = renames[name] ?? name; systemCheck(manifest.state[target]?.type === field.type, `incompatible state: ${name}`); const val = Object.hasOwn(old.state, name) ? old.state[name] : field.default; validateValue(val, manifest.state[target]); systemCheck(!Object.hasOwn(state, target), 'state migration collision'); state[target] = val; }
  for (const [name, field] of Object.entries(manifest.state)) if (!Object.hasOwn(state, name)) state[name] = structuredClone(field.default);
  return { ...structuredClone(old), version: next.version, integrity: next.integrity, config, state };
}
