import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserAiBroker, browserAiText } from './browser-ai.ts';
import { BROWSER_AI_MODEL, type BrowserAiGeneration, type BrowserAiJob, type BrowserAiServerMsg } from '../shared/ai-support.ts';

const request = (kind: 'npc' | 'gm' = 'npc'): BrowserAiGeneration => ({ kind, requestId: 'test-request', messages: [{ role: 'system', content: 'Allowed public facts.' }, { role: 'user', content: 'Tell me a story.' }], maxTokens: 96, temperature: .7 });
const ready = (epoch = 'epoch-1', enabled = true) => ({ t: 'aiSupport', epoch, ready: enabled, model: BROWSER_AI_MODEL });
const reply = (job: BrowserAiJob, text = 'A quiet evening at the inn.') => ({ t: 'aiSupportResult', leaseId: job.leaseId, epoch: job.epoch, text });
function fixture(options: ConstructorParameters<typeof BrowserAiBroker>[1] = {}) {
  const sent: BrowserAiServerMsg[] = []; const broker = new BrowserAiBroker(message => sent.push(message), options);
  const job = () => { const last = sent.findLast(message => message.t === 'aiSupportJob'); assert.ok(last?.t === 'aiSupportJob'); return last.job; };
  return { broker, sent, job };
}

test('readiness requires the exact supported model, epoch and message envelope', async () => {
  const { broker, sent } = fixture();
  for (const value of [null, {}, { ...ready(), model: 'another-model' }, { ...ready(), epoch: '' }, { ...ready(), epoch: '../user' }, { ...ready(), ready: 1 }, { ...ready(), user: 'other' }]) assert.equal(broker.setReady(value), false);
  assert.equal(await broker.generate(request(), new AbortController().signal), undefined); assert.equal(sent.length, 0);
  assert.equal(broker.setReady(ready()), true); broker.close(); assert.equal(broker.setReady(ready('new')), false);
});

test('one connection lends one bounded cloned job and accepts its matching result only once', async () => {
  let now = 1000; const { broker, sent, job } = fixture({ now: () => now }); assert.ok(broker.setReady(ready()));
  const input = request(), generation = broker.generate(input, new AbortController().signal);
  input.messages[0].content = 'changed'; assert.equal(job().messages[0].content, 'Allowed public facts.');
  assert.equal(job().expiresAt, now + 20000); assert.match(job().leaseId, /^[a-f0-9-]{36}$/);
  assert.equal(await broker.generate(request(), new AbortController().signal), undefined); assert.equal(sent.length, 1);
  const result = reply(job()); assert.equal(broker.result(result), true); assert.equal(await generation, result.text);
  assert.equal(broker.result(result), false); now++; broker.close();
});

test('wrong leases, other connections and changed epochs cannot answer a pending job', async () => {
  const a = fixture(), b = fixture(); a.broker.setReady(ready()); b.broker.setReady(ready());
  const first = a.broker.generate(request(), new AbortController().signal), second = b.broker.generate(request(), new AbortController().signal);
  assert.equal(a.broker.result(reply(b.job())), false); assert.equal(a.broker.result({ ...reply(a.job()), epoch: 'foreign' }), false);
  assert.equal(a.broker.setReady(ready('epoch-2')), true); assert.equal(await first, undefined);
  assert.ok(a.sent.some(message => message.t === 'aiSupportCancel' && message.epoch === 'epoch-1'));
  assert.equal(a.broker.result(reply(a.job())), false); b.broker.close(); assert.equal(await second, undefined);
});

test('switching off, aborting, disconnecting and transport failure always release the request', async () => {
  for (const operation of ['off', 'abort', 'close'] as const) {
    const { broker, sent, job } = fixture(); broker.setReady(ready()); const controller = new AbortController();
    const pending = broker.generate(request(), controller.signal); const old = job();
    if (operation === 'off') broker.setReady(ready('epoch-1', false)); else if (operation === 'abort') controller.abort(); else broker.close();
    assert.equal(await pending, undefined); assert.equal(broker.result(reply(old)), false);
    assert.equal(sent.filter(message => message.t === 'aiSupportCancel').length, 1);
  }
  const failing = new BrowserAiBroker(() => { throw new Error('closed socket'); }); failing.setReady(ready());
  assert.equal(await failing.generate(request(), new AbortController().signal), undefined); failing.close();
});

