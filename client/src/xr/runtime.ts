import { useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { DEFAULT_TURN, turnSettings } from './input.ts';
import type { AvatarXR } from '../../../shared/xr-pose.ts';

let snapshot = { active: false, open: true, ready: false, pending: false, error: '', panels: [] as { id: string; title: string; open: boolean }[] };
const listeners = new Set<() => void>();
export const xrState = () => snapshot;
export function xrPatch(patch: Partial<typeof snapshot>) { snapshot = { ...snapshot, ...patch }; listeners.forEach(fn => fn()); }
export const useXR = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, xrState);
function loadTurn() { try { return turnSettings(JSON.parse(localStorage.getItem('tonarium.xr.turn') ?? 'null')); } catch { return DEFAULT_TURN; } }
export const xr = {
  renderer: null as THREE.WebGLRenderer | null,
  session: null as XRSession | null,
  move: [0, 0] as [number, number], turn: 0, headYaw: 0, headPitch: 0,
  ray: null as THREE.Ray | null,
  pose: undefined as AvatarXR | undefined,
  carryRay: null as THREE.Ray | null,
  togglePanel: null as null | ((id: string) => void),
  clearControllers: null as null | (() => void),
  settings: loadTurn(),
  use: null as null | (() => void), release: null as null | (() => void), carry: null as null | (() => boolean),
  cancel: null as null | (() => void),
};
export function resetXRInput(preserveTracking = false) {
  xr.clearControllers?.();
  if (!preserveTracking) { xr.pose = undefined; xr.headYaw = 0; xr.headPitch = 0; }
  xr.carryRay = null;
  xr.move = [0, 0]; xr.turn = 0; xr.ray = null;
  window.dispatchEvent(new Event('blur'));
  xr.release?.();
  xr.cancel?.();
}
let ending: Promise<void> | null = null;
export async function endVR() {
  if (ending) return ending;
  const session = xr.session;
  if (!session) return;
  resetXRInput();
  ending = session.end().catch(() => {
    if (xr.session === session) xrPatch({ error: 'VRの終了に失敗しました。ヘッドセットのシステムメニューから終了してください。' });
  }).finally(() => { ending = null; });
  return ending;
}
export async function startVR() {
  if (snapshot.pending || snapshot.active || !xr.renderer || !navigator.xr) return;
  xrPatch({ pending: true, error: '' });
  const renderer = xr.renderer;
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'] });
    xr.session = session;
    const finish = () => {
      if (xr.session !== session) return;
      xr.session = null;
      renderer.xr.enabled = false;
      resetXRInput();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      document.body.classList.remove('xr-active');
      xrPatch({ active: false, pending: false, open: true });
    };
    session.addEventListener('end', finish, { once: true });
    session.addEventListener('visibilitychange', () => { if (session.visibilityState !== 'visible') resetXRInput(); });
    if (document.pointerLockElement) document.exitPointerLock();
    resetXRInput();
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    try {
      await renderer.xr.setSession(session);
      if (xr.renderer !== renderer || session !== xr.session) { await session.end(); return; }
      document.body.classList.add('xr-active');
      xrPatch({ active: true, open: true });
    } catch (error) { await session.end().catch(() => {}); finish(); throw error; }
  } catch {
    xrPatch({ error: 'VRを開始できませんでした。HTTPS、WebXR、local-floor、ヘッドセット接続とブラウザの許可を確認してください。' });
  } finally { xrPatch({ pending: false }); }
}
