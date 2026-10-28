import { test } from 'node:test';
import assert from 'node:assert/strict';
import { npcEndpoint, resolveDialogueBackend } from './kokoa-ai-config.ts';

test('production defaults require KokoaAI credentials and ignore retired local configuration', () => {
  const legacy = { NPC_LLM_URL: 'http://127.0.0.1:18081/v1', NPC_LLM_MODEL: 'retired-model', NPC_LLM_BUNDLED_URL: 'http://fantasy-ai:8080/v1' };
  assert.deepEqual(resolveDialogueBackend({}, legacy), { endpoint: null, model: 'lfm3-1.7b', apiKey: undefined });
  assert.deepEqual(resolveDialogueBackend({}, { ...legacy, KOKOAAI_APIKEY: 'fixture-key' }), { endpoint: 'https://chat.kokoa.dev/v1/chat/completions', model: 'lfm3-1.7b', apiKey: 'fixture-key' });
});

test('production endpoint normalization preserves HTTPS paths and rejects credentials, redirects and insecure schemes', () => {
  for (const path of ['/v1', '/v1/', '/v1/chat/completions', '/v1/chat/completions/']) assert.equal(npcEndpoint('https://chat.kokoa.dev' + path), 'https://chat.kokoa.dev/v1/chat/completions');
  for (const url of ['http://chat.kokoa.dev/v1', 'file:///tmp/model', 'https://user:secret@chat.kokoa.dev/v1', 'https://chat.kokoa.dev/v1?next=secret', 'https://chat.kokoa.dev/v1#secret', 'invalid']) assert.equal(npcEndpoint(url), null, url);
});

test('invalid key or model fails closed before any transport can start', () => {
  for (const key of ['', ' ', 'fixture\nsecret', 'fixture\u007fsecret']) assert.equal(resolveDialogueBackend({}, { KOKOAAI_APIKEY: key }).endpoint, null);
  for (const model of ['x'.repeat(161), 'model\ninvalid', '\u0000model']) assert.equal(resolveDialogueBackend({}, { KOKOAAI_APIKEY: 'fixture', KOKOAAI_MODEL: model }).endpoint, null);
  for (const url of ['http://localhost:18081/v1', 'http://fantasy-ai:8080/v1']) assert.equal(resolveDialogueBackend({}, { KOKOAAI_APIKEY: 'fixture', KOKOAAI_BASEURL: url }).endpoint, null);
});

test('explicit fixture endpoints are credential-free and never read the old model configuration', () => {
  const backend = resolveDialogueBackend({ url: 'http://127.0.0.1:18081/v1', model: 'fixture-model' }, { KOKOAAI_APIKEY: 'must-not-leak', NPC_LLM_MODEL: 'retired' });
  assert.deepEqual(backend, { endpoint: 'http://127.0.0.1:18081/v1/chat/completions', model: 'fixture-model', apiKey: undefined });
  assert.equal(resolveDialogueBackend({ url: 'https://external.example/v1' }, { KOKOAAI_APIKEY: 'must-not-leak' }).endpoint, null);
});
