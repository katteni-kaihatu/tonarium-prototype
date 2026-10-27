import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

let state, serverSession, calls, errors, request, voiceConnect, voiceLeave;
const set = (patch) => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; };
const stub = (path, namedExports) => mock.module(new URL(path, import.meta.url).href, { namedExports });
stub('./store.ts', {
  get: () => state, set, recompute() {}, spawnPoint: () => ({ x: 0, z: 0, ry: 0 }), save() {}, nameOf: () => '',
  showToast: (error) => errors.push(error), dropSession: (sid) => calls.push(`drop:${sid}`),
});
stub('./net/ws.ts', { send: (msg) => calls.push(msg.t), requestSession: (msg) => request(msg) });
stub('./net/livekit.ts', { connectVoice: (sid) => voiceConnect(sid), leaveVoice: () => voiceLeave() });
stub('./net/session.ts', { startSessionSync: () => calls.push('sync:start'), stopSessionSync: () => calls.push('sync:stop') });
stub('./items/actions.ts', { clampRoomPos: (pos) => pos });
stub('./spatial.ts', { placesOf: () => new Map(), resumeAudio() {} });
stub('./phone.ts', { touchOnly: true });
stub('./walk.ts', { stopWalk() {} });
stub('../../shared/places.ts', { approach() {} });
const { createSession, joinSession, leaveSession, pushNotice, markNoticesRead, removeNotice } = await import('./actions.ts');

beforeEach(() => {
  calls = []; errors = []; serverSession = null;
  state = { session: null, voice: 'off', mode: '2d', hubOpen: true, homePage: 'worlds',
    popupPausedUntil: 0, arrivals: {},
    selfAvatar: { x: 4, z: 2, ry: 1 }, windows: ['old-window'], maxWin: 'old-window', notices: [], selectedNote: null };
  request = async (msg) => {
    calls.push(msg.t);
    if (msg.t === 'sessionCreate') return { t: 'sessionCreated', sid: 'created' };
    if (msg.t === 'join') serverSession = msg.sid;
    if (msg.t === 'leave') serverSession = null;
    return { t: 'sessionResult' };
  };
  voiceConnect = async (sid) => { calls.push(`voice:${sid}`); set({ voice: 'connected' }); };
  voiceLeave = async () => { calls.push('voice:leave'); set({ voice: 'off' }); };
});

function hitClock(t) {
  let now = 100_000;
  mock.method(Date, 'now', () => now);
  t.after(() => mock.restoreAll());
  Object.assign(state, { session: 'room', blocked: [], folded: { right: true } });
  return (next) => { now = next; };
}

for (const delta of [0, 10_000, 10_001, -1]) {
  test(`hit aggregation boundary ${delta}ms`, (t) => {
    const clock = hitClock(t);
    pushNotice('hit', 'a', 'A');
    const first = state.notices[0];
    clock(100_000 + delta);
    pushNotice('hit', 'a', 'A');
    const merged = delta >= 0 && delta <= 10_000;
    assert.equal(state.notices.length, merged ? 1 : 2);
    assert.equal(state.notices[0].count, merged ? 2 : 1);
    assert.equal(state.notices[0].lastHitAt, 100_000 + delta);
    assert.equal(state.notices[0].at, merged ? first.at : 100_000 + delta);
    assert.equal(state.notices[0].id === first.id, merged);
    assert.equal(first.count, 1);
  });
}

test('sender IDs aggregate across renamed users and intervening notices without reordering', (t) => {
  const clock = hitClock(t);
  pushNotice('hit', 'a', 'Same');
  const first = state.notices[0];
  pushNotice('hit', 'b', 'Same');
  pushNotice('poke', 'a', 'Same');
  const others = state.notices.slice(0, 2);
  for (const now of [110_000, 120_000, 130_000]) {
    clock(now);
    pushNotice('hit', 'a', 'Renamed');
  }
  assert.equal(state.notices.length, 3);
  assert.deepEqual(state.notices.slice(0, 2), others);
  assert.deepEqual(state.notices[2], { ...first, fromName: 'Renamed', count: 4, lastHitAt: 130_000 });
});

