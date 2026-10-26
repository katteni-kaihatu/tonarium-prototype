const { app, BrowserWindow, Menu, session, shell, dialog, desktopCapturer, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createUpdateController } = require('./updater.cjs');
const { DEFAULT_SERVER, normalizeServer, sameOrigin, externalUrl, option } = require('./policy.cjs');

app.setName('Tonarium Electron');
app.setAppUserModelId('work.rheni.tonarium.electron');
let initialServer;
try {
  const dataDir = option(process.argv, '--data-dir');
  if (dataDir) app.setPath('userData', path.resolve(dataDir));
  else app.setPath('userData', path.join(app.getPath('appData'), 'tonarium-electron'));
  initialServer = option(process.argv, '--server');
  if (initialServer) initialServer = normalizeServer(initialServer);
} catch (error) {
  console.error(error.message);
  app.exit(1);
}

app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');
let mainWindow;
let settingsWindow;
let audioWindow;
let pickerWindow;
let updatesWindow;
let updateController;
const announcedUpdates = new Set();
let activeServer = DEFAULT_SERVER;
let connectionError = '';
let captureState;
const permissionGrants = new Set();
const pendingPermissions = new Map();
let permissionEpoch = 0;
const localUrl = name => pathToFileURL(path.join(__dirname, name)).href;
const configPath = () => path.join(app.getPath('userData'), 'connection.json');
const securePreferences = { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false };

