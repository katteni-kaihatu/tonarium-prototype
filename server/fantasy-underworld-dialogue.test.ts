import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NpcTransactions } from './npc-transactions.ts';
import { FantasyConversationActions } from './fantasy-conversation-actions.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { FANTASY_UNDERWORLD_QUESTS } from '../shared/fantasy-underworld-quests.ts';
import { fantasyEnvironment } from '../shared/fantasy-environment.ts';
import type { FantasyContractBoard, FantasyContractVisibleOffer } from '../shared/fantasy-contracts.ts';

test('criminal contacts list only their authoritative contracts and acceptance still requires confirmation', () => {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: '旅人' }, () => .5).profile, c = p.character!;
  c.job = 'thief'; c.location = 'hearth'; c.hour = 100;
  const q = FANTASY_UNDERWORLD_QUESTS[0], other = FANTASY_UNDERWORLD_QUESTS[2];
  const offer = (quest: typeof q, id: string): FantasyContractVisibleOffer => ({ id, quest: quest.id, issuer: quest.issuer!, boardLocation: 'hearth', createdAt: 99, expiresAt: 102, deadline: 136, mode: 'exclusive', gold: 30, participants: 0, available: true, mine: false });
  const board: FantasyContractBoard = { revision: 1, hour: 100, location: 'hearth', offers: [offer(q, 'actual-nyx'), offer(other, 'other-contact')], environment: { ...fantasyEnvironment(c), monsterPressure: 0, bountyMultiplier: 1 } };
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const actions = new FantasyConversationActions(), transactions = new NpcTransactions(), context = { user: 'contact-client', speaker: 'hearth-nyx', locale, profile: p, text: { ko: '의뢰', en: 'contracts', ja: '依頼' }[locale], contractBoard: board };
    const listed = transactions.chat(context, actions);
    assert.equal(listed.handled, true); assert.ok(listed.text!.includes(q.names![locale])); assert.ok(!listed.text!.includes(other.names![locale]));
    const proposal = transactions.chat({ ...context, text: '1' }, actions); assert.equal(proposal.handled, true);
    let calls = 0;
    const confirmed = actions.confirm({ ...context, text: 'yes' }, (_revision, action) => { calls++; assert.deepEqual(action, { type: 'accept', quest: q.id, offer: 'actual-nyx' }); return { profile: p, changed: true }; });
    assert.equal(confirmed.result?.changed, true); assert.equal(calls, 1);
    assert.equal(actions.confirm({ ...context, text: 'yes' }, () => { throw new Error('No repeated acceptance'); }).handled, false);
  }
});

test('criminal trust dialogue reads saved progress without mutating or granting a reward', () => {
  const p = applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', gender: 'female', name: '旅人' }, () => .5).profile;
  p.character!.job = 'thief'; p.character!.location = 'hearth'; const original = structuredClone(p);
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const actions = new FantasyConversationActions(), transactions = new NpcTransactions();
    const context = { user: 'contact-client', speaker: 'hearth-nyx', locale, profile: p, text: { ko: '조직 신뢰와 공적', en: 'trust and merit', ja: '信用と功績' }[locale] };
    const response = transactions.chat(context, actions); assert.equal(response.handled, true); assert.match(response.text!, /0/);
    assert.equal(actions.confirm({ ...context, text: 'yes' }, () => { throw new Error('Information is not a reward grant'); }).handled, false);
    assert.deepEqual(p, original);
  }
});
