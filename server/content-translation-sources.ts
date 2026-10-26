import fs from 'node:fs';
import path from 'node:path';
import { ITEM_INFO } from '../shared/items.ts';
import { ITEM_VARIANTS } from '../shared/item-variants.ts';
import { ITEM_USAGE } from '../shared/item-usage.ts';
import { WORLDS } from '../shared/worlds.ts';
import { MARKET_PRODUCTS } from '../shared/market.ts';
import type { SystemCatalog } from '../shared/system-types.ts';
import { isTranslationLanguage, type TranslationLanguage } from '../shared/translation.ts';
import type { ContentDocument, ContentSourceField } from '../shared/content-translations.ts';
import { validateContentDocuments } from './content-translations.ts';

export interface ContentMetadata {
  schema: 1;
  glossary: Record<string, Partial<Record<TranslationLanguage, string>>>;
  entries: Record<string, { sourceLanguage?: TranslationLanguage; protectedTerms?: string[]; fields: Record<string, ContentSourceField> }>;
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const check = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
const text = (value: unknown, maximum = 4096): value is string => typeof value === 'string' && !!value.trim() && value.length <= maximum;
const documentKey = /^(?:(?:item|world|product)\/[A-Za-z][A-Za-z0-9-]{0,63}|system\/[a-z][a-z0-9-]{0,63}\/\d+\.\d+\.\d+)$/;

export function validateContentMetadata(value: unknown): asserts value is ContentMetadata {
  check(record(value), 'invalid content metadata');
  const metadata = value as ContentMetadata;
  check(metadata.schema === 1 && record(metadata.glossary) && record(metadata.entries), 'invalid content metadata schema');
  check(Object.keys(metadata.glossary).length <= 128 && Object.keys(metadata.entries).length <= 4096, 'content metadata limit');
  for (const [term, translations] of Object.entries(metadata.glossary)) {
    check(text(term, 100) && record(translations), 'invalid glossary term');
    for (const [language, translation] of Object.entries(translations)) check(isTranslationLanguage(language) && text(translation, 100), 'invalid glossary translation');
  }
  for (const [key, entry] of Object.entries(metadata.entries)) {
    check(documentKey.test(key) && record(entry) && record(entry.fields), 'invalid content metadata entry');
    check(entry.sourceLanguage === undefined || isTranslationLanguage(entry.sourceLanguage), 'invalid content source language');
    check(entry.protectedTerms === undefined || (Array.isArray(entry.protectedTerms) && entry.protectedTerms.length <= 128 && entry.protectedTerms.every(term => text(term, 100))), 'invalid protected terms');
    check(Object.keys(entry.fields).length <= 256, 'content field limit');
    for (const [field, definition] of Object.entries(entry.fields)) {
      check(/^[A-Za-z][A-Za-z0-9.-]{0,127}$/.test(field) && record(definition) && text(definition.source), 'invalid content field');
      check(definition.translations === undefined || record(definition.translations), 'invalid manual translations');
      for (const [language, translation] of Object.entries(definition.translations ?? {})) check(isTranslationLanguage(language) && text(translation, 12000), 'invalid manual translation');
    }
  }
}

export function readContentMetadata(root: string): ContentMetadata {
  const file = path.join(root, 'content-locales', 'metadata.json');
  if (!fs.existsSync(file)) return { schema: 1, glossary: {}, entries: {} };
  check(fs.statSync(file).size <= 4 * 1024 * 1024, 'content metadata byte limit');
  const metadata: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  validateContentMetadata(metadata);
  return metadata;
}

export function collectContentDocuments(catalog: SystemCatalog, metadata: ContentMetadata): ContentDocument[] {
  validateContentMetadata(metadata);
  const documents: ContentDocument[] = [];
  const native = (key: string, kind: ContentDocument['kind'], values: Record<string, string | undefined>, protectedTerms: string[] = []): ContentDocument => ({
    key, kind, context: `Tonarium ${kind} ${key.replace(/\/\d+\.\d+\.\d+$/, '')}. Translate only human-readable registration metadata.`,
    protectedTerms: ['Tonarium', ...protectedTerms],
    fields: Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && !!entry[1].trim()).map(([field, source]) => [field, { source }])),
  });
  for (const [id, info] of Object.entries(ITEM_INFO)) documents.push(native(`item/${id}`, 'item', { name: info.name, desc: info.desc, genre: info.genre, usage: ITEM_USAGE[id as keyof typeof ITEM_USAGE] }));
  for (const { id, info, usage } of Object.values(ITEM_VARIANTS)) documents.push(native(`item/${id}`, 'item', { name: info.name, desc: info.desc, genre: info.genre, usage }));
  for (const [id, info] of Object.entries(WORLDS)) documents.push(native(`world/${id}`, 'world', { name: info.name, desc: info.desc }));
  for (const product of MARKET_PRODUCTS) {
    documents.push(native(`product/${product.id}`, product.category === 'worlds' ? 'world' : 'item', { name: product.name, description: product.description, ...('text' in product ? { text: product.text } : {}) }));
  }
  for (const { manifest } of catalog.entries) {
    const ids = [manifest.id, ...Object.keys(manifest.targets), ...Object.keys(manifest.config), ...Object.keys(manifest.state), ...Object.keys(manifest.inputs), ...Object.keys(manifest.outputs), ...[...Object.values(manifest.inputs), ...Object.values(manifest.outputs)].flatMap(port => Object.keys(port.payload))];
    const document = native(`system/${manifest.id}/${manifest.version}`, 'system', { title: manifest.title, description: manifest.description }, ids);
    const definitions = metadata.entries[document.key];
    for (const field of Object.keys(definitions?.fields ?? {})) {
      const parts = field.split('.');
      const section = parts[0];
      check(field === 'title' || field === 'description' || field === 'usage' || (
        parts.length === 3 && ['targets', 'config', 'state', 'inputs', 'outputs'].includes(section) && ['label', 'description'].includes(parts[2]) &&
        Object.hasOwn(manifest[section as 'targets' | 'config' | 'state' | 'inputs' | 'outputs'], parts[1])
      ), `unknown system display field: ${document.key}/${field}`);
    }
    documents.push(document);
  }
  const registered = new Set(documents.map(document => document.key));
  for (const key of Object.keys(metadata.entries)) check(registered.has(key), `unknown content registration: ${key}`);
  for (const document of documents) {
    const entry = metadata.entries[document.key];
    if (!entry) continue;
    document.sourceLanguage = entry.sourceLanguage;
    document.protectedTerms = [...new Set([...document.protectedTerms ?? [], ...entry.protectedTerms ?? []])];
    for (const [field, definition] of Object.entries(entry.fields)) {
      const original = document.fields[field];
      if (original) {
        // 原文が変わった手動訳を新しい説明へ流用しない。
        if (original.source === definition.source) document.fields[field] = structuredClone(definition);
      } else if (field === 'usage' || (document.kind === 'world' && /^instructions\.[A-Za-z][A-Za-z0-9-]*$/.test(field)) || document.kind === 'system') {
        document.fields[field] = structuredClone(definition);
      } else throw new Error(`unknown content display field: ${document.key}/${field}`);
    }
  }
  validateContentDocuments(documents);
  return documents;
}
