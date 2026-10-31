import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import type { FantasyRankingRow } from '../../../shared/fantasy-ranking.ts';
const require = createRequire(import.meta.url), react = require('react') as typeof import('react');
const snapshot = react.useSyncExternalStore;
react.useSyncExternalStore = (subscribe, value) => snapshot(subscribe, value, value);
const { FantasyRankingPanel, fantasyRankingRequestAllowed } = require('./FantasyRankingPanel.tsx') as typeof import('./FantasyRankingPanel.tsx');
const { setLocale } = require('../locale.ts') as typeof import('../locale.ts');
const { set, get } = require('../store.ts') as typeof import('../store.ts');
const names = { ko: '인간', en: 'Human', ja: '人間' }, job = { ko: '성녀', en: 'Saint', ja: '聖女' };
function initialize(rows: FantasyRankingRow[] | null) {
  set({ selfId: 'tonarium-viewer', joined: true, wsReady: true, wsConnected: true, session: 'rpg', worldBy: { rpg: 'fantasy' }, fantasyRanking: rows });
}
test('ranking panel shows only nickname, localized race, profession and score for ten records', () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({ nickname: `Nickname ${index}`, race: names, job, score: 1000 - index }));
  for (const locale of ['ko', 'en', 'ja'] as const) {
    initialize(rows); setLocale(locale); const html = renderToStaticMarkup(createElement(FantasyRankingPanel));
    assert.equal((html.match(/<tr>/g) ?? []).length, 11); assert.equal((html.match(/scope="col"/g) ?? []).length, 4);
    assert.ok(html.includes('Nickname 0')); assert.ok(!html.includes('Nickname 10')); assert.ok(html.includes(names[locale])); assert.ok(html.includes(job[locale]));
    for (const secret of ['tonarium-viewer', 'generation', 'gender', 'completed', 'inventory', 'owner', 'level']) assert.ok(!html.includes(secret));
  }
});
test('ranking requests and stale display are restricted to ready platform-authenticated fantasy sessions', () => {
  initialize([]); assert.equal(fantasyRankingRequestAllowed(get()), true);
  for (const patch of [{ wsConnected: false }, { joined: false }, { wsReady: false }, { selfId: '' }, { session: null }, { worldBy: { rpg: 'city' as const } }]) {
    initialize([{ nickname: 'Hidden cached row', race: names, job, score: 1 }]); set(patch); assert.equal(fantasyRankingRequestAllowed(get()), false);
    assert.ok(!renderToStaticMarkup(createElement(FantasyRankingPanel)).includes('Hidden cached row'));
  }
});
test('loading and empty rankings have localized feedback', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    setLocale(locale); initialize(null); assert.ok(renderToStaticMarkup(createElement(FantasyRankingPanel)).includes('role="status"'));
    initialize([]); assert.ok(renderToStaticMarkup(createElement(FantasyRankingPanel)).includes(({ ko: '아직 기록이 없습니다.', en: 'No records yet.', ja: 'まだ記録がありません。' })[locale]));
  }
});
