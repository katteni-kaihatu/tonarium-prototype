import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BROWSER_AI_CACHE_MARKER, cleanupBrowserAiCache, isBrowserAiCacheUrl, markBrowserAiCacheDirty, type BrowserAiCacheEnvironment } from './cache.ts';
import { BROWSER_AI_MODEL_LIB, BROWSER_AI_MODEL_URL } from './model.ts';

test('startup cleanup works without consent, network, WebLLM import or an existing dirty marker', async () => {
  const model = `${BROWSER_AI_MODEL_URL}params_shard_0.bin`, config = `${BROWSER_AI_MODEL_URL}mlc-chat-config.json`;
  const old = 'https://huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC/resolve/main/tokenizer.json';
  const foreign = 'https://huggingface.co/mlc-ai/Qwen3-4B-q4f16_1-MLC/resolve/main/params_shard_0.bin';
  const caches = new Map([['webllm/model', [model, old, foreign]], ['webllm/config', [config]], ['webllm/wasm', [BROWSER_AI_MODEL_LIB]], ['unrelated-app', [model]]]);
  const removed: string[] = [];
  const env: BrowserAiCacheEnvironment = { caches: { keys: async () => [...caches.keys()], open: async name => ({ keys: async () => caches.get(name)!.map(url => ({ url })), delete: async request => { removed.push(request.url); caches.set(name, caches.get(name)!.filter(url => url !== request.url)); return true; } }) }, storage: { setItem() { throw new Error('consent not stored'); }, removeItem: key => { assert.equal(key, BROWSER_AI_CACHE_MARKER); } } };
  const fetch = globalThis.fetch; globalThis.fetch = (() => { throw new Error('cleanup must never fetch'); }) as typeof fetch;
  try { await cleanupBrowserAiCache(env); } finally { globalThis.fetch = fetch; }
  assert.deepEqual(new Set(removed), new Set([model, old, config, BROWSER_AI_MODEL_LIB]));
  assert.deepEqual(caches.get('unrelated-app'), [model]); assert.deepEqual(caches.get('webllm/model'), [foreign]);
});

test('cleanup URL matching is restricted to two app-managed models and their exact versioned libraries', () => {
  assert.ok(isBrowserAiCacheUrl(`${BROWSER_AI_MODEL_URL}tensor-cache.json`));
  assert.ok(isBrowserAiCacheUrl(BROWSER_AI_MODEL_LIB.replace('Qwen3-1.7B', 'Qwen3-0.6B')));
  for (const url of ['https://evil.invalid/mlc-ai/Qwen3-1.7B-q4f16_1-MLC/resolve/main/a', `${BROWSER_AI_MODEL_URL}../../../../Other/resolve/main/a`, BROWSER_AI_MODEL_LIB.replace('v0_2_86', 'v0_1_0'), BROWSER_AI_MODEL_LIB.replace('Qwen3-1.7B', 'Qwen3-4B'), 'garbage']) assert.equal(isBrowserAiCacheUrl(url), false);
});

test('cache failure leaves dirty state for the next startup and temporary cleanup does not clear markers', async () => {
  let dirty = false;
  const env: BrowserAiCacheEnvironment = { storage: { setItem: () => { dirty = true; }, removeItem: () => { dirty = false; } }, caches: { keys: async () => { throw new Error('storage unavailable'); }, open: async () => { throw new Error('not used'); } } };
  markBrowserAiCacheDirty(env); assert.equal(dirty, true);
  await assert.rejects(cleanupBrowserAiCache(env), /storage unavailable/); assert.equal(dirty, true);
  env.caches = { keys: async () => [], open: async () => { throw new Error('not used'); } };
  await cleanupBrowserAiCache(env, false); assert.equal(dirty, true);
  await cleanupBrowserAiCache(env); assert.equal(dirty, false);
});
