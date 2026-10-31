import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { PassThrough } from 'node:stream';
import { createRequire } from 'node:module';
import { renderToStaticMarkup, renderToPipeableStream } from 'react-dom/server';
import { combatError } from './fantasy-combat-error.ts';
import { fantasyCombatErrorText } from '../../../shared/fantasy-combat.ts';

const require = createRequire(import.meta.url), react = require('react') as typeof import('react');
const snapshot = react.useSyncExternalStore;
react.useSyncExternalStore = (subscribe, value) => snapshot(subscribe, value, value);
const { deferFantasyPanel } = require('./FantasyDeferredPanel.tsx') as typeof import('./FantasyDeferredPanel.tsx');
const { setLocale } = require('../locale.ts') as typeof import('../locale.ts');

test('a deferred panel keeps its localized loading state until code is available', () => {
  for (const [locale, text] of [['ko', '메뉴를 여는 중'], ['en', 'Opening menu'], ['ja', 'メニューを開いています']] as const) {
    setLocale(locale);
    const Panel = deferFantasyPanel(() => new Promise<{ default: () => null }>(() => {}));
    const html = renderToStaticMarkup(createElement(Panel));
    assert.ok(html.includes(text), locale);
    assert.ok(html.includes('role="status"'));
  }
});

test('resolved panel code is reused while every render receives the current props', async () => {
  let calls = 0;
  const Panel = deferFantasyPanel(async () => { calls++; return { default: ({ value }: { value: string }) => createElement('span', null, value) }; });
  const html = await new Promise<string>((resolve, reject) => {
    const destination = new PassThrough(); let text = '';
    destination.on('data', chunk => { text += chunk.toString(); });
    destination.on('end', () => resolve(text));
    const stream = renderToPipeableStream(createElement(Panel, { value: 'first character' }), { onAllReady() { stream.pipe(destination); }, onError: reject });
  });
  assert.ok(html.includes('first character'));
  assert.ok(renderToStaticMarkup(createElement(Panel, { value: 'second character' })).includes('second character'));
  assert.equal(calls, 1);
});

test('lightweight combat errors keep rule errors and general errors localized', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    for (const error of ['range', 'mana', 'cooldown', 'carrying'] as const) assert.equal(combatError(error, locale), fantasyCombatErrorText(error, locale));
    assert.ok(combatError('save-failed', locale).length > 0);
    assert.ok(combatError('busy', locale).length > 0);
    if (locale !== 'ja') assert.doesNotMatch(combatError('未知の戦闘条件です。', locale), /[ぁ-んァ-ン]/);
  }
});
