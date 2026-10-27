import { useLocale } from './locale.ts';
import './language.css';

export function GameLanguageSwitch() {
  const [locale, setLocale] = useLocale();
  return <div className="game-language-switch" role="group" aria-label="Language / 언어 / 言語">
    {(['ko', 'en', 'ja'] as const).map((language) => <button key={language} type="button" lang={language} aria-pressed={locale === language} onClick={() => setLocale(language)}>{ { ko: '한국어', en: 'English', ja: '日本語' }[language] }</button>)}
  </div>;
}
