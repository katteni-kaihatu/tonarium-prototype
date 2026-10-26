import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ContentDocument, ContentTranslationCatalog } from '../shared/content-translations.ts';
import { TRANSLATION_LANGUAGES, TRANSLATION_TEXT_MAX, isTranslationLanguage, type TranslationLanguage } from '../shared/translation.ts';
import type { createTranslator } from './translation.ts';
import { atomicJSON, readRegular } from './shared-catalog.ts';

type Glossary = Record<string, Partial<Record<TranslationLanguage, string>>>;
interface MaskedText { text: string; tokens: { token: string; value: string }[] }
interface TranslationJob { key: string; source: string; masked: MaskedText; targetLanguage: TranslationLanguage; context: string }
interface PendingJob { job: TranslationJob; generations: Set<number>; resolve: (value: string | undefined) => void; promise: Promise<string | undefined> }
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const MAX_SOURCE = 16384, MAX_RESULT = 128 * 1024;
const tokenPattern = /__TONARIUM_[a-f0-9]+_\d+__/g;
const validText = (value: unknown, max = MAX_RESULT): value is string => typeof value === 'string' && !!value.trim() && value.length <= max;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const occurrences = (text: string, value: string) => text.split(value).length - 1;
const stableJSON = (value: unknown) => JSON.stringify(value, (_, child: unknown) => record(child) ? Object.fromEntries(Object.keys(child).sort().map(key => [key, child[key]])) : child);
const identifierCharacter = (value: string | undefined) => value !== undefined && /[A-Za-z0-9_$]/.test(value);

function* identifierPositions(source: string, term: string) {
  for (let index = source.indexOf(term); index !== -1; index = source.indexOf(term, index + term.length)) {
    if ((identifierCharacter(term[0]) && identifierCharacter(source[index - 1])) || (identifierCharacter(term.at(-1)) && identifierCharacter(source[index + term.length]))) continue;
    yield index;
  }
}

export function validateContentDocuments(value: unknown): asserts value is ContentDocument[] {
  if (!Array.isArray(value) || value.length > 4096) throw new Error('Invalid content translation documents');
  const keys = new Set<string>();
  let fieldCount = 0, sourceLength = 0;
  for (const document of value) {
    if (!record(document) || !validText(document.key, 256) || keys.has(document.key) || !['item', 'world', 'system'].includes(document.kind as string) || !record(document.fields)
      || (document.sourceLanguage !== undefined && !isTranslationLanguage(document.sourceLanguage)) || (document.context !== undefined && (typeof document.context !== 'string' || document.context.length > 8192))
      || (document.protectedTerms !== undefined && (!Array.isArray(document.protectedTerms) || document.protectedTerms.length > 2048 || document.protectedTerms.some(term => !validText(term, 512))))) throw new Error('Invalid content translation document');
    keys.add(document.key);
    if (Object.keys(document.fields).length > 512) throw new Error('Content translation field limit');
    for (const [name, field] of Object.entries(document.fields)) {
      if (++fieldCount > 16384 || !validText(name, 256) || !record(field) || typeof field.source !== 'string' || field.source.length > MAX_SOURCE || (field.translations !== undefined && !record(field.translations))) throw new Error('Invalid content translation field');
      if ((sourceLength += field.source.length) > 8 * 1024 * 1024) throw new Error('Content translation source limit');
      if (Object.entries(field.translations ?? {}).some(([language, text]) => !isTranslationLanguage(language) || !validText(text))) throw new Error('Invalid content manual translation');
    }
  }
}

