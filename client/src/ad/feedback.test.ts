import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import { bigFromLog10, bigFromNumber, createNewGame } from './engine.mjs';
import { emitAdFeedback, subscribeAdFeedback, type AdFeedbackEvent } from './feedback.ts';
import { createAdSlice, type AdSlice } from './slice.ts';
import type { StorageLike } from './user.mjs';

function harness() {
  let state: AdSlice;
  state = createAdSlice((partial) => { Object.assign(state, partial); }, () => state);
  state.adGame = createNewGame();
  return state;
}

test('購入の連続呼出しを次元ごとに合算し、購読解除後は届けない', async () => {
  const events: AdFeedbackEvent[] = [];
  const unsubscribe = subscribeAdFeedback((event) => { events.push(event); });
  try {
    for (let i = 0; i < 10; i++) emitAdFeedback({ kind: 'purchase', tier: 1 });
    emitAdFeedback({ kind: 'purchase', tier: 2, count: 3 });
    emitAdFeedback({ kind: 'tickspeed', count: 2 });
    emitAdFeedback({ kind: 'purchase', tier: 1, count: 0 });
    assert.deepEqual(events, []);
    await Promise.resolve();
    assert.deepEqual(events, [
      { kind: 'purchase', tier: 1, count: 10 },
      { kind: 'purchase', tier: 2, count: 3 },
      { kind: 'tickspeed', count: 2 },
    ]);
    unsubscribe();
    emitAdFeedback({ kind: 'save' });
    assert.equal(events.length, 3);
  } finally { unsubscribe(); }
});

test('購入失敗や購入数ゼロの最大購入は成功演出を出さない', async () => {
  const slice = harness();
  const events: AdFeedbackEvent[] = [];
  const unsubscribe = subscribeAdFeedback((event) => { events.push(event); });
  try {
    slice.adGame!.antimatter = bigFromNumber(0);
    assert.equal(slice.adBuyDimension(1), false);
    assert.equal(slice.adBuyTickspeed(), false);
    slice.adBuyDimensionMax(1);
    slice.adBuyMaxTickspeed();
    slice.adBuyMax();
    assert.equal(slice.adBoost(), false);
    assert.equal(slice.adGalaxy(), false);
    assert.equal(slice.adSacrifice(), false);
    assert.equal(slice.adPrestige(), false);
    await Promise.resolve();
    assert.deepEqual(events, []);
  } finally { unsubscribe(); }
});

test('最大購入のイベントには各次元とTickspeedの実購入数が入る', async () => {
  const slice = harness();
  const game = slice.adGame!;
  game.antimatter = bigFromNumber(1e10);
  const events: AdFeedbackEvent[] = [];
  const unsubscribe = subscribeAdFeedback((event) => { events.push(event); });
  try {
    slice.adBuyMax();
    await Promise.resolve();
    const expected: AdFeedbackEvent[] = game.dimensions.flatMap((dim) => dim.bought > 0
      ? [{ kind: 'purchase' as const, tier: dim.tier, count: dim.bought }] : []);
    if (game.tickspeedBought > 0) expected.push({ kind: 'tickspeed', count: game.tickspeedBought });
    assert.ok(expected.length > 1);
    assert.deepEqual(events, expected);
    slice.adBuyMax();
    await Promise.resolve();
    assert.deepEqual(events, expected);
  } finally { unsubscribe(); }
});

test('リセット系の成功はそれぞれの操作イベントを一度だけ出す', () => {
  const slice = harness();
  const events: AdFeedbackEvent[] = [];
  const unsubscribe = subscribeAdFeedback((event) => { events.push(event); });
  try {
    slice.adGame!.dimensions[3].amount = bigFromNumber(20);
    assert.ok(slice.adBoost());
    slice.adGame!.dimensions[7].amount = bigFromNumber(80);
    assert.ok(slice.adGalaxy());
    slice.adGame!.dimensionalBoosts = 5;
    slice.adGame!.dimensions[0].amount = bigFromLog10(20);
    assert.ok(slice.adSacrifice());
    slice.adGame!.antimatter = bigFromLog10(309);
    assert.ok(slice.adPrestige());
    assert.deepEqual(events, [
      { kind: 'boost' }, { kind: 'galaxy' }, { kind: 'sacrifice' }, { kind: 'crunch' },
    ]);
  } finally { unsubscribe(); }
});

