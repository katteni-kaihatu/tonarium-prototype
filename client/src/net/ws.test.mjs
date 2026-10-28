import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

let state, systemReplies = [], systemResets = 0, notices = [], hits = [], chatSounds = 0, chatSoundAttempts = 0, chatAudioRunning = true;
const stub = (path, namedExports) => mock.module(new URL(path, import.meta.url).href, { namedExports });
stub('../ai/support.ts', { setAiSupportTransport() {}, handleAiSupportMessage() {} });
stub('../store.ts', { get: () => state, set: (patch) => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; }, recompute() {}, spawnPoint() {} });
stub('../sessionView.ts', { applyAvatars() {} });
stub('../systems/api.ts', {
  receiveSystemCommandResult(...args) { systemReplies.push(args); },
  resetSystemCommands() { systemResets++; },
});
stub('../items/actions.ts', { applyDelta() {} });
stub('../items/effects.ts', { onHit(...args) { hits.push(args); } });
stub('../actions.ts', { pushNotice(...args) { notices.push(args); } });
stub('../spatial.ts', { volumeFrom() {} });
stub('../world/sounds.ts', { playPoke() {}, playSynth() {}, playChatNotification() { chatSoundAttempts++; if (chatAudioRunning) chatSounds++; } });
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
  state = { session: 'existing', hubOpen: true, mode: '3d', guild: { name: 'test', sessions: [] },
    users: [], audioVol: { fx: 0.5 }, chatNotificationSound: true, popupPausedUntil: 0,
    selfId: 'self', selfName: 'Self', blocked: [], chats: {}, inbox: {}, arrivals: {} };
  globalThis.__tonariumWs = new WebSocket();
  systemReplies = []; systemResets = 0;
  notices = []; hits = [];
  chatSounds = 0; chatSoundAttempts = 0; chatAudioRunning = true;
  useSystems.setState({ sid: '', view: undefined, error: undefined });
});

const systemView = revision => ({ revision, map: { schema: 1, id: 'test-map', objects: [], systems: [], connections: [] }, systems: [], objects: {}, seats: {}, diagnostics: [], traces: [] });

function chatReceiver(kind, prefix) {
  const conv = `${kind}:${prefix}`;
  return {
    conv,
    message: (id, from = 'Other') => ({ id: `${prefix}-${id}`, from, fromName: from, text: 'same text', at: 100 }),
    receive(m) { onMessage(kind === 'session' ? { t: 'chat', sid: state.session, m } : { t: 'msg', conv, m }); },
    history(messages) {
      if (kind === 'session') {
        Object.assign(state, { survivors: {}, avatarsBy: {}, itemsBy: {}, broadcast: {}, worldBy: {}, games: {}, elevators: {} });
        applySessionSnapshot({ sid: state.session, now: 100, chats: messages, avatars: {}, items: [], presence: [],
          broadcast: null, world: 'room', game: null, survivor: null, elevator: null });
      } else onMessage({ t: 'inbox', convs: { [conv]: messages }, reads: {}, people: [], watching: [], recentStatus: {} });
    },
  };
}

