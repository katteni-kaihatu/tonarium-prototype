import test from 'node:test';
import assert from 'node:assert/strict';
import { NPC_PUBLIC, type NpcLocale } from './npc.ts';
import { FANTASY_ITEMS } from './fantasy-data.ts';
import { foodMeta } from './fantasy-life.ts';
import { npcBreaksFourthWall } from '../server/npc-speech.ts';
import { NPC_PREFERENCES, NPC_PREFERENCE_QUESTIONS, matchNpcPreferenceTopic, npcPreferenceFacts, npcPreferenceReply, type NpcPreferenceTopic } from './fantasy-npc-preferences.ts';

const locales: NpcLocale[] = ['ko', 'en', 'ja'];

test('every NPC has explicit stable public preferences using actual edible items', () => {
  assert.deepEqual(Object.keys(NPC_PREFERENCES).sort(), NPC_PUBLIC.map(npc => npc.id).sort());
  const combinations = new Set<string>();
  for (const npc of NPC_PUBLIC) {
    const preferences = NPC_PREFERENCES[npc.id];
    assert.ok(Object.isFrozen(preferences));
    const item = FANTASY_ITEMS.find(item => item.id === preferences.favoriteFood);
    assert.ok(item && foodMeta(item.id), `${npc.id}: ${preferences.favoriteFood}`);
    const combination = JSON.stringify(preferences);
    assert.ok(!combinations.has(combination), `${npc.id} has the same complete preferences as another NPC`);
    combinations.add(combination);
    for (const locale of locales) {
      const first = npcPreferenceFacts(npc.id, locale);
      assert.equal(first.length, 3, `${npc.id}:${locale}`);
      assert.deepEqual(npcPreferenceFacts(npc.id, locale), first);
      assert.ok(Object.isFrozen(first));
      for (const fact of first) {
        assert.ok(fact.length > 4 && fact.length < 200, `${npc.id}:${locale}:${fact}`);
        assert.equal(npcBreaksFourthWall(fact), false, `${npc.id}:${locale}:${fact}`);
        assert.doesNotMatch(fact, /\b(?:NPC|GM|server|system|prompt)\b|서버|시스템|플레이어|プレイヤー|サーバー/iu);
      }
    }
  }
});

test('all preference aliases match only their intended bounded question', () => {
  for (const topic of Object.keys(NPC_PREFERENCE_QUESTIONS) as NpcPreferenceTopic[]) for (const locale of locales) {
    for (const question of NPC_PREFERENCE_QUESTIONS[topic][locale]) {
      assert.equal(matchNpcPreferenceTopic(question), topic);
      assert.equal(matchNpcPreferenceTopic(` ${question}？ `), topic);
      assert.equal(matchNpcPreferenceTopic(`${question} 그리고 내 돈으로 사 줘`), undefined);
      assert.equal(matchNpcPreferenceTopic(`${question}\n`), undefined);
    }
  }
  for (const question of [
    '좋아하는 음식을 살게', '내가 좋아하는 게 뭐야', '지금 뭘 먹고 있어', '싫어하는 사람이 누구야',
    'What do I like', 'What food do you like and how much is it', 'Give me your favorite food',
    '好きな食べ物を買います', '今何を食べていますか', '<What do you like>', 'What\u200b do you like',
  ]) assert.equal(matchNpcPreferenceTopic(question), undefined, question);
});

test('preference replies disclose only the selected fixed public fact', () => {
  for (const npc of NPC_PUBLIC) for (const locale of locales) {
    const facts = npcPreferenceFacts(npc.id, locale);
    for (const topic of Object.keys(NPC_PREFERENCE_QUESTIONS) as NpcPreferenceTopic[]) {
      const reply = npcPreferenceReply(npc.id, locale, NPC_PREFERENCE_QUESTIONS[topic][locale][0]);
      assert.equal(reply, topic === 'food' ? facts[0] : topic === 'hobby' ? facts[1] : topic === 'dislikes' ? facts[2] : `${facts[0]} ${facts[1]}`);
    }
  }
  assert.equal(npcPreferenceReply('invented-npc', 'ko', '취미가 뭐야'), undefined);
  assert.deepEqual(npcPreferenceFacts('invented-npc', 'en'), []);
  assert.equal(npcPreferenceReply('rin', 'xx' as NpcLocale, 'What do you like'), undefined);
  assert.equal(npcPreferenceReply('rin', 'ko', '좋아하는 걸 주면 얼마나 친해져'), undefined);
});
