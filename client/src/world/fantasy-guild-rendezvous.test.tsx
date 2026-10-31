import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { applyFantasyAction, newFantasyProfile } from '../../../shared/fantasy-engine.ts';
import { FANTASY_QUESTS } from '../../../shared/fantasy-data.ts';
const require = createRequire(import.meta.url), react = require('react') as typeof import('react'), snapshot = react.useSyncExternalStore;
react.useSyncExternalStore = (subscribe, value) => snapshot(subscribe, value, value);
const { FantasyGuildRendezvous } = require('./FantasyGuildRendezvous.tsx') as typeof import('./FantasyGuildRendezvous.tsx');
const { set } = require('../store.ts') as typeof import('../store.ts');
const { setLocale } = require('../locale.ts') as typeof import('../locale.ts');

test('mixed-party raid rendezvous proposes consent through the leader and explains equal pay in all locales', () => {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'Companion' }, () => .5).profile, c = p.character!, q = FANTASY_QUESTS.find(q => q.group && q.objective?.type === 'hunt')!;
  Object.assign(c, { job: 'priest', hour: 8, location: q.destination, quests: [q.id] });
  c.contracts = { [q.id]: { offerId: 'offer-mixed-consent', issuer: 'guild-contact', boardLocation: 'hearth', acceptedAt: 2, startsAt: 8, expiresAt: Number.MAX_SAFE_INTEGER, progress: 0, gold: 120 } };
  for (const locale of ['ko', 'en', 'ja'] as const) {
    setLocale(locale);
    const member = { id: 'companion', name: 'Companion', isLeader: false, here: true, ready: false, compatible: true };
    set({ selfId: 'companion', wsConnected: true, fantasyProfile: p, fantasyPending: false, fantasyCombatPending: false, fantasyPartyPending: false, fantasyRealmPending: false, fantasyParty: { id: 'party', members: [{ ...member, id: 'owner', isLeader: true }, member], invitations: [], canStart: false } });
    const html = renderToStaticMarkup(createElement(FantasyGuildRendezvous, { c, blocked: false, onAction: () => { throw Error('Rendering cannot propose'); } }));
    assert.ok(html.includes({ ko: '균등', en: 'equally', ja: '均等' }[locale]));
    assert.match(html, /disabled/);
    assert.ok(html.includes({ ko: '파티장', en: 'party leader', ja: 'リーダー' }[locale]));
  }
});
