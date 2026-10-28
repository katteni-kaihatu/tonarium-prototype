import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

let state, sent, electron, joinError, draft;
const set = patch => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; };
const stub = (path, namedExports) => mock.module(new URL(path, import.meta.url).href, { namedExports });
stub('./store.ts', { get: () => state, set });
stub('./actions.ts', { reconnectForUpdate: async sid => {
  if (joinError) throw new Error(joinError);
  set({ session: sid, sync: 'connected', voice: 'connected', micEnabled: false, selfAvatar: { x: 0, z: 0, ry: 0 } });
} });
stub('./net/ws.ts', { send: message => sent.push(message) });
stub('./net/livekit.ts', { room: { canPlaybackAudio: true }, toggleMic: async () => set({ micEnabled: true }) });
stub('./walk.ts', { walkTo: (x, z, from) => sent.push({ walk: { x, z, from } }) });
stub('./updateBridge.ts', { isElectron: () => electron });
stub('./updateDraft.ts', { updateDrafts: () => draft });
stub('./i18n/core.ts', { t: (key, ...values) => [key, ...values].join(': ') });
class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}
Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: new MemoryStorage(), configurable: true });
const { prepareUpdate, applyUpdate, abandonPreparedUpdate, readRecovery, restoreUpdate, recoveryTasks, cameraView, waitFor } = await import('./updateRecovery.ts');
const KEY = 'tonarium.updateRecovery';

beforeEach(() => {
  localStorage.values.clear(); sessionStorage.values.clear();
  electron = false; joinError = null; sent = []; draft = { 'tonarium.draft.message.test': '"unfinished"' };
  recoveryTasks.clear(); abandonPreparedUpdate();
  Object.assign(cameraView, { thirdPerson: true, distance: 4 });
  state = { joined: true, selfId: 'same-user', selfName: 'Name', session: 'same-session', mode: '3d',
    selfAvatar: { x: 12, z: 9, y: 2, ry: 1.3, pitch: -0.4 }, worldBy: { 'same-session': 'cafe' },
    homePage: 'friends', homeGroup: 'group', homeChannel: { group: 'channel' }, dmWith: 'Friend',
    windows: [{ key: 'share', x: 3, y: 4 }, { key: 'item:one', x: 5, y: 6 }], maxWin: 'share',
    folded: { left: true, right: false, faces: false }, micEnabled: true, sharer: 'same-user',
    walk: null, voice: 'connected', sync: 'connected' };
});

test('Web snapshot is per tab and includes identity, 3D pose, camera, UI and drafts', async () => {
  await prepareUpdate();
  assert.equal(localStorage.getItem(KEY), null);
  const snapshot = readRecovery();
  assert.equal(snapshot.id, 'same-user'); assert.equal(snapshot.session, 'same-session');
  assert.deepEqual(snapshot.avatar, state.selfAvatar);
  assert.deepEqual(snapshot.camera, { thirdPerson: true, distance: 4 });
  assert.equal(snapshot.ui.homeGroup, 'group'); assert.equal(snapshot.ui.dmWith, 'Friend');
  assert.deepEqual(snapshot.drafts, draft);
  assert.equal(readRecovery(), null);
});

test('Electron restart uses persistent storage and only Electron consumes it', async () => {
  await prepareUpdate(true);
  assert.equal(sessionStorage.getItem(KEY), null);
  assert.equal(readRecovery(), null);
  electron = true;
  assert.equal(readRecovery().id, 'same-user');
  assert.equal(localStorage.getItem(KEY), null);
});

