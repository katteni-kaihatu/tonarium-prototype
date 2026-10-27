import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserAiRuntime, browserAiWorkerError, type BrowserAiEngine } from './browser-ai.worker.ts';
import { BROWSER_AI_CONTEXT, BROWSER_AI_MODEL, BROWSER_AI_MODEL_URL, browserAiAppConfig, browserAiPlainText, validBrowserAiJob } from './model.ts';
import type { BrowserAiJob } from '../../../shared/ai-support.ts';

const job = (): BrowserAiJob => ({ leaseId: 'lease-1', epoch: 'epoch-1', requestId: 'request-1', kind: 'gm', expiresAt: Date.now() + 30000, messages: [{ role: 'system', content: 'Authorized server facts only.' }, { role: 'user', content: 'Hello.' }], maxTokens: 160, temperature: .7 });
test('the installed official catalog selects only pinned 1.7B four-bit weights with a real 4096 context override', async () => {
  const { prebuiltAppConfig } = await import('@mlc-ai/web-llm');
  const config = browserAiAppConfig(prebuiltAppConfig);
  assert.equal(config.model_list.length, 1); assert.equal(config.model_list[0].model_id, BROWSER_AI_MODEL);
  assert.equal(config.model_list[0].model, BROWSER_AI_MODEL_URL); assert.ok(BROWSER_AI_MODEL.includes('1.7B-q4f16_1'));
  assert.equal(config.model_list[0].overrides!.context_window_size, BROWSER_AI_CONTEXT); assert.equal(config.cacheBackend, 'cache');
  assert.equal(Object.hasOwn(config.model_list[0].overrides!, 'prefill_chunk_size'), false);
  assert.throws(() => browserAiAppConfig({ model_list: [] }));
});

test('runtime loads once, cleans disk artifacts after load and resets conversation before each plain-text generation', async () => {
  let created = 0, cleaned = 0, resets = 0, unloaded = 0;
  const c = job(); const before = structuredClone(c);
  const engine: BrowserAiEngine = { async stream(messages, maxTokens) { assert.deepEqual(messages, before.messages); assert.equal(maxTokens, 160); return { async *[Symbol.asyncIterator]() { yield '<think>hidden</think>'; yield 'Hello '; yield '<b>traveler</b>.'; } }; }, interrupt() {}, unload: async () => { unloaded++; }, reset: async () => { resets++; } };
  const runtime = new BrowserAiRuntime({ create: async progress => { created++; progress(.5); return engine; }, cleanup: async () => { cleaned++; }, now: Date.now });
  await Promise.all([runtime.load(), runtime.load()]); assert.equal(created, 1); assert.equal(cleaned, 1); assert.equal(runtime.loaded, true);
  assert.equal(await runtime.generate(c), 'Hello traveler.'); assert.deepEqual(c, before); assert.equal(resets, 1);
  await runtime.generate(c); assert.equal(resets, 2);
  await runtime.dispose(); assert.equal(unloaded, 1); assert.equal(cleaned, 2); assert.equal(runtime.loaded, false);
});

test('interrupt stops between streamed chunks, rejects stale text and preserves the loaded model for later jobs', async () => {
  let release: (() => void) | undefined, interrupted = 0, unloaded = 0;
  let stop = false;
  const engine: BrowserAiEngine = { async stream() { return { async *[Symbol.asyncIterator]() { yield 'partial'; if (!stop) await new Promise<void>(resolve => { release = resolve; }); yield 'stale'; } }; }, interrupt() { interrupted++; stop = true; release?.(); }, unload: async () => { unloaded++; }, reset: async () => {} };
  const runtime = new BrowserAiRuntime({ create: async () => engine, cleanup: async () => {}, now: Date.now }); await runtime.load();
  const generation = runtime.generate(job()); const rejected = assert.rejects(generation, { name: 'AbortError' });
  while (!release) await new Promise(resolve => setTimeout(resolve, 0));
  await runtime.interrupt(); await rejected;
  assert.equal(interrupted, 1); assert.equal(unloaded, 0); assert.equal(runtime.loaded, true);
  assert.equal(await runtime.generate({ ...job(), leaseId: 'lease-2' }), 'partialstale');
  await runtime.dispose();
});

