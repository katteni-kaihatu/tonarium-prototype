import test from 'node:test';
import assert from 'node:assert/strict';
import { readDialogueResponse, spokenPrefix } from './dialogue-stream.ts';
import { createLocalInferenceScheduler } from './local-inference.ts';
import { BrowserAiBroker } from './browser-ai.ts';
import { BrowserAiPool } from './browser-ai-pool.ts';
import { BROWSER_AI_MODEL, type BrowserAiJob, type BrowserAiGeneration, type BrowserAiServerMsg } from '../shared/ai-support.ts';

const encoder = new TextEncoder();
const frame = (content: string) => `data: ${JSON.stringify({ model: 'stream-model', choices: [{ delta: { content } }] })}\n\n`;
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function bounded<T>(promise: Promise<T>, milliseconds = 400): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Test response did not finish promptly')), milliseconds);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
function liveResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>, cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({ start(value) { controller = value; }, cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'text/event-stream' } });
  return { response, send: (value: string) => controller.enqueue(encoder.encode(value)), close: () => { try { controller.close(); } catch {} }, get cancelled() { return cancelled; } };
}
const generation = (id = 'stream-request'): BrowserAiGeneration => ({ requestId: id, kind: 'npc', maxTokens: 80, temperature: .7, messages: [{ role: 'user', content: 'A quiet thought, please.' }] });

test('spoken prefixes hide complete and fragmented thinking blocks without exposing their contents', () => {
  assert.equal(spokenPrefix('  <thi'), ''); assert.equal(spokenPrefix('<think>private thought'), '');
  assert.equal(spokenPrefix('<think>private thought</think> 안녕'), '안녕');
  assert.equal(spokenPrefix('Hello <think>hidden'), 'Hello '); assert.equal(spokenPrefix('Hello <think>hidden</think>world'), 'Hello world');
  assert.equal(spokenPrefix('\u0000  hello\u0007'), 'hello'); assert.equal(spokenPrefix('1234567', 4), '1234');
});

