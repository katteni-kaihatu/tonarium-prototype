import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FantasyConversationActions, type FantasyConversationActionContext, type FantasyConversationActionChoice } from './fantasy-conversation-actions.ts';
import { applyFantasyAction, newFantasyProfile, startFantasyActivity } from '../shared/fantasy-engine.ts';
import type { FantasyAction, FantasyResult } from '../shared/fantasy.ts';

const high = () => 0.999;
const context = (): FantasyConversationActionContext => ({ user: 'alice', speaker: 'gm', locale: 'ko', profile: applyFantasyAction(newFantasyProfile(), { type: 'create', source: 'human', name: '대화 확인', gender: 'female' }, high).profile });

test('NPC lesson offers and confirmations stay in character while GM retains real-time guidance', () => {
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const actions = new FantasyConversationActions(), c = { ...context(), locale, speaker: 'rin' };
    const label = { ko: '요리 수업', en: 'Cooking lesson', ja: '料理の授業' }[locale];
    const proposed = actions.propose(c, [{ action: { type: 'job', job: 'cook', via: 'npc', npcId: 'rin' }, label }]);
    assert.ok(proposed.text.includes(label)); assert.doesNotMatch(proposed.text, /게임|실제|game|real min|server|ゲーム|実時間|サーバー|\d+ G ·|×/i);
    const done = actions.confirm({ ...c, text: { ko: '응', en: 'yes', ja: 'はい' }[locale] }, () => ({ profile: c.profile, changed: true }));
    assert.ok(done.result?.changed); assert.doesNotMatch(done.text!, /game|server|게임|サーバー|記録/i);
  }
});
const job: FantasyConversationActionChoice = { action: { type: 'job', job: 'mage', via: 'gm' }, label: '마법사 배우기' };
const transport: FantasyConversationActionChoice[] = [
  { action: { type: 'travel', destination: 'greenwood', transport: 'foot' }, label: '도보 이동' },
  { action: { type: 'travel', destination: 'greenwood', transport: 'carriage' }, label: '마차 이동' },
];
const never = (): FantasyResult => { throw new Error('must not execute'); };

test('a canonical proposal only describes concrete cost and time and never mutates or executes', () => {
  const actions = new FantasyConversationActions(), c = context(), before = structuredClone(c.profile);
  const text = actions.propose(c, [job]).text;
  assert.ok(text.includes('마법사 배우기')); assert.ok(text.includes('0 G')); assert.ok(text.includes('게임 1시간')); assert.ok(text.includes('실제 약 2분'));
  assert.deepEqual(c.profile, before);
  assert.equal(actions.confirm({ ...c, text: '지금 내 상태는?' }, never).handled, false);
});

test('yes applies exactly once after consuming pending authority and passes the stored revision and action', () => {
  const actions = new FantasyConversationActions(), c = context(); actions.propose(c, [job]); let count = 0;
  const result = actions.confirm({ ...c, text: '응' }, (revision, action) => {
    count++; assert.equal(revision, c.profile.revision); assert.deepEqual(action, job.action);
    return startFantasyActivity(c.profile, action, c.profile.character!.hour, high);
  });
  assert.equal(result.handled, true); assert.equal(result.result!.changed, true); assert.ok(result.result!.profile.activity);
  assert.equal(result.result!.profile.character!.job, 'unassigned'); assert.equal(count, 1);
  assert.equal(actions.confirm({ ...c, text: '응' }, never).handled, false);
});

test('cancel consumes a proposal and later confirmation cannot revive it', () => {
  const actions = new FantasyConversationActions(), c = context(); actions.propose(c, [job]);
  assert.equal(actions.confirm({ ...c, text: '취소해줘' }, never).handled, true);
  assert.equal(actions.confirm({ ...c, text: '응' }, never).handled, false);
});

test('two minutes is a strict expiry and state, life, place and locale changes require a fresh proposal', () => {
  let now = 0;
  const actions = new FantasyConversationActions({ now: () => now });
  const cases: ((c: FantasyConversationActionContext) => void)[] = [c => c.profile.revision++, c => c.profile.generation = 2, c => c.profile.character!.lifeStartedAt = 9, c => c.profile.character!.location = 'greenwood', c => c.locale = 'en'];
  for (const alter of cases) {
    const c = context(); actions.propose(c, [job]); alter(c);
    assert.equal(actions.confirm({ ...c, text: 'yes' }, never).handled, true);
    assert.equal(actions.confirm({ ...c, text: 'yes' }, never).handled, false);
  }
  const c = context(); actions.propose(c, [job]); now = 120000;
  assert.equal(actions.confirm({ ...c, text: '응' }, never).handled, true);
  assert.equal(actions.confirm({ ...c, text: '응' }, never).handled, false);
});

test('pending proposals stay isolated by user and actual speaker', () => {
  const actions = new FantasyConversationActions(), c = context(); actions.propose(c, [job]);
  assert.equal(actions.confirm({ ...c, user: 'bob', text: '응' }, never).handled, false);
  assert.equal(actions.confirm({ ...c, speaker: 'rin', text: '응' }, never).handled, false);
  assert.equal(actions.confirm({ ...c, text: '취소' }, never).handled, true);
});

