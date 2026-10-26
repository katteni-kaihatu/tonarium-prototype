const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createUpdateController, FEED_URL, RELEASE_URL } = require('../app/updater.cjs');

class FakeUpdater extends EventEmitter {
  calls = 0;
  installs = 0;
  setFeedURL(feed) { this.feed = feed; }
  async checkForUpdates() {
    this.calls++;
    this.emit('checking-for-update');
    this.emit('update-not-available');
    return null;
  }
  quitAndInstall(_silent, restartAfter) { this.installs++; this.restartAfter = restartAfter; }
}
function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-updater-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const buildConfigPath = path.join(directory, 'build.json');
  if (options.build !== null) fs.writeFileSync(buildConfigPath, JSON.stringify(options.build ?? { enabled: true, channel: 'nightly' }));
  if (options.installed) fs.writeFileSync(path.join(directory, 'Uninstall Tonarium Electron.exe'), '');
  if (options.preferences) fs.writeFileSync(path.join(directory, 'updates.json'), JSON.stringify(options.preferences));
  const updater = new FakeUpdater();
  let initialized = 0;
  let prompts = 0;
  const changes = [];
  const controller = createUpdateController({
    app: { isPackaged: options.isPackaged ?? true, getPath: name => name === 'exe' ? path.join(directory, 'Tonarium Electron.exe') : directory, getVersion: () => '0.0.8' },
    autoUpdater: () => { initialized++; return updater; },
    fetch: options.fetch, buildConfigPath, platform: options.platform ?? 'linux', env: options.env ?? { APPIMAGE: '/tmp/Tonarium.AppImage' },
    now: options.now, beforeInstall: options.beforeInstall, onInstallAborted: options.onInstallAborted,
    onChange: state => changes.push(state), onNeedsConfiguration: () => prompts++,
  });
  t.after(() => controller.dispose());
  return { controller, updater, directory, changes, initialized: () => initialized, prompts: () => prompts };
}

test('first launch asks once and never initializes updater without a preference', async t => {
  const f = fixture(t);
  assert.equal(f.controller.state().checkOnStartup, null);
  assert.equal(f.controller.state().autoInstall, false);
  await f.controller.start(); await f.controller.start();
  assert.equal(f.prompts(), 1); assert.equal(f.initialized(), 0);
});

test('automatic restart defaults off with five seconds and persists validated preferences', async t => {
  const f = fixture(t);
  assert.equal(f.controller.state().autoRestart, false);
  assert.equal(f.controller.state().restartSeconds, 5);
  for (const restartSeconds of [0, 301, 1.5, '5', NaN]) assert.throws(() => f.controller.configure({ checkOnStartup: true, autoInstall: false, restartSeconds }));
  for (const restartSeconds of [1, 300]) {
    f.controller.configure({ checkOnStartup: true, autoInstall: false, autoRestart: true, restartSeconds });
    const saved = JSON.parse(fs.readFileSync(path.join(f.directory, 'updates.json')));
    assert.equal(saved.restartSeconds, restartSeconds); assert.equal(saved.autoRestart, true);
  }
  await f.controller.start();
  assert.equal(f.updater.autoDownload, true); assert.equal(f.updater.autoInstallOnAppQuit, false);
});

test('automatic restart on/off and both delay boundaries survive a fresh controller', t => {
  for (const autoRestart of [false, true]) for (const restartSeconds of [1, 300]) {
    const f = fixture(t);
    f.controller.configure({ checkOnStartup: true, autoInstall: false, autoRestart, restartSeconds });
    const preferences = JSON.parse(fs.readFileSync(path.join(f.directory, 'updates.json')));
    const restored = fixture(t, { preferences });
    assert.equal(restored.controller.state().autoRestart, autoRestart);
    assert.equal(restored.controller.state().restartSeconds, restartSeconds);
  }
});

