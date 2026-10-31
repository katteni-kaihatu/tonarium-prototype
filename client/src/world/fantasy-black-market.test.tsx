import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyFantasyAction, newFantasyProfile } from '../../../shared/fantasy-engine.ts';
import { NPC_PUBLIC } from '../../../shared/npc.ts';
import { advanceFantasyBlackMarket, applyFantasyBlackMarket, fantasyBlackMarketOpening, fantasyBlackMarketState, newFantasyBlackMarketLedger } from '../../../shared/fantasy-black-market.ts';
import { FantasyBlackMarketPanel } from './FantasyBlackMarketPanel.tsx';

function fixture() {
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: '競売の客' }, () => .99).profile;
  const npc = NPC_PUBLIC.find(npc => npc.building === 'residence')!, c = profile.character!; c.location = npc.homeLocation; c.blackMarketClues = [c.location]; c.gold = 10000;
  let hour = 20; while (!fantasyBlackMarketOpening(c.location, hour, 'ui-market').open) hour += 24;
  const result = advanceFantasyBlackMarket(newFantasyBlackMarketLedger(), new Map([['buyer', profile]]), hour, 'ui-market');
  return { ...result, profile, hour, state: fantasyBlackMarketState(result.ledger, c, hour, 'ui-market', { userId: 'buyer', generation: 1 }) };
}
test('auction panel renders localized real lots, NPC competitors, prices and escrow guidance', () => {
  const f = fixture();
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const html = renderToStaticMarkup(createElement(FantasyBlackMarketPanel, { profile: f.profile, state: f.state, hour: f.hour, pending: false, error: null, onCommand: () => {}, locale }));
    assert.match(html, /type="number"/); assert.match(html, /G/); assert.match(html, /aria-label=/); assert.ok(html.includes(f.state.market!.lots[0].competitors[0].names[locale]));
    assert.doesNotMatch(html, /15\s*(?:reputation|평판|評判)|collector-|threshold|blackMarketBid/);
  }
});
test('hidden markets render nothing and closed won lots expose a localized collection action', () => {
  const f = fixture();
  assert.equal(renderToStaticMarkup(createElement(FantasyBlackMarketPanel, { profile: f.profile, state: { ...f.state, known: false }, hour: f.hour, pending: false, error: null, onCommand: () => {}, locale: 'en' })), '');
  const market = Object.values(f.ledger.markets)[0], lot = market.lots[0];
  const offered = applyFantasyBlackMarket(f.ledger, f.profiles, 'buyer', { type: 'blackMarketBid', market: market.id, lot: lot.id, amount: 5000, revision: f.ledger.revision }, f.hour, 'ui-market');
  const done = advanceFantasyBlackMarket(offered.ledger, offered.profiles, market.closesAt, 'ui-market');
  const state = fantasyBlackMarketState(done.ledger, done.profiles.get('buyer')!.character!, market.closesAt, 'ui-market', { userId: 'buyer', generation: 1 });
  const html = renderToStaticMarkup(createElement(FantasyBlackMarketPanel, { profile: done.profiles.get('buyer')!, state, hour: market.closesAt, pending: false, error: null, onCommand: () => {}, locale: 'en' }));
  assert.match(html, /Collect won goods/); assert.match(html, /5,000|5000/); assert.match(html, /bid history/i);
});
