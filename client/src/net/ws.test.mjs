import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

let state, systemReplies = [], systemResets = 0;
const stub = (path, namedExports) => mock.module(new URL(path, import.meta.url).href, { namedExports });
stub('../store.ts', { get: () => state, set: (patch) => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; }, recompute() {}, spawnPoint() {} });
stub('../sessionView.ts', { applyAvatars() {} });
stub('../systems/api.ts', {
  receiveSystemCommandResult(...args) { systemReplies.push(args); },
  resetSystemCommands() { systemResets++; },
});
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
const { onMessage, requestSession, applySessionSnapshot } = await import('./ws.ts');
const { useSystems } = await import('../systems/state.ts');

beforeEach(() => {
  state = { session: 'existing', hubOpen: true, mode: '3d', guild: { name: 'test', sessions: [] } };
  globalThis.__tonariumWs = new WebSocket();
  systemReplies = []; systemResets = 0;
  useSystems.setState({ sid: '', view: undefined, error: undefined });
});

const systemView = revision => ({ revision, map: { schema: 1, id: 'test-map', objects: [], systems: [], connections: [] }, systems: [], objects: {}, seats: {}, diagnostics: [], traces: [] });
test('hammer chat updates replace the same row and new IDs append separately', () => {
  const first = { id: 'hit-1', from: null, text: 'A がピコピコハンマーで B を1回叩きました', at: 1000 };
  Object.assign(state, { chats: {}, selfId: 'self', blocked: [] });
  onMessage({ t: 'chat', sid: 'existing', m: first });
  onMessage({ t: 'chat', sid: 'existing', m: { id: 'other', from: null, text: '別のログ', at: 2000 } });
  const updated = { ...first, text: 'A がピコピコハンマーで B を2回叩きました', hammer: { from: 'a', to: 'b', count: 2, lastHitAt: 3000 } };
  onMessage({ t: 'chat', sid: 'existing', m: updated });
  assert.equal(state.chats.existing.length, 2);
  assert.deepEqual(state.chats.existing[0], updated);
  onMessage({ t: 'chat', sid: 'existing', m: { ...first, id: 'hit-2', at: 14000 } });
  assert.equal(state.chats.existing.length, 3);
  onMessage({ t: 'chat', sid: 'another', m: first });
  assert.equal(state.chats.another.length, 1);
  assert.equal(state.chats.existing.length, 3);
});
test('system results reach their queue even when the attached view is older, while other rooms are ignored', () => {
  const fresh = systemView(9), stale = systemView(8), result = { id: 'input-test', outcome: 'rejected' };
  onMessage({ t: 'systemState', sid: 'existing', view: fresh });
  onMessage({ t: 'systemState', sid: 'existing', view: stale, commandResult: result, error: 'system revision conflict' });
  assert.equal(useSystems.getState().view.revision, 9);
  assert.deepEqual(systemReplies.at(-1), ['existing', stale, result, 'system revision conflict']);
  const count = systemReplies.length;
  onMessage({ t: 'systemState', sid: 'other-room', view: systemView(12), commandResult: result });
  assert.equal(systemReplies.length, count);
  assert.equal(useSystems.getState().view.revision, 9);
});

test('full session recovery clears pending system inputs and restores the matching system and item state', () => {
  Object.assign(state, { selfId: 'self', survivors: {}, chats: {}, avatarsBy: {}, itemsBy: {}, broadcast: {}, worldBy: {}, games: {}, elevators: {} });
  const snapshot = { sid: 'existing', now: Date.now(), chats: [], avatars: {}, items: [{ id: 'test-note', kind: 'note', text: '00:07' }],
    presence: [], broadcast: null, world: 'room', game: null, survivor: null, elevator: null, systems: systemView(7) };
  applySessionSnapshot({ ...snapshot, sid: 'other-room' });
  assert.equal(systemResets, 0);
  applySessionSnapshot(snapshot);
  assert.equal(systemResets, 1);
  assert.equal(useSystems.getState().view.revision, 7);
  assert.equal(state.itemsBy.existing['test-note'].text, '00:07');
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
