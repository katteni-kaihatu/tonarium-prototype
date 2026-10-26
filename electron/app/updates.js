const byId = id => document.getElementById(id);
let current;
let dirty = false;
const labels = {
  idle: '更新の確認を待っています。', checking: '更新を確認しています…',
  available: '新しい更新があります。', 'update-available': '新しい更新があります。',
  downloading: '更新をダウンロードしています…', downloaded: '更新の準備ができました。',
  'up-to-date': '現在のバージョンは最新です。', 'not-available': '現在のバージョンは最新です。',
  error: '更新を確認・取得できませんでした。後でもう一度お試しください。',
  disabled: 'この配布形式ではアプリ内更新が無効です。',
};
function render(state) {
  current = state;
  if (!dirty) {
    byId('check-on-startup').checked = state.checkOnStartup === true;
    byId('auto-install').checked = state.supported && state.autoInstall === true;
    byId('auto-restart').checked = state.autoRestart === true;
    byId('restart-seconds').value = state.restartSeconds;
  }
  byId('first').hidden = !state.needsConfiguration;
  byId('check-on-startup').disabled = !state.canCheck;
  byId('auto-install').disabled = !state.available || !state.supported || !byId('check-on-startup').checked;
  byId('auto-restart').disabled = !state.supported || !byId('check-on-startup').checked;
  byId('cancel').hidden = state.deadline === null;
  byId('save').disabled = !state.canCheck;
  byId('check').disabled = !state.canCheck || ['checking', 'downloading'].includes(state.status);
  byId('install').hidden = !state.downloadedVersion || !state.supported;
  byId('install').disabled = state.updateVersion !== state.downloadedVersion || state.installing;
  byId('version').textContent = `現在のバージョン: ${state.version}`;
  byId('status').textContent = [labels[state.status] || '', state.reason || '', state.updateVersion ? `最新バージョン: ${state.updateVersion}` : '', state.progress !== null ? `ダウンロード: ${Math.round(state.progress)}%` : '', state.downloadedVersion ? `取得済み: ${state.downloadedVersion}` : ''].filter(Boolean).join('\n');
  byId('error').textContent = state.error || '';
  renderCountdown();
}
function renderCountdown() {
  byId('countdown').textContent = current?.deadline == null ? '' : `${Math.max(0, Math.ceil((current.deadline - Date.now()) / 1000))}秒後に更新します`;
}
setInterval(renderCountdown, 200);
function fail(error) { byId('error').textContent = error.message; }
byId('check-on-startup').addEventListener('change', () => {
  dirty = true;
  if (!byId('check-on-startup').checked) { byId('auto-install').checked = false; byId('auto-restart').checked = false; }
  render(current);
});
byId('auto-install').addEventListener('change', () => { dirty = true; });
byId('auto-restart').addEventListener('change', () => { dirty = true; });
byId('restart-seconds').addEventListener('input', () => { dirty = true; });
byId('updates').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const state = await window.tonariumShell.updateConfigure({ checkOnStartup: byId('check-on-startup').checked, autoInstall: byId('auto-install').checked,
      autoRestart: byId('auto-restart').checked, restartSeconds: Number(byId('restart-seconds').value) });
    dirty = false;
    render(state);
  } catch (error) { fail(error); }
});
byId('check').addEventListener('click', () => window.tonariumShell.updateCheck().then(render).catch(fail));
byId('install').addEventListener('click', () => window.tonariumShell.updateInstall().catch(fail));
byId('cancel').addEventListener('click', () => window.tonariumShell.updateCancel().then(render).catch(fail));
byId('release').addEventListener('click', () => window.tonariumShell.updateRelease().catch(fail));
window.tonariumShell.onUpdateState(render);
window.tonariumShell.updateState().then(render).catch(fail);
