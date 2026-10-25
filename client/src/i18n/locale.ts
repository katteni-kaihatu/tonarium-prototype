export const LANGUAGES = ['ja', 'en', 'ko'] as const;
export type Language = typeof LANGUAGES[number];
export const LANGUAGE_STORAGE_KEY = 'tonarium.language';

export function languageOf(code: unknown): Language | undefined {
  if (typeof code !== 'string') return undefined;
  const base = code.trim().toLowerCase().split(/[-_]/)[0];
  return LANGUAGES.find((language) => language === base);
}

export function resolveLanguage(saved: unknown, preferred: readonly string[]): Language {
  return languageOf(saved) ?? preferred.map(languageOf).find((language) => language !== undefined) ?? 'ja';
}

export function initialLanguage(storage?: Pick<Storage, 'getItem'>, preferred: readonly string[] = []): Language {
  let saved: string | null = null;
  try { saved = storage?.getItem(LANGUAGE_STORAGE_KEY) ?? null; } catch { /* 保存不可の端末でも表示する */ }
  return resolveLanguage(saved, preferred);
}
