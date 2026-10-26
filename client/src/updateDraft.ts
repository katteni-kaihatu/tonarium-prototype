import { useCallback, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';

const values = new Map<string, unknown>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const emit = () => listeners.forEach(listener => listener());
export function updateDrafts() {
  const drafts: Record<string, string> = {};
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)!;
    if (key.startsWith('tonarium.draft.')) drafts[key] = sessionStorage.getItem(key)!;
  }
  for (const [key, value] of values) drafts[key] = JSON.stringify(value);
  return drafts;
}
export function hydrateUpdateDrafts(drafts: Record<string, string>) {
  for (const [key, value] of Object.entries(drafts)) {
    if (!key.startsWith('tonarium.draft.') || typeof value !== 'string') continue;
    values.set(key, JSON.parse(value));
    try { sessionStorage.setItem(key, value); } catch { /* メモリ上の復元は続ける。 */ }
  }
  emit();
}

export function useUpdateDraft<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const storageKey = `tonarium.draft.${key}`;
  const snapshot = () => {
    if (!values.has(storageKey)) {
      try { values.set(storageKey, JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') ?? initial); }
      catch { values.set(storageKey, initial); }
    }
    return values.get(storageKey) as T;
  };
  const value = useSyncExternalStore(subscribe, snapshot);
  const setValue: Dispatch<SetStateAction<T>> = useCallback(next => {
    const value = typeof next === 'function' ? (next as (prev: T) => T)(values.get(storageKey) as T) : next;
    values.set(storageKey, value);
    try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* 更新時の共通保存に含める。 */ }
    emit();
  }, [storageKey]);
  return [value, setValue];
}
