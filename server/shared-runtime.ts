import { check, emptyMap, identifier, LIMITS, refKey, validateMap, type AssetCommand, type AssetView, type Catalog, type SharedMap } from '../shared/shared-assets.ts';
import { createHash } from 'node:crypto';
export interface RuntimeState { revision: number; map: SharedMap; values: Record<string, number>; commands: { key: string; body: string }[] }
export const initialRuntime = (): RuntimeState => ({ revision: 0, map: emptyMap(), values: {}, commands: [] });
export class SharedRuntime {
  private state: RuntimeState;
  private activeCatalog: Catalog;
  constructor(private catalog: () => Catalog, private persist: (state: RuntimeState) => void, state = initialRuntime()) { this.state = structuredClone(state); this.activeCatalog = this.catalog(); validateMap(this.state.map, this.activeCatalog.entries); }
  private fieldKey(map: SharedMap, instanceId: string, field: string, user: string) {
    const p = map.placements.find(p => p.instanceId === instanceId)!;
    const m = this.activeCatalog.entries.find(e => refKey(e) === refKey(p.asset) && e.integrity === p.asset.integrity)!.manifest;
    const scope = m.fields[field].scope;
    return JSON.stringify([scope === 'session' ? refKey(p.asset) : instanceId, field, scope === 'participant' ? user : '']);
  }
  view(user: string): AssetView {
    this.activeCatalog = this.catalog();
    const values: AssetView['values'] = {};
    for (const p of this.state.map.placements) {
      const m = this.activeCatalog.entries.find(e => refKey(e) === refKey(p.asset))!.manifest;
      values[p.instanceId] = Object.fromEntries(Object.entries(m.fields).map(([name, f]) => [name, this.state.values[this.fieldKey(this.state.map, p.instanceId, name, user)] ?? p.config[name] ?? f.initial]));
    }
    return { revision: this.state.revision, map: structuredClone(this.state.map), values };
  }
  apply(user: string, command: AssetCommand): 'applied' | 'duplicate' {
    this.activeCatalog = this.catalog();
    check(typeof user === 'string' && user.length <= 128 && user.length > 0, 'actor');
    check(command && identifier(command.id), 'command id'); const key = JSON.stringify([user, command.id]); const json = JSON.stringify(command);
    check(Buffer.byteLength(json) <= 256 * 1024, 'command size'); const body = createHash('sha256').update(json).digest('hex');
    const prior = this.state.commands.find(c => c.key === key);
    if (prior) { check(prior.body === body, 'command id reused'); return 'duplicate'; }
    check(command.revision === this.state.revision, 'revision conflict: resync');
    const next = structuredClone(this.state);
    if (command.kind === 'map') {
      validateMap(command.map, this.activeCatalog.entries);
      // 更新は明示的な試験・移行を必要とし、既存配置の原本を暗黙に交換しない。
      for (const p of command.map.placements) { const old = next.map.placements.find(x => x.instanceId === p.instanceId); check(!old || JSON.stringify(old.asset) === JSON.stringify(p.asset), 'upgrade requires new instance after migration'); }
      next.map = structuredClone(command.map);
      const keep = new Set<string>();
      for (const p of next.map.placements) { keep.add(p.instanceId); keep.add(refKey(p.asset)); }
      for (const k of Object.keys(next.values)) if (!keep.has(JSON.parse(k)[0])) delete next.values[k];
    } else {
      check(command.kind === 'events' && Array.isArray(command.events) && command.events.length > 0 && command.events.length <= LIMITS.commands, 'event budget');
      const queue = command.events.map(e => ({ ...e })); let count = 0;
      while (queue.length) {
        check(++count <= LIMITS.commands, 'connection event budget'); const event = queue.shift()!;
        const p = next.map.placements.find(p => p.instanceId === event.instanceId); check(p, 'instance');
        const m = this.activeCatalog.entries.find(e => refKey(e) === refKey(p.asset))!.manifest; check(m.inputs.includes(event.event), 'input');
        for (const r of m.rules.filter(r => r.event === event.event)) {
          const field = m.fields[r.field]; const k = this.fieldKey(next.map, p.instanceId, r.field, user);
          const before = next.values[k] ?? p.config[r.field] ?? field.initial;
          const value = r.op === 'set' ? r.value : before + r.value;
          next.values[k] = Math.min(field.max, Math.max(field.min, value));
        }
        for (const c of next.map.connections) if (c.from === p.instanceId && c.output === event.event && m.outputs.includes(event.event)) queue.push({ instanceId: c.to, event: c.input });
      }
    }
    check(JSON.stringify(next.values).length <= LIMITS.state, 'state budget');
    next.revision++; next.commands.push({ key, body });
    if (next.commands.length > 128) next.commands.shift();
    // 再起動後も再送を識別できるよう、確定履歴と状態を一緒に保存する。
    this.persist(next); this.state = next; return 'applied';
  }
}
