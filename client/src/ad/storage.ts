import type { StorageLike } from './user.mjs';

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
  };
}

// サンドボックス iframe では localStorage 参照自体が SecurityError になる環境があるため、触る前に試す
export function safeStorage(): StorageLike {
  try {
    const ls = globalThis.localStorage;
    ls.getItem('__ad_probe__');
    return ls;
  } catch {
    return memoryStorage();
  }
}
