import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { applyFantasyAction, newFantasyProfile } from '../../../shared/fantasy-engine.ts';

const require = createRequire(import.meta.url), react = require('react') as typeof import('react');
const snapshot = react.useSyncExternalStore;
react.useSyncExternalStore = (subscribe, value) => snapshot(subscribe, value, value);
const transport = require.resolve('../net/ws.ts');
require.cache[transport] = { id: transport, filename: transport, loaded: true, exports: { send() { throw Error('Rendering cannot send requests'); }, connectWs() {} } } as NodeModule;
const { FantasyPanel } = require('./FantasyPanel.tsx') as typeof import('./FantasyPanel.tsx');
const { setLocale } = require('../locale.ts') as typeof import('../locale.ts');
const { set } = require('../store.ts') as typeof import('../store.ts');
const render = () => renderToStaticMarkup(createElement(FantasyPanel, { socialOpen: false, onSocialToggle() {} }));

test('the RPG keeps language selection before opening a platform account’s story', () => {
  const html = render();
  for (const name of ['한국어', 'English', '日本語']) assert.ok(html.includes(name));
  assert.ok(!html.includes('type="password"'));
});

test('platform-authenticated first entry opens character creation directly in three languages', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    setLocale(locale);
    set({ selfId: 'tonarium-platform-owner', joined: true, wsConnected: true, wsReady: true, fantasyProfile: newFantasyProfile(), fantasyPending: false });
    const html = render();
    assert.ok(html.includes(({ ko: '이름', en: 'Name', ja: '名前' })[locale]));
    assert.ok(html.includes('fr-creation'));
    assert.ok(!html.includes('type="password"'));
    assert.ok(!html.includes('fr-account'));
  }
});

test('an existing Tonarium character enters its world and retains equipment and ranking menus', () => {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: 'Platform Traveler', gender: 'female' }, () => .5).profile;
  setLocale('en');
  set({ selfId: 'tonarium-platform-owner', joined: true, wsConnected: true, wsReady: true, fantasyProfile: profile, fantasyPending: false });
  const html = render();
  for (const text of ['Platform Traveler', 'Equipment', 'Rankings', 'Town']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('fr-account'));
});


test('entering a platform identity clears the previous RPG before exposing the new owner', () => {
  const { enter } = require('../auth.ts') as typeof import('../auth.ts');
  const { get } = require('../store.ts') as typeof import('../store.ts');
  set({ adBindTonarium() {}, joined: false, selfId: 'previous-owner', fantasyProfile: newFantasyProfile(), npcMessages: [{ id: 'private-old', role: 'assistant', text: 'private old reply', npcId: 'rin', locale: 'en' }], fantasyRanking: [{ nickname: 'Cached', race: { ko: '', en: '', ja: '' }, job: { ko: '', en: '', ja: '' }, score: 1 }] });
  enter({ id: 'new-platform-owner', kind: 'guest', username: null, name: 'New owner' });
  assert.equal(get().selfId, 'new-platform-owner');
  assert.equal(get().fantasyProfile, null);
  assert.deepEqual(get().npcMessages, []);
  assert.equal(get().fantasyRanking, null);
});

test('platform logout hides the private RPG while its network request is still pending', async () => {
  const { logout } = require('../auth.ts') as typeof import('../auth.ts');
  const { get } = require('../store.ts') as typeof import('../store.ts');
  const originalFetch = globalThis.fetch;
  let rejectRequest!: (error: Error) => void;
  globalThis.fetch = () => new Promise((_, reject) => { rejectRequest = reject; });
  try {
    set({ fantasyProfile: newFantasyProfile(), wsReady: true });
    const pending = logout();
    assert.equal(get().fantasyProfile, null);
    assert.equal(get().wsReady, false);
    rejectRequest(Error('test transport closed'));
    await assert.rejects(pending, /test transport closed/);
  } finally { globalThis.fetch = originalFetch; }
});