test('settings changes and newer completed downloads preserve deadline and replace target', async t => {
  const f = fixture(t, { now: () => 1000 });
  f.controller.configure({ checkOnStartup: true, autoInstall: false, autoRestart: true, restartSeconds: 5 });
  await f.controller.start();
  f.updater.emit('update-downloaded', { version: 'v2' });
  assert.equal(f.controller.state().deadline, 6000);
  f.controller.configure({ checkOnStartup: true, autoInstall: false, autoRestart: false, restartSeconds: 300 });
  assert.equal(f.controller.state().deadline, 6000);
  f.updater.emit('update-available', { version: 'v3' });
  assert.equal(await f.controller.prepareAndInstall(), false);
  f.updater.emit('update-downloaded', { version: 'v3' });
  assert.equal(f.controller.state().deadline, 6000);
  assert.equal(f.controller.state().downloadedVersion, 'v3');
});

test('cancelled version stays cancelled after preference changes and a repeated completion', async t => {
  const f = fixture(t, { now: () => 1000 });
  f.controller.configure({ checkOnStartup: true, autoInstall: true, autoRestart: true, restartSeconds: 5 });
  await f.controller.start();
  f.updater.emit('update-downloaded', { version: 'v2' }); f.controller.cancelRestart();
  f.controller.configure({ checkOnStartup: true, autoInstall: true, autoRestart: true, restartSeconds: 1 });
  f.updater.emit('update-downloaded', { version: 'v2' });
  assert.equal(f.controller.state().deadline, null);
  assert.equal(f.updater.autoInstallOnAppQuit, false);
  f.updater.emit('update-downloaded', { version: 'v3' });
  assert.equal(f.controller.state().deadline, 2000);
});

test('manual install saves state and applies once with quit installation disabled', async t => {
  let saved = 0;
  const f = fixture(t, { beforeInstall: async () => { saved++; }, preferences: { checkOnStartup: true, autoInstall: true } });
  await f.controller.start(); f.updater.emit('update-downloaded', { version: 'v2' });
  assert.equal(await f.controller.prepareAndInstall(), true);
  assert.equal(await f.controller.prepareAndInstall(), false);
  assert.equal(f.controller.install(), false);
  assert.equal(saved, 1); assert.equal(f.updater.installs, 1); assert.equal(f.updater.autoInstallOnAppQuit, false);
});

test('save failure cancels countdown and reports a reason without installing', async t => {
  const f = fixture(t, { beforeInstall: async () => { throw new Error('storage unavailable'); } });
  f.controller.configure({ checkOnStartup: true, autoInstall: false, autoRestart: true, restartSeconds: 5 });
  await f.controller.start(); f.updater.emit('update-downloaded', { version: 'v2' });
  assert.equal(await f.controller.prepareAndInstall(), false);
  assert.equal(f.controller.state().deadline, null); assert.equal(f.controller.state().error, 'storage unavailable');
  assert.equal(f.updater.installs, 0);
});

test('cancel during state saving prevents the pending installation', async t => {
  let complete;
  const f = fixture(t, { beforeInstall: () => new Promise(resolve => { complete = resolve; }) });
  await f.controller.check(); f.updater.emit('update-downloaded', { version: 'v2' });
  const install = f.controller.prepareAndInstall(); f.controller.cancelRestart(); complete();
  assert.equal(await install, false); assert.equal(f.updater.installs, 0);
});

test('quit and immediate installation share preparation and cannot apply twice', async t => {
  let finish, saves = 0;
  const f = fixture(t, { beforeInstall: () => { saves++; return new Promise(resolve => { finish = resolve; }); } });
  await f.controller.check(); f.updater.emit('update-downloaded', { version: 'v2' });
  const quitting = f.controller.prepareAndInstall(false);
  assert.equal(await f.controller.prepareAndInstall(), false);
  finish(); assert.equal(await quitting, true);
  assert.equal(f.updater.restartAfter, false);
  assert.equal(saves, 1); assert.equal(f.updater.installs, 1);
  assert.equal(f.updater.autoInstallOnAppQuit, false);
});

