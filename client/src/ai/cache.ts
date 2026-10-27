import { BROWSER_AI_MODEL_LIB } from './model.ts';

export const BROWSER_AI_CACHE_MARKER = 'tonarium.browser-ai.cache-dirty.v1';
const SCOPES = new Set(['webllm/model', 'webllm/config', 'webllm/wasm']);
interface CacheView { keys(): Promise<readonly { url: string }[]>; delete(request: { url: string }): Promise<boolean> }
export interface BrowserAiCacheEnvironment {
  caches?: { keys(): Promise<string[]>; open(name: string): Promise<CacheView> };
  storage?: Pick<Storage, 'setItem' | 'removeItem'>;
}
function environment(): BrowserAiCacheEnvironment {
  let storage: Storage | undefined;
  try { storage = globalThis.localStorage; } catch { /* 保存が拒否されても、選択モデルのキャッシュは確認する。 */ }
  return { caches: globalThis.caches as unknown as BrowserAiCacheEnvironment['caches'], storage };
}
export function markBrowserAiCacheDirty(env = environment()): void { try { env.storage?.setItem(BROWSER_AI_CACHE_MARKER, '1'); } catch { /* 次回もキャッシュ自体を列挙する。 */ } }
export function clearBrowserAiCacheMarker(env = environment()): void { try { env.storage?.removeItem(BROWSER_AI_CACHE_MARKER); } catch { /* マーカーは再清掃を促すだけ。 */ } }
export function isBrowserAiCacheUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const models = ['Qwen3-0.6B-q4f16_1-MLC', 'Qwen3-1.7B-q4f16_1-MLC'];
    return url.origin === 'https://huggingface.co' && models.some(model => ['resolve', 'raw'].some(mode => url.pathname.startsWith(`/mlc-ai/${model}/${mode}/`)))
      || url.origin === new URL(BROWSER_AI_MODEL_LIB).origin && [new URL(BROWSER_AI_MODEL_LIB).pathname, new URL(BROWSER_AI_MODEL_LIB).pathname.replace('Qwen3-1.7B', 'Qwen3-0.6B')].includes(url.pathname);
  } catch { return false; }
}

/** ネットワーク・WebLLM・モデルを起動せず、正式3scope内の選択モデルのURLだけを削除する。 */
export async function cleanupBrowserAiCache(env = environment(), clearMarker = true): Promise<void> {
  if (!env.caches) { if (clearMarker) clearBrowserAiCacheMarker(env); return; }
  for (const name of await env.caches.keys()) {
    if (!SCOPES.has(name)) continue;
    const cache = await env.caches.open(name);
    for (const request of await cache.keys()) if (isBrowserAiCacheUrl(request.url)) await cache.delete(request);
  }
  if (clearMarker) clearBrowserAiCacheMarker(env);
}