test('SSE parser decodes Korean and Japanese split across every UTF-8 byte and CRLF event boundary', async () => {
  const bytes = encoder.encode(frame('<think>숨긴 생각</think>안녕하세요. 日本語も話せます。').replace(/\n/g, '\r\n') + 'data: [DONE]\r\n\r\n');
  let index = 0;
  const response = new Response(new ReadableStream<Uint8Array>({ pull(controller) { if (index < bytes.length) controller.enqueue(bytes.slice(index, ++index)); else controller.close(); } }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
  const progress: string[] = [], answer = await readDialogueResponse(response, value => progress.push(value));
  assert.equal(answer.text, '안녕하세요. 日本語も話せます。'); assert.equal(answer.model, 'stream-model');
  assert.ok(progress.some(value => value === answer.text)); assert.equal(progress.some(value => /숨긴|think|\uFFFD/.test(value)), false);
});

test('a spoken prefix arrives before the response finishes rather than being buffered to the end', async () => {
  const stream = liveResponse(), progress: string[] = []; let finished = false;
  const reading = readDialogueResponse(stream.response, value => progress.push(value)).finally(() => { finished = true; });
  stream.send(frame('Welcome')); await tick(); await tick();
  assert.deepEqual(progress, ['Welcome']); assert.equal(finished, false);
  stream.send(frame(' home.')); stream.close();
  assert.equal((await reading).text, 'Welcome home.'); assert.deepEqual(progress, ['Welcome', 'Welcome home.']);
});

test('DONE terminates and cancels an open backend connection immediately after the final spoken text', async () => {
  const stream = liveResponse();
  const reading = readDialogueResponse(stream.response);
  stream.send(frame('The fire is warm.') + 'data: [DONE]\n\n');
  try { assert.equal((await bounded(reading)).text, 'The fire is warm.'); assert.equal(stream.cancelled, true); }
  finally { stream.close(); await reading.catch(() => {}); }
});

test('JSON backend compatibility is preserved and never fabricates progress frames', async () => {
  const progress: string[] = [], response = new Response(JSON.stringify({ model: 'legacy', choices: [{ message: { content: '<think>hidden</think>  Rest here.' } }] }), { headers: { 'Content-Type': 'application/json' } });
  const answer = await readDialogueResponse(response, value => progress.push(value)); assert.deepEqual(answer, { model: 'legacy', text: 'Rest here.' }); assert.deepEqual(progress, []);
  await assert.rejects(readDialogueResponse(new Response(JSON.stringify({ choices: [{ message: { content: { tool: true } } }] }))), /spoken answer/);
});

test('malformed SSE JSON rejects the answer and cancels its still-open reader', async () => {
  const stream = liveResponse(), reading = readDialogueResponse(stream.response); stream.send('data: {broken-json}\n\n');
  await assert.rejects(reading, SyntaxError); assert.equal(stream.cancelled, true);
});

test('an upstream SSE error after partial text cannot silently become a successful final answer', async () => {
  const stream = liveResponse(), progress: string[] = [], reading = readDialogueResponse(stream.response, value => progress.push(value));
  stream.send(frame('A partial thought.')); await tick(); stream.send('data: {"error":{"message":"backend failed"}}\n\n');
  try { await assert.rejects(bounded(reading), /error|failed|invalid/i); assert.deepEqual(progress, ['A partial thought.']); assert.equal(stream.cancelled, true); }
  finally { stream.close(); await reading.catch(() => {}); }
});

test('role-only deltas and usage-only terminal frames are valid while output and wire limits remain bounded', async () => {
  const response = new Response(`data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n${frame('Hello.')}data: {"choices":[],"usage":{"completion_tokens":2}}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
  assert.equal((await readDialogueResponse(response)).text, 'Hello.');
  const tooLong = liveResponse(), raw = readDialogueResponse(tooLong.response, undefined, 10); tooLong.send(frame('x'.repeat(81))); await assert.rejects(raw, /limit/); assert.equal(tooLong.cancelled, true);
  const tooLarge = liveResponse(), wire = readDialogueResponse(tooLarge.response); tooLarge.send(':' + 'x'.repeat(262144)); await assert.rejects(wire, /limit/); assert.equal(tooLarge.cancelled, true);
});

test('a model slot remains held while a streaming body is active and progress reaches the caller promptly', async () => {
  const backend = liveResponse(), seen: string[] = [];
  const schedule = createLocalInferenceScheduler((async input => { seen.push(String(input)); return seen.length === 1 ? backend.response : new Response('second'); }) as typeof fetch, { concurrency: 1 });
  const first = await schedule('http://local/first'), second = schedule('http://local/second'), progress: string[] = [];
  const reading = readDialogueResponse(first, value => progress.push(value)); backend.send(frame('First words')); await tick(); await tick();
  assert.deepEqual(progress, ['First words']); assert.deepEqual(seen, ['http://local/first']);
  backend.send('data: [DONE]\n\n'); backend.close(); await reading;
  assert.equal(await (await bounded(second)).text(), 'second'); assert.equal(seen.length, 2);
});

test('consumer cancellation returns a streaming model slot before starting the queued job', async () => {
  const backend = liveResponse(); let calls = 0;
  const schedule = createLocalInferenceScheduler((async () => ++calls === 1 ? backend.response : new Response('next')) as typeof fetch, { concurrency: 1 });
  const first = await schedule('http://local/first'), next = schedule('http://local/next');
  backend.send(frame('unused partial')); await tick(); await first.body!.cancel();
  assert.equal(backend.cancelled, true); assert.equal(await (await bounded(next)).text(), 'next');
});

test('aborting an active stream frees its slot even when the consumer abandoned a backpressured response', async () => {
  const backend = liveResponse(), controller = new AbortController(); let calls = 0;
  const schedule = createLocalInferenceScheduler((async () => ++calls === 1 ? backend.response : new Response('after abort')) as typeof fetch, { concurrency: 1 });
  const first = await schedule('http://local/first', { signal: controller.signal }); backend.send(frame('buffered')); await tick(); await tick();
  const next = schedule('http://local/next'); controller.abort();
  try { assert.equal(await (await bounded(next)).text(), 'after abort'); assert.equal(backend.cancelled, true); }
  finally { await first.body!.cancel().catch(() => {}); backend.close(); await next; }
});

test('browser stream leases reject wrong ownership, stale sequence, malformed chunks and late frames', async t => {
  const messages: BrowserAiServerMsg[] = [], progress: string[] = [];
  const broker = new BrowserAiBroker(message => messages.push(message)); t.after(() => broker.close());
  assert.equal(broker.setReady({ t: 'aiSupport', ready: true, epoch: 'epoch-one', model: BROWSER_AI_MODEL }), true);
  const answer = broker.generate(generation(), new AbortController().signal, undefined, part => progress.push(part));
  const job = (messages[0] as { job: BrowserAiJob }).job;
  const chunk = (sequence: number, text = 'Hello') => ({ t: 'aiSupportChunk', leaseId: job.leaseId, epoch: job.epoch, sequence, text });
  assert.equal(broker.result({ ...chunk(1), leaseId: 'somebody-else' }), false); assert.equal(broker.result({ ...chunk(1), epoch: 'old-epoch' }), false);
  assert.equal(broker.result(chunk(0)), false); assert.equal(broker.result(chunk(1)), true); assert.equal(broker.result(chunk(1, 'duplicate')), false);
  assert.equal(broker.result(chunk(2, '<think>private')), false); assert.equal(broker.result({ ...chunk(2), actions: [] }), false);
  assert.equal(broker.result(chunk(2, 'Hello again')), true); assert.equal(broker.result(chunk(513)), false);
  assert.deepEqual(progress, ['Hello', 'Hello again']); assert.equal(broker.result({ t: 'aiSupportResult', leaseId: job.leaseId, epoch: job.epoch, text: 'Hello again.' }), true);
  assert.equal(await answer, 'Hello again.'); assert.equal(broker.available, true); assert.equal(broker.result(chunk(3, 'late')), false);
});

test('aborting a browser lease frees it and no old sequence can enter a replacement lease', async t => {
  const messages: BrowserAiServerMsg[] = [], progress: string[] = [], broker = new BrowserAiBroker(message => messages.push(message)); t.after(() => broker.close());
  broker.setReady({ t: 'aiSupport', ready: true, epoch: 'epoch', model: BROWSER_AI_MODEL });
  const controller = new AbortController(), first = broker.generate(generation('first'), controller.signal, undefined, part => progress.push(part));
  const oldJob = (messages[0] as { job: BrowserAiJob }).job; controller.abort(); assert.equal(await first, undefined); assert.equal(broker.available, true);
  const second = broker.generate(generation('second'), new AbortController().signal, undefined, part => progress.push(part));
  const job = (messages.filter(message => message.t === 'aiSupportJob').at(-1) as { job: BrowserAiJob }).job;
  assert.notEqual(job.leaseId, oldJob.leaseId); assert.equal(broker.result({ t: 'aiSupportChunk', leaseId: oldJob.leaseId, epoch: oldJob.epoch, sequence: 10, text: 'stale' }), false);
  broker.result({ t: 'aiSupportResult', leaseId: job.leaseId, epoch: job.epoch, text: 'Current answer.' }); assert.equal(await second, 'Current answer.'); assert.deepEqual(progress, []);
});

function poolFixture() {
  const pool = new BrowserAiPool(), ownerMessages: BrowserAiServerMsg[] = [], providerMessages: BrowserAiServerMsg[] = [];
  let ownerSession = 'same', providerSession = 'same';
  const owner = new BrowserAiBroker(message => ownerMessages.push(message)), provider = new BrowserAiBroker(message => providerMessages.push(message));
  const choice = { version: 2 as const, shareIdle: true, allowRemote: true, idle: true };
  owner.setReady({ t: 'aiSupport', ready: false, epoch: 'owner', model: BROWSER_AI_MODEL, cooperation: choice });
  provider.setReady({ t: 'aiSupport', ready: true, epoch: 'provider', model: BROWSER_AI_MODEL, cooperation: choice });
  pool.register(owner, { user: () => 'owner-user', session: () => ownerSession, eligible: () => true });
  pool.register(provider, { user: () => 'provider-user', session: () => providerSession, eligible: () => true });
  return { pool, owner, provider, providerMessages, choice, moveOwner: () => { ownerSession = 'elsewhere'; }, moveProvider: () => { providerSession = 'elsewhere'; } };
}

test('shared progress stops when the requesting player leaves the authorised session', async t => {
  const f = poolFixture(); t.after(() => { f.owner.close(); f.provider.close(); }); const progress: string[] = [];
  const answer = f.pool.generateFor('owner-user', 'same', f.owner, generation('personal'), new AbortController().signal, generation('public'), part => progress.push(part));
  const job = (f.providerMessages[0] as { job: BrowserAiJob }).job;
  f.moveOwner(); f.provider.result({ t: 'aiSupportChunk', leaseId: job.leaseId, epoch: job.epoch, sequence: 1, text: 'Wrong session.' });
  f.provider.result({ t: 'aiSupportResult', leaseId: job.leaseId, epoch: job.epoch, text: 'Wrong session.' }); assert.equal(await answer, undefined); assert.deepEqual(progress, []);
});

test('shared progress stops immediately if the contributing player leaves the session', async t => {
  const f = poolFixture(); t.after(() => { f.owner.close(); f.provider.close(); }); const progress: string[] = [];
  const answer = f.pool.generateFor('owner-user', 'same', f.owner, generation('personal'), new AbortController().signal, generation('public'), part => progress.push(part));
  const job = (f.providerMessages[0] as { job: BrowserAiJob }).job;
  f.moveProvider(); f.provider.result({ t: 'aiSupportChunk', leaseId: job.leaseId, epoch: job.epoch, sequence: 1, text: 'Old contributor.' });
  f.provider.result({ t: 'aiSupportResult', leaseId: job.leaseId, epoch: job.epoch, text: 'Old contributor.' }); assert.equal(await answer, undefined); assert.deepEqual(progress, []);
});

test('withdrawing remote-generation permission suppresses further shared progress as well as the final answer', async t => {
  const f = poolFixture(); t.after(() => { f.owner.close(); f.provider.close(); }); const progress: string[] = [];
  const answer = f.pool.generateFor('owner-user', 'same', f.owner, generation('personal'), new AbortController().signal, generation('public'), part => progress.push(part));
  const job = (f.providerMessages[0] as { job: BrowserAiJob }).job;
  f.owner.setReady({ t: 'aiSupport', ready: false, epoch: 'owner', model: BROWSER_AI_MODEL, cooperation: { ...f.choice, allowRemote: false } });
  f.provider.result({ t: 'aiSupportChunk', leaseId: job.leaseId, epoch: job.epoch, sequence: 1, text: 'Remote reply.' });
  f.provider.result({ t: 'aiSupportResult', leaseId: job.leaseId, epoch: job.epoch, text: 'Remote reply.' }); assert.equal(await answer, undefined); assert.deepEqual(progress, []);
});