function protect(source: string, target: TranslationLanguage, protectedTerms: string[], glossary: Glossary): MaskedText {
  const occupied = new Uint8Array(source.length), ranges: { start: number; end: number; value: string }[] = [];
  const add = (start: number, end: number, value: string) => {
    if (occupied.subarray(start, end).some(Boolean)) return;
    occupied.fill(1, start, end); ranges.push({ start, end, value });
  };
  for (const expression of [/```[^\r\n]*[\s\S]*?(?:```|$)/g, /`+[^`\r\n]*`+/g, /https?:\/\/[^\s<>"`]+|www\.[^\s<>"`]+/g, /\$\{[^{}\r\n]+\}|\{\{[^{}\r\n]+\}\}|\{[\w.:-]+\}|%(?:\d+\$)?[sdif]/g]) {
    for (const match of source.matchAll(expression)) add(match.index, match.index + match[0].length, match[0]);
  }
  const terms = (values: [string, string][]) => {
    for (const [term, replacement] of values.sort((a, b) => b[0].length - a[0].length || a[0].localeCompare(b[0]))) {
      for (const index of identifierPositions(source, term)) add(index, index + term.length, replacement);
    }
  };
  terms(protectedTerms.filter(Boolean).map(term => [term, term]));
  terms(Object.entries(glossary).flatMap(([term, values]) => term && validText(values[target], 512) ? [[term, values[target]!] as [string, string]] : []));
  let salt = digest(source + target).slice(0, 16);
  while (source.includes(`__TONARIUM_${salt}_`)) salt = digest(salt).slice(0, 16);
  const tokens: MaskedText['tokens'] = [];
  let text = '', offset = 0;
  for (const range of ranges.sort((a, b) => a.start - b.start)) {
    const token = `__TONARIUM_${salt}_${tokens.length}__`;
    text += source.slice(offset, range.start) + token; offset = range.end;
    tokens.push({ token, value: range.value });
  }
  return { text: text + source.slice(offset), tokens };
}

function restore(masked: MaskedText, translated: string): string | undefined {
  const present = translated.match(tokenPattern) ?? [];
  if (present.length !== masked.tokens.length || masked.tokens.some(({ token }) => occurrences(translated, token) !== 1)) return;
  let text = translated;
  for (const { token, value } of masked.tokens) text = text.replace(token, () => value);
  return validText(text) ? text : undefined;
}

function validManual(source: string, translated: unknown, target: TranslationLanguage): translated is string {
  if (!validText(translated)) return false;
  return protect(source, target, [], {}).tokens.every(({ value }) => occurrences(translated, value) === occurrences(source, value));
}

function chunks(text: string): string[] {
  const result: string[] = [];
  let rest = text;
  while (rest.length > TRANSLATION_TEXT_MAX) {
    let end = TRANSLATION_TEXT_MAX;
    const boundary = Math.max(rest.lastIndexOf('\n', end - 1), rest.lastIndexOf(' ', end - 1));
    if (boundary > end / 2) end = boundary + 1;
    for (const token of rest.matchAll(tokenPattern)) if (token.index < end && token.index + token[0].length > end) { end = token.index; break; }
    if (end && /[\uD800-\uDBFF]/.test(rest[end - 1])) end--;
    result.push(rest.slice(0, end)); rest = rest.slice(end);
  }
  if (rest) result.push(rest);
  return result;
}

export class ContentTranslationStore {
  private entries: ContentTranslationCatalog['entries'] = {};
  private generation = 0;
  private pending = false;
  private cache = new Map<string, string>();
  private inFlight = new Map<string, PendingJob>();
  private queue: PendingJob[] = [];
  private active = 0;
  private glossary: Glossary;
  private profile: string;

  constructor(readonly directory: string, private translate?: ReturnType<typeof createTranslator>, options: { glossary?: Glossary; profile?: string } = {}) {
    this.glossary = structuredClone(options.glossary ?? {});
    if (Object.keys(this.glossary).length > 256 || Object.entries(this.glossary).some(([term, values]) => !validText(term, 512) || !record(values) || Object.entries(values).some(([language, text]) => !isTranslationLanguage(language) || !validText(text, 512)))) throw new Error('Invalid content translation glossary');
    this.profile = options.profile ?? 'content-v1';
    fs.mkdirSync(directory, { recursive: true });
  }

