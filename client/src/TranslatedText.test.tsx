import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TranslationContent } from './TranslatedText.tsx';
import { setLanguage } from './i18n/core.ts';

test('translation UI shows translation, small original and spoken language', () => {
  setLanguage('ja');
  const html = renderToStaticMarkup(<TranslationContent text="Hello" result={{ text: 'こんにちは', sourceLanguage: 'en', status: 'translated' }} />);
  assert.match(html, /translation-body[^>]*>こんにちは/);
  assert.match(html, /<small class="translation-original"><span>原文： <\/span>Hello<\/small>/);
  assert.match(html, /発言言語：英語/);
  assert.match(html, /aria-busy="false"/);
});

test('pending, unavailable and failed UI keep original and show unknown language', () => {
  setLanguage('ja');
  for (const status of ['pending', 'unavailable', 'failed'] as const) {
    const html = renderToStaticMarkup(<TranslationContent text="Hello" result={{ text: 'ignored', sourceLanguage: null, status }} />);
    assert.match(html, /translation-body[^>]*>Hello/);
    assert.match(html, /発言言語：不明/);
    assert.doesNotMatch(html, /ignored|translation-original/);
    if (status === 'pending') assert.match(html, /aria-busy="true"/);
  }
  assert.match(renderToStaticMarkup(<TranslationContent text="12345" result={{ text: '12345', sourceLanguage: null, status: 'translated' }} />), /発言言語：不明/);
});

test('UI language labels follow language settings and model text is escaped', () => {
  setLanguage('en');
  const html = renderToStaticMarkup(<TranslationContent text="原文" result={{ text: '<script>alert(1)</script>', sourceLanguage: 'ja', status: 'translated' }} />);
  assert.match(html, /Spoken language: Japanese/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  setLanguage('ko');
  assert.match(renderToStaticMarkup(<TranslationContent text="Hello" />), /번역 중/);
  setLanguage('ja');
});
