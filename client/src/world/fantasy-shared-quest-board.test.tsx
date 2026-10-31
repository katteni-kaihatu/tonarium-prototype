import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { applyFantasyAction, newFantasyProfile } from '../../../shared/fantasy-engine.ts';
import { FANTASY_QUESTS } from '../../../shared/fantasy-data.ts';
const require = createRequire(import.meta.url), react = require('react') as typeof import('react'), snapshot = react.useSyncExternalStore;
react.useSyncExternalStore = (subscribe, value) => snapshot(subscribe, value, value);
require.cache[require.resolve('../net/ws.ts')] = { exports: { send: () => { throw Error('Rendering cannot send network requests'); } } } as NodeJS.Module;
const { FantasyQuestBoard } = require('./FantasyQuestBoard.tsx') as typeof import('./FantasyQuestBoard.tsx');
const { set } = require('../store.ts') as typeof import('../store.ts');
const { setLocale } = require('../locale.ts') as typeof import('../locale.ts');

test('shared supporters see representative reporting and equal pay while owner keeps the normal report action', () => {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'Companion' }, () => .5).profile, c = p.character!, q = FANTASY_QUESTS.find(q => q.id === 'underworld-nyx-dressing')!;
  Object.assign(c, { job: 'priest', location: q.giver, quests: [q.id], visited: [q.giver], inventory: {} });
  c.contracts = { [q.id]: { offerId: 'offer-shared-display', issuer: q.issuer!, boardLocation: q.giver, acceptedAt: c.hour, expiresAt: c.hour + 36, progress: 0, gold: 30 } };
  c.contractParties = { [q.id]: { offer: 'offer-shared-display', party: 'party', owner: 'owner', totalGold: 30, members: [{ user: 'owner', generation: 1, lifeStartedAt: 0 }, { user: 'support', generation: 1, lifeStartedAt: 0 }] } };
  const row = { name: 'Contract representative', isLeader: false, here: true, ready: false, compatible: true };
  for (const locale of ['ko', 'en', 'ja'] as const) {
    setLocale(locale); set({ selfId: 'support', fantasyClock: null, fantasyParty: { id: 'party', members: [{ ...row, id: 'owner' }, { ...row, id: 'support' }], invitations: [], canStart: false } });
    const html = renderToStaticMarkup(createElement(FantasyQuestBoard, { c, blocked: false, onAction: () => { throw Error('Rendering cannot complete a quest'); } }));
    assert.ok(html.includes({ ko: '균등', en: 'equally', ja: '均等' }[locale]));
    assert.ok(html.includes('Contract representative'));
    assert.ok(html.includes({ ko: '참가 취소', en: 'Leave this contract', ja: '同行をやめる' }[locale]));
    assert.ok(html.includes(`${q.xp} XP`));
    assert.doesNotMatch(html, /0 \/ 3/);
    assert.match(html, /<button[^>]*disabled=""[^>]*>/);
  }
  setLocale('en'); set({ selfId: 'owner' }); c.job = 'thief'; c.inventory[q.item] = q.count;
  const owner = renderToStaticMarkup(createElement(FantasyQuestBoard, { c, blocked: false, onAction: () => {} }));
  assert.match(owner, /<button class="fr-btn">Report \/ deliver<\/button>/);
});