test('elapsed countdown applies automatically once after saving state', async t => {
  let saves = 0;
  const f = fixture(t, { beforeInstall: async () => { saves++; } });
  f.controller.configure({ checkOnStartup: true, autoInstall: false, autoRestart: true, restartSeconds: 1 });
  await f.controller.start();
  f.updater.emit('update-downloaded', { version: 'v2' });
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal(saves, 1); assert.equal(f.updater.installs, 1);
});

test('disabled build, missing build, development and unsupported OS never check remotely', async t => {
  for (const options of [{ build: null }, { build: { enabled: false, channel: 'nightly' } }, { isPackaged: false }, { platform: 'darwin' }]) {
    const f = fixture(t, { ...options, preferences: { checkOnStartup: true, autoInstall: true } });
    await f.controller.start(); await f.controller.check();
    assert.equal(f.initialized(), 0);
    assert.equal(f.prompts(), 0);
    assert.equal(f.controller.install(), false);
    assert.equal(f.controller.state().supported, false);
  }
});

test('startup OFF avoids network but explicit check is available', async t => {
  const f = fixture(t, { preferences: { checkOnStartup: false, autoInstall: false } });
  await f.controller.start(); assert.equal(f.initialized(), 0);
  await f.controller.check();
  assert.equal(f.updater.calls, 1); assert.equal(f.updater.autoDownload, false);
  assert.equal(f.updater.autoInstallOnAppQuit, false);
});

test('startup checks feed only after consent and configures nondowngrading nightly', async t => {
  const f = fixture(t, { preferences: { checkOnStartup: true, autoInstall: true } });
  await f.controller.start();
  assert.deepEqual(f.updater.feed, { provider: 'generic', url: FEED_URL, channel: 'nightly' });
  assert.equal(f.updater.channel, 'nightly'); assert.equal(f.updater.allowPrerelease, true);
  assert.equal(f.updater.allowDowngrade, false); assert.equal(f.updater.autoDownload, true);
  assert.equal(f.updater.autoInstallOnAppQuit, false); assert.equal(f.updater.installs, 0);
});

