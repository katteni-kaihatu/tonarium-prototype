import { sourceLanguageOf, type TranslationLanguage, type TranslationResult } from '../../shared/translation.ts';

export type TranslationView = Omit<TranslationResult, 'status'> & { status: TranslationResult['status'] | 'pending' };

export function createTranslationClient(request: typeof fetch = (...args) => fetch(...args)) {
  const cache = new Map<string, TranslationView>();
  const pending = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();
  const waiting: (() => void)[] = [];
  let active = 0;
  const acquire = async () => {
    if (active >= 4) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
  };
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };
  const keyOf = (text: string, target: TranslationLanguage) => JSON.stringify([text, target]);
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    get(text: string, target: TranslationLanguage) { return cache.get(keyOf(text, target)); },
    load(text: string, targetLanguage: TranslationLanguage): Promise<void> {
      if (!text.trim()) return Promise.resolve();
      const key = keyOf(text, targetLanguage);
      if (pending.has(key)) return pending.get(key)!;
      // 失敗は最終結果として固定しない (#207)。混雑などで failed になった発言は、
      // 次に load が呼ばれたとき（再マウント・言語の往復など）に再試行する。
      // unavailable はサーバー側の未設定を表しセッション中は変わらないため、従来どおりキャッシュする。
      const cached = cache.get(key);
      if (cached && cached.status !== 'failed') return Promise.resolve();
      const update = (value: TranslationView) => {
        cache.set(key, value);
        if (cache.size > 500) {
          const oldest = [...cache.keys()].find((id) => id !== key && !pending.has(id));
          if (oldest) cache.delete(oldest);
        }
        listeners.forEach((listener) => listener());
      };
      update({ text, sourceLanguage: null, status: 'pending' });
      const task = (async () => {
        await acquire();
        try {
          const response = await request('/api/translate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, targetLanguage }), signal: AbortSignal.timeout(10000),
          });
          if (!response.ok) throw new Error('translation failed');
          const result: unknown = await response.json();
          if (!result || typeof result !== 'object' || !('status' in result) || !('text' in result) || typeof result.text !== 'string' || !result.text.trim()) throw new Error('invalid translation');
          if (result.status === 'translated') {
            update({ text: result.text, sourceLanguage: sourceLanguageOf('sourceLanguage' in result ? result.sourceLanguage : null), status: 'translated' });
          } else if (result.status === 'failed' || result.status === 'unavailable') {
            update({ text, sourceLanguage: null, status: result.status });
          } else throw new Error('invalid translation');
        } catch { update({ text, sourceLanguage: null, status: 'failed' }); }
        finally { pending.delete(key); release(); }
      })();
      pending.set(key, task);
      return task;
    },
  };
}

export const translations = createTranslationClient();
