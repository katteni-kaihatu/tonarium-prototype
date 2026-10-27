import test from 'node:test';
import assert from 'node:assert/strict';
import { FantasyConversationActions, type FantasyConversationActionContext } from './fantasy-conversation-actions.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import type { FantasyResult } from '../shared/fantasy.ts';

function context(): FantasyConversationActionContext { return { user: 'alice', speaker: 'hearth-alia', locale: 'ko', profile: applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Alice', gender: 'female', source: 'human' }, () => .5).profile }; }
const buy = { action: { type: 'buy' as const, item: 'herb' }, label: '약초 한 개 구매' }, sell = { action: { type: 'sell' as const, item: 'herb' }, label: '약초 한 개 판매' };
const never = (): FantasyResult => { throw new Error('Must never execute stale terms'); };

test('market-backed proposals display the actual quote without exposing stock authority keys', () => {
  const actions = new FantasyConversationActions(), c = context();
  c.marketQuote = action => action.type === 'buy' ? { text: '19 G · 즉시', key: 'private-stock-key-91' } : undefined;
  const offered = actions.propose(c, [buy]); assert.match(offered.text, /19G/); assert.doesNotMatch(offered.text, /private-stock-key/);
  let called = 0; const result = actions.confirm({ ...c, text: '응' }, (revision, action) => { called++; assert.equal(revision, c.profile.revision); assert.deepEqual(action, buy.action); return { profile: c.profile, changed: true }; });
  assert.equal(result.result?.changed, true); assert.equal(called, 1); assert.equal(actions.confirm({ ...c, text: '응' }, never).handled, false);
});

test('a changed stock revision invalidates approval even if its displayed unit price is identical', () => {
  const actions = new FantasyConversationActions(), c = context(); let version = 1;
  c.marketQuote = () => ({ text: '19 G · 즉시', key: `private-stock-${version}` });
  actions.propose(c, [buy]); version++;
  const result = actions.confirm({ ...c, text: 'yes' }, never); assert.equal(result.handled, true); assert.equal(result.result, undefined); assert.match(result.text!, /바뀌/); assert.doesNotMatch(result.text!, /private-stock/);
  assert.equal(actions.confirm({ ...c, text: 'yes' }, never).handled, false);
});

test('a price change or a disappearing finite market quote cannot execute an older approval', () => {
  for (const disappear of [false, true]) {
    const actions = new FantasyConversationActions(), c = context(); let changed = false;
    c.marketQuote = () => changed && disappear ? undefined : { text: `${changed ? 21 : 19} G · 즉시`, key: 'stock-same' };
    actions.propose(c, [buy]); changed = true;
    const result = actions.confirm({ ...c, text: 'yes' }, never); assert.equal(result.handled, true); assert.equal(result.result, undefined);
  }
});

test('choosing among goods captures the quote at selection and still requires a separate approval', () => {
  const actions = new FantasyConversationActions(), c = context(); let sellKey = 'sell-1';
  c.marketQuote = action => ({ text: action.type === 'buy' ? '19 G' : '6 G', key: action.type === 'buy' ? 'buy-1' : sellKey });
  actions.propose(c, [buy, sell]); const selected = actions.confirm({ ...c, text: '2번' }, never); assert.match(selected.text!, /6 G/); assert.equal(selected.result, undefined);
  sellKey = 'sell-2'; const result = actions.confirm({ ...c, text: 'yes' }, never); assert.equal(result.handled, true); assert.equal(result.result, undefined);
});

test('legacy callers without an economy quote preserve the existing confirmation route', () => {
  const actions = new FantasyConversationActions(), c = context(); actions.propose(c, [buy]);
  const result = actions.confirm({ ...c, text: 'yes' }, () => ({ profile: c.profile, changed: true })); assert.equal(result.result?.changed, true);
});
