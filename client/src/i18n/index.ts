import { useSyncExternalStore } from 'react';
import { subscribeLanguage, getLanguage } from './core.ts';
export * from './core.ts';
export const useLanguage = () => useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
