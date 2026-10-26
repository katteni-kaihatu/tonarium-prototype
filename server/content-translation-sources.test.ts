import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEM_INFO } from '../shared/items.ts';
import { ITEM_VARIANTS } from '../shared/item-variants.ts';
import { ITEM_USAGE } from '../shared/item-usage.ts';
import { MARKET_PRODUCTS } from '../shared/market.ts';
import { WORLDS } from '../shared/worlds.ts';
import { validateSystemManifest } from '../shared/systems.ts';
import type { SystemCatalog, SystemManifest } from '../shared/system-types.ts';
import { collectContentDocuments, readContentMetadata, validateContentMetadata, type ContentMetadata } from './content-translation-sources.ts';
import { validateSystemSubmission } from './system-catalog.ts';
import { ContentTranslationStore } from './content-translations.ts';
import { createTranslator } from './translation.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const emptyMetadata = (): ContentMetadata => ({ schema: 1, glossary: {}, entries: {} });
const emptyCatalog = (): SystemCatalog => ({ schema: 1, commit: 'a'.repeat(40), entries: [] });
const temporary = (t: { after(fn: () => void): void }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tonarium-content-sources-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
};
const sampleManifest = (): SystemManifest => ({
  schema: 1, sdk: 'tonarium-systems/1', id: 'test-timer', version: '1.0.0',
  title: '시험 타이머', description: 'duration만큼 실행한 뒤 finished 이벤트를 전달합니다.', license: 'MIT', credits: ['Tonarium'],
  targets: { display: { capabilities: ['text'], required: false } },
  config: { duration: { type: 'number', default: 1.25, min: 0.001, max: 3600 } },
  state: { remaining: { type: 'number', default: 1.25, min: 0, max: 3600 } },
  inputs: { start: { payload: {} }, finished: { payload: { recipient: 'user' } } }, outputs: { finished: { payload: { user: 'user' } } },
  handlers: { start: [
    { op: 'set', field: 'remaining', value: { config: 'duration' } },
    { op: 'text', target: 'display', value: { calc: 'clock', args: [{ state: 'remaining' }] } },
    { op: 'emit', port: 'finished', payload: { user: { actor: true } } },
  ] },
});
const catalogFor = (manifest: SystemManifest): SystemCatalog => ({ ...emptyCatalog(), entries: [{ id: manifest.id, version: manifest.version, integrity: 'b'.repeat(64), manifest }] });
const documentAt = (documents: ReturnType<typeof collectContentDocuments>, key: string) => {
  const document = documents.find(entry => entry.key === key);
  assert.ok(document, `missing content document: ${key}`);
  return document;
};

test('tracked registration metadata validates and its system annotations match published originals', () => {
  const metadata = readContentMetadata(root);
  assert.equal(metadata.schema, 1);
  assert.ok(Object.keys(metadata.entries).length > 0);
  assert.doesNotThrow(() => validateContentMetadata(metadata));
  const catalog = validateSystemSubmission(root).catalog;
  const before = JSON.stringify(catalog);
  const documents = collectContentDocuments(catalog, metadata);
  for (const entry of catalog.entries) {
    const document = documentAt(documents, `system/${entry.id}/${entry.version}`);
    assert.equal(document.fields.title.source, entry.manifest.title);
    assert.equal(document.fields.description.source, entry.manifest.description);
  }
  assert.equal(JSON.stringify(catalog), before);
});

