import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resources } from './resources.ts';
import { LANGUAGES, initialLanguage, LANGUAGE_STORAGE_KEY } from './locale.ts';

const saved = new Map<string, string>();
let rejectWrites = false;
const page = { title: '', documentElement: { lang: '' }, querySelector: () => ({ setAttribute() {} }) };
Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
Object.defineProperty(globalThis, 'document', { configurable: true, value: page });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['fr-CA', 'en-GB'], language: 'ja' } });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem(key: string, value: string) { if (rejectWrites) throw new Error('unavailable'); saved.set(key, value); },
} });
const { setLanguage, getLanguage, subscribeLanguage, t, msg, systemText, localized, formatDate, sourceText } = await import('./core.ts');

test('browser initialization and document metadata follow preferred supported language', () => {
  assert.equal(getLanguage(), 'en');
  assert.equal(page.documentElement.lang, 'en');
  assert.equal(page.title, 'Tonarium (prototype)');
});

test('all resource keys and interpolation parameters exist in all three languages', () => {
  const keys = Object.keys(resources.ja).sort();
  const placeholders = (value: string) => [...value.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();
  for (const language of LANGUAGES) {
    assert.deepEqual(Object.keys(resources[language]).sort(), keys);
    for (const key of keys) {
      assert.equal(typeof resources[language][key], 'string', `${language}:${key}`);
      assert.ok(resources[language][key].length > 0, `${language}:${key}`);
      assert.deepEqual(placeholders(resources[language][key]), placeholders(resources.ja[key]), `${language}:${key}`);
    }
  }
});

test('language changes notify subscribers immediately and survive reload resolution', () => {
  let notifications = 0;
  const unsubscribe = subscribeLanguage(() => notifications++);
  for (const [code, startLabel] of [['ja', 'はじめる'], ['en', 'Get started'], ['ko', '시작하기']] as const) {
    setLanguage(code);
    assert.equal(getLanguage(), code);
    assert.equal(t('ui12'), startLabel);
    assert.equal(saved.get(LANGUAGE_STORAGE_KEY), code);
    assert.equal(initialLanguage(globalThis.localStorage, ['en-US']), code);
  }
  unsubscribe();
  setLanguage('ja');
  assert.equal(notifications, 3);
});

test('open notifications and static metadata switch language without changing their source', () => {
  const notice = msg('ui44', msg('ui52'));
  const raw = { name: 'ホール', detail: { desc: '何も置いていない広い部屋' } };
  const view = localized(raw);
  setLanguage('en');
  assert.equal(systemText(notice), 'Saved Icon.');
  assert.equal(sourceText('ui451', 503), 'LiveKit に接続できません（503）');
  assert.equal(systemText(sourceText('ui451', 503)), 'Could not connect to LiveKit (503).');
  assert.equal(view.name, 'Hall');
  assert.equal(localized({ title: '声の届く範囲（〜15m）に送信' }).title, 'Send within voice range (up to 15m)');
  setLanguage('ko');
  assert.equal(systemText(notice), '아이콘 저장 완료');
  assert.equal(view.name, '홀');
  assert.equal(raw.name, 'ホール');
  setLanguage('ja');
  assert.equal(view.detail.desc, raw.detail.desc);
});

test('user values stay verbatim, including text identical to UI strings and template syntax', () => {
  const name = 'ホーム {0} <b>소라</b> $&';
  const original = { name, bio: 'はじめる', text: 'ゲスト', description: '保存', message: 'こんにちは' };
  const snapshot = structuredClone(original);
  for (const language of LANGUAGES) {
    setLanguage(language);
    assert.ok(t('ui584', name).includes(name));
    assert.deepEqual(original, snapshot);
  }
});

test('server system events and errors translate without translating user names', () => {
  setLanguage('en');
  assert.equal(systemText('カフェ が入室しました'), 'カフェ joined');
  assert.equal(systemText('このセッションには参加できません'), 'Cannot join this session.');
  assert.equal(systemText('白の手番 · チェック！'), 'White to move · Check!');
  setLanguage('ko');
  assert.equal(systemText('カフェ が退出しました'), 'カフェ님 퇴장');
  assert.equal(systemText('unknown error'), 'unknown error');
});

test('storage write failures leave language switching usable', () => {
  rejectWrites = true;
  setLanguage('en');
  assert.equal(t('ui12'), 'Get started');
  rejectWrites = false;
});

test('calendar uses selected language', () => {
  const date = new Date(2026, 9, 25);
  for (const language of LANGUAGES) {
    setLanguage(language);
    assert.equal(formatDate(date, { month: 'long' }), new Intl.DateTimeFormat(language, { month: 'long' }).format(date));
  }
});

test('offline and maintenance pages use saved preferences and browser priority without network access', () => {
  const worker: Record<string, unknown> = { self: { addEventListener() {} }, importScripts() {} };
  runInNewContext(readFileSync(new URL('../../public/offline-locales.js', import.meta.url), 'utf8'), worker);
  runInNewContext(readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8'), worker);
  for (const page of ['OFFLINE', 'MAINTENANCE']) {
    const html = runInNewContext(page, worker) as string;
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    for (const [savedLanguage, preferred, expected] of [
      ['ko', ['en-US'], 'ko'],
      [null, ['fr', 'en-GB', 'ja'], 'en'],
      ['invalid', ['de'], 'ja'],
    ] as const) {
      const elements: Record<string, { textContent?: string }> = { h1: {}, p: {}, button: {} };
      const document = { documentElement: { lang: '' }, querySelector: (tag: string) => elements[tag] };
      runInNewContext(script, { localStorage: { getItem: () => savedLanguage }, navigator: { languages: preferred }, document });
      assert.equal(document.documentElement.lang, expected);
      assert.ok(elements.h1.textContent);
      assert.ok(elements.p.textContent);
      assert.ok(elements.button.textContent);
    }
  }
});
