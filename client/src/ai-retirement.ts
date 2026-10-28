// 廃止したモデルの保存分だけを整理する。
const RETIRED_STORAGE_KEYS = ['tonarium.browser-ai.consent.v1', 'tonarium.browser-ai.cache-dirty.v1'];
const RETIRED_CACHE_SCOPES = new Set(['webllm/model', 'webllm/config', 'webllm/wasm']);
const RETIRED_MODEL_SIZES = ['0.6B', '1.7B', '4B', '8B'];

interface RetiredCache {
  keys(): Promise<readonly { url: string }[]>;
  delete(request: { url: string }): Promise<boolean>;
}
export interface AiRetirementEnvironment {
  caches?: { keys(): Promise<string[]>; open(name: string): Promise<RetiredCache> };
  storage?: Pick<Storage, 'removeItem'>;
}

function browserEnvironment(): AiRetirementEnvironment {
  const env: AiRetirementEnvironment = {};
  try { env.storage = globalThis.localStorage; } catch { /* 保存領域が拒否された場合は省く。 */ }
  try { env.caches = globalThis.caches as AiRetirementEnvironment['caches']; } catch { /* 保存領域が拒否された場合は省く。 */ }
  return env;
}

export function isRetiredBrowserAiUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return RETIRED_MODEL_SIZES.some(size =>
      url.origin === 'https://huggingface.co' && ['resolve', 'raw'].some(mode => url.pathname.startsWith(`/mlc-ai/Qwen3-${size}-q4f16_1-MLC/${mode}/`))
      || url.origin === 'https://raw.githubusercontent.com' && url.pathname === `/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_86/base/Qwen3-${size}-q4f16_1_cs1k-webgpu.wasm`);
  } catch { return false; }
}

/** ゲームの保存領域やキャッシュ全体は削除しない。 */
export async function cleanupRetiredBrowserAi(env = browserEnvironment()): Promise<void> {
  for (const key of RETIRED_STORAGE_KEYS) {
    try { env.storage?.removeItem(key); } catch { /* 保存領域が拒否されても残りを続ける。 */ }
  }
  if (!env.caches) return;
  for (const name of await env.caches.keys()) {
    if (!RETIRED_CACHE_SCOPES.has(name)) continue;
    const cache = await env.caches.open(name);
    for (const request of await cache.keys()) if (isRetiredBrowserAiUrl(request.url)) await cache.delete(request);
  }
}
