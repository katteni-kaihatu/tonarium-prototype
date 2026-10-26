import type { TranslationLanguage } from './translation.ts';

export interface ContentSourceField {
  source: string;
  translations?: Partial<Record<TranslationLanguage, string>>;
}

export interface ContentDocument {
  key: string;
  kind: 'item' | 'world' | 'system';
  sourceLanguage?: TranslationLanguage;
  context?: string;
  protectedTerms?: string[];
  fields: Record<string, ContentSourceField>;
}

export interface ContentTranslationCatalog {
  schema: 1;
  revision: string;
  pending: boolean;
  entries: Record<string, { fields: Record<string, { source: string; translations: Partial<Record<TranslationLanguage, string>> }> }>;
}
