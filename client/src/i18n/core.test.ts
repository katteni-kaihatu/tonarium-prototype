import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resources } from './resources.ts';
import { LANGUAGES, initialLanguage, LANGUAGE_STORAGE_KEY } from './locale.ts';

const saved = new Map<string, string>();
let rejectWrites = false;
const page = { title: '', documentElement: { lang: '' }, querySelector: () => ({ setAttribute() {} }) };
const windowEvents = new Map<string, (event: StorageEvent) => void>();
Object.defineProperty(globalThis, 'window', { configurable: true, value: {
  addEventListener: (name: string, listener: (event: StorageEvent) => void) => windowEvents.set(name, listener),
  removeEventListener: (name: string) => windowEvents.delete(name),
} });
Object.defineProperty(globalThis, 'document', { configurable: true, value: page });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['fr-CA', 'en-GB'], language: 'ja' } });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem(key: string, value: string) { if (rejectWrites) throw new Error('unavailable'); saved.set(key, value); },
} });
const { setLanguage, getLanguage, subscribeLanguage, t, msg, systemText, localized, formatDate, sourceText } = await import('./core.ts');

test('hammer hit counts are displayed in each supported language', () => {
  const previous = getLanguage();
  try {
    for (const count of [1, 4]) {
      const text = `A がピコピコハンマーで B を${count}回叩きました`;
      setLanguage('ja');
      assert.equal(systemText(text), text);
      setLanguage('en');
      assert.equal(systemText(text), `A hit B with a toy hammer ${count} time(s)`);
      setLanguage('ko');
      assert.equal(systemText(text), `A님이 장난감 망치로 B님을 ${count}번 두드렸습니다`);
    }
  } finally { setLanguage(previous); }
});

test('hit notification counts follow language changes while preserving the sender', () => {
  const previous = getLanguage();
  const notice = { fromName: 'Alice', count: 4 };
  try {
    for (const count of [1, notice.count]) {
      for (const [lang, expected] of [
        ['ja', `Alice にピコピコハンマーで${count}回叩かれました`],
        ['en', `Alice hit you with a toy hammer ${count} time(s)`],
        ['ko', `Alice님이 장난감 망치로 나를 ${count}번 두드렸습니다`],
      ] as const) {
        setLanguage(lang);
        assert.equal(notice.fromName + t('ui638', count), expected);
      }
    }
  } finally { setLanguage(previous); }
});

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

test('language settings in another app tab update open views without writing preferences back', () => {
  setLanguage('ja');
  let notifications = 0;
  const unsubscribe = subscribeLanguage(() => notifications++);
  const receive = (newValue: string, key = LANGUAGE_STORAGE_KEY, storageArea: unknown = globalThis.localStorage) => windowEvents.get('storage')!({ key, newValue, storageArea } as StorageEvent);
  try {
    receive('en');
    assert.equal(getLanguage(), 'en'); assert.equal(page.documentElement.lang, 'en');
    assert.equal(t('ssCatalogSearch'), 'Search systems');
    assert.equal(saved.get(LANGUAGE_STORAGE_KEY), 'ja');
    assert.equal(notifications, 1);
    receive('en'); receive('invalid'); receive('ko', 'unrelated'); receive('ko', LANGUAGE_STORAGE_KEY, {});
    assert.equal(notifications, 1);
    receive('ko');
    assert.equal(getLanguage(), 'ko'); assert.equal(t('ssCatalogSearch'), '시스템 검색');
    assert.equal(notifications, 2);
  } finally { unsubscribe(); setLanguage('ja'); }
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
