import ja from './ja.ts';
import en from './en.ts';
import ko from './ko.ts';
import type { Language } from './locale.ts';
import { systemGuideLocales } from '../systems/locales/guide.ts';
import { systemCatalogLocales } from '../systems/locales/catalog.ts';
import { systemPlaytestLocales } from '../systems/locales/playtest.ts';
import { systemMessageLocales } from '../systems/locales/messages.ts';

const systems = (language: Language) => ({ ...systemGuideLocales[language], ...systemCatalogLocales[language], ...systemPlaytestLocales[language], ...systemMessageLocales[language] });
export const resources: Record<Language, Record<string, string>> = { ja: { ...ja, ...systems('ja') }, en: { ...en, ...systems('en') }, ko: { ...ko, ...systems('ko') } };
