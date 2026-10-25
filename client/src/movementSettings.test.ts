import { test } from 'node:test';
import assert from 'node:assert/strict';

test('movement settings default independently and survive a fresh store initialization', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  let instance = 0;
  const restart = () => import(new URL(`./store.ts?movement-settings=${instance++}`, import.meta.url).href) as Promise<typeof import('./store.ts')>;
  try {
    let store = await restart();
    assert.equal(store.get().doubleJump, false);
    assert.equal(store.get().lean, true);
    store.set({ doubleJump: true });
    store.save('tonarium.doubleJump', true);
    store = await restart();
    assert.equal(store.get().doubleJump, true);
    assert.equal(store.get().lean, true);
    store.set({ lean: false });
    store.save('tonarium.lean', false);
    store = await restart();
    assert.equal(store.get().doubleJump, true);
    assert.equal(store.get().lean, false);
    store.save('tonarium.doubleJump', false);
    store = await restart();
    assert.equal(store.get().doubleJump, false);
    assert.equal(store.get().lean, false);
    values.delete('tonarium.doubleJump');
    store = await restart();
    assert.equal(store.get().doubleJump, false);
    assert.equal(store.get().lean, false);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
