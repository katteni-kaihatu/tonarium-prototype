import { useLocale } from './locale.ts';
import { GameLanguageSwitch } from './LanguageSwitch.tsx';
import './language.css';

export function LanguageSelect() {
  return <div className="language-ai-tools"><GameLanguageSwitch/></div>;
}

export function LanguageScreen() {
  const [locale, setLocale] = useLocale();
  return <main lang={locale} className="language-screen"><div className="language-card">
    <img src="/brand/logo.png" alt="Tonarium" />
    <span className="language-ornament" aria-hidden="true">✦</span>
    <h1>어떤 언어로 시작할까요?</h1><p>Choose your language · 言語を選んでください</p>
    <div className="language-choices">
      <button lang="ko" onClick={() => setLocale('ko')}><span>한국어</span><small>한국어로 시작하기</small><b>→</b></button>
      <button lang="en" onClick={() => setLocale('en')}><span>English</span><small>Begin in English</small><b>→</b></button>
      <button lang="ja" onClick={() => setLocale('ja')}><span>日本語</span><small>日本語ではじめる</small><b>→</b></button>
    </div>
    <footer>선택은 기억되며 나중에 바꿀 수 있어요.<br/>You can change this later. · あとで変更できます。</footer>
  </div></main>;
}