test('timeout and injected clock expiry fall back without accepting a late result', async () => {
  const timed = fixture({ timeoutMs: 10 }); timed.broker.setReady(ready());
  assert.equal(await timed.broker.generate(request(), new AbortController().signal), undefined);
  assert.ok(timed.sent.some(message => message.t === 'aiSupportCancel')); assert.equal(timed.broker.result(reply(timed.job())), false);
  let now = 0; const clock = fixture({ now: () => now }); clock.broker.setReady(ready());
  const pending = clock.broker.generate(request(), new AbortController().signal); now = 20000;
  assert.equal(clock.broker.result(reply(clock.job())), false); assert.equal(await pending, undefined);
});

test('ending a life cancels its lease without disabling later conversations', async () => {
  const { broker, sent, job } = fixture(); broker.setReady(ready());
  const first = broker.generate(request(), new AbortController().signal), previous = job();
  broker.cancelPending(); assert.equal(await first, undefined); assert.equal(broker.result(reply(previous)), false);
  assert.equal(sent.filter(message => message.t === 'aiSupportCancel').length, 1);
  const next = broker.generate(request(), new AbortController().signal);
  assert.notEqual(job().leaseId, previous.leaseId); assert.equal(broker.result(reply(job())), true);
  assert.equal(await next, 'A quiet evening at the inn.'); broker.close();
});

test('client failures, malformed envelopes and structured commands never become spoken answers', async () => {
  for (const invalid of [null, 3, '', '   ', '{}', '[{"action":"buy"}]', '```json\n{}\n```', 'Please execute {"actions":[]}', '<tool_call>buy</tool_call>', 'hello\u0000world', '<think>hidden', 'x'.repeat(1201)]) {
    const { broker, job } = fixture(); broker.setReady(ready()); const pending = broker.generate(request(), new AbortController().signal);
    assert.equal(broker.result({ ...reply(job()), text: invalid }), false, String(invalid)); assert.equal(await pending, undefined); broker.close();
  }
  const { broker, job } = fixture(); broker.setReady(ready()); const pending = broker.generate(request(), new AbortController().signal);
  assert.equal(broker.result({ ...reply(job()), actions: [] }), false); assert.equal(await pending, undefined);
  const next = broker.generate(request(), new AbortController().signal);
  assert.equal(broker.result({ t: 'aiSupportResult', leaseId: job().leaseId, epoch: job().epoch, error: 'unavailable' }), true);
  assert.equal(await next, undefined); broker.close();
});

test('thinking is stripped, visible bounds differ for NPC and GM, and no text is truncated into validity', async () => {
  assert.equal(browserAiText('<think>private reasoning</think> Hello.', 1200), 'Hello.');
  assert.equal(browserAiText('Hi <think>incomplete', 1200), 'Hi');
  assert.equal(browserAiText('orphan</think>answer', 1200), undefined);
  assert.equal(browserAiText('x'.repeat(1201), 1200), undefined); assert.equal(browserAiText('x'.repeat(2400), 2400)?.length, 2400);
  for (const kind of ['npc', 'gm'] as const) {
    const { broker, job } = fixture(); broker.setReady(ready()); const pending = broker.generate(request(kind), new AbortController().signal);
    const text = kind === 'npc' ? 'x'.repeat(1200) : 'x'.repeat(2400);
    assert.equal(broker.result(reply(job(), `<think>hidden</think>${text}`)), true); assert.equal(await pending, text); broker.close();
  }
});

test('bad server requests and already aborted signals never leave the server', async () => {
  const { broker, sent } = fixture(); broker.setReady(ready());
  for (const invalid of [{ ...request(), maxTokens: 257 }, { ...request(), temperature: Infinity }, { ...request(), messages: [] }, { ...request(), messages: [{ role: 'tool', content: 'bad' }] }, { ...request(), messages: [{ role: 'user', content: 'x'.repeat(20001) }] }, { ...request(), extra: 'state' }]) {
    assert.equal(await broker.generate(invalid as BrowserAiGeneration, new AbortController().signal), undefined);
  }
  const controller = new AbortController(); controller.abort();
  assert.equal(await broker.generate(request(), controller.signal), undefined); assert.equal(sent.length, 0); broker.close();
});

const cooperative = (change: Partial<{ shareIdle: boolean; allowRemote: boolean; idle: boolean }> = {}, enabled = true) => ({
  ...ready('cooperative-epoch', enabled), cooperation: { version: 2, shareIdle: true, allowRemote: true, idle: true, ...change },
});

