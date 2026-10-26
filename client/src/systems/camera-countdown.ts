import type { SystemView } from '../../../shared/system-types.ts';
import type { Item } from '../../../shared/items.ts';
import { isCameraTimerItem } from '../../../shared/camera-timer-demo.ts';

export function cameraTimerLabel(item: Item, view: SystemView | undefined): string | undefined {
  if (!view || !isCameraTimerItem(item) || view.map.id !== item.mapPlacement?.mapId) return;
  const shot = view.systems.find(system => system.instanceId === 'camera-shot')?.state;
  const timer = view.systems.find(system => system.instanceId === 'camera-delay')?.state;
  if (shot?.busy && typeof timer?.remaining === 'number') return String(Math.max(0, Math.ceil(timer.remaining)));
}

export class CameraCountdown {
  private pending?: { token: string; accepted: boolean; lastSecond: number };

  get waiting() { return !!this.pending; }
  begin(token: string) { this.pending = { token, accepted: false, lastSecond: Infinity }; }
  cancel() { this.pending = undefined; }

  update(view: SystemView | undefined, user: string, now: number, error?: string): { beep: boolean; capture: boolean } {
    const result = { beep: false, capture: false }, pending = this.pending;
    if (!pending) return result;
    if (error && error !== 'system revision conflict') { this.cancel(); return result; }
    const state = view?.map.id === 'camera-timer-demo' && view.systems.find(system => system.instanceId === 'camera-shot')?.state;
    if (!state) { this.cancel(); return result; }
    if (state['completed-token'] === pending.token && state['completed-by'] === user) {
      this.cancel();
      result.capture = true;
      return result;
    }
    if (state.token !== pending.token || state.requester !== user) {
      if (pending.accepted || state.busy) this.cancel();
      return result;
    }
    if (!state.busy || typeof state.deadline !== 'number') { this.cancel(); return result; }
    pending.accepted = true;
    const second = Math.ceil(Math.max(0, state.deadline - now) / 1000);
    if (second > 0 && second <= 5 && second < pending.lastSecond) {
      pending.lastSecond = second;
      result.beep = true;
    }
    return result;
  }
}
