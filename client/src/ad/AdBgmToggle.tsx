import { get, setAdBgmEnabled, useStore } from '../store.ts';
import { t, useLanguage } from '../i18n/index.ts';
import { s } from '../world/antimatter/styles.ts';

export function AdBgmToggle() {
  useLanguage();
  const enabled = useStore(state => state.adBgmEnabled);
  return <button type="button" style={s.btn} aria-label={t('adBgmLabel')} aria-pressed={enabled}
    onClick={() => setAdBgmEnabled(!get().adBgmEnabled)}>
    {t(enabled ? 'adBgmOn' : 'adBgmOff')}
  </button>;
}
