import { useEffect, useRef } from 'react';
import { get, serverNow, useStore } from '../store.ts';
import { playCountdownBeep, prepareCountdownSound } from '../items/effects.ts';
import { systemItemInstanceId } from '../../../shared/system-items.ts';
import { bindSystemInteraction, inputSystem, loadSystemMap } from './api.ts';
import { CameraCountdown } from './camera-countdown.ts';
import { useSystems } from './state.ts';

const mapId = 'camera-timer-demo', objectId = 'delayed-camera';
const cameraId = systemItemInstanceId(mapId, objectId);

export function useCameraTimerDemo() {
  const session = useStore(state => state.session), sync = useStore(state => state.sync);
  const mode = useStore(state => state.mode), user = useStore(state => state.selfId);
  const currentMap = useSystems(state => state.sid === session ? state.view?.map.id : undefined);
  const loadedSession = useRef<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV || new URLSearchParams(location.search).get('cameraTimerTest') !== '1') return;
    if (!session || sync !== 'connected' || mode !== '3d' || loadedSession.current === session) return;
    loadedSession.current = session;
    loadSystemMap(mapId);
  }, [session, sync, mode, currentMap]);

  useEffect(() => {
    if (!session || sync !== 'connected' || mode !== '3d' || currentMap !== mapId) return;
    const countdown = new CameraCountdown();
    let active = true, capture: typeof import('../view3d/cameraRender.ts') | undefined;
    void import('../view3d/cameraRender.ts').then(module => { if (active) capture = module; }).catch(error => {
      if (active) useSystems.setState({ error: error instanceof Error ? error.message : String(error) });
    });
    const camera = () => {
      const app = get(), systems = useSystems.getState(), item = app.items[cameraId];
      return app.session === session && app.selfId === user && app.sync === 'connected' && app.mode === '3d'
        && systems.sid === session && systems.view?.map.id === mapId && capture?.world.scene && capture.world.camera
        && item?.kind === 'camera' && !item.holder && item.mapPlacement?.mode === 'system' ? item : undefined;
    };
    const unbind = bindSystemInteraction({ sessionId: session, mapId, objectId }, () => {
      const systems = useSystems.getState();
      const shot = systems.view?.systems.find(system => system.instanceId === 'camera-shot');
      if (!camera() || shot?.state.busy || countdown.waiting) return;
      useSystems.setState({ error: undefined });
      prepareCountdownSound();
      const token = crypto.randomUUID();
      countdown.begin(token);
      try { inputSystem('camera-shot', 'request', { token }); }
      catch (error) { countdown.cancel(); throw error; }
    });
    const update = () => {
      const item = camera(), systems = useSystems.getState();
      if (!item) { countdown.cancel(); return; }
      const result = countdown.update(systems.view, user, serverNow(), systems.error);
      if (result.beep) playCountdownBeep();
      // 先に要求を消費し、同じ確定状態の再配送で写真を重複投稿しない。
      if (result.capture && capture) {
        try { capture.takePhoto(item); }
        catch (error) { useSystems.setState({ error: error instanceof Error ? error.message : String(error) }); }
      }
    };
    const unsubscribe = useSystems.subscribe(update);
    const interval = setInterval(update, 50);
    return () => { active = false; clearInterval(interval); unsubscribe(); unbind(); countdown.cancel(); };
  }, [session, sync, mode, user, currentMap]);
}