test('all registered items, worlds and marketplace categories are discovered without runtime or purchase data', () => {
  const documents = collectContentDocuments(emptyCatalog(), emptyMetadata());
  assert.equal(new Set(documents.map(document => document.key)).size, documents.length);
  assert.deepEqual(documents.filter(document => document.key.startsWith('item/')).map(document => document.key).sort(), [...Object.keys(ITEM_INFO), ...Object.keys(ITEM_VARIANTS)].map(id => `item/${id}`).sort());
  assert.deepEqual(documents.filter(document => document.key.startsWith('world/')).map(document => document.key).sort(), Object.keys(WORLDS).map(id => `world/${id}`).sort());
  assert.equal(Object.keys(ITEM_USAGE).length, 8);
  for (const [id, info] of Object.entries(ITEM_INFO)) {
    const fields = documentAt(documents, `item/${id}`).fields;
    const usage = ITEM_USAGE[id as keyof typeof ITEM_USAGE];
    assert.deepEqual(Object.keys(fields).sort(), ['name', 'desc', 'genre', ...(usage ? ['usage'] : [])].sort());
    assert.equal(fields.name.source, info.name);
    assert.equal(fields.desc.source, info.desc);
    assert.equal(fields.genre.source, info.genre);
    if (usage) assert.equal(fields.usage.source, usage);
  }
  for (const [id, info] of Object.entries(WORLDS)) {
    assert.deepEqual(documentAt(documents, `world/${id}`).fields, { name: { source: info.name }, desc: { source: info.desc } });
  }
  for (const { id, info, usage } of Object.values(ITEM_VARIANTS)) {
    assert.deepEqual(documentAt(documents, `item/${id}`).fields, {
      name: { source: info.name }, desc: { source: info.desc }, genre: { source: info.genre }, usage: { source: usage },
    });
  }
  const products = MARKET_PRODUCTS;
  assert.deepEqual(documents.filter(document => document.key.startsWith('product/')).map(document => document.key).sort(), products.map(product => `product/${product.id}`).sort());
  for (const product of products) {
    const document = documentAt(documents, `product/${product.id}`);
    assert.deepEqual(document.fields, {
      name: { source: product.name }, description: { source: product.description },
      ...('text' in product ? { text: { source: product.text } } : {}),
    });
    assert.equal(document.kind, product.category === 'worlds' ? 'world' : 'item');
    for (const runtimeField of ['price', 'creator', 'color', 'ink', 'content', 'solids', 'extent', 'game', 'state']) assert.ok(!(runtimeField in document.fields));
  }
});

test('sound and emote metadata accepts manual corrections without changing product identity or behavior', () => {
  const metadata = emptyMetadata(), original = structuredClone(MARKET_PRODUCTS);
  const products = MARKET_PRODUCTS.filter(product => product.category === 'sounds' || product.category === 'emotes');
  assert.ok(products.length > 0);
  for (const product of products) metadata.entries[`product/${product.id}`] = {
    sourceLanguage: 'ja', fields: { name: { source: product.name, translations: { ko: `수정한 ${product.id}` } } },
  };
  const documents = collectContentDocuments(emptyCatalog(), metadata);
  for (const product of products) {
    const document = documentAt(documents, `product/${product.id}`);
    assert.deepEqual(document.fields.name, metadata.entries[document.key].fields.name);
    assert.equal(document.fields.description.source, product.description);
    assert.equal(document.sourceLanguage, 'ja');
  }
  assert.deepEqual(MARKET_PRODUCTS, original);
});

test('new sound and emote registrations generate, persist and update translations without handwritten entries', async t => {
  const sound = MARKET_PRODUCTS.find(product => product.category === 'sounds'), emote = MARKET_PRODUCTS.find(product => product.category === 'emotes');
  assert.ok(sound && emote);
  const added = [
    { ...sound, id: 'uploaded-chime', name: '追加のチャイム', description: '登録すると近くの人に聞こえるチャイムです。' },
    { ...emote, id: 'uploaded-greeting', name: '追加のあいさつ', description: '登録すると使えるあいさつの動きです。' },
  ];
  const length = MARKET_PRODUCTS.length, keys = new Set(added.map(product => `product/${product.id}`)), directory = temporary(t);
  MARKET_PRODUCTS.push(...added);
  t.after(() => { MARKET_PRODUCTS.splice(length); });
  const collect = () => collectContentDocuments(emptyCatalog(), emptyMetadata()).filter(document => keys.has(document.key));
  let calls = 0;
  const translate = createTranslator(async ({ text, targetLanguage }) => {
    calls++; return { text: targetLanguage === 'ja' ? text : `${targetLanguage}: ${text}`, sourceLanguage: 'ja' };
  });
  const store = new ContentTranslationStore(directory, translate), documents = collect();
  assert.equal(documents.length, 2);
  const pending = store.register(documents);
  assert.equal(store.catalog().pending, true);
  await pending;
  assert.equal(calls, 12);
  for (const product of added) {
    const fields = store.catalog().entries[`product/${product.id}`].fields;
    for (const field of ['name', 'description'] as const) {
      assert.equal(fields[field].source, product[field]);
      assert.deepEqual(fields[field].translations, { ja: product[field], en: `en: ${product[field]}`, ko: `ko: ${product[field]}` });
    }
  }
  const before = structuredClone(added);
  assert.deepEqual(MARKET_PRODUCTS.slice(length), before);
  added[0].description = '新しく更新したチャイムの説明です。';
  const changed = store.register(collect());
  assert.equal(store.catalog().entries['product/uploaded-chime'].fields.description.translations.ko, undefined);
  await changed;
  assert.equal(calls, 15, 'only the changed source field is translated again');
  const restarted = new ContentTranslationStore(directory, translate);
  await restarted.register(collect());
  assert.equal(calls, 15, 'saved translations are reused after restarting');
  assert.deepEqual(restarted.catalog(), store.catalog());
  for (const [index, product] of added.entries()) for (const field of ['id', 'category', 'content', 'creator', 'price', 'mark', 'color', 'ink'] as const) assert.equal(product[field], before[index][field]);
});