test('legacy hits default to one and at; only the latest matching hit is considered', (t) => {
  hitClock(t);
  const legacy = { id: -1, kind: 'hit', from: 'a', fromName: 'A', at: 95_000, unread: false };
  state.notices = [legacy];
  pushNotice('hit', 'a', 'A');
  assert.deepEqual(state.notices[0], { ...legacy, count: 2, lastHitAt: 100_000, unread: true });
  for (const lastHitAt of [100_001, 89_999]) {
    const latest = { ...state.notices[0], lastHitAt };
    state.notices = [latest, legacy];
    pushNotice('hit', 'a', 'A');
    assert.equal(state.notices.length, 3);
    assert.equal(state.notices[0].count, 1);
    assert.equal(state.notices[1], latest);
    assert.equal(state.notices[2], legacy);
  }
});

test('removed or evicted hit targets start new rows within the 30 notice limit', (t) => {
  hitClock(t);
  pushNotice('hit', 'a', 'A');
  const id = state.notices[0].id;
  removeNotice(id);
  pushNotice('hit', 'a', 'A');
  assert.notEqual(state.notices[0].id, id);
  const evicted = state.notices[0].id;
  for (let i = 0; i < 30; i++) pushNotice('poke', 'b', 'B');
  assert.equal(state.notices.length, 30);
  assert.ok(!state.notices.some(n => n.id === evicted));
  pushNotice('hit', 'a', 'A');
  assert.equal(state.notices.length, 30);
  assert.equal(state.notices[0].count, 1);
  assert.notEqual(state.notices[0].id, evicted);
});

test('merged hits become unread, obey popup conditions, and block before any update', (t) => {
  const clock = hitClock(t);
  pushNotice('hit', 'a', 'A');
  for (const [now, patch, popup] of [
    [101_000, {}, true],
    [102_000, { hubOpen: false, folded: { right: false }, rightView: 'log' }, false],
    [103_000, { folded: { right: true }, popupPausedUntil: 104_000 }, false],
    [104_000, {}, true],
  ]) {
    const before = state.notices[0];
    markNoticesRead();
    assert.deepEqual(state.notices[0], { ...before, unread: false });
    Object.assign(state, patch, { arrivals: {} });
    clock(now);
    pushNotice('hit', 'a', 'A');
    assert.equal(state.notices[0].unread, true);
    assert.equal(state.notices[0].count, before.count + 1);
    assert.equal(!!state.arrivals.notice, popup);
    if (popup) assert.equal(state.arrivals.notice.at, now);
  }
  state.blocked = ['A'];
  const before = state;
  pushNotice('hit', 'a', 'A');
  pushNotice('hit', 'b', 'A');
  assert.equal(state, before);
});

test('creation joins the returned session and connects voice through the shared join flow', async () => {
  await createSession('test', '', 'room', 'public');
  assert.equal(state.session, 'created');
  assert.equal(serverSession, 'created');
  assert.equal(state.voice, 'connected');
  assert.equal(state.hubOpen, false);
  assert.ok(calls.indexOf('sessionCreate') < calls.indexOf('join'));
  assert.ok(calls.includes('sync:start'));
  assert.deepEqual(errors, []);
});

test('new notices respect shared pause without changing unread handling', () => {
  Object.assign(state, { session: 'room', blocked: [], folded: { right: true },
    arrivals: {}, popupPausedUntil: 0 });
  pushNotice('poke', 'other', 'Other');
  assert.equal(state.notices[0].unread, true);
  assert.equal(state.arrivals.notice.kind, 'notice');
  state.arrivals = {}; state.hubOpen = false; state.folded.right = false; state.rightView = 'log';
  pushNotice('poke', 'other', 'Other');
  assert.deepEqual(state.arrivals, {});
  state.folded.right = true;
  state.arrivals = {}; state.popupPausedUntil = Date.now() + 60_000;
  pushNotice('poke', 'other', 'Other');
  assert.equal(state.notices.length, 3);
  assert.deepEqual(state.arrivals, {});
  state.popupPausedUntil = Date.now() - 1;
  pushNotice('poke', 'other', 'Other');
  assert.ok(state.arrivals.notice);
});

