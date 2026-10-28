import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanupRetiredBrowserAi, isRetiredBrowserAiUrl, type AiRetirementEnvironment } from './ai-retirement.ts';

const model = 'https://huggingface.co/mlc-ai/Qwen3-8B-q4f16_1-MLC/resolve/b3d55c289eae58f77095f5b68c895eeea358ee09/params_shard_0.bin';
const library = 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_86/base/Qwen3-8B-q4f16_1_cs1k-webgpu.wasm';

test('retirement removes only app model requests in the three historical WebLLM caches', async () => {
  const foreign = 'https://huggingface.co/mlc-ai/Qwen3-14B-q4f16_1-MLC/resolve/main/params_shard_0.bin';
  const gameAsset = 'https://tonarium.invalid/assets/world.glb';
  const entries = new Map([
    ['webllm/model', [model, foreign, gameAsset]],
    ['webllm/config', [model.replace('params_shard_0.bin', 'mlc-chat-config.json')]],
    ['webllm/wasm', [library]],
    ['tonarium-game-assets', [gameAsset, model]],
  ]);
  const storage = new Map([
    ['tonarium.browser-ai.consent.v1', '{"enabled":true}'],
    ['tonarium.browser-ai.cache-dirty.v1', '1'],
    ['tonarium.fantasy.account', 'account-secret'],
    ['tonarium.game.save', 'game-progress'],
    ['tonarium.language', 'ja'],
  ]);
  const opened: string[] = [];
  const env: AiRetirementEnvironment = {
    storage: { removeItem: key => { storage.delete(key); } },
    caches: {
      keys: async () => [...entries.keys()],
      open: async name => {
        opened.push(name);
        return {
          keys: async () => entries.get(name)!.map(url => ({ url })),
          delete: async request => { entries.set(name, entries.get(name)!.filter(url => url !== request.url)); return true; },
        };
      },
    },
  };
  await cleanupRetiredBrowserAi(env);
  assert.deepEqual(opened, ['webllm/model', 'webllm/config', 'webllm/wasm']);
  assert.deepEqual(entries.get('webllm/model'), [foreign, gameAsset]);
  assert.deepEqual(entries.get('webllm/config'), []);
  assert.deepEqual(entries.get('webllm/wasm'), []);
  assert.deepEqual(entries.get('tonarium-game-assets'), [gameAsset, model]);
  assert.deepEqual([...storage], [
    ['tonarium.fantasy.account', 'account-secret'], ['tonarium.game.save', 'game-progress'], ['tonarium.language', 'ja'],
  ]);
  await cleanupRetiredBrowserAi(env);
  assert.deepEqual(entries.get('webllm/model'), [foreign, gameAsset]);
});

test('URL matching includes only the four historical app models and their exact library version', () => {
  for (const size of ['0.6B', '1.7B', '4B', '8B']) {
    for (const mode of ['resolve', 'raw']) assert.equal(isRetiredBrowserAiUrl(`https://huggingface.co/mlc-ai/Qwen3-${size}-q4f16_1-MLC/${mode}/main/tokenizer.json`), true);
    assert.equal(isRetiredBrowserAiUrl(library.replace('8B', size)), true);
  }
  for (const url of [
    'garbage', model.replace('huggingface.co', 'huggingface.co.evil.invalid'), model.replace('https:', 'http:'),
    model.replace('/mlc-ai/', '/someone-else/'), model.replace('8B', '14B'), model.replace('/resolve/', '/resolve-other/'),
    model.replace('/resolve/b3d55c289eae58f77095f5b68c895eeea358ee09/', '/resolve/../../../Other/resolve/main/'),
    library.replace('v0_2_86', 'v0_1_0'), library + '.backup', library.replace('8B', '14B'),
  ]) assert.equal(isRetiredBrowserAiUrl(url), false, url);
});

test('unavailable browser storage APIs are harmless', async () => {
  await cleanupRetiredBrowserAi({});
});

test('denied localStorage does not prevent model-cache retirement', async () => {
  let deleted = false;
  const attempted: string[] = [];
  await cleanupRetiredBrowserAi({
    storage: { removeItem: key => { attempted.push(key); throw new Error('storage denied'); } },
    caches: { keys: async () => ['webllm/model'], open: async () => ({ keys: async () => [{ url: model }], delete: async () => { deleted = true; return true; } }) },
  });
  assert.equal(deleted, true);
  assert.deepEqual(attempted, ['tonarium.browser-ai.consent.v1', 'tonarium.browser-ai.cache-dirty.v1']);
});

test('failed cache access may be retried on the next startup', async () => {
  const removed: string[] = [];
  const env: AiRetirementEnvironment = {
    storage: { removeItem: key => { removed.push(key); } },
    caches: { keys: async () => { throw new Error('cache unavailable'); }, open: async () => { throw new Error('not opened'); } },
  };
  await assert.rejects(cleanupRetiredBrowserAi(env), /cache unavailable/);
  assert.equal(removed.length, 2);
  env.caches = { keys: async () => [], open: async () => { throw new Error('not opened'); } };
  await cleanupRetiredBrowserAi(env);
});
