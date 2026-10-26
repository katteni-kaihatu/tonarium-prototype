import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { contentTranslationConfig } from './content-translation-config.ts';
import { ContentTranslationStore } from './content-translations.ts';
import { createTranslator } from './translation.ts';
import type { ContentDocument } from '../shared/content-translations.ts';

function temporary(t: { after(fn: () => void): void }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-content-config-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

const document = (): ContentDocument => ({ key: 'item/example', kind: 'item', sourceLanguage: 'en', fields: { name: { source: 'Example metadata' } } });
const filesAt = (directory: string) => fs.readdirSync(directory).sort().map(name => ({ name, body: fs.readFileSync(path.join(directory, name), 'utf8'), modified: fs.statSync(path.join(directory, name)).mtimeMs }));

test('content defaults use development mock and production OpenAI without inventing missing credentials', async () => {
  const development = contentTranslationConfig({}, true);
  assert.equal(development.profile, 'mock:gpt-4o-mini:1');
  assert.ok(development.translate);
  assert.deepEqual(await development.translate({ text: 'Hello', targetLanguage: 'ko' }), { text: '안녕하세요', sourceLanguage: 'en', status: 'translated' });
  const production = contentTranslationConfig({}, false);
  assert.equal(production.profile, 'openai:gpt-4o-mini:1');
  assert.ok(production.translate);
  assert.deepEqual(await production.translate({ text: 'Hello', targetLanguage: 'ko' }), { text: 'Hello', sourceLanguage: null, status: 'unavailable' });
  const inherited = contentTranslationConfig({ CHAT_TRANSLATION_PROVIDER: 'mock', CHAT_TRANSLATION_MODEL: 'chat-model' }, false);
  assert.equal(inherited.profile, 'mock:chat-model:1');
  assert.equal((await inherited.translate!({ text: 'Hello', targetLanguage: 'ja' })).text, 'こんにちは');
});

test('explicit content provider and model are independent of chat settings', async t => {
  const requests: { model: string; messages: unknown[] }[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ text: '설명', sourceLanguage: 'en' }) } }] }), { status: 200 });
  });
  const content = contentTranslationConfig({
    CHAT_TRANSLATION_PROVIDER: 'mock', CHAT_TRANSLATION_MODEL: 'chat-model',
    CONTENT_TRANSLATION_PROVIDER: 'openai', CONTENT_TRANSLATION_MODEL: 'content-model', OPENAPI_KEY: 'local-test-fixture',
  }, true);
  assert.equal(content.profile, 'openai:content-model:1');
  assert.deepEqual(await content.translate!({ text: 'Description', targetLanguage: 'ko' }), { text: '설명', sourceLanguage: 'en', status: 'translated' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].model, 'content-model');
  const mock = contentTranslationConfig({ CHAT_TRANSLATION_PROVIDER: 'openai', CONTENT_TRANSLATION_PROVIDER: 'mock', CONTENT_TRANSLATION_MODEL: 'independent-model' }, false);
  assert.equal(mock.profile, 'mock:independent-model:1');
  assert.equal((await mock.translate!({ text: 'Hello', targetLanguage: 'ja' })).text, 'こんにちは');
  assert.equal(requests.length, 1);
});

test('off mode reuses the inherited provider cache and leaves missing translations ungenerated', async t => {
  const directory = temporary(t), enabled = contentTranslationConfig({ CHAT_TRANSLATION_PROVIDER: 'openai', CONTENT_TRANSLATION_MODEL: 'selected-model' }, false);
  const seeded = new ContentTranslationStore(directory, createTranslator(async ({ text, targetLanguage }) => ({ text: `saved-${targetLanguage}: ${text}`, sourceLanguage: 'en' })), { profile: enabled.profile });
  await seeded.register([document()]);
  const before = filesAt(directory);
  const disabled = contentTranslationConfig({ CONTENT_TRANSLATION_PROVIDER: 'off', CHAT_TRANSLATION_PROVIDER: 'openai', CONTENT_TRANSLATION_MODEL: 'selected-model' }, false);
  assert.equal(disabled.translate, undefined);
  assert.equal(disabled.profile, enabled.profile);
  const restored = new ContentTranslationStore(directory, disabled.translate, { profile: disabled.profile });
  const current = document(); current.fields.desc = { source: 'An uncached description' };
  await restored.register([current]);
  const catalog = restored.catalog();
  assert.equal(catalog.pending, false);
  assert.equal(catalog.entries[current.key].fields.name.translations.ko, 'saved-ko: Example metadata');
  assert.deepEqual(catalog.entries[current.key].fields.desc.translations, { en: 'An uncached description' });
  assert.deepEqual(filesAt(directory), before);
  assert.equal(contentTranslationConfig({ CONTENT_TRANSLATION_PROVIDER: 'off' }, true).profile, 'mock:gpt-4o-mini:1');
  assert.equal(contentTranslationConfig({ CONTENT_TRANSLATION_PROVIDER: 'off' }, false).profile, 'openai:gpt-4o-mini:1');
});

test('missing keys retain existing live cache while mock and changed-model profiles remain separate', async t => {
  const directory = temporary(t), production = contentTranslationConfig({ OPENAPI_KEY: '' }, false);
  const seeded = new ContentTranslationStore(directory, createTranslator(async ({ targetLanguage }) => ({ text: `live-${targetLanguage}`, sourceLanguage: 'en' })), { profile: production.profile });
  await seeded.register([document()]);
  const saved = filesAt(directory);
  const missingKey = new ContentTranslationStore(directory, production.translate, { profile: production.profile });
  await missingKey.register([document()]);
  assert.equal(missingKey.catalog().entries['item/example'].fields.name.translations.ko, 'live-ko');
  assert.deepEqual(filesAt(directory), saved);
  const mock = contentTranslationConfig({}, true), development = new ContentTranslationStore(directory, mock.translate, { profile: mock.profile });
  await development.register([document()]);
  assert.equal(development.catalog().entries['item/example'].fields.name.translations.ko, '[ko mock] Example metadata');
  const changed = contentTranslationConfig({ CONTENT_TRANSLATION_MODEL: 'other-model', OPENAPI_KEY: '' }, false);
  const changedModel = new ContentTranslationStore(directory, changed.translate, { profile: changed.profile });
  await changedModel.register([document()]);
  assert.deepEqual(changedModel.catalog().entries['item/example'].fields.name.translations, { en: 'Example metadata' });
  const explicitLive = contentTranslationConfig({ CHAT_TRANSLATION_PROVIDER: 'mock', CONTENT_TRANSLATION_PROVIDER: 'openai', OPENAPI_KEY: '' }, true);
  const selectedLive = new ContentTranslationStore(directory, explicitLive.translate, { profile: explicitLive.profile });
  await selectedLive.register([document()]);
  assert.equal(selectedLive.catalog().entries['item/example'].fields.name.translations.ko, 'live-ko');
});
