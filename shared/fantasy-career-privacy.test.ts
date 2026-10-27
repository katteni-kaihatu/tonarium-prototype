import test from 'node:test';
import assert from 'node:assert/strict';
import { FANTASY_JOB_PATHS } from './fantasy-job-paths.ts';
import { fantasyPrivateCareerQuestion, fantasyPrivateCareerReply } from './fantasy-career-privacy.ts';
import { fantasyGmCanAnswer, fantasyGmReply } from './fantasy-gm.ts';
import { newFantasyProfile } from './fantasy-engine.ts';
import { npcCanonicalReply } from '../server/npc.ts';

test('GM and residents answer specialty prerequisite questions without exposing methods or triggering training', () => {
  const path = FANTASY_JOB_PATHS.find(path => path.job === 'mage')!;
  const suffix = { ko: '가 되려면 어떤 조건이 필요해?', en: ' prerequisites: how do I become one?', ja: 'になるための転職条件は？' };
  for (const locale of ['ko', 'en', 'ja'] as const) {
    const query = path.names[locale] + suffix[locale], profile = newFantasyProfile();
    assert.equal(fantasyPrivateCareerQuestion(query), true);
    assert.equal(fantasyGmCanAnswer(profile, query), true);
    const reply = fantasyGmReply(profile, query, locale);
    assert.equal(reply.text, fantasyPrivateCareerReply(locale)); assert.deepEqual(reply.suggestions, []);
    assert.equal(npcCanonicalReply(locale, 'eris', 'trusted', query), fantasyPrivateCareerReply(locale, true));
    assert.doesNotMatch(reply.text, /advanced-|\b100\b|\b45\b|jobXp|skillXp/);
  }
});

test('secrecy does not swallow questions about using learned arts or learning a basic profession', () => {
  for (const query of ['별마법사의 별궤적은 어떻게 써?', 'How do I use my Star Mage spell?', '星魔法使いの魔法をどう使う？', '마법사를 배우고 싶어', 'How can I learn to be a mage?', '魔法使いを学びたい']) {
    assert.equal(fantasyPrivateCareerQuestion(query), false, query);
  }
});

test('generic branch-change prerequisites stay private even without an exact branch name', () => {
  for (const query of ['사제 분기를 바꾸려면 신앙이 얼마나 필요해?', 'What are the requirements for specialization?', '専門分野の変更には何が必要？']) assert.equal(fantasyPrivateCareerQuestion(query), true, query);
});
