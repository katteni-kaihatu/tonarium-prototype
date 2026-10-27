import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendFantasyGmMessages, appendFantasyGmResponse, clearFantasyGmLife, fantasyGmHistory, registerFantasyGmRequest } from './fantasy-gm-history.ts';
import type { FantasyGmChatResponse } from '../../../shared/fantasy-gm.ts';
import type { NpcLocale } from '../../../shared/npc.ts';

const response = (requestId: string, locale: NpcLocale = 'ko'): FantasyGmChatResponse => ({ requestId, locale, source: 'rules', reply: { text: '요청한 인물의 답변', suggestions: [] } });

test('a new life clears only its owner’s history and refuses their old pending replies', () => {
  appendFantasyGmMessages('new-life-owner','ko',{id:'old-life',who:'you',reply:{text:'Old question',suggestions:[]}});
  registerFantasyGmRequest('new-life-pending','new-life-owner','ko');
  registerFantasyGmRequest('unaffected-life-pending','unaffected-owner','en');
  clearFantasyGmLife('new-life-owner');
  assert.deepEqual(fantasyGmHistory('new-life-owner','ko'),[]);
  assert.equal(appendFantasyGmResponse(response('new-life-pending')),false);
  assert.equal(appendFantasyGmResponse(response('unaffected-life-pending','en')),true);
});

test('GM history survives a menu subscriber reopening and stays separated by player and language', () => {
  const user='history-test';
  appendFantasyGmMessages(user,'ko',{id:'ask',who:'you',reply:{text:'마법을 배우고 싶어',suggestions:[]}});
  const first=fantasyGmHistory(user,'ko');
  assert.equal(fantasyGmHistory(user,'ko'),first);
  assert.deepEqual(fantasyGmHistory(user,'en'),[]);
  assert.deepEqual(fantasyGmHistory('other-history-test','ko'),[]);
  appendFantasyGmMessages(user,'ko',{id:'reply',who:'gm',reply:{text:'수련을 시작할까요?',suggestions:[]}});
  assert.equal(first.length,1);
  assert.equal(fantasyGmHistory(user,'ko').length,2);
  appendFantasyGmMessages(user,'ko',{id:'reply',who:'gm',reply:{text:'수련을 시작할까요?',suggestions:[]}});
  assert.equal(fantasyGmHistory(user,'ko').length,2);
});

test('a delayed GM reply stays with the requesting player after the current player changes', () => {
  registerFantasyGmRequest('owner-switch-request', 'owner-before-switch', 'ko');
  assert.equal(appendFantasyGmResponse(response('owner-switch-request')), true);
  assert.equal(fantasyGmHistory('owner-before-switch', 'ko').length, 1);
  assert.deepEqual(fantasyGmHistory('owner-after-switch', 'ko'), []);
  // A repeated effect after a player switch cannot copy the same reply into another scope.
  assert.equal(appendFantasyGmResponse(response('owner-switch-request')), false);
  assert.equal(fantasyGmHistory('owner-before-switch', 'ko').length, 1);
  assert.deepEqual(fantasyGmHistory('owner-after-switch', 'ko'), []);
});

test('interleaved requests bind their own player and language independently', () => {
  registerFantasyGmRequest('owner-a-request', 'interleaved-owner-a', 'ko');
  registerFantasyGmRequest('owner-b-request', 'interleaved-owner-b', 'en');
  assert.equal(appendFantasyGmResponse(response('owner-b-request', 'en')), true);
  assert.equal(appendFantasyGmResponse(response('owner-a-request', 'ko')), true);
  assert.equal(fantasyGmHistory('interleaved-owner-a', 'ko').length, 1);
  assert.equal(fantasyGmHistory('interleaved-owner-b', 'en').length, 1);
  assert.deepEqual(fantasyGmHistory('interleaved-owner-a', 'en'), []);
  assert.deepEqual(fantasyGmHistory('interleaved-owner-b', 'ko'), []);
});

test('unregistered, failed and language-mismatched replies never enter a player history', () => {
  assert.equal(appendFantasyGmResponse(response('unregistered-request')), false);
  registerFantasyGmRequest('failed-owner-request', 'failed-owner', 'ko');
  assert.equal(appendFantasyGmResponse({ ...response('failed-owner-request'), error: 'timeout' }), false);
  assert.equal(appendFantasyGmResponse(response('failed-owner-request')), false);
  registerFantasyGmRequest('wrong-language-request', 'wrong-language-owner', 'ko');
  assert.equal(appendFantasyGmResponse(response('wrong-language-request', 'en')), false);
  assert.deepEqual(fantasyGmHistory('failed-owner', 'ko'), []);
  assert.deepEqual(fantasyGmHistory('wrong-language-owner', 'ko'), []);
  assert.deepEqual(fantasyGmHistory('wrong-language-owner', 'en'), []);
});
