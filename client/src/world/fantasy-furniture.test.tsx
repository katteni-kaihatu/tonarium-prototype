import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FantasyPropertyPanel } from './FantasyPropertyPanel.tsx';
import { applyFantasyAction, newFantasyProfile } from '../../../shared/fantasy-engine.ts';
import { applyFantasyPropertyCommand, fantasyPropertyState, newFantasyPropertyLedger } from '../../../shared/fantasy-property.ts';
import { FANTASY_FURNITURE, fantasyFurnitureCanPlace } from '../../../shared/fantasy-furniture.ts';
import { setLocale } from '../locale.ts';
const react = require('react') as typeof import('react'), originalSnapshot = react.useSyncExternalStore;
react.useSyncExternalStore = (subscribe, snapshot) => originalSnapshot(subscribe, snapshot, snapshot);
const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: 'Owner' }, () => .99).profile;
profile.character!.hour = 25; profile.character!.location = 'hearth'; profile.character!.gold = 5000; profile.character!.inventory['furniture-bed'] = 2;
const bought = applyFantasyPropertyCommand(newFantasyPropertyLedger(), { a: profile }, 'a', { type: 'buy', plot: 'hearth-residence', revision: 0, requestId: 'buy' }, 25);
const placed = applyFantasyPropertyCommand(bought.ledger, bought.profiles, 'a', { type: 'furnish', plot: 'hearth-residence', revision: 1, requestId: 'place', item: 'furniture-bed' }, 25);
test('home furniture renders real inventory and recovery controls, capacities and bed effects in three languages', () => {
  const fullHome: { item: string }[] = [];
  for (const furniture of FANTASY_FURNITURE) while (fantasyFurnitureCanPlace(fullHome, furniture.item)) fullHome.push({ item: furniture.item });
  assert.equal(fullHome.length, 10);
  for (const [locale, title, recover, install, effect] of [['ko', '집 안의 가구', '소지품으로 회수', '목제 침대 설치', '피로를 10'], ['en', 'Home furniture', 'Recover to bag', 'Install Wooden Bed', 'fatigue by 10'], ['ja', '家の家具', '鞄に回収する', '木の寝台を設置', '疲労をさらに10']] as const) {
    setLocale(locale); const html = renderToStaticMarkup(createElement(FantasyPropertyPanel, { profile: placed.profiles.a, state: fantasyPropertyState(placed.ledger, placed.profiles, 'a'), pending: false, error: null, onCommand: () => {} }));
    for (const text of [title, recover, install, effect]) assert.ok(html.includes(text), `${locale}: ${text}`);
    assert.ok(html.includes(`<summary>${title} · 1/${fullHome.length}</summary>`)); assert.ok(!html.includes('"user"'));
  }
});
