import ja from './ja.ts';
import en from './en.ts';
import ko from './ko.ts';
import type { Language } from './locale.ts';

export const resources: Record<Language, Record<string, string>> = { ja, en, ko };
