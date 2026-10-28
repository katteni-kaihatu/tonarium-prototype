import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrivalPatch, initialArrivalState, openArrivalPatch, popupSettingsFor, shouldShowArrival, shouldPlayChatArrival, type ArrivalKind, type ArrivalState } from './newArrival.ts';

const state = (): ArrivalState & ReturnType<typeof initialArrivalState> => ({
  session: 'room', hubOpen: false, folded: { left: false, right: false, faces: false },
  phoneLayout: false, phoneTab: 'screen', rightView: 'log', rightConversation: null,
  ...initialArrivalState(),
});

test('chat sound ignores panels and checks saved preference, volume, own busy status and pause boundary', () => {
  const s = { ...state(), chatNotificationSound: true, audioVol: { fx: 0.05 }, selfId: 'self',
    users: [{ id: 'other', status: 'busy' }, { id: 'self', status: 'online' }] };
  for (const hubOpen of [false, true]) for (const right of [false, true]) {
    s.hubOpen = hubOpen; s.folded.right = right;
    assert.equal(shouldPlayChatArrival(s, 1000), true);
  }
  s.rightView = 'msg'; s.rightConversation = 'dm:test'; s.phoneLayout = true;
  assert.equal(shouldPlayChatArrival(s, 1000), true);
  s.chatNotificationSound = false;
  assert.equal(shouldPlayChatArrival(s, 1000), false);
  s.chatNotificationSound = true; s.audioVol.fx = 0;
  assert.equal(shouldPlayChatArrival(s, 1000), false);
  s.audioVol.fx = 0.05; s.users[1].status = 'busy';
  assert.equal(shouldPlayChatArrival(s, 1000), false);
  s.users[1].status = 'online'; s.popupPausedUntil = 1000;
  assert.equal(shouldPlayChatArrival(s, 999), false);
  assert.equal(shouldPlayChatArrival(s, 1000), true);
  assert.equal(shouldPlayChatArrival(s, 1001), true);
  s.session = null;
  assert.equal(shouldPlayChatArrival(s, 1001), false);
});

for (const kind of ['chat', 'notice'] as ArrivalKind[]) {
  test(`${kind}: window open/closed, other tab, phone and home overlay`, () => {
    const s = state();
    assert.equal(shouldShowArrival(kind, s, 100), false);
    s.folded.right = true;
    assert.equal(shouldShowArrival(kind, s, 100), true);
    s.folded.right = false; s.rightView = 'msg';
    assert.equal(shouldShowArrival(kind, s, 100), true);
    s.rightView = 'log'; s.phoneLayout = true;
    assert.equal(shouldShowArrival(kind, s, 100), true);
    s.phoneTab = 'log';
    assert.equal(shouldShowArrival(kind, s, 100), false);
    s.hubOpen = true;
    assert.equal(shouldShowArrival(kind, s, 100), true);
    s.session = null;
    assert.equal(shouldShowArrival(kind, s, 100), false);
  });
  test(`${kind}: shared pause, exact expiry, next arrival and reset`, () => {
    const s = state(); s.folded.right = true; s.popupPausedUntil = 1000;
    assert.equal(popupSettingsFor(kind, s).pausedUntil, 1000);
    assert.deepEqual(arrivalPatch(kind, s, 999), {});
    assert.ok(arrivalPatch(kind, s, 1000).arrivals?.[kind]);
    assert.ok(arrivalPatch(kind, s, 1001).arrivals?.[kind]);
    Object.assign(s, initialArrivalState());
    assert.equal(shouldShowArrival(kind, s, 999), true);
    assert.deepEqual(s.arrivals, {});
  });
  test(`${kind}: activate popup opens the feature on desktop and phone`, () => {
    const s = state(); s.folded.right = true; s.hubOpen = true; s.phoneLayout = true; s.rightView = 'msg';
    Object.assign(s, openArrivalPatch({ kind, at: 100 }, s));
    assert.equal(s.hubOpen, false);
    assert.equal(s.folded.right, false);
    assert.equal(s.phoneTab, 'log');
    assert.equal(s.rightView, 'log');
    assert.equal(shouldShowArrival(kind, s, 101), false);
    assert.equal(s.arrivals[kind], undefined);
  });
}

test('conversation popups open their conversation, and both kinds coexist', () => {
  const s = state(); s.folded.right = true;
  Object.assign(s, arrivalPatch('notice', s, 100));
  Object.assign(s, arrivalPatch('chat', s, 101, 'dm:a:b'));
  assert.ok(s.arrivals.notice);
  Object.assign(s, openArrivalPatch(s.arrivals.chat!, s));
  assert.equal(s.rightView, 'msg');
  assert.equal(s.rightConversation, 'dm:a:b');
  assert.equal(shouldShowArrival('chat', s, 102, 'dm:a:b'), false);
  assert.equal(shouldShowArrival('chat', s, 102, 'dm:a:c'), true);
  assert.ok(s.arrivals.notice);
});