test('manual overrides require the exact current source and do not rewrite a changed original', () => {
  const manifest = sampleManifest(), metadata = emptyMetadata();
  metadata.entries['item/note'] = {
    sourceLanguage: 'ja', protectedTerms: ['Tonarium', 'note'], fields: {
      name: { source: ITEM_INFO.note.name, translations: { ko: '수정한 메모 이름' } },
      desc: { source: '이전 설명', translations: { ko: '오래된 번역' } },
    },
  };
  metadata.entries['world/cafe'] = { fields: { name: { source: '이전 월드 이름', translations: { en: 'Outdated world' } } } };
  metadata.entries['system/test-timer/1.0.0'] = { fields: { title: { source: '이전 시스템 이름', translations: { en: 'Outdated system' } } } };
  const before = structuredClone(metadata), documents = collectContentDocuments(catalogFor(manifest), metadata);
  const note = documentAt(documents, 'item/note');
  assert.deepEqual(note.fields.name, metadata.entries['item/note'].fields.name);
  assert.deepEqual(note.fields.desc, { source: ITEM_INFO.note.desc });
  assert.equal(note.sourceLanguage, 'ja');
  assert.deepEqual(note.protectedTerms, ['Tonarium', 'note']);
  assert.deepEqual(documentAt(documents, 'world/cafe').fields.name, { source: WORLDS.cafe.name });
  assert.deepEqual(documentAt(documents, 'system/test-timer/1.0.0').fields.title, { source: manifest.title });
  assert.deepEqual(metadata, before);
  note.fields.name.translations!.ko = '호출자가 바꾼 값';
  assert.equal(metadata.entries['item/note'].fields.name.translations!.ko, '수정한 메모 이름');
});

