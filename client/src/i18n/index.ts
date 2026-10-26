import { useSyncExternalStore } from 'react';
import { subscribeLanguage, getLanguage } from './core.ts';
import { subscribeContentTranslations, getContentTranslationsRevision } from '../content-translations.ts';
export * from './core.ts';
export const useLanguage = () => {
  useSyncExternalStore(subscribeContentTranslations, getContentTranslationsRevision, getContentTranslationsRevision);
  return useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
};
