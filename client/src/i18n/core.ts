import { resources } from './resources.ts';
import { initialLanguage, languageOf, LANGUAGE_STORAGE_KEY, type Language } from './locale.ts';

let storage: Storage | undefined;
try { storage = globalThis.localStorage; } catch { /* 保存不可の端末でも表示する */ }
let language = initialLanguage(storage, typeof window === 'undefined' || typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]);
const listeners = new Set<() => void>();
export const getLanguage = () => language;
export const subscribeLanguage = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const updateDocument = () => {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = language;
  document.title = t('appTitle');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('appDescription'));
};

export function setLanguage(next: Language) {
  const resolved = languageOf(next);
  if (!resolved) return;
  try { storage?.setItem(LANGUAGE_STORAGE_KEY, resolved); } catch { /* メモリ上の選択は反映する */ }
  language = resolved;
  updateDocument();
  listeners.forEach((listener) => listener());
}

export type UiMessage = { key: string; values: UiValue[] };
export type UiValue = string | number | boolean | null | undefined | UiMessage;
export const msg = (key: string, ...values: UiValue[]): UiMessage => ({ key, values });
const sourceKeys = new Map(Object.entries(resources.ja).map(([key, value]) => [value, key]));
updateDocument();

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  const receiveLanguage = (event: StorageEvent) => {
    if (event.key !== LANGUAGE_STORAGE_KEY || (event.storageArea && event.storageArea !== storage)) return;
    const next = languageOf(event.newValue);
    if (!next || next === language) return;
    // 別タブの設定を保存し直すと通知が往復するため、表示だけ更新する。
    language = next; updateDocument(); listeners.forEach(listener => listener());
  };
  window.addEventListener('storage', receiveLanguage);
  if (import.meta.hot) import.meta.hot.dispose(() => window.removeEventListener('storage', receiveLanguage));
}

export function formatDate(value: Date | number, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(language, options).format(value);
}

function translate(locale: Language, key: string, values: UiValue[]): string {
  const id = sourceKeys.get(key) ?? key;
  const catalog = resources[locale];
  const template = Object.hasOwn(catalog, id) ? catalog[id] : Object.hasOwn(resources.ja, id) ? resources.ja[id] : key;
  return template.replace(/\{(\d+)\}/g, (placeholder, index: string) => {
    const value = values[Number(index)];
    return Number(index) >= values.length ? placeholder : value && typeof value === 'object' ? translate(locale, value.key, value.values) : String(value);
  });
}

export function t(key: string, ...values: UiValue[]): string { return translate(language, key, values); }
export function sourceText(key: string, ...values: UiValue[]): string { return translate('ja', key, values); }

// サーバーのシステム表示にだけ使い、ユーザーの本文には適用しない。
const patterns = Object.entries(resources.ja).filter(([, source]) => /\{\d+\}/.test(source)).map(([key, source]) => ({
  key,
  pattern: new RegExp('^' + source.split(/\{\d+\}/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('([\\s\\S]*?)') + '$'),
}));
export function systemText(value: string | UiMessage): string {
  if (typeof value !== 'string') return t(value.key, ...value.values);
  if (sourceKeys.has(value)) return t(value);
  for (const { key, pattern } of patterns) {
    const match = pattern.exec(value);
    if (match) {
      const values = match.slice(1);
      if (key === 'ui1089' || key === 'ui1094') values[0] = t(values[0]);
      if (key === 'ui1094') values[1] = t(values[1]);
      if (key === 'ui1229') { values[1] = t(values[1]); values[2] = t(values[2]); }
      if (key === 'ui1242' || key === 'ui1243') values[1] = t(values[1]);
      return t(key, ...values);
    }
  }
  return value;
}

// 組み込み定義だけを包む。共有データやユーザー入力は変更しない。
export function localized<T extends object>(source: T): T {
  const cache = new WeakMap<object, object>();
  const texts = new Map<string, string>();
  let textLanguage = language;
  const wrap = (value: object): object => {
    const existing = cache.get(value);
    if (existing) return existing;
    const proxy = new Proxy(value, { get(target, key, receiver) {
      const child = Reflect.get(target, key, receiver) as unknown;
      if (typeof child === 'string') {
        if (textLanguage !== language) { texts.clear(); textLanguage = language; }
        const existingText = texts.get(child);
        if (existingText !== undefined) return existingText;
        const text = systemText(child);
        texts.set(child, text);
        return text;
      }
      return child && typeof child === 'object' ? wrap(child) : child;
    } });
    cache.set(value, proxy);
    return proxy;
  };
  return wrap(source) as T;
}
