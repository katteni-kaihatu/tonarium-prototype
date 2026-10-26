import { randomUUID } from 'node:crypto';
import { cameraTimerDemoMap } from '../shared/camera-timer-demo.ts';
import type { Item } from '../shared/items.ts';
import type { SystemMap, SystemValue, SystemView } from '../shared/system-types.ts';
import { SystemService } from './system-service.ts';

type TimedCameraItem = Extract<Item, { kind: 'camera' }> & { variant: 'camera-timer'; timerState?: SystemView };
const timedCamera = (item: Item): item is TimedCameraItem => item.kind === 'camera' && 'variant' in item && item.variant === 'camera-timer';
const scopeOf = (sid: string, item: Item) => JSON.stringify(['timed-camera', sid, item.id]);
const shotState = (view: SystemView): Record<string, SystemValue> | undefined => view.systems.find(system => system.instanceId === 'camera-shot')?.state;
const serverActor = 'timed-camera';
const emptyMap: SystemMap = { schema: 1, id: 'empty', objects: [], systems: [], connections: [] };

export class TimedCameraItems {
  private cleared = new Set<string>();
  constructor(private systems: SystemService) {}

  request(sid: string, actor: string, item: Item, token: string, participants: string[]): boolean {
    if (!timedCamera(item) || item.mapPlacement?.mode === 'system' || item.holder !== null || typeof token !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(token)
      || typeof actor !== 'string' || !actor.length || actor.length > 128 || !participants.includes(actor)) return false;
    const scope = scopeOf(sid, item);
    let view = this.ensure(scope);
    view = this.cancelUnavailable(scope, view, item, participants);
    const state = shotState(view);
    if (!state || state.busy || state['completed-token'] === token || state.token === token) return this.copy(item, view);
    this.systems.apply(scope, actor, { kind: 'input', id: `camera-${randomUUID()}`, revision: view.revision, instanceId: 'camera-shot', input: 'request', payload: { token } }, participants);
    return this.copy(item, this.systems.view(scope));
  }

  tick(sid: string, items: Iterable<Item>, participants: string[]): Item[] {
    const changed: Item[] = [];
    for (const item of items) {
      if (!timedCamera(item)) continue;
      const scope = scopeOf(sid, item);
      if (item.mapPlacement?.mode === 'system') { if (this.clear(scope, item)) changed.push(item); continue; }
      this.cancelUnavailable(scope, this.ensure(scope), item, participants);
      this.systems.tick(scope, participants);
      if (this.copy(item, this.systems.view(scope))) changed.push(item);
    }
    return changed;
  }

  leave(sid: string, user: string, items: Iterable<Item>): Item[] {
    const changed: Item[] = [];
    for (const item of items) {
      if (!timedCamera(item)) continue;
      const scope = scopeOf(sid, item);
      if (item.mapPlacement?.mode === 'system') { if (this.clear(scope, item)) changed.push(item); continue; }
      this.ensure(scope);
      this.systems.leave(scope, user);
      if (this.copy(item, this.systems.view(scope))) changed.push(item);
    }
    return changed;
  }

  remove(sid: string, item: Item): void {
    if (!timedCamera(item)) return;
    const scope = scopeOf(sid, item);
    this.clear(scope, item);
    this.cleared.delete(scope);
  }

  release(sid: string, items: Iterable<Item>): void {
    for (const item of items) if (timedCamera(item)) {
      const scope = scopeOf(sid, item);
      this.systems.release(scope); this.cleared.delete(scope);
    }
  }

  private ensure(scope: string): SystemView {
    this.cleared.delete(scope);
    let view = this.systems.view(scope);
    if (view.map.id !== cameraTimerDemoMap.id) {
      this.systems.load(scope, serverActor, cameraTimerDemoMap, [serverActor]);
      view = this.systems.view(scope);
    }
    return view;
  }

  private clear(scope: string, item: TimedCameraItem): boolean {
    const changed = item.timerState !== undefined;
    if (!this.cleared.has(scope)) {
      const view = this.systems.view(scope);
      if (view.map.id !== emptyMap.id || view.systems.length) this.systems.load(scope, serverActor, emptyMap, [serverActor]);
      this.systems.release(scope); this.cleared.add(scope);
    }
    delete item.timerState;
    return changed;
  }

  private cancelUnavailable(scope: string, view: SystemView, item: TimedCameraItem, participants: string[]): SystemView {
    const state = shotState(view), requester = state?.requester;
    if (state?.busy && typeof requester === 'string' && (item.holder !== null || !participants.includes(requester))) {
      this.systems.leave(scope, requester);
      return this.systems.view(scope);
    }
    return view;
  }

  private copy(item: TimedCameraItem, view: SystemView): boolean {
    if (JSON.stringify(item.timerState) === JSON.stringify(view)) return false;
    item.timerState = view;
    return true;
  }
}
