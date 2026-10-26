import { useState } from 'react';
import { t } from './i18n/index.ts';
import { isElectron } from './updateBridge.ts';
import { readUpdatePreferences, saveUpdatePreferences, validUpdateSeconds } from './updateFlow.ts';

export function UpdateSettings() {
  const electron = isElectron();
  const [preferences, setPreferences] = useState(() => readUpdatePreferences(localStorage, electron));
  const [seconds, setSeconds] = useState(String(preferences.seconds));
  const [error, setError] = useState('');
  const save = (enabled: boolean, value: string) => {
    if (!validUpdateSeconds(Number(value))) { setError(t('updateRange')); return; }
    const next = { enabled, seconds: Number(value) };
    try {
      saveUpdatePreferences(localStorage, electron, next);
      setPreferences(next); setError('');
    } catch { setError(t('updateSaveFailed')); }
  };
  return <section>
    <h3>{t('updateSettings')}</h3>
    <label className="checkrow"><input type="checkbox" checked={preferences.enabled}
      onChange={e => save(e.target.checked, String(preferences.seconds))} />{t('updateAutoWeb')}</label>
    <label>{t('updateSeconds')} <input type="number" min={1} max={300} step={1} value={seconds}
      onChange={e => setSeconds(e.target.value)} onBlur={() => save(preferences.enabled, seconds)} /></label>
    {electron && <p className="sub">{t('updateDesktopSettings')}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
