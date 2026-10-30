import assert from 'node:assert/strict';
import test from 'node:test';

test('BGM setting restores only booleans, stays local, and works when storage rejects writes', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  let reject = false;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => { if (reject) throw new Error('blocked'); return values.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (reject) throw new Error('blocked'); values.set(key, value); },
  } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  let instance = 0;
  for (const raw of [undefined, 'false', 'true', 'null', '0', '"false"', '{}', 'broken']) {
    values.clear();
    if (raw !== undefined) values.set('tonarium.adBgmEnabled', raw);
    const store = await import(new URL(`../store.ts?bgm=${instance++}`, import.meta.url).href) as typeof import('../store.ts');
    assert.equal(store.get().adBgmEnabled, raw !== 'false');
  }
  values.clear();
  const first = await import(new URL('../store.ts?bgm-first', import.meta.url).href) as typeof import('../store.ts');
  const other = await import(new URL('../store.ts?bgm-other', import.meta.url).href) as typeof import('../store.ts');
  const before = first.get();
  let notified = 0;
  const unsubscribe = first.useStore.subscribe(() => notified++);
  first.setAdBgmEnabled(false);
  assert.equal(notified, 1);
  unsubscribe();
  assert.equal(other.get().adBgmEnabled, true);
  assert.equal(first.get().adGame, before.adGame);
  assert.equal(first.get().adProfile, before.adProfile);
  assert.equal(first.get().audioVol, before.audioVol);
  assert.deepEqual([...values], [['tonarium.adBgmEnabled', 'false']]);
  const reloaded = await import(new URL('../store.ts?bgm-reloaded', import.meta.url).href) as typeof import('../store.ts');
  assert.equal(reloaded.get().adBgmEnabled, false);
  reject = true;
  reloaded.setAdBgmEnabled(true);
  assert.equal(reloaded.get().adBgmEnabled, true);
  reloaded.setAdBgmEnabled(false);
  assert.equal(reloaded.get().adBgmEnabled, false);
  const blocked = await import(new URL('../store.ts?bgm-blocked', import.meta.url).href) as typeof import('../store.ts');
  assert.equal(blocked.get().adBgmEnabled, true);
});
