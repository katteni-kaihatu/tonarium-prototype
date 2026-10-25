import assert from 'node:assert/strict';
import test from 'node:test';
import { initialLanguage, languageOf, resolveLanguage, LANGUAGE_STORAGE_KEY } from './locale.ts';

test('saved language takes priority and unsupported saved values are ignored', () => {
  assert.equal(resolveLanguage('ko', ['en-US', 'ja']), 'ko');
  assert.equal(resolveLanguage('EN-gb', ['ja']), 'en');
  assert.equal(resolveLanguage('fr', ['de-DE', 'ko-KR', 'en']), 'ko');
  assert.equal(resolveLanguage('invalid', ['fr', 'en-US']), 'en');
});

test('browser languages are matched in priority order, with region and script tags', () => {
  assert.equal(resolveLanguage(null, ['fr-CA', 'en-GB', 'ko-KR']), 'en');
  assert.equal(resolveLanguage(null, ['ko-Kore-KR', 'en']), 'ko');
  assert.equal(resolveLanguage(null, ['ja-JP', 'ko']), 'ja');
  assert.equal(languageOf('EN_us'), 'en');
  assert.equal(languageOf(null), undefined);
});

test('unsupported or absent browser preferences fall back to Japanese', () => {
  assert.equal(resolveLanguage(null, ['fr-FR', 'de-DE']), 'ja');
  assert.equal(resolveLanguage('', []), 'ja');
});

test('unavailable storage still respects browser priority', () => {
  assert.equal(initialLanguage({ getItem() { throw new Error('unavailable'); } }, ['ko-KR']), 'ko');
  assert.equal(initialLanguage(undefined, ['en-US']), 'en');
  assert.equal(initialLanguage({ getItem(key) { assert.equal(key, LANGUAGE_STORAGE_KEY); return 'ja'; } }, ['en-US']), 'ja');
});
