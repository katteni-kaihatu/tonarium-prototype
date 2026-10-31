import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FantasyPartyState } from '../../../shared/fantasy-party.ts';

const react = require('react') as typeof import('react');
const originalSnapshot = react.useSyncExternalStore;
react.useSyncExternalStore = ((subscribe, snapshot) => {
  assert.ok(Object.is(snapshot(), snapshot()), 'unchanged external-store snapshots must keep their identity');
  return originalSnapshot(subscribe, snapshot, snapshot);
}) as typeof react.useSyncExternalStore;
const { FantasyTownPlayers } = require('./FantasyTownPlayers.tsx') as typeof import('./FantasyTownPlayers.tsx');
const { set, get } = require('../store.ts') as typeof import('../store.ts');

test('town travelers keep stable snapshots before presence loads and as party and presence arrive', () => {
  const original = get();
  const render = () => renderToStaticMarkup(createElement(FantasyTownPlayers, { location: 'hearth' }));
  const member = { id: 'ally', name: 'Ally', isLeader: true, here: true, ready: false, compatible: true };
  const party: FantasyPartyState = { id: 'party', members: [member], invitations: [], canStart: false };
  try {
    set({ fantasyTownPresence: null, fantasyParty: null, fantasyProfile: null, selfId: 'self' });
    assert.equal(render(), '');
    set({ fantasyParty: party });
    assert.equal(render(), '');
    set({ fantasyTownPresence: { location: 'hearth', players: [{ id: 'ally', name: 'Ally', downed: true }, { id: 'self', name: 'Myself' }] } });
    const allied = render();
    assert.match(allied, /Ally/);
    assert.doesNotMatch(allied, /Myself/);
    assert.equal((allied.match(/<button\b/g) ?? []).length, 2);
    set({ fantasyParty: null });
    assert.equal((render().match(/<button\b/g) ?? []).length, 0);
  } finally {
    set(original);
  }
});
