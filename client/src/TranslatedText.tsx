import { useEffect, useSyncExternalStore } from 'react';
import { useLanguage, t } from './i18n/index.ts';
import { translations, type TranslationView } from './translation.ts';
import { Linkified } from './world/Links.tsx';

export function useTranslatedText(text: string) {
  const language = useLanguage();
  const result = useSyncExternalStore(translations.subscribe, () => translations.get(text, language), () => undefined);
  useEffect(() => { void translations.load(text, language); }, [text, language]);
  return result;
}

export function TranslationContent({ text, result }: { text: string; result?: TranslationView }) {
  const language = useLanguage();
  let source = t('chatLanguageUnknown');
  if (result?.sourceLanguage) {
    try { source = new Intl.DisplayNames([language], { type: 'language', fallback: 'none' }).of(result.sourceLanguage) ?? source; } catch { /* 不正な言語コードは不明として表示する */ }
  }
  const status = result?.status ?? 'pending';
  return <span className="translated-text" aria-busy={status === 'pending'}>
    <span className="translation-body"><Linkified text={status === 'translated' ? result!.text : text} /></span>
    {status === 'translated' && <small className="translation-original"><span>{t('chatOriginal')} </span><Linkified text={text} /></small>}
    <small className="translation-meta">{t('chatSourceLanguage', source)}{status !== 'translated' && <> · {t(`chatTranslation_${status}`)}</>}</small>
  </span>;
}

export function TranslatedText({ text }: { text: string }) {
  const result = useTranslatedText(text);
  return <TranslationContent text={text} result={result} />;
}