test('new system display annotations and world instructions remain separate from immutable code and defaults', t => {
  const directory = temporary(t), manifest = sampleManifest();
  validateSystemManifest(manifest);
  const file = path.join(directory, 'shared-systems', manifest.id, manifest.version, 'system.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const original = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(file, original);
  const catalog = validateSystemSubmission(directory).catalog, before = structuredClone(catalog), metadata = emptyMetadata();
  metadata.entries['system/test-timer/1.0.0'] = {
    sourceLanguage: 'ko', protectedTerms: ['DemoTimer'], fields: {
      title: { source: manifest.title, translations: { en: 'Test timer' } },
      usage: { source: 'display에 표시판을 연결하고 start를 실행하세요.', translations: { en: 'Connect a display to display and run start.' } },
      'targets.display.label': { source: '표시판' },
      'config.duration.description': { source: '실행할 시간(초)' },
      'state.remaining.label': { source: '남은 시간' },
      'inputs.start.label': { source: '시작' },
      'outputs.finished.description': { source: '타이머가 완료되면 발생합니다.' },
    },
  };
  metadata.entries['world/cafe'] = { fields: { 'instructions.welcome': { source: '테이블에 앉아 이야기를 나누세요.' } } };
  const documents = collectContentDocuments(catalog, metadata), document = documentAt(documents, 'system/test-timer/1.0.0');
  assert.equal(document.sourceLanguage, 'ko');
  assert.deepEqual(document.fields, { description: { source: manifest.description }, ...metadata.entries[document.key].fields });
  for (const identifier of ['Tonarium', manifest.id, 'display', 'duration', 'remaining', 'start', 'finished', 'recipient', 'user', 'DemoTimer']) assert.ok(document.protectedTerms?.includes(identifier), identifier);
  assert.equal(documentAt(documents, 'world/cafe').fields['instructions.welcome'].source, '테이블에 앉아 이야기를 나누세요.');
  assert.deepEqual(catalog, before);
  assert.deepEqual(fs.readFileSync(file), original);
  assert.equal(catalog.entries[0].manifest.config.duration.default, 1.25);
  assert.deepEqual(catalog.entries[0].manifest.handlers, manifest.handlers);
  for (const executableField of ['id', 'version', 'sdk', 'handlers', 'interaction', 'migrations', 'config.duration.default']) assert.ok(!(executableField in document.fields));
});

test('display metadata rejects executable annotations, unknown bindings and unsupported languages or oversized values', () => {
  for (const field of ['handlers.start.label', 'config.duration.default', 'config.unknown.label', 'targets.unknown.description', 'state.unknown.label', 'inputs.unknown.label', 'outputs.finished.payload', 'targets.display.label.extra']) {
    const metadata = emptyMetadata();
    metadata.entries['system/test-timer/1.0.0'] = { fields: { [field]: { source: '설명' } } };
    assert.throws(() => collectContentDocuments(catalogFor(sampleManifest()), metadata), /unknown system display field/, field);
  }
  for (const [key, field] of [['world/cafe', 'solids'], ['item/note', 'price'], ['product/bike', 'creator']]) {
    const metadata = emptyMetadata();
    metadata.entries[key] = { fields: { [field]: { source: '설명' } } };
    assert.throws(() => collectContentDocuments(emptyCatalog(), metadata), /unknown content display field/, `${key}/${field}`);
  }
  for (const key of ['item/note-typo', 'world/unknown', 'product/missing', 'system/test-timer/9.9.9']) {
    const metadata = emptyMetadata();
    metadata.entries[key] = { fields: { usage: { source: '등록되지 않은 콘텐츠' } } };
    assert.throws(() => collectContentDocuments(catalogFor(sampleManifest()), metadata), /unknown content registration/, key);
  }
  const invalid: [string, unknown][] = [
    ['source language', { ...emptyMetadata(), entries: { 'item/note': { sourceLanguage: 'fr', fields: {} } } }],
    ['manual language', { ...emptyMetadata(), entries: { 'item/note': { fields: { name: { source: '名前', translations: { fr: 'Nom' } } } } } }],
    ['glossary language', { ...emptyMetadata(), glossary: { world: { fr: 'monde' } } }],
    ['source length', { ...emptyMetadata(), entries: { 'item/note': { fields: { usage: { source: 'x'.repeat(4097) } } } } }],
    ['translation length', { ...emptyMetadata(), entries: { 'item/note': { fields: { name: { source: '名前', translations: { en: 'x'.repeat(12001) } } } } } }],
    ['protected terms', { ...emptyMetadata(), entries: { 'item/note': { protectedTerms: Array(129).fill('term'), fields: {} } } }],
    ['fields', { ...emptyMetadata(), entries: { 'item/note': { fields: Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`field${i}`, { source: '説明' }])) } } }],
    ['entries', { ...emptyMetadata(), entries: Object.fromEntries(Array.from({ length: 4097 }, (_, i) => [`item/item${i}`, { fields: {} }])) }],
    ['glossary', { ...emptyMetadata(), glossary: Object.fromEntries(Array.from({ length: 129 }, (_, i) => [`term${i}`, { en: 'term' }])) }],
  ];
  for (const [label, metadata] of invalid) assert.throws(() => validateContentMetadata(metadata), Error, label);
});

test('metadata file loading isolates missing files and rejects malformed or oversized registration data', t => {
  const directory = temporary(t), file = path.join(directory, 'content-locales', 'metadata.json');
  assert.deepEqual(readContentMetadata(directory), emptyMetadata());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(emptyMetadata()));
  assert.deepEqual(readContentMetadata(directory), emptyMetadata());
  fs.writeFileSync(file, '{');
  assert.throws(() => readContentMetadata(directory), SyntaxError);
  fs.writeFileSync(file, Buffer.alloc(4 * 1024 * 1024 + 1, 32));
  assert.throws(() => readContentMetadata(directory), /metadata byte limit/);
});

test('logic-only system releases retain translation context and sources independently of version and runtime changes', () => {
  const original = sampleManifest(), updated = structuredClone(original);
  updated.version = '1.0.1';
  updated.config.duration.default = 2.5;
  updated.handlers.start[0] = { op: 'set', field: 'remaining', value: 2.5 };
  validateSystemManifest(original);
  validateSystemManifest(updated);
  const catalog = catalogFor(original);
  catalog.entries.push({ id: updated.id, version: updated.version, integrity: 'c'.repeat(64), manifest: updated });
  const before = structuredClone(catalog), documents = collectContentDocuments(catalog, emptyMetadata());
  const first = documentAt(documents, 'system/test-timer/1.0.0'), next = documentAt(documents, 'system/test-timer/1.0.1');
  assert.equal(first.context, next.context);
  assert.deepEqual(first.fields, next.fields);
  assert.deepEqual(first.protectedTerms, next.protectedTerms);
  assert.notEqual(first.key, next.key);
  assert.deepEqual(catalog, before);
});