for (const kind of ['session', 'dm', 'channel']) {
  test(`${kind}: live messages sound once across mode switches, updates and exclusions`, () => {
    const r = chatReceiver(kind, `${kind}-eligibility`);
    state.hubOpen = false; state.folded = { right: false }; state.rightView = kind === 'session' ? 'log' : 'msg';
    state.rightConversation = r.conv;
    r.receive(r.message('first'));
    assert.equal(chatSounds, 1);
    assert.deepEqual(state.arrivals, {});
    state.mode = '2d';
    r.receive(r.message('first'));
    r.receive({ ...r.message('first'), text: 'edited', at: 999 });
    r.receive(r.message('self', kind === 'session' ? 'self' : 'Self'));
    state.blocked = ['Blocked'];
    r.receive(r.message('blocked', 'Blocked'));
    r.receive(r.message('log', null)); r.receive(r.message('empty-log', ''));
    state.blocked = [];
    r.receive(r.message('blocked', 'Blocked'));
    r.receive(r.message('log')); r.receive(r.message('empty-log'));
    if (kind === 'session') onMessage({ t: 'chat', sid: 'elsewhere', m: r.message('wrong-session') });
    assert.equal(chatSounds, 1);
    state.folded.right = true;
    r.receive(r.message('next'));
    assert.equal(chatSounds, 2);
    assert.ok(state.arrivals.chat);
    state.session = null;
    if (kind !== 'session') {
      r.receive(r.message('home'));
      assert.equal(chatSounds, 2);
    }
  });

  test(`${kind}: history replacement and display eviction retain known IDs`, () => {
    const r = chatReceiver(kind, `${kind}-history`);
    const old = r.message('old'), live = r.message('live'), restored = r.message('restored');
    r.history([old]);
    assert.equal(chatSounds, 0);
    r.receive(old);
    assert.equal(chatSounds, 0);
    r.receive(live);
    assert.equal(chatSounds, 1);
    r.history([restored]);
    r.receive(old); r.receive(live); r.receive(restored);
    assert.equal(chatSounds, 1);
    const limit = kind === 'session' ? 500 : 300;
    for (let i = 0; i <= limit; i++) r.receive(r.message(`fill-${i}`));
    const displayed = kind === 'session' ? state.chats[state.session] : state.inbox[r.conv];
    assert.equal(displayed.length, limit);
    assert.equal(displayed.some((m) => m.id === live.id), false);
    const before = chatSounds;
    r.receive(live); r.receive(old);
    assert.equal(chatSounds, before);
    r.history([]);
    r.receive(live); r.receive(restored);
    assert.equal(chatSounds, before);
  });

  test(`${kind}: suppressed arrivals are consumed and only future messages sound`, () => {
    const r = chatReceiver(kind, `${kind}-suppression`);
    const suppressions = [
      () => { state.chatNotificationSound = false; },
      () => { state.audioVol.fx = 0; },
      () => { state.users = [{ id: 'self', status: 'busy' }]; },
      () => { state.popupPausedUntil = Date.now() + 60_000; },
    ];
    for (const [i, suppress] of suppressions.entries()) {
      suppress();
      r.receive(r.message(`suppressed-${i}`));
      const before = chatSounds;
      state.chatNotificationSound = true; state.audioVol.fx = 0.5; state.users = []; state.popupPausedUntil = 0;
      r.receive(r.message(`suppressed-${i}`));
      assert.equal(chatSounds, before);
      r.receive(r.message(`future-${i}`));
      assert.equal(chatSounds, before + 1);
    }
  });

  test(`${kind}: unavailable audio preserves receipt and popups without replay on unlock`, () => {
    const r = chatReceiver(kind, `${kind}-audio-unlock`);
    state.folded = { right: true };
    chatAudioRunning = false;
    r.receive(r.message('locked'));
    assert.equal(chatSounds, 0);
    assert.equal(chatSoundAttempts, 1);
    assert.ok(state.arrivals.chat);
    const displayed = kind === 'session' ? state.chats[state.session] : state.inbox[r.conv];
    assert.equal(displayed.at(-1).id, r.message('locked').id);
    chatAudioRunning = true;
    state.mode = '2d';
    r.receive(r.message('locked'));
    assert.equal(chatSoundAttempts, 1);
    r.receive(r.message('future'));
    assert.equal(chatSounds, 1);
  });
}

test('known IDs survive session changes and remain isolated by session and conversation', () => {
  const r = chatReceiver('session', 'scope-lifetime');
  const message = r.message('same-id');
  r.receive(message);
  state.session = 'second-session';
  r.receive(message);
  assert.equal(chatSounds, 2);
  state.session = 'existing'; state.chats = {};
  r.history([]);
  r.receive(message);
  assert.equal(chatSounds, 2);
  for (const conv of ['dm:scope-a', 'channel:scope-b']) {
    onMessage({ t: 'msg', conv, m: message });
    onMessage({ t: 'msg', conv, m: message });
  }
  assert.equal(chatSounds, 4);
});
test('2d and 3d share the self-only same-session hit notification path and retain effects', () => {
  state.selfId = 'self';
  for (const mode of ['2d', '3d']) {
    state.mode = mode;
    onMessage({ t: 'hit', sid: 'existing', from: 'a', to: 'self' });
    onMessage({ t: 'hit', sid: 'existing', from: 'a', to: 'other' });
    onMessage({ t: 'hit', sid: 'elsewhere', from: 'a', to: 'self' });
  }
  assert.deepEqual(notices, [['hit', 'a'], ['hit', 'a']]);
  assert.deepEqual(hits, [['a', 'self'], ['a', 'other'], ['a', 'self'], ['a', 'other']]);
});
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