test('multiple options never guess yes and require a named or numbered choice before separate confirmation', () => {
  const actions = new FantasyConversationActions(), c = context();
  const offered = actions.propose(c, transport);
  assert.ok(offered.text.includes('1. 도보')); assert.ok(offered.text.includes('2. 마차'));
  const yes = actions.confirm({ ...c, text: '응' }, never); assert.equal(yes.handled, true); assert.ok(yes.text!.includes('번호나 이름'));
  const ambiguous = actions.confirm({ ...c, text: '이동' }, never); assert.equal(ambiguous.handled, true); assert.ok(ambiguous.text!.includes('1. 도보'));
  const invalid = actions.confirm({ ...c, text: '99번' }, never); assert.equal(invalid.handled, true);
  const chosen = actions.confirm({ ...c, text: '2번' }, never); assert.equal(chosen.handled, true); assert.ok(chosen.text!.includes('마차 이동')); assert.ok(chosen.text!.includes('6 G'));
  const done = actions.confirm({ ...c, text: '좋아' }, (revision, action) => { assert.equal(revision, c.profile.revision); assert.equal(action.type === 'travel' && action.transport, 'carriage'); return { profile: c.profile, changed: true }; });
  assert.ok(done.result?.changed);
});

test('a unique partial label in the original query skips only selection, never confirmation', () => {
  const actions = new FantasyConversationActions(), c = context();
  const proposed = actions.propose({ ...c, query: '도보로 갈게' }, transport);
  assert.ok(proposed.text.includes('도보 이동')); assert.ok(!proposed.text.includes('2. 마차'));
  assert.equal(actions.confirm({ ...c, text: '확인' }, (_revision, action) => { assert.equal(action.type === 'travel' && action.transport, 'foot'); return { profile: c.profile, changed: true }; }).result!.changed, true);
});

test('a label can be selected in conversation while unrelated questions do not erase the choices', () => {
  const actions = new FantasyConversationActions(), c = context(); actions.propose(c, transport);
  assert.equal(actions.confirm({ ...c, text: '내 HP가 얼마야?' }, never).handled, false);
  assert.ok(actions.confirm({ ...c, text: '마차로 부탁해' }, never).text!.includes('마차 이동'));
  assert.ok(actions.confirm({ ...c, text: '아니요' }, never).handled);
});

test('an activity or death blocks proposals and a race beginning cannot reuse old approval', () => {
  for (const kind of ['activity', 'death'] as const) {
    const actions = new FantasyConversationActions(), c = context(); actions.propose(c, [job]);
    if (kind === 'activity') c.profile.activity = { action: { type: 'work' }, startedAt: 8, endsAt: 12, seed: 1 };
    else c.profile.death = { location: 'greenwood', hour: 8, cause: 'test' };
    assert.equal(actions.confirm({ ...c, text: '응' }, never).handled, true);
    assert.ok(actions.propose(c, [job]).text.includes('시작할 수 없습니다'));
  }
});

test('malformed, retired and foreign-NPC action payloads cannot become executable suggestions', () => {
  const actions = new FantasyConversationActions(), c = context();
  for (const action of [{ type: 'sync' }, { type: 'rebirth' }, { type: 'manaTrain', exercise: 'sense' }, { type: 'job', job: 'not-registered', via: 'gm' }, { ...job.action, gold: 999 }]) {
    assert.equal(actions.propose(c, [{ action: action as FantasyAction, label: '위조' }]).text, '');
    assert.equal(actions.confirm({ ...c, text: '응' }, never).handled, false);
  }
  assert.equal(actions.propose({ ...c, speaker: 'rin' }, [job]).text, '');
  assert.equal(actions.propose({ ...c, speaker: 'rin' }, [{ label: '다른 교사', action: { type: 'learn', skill: 'mentor-focus', npcId: 'eris' } }]).text, '');
});

test('prices are checked again before execution and callback failure still consumes pending authority', () => {
  const actions = new FantasyConversationActions(), c = context();
  actions.propose(c, [{ label: '빵 구매', action: { type: 'buy', item: 'bread' } }]);
  c.profile.character!.bargains = { goods: { location: 'hearth', discount: .2, nextAt: 8, expiresAt: 16 } };
  assert.ok(actions.confirm({ ...c, text: '응' }, never).text!.includes('비용이나 시간이 바뀌었습니다'));
  actions.propose(c, [job]);
  assert.throws(() => actions.confirm({ ...c, text: '응' }, () => { throw new Error('storage unavailable'); }), /storage unavailable/);
  assert.equal(actions.confirm({ ...c, text: '응' }, never).handled, false);
});

test('English and Japanese confirmations and cancellations stay in the requested locale', () => {
  for (const [locale, affirmative, negative] of [['en', 'yes please', 'no thanks'], ['ja', 'お願いします', 'キャンセル']] as const) {
    const actions = new FantasyConversationActions(), c = { ...context(), locale };
    assert.ok(actions.propose(c, [job]).text.includes(locale === 'en' ? 'Reply "yes"' : '「はい」'));
    assert.equal(actions.confirm({ ...c, text: affirmative }, () => ({ profile: c.profile, changed: true })).result!.changed, true);
    actions.propose(c, [job]); assert.equal(actions.confirm({ ...c, text: negative }, never).handled, true);
  }
});