test('same session, mode, position and microphone are restored; screen sharing stays ended', async () => {
  await prepareUpdate(); const snapshot = readRecovery();
  set({ session: null, mode: '2d', windows: [] });
  const issues = await restoreUpdate(snapshot);
  assert.equal(state.session, 'same-session'); assert.equal(state.mode, '3d');
  assert.deepEqual(state.selfAvatar, snapshot.avatar); assert.equal(state.micEnabled, true);
  assert.deepEqual(state.windows, [{ key: 'item:one', x: 5, y: 6 }]); assert.equal(state.maxWin, null);
  assert.deepEqual(issues, ['updateShareEnded']);
  assert.ok(sent.some(message => message.t === 'mode' && message.mode === '3d'));
  assert.ok(sent.some(message => message.t === 'avatar' && message.s.pitch === -0.4));
});

test('session admission failure keeps home navigation and reports the actual reason', async () => {
  await prepareUpdate(); const snapshot = readRecovery();
  set({ session: null, mode: '2d' }); joinError = 'session was removed';
  const issues = await restoreUpdate(snapshot);
  assert.ok(issues.some(message => message.includes('session was removed')));
  assert.equal(state.homePage, 'friends'); assert.deepEqual(state.windows, []);
});

test('changed world restores mode but rejects old coordinates with an explanation', async () => {
  await prepareUpdate(); const snapshot = readRecovery();
  state.worldBy['same-session'] = 'city';
  const issues = await restoreUpdate(snapshot);
  assert.equal(state.mode, '3d'); assert.equal(state.selfAvatar.x, 0);
  assert.ok(issues.includes('updateWorldChanged'));
});

test('home-only restoration does not join a session', async () => {
  set({ session: null, mode: '2d', sharer: null });
  await prepareUpdate(); const snapshot = readRecovery();
  set({ homePage: 'home' });
  assert.deepEqual(await restoreUpdate(snapshot), []);
  assert.equal(state.session, null); assert.equal(state.homePage, 'friends'); assert.deepEqual(sent, []);
});

test('invalid and expired snapshots are consumed and rejected with a reason', async () => {
  for (const patch of [{ schema: 9 }, { at: 0 }, { avatar: { x: null, z: 2, ry: 0 } }, { camera: null }]) {
    abandonPreparedUpdate(); await prepareUpdate();
    const snapshot = { ...JSON.parse(sessionStorage.getItem(KEY)), ...patch };
    sessionStorage.setItem(KEY, JSON.stringify(snapshot));
    assert.throws(readRecovery, /updateInvalidRecovery/); assert.equal(sessionStorage.getItem(KEY), null);
  }
});

test('failed preparation does not produce a snapshot or permanently lock updates', async () => {
  const task = async () => { throw new Error('capture failed'); };
  recoveryTasks.add(task);
  await assert.rejects(prepareUpdate(), /capture failed/);
  assert.equal(sessionStorage.getItem(KEY), null);
  recoveryTasks.delete(task);
  await prepareUpdate(); assert.ok(readRecovery());
});

test('Web and Electron share the preparation lock; duplicate clicks cannot clear it', async () => {
  let finish;
  recoveryTasks.add(() => new Promise(resolve => { finish = resolve; }));
  let reloads = 0;
  const first = applyUpdate(() => reloads++);
  await assert.rejects(prepareUpdate(true), /updateBusy/);
  await assert.rejects(applyUpdate(() => reloads++), /updateBusy/);
  finish(); await first;
  assert.equal(reloads, 1);
  await assert.rejects(applyUpdate(() => reloads++), /updateBusy/);
});

test('2D/3D mode and pose are restored in both storage environments', async () => {
  for (const desktop of [false, true]) {
    for (const mode of ['2d', '3d']) {
      abandonPreparedUpdate(); electron = desktop;
      set({ mode });
      await prepareUpdate(desktop); const snapshot = readRecovery();
      set({ session: null, mode: '3d' });
      await restoreUpdate(snapshot);
      assert.equal(state.mode, mode); assert.deepEqual(state.selfAvatar, snapshot.avatar);
    }
  }
});

test('connection timeout includes the underlying sync failure reason', async () => {
  await assert.rejects(waitFor(() => false, () => 'sync failed', 1), /sync failed/);
});
