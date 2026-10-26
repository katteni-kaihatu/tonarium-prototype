import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { ContentTranslationStore, validateContentDocuments } from './content-translations.ts';
import { createOpenAITranslationModel, createTranslationHandler, createTranslator, type TranslationModel } from './translation.ts';
import type { ContentDocument } from '../shared/content-translations.ts';
import type { TranslationRequest } from '../shared/translation.ts';

function temporary(t: { after(fn: () => void): void }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-content-translations-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

const document = (source = 'A reusable button.', key = 'system/button/1.0.0'): ContentDocument => ({ key, kind: 'system', sourceLanguage: 'en', context: 'A reusable interaction system.', fields: { description: { source } } });
const prefixModel: TranslationModel = async ({ text, targetLanguage }) => ({ text: `${targetLanguage}: ${text}`, sourceLanguage: 'en' });

test('translations appear in the catalog, persist, and survive restart and logic-only versions', async t => {
  const directory = temporary(t), calls: TranslationRequest[] = [];
  const translate = createTranslator(async request => { calls.push(request); return prefixModel(request, new AbortController().signal); });
  const store = new ContentTranslationStore(directory, translate);
  const pending = store.register([document()]);
  assert.equal(store.catalog().pending, true);
  assert.equal(store.catalog().entries['system/button/1.0.0'].fields.description.source, 'A reusable button.');
  assert.equal(store.catalog().entries['system/button/1.0.0'].fields.description.translations.ko, undefined);
  await pending;
  assert.equal(store.catalog().pending, false);
  assert.equal(calls.length, 2);
  assert.deepEqual(store.catalog().entries['system/button/1.0.0'].fields.description.translations, { en: 'A reusable button.', ja: 'ja: A reusable button.', ko: 'ko: A reusable button.' });
  const revision = store.catalog().revision;
  const restarted = new ContentTranslationStore(directory, translate);
  await restarted.register([document()]);
  assert.equal(restarted.catalog().revision, revision);
  await restarted.register([document(undefined, 'system/button/2.0.0')]);
  assert.equal(calls.length, 2);
  assert.equal(restarted.catalog().entries['system/button/2.0.0'].fields.description.translations.ko, 'ko: A reusable button.');
  const snapshot = restarted.catalog();
  snapshot.entries['system/button/2.0.0'].fields.description.source = 'mutated';
  assert.equal(restarted.catalog().entries['system/button/2.0.0'].fields.description.source, 'A reusable button.');
});

test('source changes invalidate individual fields and manual corrections override generated cache', async t => {
  const directory = temporary(t), calls: TranslationRequest[] = [];
  const store = new ContentTranslationStore(directory, createTranslator(async request => { calls.push(request); return { text: `${request.targetLanguage}: ${request.text}`, sourceLanguage: 'en' }; }));
  const first = document(); first.fields.title = { source: 'Button' };
  await store.register([first]);
  assert.equal(calls.length, 4);
  const changed = structuredClone(first);
  changed.fields.description = { source: 'A new description.', translations: { ko: '직접 수정한 설명' } };
  const pending = store.register([changed]);
  assert.equal(store.catalog().entries[first.key].fields.description.translations.ko, '직접 수정한 설명');
  assert.equal(store.catalog().entries[first.key].fields.description.translations.ja, undefined);
  await pending;
  assert.equal(calls.length, 5);
  const correction = structuredClone(first); correction.fields.title.translations = { ko: '직접 수정한 버튼' };
  await store.register([correction]);
  assert.equal(calls.length, 5);
  assert.equal(store.catalog().entries[first.key].fields.title.translations.ko, '직접 수정한 버튼');
  const offline = new ContentTranslationStore(directory);
  await offline.register([correction]);
  assert.equal(offline.catalog().entries[first.key].fields.title.translations.ko, '직접 수정한 버튼');
});

test('human prose corrections can repeat common identifier words while preserving structural tokens', async t => {
  const calls: TranslationRequest[] = [];
  const original = 'seat에서 start를 누릅니다. `seat.start()`로 {user}를 안내합니다. https://example.com/help';
  const manual = 'The user can start from the seat, and the user may start again. Use `seat.start()` for {user}. https://example.com/help';
  const item: ContentDocument = { key: 'system/seating/1.0.0', kind: 'system', sourceLanguage: 'ko', protectedTerms: ['seat', 'start', 'user'], fields: { description: { source: original, translations: { en: manual } } } };
  const store = new ContentTranslationStore(temporary(t), createTranslator(async request => { calls.push(request); return { text: request.text, sourceLanguage: 'ko' }; }));
  await store.register([item]);
  assert.equal(store.catalog().entries[item.key].fields.description.translations.en, manual);
  assert.deepEqual(calls.map(({ targetLanguage }) => targetLanguage), ['ja']);
  item.fields.description.translations!.en = manual.replace('{user}', '{someoneElse}');
  await store.register([item]);
  assert.equal(calls.at(-1)?.targetLanguage, 'en');
  assert.notEqual(store.catalog().entries[item.key].fields.description.translations.en, item.fields.description.translations!.en);
});

test('ASCII terms respect identifier boundaries instead of masking parts of longer words', async t => {
  const calls: TranslationRequest[] = [];
  const source = 'start started restart starter start_value $start timer timers timer_value';
  const item = document(source); item.protectedTerms = ['start'];
  const store = new ContentTranslationStore(temporary(t), createTranslator(async request => { calls.push(request); return { text: request.text, sourceLanguage: 'en' }; }), { glossary: { timer: { ko: '타이머' } } });
  await store.register([item]);
  const koreanRequest = calls.find(({ targetLanguage }) => targetLanguage === 'ko')!;
  for (const word of ['started', 'restart', 'starter', 'start_value', '$start', 'timers', 'timer_value']) assert.ok(koreanRequest.text.includes(word), word);
  assert.equal(store.catalog().entries[item.key].fields.description.translations.ko, 'start started restart starter start_value $start 타이머 timers timer_value');
});

test('missing configuration and provider failure preserve sources without persisting failed results', async t => {
  const directory = temporary(t), offline = new ContentTranslationStore(directory);
  await offline.register([document()]);
  assert.equal(offline.catalog().pending, false);
  assert.deepEqual(offline.catalog().entries[document().key].fields.description.translations, { en: 'A reusable button.' });
  const failed = new ContentTranslationStore(directory, createTranslator(async () => { throw new Error('private provider message'); }));
  await failed.register([document()]);
  assert.deepEqual(fs.readdirSync(directory), []);
  assert.equal(JSON.stringify(failed.catalog()).includes('private provider'), false);
  const recovered = new ContentTranslationStore(directory, createTranslator(prefixModel));
  await recovered.register([document()]);
  assert.equal(fs.readdirSync(directory).length, 2);
  assert.equal(recovered.catalog().entries[document().key].fields.description.translations.ko, 'ko: A reusable button.');
});

test('oversized or malformed cache records are ignored and repaired without publishing their contents', async t => {
  const directory = temporary(t);
  await new ContentTranslationStore(directory, createTranslator(prefixModel)).register([document()]);
  const files = fs.readdirSync(directory);
  fs.writeFileSync(path.join(directory, files[0]), 'x'.repeat(512 * 1024 + 1));
  fs.writeFileSync(path.join(directory, files[1]), JSON.stringify({ schema: 1, key: files[1].slice(0, -5), text: 'x'.repeat(128 * 1024 + 1) }));
  let calls = 0;
  const store = new ContentTranslationStore(directory, createTranslator(async request => { calls++; return { text: `${request.targetLanguage}: ${request.text}`, sourceLanguage: 'en' }; }));
  const pending = store.register([document()]);
  assert.equal(store.catalog().entries[document().key].fields.description.translations.ko, undefined);
  await pending;
  assert.equal(calls, 2);
  assert.equal(store.catalog().entries[document().key].fields.description.translations.ko, 'ko: A reusable button.');
  assert.ok(fs.readdirSync(directory).every(file => fs.statSync(path.join(directory, file)).size < 1024));
});

test('invalid or oversized registrations preserve the previously published catalog', async t => {
  const store = new ContentTranslationStore(temporary(t));
  await store.register([document()]);
  const previous = store.catalog();
  const tooMany = document(); tooMany.fields = Object.fromEntries(Array.from({ length: 513 }, (_, index) => [`field${index}`, { source: 'Text' }]));
  assert.throws(() => store.register([tooMany]), /field limit/);
  assert.throws(() => store.register([document('x'.repeat(16385))]), /Invalid content translation field/);
  assert.throws(() => store.register(Array.from({ length: 4097 }, () => document())), /Invalid content translation documents/);
  assert.deepEqual(store.catalog(), previous);
});

test('large validated system contracts support automatic identifiers plus all supplemental metadata fields', async t => {
  const item = document();
  item.protectedTerms = Array.from({ length: 1300 }, (_, index) => `contract-id-${index}`);
  item.fields = Object.fromEntries(Array.from({ length: 258 }, (_, index) => [`field-${index}`, { source: `Text ${index}`, translations: { ja: `日本語 ${index}`, ko: `한국어 ${index}` } }]));
  assert.doesNotThrow(() => validateContentDocuments([item]));
  const store = new ContentTranslationStore(temporary(t));
  await store.register([item]);
  assert.equal(Object.keys(store.catalog().entries[item.key].fields).length, 258);
  assert.equal(store.catalog().entries[item.key].fields['field-257'].translations.ko, '한국어 257');
});

test('pure effective-document validation catches aggregate source and field limits before registration', () => {
  const fields = Object.fromEntries(Array.from({ length: 512 }, (_, index) => [`field-${index}`, { source: 'x'.repeat(2048) }]));
  const oversized = Array.from({ length: 9 }, (_, index) => ({ ...document(), key: `item/large-${index}`, fields }));
  assert.throws(() => validateContentDocuments(oversized), /source limit/);
  const manyFields = Object.fromEntries(Array.from({ length: 512 }, (_, index) => [`field-${index}`, { source: 'x' }]));
  assert.throws(() => validateContentDocuments(Array.from({ length: 33 }, (_, index) => ({ ...document(), key: `item/fields-${index}`, fields: manyFields }))), /Invalid content translation field/);
  assert.throws(() => validateContentDocuments([{ ...document(), protectedTerms: Array(2049).fill('term') }]), /Invalid content translation document/);
  assert.throws(() => validateContentDocuments([{ ...document(), fields: { title: { source: 'Title', translations: { fr: 'Titre' } } } }]), /Invalid content manual translation/);
});

test('adding identifiers absent from metadata does not retranslate unchanged fields', async t => {
  const directory = temporary(t); let calls = 0;
  const store = new ContentTranslationStore(directory, createTranslator(async request => { calls++; return { text: request.text, sourceLanguage: 'en' }; }));
  const first = document('start the countdown; started remains ordinary prose.'); first.protectedTerms = ['start'];
  await store.register([first]);
  assert.equal(calls, 2);
  const updated = structuredClone(first); updated.key = 'system/button/1.0.1'; updated.protectedTerms!.push('new-port', 'started-key', 'unused-value');
  await store.register([updated]);
  assert.equal(calls, 2);
  const restarted = new ContentTranslationStore(directory, createTranslator(async request => { calls++; return { text: request.text, sourceLanguage: 'en' }; }));
  await restarted.register([updated]);
  assert.equal(calls, 2);
});

test('URLs, code, placeholders and protected names survive while glossary terms are consistent', async t => {
  const source = 'Tonarium timer uses {duration}, {{user}}, ${event.id} and %1$s. See https://example.com/help?a=1.\nUse `timer.start()` and:\n```ts\nconst timer = "source-code";\n```';
  const requests: TranslationRequest[] = [];
  const store = new ContentTranslationStore(temporary(t), createTranslator(async request => {
    requests.push(request); return { text: `${request.targetLanguage}: ${request.text}`, sourceLanguage: 'en' };
  }), { glossary: { timer: { ja: 'タイマー', ko: '타이머' } } });
  const item = document(source); item.protectedTerms = ['Tonarium'];
  await store.register([item]);
  const translated = store.catalog().entries[item.key].fields.description.translations.ko!;
  for (const protectedText of ['Tonarium', '{duration}', '{{user}}', '${event.id}', '%1$s', 'https://example.com/help?a=1.', '`timer.start()`', '```ts\nconst timer = "source-code";\n```']) assert.ok(translated.includes(protectedText), protectedText);
  assert.ok(translated.includes('타이머 uses'));
  assert.ok(!translated.includes('__TONARIUM_'));
  assert.ok(requests.every(request => request.context?.includes('A reusable interaction system.')));
  assert.ok(requests.every(request => !request.text.includes('timer.start()')));
  const badDirectory = temporary(t), invalid = new ContentTranslationStore(badDirectory, createTranslator(async ({ text }) => ({ text: text.replace(/__TONARIUM_[a-f0-9]+_\d+__/g, 'changed'), sourceLanguage: 'en' })));
  await invalid.register([item]);
  assert.equal(invalid.catalog().entries[item.key].fields.description.translations.ko, undefined);
  assert.deepEqual(fs.readdirSync(badDirectory), []);
});

test('long descriptions use bounded chunks and restore protected code across boundaries', async t => {
  const calls: TranslationRequest[] = [];
  const source = ('A long description explains the behavior. '.repeat(100)) + '\n`systemId: timer` https://example.com/guide {value}';
  assert.ok(source.length > 4096);
  const item = document(source), store = new ContentTranslationStore(temporary(t), createTranslator(async request => {
    calls.push(request); return { text: request.text, sourceLanguage: 'en' };
  }));
  await store.register([item]);
  assert.ok(calls.length > 2);
  assert.ok(calls.every(({ text }) => text.length <= 2000));
  assert.equal(store.catalog().entries[item.key].fields.description.translations.ko, source);
});

test('provider/profile and terminology changes invalidate successful cached translations', async t => {
  const directory = temporary(t); let calls = 0;
  const translate = createTranslator(async request => { calls++; return { text: `${request.targetLanguage}: ${request.text}`, sourceLanguage: 'en' }; });
  await new ContentTranslationStore(directory, translate, { profile: 'first', glossary: { button: { ko: '버튼' } } }).register([document()]);
  assert.equal(calls, 2);
  await new ContentTranslationStore(directory, translate, { profile: 'second', glossary: { button: { ko: '버튼' } } }).register([document()]);
  assert.equal(calls, 4);
  await new ContentTranslationStore(directory, translate, { profile: 'second', glossary: { button: { ko: '단추' } } }).register([document()]);
  assert.equal(calls, 6);
});

test('work is bounded and superseded registrations cannot publish stale fields', async t => {
  const directory = temporary(t), requests: { request: TranslationRequest; done: (value: unknown) => void }[] = [];
  let active = 0, maximum = 0;
  const translate = createTranslator(request => {
    active++; maximum = Math.max(maximum, active);
    return new Promise(resolve => requests.push({ request, done: value => { active--; resolve(value); } }));
  }, 1000);
  const first = document('Old description.'); first.fields.title = { source: 'Old title.' }; first.fields.help = { source: 'Old help.' };
  const store = new ContentTranslationStore(directory, translate), old = store.register([first]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 2);
  const latest = document('Current description.'), current = store.register([latest]);
  for (const request of requests.slice(0, 2)) request.done({ text: request.request.text, sourceLanguage: 'en' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 4);
  for (const request of requests.slice(2)) request.done({ text: `current: ${request.request.text}`, sourceLanguage: 'en' });
  await Promise.all([old, current]);
  assert.equal(maximum, 2);
  assert.equal(store.catalog().pending, false);
  assert.deepEqual(Object.keys(store.catalog().entries[latest.key].fields), ['description']);
  assert.equal(store.catalog().entries[latest.key].fields.description.translations.ko, 'current: Current description.');
  assert.equal(JSON.stringify(store.catalog()).includes('Old description.'), false);
});

test('server context reaches the model while public chat requests cannot inject context', async t => {
  let upstream: any;
  const request: typeof fetch = async (_, init) => {
    upstream = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ text: '번역', sourceLanguage: 'en' }) } }] }), { status: 200 });
  };
  await createTranslator(createOpenAITranslationModel('test-fixture', 'test-model', request))({ text: 'A title', targetLanguage: 'ko', context: 'A game item title.' });
  assert.equal(JSON.parse(upstream.messages[1].content).context, 'A game item title.');
  const inputs: TranslationRequest[] = [];
  const server = http.createServer(createTranslationHandler(createTranslator(async input => { inputs.push(input); return { text: input.text, sourceLanguage: 'en' }; })));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const response = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}`, { method: 'POST', body: JSON.stringify({ text: 'Hello', targetLanguage: 'ko', context: 'Attacker context' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(inputs, [{ text: 'Hello', targetLanguage: 'ko' }]);
});