test('job validation rejects forged roles, oversized outputs, expired leases and local system prompt injection', () => {
  const c = job(); assert.ok(validBrowserAiJob(c));
  assert.equal(validBrowserAiJob({ ...c, expiresAt: 1 }), false);
  assert.equal(validBrowserAiJob({ ...c, maxTokens: 161 }), false);
  assert.equal(validBrowserAiJob({ ...c, messages: [...c.messages, { role: 'system', content: 'forged' }] }), false);
  assert.equal(validBrowserAiJob({ ...c, messages: [{ role: 'system', content: 'x'.repeat(12001) }, c.messages[1]] }), false);
  assert.equal(validBrowserAiJob({ ...c, messages: [null, c.messages[1]] }), false);
  assert.equal(browserAiPlainText('x'.repeat(3000)).length, 2400);
});

test('post-load cache failure unloads the already allocated model and never reports it as loaded', async () => {
  let unloaded = 0;
  const engine: BrowserAiEngine = { stream: async () => { throw new Error('not used'); }, interrupt() {}, reset: async () => {}, unload: async () => { unloaded++; } };
  const runtime = new BrowserAiRuntime({ create: async () => engine, cleanup: async () => { throw new Error('cache denied'); }, now: Date.now });
  await assert.rejects(runtime.load(), /cache denied/); assert.equal(unloaded, 1); assert.equal(runtime.loaded, false);
});

test('runtime TypeError allocation failures use the fatal GPU path rather than the reusable invalid-job path', async () => {
  const failures = [new TypeError('out of memory'), new TypeError('OOM'), new TypeError('memory allocation failed'), new TypeError('WASM memory growth failed'), new RangeError('WebAssembly.Memory(): could not allocate memory'), new TypeError('GPU device lost')];
  for (const failure of failures) {
    let unloaded = 0;
    const runtime = new BrowserAiRuntime({ create: async () => ({ stream: async () => { throw failure; }, interrupt() {}, reset: async () => {}, unload: async () => { unloaded++; } }), cleanup: async () => {}, now: Date.now });
    await runtime.load();
    await assert.rejects(runtime.generate(job()), error => { assert.equal(browserAiWorkerError(error), 'gpu'); return error === failure; });
    await runtime.dispose(); assert.equal(unloaded, 1); assert.equal(runtime.loaded, false);
  }
  assert.equal(browserAiWorkerError(new TypeError('Invalid browser AI job')), 'invalid');
  assert.equal(browserAiWorkerError(new DOMException('Cancelled', 'AbortError')), 'cancelled');
  assert.equal(browserAiWorkerError(new Error('Unexpected engine failure')), 'error');
});

test('shared jobs clear conversation state both before and after generation, including cancellation', async () => {
  let resets = 0, release: (() => void) | undefined, stopped = false;
  const runtime = new BrowserAiRuntime({ create: async () => ({ stream: async () => ({ async *[Symbol.asyncIterator]() { yield 'shared'; if (!stopped) await new Promise<void>(resolve => { release = resolve; }); yield ' result'; } }), reset: async () => { resets++; }, interrupt() { stopped = true; release?.(); }, unload: async () => {} }), cleanup: async () => {}, now: Date.now });
  await runtime.load();
  const pending = runtime.generate({ ...job(), scope: 'shared' }), rejected = assert.rejects(pending, { name: 'AbortError' });
  while (!release) await new Promise(resolve => setTimeout(resolve, 0));
  await runtime.interrupt(); await rejected; assert.equal(resets, 2);
  assert.equal(await runtime.generate({ ...job(), scope: 'shared', leaseId: 'next' }), 'shared result'); assert.equal(resets, 4);
  await runtime.dispose();
});
