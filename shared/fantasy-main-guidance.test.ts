import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFantasyAction, newFantasyProfile, startFantasyActivity } from './fantasy-engine.ts';
import { fantasyMainProgress, fantasyMainStage } from './fantasy-main-trials.ts';
import { fantasyMainGuidance } from './fantasy-main-guidance.ts';
import { fantasyGmReply } from './fantasy-gm.ts';
import { fantasyGmKnowledge } from './fantasy-gm-knowledge.ts';
import { fantasyGmActivityName } from './fantasy-gm-locale.ts';
import { FANTASY_MAIN_REVEALS } from './fantasy-second-content.ts';
import { FANTASY_LOCATIONS } from './fantasy-data.ts';
import { FantasyConversationActions } from '../server/fantasy-conversation-actions.ts';
import type { FantasyAction } from './fantasy.ts';
import { fantasyEscortOffers } from './fantasy-escort.ts';
import { FANTASY_TASK_QUESTS } from './fantasy-task-quests.ts';

const accepted = () => {
  const created = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Evidence guide', source: 'human', gender: 'female' }, () => .5).profile;
  created.character!.hour = 12;
  const result = applyFantasyAction(created, { type: 'accept', quest: 'main-night-01' });
  assert.equal(result.error, undefined);
  return result.profile;
};

test('GM refuses to offer main completion from stockpiled goods and old visits, in every language', () => {
  const p = accepted(), c = p.character!;
  c.inventory.relic = 5; c.visited.push('oldwatch');
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const reply = fantasyGmReply(p, 'main-night-01', locale);
    assert.ok(!reply.suggestions.some(suggestion => suggestion.action?.type === 'complete'));
    assert.match(reply.text, /0\/2/);
    assert.equal(fantasyMainProgress(c, 'main-night-01'), 0);
  }
});

test('only the current accepted investigation appears in GM knowledge and hidden places stay hidden', () => {
  const p = accepted(), c = p.character!;
  c.charted = []; c.visited = ['hearth'];
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const guide = fantasyMainGuidance(c, 'main-night-01', locale)!;
    assert.match(guide, /0\/2/);
    const knowledge = fantasyGmKnowledge(p, locale);
    for (const reveal of FANTASY_MAIN_REVEALS) assert.ok(!knowledge.includes(reveal.text[locale]));
    assert.ok(!guide.includes({ ko: '옛망루성', en: 'Old Watch', ja: '古い見張り城' }[locale]));
    assert.equal(fantasyMainGuidance(c, 'quest-herbalist', locale), undefined);
  }
});

test('GM investigation proposals require verbal approval and schedule a check without revealing its outcome', () => {
  const p = accepted(), c = p.character!;
  c.location = 'oldwatch'; c.visited.push(c.location); c.charted = FANTASY_LOCATIONS.map(place => place.id);
  const reply = fantasyGmReply(p, 'main-night-01', 'ko');
  const choices = reply.suggestions.flatMap(suggestion => suggestion.action?.type === 'investigate' ? [{ action: suggestion.action, label: suggestion.label }] : []);
  assert.equal(choices.length, 3);
  const actions = new FantasyConversationActions(), context = { user: 'proof-guide', speaker: 'gm' as const, locale: 'ko' as const, profile: p };
  let calls = 0;
  const apply = (_revision: number, action: FantasyAction) => { calls++; return startFantasyActivity(p, action, c.hour, () => .9); };
  const proposal = actions.propose(context, [choices[0]]);
  assert.match(proposal.text, /1분/); assert.equal(calls, 0);
  assert.equal(actions.confirm({ ...context, text: '판정 결과가 뭐야?' }, apply).handled, false);
  assert.equal(calls, 0);
  const confirmed = actions.confirm({ ...context, text: '응' }, apply);
  assert.equal(calls, 1); assert.equal(confirmed.result?.profile.activity?.action.type, 'investigate');
  assert.equal(fantasyMainProgress(confirmed.result!.profile.character!, 'main-night-01'), 0);
  assert.equal(confirmed.result!.profile.character!.xp, p.character!.xp);
  for (const locale of ['ko', 'en', 'ja'] as const) {
    assert.equal(fantasyGmActivityName(confirmed.result!.profile, locale), fantasyMainStage(c, 'main-night-01')!.labels[locale]);
  }
});

test('escort dialogue proposes a guild assignment and departure separately, with no advance pay', () => {
  for (const [locale, query] of [['ko', '호위 의뢰를 받고 싶어'], ['en', 'I want an escort assignment'], ['ja', '護衛依頼を受けたい']] as const) {
    let p = accepted(); p.character!.job = 'warrior'; p.character!.charted = FANTASY_LOCATIONS.map(place => place.id);
    const offers = fantasyEscortOffers(p.character!), before = p.character!.gold;
    assert.ok(offers.length);
    const reply = fantasyGmReply(p, query, locale);
    assert.ok(reply.suggestions.some(suggestion => suggestion.action?.type === 'escortAccept'));
    assert.ok(!reply.suggestions.some(suggestion => suggestion.action?.type === 'travel'));
    const actions = new FantasyConversationActions(), context = { user: `escort-${locale}`, speaker: 'gm' as const, locale, profile: p };
    const suggestion = reply.suggestions.find(suggestion => suggestion.action?.type === 'escortAccept')!;
    assert.ok(actions.propose(context, [{ label: suggestion.label, action: suggestion.action! }]).text);
    assert.equal(p.character!.gold, before); assert.equal(p.character!.escort, undefined);
    const confirmed = actions.confirm({ ...context, text: { ko: '응', en: 'yes', ja: 'はい' }[locale] }, (_revision, action) => applyFantasyAction(p, action));
    assert.equal(confirmed.result?.error, undefined); p = confirmed.result!.profile;
    assert.ok(p.character!.escort); assert.equal(p.character!.gold, before);
    assert.ok(fantasyGmReply(p, query, locale).suggestions.some(suggestion => suggestion.action?.type === 'travel' && suggestion.action.transport === 'escort'));
  }
});

test('GM describes successful-action contracts rather than treating stockpiles as completion', () => {
  const quest = FANTASY_TASK_QUESTS[0];
  let p = accepted(); p.character!.location = quest.giver;
  p = applyFantasyAction(p, { type: 'accept', quest: quest.id }).profile;
  p.character!.inventory[quest.item] = 500; p.character!.visited.push(quest.destination);
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const reply = fantasyGmReply(p, quest.id, locale);
    assert.match(reply.text, /0\/2/);
    assert.ok(!reply.suggestions.some(suggestion => suggestion.action?.type === 'complete'));
  }
});
