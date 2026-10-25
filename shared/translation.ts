export const TRANSLATION_LANGUAGES = ['ja', 'en', 'ko'] as const;
export type TranslationLanguage = typeof TRANSLATION_LANGUAGES[number];
export interface TranslationRequest { text: string; targetLanguage: TranslationLanguage }
export interface TranslationResult {
  text: string;
  sourceLanguage: string | null;
  status: 'translated' | 'unavailable' | 'failed';
}
export const TRANSLATION_TEXT_MAX = 2000;

export function isTranslationLanguage(value: unknown): value is TranslationLanguage {
  return TRANSLATION_LANGUAGES.some((language) => language === value);
}

export function sourceLanguageOf(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value) || /^(und|zxx|mul)$/i.test(value)) return null;
  try {
    const code = Intl.getCanonicalLocales(value)[0];
    return code ?? null;
  } catch { return null; }
}