function saveServer(server) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  const temporary = `${configPath()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ server }, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, configPath());
}

function openExternal(url) {
  if (externalUrl(url)) shell.openExternal(url).catch(error => console.error('外部リンクを開けません:', error.message));
}

function trustedContents(contents) {
  return !!contents && !!mainWindow && !mainWindow.isDestroyed() && contents === mainWindow.webContents && sameOrigin(contents.getURL(), activeServer);
}

function localSender(event, window, file) {
  return window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === localUrl(file);
}

function localWindow(file, options) {
  const window = new BrowserWindow({ ...options, webPreferences: { ...securePreferences, partition: 'shell-local', preload: path.join(__dirname, 'local-preload.cjs') } });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.loadFile(path.join(__dirname, file));
  return window;
}

function showSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.focus(); return; }
  settingsWindow = localWindow('settings.html', { width: 660, height: 430, parent: mainWindow, title: 'Tonarium Electron — 接続先' });
  settingsWindow.on('closed', () => { settingsWindow = undefined; });
}

function showUpdates() {
  if (updatesWindow && !updatesWindow.isDestroyed()) { updatesWindow.focus(); return; }
  updatesWindow = localWindow('updates.html', { width: 700, height: 650, parent: mainWindow, title: 'Tonarium Electron — 更新' });
  updatesWindow.on('closed', () => { updatesWindow = undefined; });
}
function updateChanged(state) {
  if (updatesWindow && !updatesWindow.isDestroyed()) updatesWindow.webContents.send('shell:update-state', state);
  // Notify once per stage without interrupting calls or forcing a restart.
  if (['available', 'downloaded'].includes(state.status)) {
    const key = `${state.status}:${state.downloadedVersion || state.updateVersion || ''}`;
    if (!announcedUpdates.has(key)) { announcedUpdates.add(key); showUpdates(); }
  }
}

let pendingUpdatePreparation;
function prepareRemoteUpdate() {
  if (!trustedContents(mainWindow?.webContents)) return Promise.reject(new Error('更新前の画面状態を保存できません。接続先を確認してください。'));
  if (pendingUpdatePreparation) return pendingUpdatePreparation.promise;
  const id = require('node:crypto').randomUUID();
  let finish;
  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pendingUpdatePreparation = null; reject(new Error('更新前の状態保存がタイムアウトしました。')); }, 15000);
    finish = error => { clearTimeout(timer); pendingUpdatePreparation = null; error ? reject(new Error(error)) : resolve(); };
  });
  pendingUpdatePreparation = { id, finish, promise };
  mainWindow.webContents.send('shell:prepare-update', id);
  return promise;
}
function prepareQuitUpdate(event) {
  const state = updateController?.state();
  if (state?.installing || !state?.autoInstall || !state.downloadedVersion || !state.supported || state.updateVersion !== state.downloadedVersion) return;
  event.preventDefault();
  void updateController.prepareAndInstall(false);
}
ipcMain.on('shell:prepared-update', (event, id, error) => {
  if (trustedContents(event.sender) && event.senderFrame === event.sender.mainFrame && pendingUpdatePreparation?.id === id) {
    pendingUpdatePreparation.finish(typeof error === 'string' ? error.slice(0, 500) : null);
  }
});

function audioConfig() {
  try {
    const all = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'audio-devices.json'), 'utf8'));
    return validAudioConfig(all[new URL(activeServer).origin]);
  } catch { return { input: '', output: '' }; }
}
function validAudioConfig(value) {
  if (!value || ['input', 'output'].some(key => typeof value[key] !== 'string' || value[key].length > 2048)) throw new Error('機器の設定が正しくありません。');
  return { input: value.input, output: value.output };
}
function saveAudioConfig(value) {
  const file = path.join(app.getPath('userData'), 'audio-devices.json');
  let all = {};
  try { all = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
  all[new URL(activeServer).origin] = validAudioConfig(value);
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(all, null, 2), { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
}
function showAudioSettings() {
  if (audioWindow && !audioWindow.isDestroyed()) { audioWindow.focus(); return; }
  audioWindow = localWindow('audio.html', { width: 640, height: 560, parent: mainWindow, title: 'Tonarium Electron — マイク・スピーカー' });
  audioWindow.on('closed', () => { audioWindow = undefined; });
}
async function audioCommand(method, value) {
  if (!trustedContents(mainWindow?.webContents)) throw new Error('接続先の読み込みを待ってください。');
  const contents = mainWindow.webContents;
  const origin = activeServer;
  const result = await contents.executeJavaScript(`(async () => {
    const adapter = window.__tonariumElectronAudio;
    if (!adapter) throw new Error('音声設定を準備中です。ページを再読み込みしてください。');
    return await adapter.${method}(${value === undefined ? '' : JSON.stringify(value)});
  })()`);
  if (origin !== activeServer || !trustedContents(contents)) throw new Error('接続先が変更されました。');
  return result;
}

async function connect(server) {
  const normalized = normalizeServer(server);
  saveServer(normalized);
  activeServer = normalized;
  connectionError = '';
  permissionGrants.clear();
  permissionEpoch++;
  captureState?.finish(null);
  if (audioWindow && !audioWindow.isDestroyed()) audioWindow.close();
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
  try { await mainWindow.loadURL(activeServer); } catch { /* did-fail-load で接続画面を表示する。 */ }
}

function selectSource(sources, audioIncluded) {
  return new Promise(resolve => {
    let finished = false;
    const finish = source => {
      if (finished) return;
      finished = true;
      captureState = undefined;
      if (pickerWindow && !pickerWindow.isDestroyed()) pickerWindow.close();
      resolve(source);
    };
    captureState = { sources, finish, audioIncluded };
    pickerWindow = localWindow('capture.html', { width: 820, height: 650, parent: mainWindow, modal: true });
    pickerWindow.on('closed', () => { pickerWindow = undefined; finish(null); });
  });
}

function configureSession(remoteSession) {
  const passive = new Set(['fullscreen', 'pointerLock', 'keyboardLock', 'clipboard-sanitized-write']);
  const prompted = new Set(['media', 'notifications', 'clipboard-read', 'speaker-selection']);
  function eligible(contents, origin) { return trustedContents(contents) && sameOrigin(origin, activeServer); }
  remoteSession.setPermissionCheckHandler((contents, permission, origin, details) => {
    if (!eligible(contents, origin)) return false;
    if (permission === 'speaker-selection') return permissionGrants.has('media:audio') || permissionGrants.has(permission);
    if (permission === 'media') return ['audio', 'video'].includes(details?.mediaType) && permissionGrants.has(`media:${details.mediaType}`);
    return passive.has(permission) || permission === 'display-capture' || permissionGrants.has(permission);
  });
  remoteSession.setPermissionRequestHandler(async (contents, permission, callback, details) => {
    const origin = details.requestingUrl || details.securityOrigin;
    if (!eligible(contents, origin) || details.isMainFrame === false) { callback(false); return; }
    if (passive.has(permission) || permission === 'display-capture') { callback(true); return; }
    if (!prompted.has(permission)) { callback(false); return; }
    const mediaTypes = Array.isArray(details.mediaTypes) ? [...new Set(details.mediaTypes)] : [];
    if (permission === 'media' && (mediaTypes.length === 0 || mediaTypes.some(type => !['audio', 'video'].includes(type)))) { callback(false); return; }
    const grants = permission === 'media' ? mediaTypes.map(type => `media:${type}`) : [permission];
    const missingGrants = grants.filter(grant => !permissionGrants.has(grant));
    if (missingGrants.length === 0) { callback(true); return; }
    const serverAtRequest = activeServer;
    const epochAtRequest = permissionEpoch;
    const key = `${epochAtRequest}:${serverAtRequest}:${missingGrants.sort().join(',')}`;
    if (!pendingPermissions.has(key)) {
      const label = permission === 'media' ? missingGrants.map(grant => grant === 'media:audio' ? 'マイク' : 'カメラ').join('・') : permission === 'notifications' ? '通知' : permission === 'speaker-selection' ? 'スピーカーの選択' : 'クリップボードの読み取り';
      pendingPermissions.set(key, dialog.showMessageBox(mainWindow, { type: 'question', title: 'Tonarium Electron — アクセス許可', message: `${new URL(activeServer).origin} に ${label} の利用を許可しますか？`, buttons: ['許可しない', '許可する'], defaultId: 0, cancelId: 0 }).then(result => result.response === 1));
    }
    try {
      const approved = await pendingPermissions.get(key);
      const allowed = approved && permissionEpoch === epochAtRequest && activeServer === serverAtRequest && eligible(contents, origin);
      if (allowed) for (const grant of grants) permissionGrants.add(grant);
      callback(allowed);
    } catch { callback(false); }
    finally { pendingPermissions.delete(key); }
  });
  let capturePending = false;
  remoteSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (capturePending || !mainWindow || mainWindow.isDestroyed() || request.frame !== mainWindow.webContents.mainFrame || !sameOrigin(request.securityOrigin, activeServer)) { callback(null); return; }
    capturePending = true;
    const origin = activeServer;
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 260, height: 160 } });
      // PipeWire では OS の選択ダイアログを経て単一ソースが返る。
      const portal = process.platform === 'linux' && (!!process.env.WAYLAND_DISPLAY || process.env.XDG_SESSION_TYPE === 'wayland');
      const source = sources.length === 0 ? null : portal && sources.length === 1 ? sources[0] : await selectSource(sources, request.audioRequested && process.platform === 'win32');
      if (!source || origin !== activeServer || !mainWindow || mainWindow.isDestroyed() || request.frame !== mainWindow.webContents.mainFrame) { callback(null); return; }
      const streams = { video: source };
      if (request.audioRequested && process.platform === 'win32') streams.audio = 'loopback';
      callback(streams);
    } catch (error) { console.error('画面共有:', error.message); callback(null); }
    finally { capturePending = false; }
  });
  remoteSession.setDevicePermissionHandler(() => false);
}

function createMainWindow() {
  const remoteSession = session.fromPartition('persist:tonarium-web');
  configureSession(remoteSession);
  const icon = app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, '..', 'resources', 'icon.png');
  mainWindow = new BrowserWindow({ icon, width: 1280, height: 850, minWidth: 720, minHeight: 500, title: 'Tonarium Electron', webPreferences: { ...securePreferences, session: remoteSession, preload: path.join(__dirname, 'audio-preload.cjs') } });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  const navigate = (event, url) => { if (!sameOrigin(url, activeServer)) { event.preventDefault(); openExternal(url); } };
  mainWindow.webContents.on('will-navigate', navigate);
  mainWindow.webContents.on('will-redirect', navigate);
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    connectionError = `接続できませんでした (${description})。接続先とネットワークを確認してください。`;
    showSettings();
  });
  mainWindow.webContents.on('render-process-gone', () => { connectionError = '画面の処理が終了しました。再読み込みで接続し直してください。'; showSettings(); });
  mainWindow.on('closed', () => { permissionEpoch++; captureState?.finish(null); mainWindow = undefined; });
  mainWindow.on('close', prepareQuitUpdate);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Tonarium Electron', submenu: [
      { label: '接続先を変更…', click: showSettings },
      { label: 'マイク・スピーカー…', click: showAudioSettings },
      { label: 'アプリの更新…', click: showUpdates },
      { label: 'ブラウザーで開く', click: () => openExternal(activeServer) },
      { type: 'separator' }, { role: 'quit', label: '終了' },
    ] },
    { label: '編集', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '表示', submenu: [{ role: 'reload', label: '再読み込み' }, { role: 'forceReload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }, { role: 'toggleDevTools' }] },
  ]));
  connect(activeServer);
}

function requireUpdateSender(event) {
  if (!localSender(event, updatesWindow, 'updates.html') || !updateController) throw new Error('許可されていない操作です。');
}
ipcMain.handle('shell:update-state', event => { requireUpdateSender(event); return updateController.state(); });
ipcMain.handle('shell:update-configure', async (event, value) => {
  requireUpdateSender(event);
  const state = updateController.configure(value);
  return state.checkOnStartup ? updateController.check() : state;
});
ipcMain.handle('shell:update-check', event => { requireUpdateSender(event); return updateController.check(); });
ipcMain.handle('shell:update-cancel', event => { requireUpdateSender(event); updateController.cancelRestart(); return updateController.state(); });
ipcMain.handle('shell:update-release', event => {
  requireUpdateSender(event);
  return shell.openExternal(updateController.state().releaseUrl);
});
ipcMain.handle('shell:update-install', async event => {
  requireUpdateSender(event);
  return updateController.prepareAndInstall();
});

ipcMain.on('shell:audio-config', event => {
  event.returnValue = mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents
    && event.senderFrame === mainWindow.webContents.mainFrame && sameOrigin(event.senderFrame.url, activeServer) ? audioConfig() : null;
});
ipcMain.handle('shell:audio-list', event => {
  if (!localSender(event, audioWindow, 'audio.html')) throw new Error('許可されていない操作です。');
  return audioCommand('list');
});
ipcMain.handle('shell:audio-apply', async (event, value) => {
  if (!localSender(event, audioWindow, 'audio.html')) throw new Error('許可されていない操作です。');
  const next = validAudioConfig(value);
  const previous = await audioCommand('status');
  await audioCommand('apply', next);
  try { saveAudioConfig(next); }
  catch (error) { await audioCommand('apply', validAudioConfig(previous)).catch(() => {}); throw error; }
  return audioCommand('list');
});
ipcMain.handle('shell:audio-permit', async event => {
  if (!localSender(event, audioWindow, 'audio.html') || !trustedContents(mainWindow?.webContents)) throw new Error('許可されていない操作です。');
  const epoch = permissionEpoch;
  const origin = activeServer;
  const answer = await dialog.showMessageBox(audioWindow, { type: 'question', title: '音声機器の利用', message: `${new URL(activeServer).origin} にマイクとスピーカー選択の利用を許可しますか？`, detail: '機器名を表示し、選択できるようにします。この操作だけでは録音・送信しません。', buttons: ['許可しない', '許可する'], defaultId: 0, cancelId: 0 });
  if (answer.response === 1 && epoch === permissionEpoch && origin === activeServer) {
    permissionGrants.add('media:audio'); permissionGrants.add('speaker-selection');
  }
  return audioCommand('list');
});

ipcMain.handle('shell:state', event => {
  if (localSender(event, settingsWindow, 'settings.html')) return { server: activeServer, error: connectionError };
  if (localSender(event, pickerWindow, 'capture.html')) return { audioIncluded: captureState.audioIncluded, sources: captureState.sources.map(source => ({ id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL() })) };
  throw new Error('許可されていない操作です。');
});
ipcMain.handle('shell:connect', (event, value) => {
  if (!localSender(event, settingsWindow, 'settings.html') || typeof value !== 'string') throw new Error('許可されていない操作です。');
  return connect(value);
});
ipcMain.handle('shell:retry', event => {
  if (!localSender(event, settingsWindow, 'settings.html')) throw new Error('許可されていない操作です。');
  return connect(activeServer);
});
ipcMain.handle('shell:source', (event, id) => {
  if (!localSender(event, pickerWindow, 'capture.html')) throw new Error('許可されていない操作です。');
  captureState.finish(captureState.sources.find(source => source.id === id) || null);
});

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(() => {
    try { activeServer = normalizeServer(initialServer || JSON.parse(fs.readFileSync(configPath(), 'utf8')).server); }
    catch { activeServer = initialServer || DEFAULT_SERVER; }
    updateController = createUpdateController({
      app, autoUpdater: () => require('electron-updater').autoUpdater,
      onChange: updateChanged, onNeedsConfiguration: showUpdates,
      beforeInstall: prepareRemoteUpdate,
      onInstallAborted: () => { if (trustedContents(mainWindow?.webContents)) mainWindow.webContents.send('shell:update-aborted'); },
    });
    createMainWindow();
    Promise.resolve(updateController.start()).catch(error => console.error('更新:', error.message));
  }).catch(error => { console.error(error); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', prepareQuitUpdate);
}
