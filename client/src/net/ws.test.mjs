import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

let state;
const stub = (path, namedExports) => mock.module(new URL(path, import.meta.url).href, { namedExports });
stub('../store.ts', { get: () => state, set: (patch) => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; }, recompute() {}, spawnPoint() {} });
stub('../sessionView.ts', { applyAvatars() {} });
stub('../items/actions.ts', { applyDelta() {} });
stub('../items/effects.ts', { onHit() {} });
stub('../actions.ts', { pushNotice() {} });
stub('../spatial.ts', { volumeFrom() {} });
stub('../world/sounds.ts', { playPoke() {}, playSynth() {} });
stub('../emotes.ts', { receiveEmote() {} });
stub('../world/survivorAudio.ts', { playSurvivorSound() {} });
stub('./session.ts', { startSessionSync() {}, stopSessionSync() {}, roomSend() {}, configureSessionSync() {}, syncError() {}, resetSessionSync() {} });
globalThis.document = { documentElement: { lang: '' }, title: '', querySelector: () => null };
globalThis.WebSocket = class {
  static OPEN = 1;
  readyState = 1;
  sent = [];
  send(raw) { this.sent.push(JSON.parse(raw)); }
};
const { onMessage, requestSession } = await import('./ws.ts');

beforeEach(() => {
  state = { session: 'existing', hubOpen: true, mode: '3d', guild: { name: 'test', sessions: [] } };
  globalThis.__tonariumWs = new WebSocket();
});

test('live room chat reception shows popups only for new eligible messages', () => {
  Object.assign(state, { selfId: 'self', blocked: ['Blocked'], chats: {}, arrivals: {},
    popupPausedUntil: 0, folded: { right: true } });
  const receive = (id, from = 'other', fromName = 'Other', sid = 'existing') =>
    onMessage({ t: 'chat', sid, m: { id, from, fromName, at: Date.now(), text: 'hello', scope: 'all' } });
  receive('first');
  assert.ok(state.arrivals.chat);
  state.arrivals = {}; state.hubOpen = false; state.folded.right = false; state.rightView = 'log';
  receive('visible');
  assert.deepEqual(state.arrivals, {});
  state.folded.right = true;
  state.arrivals = {};
  receive('first'); receive('self-message', 'self'); receive('blocked', 'blocked', 'Blocked');
  receive('system', null); receive('other-room', 'other', 'Other', 'elsewhere');
  assert.deepEqual(state.arrivals, {});
  state.popupPausedUntil = Date.now() + 60_000;
  receive('paused');
  assert.deepEqual(state.arrivals, {});
  state.popupPausedUntil = Date.now() - 1;
  receive('resumed');
  assert.ok(state.arrivals.chat);
});

test('DM reception targets its conversation and ignores updates and self messages', () => {
  Object.assign(state, { selfName: 'Self', blocked: [], inbox: {}, arrivals: {},
    popupPausedUntil: 0, folded: { right: true } });
  const receive = (id, from = 'Other') => onMessage({ t: 'msg', conv: 'dm:Other\u0000Self', m: { id, from, at: Date.now(), text: 'hello' } });
  receive('first');
  assert.equal(state.arrivals.chat.conversation, 'dm:Other\u0000Self');
  state.arrivals = {};
  receive('first'); receive('self', 'Self');
  assert.deepEqual(state.arrivals, {});
});

test('sessions broadcasts only update the list, even while awaiting creation', async () => {
  const pending = requestSession({ t: 'sessionCreate', name: 'new', topic: '', world: 'room', visibility: 'public' });
  const { requestId } = globalThis.__tonariumWs.sent[0];
  let completed = false;
  pending.then(() => { completed = true; });
  onMessage({ t: 'sessions', list: [{ id: 'someone-elses-session', name: 'other' }] });
  onMessage({ t: 'sessionCreated', sid: 'unmatched', requestId: 'other-request' });
  await Promise.resolve();
  assert.equal(completed, false);
  assert.equal(state.session, 'existing');
  assert.equal(state.hubOpen, true);
  assert.equal(state.mode, '3d');
  assert.equal(state.guild.sessions[0].id, 'someone-elses-session');
  onMessage({ t: 'sessionCreated', sid: 'created', requestId });
  assert.equal((await pending).sid, 'created');
});

test('only the matching request receives an error response without a session ID', async () => {
  const pending = requestSession({ t: 'join', sid: 'forbidden' });
  const { requestId } = globalThis.__tonariumWs.sent[0];
  onMessage({ t: 'sessionResult', requestId, error: '参加できません' });
  await assert.rejects(pending, /参加できません/);
  assert.equal(state.session, 'existing');
});

test('requests fail immediately while disconnected', async () => {
  globalThis.__tonariumWs.readyState = 3;
  await assert.rejects(requestSession({ t: 'leave' }), /接続されていません/);
  assert.equal(globalThis.__tonariumWs.sent.length, 0);
});