test('leaving and reentering clear popup pause and queued arrivals', async () => {
  await joinSession('room');
  state.popupPausedUntil = Date.now() + 60_000;
  state.arrivals = { chat: { kind: 'chat', at: Date.now() } };
  await leaveSession();
  assert.equal(state.popupPausedUntil, 0);
  assert.deepEqual(state.arrivals, {});
  state.popupPausedUntil = Date.now() + 60_000;
  await joinSession('room');
  assert.equal(state.popupPausedUntil, 0);
  assert.deepEqual(state.arrivals, {});
});

test('moving waits for both the old server membership and voice to leave', async () => {
  state.session = serverSession = 'old'; state.voice = 'connected';
  let finishLeave;
  voiceLeave = () => new Promise((resolve) => { finishLeave = () => { calls.push('voice:left'); resolve(); }; });
  const moving = createSession('test', '', 'room', 'public');
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(calls.includes('leave'));
  assert.ok(!calls.includes('join'));
  finishLeave();
  await moving;
  assert.ok(calls.indexOf('voice:left') < calls.indexOf('join'));
  assert.equal(serverSession, 'created');
  assert.equal(state.session, 'created');
});

test('creation rejection does not join or leave any session', async () => {
  for (const existing of [null, 'old']) {
    state.session = serverSession = existing;
    const before = { ...state };
    request = async () => { throw new Error('作成できません'); };
    await createSession('', '', 'room', 'group', 'not-a-member');
    assert.deepEqual(state, before);
    assert.equal(serverSession, existing);
  }
  assert.ok(!calls.includes('join'));
  assert.ok(!calls.includes('leave'));
  assert.equal(errors.length, 2);
});

test('moving also waits for the server to acknowledge leaving', async () => {
  state.session = serverSession = 'old'; state.voice = 'connected';
  const originalRequest = request;
  let finishLeave;
  request = (msg) => msg.t === 'leave'
    ? new Promise((resolve) => { finishLeave = async () => resolve(await originalRequest(msg)); })
    : originalRequest(msg);
  const moving = createSession('test', '', 'room', 'public');
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(calls.includes('voice:leave'));
  assert.ok(!calls.includes('join'));
  await finishLeave();
  await moving;
  assert.equal(serverSession, 'created');
});

test('a lost join reply is followed by leave so server membership is not retained', async () => {
  const originalRequest = request;
  request = async (msg) => {
    const reply = await originalRequest(msg);
    if (msg.t === 'join') throw new Error('応答が届きません');
    return reply;
  };
  await createSession('test', '', 'room', 'public');
  assert.equal(serverSession, null);
  assert.equal(state.session, null);
  assert.deepEqual(errors, ['応答が届きません']);
});

test('join rejection restores the previous session and view', async () => {
  state.session = serverSession = 'old'; state.voice = 'connected'; state.mode = '3d';
  const before = { ...state };
  const originalRequest = request;
  request = async (msg) => {
    if (msg.t === 'join' && msg.sid === 'created') throw new Error('参加できません');
    return originalRequest(msg);
  };
  await createSession('test', '', 'room', 'public');
  assert.equal(serverSession, 'old');
  assert.deepEqual(state, before);
  assert.deepEqual(errors, ['参加できません']);
});

test('voice connection failure leaves the new session and restores the previous session', async () => {
  state.session = serverSession = 'old'; state.voice = 'connected';
  const originalConnect = voiceConnect;
  voiceConnect = async (sid) => sid === 'created' ? set({ voice: 'unavailable' }) : originalConnect(sid);
  await createSession('test', '', 'room', 'public');
  assert.equal(serverSession, 'old');
  assert.equal(state.session, 'old');
  assert.equal(state.voice, 'connected');
  assert.deepEqual(errors, ['通話に接続できませんでした']);
});

test('failed initial voice connection returns to home without joining anywhere', async () => {
  const before = { ...state };
  voiceConnect = async () => set({ voice: 'unavailable' });
  await createSession('test', '', 'room', 'public');
  assert.equal(serverSession, null);
  assert.deepEqual(state, before);
  assert.equal(errors.length, 1);
});

test('ordinary joins retain the existing ability to participate without voice', async () => {
  voiceConnect = async () => set({ voice: 'unavailable' });
  await joinSession('existing');
  assert.equal(state.session, 'existing');
  assert.deepEqual(errors, []);
});