  register(documents: ContentDocument[]): Promise<void> {
    validateContentDocuments(documents);
    const entries: ContentTranslationCatalog['entries'] = Object.create(null), jobs: { job: TranslationJob; field: ContentTranslationCatalog['entries'][string]['fields'][string] }[] = [];
    for (const document of [...documents].sort((a, b) => a.key.localeCompare(b.key))) {
      const fields: ContentTranslationCatalog['entries'][string]['fields'] = Object.create(null);
      entries[document.key] = { fields };
      for (const [name, value] of Object.entries(document.fields).sort(([a], [b]) => a.localeCompare(b))) {
        const field = { source: value.source, translations: {} as Partial<Record<TranslationLanguage, string>> };
        fields[name] = field;
        if (!field.source.trim()) continue;
        const terms = [...new Set(document.protectedTerms ?? [])].filter(term => !identifierPositions(field.source, term).next().done).sort();
        const context = stableJSON({ kind: document.kind, field: name, reference: document.context ?? '', glossary: this.glossary });
        for (const targetLanguage of TRANSLATION_LANGUAGES) {
          if (targetLanguage === document.sourceLanguage) { field.translations[targetLanguage] = field.source; continue; }
          const manual = value.translations?.[targetLanguage];
          if (validManual(field.source, manual, targetLanguage)) { field.translations[targetLanguage] = manual; continue; }
          const masked = protect(field.source, targetLanguage, terms, this.glossary);
          const key = digest(stableJSON({ source: field.source, sourceLanguage: document.sourceLanguage, targetLanguage, context, terms, profile: this.profile }));
          const job = { key, source: field.source, masked, targetLanguage, context };
          const cached = this.read(job);
          if (cached !== undefined) field.translations[targetLanguage] = cached;
          else if (this.translate) jobs.push({ job, field });
        }
      }
    }
    const generation = ++this.generation;
    for (const obsolete of this.queue.splice(0)) { this.inFlight.delete(obsolete.job.key); obsolete.resolve(undefined); }
    this.entries = entries;
    this.pending = jobs.length > 0;
    return Promise.all(jobs.map(async ({ job, field }) => {
      const text = await this.schedule(job, generation);
      if (this.generation === generation && text !== undefined) field.translations[job.targetLanguage] = text;
    })).then(() => { if (this.generation === generation) this.pending = false; });
  }

  catalog(): ContentTranslationCatalog {
    return { schema: 1, revision: digest(stableJSON(this.entries)), pending: this.pending, entries: structuredClone(this.entries) };
  }

  private read(job: TranslationJob): string | undefined {
    try {
      let text = this.cache.get(job.key);
      if (text === undefined) {
        if (!fs.existsSync(path.join(this.directory, job.key + '.json'))) return;
        const value: unknown = JSON.parse(readRegular(this.directory, job.key + '.json', MAX_RESULT * 4).toString('utf8'));
        if (!record(value) || value.schema !== 1 || value.key !== job.key || !validText(value.text)) return;
        text = value.text;
      }
      const restored = restore(job.masked, text);
      if (restored !== undefined) this.cache.set(job.key, text);
      return restored;
    } catch { return; }
  }

  private schedule(job: TranslationJob, generation: number): Promise<string | undefined> {
    const existing = this.inFlight.get(job.key);
    if (existing) { existing.generations.add(generation); return existing.promise; }
    let resolve!: PendingJob['resolve'];
    const promise = new Promise<string | undefined>(done => { resolve = done; });
    const pending = { job, generations: new Set([generation]), promise, resolve };
    this.inFlight.set(job.key, pending); this.queue.push(pending); this.drain();
    return promise;
  }

  private drain() {
    while (this.active < 2 && this.queue.length) {
      const next = this.queue.shift()!;
      if (!next.generations.has(this.generation)) { this.inFlight.delete(next.job.key); next.resolve(undefined); continue; }
      this.active++;
      void this.run(next.job).then(next.resolve, () => next.resolve(undefined)).finally(() => {
        this.active--; this.inFlight.delete(next.job.key); this.drain();
      });
    }
  }

  private async run(job: TranslationJob): Promise<string | undefined> {
    if (!this.translate) return;
    const parts: string[] = [];
    for (const chunk of chunks(job.masked.text)) {
      const leading = chunk.match(/^\s*/)?.[0] ?? '', trailing = chunk.match(/\s*$/)?.[0] ?? '', text = chunk.trim();
      if (!text) { parts.push(chunk); continue; }
      const result = await this.translate({ text, targetLanguage: job.targetLanguage, context: job.context });
      if (result.status !== 'translated' || !validText(result.text)) return;
      parts.push(leading + result.text.trim() + trailing);
    }
    const translated = parts.join(''), restored = restore(job.masked, translated);
    if (restored === undefined || translated.length > MAX_RESULT) return;
    try {
      atomicJSON(path.join(this.directory, job.key + '.json'), { schema: 1, key: job.key, text: translated });
      this.cache.set(job.key, translated);
      return restored;
    } catch { return; }
  }
}
