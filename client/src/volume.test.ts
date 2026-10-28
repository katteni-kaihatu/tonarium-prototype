import assert from 'node:assert/strict';
import { test } from 'node:test';

test('chat notification sound defaults on and saved false survives reload', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  const first = await import(new URL('./store.ts?chat-sound-default', import.meta.url).href) as typeof import('./store.ts');
  assert.equal(first.get().chatNotificationSound, true);
  first.save('tonarium.chatNotificationSound', false);
  first.set({ chatNotificationSound: false });
  const reloaded = await import(new URL('./store.ts?chat-sound-reloaded', import.meta.url).href) as typeof import('./store.ts');
  assert.equal(reloaded.get().chatNotificationSound, false);
  assert.equal(reloaded.useStore.getInitialState().chatNotificationSound, false);
  assert.equal(values.get('tonarium.chatNotificationSound'), 'false');
});

test('master volumes default independently without rewriting saved settings', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  const writes: string[] = [];
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { writes.push(key); values.set(key, value); },
  } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });

  let instance = 0;
  const cases = [
    { name: 'no saved settings', saved: undefined, expected: { voice: 1, fx: 0.05, media: 0.05 } },
    { name: 'empty saved settings', saved: {}, expected: { voice: 1, fx: 0.05, media: 0.05 } },
    { name: 'all saved levels', saved: { voice: 0.8, fx: 0.4, media: 0.7 }, expected: { voice: 0.8, fx: 0.4, media: 0.7 } },
    { name: 'all saved mutes', saved: { voice: 0, fx: 0, media: 0 }, expected: { voice: 0, fx: 0, media: 0 } },
    { name: 'only fx saved', saved: { fx: 0.6 }, expected: { voice: 1, fx: 0.6, media: 0.05 } },
    { name: 'only media saved', saved: { media: 0.3 }, expected: { voice: 1, fx: 0.05, media: 0.3 } },
    { name: 'only fx mute saved', saved: { fx: 0 }, expected: { voice: 1, fx: 0, media: 0.05 } },
    { name: 'only media mute saved', saved: { media: 0 }, expected: { voice: 1, fx: 0.05, media: 0 } },
    { name: 'only voice saved', saved: { voice: 0.65 }, expected: { voice: 0.65, fx: 0.05, media: 0.05 } },
    { name: 'previous full volume settings', saved: { voice: 1, fx: 1, media: 1 }, expected: { voice: 1, fx: 1, media: 1 } },
  ];
  for (const { name, saved, expected } of cases) {
    await t.test(name, async () => {
      values.clear();
      writes.length = 0;
      if (saved !== undefined) values.set('tonarium.audioVol', JSON.stringify(saved));
      const before = values.get('tonarium.audioVol');
      const store = await import(new URL(`./store.ts?volume-settings=${instance++}`, import.meta.url).href) as typeof import('./store.ts');
      assert.deepEqual(store.get().audioVol, expected);
      assert.deepEqual(store.useStore.getInitialState().audioVol, expected);
      assert.equal(values.get('tonarium.audioVol'), before);
      assert.equal(writes.includes('tonarium.audioVol'), false);
    });
  }
});