test('legacy readiness remains self-only and only an exact version-two choice permits cooperation', async () => {
  const { broker } = fixture();
  broker.setReady(ready()); assert.equal(broker.available, true); assert.equal(broker.acceptsShared, false); assert.equal(broker.allowsRemote, false);
  for (const cooperation of [{ version: 1, shareIdle: true, allowRemote: true, idle: true },
    { version: 2, shareIdle: true, allowRemote: true }, { version: 2, shareIdle: 1, allowRemote: true, idle: true },
    { version: 2, shareIdle: true, allowRemote: true, idle: true, user: 'someone' }]) {
    assert.equal(broker.setReady({ ...ready(), cooperation }), false);
  }
  assert.equal(broker.setReady(cooperative({}, false)), true);
  assert.equal(broker.available, false); assert.equal(broker.acceptsShared, false); assert.equal(broker.allowsRemote, true);
  broker.setReady(cooperative({ allowRemote: false })); assert.equal(broker.acceptsShared, true); assert.equal(broker.allowsRemote, false);
  broker.setReady(ready()); assert.equal(broker.acceptsShared, false); assert.equal(broker.allowsRemote, false);
  broker.close(); assert.equal(broker.closed, true); assert.equal(broker.available, false);
});

test('shared jobs replace the request ID, clone only their payload and cannot be answered twice', async () => {
  const { broker, job } = fixture(); broker.setReady(cooperative());
  const input = request(), pending = broker.generateShared(input, new AbortController().signal);
  input.messages[0].content = 'A subsequent private mutation.';
  assert.equal(job().scope, 'shared'); assert.notEqual(job().requestId, input.requestId); assert.match(job().requestId, /^[a-f0-9-]{36}$/);
  assert.equal(job().messages[0].content, 'Allowed public facts.'); assert.equal(broker.pendingScope, 'shared');
  assert.equal(broker.available, false); assert.equal(broker.acceptsShared, false);
  const result = reply(job()); assert.equal(broker.result(result), true); assert.equal(await pending, result.text);
  assert.equal(broker.result(result), false); assert.equal(broker.available, true); broker.close();
});

test('shared preemption waits for fresh readiness while cancelShared never cancels a personal job', async () => {
  const { broker, job, sent } = fixture(); broker.setReady(cooperative());
  const pending = broker.generateShared(request(), new AbortController().signal), abandoned = job();
  broker.cancelShared(); assert.equal(await pending, undefined); assert.equal(broker.available, false); assert.equal(broker.allowsRemote, true);
  assert.equal(broker.result(reply(abandoned)), false); assert.equal(sent.filter(message => message.t === 'aiSupportCancel').length, 1);
  assert.equal(await broker.generate(request(), new AbortController().signal), undefined);
  broker.setReady(cooperative()); const own = broker.generate(request(), new AbortController().signal);
  broker.cancelShared(); assert.equal(broker.pendingScope, 'self'); assert.equal(broker.result(reply(job())), true);
  assert.equal(await own, 'A quiet evening at the inn.'); broker.close();
});

test('revoked sharing, busy conversation, expiry and failed shared responses release only their lease', async () => {
  for (const change of [{ shareIdle: false }, { idle: false }]) {
    const { broker, job } = fixture(); broker.setReady(cooperative());
    const pending = broker.generateShared(request(), new AbortController().signal), previous = job();
    broker.setReady(cooperative(change)); assert.equal(await pending, undefined);
    assert.equal(broker.result(reply(previous)), false); assert.equal(broker.available, false); broker.close();
  }
  for (const operation of ['expiry', 'abort', 'failure'] as const) {
    let now = 0;
    const { broker, job, sent } = fixture({ now: () => now }); broker.setReady(cooperative());
    const controller = new AbortController(), pending = broker.generateShared(request(), controller.signal), previous = job();
    if (operation === 'expiry') { now = 20_000; assert.equal(broker.result(reply(previous)), false); }
    else if (operation === 'abort') controller.abort();
    else assert.equal(broker.result({ t: 'aiSupportResult', leaseId: previous.leaseId, epoch: previous.epoch, error: 'unavailable' }), true);
    assert.equal(await pending, undefined); assert.equal(broker.available, false); assert.equal(broker.pendingScope, undefined);
    assert.equal(sent.filter(message => message.t === 'aiSupportCancel').length, 1); assert.equal(broker.result(reply(previous)), false); broker.close();
  }
});
