import { useSyncExternalStore } from 'react';
import type { NpcLocale } from '../../shared/npc.ts';

const listeners = new Set<() => void>();
const supported = (value: unknown): value is NpcLocale => value === 'ko' || value === 'en' || value === 'ja';
let locale: NpcLocale = 'ko';
let chosen = false;
try {
  const stored = localStorage.getItem('tonarium.fantasy.locale') ?? localStorage.getItem('tonarium.locale');
  if (supported(stored)) { locale = stored; chosen = true; }
  else {
    const preferred = navigator.language.split('-')[0];
    if (supported(preferred)) locale = preferred;
  }
} catch {}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getLocale = () => locale;
export function setLocale(value: NpcLocale) {
  locale = value;
  chosen = true;
  try { localStorage.setItem('tonarium.fantasy.locale', value); } catch {}
  for (const listener of listeners) listener();
}
export function useLocale(): [NpcLocale, typeof setLocale] {
  return [useSyncExternalStore(subscribe, getLocale, () => 'ko' as const), setLocale];
}
export const useLanguageChosen = () => useSyncExternalStore(subscribe, () => chosen, () => false);

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === 'tonarium.fantasy.locale' && supported(event.newValue)) {
      locale = event.newValue;
      chosen = true;
      for (const listener of listeners) listener();
    }
  });
}