test('起動・生産・自動保存は無音で、手動保存と失敗だけを通知する', async (t) => {
  const callbacks = new Map<number, () => void>();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { setInterval: (callback: () => void, delay: number) => {
      callbacks.set(delay, callback);
      return delay;
    } },
  });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  const fetchMock: typeof fetch = async (url, options) => new Response(JSON.stringify(
    String(url).endsWith('/api/ad/create') ? { id: 'save', token: 'grant' }
      : String(url).includes('/api/save/') ? { save: null, revision: options?.method === 'POST' ? 1 : 0 } : { entries: [] },
  ));
  const request = t.mock.method(globalThis, 'fetch', fetchMock);
  const values = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
  const slice = harness();
  const events: AdFeedbackEvent[] = [];
  const unsubscribe = subscribeAdFeedback((event) => { events.push(event); });
  try {
    slice.adStart({ storage });
    callbacks.get(100)!();
    callbacks.get(1000)!();
    callbacks.get(30000)!();
    await setImmediate();
    assert.deepEqual(events, []);
    assert.ok(slice.adSaveLocal());
    assert.ok(await slice.adSaveServer());
    assert.deepEqual(events, [{ kind: 'save' }, { kind: 'save' }]);
    request.mock.mockImplementation(async () => { throw new Error('offline'); });
    callbacks.get(30000)!();
    await setImmediate();
    assert.equal(events.length, 2);
    assert.equal(await slice.adSaveServer(), false);
    assert.deepEqual(events.at(-1), { kind: 'error' });
  } finally {
    unsubscribe();
    slice.adStop();
  }
});

test('プロフィール・入出力の失敗は成功通知なしでエラーを一度だけ出す', async (t) => {
  const fetchMock: typeof fetch = async (url) => new Response(JSON.stringify(
    String(url).endsWith('/api/ad/create') ? { id: 'save', token: 'grant' } : { save: null, revision: 0 },
  ));
  t.mock.method(globalThis, 'fetch', fetchMock);
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { setInterval: () => 0 },
  });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  const values = new Map<string, string>();
  let failWrite = false;
  const storage: StorageLike = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (failWrite) throw new Error('quota exceeded');
      values.set(key, value);
    },
    removeItem: (key) => { values.delete(key); },
  };
  const slice = harness();
  slice.adStart({ storage });
  await setImmediate();
  const bundle = slice.adExport()!;
  const events: AdFeedbackEvent[] = [];
  const unsubscribe = subscribeAdFeedback((event) => { events.push(event); });
  try {
    const profile = slice.adCreateProfile('new profile');
    assert.deepEqual(events, [{ kind: 'profile' }]);
    await setImmediate();
    events.length = 0;
    failWrite = true;
    assert.throws(() => slice.adCreateProfile('another'), /Local save failed/);
    assert.deepEqual(events.splice(0), [{ kind: 'error' }]);
    assert.throws(() => slice.adSwitchProfile(profile.id), /Local save failed/);
    assert.deepEqual(events.splice(0), [{ kind: 'error' }]);
    assert.throws(() => slice.adImport(bundle), /Local save failed/);
    assert.deepEqual(events.splice(0), [{ kind: 'error' }]);
    Object.defineProperty(slice.adGame, 'antimatter', {
      configurable: true,
      get: () => { throw new Error('cannot serialize'); },
    });
    assert.throws(() => slice.adExport(), /cannot serialize/);
    assert.deepEqual(events.splice(0), [{ kind: 'error' }]);
  } finally {
    unsubscribe();
    slice.adStop();
  }
});

test('演出購読側の例外は操作や他の購読者を止めない', async (t) => {
  const slice = harness();
  const events: AdFeedbackEvent[] = [];
  const errors = t.mock.method(console, 'error', () => {});
  const unsubscribeBroken = subscribeAdFeedback(() => { throw new Error('audio unavailable'); });
  const unsubscribe = subscribeAdFeedback((event) => { events.push(event); });
  try {
    assert.doesNotThrow(() => { emitAdFeedback({ kind: 'navigate' }); });
    assert.ok(slice.adBuyDimension(1));
    await Promise.resolve();
    assert.equal(slice.adGame!.dimensions[0].bought, 1);
    assert.deepEqual(events, [{ kind: 'navigate' }, { kind: 'purchase', tier: 1, count: 1 }]);
    assert.equal(errors.mock.callCount(), 2);
  } finally {
    unsubscribeBroken();
    unsubscribe();
  }
});
