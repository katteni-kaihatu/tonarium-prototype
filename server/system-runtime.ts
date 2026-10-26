import { createHash } from 'node:crypto';
import { check, identifier } from '../shared/shared-assets.ts';
import { compareVersions, latestSystem, migrateSystem, validatePayload, validateSystemMap, validateValue } from '../shared/systems.ts';
import type { Expression, ResolvedSystem, SystemAction, SystemCatalog, SystemCommand, SystemEntry, SystemManifest, SystemMap, SystemRuntimeState, SystemValue, SystemView, Vector3 } from '../shared/system-types.ts';

const empty = (): SystemRuntimeState => ({ revision: 0, map: { schema: 1, id: 'empty', objects: [], systems: [], connections: [] }, systems: [], objects: {}, seats: {}, schedules: [], commands: [], diagnostics: [], traces: [] });
const own = <T>(v: Record<string, T>, key: string): T | undefined => Object.hasOwn(v, key) ? v[key] : undefined;
interface Context { actor: string; payload: Record<string, SystemValue>; participants: Set<string>; steps: number; events: number }

export class SystemRuntime {
  private state: SystemRuntimeState;
  private closed = false;
  constructor(private catalog: () => SystemCatalog, private persist: (state: SystemRuntimeState) => void, state = empty(), private now = Date.now) {
    this.state = structuredClone(state);
    check(Number.isSafeInteger(state.revision) && state.revision >= 0, 'system revision');
    validateSystemMap(state.map, this.catalog(), this.resolvedEntries(state));
    for (const system of state.systems) {
      const manifest = this.entry(system).manifest;
      for (const [name, value] of Object.entries(system.state)) { check(Object.hasOwn(manifest.state, name), 'stored state field'); validateValue(value, manifest.state[name]); }
    }
    this.budget(state);
  }
  private entry(system: ResolvedSystem): SystemEntry {
    const entry = this.catalog().entries.find(e => e.id === system.systemId && e.version === system.version && e.integrity === system.integrity);
    check(entry, `system original unavailable: ${system.instanceId}`); return entry;
  }
  private resolvedEntries(state: SystemRuntimeState): Record<string, SystemEntry> { return Object.fromEntries(state.systems.map(s => [s.instanceId, this.entry(s)])); }
  view(): SystemView { const { commands: _commands, schedules: _schedules, ...view } = this.state; return structuredClone(view); }
  private budget(state: SystemRuntimeState) {
    check(state.systems.length <= 128 && state.schedules.length <= 256, 'system resource budget');
    for (const object of state.map.objects) if (object.itemId) check(state.objects[object.id]?.position[1] === 0, 'map items must remain on the ground');
    check(Buffer.byteLength(JSON.stringify(state)) <= 512 * 1024, 'system state budget');
  }
  private commit(next: SystemRuntimeState) {
    check(!this.closed, 'system runtime disposed'); this.budget(next);
    next.revision = this.state.revision + 1;
    this.persist(structuredClone(next)); this.state = next;
  }
  private context(actor: string, participants: string[], payload: Record<string, SystemValue> = {}): Context { return { actor, payload, participants: new Set(participants), steps: 0, events: 0 }; }
  private numeric(value: SystemValue): number { check(typeof value === 'number' && Number.isFinite(value), 'numeric expression'); return value; }
  private expr(expression: Expression, system: ResolvedSystem, context: Context, depth = 0): SystemValue {
    check(++context.steps <= 4096 && depth <= 8, 'system instruction budget');
    if (expression === null || typeof expression !== 'object') return expression;
    if ('state' in expression) { const value = own(system.state, expression.state); check(value !== undefined, 'state expression'); return value; }
    if ('config' in expression) { const value = own(system.config, expression.config); check(value !== undefined, 'config expression'); return value; }
    if ('event' in expression) { const value = own(context.payload, expression.event); check(value !== undefined, 'event expression'); return value; }
    if ('actor' in expression) return context.actor;
    if ('now' in expression) return this.now();
    const values = expression.args.map(e => this.expr(e, system, context, depth + 1));
    if (expression.calc === 'eq') return values[0] === values[1];
    if (expression.calc === 'not') { check(typeof values[0] === 'boolean', 'boolean expression'); return !values[0]; }
    const numbers = values.map(v => this.numeric(v)); let value: number;
    switch (expression.calc) {
      case 'add': value = numbers.reduce((a, b) => a + b, 0); break;
      case 'sub': value = numbers[0] - numbers[1]; break;
      case 'mul': value = numbers.reduce((a, b) => a * b, 1); break;
      case 'div': check(numbers[1] !== 0, 'division by zero'); value = numbers[0] / numbers[1]; break;
      case 'min': value = Math.min(...numbers); break;
      case 'max': value = Math.max(...numbers); break;
      case 'gt': return numbers[0] > numbers[1];
      case 'ceil': value = Math.ceil(numbers[0]); break;
      case 'clock': {
        const seconds = Math.max(0, numbers[0]);
        let whole = Math.floor(seconds), milliseconds = Math.round((seconds - whole) * 1000);
        if (milliseconds === 1000) { whole++; milliseconds = 0; }
        // 残り時間が正の間は、表示だけが先にゼロにならないようにする。
        if (seconds > 0 && whole === 0 && milliseconds === 0) milliseconds = 1;
        const fraction = milliseconds ? `.${milliseconds.toString().padStart(3, '0').replace(/0+$/, '')}` : '';
        return `${Math.floor(whole / 60).toString().padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}${fraction}`;
      }
      default: throw new Error('unsupported calculation');
    }
    check(Number.isFinite(value), 'nonfinite expression'); return value;
  }
  private payload(expressions: Record<string, Expression>, system: ResolvedSystem, context: Context) { return Object.fromEntries(Object.entries(expressions).map(([name, e]) => [name, this.expr(e, system, context)])); }
  private targets(next: SystemRuntimeState, system: ResolvedSystem, name: string, capability: string): string[] {
    const manifest = this.entry(system).manifest;
    check(Object.hasOwn(manifest.targets, name) && manifest.targets[name].capabilities.includes(capability as never), 'undeclared target capability');
    const ids = own(system.bindings, name) ?? [];
    for (const id of ids) check(next.map.objects.some(o => o.id === id && o.capabilities.includes(capability as never)), 'target unavailable');
    return ids;
  }
  private checkReferences(payload: Record<string, SystemValue>, manifest: SystemManifest, input: string, next: SystemRuntimeState, context: Context) {
    const port = own(manifest.inputs, input); check(port, 'system input'); validatePayload(payload, port.payload);
    for (const [key, type] of Object.entries(port.payload)) {
      if (type === 'user') check(typeof payload[key] === 'string' && context.participants.has(payload[key] as string), 'target user unavailable');
      if (type === 'object') check(next.map.objects.some(o => o.id === payload[key]), 'event object unavailable');
    }
  }
  private event(next: SystemRuntimeState, system: ResolvedSystem, input: string, payload: Record<string, SystemValue>, context: Context, lifecycle = false) {
    const manifest = this.entry(system).manifest;
    const handler = own(manifest.handlers, input) ?? [];
    if (lifecycle && handler.length === 0) return;
    check(++context.events <= 64, 'system event budget');
    if (!lifecycle) this.checkReferences(payload, manifest, input, next, context);
    next.traces.push({ instanceId: system.instanceId, event: input, actor: context.actor, at: this.now() });
    next.traces = next.traces.slice(-64);
    const previous = context.payload; context.payload = payload;
    try { this.actions(next, system, handler, context); } finally { context.payload = previous; }
  }
  private actions(next: SystemRuntimeState, system: ResolvedSystem, actions: SystemAction[], context: Context) {
    const manifest = this.entry(system).manifest;
    for (const action of actions) {
      check(++context.steps <= 4096, 'system instruction budget');
      switch (action.op) {
        case 'set': { check(Object.hasOwn(manifest.state, action.field), 'system state field'); const value = this.expr(action.value, system, context); validateValue(value, manifest.state[action.field]); system.state[action.field] = value; break; }
        case 'if': { const value = this.expr(action.condition, system, context); check(typeof value === 'boolean', 'condition type'); this.actions(next, system, value ? action.then : action.else ?? [], context); break; }
        case 'emit': {
          const port = own(manifest.outputs, action.port); check(port, 'system output'); const payload = this.payload(action.payload, system, context); validatePayload(payload, port.payload);
          for (const link of next.map.connections.filter(c => c.from === system.instanceId && c.output === action.port)) {
            const receiver = next.systems.find(s => s.instanceId === link.to); check(receiver, 'connection target');
            const target = own(this.entry(receiver).manifest.inputs, link.input); check(target, 'connection input');
            const mapped = Object.fromEntries(Object.keys(target.payload).map(to => [to, payload[link.mapping?.[to] ?? to]]));
            this.event(next, receiver, link.input, mapped, context);
          }
          break;
        }
        case 'move': {
          const offset = action.offset.map(e => this.numeric(this.expr(e, system, context)));
          for (const id of this.targets(next, system, action.target, 'move')) { const original = next.map.objects.find(o => o.id === id)!; const position = original.position.map((v, i) => v + offset[i]) as Vector3; check(position.every(v => Number.isFinite(v) && Math.abs(v) <= 10000), 'movement bounds'); check(!original.itemId || position[1] === 0, 'map items must remain on the ground'); next.objects[id].position = position; }
          break;
        }
        case 'text': { const value = this.expr(action.value, system, context); check(value !== null && String(value).length <= 2048, 'display text limit'); for (const id of this.targets(next, system, action.target, 'text')) next.objects[id].text = String(value); break; }
        case 'schedule': {
          const delay = this.numeric(this.expr(action.delayMs, system, context)); check(delay >= 0 && delay <= 86_400_000, 'timer delay');
          const payload = this.payload(action.payload, system, context); this.checkReferences(payload, manifest, action.input, next, context);
          next.schedules = next.schedules.filter(s => s.instanceId !== system.instanceId || s.key !== action.key);
          next.schedules.push({ instanceId: system.instanceId, key: action.key, due: this.now() + delay, input: action.input, payload, actor: context.actor });
          check(next.schedules.length <= 256, 'timer budget'); break;
        }
        case 'cancel': next.schedules = next.schedules.filter(s => s.instanceId !== system.instanceId || s.key !== action.key); break;
        case 'seat': {
          const user = this.expr(action.user, system, context); check(typeof user === 'string' && context.participants.has(user), 'seat user unavailable');
          const ids = this.targets(next, system, action.target, 'seat'); check(ids.length === 1, 'single seat target');
          check(!own(next.seats, ids[0]) || next.seats[ids[0]] === user, 'seat occupied');
          check(!Object.entries(next.seats).some(([id, occupant]) => id !== ids[0] && occupant === user), 'user already seated'); next.seats[ids[0]] = user; break;
        }
        case 'unseat': {
          const user = this.expr(action.user, system, context); check(typeof user === 'string', 'unseat user');
          const allowed = Object.entries(manifest.targets).filter(([, target]) => target.capabilities.includes('seat')).flatMap(([name]) => own(system.bindings, name) ?? []);
          for (const id of allowed) if (next.seats[id] === user) delete next.seats[id]; break;
        }
      }
    }
  }
  private install(next: SystemRuntimeState, map: SystemMap, context: Context) {
    check(map && Array.isArray(map.systems), 'system map');
    const sameMap = next.map.id === map.id;
    const resolved = Object.fromEntries(map.systems.map(instance => {
      const old = sameMap ? next.systems.find(s => s.instanceId === instance.instanceId) : undefined;
      check(!old || old.systemId === instance.systemId, 'instance system identity');
      return [instance.instanceId, old ? this.entry(old) : latestSystem(this.catalog(), instance.systemId)];
    }));
    validateSystemMap(map, this.catalog(), resolved);
    for (const old of next.systems) if (!sameMap || !map.systems.some(s => s.instanceId === old.instanceId)) this.event(next, old, '$dispose', {}, context, true);
    if (!sameMap) {
      // 別マップの同名配置に、終了処理の効果や実行中の状態を引き継がない。
      next.systems = []; next.objects = {}; next.seats = {}; next.schedules = []; next.traces = []; next.diagnostics = [];
    }
    const systems = map.systems.map(instance => {
      const old = next.systems.find(s => s.instanceId === instance.instanceId);
      check(!old || old.systemId === instance.systemId, 'instance system identity');
      const entry = resolved[instance.instanceId];
      const config = Object.fromEntries(Object.entries(entry.manifest.config).map(([name, field]) => [name, own(instance.config, name) ?? field.default]));
      return { ...structuredClone(instance), version: entry.version, integrity: entry.integrity, config, state: old ? structuredClone(old.state) : Object.fromEntries(Object.entries(entry.manifest.state).map(([name, field]) => [name, field.default])) };
    });
    const previous = next.map; const previousIds = new Set(next.systems.map(s => s.instanceId));
    next.objects = Object.fromEntries(map.objects.map(object => {
      const old = previous.objects.find(o => o.id === object.id); const state = own(next.objects, object.id);
      const position = old && state ? object.position.map((v, i) => v + state.position[i] - old.position[i]) as Vector3 : [...object.position] as Vector3;
      check(position.every(v => Number.isFinite(v) && Math.abs(v) <= 10000), 'movement bounds');
      const text = state?.text ?? object.text;
      return [object.id, { position, ...(text === undefined ? {} : { text }) }];
    }));
    next.map = structuredClone(map); next.systems = systems;
    next.schedules = next.schedules.filter(s => systems.some(i => i.instanceId === s.instanceId));
    for (const id of Object.keys(next.seats)) if (!map.objects.some(o => o.id === id && o.capabilities.includes('seat'))) delete next.seats[id];
    for (const system of systems) if (!previousIds.has(system.instanceId)) this.event(next, system, '$mount', {}, context, true);
  }
  apply(actor: string, command: SystemCommand, participants = [actor]): 'applied' | 'duplicate' {
    check(!this.closed, 'system runtime disposed'); check(typeof actor === 'string' && actor.length > 0 && actor.length <= 128 && participants.includes(actor), 'system actor');
    check(command && identifier(command.id), 'system command id'); const json = JSON.stringify(command); check(Buffer.byteLength(json) <= 256 * 1024, 'system command size');
    const body = createHash('sha256').update(json).digest('hex'); const prior = this.state.commands.find(c => c.id === command.id && c.actor === actor);
    if (prior) { check(prior.body === body, 'system command id reused'); return 'duplicate'; }
    check(command.revision === this.state.revision, 'system revision conflict');
    const next = structuredClone(this.state), context = this.context(actor, participants);
    if (command.kind === 'map') this.install(next, command.map, context);
    else if (command.kind === 'input') { const system = next.systems.find(s => s.instanceId === command.instanceId); check(system, 'system instance'); this.event(next, system, command.input, command.payload, context); }
    else {
      check(command.kind === 'interact', 'system command'); const object = next.map.objects.find(o => o.id === command.objectId); check(object?.capabilities.includes('interact'), 'interaction target');
      for (const system of next.systems) { const interaction = this.entry(system).manifest.interaction; if (interaction && (own(system.bindings, interaction.target) ?? []).includes(command.objectId)) this.event(next, system, interaction.input, {}, context); }
    }
    next.commands.push({ id: command.id, actor, body }); next.commands = next.commands.slice(-128); this.commit(next); return 'applied';
  }
  tick(participants: string[]): boolean {
    check(!this.closed, 'system runtime disposed'); let next = structuredClone(this.state);
    const active = new Set(participants);
    for (const [object, user] of Object.entries(next.seats)) if (!active.has(user)) delete next.seats[object];
    next.schedules = next.schedules.filter(schedule => {
      const system = next.systems.find(s => s.instanceId === schedule.instanceId);
      const port = system ? this.entry(system).manifest.inputs[schedule.input] : undefined;
      return !!port && Object.entries(port.payload).every(([key, type]) => type !== 'user' || active.has(schedule.payload[key] as string));
    });
    const due = next.schedules.filter(s => s.due <= this.now()).slice(0, 32);
    if (!due.length) { if (JSON.stringify(next) === JSON.stringify(this.state)) return false; this.commit(next); return true; }
    for (const schedule of due) {
      next.schedules = next.schedules.filter(s => s.instanceId !== schedule.instanceId || s.key !== schedule.key);
      const trial = structuredClone(next), system = trial.systems.find(s => s.instanceId === schedule.instanceId); if (!system) continue;
      try { this.event(trial, system, schedule.input, schedule.payload, this.context(schedule.actor, participants)); next = trial; }
      catch (error) { next.diagnostics = [...next.diagnostics, `${schedule.instanceId}: ${error instanceof Error ? error.message : 'timer failed'}`].slice(-32); }
    }
    this.commit(next); return true;
  }
  leave(user: string): boolean {
    check(!this.closed, 'system runtime disposed'); let next = structuredClone(this.state); const before = JSON.stringify(next);
    const participants = [...new Set(Object.values(next.seats).filter(u => u !== user))];
    for (const system of next.systems) {
      const trial = structuredClone(next), instance = trial.systems.find(s => s.instanceId === system.instanceId)!;
      try { this.event(trial, instance, '$leave', {}, this.context(user, participants), true); next = trial; }
      catch (error) { next.diagnostics = [...next.diagnostics, `${system.instanceId}: leave cleanup failed (${error instanceof Error ? error.message : 'unknown'})`].slice(-32); }
    }
    for (const [id, occupant] of Object.entries(next.seats)) if (occupant === user) delete next.seats[id];
    next.schedules = next.schedules.filter(s => !Object.values(s.payload).includes(user));
    next.commands = next.commands.filter(c => c.actor !== user);
    // 退出だけで履歴を増やすと、未使用の部屋まで保存が続くため抑える。
    next.traces = this.state.traces;
    if (JSON.stringify(next) === before) return false; this.commit(next); return true;
  }
  refresh(): boolean {
    check(!this.closed, 'system runtime disposed'); const next = structuredClone(this.state); const diagnostics: string[] = [];
    for (let i = 0; i < next.systems.length; i++) {
      const old = next.systems[i];
      try {
        const latest = latestSystem(this.catalog(), old.systemId);
        if (latest.integrity !== old.integrity) {
          try { next.systems[i] = migrateSystem(old, this.entry(old).manifest, latest); }
          catch (directError) {
            let migrated = old;
            const releases = this.catalog().entries.filter(e => e.id === old.systemId && compareVersions(e.version, old.version) > 0).sort((a, b) => compareVersions(a.version, b.version));
            for (const release of releases) { try { migrated = migrateSystem(migrated, this.entry(migrated).manifest, release); } catch { /* 後続版が直接移行を持つ場合は中間版を飛ばせる。 */ } }
            if (migrated.integrity !== latest.integrity) throw directError;
            next.systems[i] = migrated;
          }
        }
      }
      catch (error) { diagnostics.push(`${old.instanceId}: update retained previous system (${error instanceof Error ? error.message : 'incompatible'})`); }
    }
    try { validateSystemMap(next.map, this.catalog(), this.resolvedEntries(next)); }
    catch (error) { next.systems = structuredClone(this.state.systems); diagnostics.push(`update retained previous map (${error instanceof Error ? error.message : 'incompatible connection'})`); }
    const timerValid = next.schedules.every(s => {
      const system = next.systems.find(i => i.instanceId === s.instanceId); const port = system ? own(this.entry(system).manifest.inputs, s.input) : undefined;
      if (!port) return false;
      try { validatePayload(s.payload, port.payload); return true; } catch { return false; }
    });
    if (!timerValid) { next.systems = structuredClone(this.state.systems); diagnostics.push('update retained previous system (scheduled input removed)'); }
    next.diagnostics = [...new Set([...this.state.diagnostics.filter(d => !d.includes('update retained previous')), ...diagnostics])].slice(-32);
    if (JSON.stringify(next) === JSON.stringify(this.state)) return false; this.commit(next); return true;
  }
  dispose() { this.closed = true; }
}
