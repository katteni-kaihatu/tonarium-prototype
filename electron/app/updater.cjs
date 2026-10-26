const fs = require('node:fs');
const path = require('node:path');

const RELEASE_URL = 'https://github.com/katteni-kaihatu/tonarium-prototype/releases';
const COMMIT_RELEASE_PREFIX = `${RELEASE_URL}/tag/nightly-`;

function releaseUrl(value) {
  if (typeof value !== 'string' || !value.startsWith(COMMIT_RELEASE_PREFIX)) return RELEASE_URL;
  const commit = value.slice(COMMIT_RELEASE_PREFIX.length);
  return commit.length === 40 && /^[0-9a-f]{40}$/.test(commit) ? value : RELEASE_URL;
}
const FEED_URL = 'https://github.com/katteni-kaihatu/tonarium-prototype/releases/download/nightly/';

function createUpdateController({ app, autoUpdater, onChange = () => {}, onNeedsConfiguration = () => {}, beforeInstall = async () => {}, onInstallAborted = () => {}, now = Date.now, platform = process.platform, env = process.env, fetch: fetchUpdate = globalThis.fetch, buildConfigPath = path.join(__dirname, 'update-build.json') }) {
  let build = {};
  try { build = JSON.parse(fs.readFileSync(buildConfigPath, 'utf8')); } catch { /* 開発・旧配布版は更新を無効にする。 */ }
  const available = app.isPackaged === true && build.enabled === true && build.channel === 'nightly';
  const windowsInstalled = platform === 'win32' && fs.existsSync(path.join(path.dirname(app.getPath('exe')), 'Uninstall Tonarium Electron.exe'));
  const supported = available && (windowsInstalled || (platform === 'linux' && typeof env.APPIMAGE === 'string' && env.APPIMAGE.length > 0));
  const canCheck = available && ['linux', 'win32'].includes(platform);
  const settingsPath = path.join(app.getPath('userData'), 'updates.json');
  let preferences = { checkOnStartup: null, autoInstall: false };
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (typeof saved.checkOnStartup === 'boolean' && typeof saved.autoInstall === 'boolean') {
      preferences = { checkOnStartup: saved.checkOnStartup, autoInstall: saved.checkOnStartup && saved.autoInstall };
    }
  } catch { /* 未設定や破損した設定では自動通信しない。 */ }
  let restart = { autoRestart: false, restartSeconds: 5 };
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    restart = { autoRestart: supported && preferences.checkOnStartup === true && saved.autoRestart === true,
      restartSeconds: Number.isInteger(saved.restartSeconds) && saved.restartSeconds >= 1 && saved.restartSeconds <= 300 ? saved.restartSeconds : 5 };
  } catch { /* 初期値を使う。 */ }
  let deadline = null;
  let restartTimer;
  let installing = false;
  const seenVersions = new Set();
  const reason = !available ? 'このビルドでは自動更新を利用できません。' : !supported ? 'この配布形式は自動更新に対応していません。リリースページから更新してください。' : '';
  let current = { status: !available ? 'disabled' : !canCheck ? 'unsupported' : 'idle', version: app.getVersion(), updateVersion: null, downloadedVersion: null, progress: null, error: null, releaseUrl: RELEASE_URL };
  let updater;
  let checking;
  let cancellationToken;
  let downloading = false;
  let started = false;
  let disposed = false;
  const listeners = [];

  function state() {
    return { ...current, ...preferences, ...restart, deadline, installing, available, supported, canCheck, reason, needsConfiguration: preferences.checkOnStartup === null };
  }
  function publish(change = {}) {
    if (disposed) return;
    current = { ...current, ...change };
    onChange(state());
  }
  function failure(error) {
    publish({ status: 'error', error: error instanceof Error ? error.message : String(error) });
  }
  function applyPreferences() {
    if (!updater) return;
    updater.autoDownload = supported && (deadline !== null || (preferences.checkOnStartup === true && (preferences.autoInstall || restart.autoRestart)));
    // 終了時も状態保存と適用ロックを通し、updater 自身の終了フックとの二重実行を防ぐ。
    updater.autoInstallOnAppQuit = false;
  }
  function getUpdater() {
    if (updater) return updater;
    updater = typeof autoUpdater === 'function' ? autoUpdater() : autoUpdater;
    if (!updater) throw new Error('更新プログラムを読み込めませんでした。');
    updater.setFeedURL({ provider: 'generic', url: FEED_URL, channel: 'nightly' });
    updater.channel = 'nightly';
    updater.allowPrerelease = true;
    // channel の setter が allowDowngrade を変更するため、最後に設定する。
    updater.allowDowngrade = false;
    applyPreferences();
    const listen = (event, handler) => { updater.on(event, handler); listeners.push([event, handler]); };
    listen('checking-for-update', () => publish({ status: 'checking', error: null, progress: null }));
    listen('update-available', info => {
      publish({ status: 'available', updateVersion: info.version, releaseUrl: releaseUrl(info.releaseUrl), error: null });
    });
    listen('update-not-available', info => publish({ status: current.downloadedVersion ? 'downloaded' : 'not-available', releaseUrl: current.downloadedVersion ? current.releaseUrl : releaseUrl(info?.releaseUrl), error: null }));
    listen('download-progress', progress => publish({ status: 'downloading', progress: Math.max(0, Math.min(100, Number(progress.percent) || 0)) }));
    listen('update-downloaded', info => {
      cancellationToken = undefined;
      applyPreferences();
      publish({ status: 'downloaded', updateVersion: info.version, downloadedVersion: info.version, releaseUrl: releaseUrl(info.releaseUrl), progress: 100, error: null });
      if (!seenVersions.has(info.version)) {
        seenVersions.add(info.version);
        if (deadline === null && restart.autoRestart) deadline = now() + restart.restartSeconds * 1000;
      }
      if (deadline !== null) armRestart();
      applyPreferences();
      publish();
    });
    listen('update-cancelled', () => { cancellationToken = undefined; publish({ status: current.downloadedVersion ? 'downloaded' : current.updateVersion ? 'available' : 'idle', progress: null }); });
    listen('error', failure);
    return updater;
  }

  function configure(value) {
    if (disposed) throw new Error('更新処理は終了しています。');
    if (!available) throw new Error(reason);
    if (!supported && value?.autoInstall) throw new Error(reason);
    if (!value || typeof value.checkOnStartup !== 'boolean' || typeof value.autoInstall !== 'boolean' || (value.autoInstall && !value.checkOnStartup)) {
      throw new Error('自動適用には起動時の更新確認を有効にしてください。');
    }
    const next = { checkOnStartup: value.checkOnStartup, autoInstall: value.autoInstall };
    const nextRestart = { autoRestart: Object.hasOwn(value, 'autoRestart') ? value.autoRestart : restart.autoRestart,
      restartSeconds: Object.hasOwn(value, 'restartSeconds') ? value.restartSeconds : restart.restartSeconds };
    if (typeof nextRestart.autoRestart !== 'boolean' || !Number.isInteger(nextRestart.restartSeconds) || nextRestart.restartSeconds < 1 || nextRestart.restartSeconds > 300) throw new Error('待機時間は1～300秒の整数で指定してください。');
    if (nextRestart.autoRestart && (!supported || !next.checkOnStartup)) throw new Error('自動更新には対応形式と起動時の更新確認が必要です。');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    const temporary = `${settingsPath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify({ ...next, ...nextRestart }, null, 2), { mode: 0o600 });
      fs.chmodSync(temporary, 0o600);
      fs.renameSync(temporary, settingsPath);
    } finally { try { fs.unlinkSync(temporary); } catch { /* rename 後は存在しない。 */ } }
    preferences = next;
    restart = nextRestart;
    applyPreferences();
    if (!next.autoInstall && !restart.autoRestart && deadline === null) cancellationToken?.cancel();
    publish();
    return state();
  }

  function check() {
    if (disposed || !canCheck) return Promise.resolve(state());
    if (checking) return checking;
    // 取得中の重複確認は止め、完了後はさらに新しい更新を確認できるようにする。
    if (downloading || current.status === 'downloading') return Promise.resolve(state());
    checking = Promise.resolve().then(async () => {
      try {
        publish({ status: 'checking', error: null });
        if (!supported) {
          const yaml = require('js-yaml');
          const semver = require('semver');
          const filename = platform === 'linux' ? 'nightly-linux.yml' : 'nightly.yml';
          const response = await fetchUpdate(`${FEED_URL}${filename}`, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
          if (!response.ok) throw new Error(`更新情報を取得できませんでした (HTTP ${response.status})。`);
          const body = await response.text();
          if (body.length > 1024 * 1024) throw new Error('更新情報が大きすぎます。');
          const info = yaml.load(body, { schema: yaml.JSON_SCHEMA });
          if (!info || typeof info.version !== 'string' || !semver.valid(info.version)) throw new Error('更新情報のバージョンが不正です。');
          const newer = semver.gt(info.version, app.getVersion());
          publish({ status: newer ? 'available' : 'not-available', updateVersion: newer ? info.version : null, releaseUrl: releaseUrl(info.releaseUrl), error: null });
          return state();
        }
        const result = await getUpdater().checkForUpdates();
        if (disposed) return state();
        cancellationToken = result?.cancellationToken;
        if (!preferences.autoInstall && !restart.autoRestart && deadline === null) cancellationToken?.cancel();
        if (result?.downloadPromise) {
          downloading = true;
          // ダウンロードは更新確認の Promise と別に失敗する。
          result.downloadPromise.catch(error => { if (!disposed && !result.cancellationToken?.cancelled) failure(error); }).finally(() => { downloading = false; });
        }
      } catch (error) { failure(error); }
      finally { checking = undefined; }
      return state();
    });
    return checking;
  }

  function install(restartAfter = true) {
    if (disposed || installing || !supported || !current.downloadedVersion || current.updateVersion !== current.downloadedVersion) return false;
    try {
      installing = true;
      clearTimeout(restartTimer); deadline = null;
      getUpdater().autoInstallOnAppQuit = false;
      publish();
      getUpdater().quitAndInstall(false, restartAfter);
      return true;
    } catch (error) { installing = false; applyPreferences(); failure(error); return false; }
  }

  let preparing = false;
  let preparationEpoch = 0;
  async function prepareAndInstall(restartAfter = true) {
    if (preparing || installing || disposed) return false;
    if (!supported || !current.downloadedVersion || current.updateVersion !== current.downloadedVersion) return false;
    preparing = true;
    const epoch = preparationEpoch;
    try {
      await beforeInstall();
      const installed = epoch === preparationEpoch && install(restartAfter);
      if (!installed) onInstallAborted();
      return installed;
    }
    catch (error) { onInstallAborted(); cancelRestart(); failure(error); return false; }
    finally { preparing = false; }
  }
  function armRestart() {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      if (current.updateVersion === current.downloadedVersion) void prepareAndInstall();
    }, Math.max(0, deadline - now()));
    restartTimer.unref?.();
  }
  function cancelRestart() { preparationEpoch++; clearTimeout(restartTimer); deadline = null; applyPreferences(); publish(); }

  async function start() {
    if (started || disposed) return state();
    started = true;
    publish();
    if (!canCheck) return state();
    if (preferences.checkOnStartup === null) {
      onNeedsConfiguration(state());
      return state();
    }
    if (preferences.checkOnStartup && canCheck) return check();
    return state();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(restartTimer);
    if (updater) {
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = false;
      cancellationToken?.cancel();
      for (const [event, listener] of listeners) updater.removeListener(event, listener);
    }
  }

  return { state, configure, check, install, prepareAndInstall, cancelRestart, start, dispose };
}

module.exports = { createUpdateController, RELEASE_URL, FEED_URL };
