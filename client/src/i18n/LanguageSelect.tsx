import { t, useLanguage, setLanguage } from './index.ts';
import { LANGUAGES, type Language } from './locale.ts';

const NAMES: Record<Language, string> = { ja: '日本語', en: 'English', ko: '한국어' };

export function LanguageSelect() {
  const language = useLanguage();
  return <label className="language-select">
    <span>{t('language')}</span>
    <select aria-label={t('language')} value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
      {LANGUAGES.map((code) => <option key={code} value={code} lang={code}>{NAMES[code]}</option>)}
    </select>
  </label>;
}
