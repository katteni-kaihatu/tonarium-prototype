import assert from 'node:assert/strict';
import test from 'node:test';
import { homePageOf, storedHomePageOf } from './homePage.ts';

test('removed developer pages and malformed saved navigation fall back to the normal home screen', () => {
  for (const value of ['systems', 'systemLibrary', 'unknown', '', null, undefined, 1, {}, ['worlds']]) {
    assert.equal(homePageOf(value), 'home');
    assert.equal(storedHomePageOf(value), 'home');
  }
});

test('ordinary pages remain available and saved group details reopen their existing list', () => {
  for (const page of ['home', 'timeline', 'friends', 'sessions', 'events', 'groups', 'worlds', 'items', 'market', 'changelog', 'sounds', 'emotes']) {
    assert.equal(homePageOf(page), page);
    assert.equal(storedHomePageOf(page), page);
  }
  assert.equal(homePageOf('group'), 'group');
  assert.equal(storedHomePageOf('group'), 'groups');
});

test('the real application store restores a previously saved systems page as home', async testContext => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem(key: string) { return key === 'tonarium.homePage' ? JSON.stringify('systems') : null; },
    setItem() {}, removeItem() {}, length: 0, key() { return null; },
  } });
  testContext.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  const { get } = await import('./store.ts');
  assert.equal(get().homePage, 'home');
});
