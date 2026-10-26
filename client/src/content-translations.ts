import { getLanguage } from './i18n/core.ts';
import { LANGUAGES, type Language } from './i18n/locale.ts';

interface ContentField { source: string; translations: Partial<Record<Language, string>> }
interface ContentCatalog { schema: 1; revision: string; pending: boolean; entries: Record<string, { fields: Record<string, ContentField> }> }

let entries = new Map<string, Map<string, ContentField>>(), signature = '', revision = 0, requestSequence = 0, appliedRequest = 0;
const listeners = new Set<() => void>();
export const subscribeContentTranslations = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getContentTranslationsRevision = () => revision;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function receiveContentTranslations(value: unknown): value is ContentCatalog {
  if (!record(value) || value.schema !== 1 || typeof value.revision !== 'string' || typeof value.pending !== 'boolean' || !record(value.entries)) return false;
  const next = new Map<string, Map<string, ContentField>>();
  for (const [key, entry] of Object.entries(value.entries)) {
    if (!record(entry) || !record(entry.fields)) continue;
    const fields = new Map<string, ContentField>();
    for (const [name, field] of Object.entries(entry.fields)) {
      if (!record(field) || typeof field.source !== 'string' || !record(field.translations)) continue;
      const translations: Partial<Record<Language, string>> = {};
      for (const language of LANGUAGES) {
        const text = Object.hasOwn(field.translations, language) ? field.translations[language] : undefined;
        if (typeof text === 'string' && text.trim()) translations[language] = text;
      }
      fields.set(name, { source: field.source, translations });
    }
    next.set(key, fields);
  }
  const nextSignature = JSON.stringify([value.revision, value.pending, [...next].map(([key, fields]) => [key, [...fields]])]);
  if (signature !== nextSignature) {
    entries = next; signature = nextSignature; revision++;
    listeners.forEach(listener => listener());
  }
  return true;
}

export function contentText(key: string, field: string, source: string, fallback = source): string {
  const saved = entries.get(key)?.get(field);
  return saved?.source === source ? saved.translations[getLanguage()] ?? fallback : fallback;
}

export function contentFieldText(key: string, field: string): string {
  const saved = entries.get(key)?.get(field);
  return saved ? saved.translations[getLanguage()] ?? saved.source : '';
}

export function contentFieldEntries(key: string, prefix: string): [string, string][] {
  return [...entries.get(key) ?? []].filter(([field]) => field.startsWith(prefix)).map(([field]) => [field, contentFieldText(key, field)]);
}

export const worldInstruction = (kind: string, id: string, source: string) => contentText(`world/${kind}`, `instructions.${id}`, source);

export function localizedContentEntry<T extends object>(key: string, source: T, fields: readonly string[], fallback: T = source): T {
  return new Proxy(source, { get(target, field, receiver) {
    const value: unknown = Reflect.get(target, field, receiver);
    if (typeof field !== 'string' || !fields.includes(field) || typeof value !== 'string') return value;
    const previous: unknown = Reflect.get(fallback, field);
    return contentText(key, field, value, typeof previous === 'string' ? previous : value);
  } });
}

export function localizedContentCollection<T extends object>(kind: string, source: T, fields: readonly string[], fallback: T = source): T {
  const cache = new WeakMap<object, object>();
  return new Proxy(source, { get(target, id, receiver) {
    const entry: unknown = Reflect.get(target, id, receiver);
    if (typeof id !== 'string' || !Object.hasOwn(target, id) || !record(entry)) return entry;
    const previous: unknown = Reflect.get(fallback, id), existing = cache.get(entry);
    if (existing) return existing;
    const view = localizedContentEntry(`${kind}/${id}`, entry, fields, record(previous) ? previous : entry);
    cache.set(entry, view); return view;
  } });
}

export function startContentTranslations({ request = fetch, maxAttempts = 60, pollIntervalMs = 3000 }: { request?: typeof fetch; maxAttempts?: number; pollIntervalMs?: number } = {}) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined, attempts = 0, failures = 0;
  const load = async () => {
    let again = false;
    const requestId = ++requestSequence;
    attempts++;
    try {
      const response = await request('/api/content-translations', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
      if (controller.signal.aborted || response.status === 404 || response.status === 405 || response.status === 501) return;
      if (!response.ok) throw new Error('content translations unavailable');
      const value: unknown = await response.json();
      if (controller.signal.aborted || requestId < appliedRequest || !receiveContentTranslations(value)) return;
      appliedRequest = requestId;
      again = value.pending; failures = 0;
    } catch {
      again = ++failures <= 3;
    }
    if (!controller.signal.aborted && again && attempts < maxAttempts) timer = setTimeout(() => void load(), pollIntervalMs * Math.max(1, failures));
  };
  void load();
  return () => { controller.abort(); clearTimeout(timer); };
}
