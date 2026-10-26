import { useCallback, useEffect, useState } from 'react';
import type { Item } from '../../../shared/items.ts';
import { get, serverNow, showToast, useStore } from '../store.ts';
import { msg } from '../i18n/index.ts';
import { itemAction } from './actions.ts';
import { playCountdownBeep, prepareCountdownSound } from './effects.ts';
import { bindTimedCameraRequest, createTimedCameraController, timedCameraSeconds, triggerTimedCameraRequest } from './timed-camera-controller.ts';

type CameraItem = Extract<Item, { kind: 'camera' }>;

export function requestTimedCamera(id: string): boolean {
  const result = triggerTimedCameraRequest(id);
  if (result === undefined) showToast(msg('cameraTimerPreparing'));
  return result ?? false;
}

export function useTimedCamera(item: CameraItem) {
  const session = useStore(state => state.session), sync = useStore(state => state.sync);
  const mode = useStore(state => state.mode), user = useStore(state => state.selfId);
  const enabled = item.variant === 'camera-timer' && item.mapPlacement?.mode !== 'system';
  const [seconds, setSeconds] = useState<string>();
  useEffect(() => {
    if (!enabled || !session || sync !== 'connected' || mode !== '3d' || !user) { setSeconds(undefined); return; }
    let active = true, failed = false, capture: typeof import('../view3d/cameraRender.ts') | undefined;
    const current = () => {
      const state = get(), camera = state.items[item.id];
      return state.session === session && state.selfId === user && state.sync === 'connected' && state.mode === '3d'
        && camera?.kind === 'camera' && camera.variant === 'camera-timer' && !camera.holder && camera.mapPlacement?.mode !== 'system' ? camera : undefined;
    };
    const controller = createTimedCameraController({
      user, read: current, ready: () => !!capture?.world.scene && !!capture.world.camera,
      now: serverNow, elapsed: () => performance.now(), nonce: () => crypto.randomUUID(), prepare: prepareCountdownSound, beep: playCountdownBeep,
      send: token => itemAction(item.id, { a: 'timedCameraRequest', token }),
      capture: camera => capture!.takePhoto(camera),
      notReady: () => showToast(msg(failed ? 'cameraTimerFailed' : 'cameraTimerPreparing')),
      failed: () => showToast(msg('cameraTimerFailed')),
    });
    const update = () => {
      setSeconds(timedCameraSeconds(current()?.timerState, serverNow()));
      controller.update();
    };
    void import('../view3d/cameraRender.ts').then(module => { if (active) { capture = module; update(); } }).catch(() => { failed = true; });
    const unbind = bindTimedCameraRequest(item.id, controller.start), unsubscribe = useStore.subscribe(update);
    const interval = setInterval(update, 50);
    update();
    return () => { active = false; clearInterval(interval); unsubscribe(); unbind(); controller.cancel(); };
  }, [enabled, item.id, session, sync, mode, user]);
  const start = useCallback(() => requestTimedCamera(item.id), [item.id]);
  return { start, seconds: enabled ? seconds : undefined };
}