test('preferences persist atomically and invalid auto-install combination is rejected', t => {
  const f = fixture(t);
  assert.throws(() => f.controller.configure({ checkOnStartup: false, autoInstall: true }));
  f.controller.configure({ checkOnStartup: true, autoInstall: false });
  const filename = path.join(f.directory, 'updates.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(filename)), { checkOnStartup: true, autoInstall: false, autoRestart: false, restartSeconds: 5 });
  if (process.platform !== 'win32') assert.equal(fs.statSync(filename).mode & 0o777, 0o600);
  assert.equal(fs.readdirSync(f.directory).some(name => name.endsWith('.tmp')), false);
  assert.equal(f.controller.state().needsConfiguration, false);
});

test('concurrent checks share one request and failures become readable state', async t => {
  const f = fixture(t);
  let reject;
  f.updater.checkForUpdates = () => { f.updater.calls++; return new Promise((_, r) => { reject = r; }); };
  const first = f.controller.check(); const second = f.controller.check();
  assert.equal(first, second);
  await Promise.resolve(); reject(new Error('network offline'));
  await first;
  assert.equal(f.updater.calls, 1); assert.equal(f.controller.state().status, 'error');
  assert.equal(f.controller.state().error, 'network offline');
  f.updater.checkForUpdates = async () => null;
  await f.controller.check(); assert.equal(f.controller.state().error, null);
});

test('download completion only notifies; disabling prevents install on quit', async t => {
  const f = fixture(t, { preferences: { checkOnStartup: true, autoInstall: true } });
  await f.controller.start();
  f.updater.emit('update-available', { version: '0.0.9-nightly.1' });
  f.updater.emit('download-progress', { percent: 51.4 });
  assert.equal(f.controller.state().progress, 51.4);
  f.updater.emit('update-downloaded', { version: '0.0.9-nightly.1' });
  assert.equal(f.controller.state().downloadedVersion, '0.0.9-nightly.1');
  assert.equal(f.updater.installs, 0);
  f.controller.configure({ checkOnStartup: false, autoInstall: false });
  assert.equal(f.updater.autoInstallOnAppQuit, false);
  assert.equal(f.updater.autoDownload, false);
  await f.controller.check(); assert.equal(f.updater.calls, 2);
  assert.equal(f.controller.install(), true); assert.equal(f.updater.installs, 1);
});

test('turning auto-install off cancels download and late completion cannot re-enable quit install', async t => {
  const f = fixture(t, { preferences: { checkOnStartup: true, autoInstall: true } });
  const cancellationToken = { cancelled: false, cancel() { this.cancelled = true; } };
  let rejectDownload;
  const downloadPromise = new Promise((_, reject) => { rejectDownload = reject; });
  f.updater.checkForUpdates = async () => ({ cancellationToken, downloadPromise });
  await f.controller.start();
  f.controller.configure({ checkOnStartup: true, autoInstall: false });
  assert.equal(cancellationToken.cancelled, true);
  rejectDownload(new Error('cancelled'));
  await Promise.resolve();
  f.updater.emit('update-downloaded', { version: '0.0.9-nightly.2' });
  assert.equal(f.updater.autoInstallOnAppQuit, false);
  assert.equal(f.updater.installs, 0);
});

test('download promise rejection is handled independently from update check', async t => {
  const f = fixture(t, { preferences: { checkOnStartup: true, autoInstall: true } });
  let rejectDownload;
  const downloadPromise = new Promise((_, reject) => { rejectDownload = reject; });
  f.updater.checkForUpdates = async () => ({ downloadPromise });
  await f.controller.start(); rejectDownload(new Error('checksum mismatch'));
  await Promise.resolve();
  assert.equal(f.controller.state().status, 'error');
  assert.equal(f.controller.state().error, 'checksum mismatch');
});

test('dispose prevents future checks and applies no cached update on quit', async t => {
  const f = fixture(t, { preferences: { checkOnStartup: true, autoInstall: true } });
  await f.controller.start(); f.controller.dispose();
  await f.controller.check(); assert.equal(f.updater.calls, 1);
  assert.equal(f.updater.autoInstallOnAppQuit, false); assert.equal(f.controller.install(), false);
});

test('disabled builds reject configuration and unsupported formats cannot auto-install', async t => {
  const disabled = fixture(t, { build: null });
  await disabled.controller.start();
  assert.equal(disabled.prompts(), 0);
  assert.throws(() => disabled.controller.configure({ checkOnStartup: false, autoInstall: false }));
  const tar = fixture(t, { env: {} });
  await tar.controller.start();
  assert.equal(tar.prompts(), 1);
  assert.throws(() => tar.controller.configure({ checkOnStartup: true, autoInstall: true }));
});


test('tar checks metadata without loading installer and handles prerelease ordering', async t => {
  let requests = 0;
  const f = fixture(t, { env: {}, fetch: async url => {
    requests++;
    assert.equal(url, `${FEED_URL}nightly-linux.yml`);
    return { ok: true, text: async () => 'version: 0.0.9-nightly.42.1\nfiles: []\n' };
  } });
  f.controller.configure({ checkOnStartup: true, autoInstall: false });
  await f.controller.start();
  assert.equal(requests, 1); assert.equal(f.initialized(), 0);
  assert.equal(f.controller.state().status, 'available');
  assert.equal(f.controller.state().updateVersion, '0.0.9-nightly.42.1');
  assert.equal(f.controller.install(), false);
});

test('manual metadata check rejects malformed versions and never downgrades', async t => {
  for (const [body, expected] of [['version: invalid', 'error'], ['version: 0.0.7', 'not-available'], ['version: 0.0.8', 'not-available']]) {
    const f = fixture(t, { env: {}, fetch: async () => ({ ok: true, text: async () => body }) });
    await f.controller.check();
    assert.equal(f.controller.state().status, expected);
    assert.equal(f.initialized(), 0);
  }
});


test('Windows zip uses metadata checks while NSIS installation enables updater', async t => {
  const portable = fixture(t, { platform: 'win32', fetch: async url => {
    assert.equal(url, `${FEED_URL}nightly.yml`);
    return { ok: true, text: async () => 'version: 0.0.9-nightly.5.1' };
  } });
  await portable.controller.check();
  assert.equal(portable.controller.state().supported, false);
  assert.equal(portable.controller.state().status, 'available');
  assert.equal(portable.initialized(), 0);
  const installed = fixture(t, { platform: 'win32', installed: true });
  await installed.controller.check();
  assert.equal(installed.controller.state().supported, true);
  assert.equal(installed.initialized(), 1);
});


test('re-enabling automatic installation rechecks cached completion to arm quit hook', async t => {
  const f = fixture(t, { preferences: { checkOnStartup: true, autoInstall: true } });
  await f.controller.start();
  f.controller.configure({ checkOnStartup: true, autoInstall: false });
  f.updater.emit('update-downloaded', { version: '0.0.9-nightly.2' });
  f.controller.configure({ checkOnStartup: true, autoInstall: true });
  f.updater.checkForUpdates = async () => {
    f.updater.calls++;
    assert.equal(f.updater.autoInstallOnAppQuit, false);
    f.updater.emit('update-downloaded', { version: '0.0.9-nightly.2' });
  };
  await f.controller.check();
  assert.equal(f.updater.calls, 2);
  assert.equal(f.controller.state().downloadedVersion, '0.0.9-nightly.2');
});


const commitRelease = 'https://github.com/katteni-kaihatu/tonarium-prototype/releases/tag/nightly-' + 'a1'.repeat(20);
const invalidReleaseUrls = [
  undefined, null, 42, {}, '', 'not-a-url',
  commitRelease.replace('https:', 'http:'),
  commitRelease.replace('github.com', 'github.com.evil.example'),
  commitRelease.replace('github.com/', 'github.com@evil.example/'),
  commitRelease.replace('katteni-kaihatu', 'another-owner'),
  commitRelease.replace('tonarium-prototype', 'another-repository'),
  commitRelease + '?redirect=evil', commitRelease + '#fragment', commitRelease + '/',
  commitRelease + '\n', commitRelease + '\r', ' ' + commitRelease,
  commitRelease.slice(0, -1), commitRelease + 'a',
  commitRelease.replace('a1'.repeat(20), 'A1'.repeat(20)),
  commitRelease.replace('a1'.repeat(20), 'g1'.repeat(20)),
  RELEASE_URL + '/tag/nightly',
];

test('updater events select their validated commit release and keep old metadata compatible', async t => {
  const f = fixture(t);
  assert.equal(f.controller.state().releaseUrl, RELEASE_URL);
  await f.controller.check();
  for (const event of ['update-available', 'update-not-available', 'update-downloaded']) {
    f.updater.emit(event, { version: '0.0.9-nightly.42.1', releaseUrl: commitRelease });
    assert.equal(f.controller.state().releaseUrl, commitRelease);
  }
  f.updater.emit('update-downloaded', { version: '0.0.9-nightly.43.1' });
  assert.equal(f.controller.state().releaseUrl, RELEASE_URL);
});

test('updater events reject untrusted or malformed release links', async t => {
  const f = fixture(t);
  await f.controller.check();
  for (const event of ['update-not-available', 'update-available', 'update-downloaded']) {
    for (const value of invalidReleaseUrls) {
      f.updater.emit(event, { version: '0.0.9-nightly.42.1', releaseUrl: value });
      assert.equal(f.controller.state().releaseUrl, RELEASE_URL, `${event}: ${String(value)}`);
    }
  }
});

test('manual metadata check selects commit release or falls back to repository releases', async t => {
  for (const value of [commitRelease, ...invalidReleaseUrls]) {
    const info = { version: '0.0.9-nightly.42.1', releaseUrl: value };
    const f = fixture(t, { env: {}, fetch: async () => ({ ok: true, text: async () => JSON.stringify(info) }) });
    await f.controller.check();
    assert.equal(f.controller.state().status, 'available');
    assert.equal(f.controller.state().releaseUrl, value === commitRelease ? commitRelease : RELEASE_URL);
    assert.equal(f.initialized(), 0);
  }
});
