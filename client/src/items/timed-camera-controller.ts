import type { Item } from '../../../shared/items.ts';
import type { SystemView } from '../../../shared/system-types.ts';
import { CameraCountdown } from '../systems/camera-countdown.ts';

type CameraItem = Extract<Item, { kind: 'camera' }>;
interface TimedCameraOptions {
  user: string;
  read: () => CameraItem | undefined;
  ready: () => boolean;
  send: (token: string) => void;
  capture: (item: CameraItem) => void;
  now: () => number;
  elapsed?: () => number;
  nonce: () => string;
  prepare: () => void;
  beep: () => void;
  notReady?: () => void;
  failed?: () => void;
}

export function timedCameraSeconds(view: SystemView | undefined, now: number): string | undefined {
  if (view?.map.id !== 'camera-timer-demo') return;
  const state = view.systems.find(system => system.instanceId === 'camera-shot')?.state;
  if (state?.busy && typeof state.deadline === 'number' && Number.isFinite(state.deadline)) return String(Math.ceil(Math.max(0, state.deadline - now) / 1000));
}

export function createTimedCameraController(options: TimedCameraOptions) {
  const countdown = new CameraCountdown();
  let requestedAt: number | undefined;
  const current = () => {
    const item = options.read();
    return item?.variant === 'camera-timer' && !item.holder && item.mapPlacement?.mode !== 'system' ? item : undefined;
  };
  const cancel = () => { countdown.cancel(); requestedAt = undefined; };
  return {
    get waiting() { return countdown.waiting; },
    cancel,
    start() {
      const item = current();
      if (!item || !options.ready()) { options.notReady?.(); return false; }
      if (countdown.waiting || item.timerState?.systems.find(system => system.instanceId === 'camera-shot')?.state.busy) return false;
      try {
        options.prepare();
        const token = options.nonce();
        countdown.begin(token); requestedAt = (options.elapsed ?? options.now)();
        options.send(token);
        return true;
      } catch { cancel(); options.failed?.(); return false; }
    },
    update() {
      if (!countdown.waiting) return;
      const item = current();
      if (!item || !options.ready()) { cancel(); return; }
      const now = options.now();
      if (requestedAt !== undefined && (options.elapsed ?? options.now)() - requestedAt > 15000) { cancel(); options.failed?.(); return; }
      if (!item.timerState) return;
      const result = countdown.update(item.timerState, options.user, now);
      if (!countdown.waiting) requestedAt = undefined;
      if (result.beep) { try { options.beep(); } catch { /* 音が出せなくても撮影は続ける。 */ } }
      if (result.capture) { try { options.capture(item); } catch { options.failed?.(); } }
    },
  };
}

const requests = new Map<string, () => boolean>();
export function bindTimedCameraRequest(id: string, start: () => boolean) {
  requests.set(id, start);
  return () => { if (requests.get(id) === start) requests.delete(id); };
}
export const triggerTimedCameraRequest = (id: string) => requests.get(id)?.();
