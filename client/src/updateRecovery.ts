import { get, set } from './store.ts';
import { reconnectForUpdate } from './actions.ts';
import { send } from './net/ws.ts';
import { t } from './i18n/core.ts';
import { walkTo } from './walk.ts';
import { isElectron } from './updateBridge.ts';
import { updateDrafts } from './updateDraft.ts';
import { room, toggleMic } from './net/livekit.ts';

const KEY = 'tonarium.updateRecovery';
const UI_KEYS = ['homePage', 'homeGroup', 'homeChannel', 'dmWith', 'hubOpen', 'friendsTab', 'timelineSide', 'composeQuote', 'phoneTab', 'sideWidget',
  'rightView', 'rightConversation', 'windows', 'maxWin', 'winMode', 'folded', 'itemUi', 'volumes', 'marketProductId',
  'profileOf', 'lightbox', 'joinMode', 'movementMode', 'doubleJump', 'lean', 'micEnabled', 'walk'] as const;
type Ui = Pick<ReturnType<typeof get>, typeof UI_KEYS[number]>;
export const recoveryTasks = new Set<() => Promise<void>>();
export const cameraView = { thirdPerson: false, distance: 3 };
let applying = false;

export async function prepareUpdate(restart = false) {
  if (applying) throw new Error(t('updateBusy'));
  applying = true;
  try {
    await Promise.all([...recoveryTasks].map(task => task()));
    const s = get();
    const ui = Object.fromEntries(UI_KEYS.map(key => [key, s[key]])) as Ui;
    if (s.sharer === s.selfId) {
      ui.windows = ui.windows.filter(win => win.key !== 'share');
      if (ui.maxWin === 'share') ui.maxWin = null;
    }
    const drafts = updateDrafts();
    (restart ? localStorage : sessionStorage).setItem(KEY, JSON.stringify({ schema: 1, at: Date.now(), joined: s.joined, id: s.selfId, name: s.selfName,
      session: s.session, mode: s.mode, avatar: s.selfAvatar, camera: cameraView, ui, drafts,
      shared: s.sharer === s.selfId, world: s.session ? s.worldBy[s.session] : null }));
  } catch (error) { applying = false; throw error; }
}

export async function applyUpdate(apply: () => void) {
  await prepareUpdate();
  try { apply(); } catch (error) { abandonPreparedUpdate(); throw error; }
}

export function abandonPreparedUpdate() {
  applying = false;
  try { sessionStorage.removeItem(KEY); if (isElectron()) localStorage.removeItem(KEY); } catch { /* 保存不可でもロックを解除する。 */ }
}

export function readRecovery() {
  const storage = sessionStorage.getItem(KEY) ? sessionStorage : isElectron() ? localStorage : sessionStorage;
  const raw = storage.getItem(KEY);
  if (!raw) return null;
  storage.removeItem(KEY);
  const value = JSON.parse(raw);
  if (value.schema !== 1 || typeof value.joined !== 'boolean' || typeof value.id !== 'string' || (value.joined && !value.id) || typeof value.name !== 'string'
    || !Number.isFinite(value.at) || value.at > Date.now() || Date.now() - value.at > 24 * 60 * 60 * 1000 || !value.ui || !['2d', '3d'].includes(value.mode)
    || (value.session !== null && typeof value.session !== 'string') || !value.drafts || typeof value.drafts !== 'object'
    || typeof value.camera?.thirdPerson !== 'boolean' || !Number.isFinite(value.camera?.distance)
    || !Array.isArray(value.ui.windows) || !value.ui.folded || typeof value.ui.micEnabled !== 'boolean'
    || ![value.avatar?.x, value.avatar?.z, value.avatar?.ry].every(Number.isFinite)) throw new Error(t('updateInvalidRecovery'));
  return value as { joined: boolean; id: string; name: string; session: string | null; mode: '2d' | '3d';
    avatar: ReturnType<typeof get>['selfAvatar']; camera: typeof cameraView; ui: Ui; drafts: Record<string, string>;
    shared: boolean; world: string | null };
}

export async function restoreUpdate(snapshot: NonNullable<ReturnType<typeof readRecovery>>) {
  const issues: string[] = [];
  // 参加時の遅延したモード変更で復元した座標が上書きされないようにする。
  set({ joinMode: '2d' });
  if (snapshot.session) {
    try {
      await reconnectForUpdate(snapshot.session);
      if (get().session !== snapshot.session) throw new Error(t('updateSessionFailed'));
      await waitFor(() => get().sync === 'connected', () => get().syncError);
      set({ mode: snapshot.mode });
      send({ t: 'mode', mode: snapshot.mode });
      if (snapshot.world && get().worldBy[snapshot.session] !== snapshot.world) issues.push(t('updateWorldChanged'));
      else {
        Object.assign(cameraView, snapshot.camera);
        set({ selfAvatar: snapshot.avatar });
        send({ t: 'avatar', s: snapshot.avatar });
      }
      if (snapshot.ui.micEnabled && !get().micEnabled && get().voice === 'connected') await toggleMic();
      if (get().voice !== 'connected' || (snapshot.ui.micEnabled && !get().micEnabled)) issues.push(t('updateVoiceFailed'));
      if (get().voice === 'connected' && !room.canPlaybackAudio) issues.push(t('updateAudioNeedsClick'));
    } catch (error) { issues.push(t('updateRecoveryFailed', error instanceof Error ? error.message : String(error))); }
  }
  const ui = Object.fromEntries(UI_KEYS.map(key => [key, snapshot.ui[key]])) as Ui;
  // マイクの接続結果は通話処理に任せ、保存時の希望値で失敗を隠さない。
  ui.micEnabled = get().micEnabled;
  if (get().session !== snapshot.session) { ui.windows = []; ui.maxWin = null; ui.hubOpen = false; ui.walk = null; }
  if (snapshot.session && get().worldBy[snapshot.session] !== snapshot.world) ui.walk = null;
  if (ui.walk && !ui.walk.to) ui.walk = { ...ui.walk, until: performance.now() + 1500 };
  set(ui);
  if (ui.walk?.to) walkTo(ui.walk.to.x, ui.walk.to.z, ui.walk.at);
  if (snapshot.shared) issues.push(t('updateShareEnded'));
  return issues;
}

export function waitFor(ready: () => boolean, reason: () => unknown, timeout = 20000): Promise<void> {
  return new Promise((resolve, reject) => {
    const until = Date.now() + timeout;
    const timer = setInterval(() => {
      if (ready()) { clearInterval(timer); resolve(); }
      else if (Date.now() >= until) { clearInterval(timer); reject(new Error(String(reason() || t('updateConnectionFailed')))); }
    }, 100);
  });
}
