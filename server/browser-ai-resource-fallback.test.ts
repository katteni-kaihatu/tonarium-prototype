import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { AiSupportController, type AiSupportEnvironment } from '../client/src/ai/support.ts';
import type { AiResourceSignals } from '../client/src/ai/resource-policy.ts';
import type { BrowserAiWorkerCallbacks } from '../client/src/ai/worker-client.ts';
import { BROWSER_AI_MODEL, type BrowserAiClientMsg, type BrowserAiJob, type BrowserAiServerMsg } from '../shared/ai-support.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { BrowserAiBroker } from './browser-ai.ts';
import { NpcChat } from './npc.ts';
import { FantasyGmChat } from './fantasy-gm-chat.ts';

type Service = 'npc' | 'gm';
type Signals = Omit<AiResourceSignals, 'connected'>;
interface ModelBody { messages: { role: string; content: string }[] }
const QUESTION = 'Please share a quiet comforting thought about feeling lonely.';
const SERVER_REPLY = 'A quiet pause can help you choose your next step.';
const LATE_REPLY = 'The abandoned browser answer must never replace the reply.';
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

async function fixture(t: TestContext, kind: Service, initial: Partial<Signals> = {}, deferLoad = false) {
  let now = 1000, locked = false, sequence = 0;
  let signals: Signals = { now, visible: true, online: true, webGpu: true, deviceMemory: 8, heapRatio: .3, fps: 60, ...initial };
  let stored = JSON.stringify({ version: 1, model: BROWSER_AI_MODEL, enabled: true });
  const clientMessages: BrowserAiClientMsg[] = [], serverMessages: BrowserAiServerMsg[] = [];
  const workers: FakeWorker[] = [], bodies: ModelBody[] = [];
  const results: { source?: string; error?: string; text: string }[] = [];
  let controller: AiSupportController;
  class FakeWorker {
    loaded = false; loads = 0; generated = 0; disposed = 0; interrupted = 0;
    active?: { job: BrowserAiJob; resolve(text: string): void };
    completeLoad?: () => void;
    constructor(readonly callbacks: BrowserAiWorkerCallbacks) {}
    async load() {
      this.loads++;
      if (deferLoad) await new Promise<void>(resolve => { this.completeLoad = resolve; });
      this.loaded = true; this.callbacks.onProgress(1);
    }
    generate(job: BrowserAiJob): Promise<string> {
      this.generated++;
      return new Promise(resolve => { this.active = { job, resolve }; });
    }
    async interrupt() { this.interrupted++; }
    async dispose() { this.disposed++; this.loaded = false; }
    finishLoading() { this.completeLoad?.(); this.completeLoad = undefined; }
    finish(text: string) { const active = this.active; this.active = undefined; active?.resolve(text); }
  }
  const broker = new BrowserAiBroker(message => {
    serverMessages.push(structuredClone(message));
    if (message.t === 'aiSupportCancel') void controller.handle(message);
  }, { now: () => now, timeoutMs: 1000 });
  const send = (message: BrowserAiClientMsg) => {
    clientMessages.push(structuredClone(message));
    if (message.t === 'aiSupport') broker.setReady(message);
    else broker.result(message);
  };
  const environment: AiSupportEnvironment = {
    now: () => now, read: () => stored, write: value => { stored = value; }, cleanup: async () => {},
    createWorker: callbacks => { const worker = new FakeWorker(callbacks); workers.push(worker); return worker; },
    acquireLock: async () => { if (locked) return null; locked = true; return () => { locked = false; }; },
    signals: () => ({ ...signals, now }),
  };
  controller = new AiSupportController(environment);
  const profile = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Resource Test', source: 'human', gender: 'female' }, () => .8).profile;
  const originalProfile = structuredClone(profile);
  const fetcher = (async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)) as ModelBody);
    return new Response(JSON.stringify({ model: 'synthetic-server-model', choices: [{ message: { content: SERVER_REPLY } }] }), { headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const npc = new NpcChat({ fetch: fetcher, now: () => now, timeoutMs: 2000, onError: () => {} });
  const gm = new FantasyGmChat({ fetch: fetcher, now: () => now, timeoutMs: 2000, onError: () => {} });
  const chat = async (text = QUESTION) => {
    const request = { requestId: `resource-${kind}-${++sequence}`, locale: 'en' as const, text };
    const reply = kind === 'npc'
      ? await npc.chat('resource-player', { ...request, npcId: 'rin' }, { character: profile.character ?? undefined, browserGenerate: broker.generate })
      : await gm.chat('resource-player', request, { session: 'resource-test', world: 'fantasy', profile, browserGenerate: broker.generate });
    const result = { source: reply.source, error: reply.error, text: 'reply' in reply ? reply.reply.text : reply.text };
    results.push(result); return result;
  };
  t.after(async () => {
    controller.setWorldActive(false); broker.close();
    for (const worker of workers) { worker.finishLoading(); worker.finish('Cleanup of a synthetic request.'); }
    await flush();
  });
  controller.setTransport(send, true); controller.setWorldActive(true);
  await flush();
  return {
    controller, broker, workers, bodies, clientMessages, serverMessages, results, profile, originalProfile, chat,
    change(change: Partial<Signals>, sample = false) { signals = { ...signals, ...change }; if (sample) controller.sample(); },
    advance(value: number) { now = value; },
    job() { const message = serverMessages.find(message => message.t === 'aiSupportJob'); assert.ok(message?.t === 'aiSupportJob'); return message; },
    get stored() { return JSON.parse(stored) as { enabled: boolean }; },
    get generated() { return workers.reduce((total, worker) => total + worker.generated, 0); },
    get loads() { return workers.reduce((total, worker) => total + worker.loads, 0); },
  };
}

for (const kind of ['npc', 'gm'] as const) {
  test(`${kind}: memory pressure discovered just before dispatch bypasses the consenting browser and uses the server once`, { timeout: 5000 }, async t => {
    const f = await fixture(t, kind);
    assert.equal(f.controller.getSnapshot().phase, 'ready'); assert.equal(f.loads, 1);
    const pending = f.chat(), job = f.job();
    f.change({ heapRatio: .86 });
    const dispatched = f.controller.handle(job);
    const result = await pending;
    assert.equal(result.source, 'local'); assert.equal(result.error, undefined); assert.equal(result.text, SERVER_REPLY);
    assert.equal(f.generated, 0); assert.equal(f.bodies.length, 1); assert.equal(f.results.length, 1);
    await dispatched; await flush();
    assert.equal(f.controller.getSnapshot().reason, 'memory'); assert.equal(f.controller.getSnapshot().desired, true);
    assert.equal(f.stored.enabled, true); assert.equal(f.workers[0].disposed, 1);
    assert.equal(f.serverMessages.filter(message => message.t === 'aiSupportCancel' && message.leaseId === job.job.leaseId).length, 1);
    assert.equal(f.clientMessages.some(message => message.t === 'aiSupportResult' && 'text' in message), false);
    assert.deepEqual(f.profile, f.originalProfile);
  });

  test(`${kind}: pressure during browser generation switches to one server answer and rejects late browser completion`, { timeout: 5000 }, async t => {
    const f = await fixture(t, kind), pending = f.chat(), job = f.job();
    const dispatch = f.controller.handle(job);
    assert.equal(f.generated, 1); assert.equal(f.bodies.length, 0); assert.ok(f.workers[0].active);
    f.change({ heapRatio: .86 }, true);
    const result = await pending;
    assert.equal(result.source, 'local'); assert.equal(result.error, undefined); assert.equal(result.text, SERVER_REPLY);
    assert.equal(f.bodies.length, 1); assert.equal(f.results.length, 1);
    assert.ok(f.clientMessages.some(message => message.t === 'aiSupport' && !message.ready));
    assert.equal(f.serverMessages.filter(message => message.t === 'aiSupportCancel' && message.leaseId === job.job.leaseId).length, 1);
    f.workers[0].finish(LATE_REPLY); await dispatch; await flush();
    assert.equal(f.broker.result({ t: 'aiSupportResult', leaseId: job.job.leaseId, epoch: job.job.epoch, text: LATE_REPLY }), false);
    assert.equal(f.clientMessages.some(message => message.t === 'aiSupportResult' && 'text' in message), false);
    assert.equal(f.bodies.length, 1); assert.equal(f.results.length, 1); assert.equal(f.workers[0].disposed, 1);
    assert.equal(f.controller.getSnapshot().desired, true); assert.equal(f.stored.enabled, true);
    f.advance(4000); await f.chat('I would welcome another peaceful thought.');
    assert.equal(f.bodies.length, 2); assert.equal(f.generated, 1);
    assert.equal(f.bodies[1].messages.filter(message => message.role === 'assistant' && message.content === SERVER_REPLY).length, 1);
    assert.ok(!JSON.stringify(f.bodies).includes(LATE_REPLY));
    assert.deepEqual(f.profile, f.originalProfile);
  });

  test(`${kind}: a consenting 4GB device keeps model downloads off and uses the server by default`, { timeout: 5000 }, async t => {
    const f = await fixture(t, kind, { deviceMemory: 4 });
    assert.equal(f.controller.getSnapshot().desired, true); assert.equal(f.stored.enabled, true);
    assert.notEqual(f.controller.getSnapshot().phase, 'ready'); assert.equal(f.workers.length, 0); assert.equal(f.loads, 0);
    const result = await f.chat();
    assert.equal(result.source, 'local'); assert.equal(result.error, undefined); assert.equal(result.text, SERVER_REPLY);
    assert.equal(f.bodies.length, 1); assert.equal(f.generated, 0); assert.equal(f.results.length, 1);
    assert.equal(f.serverMessages.some(message => message.t === 'aiSupportJob'), false);
    assert.equal(f.clientMessages.some(message => message.t === 'aiSupport' && message.ready), false);
    assert.deepEqual(f.profile, f.originalProfile);
  });

  test(`${kind}: memory pressure arriving during model loading prevents a ready announcement and routes to the server`, { timeout: 5000 }, async t => {
    const f = await fixture(t, kind, {}, true);
    assert.equal(f.controller.getSnapshot().phase, 'preparing'); assert.equal(f.loads, 1);
    assert.equal(f.workers[0].loaded, false);
    f.change({ heapRatio: .86 }); f.workers[0].finishLoading(); await flush();
    assert.equal(f.controller.getSnapshot().reason, 'memory'); assert.equal(f.workers[0].disposed, 1);
    assert.equal(f.clientMessages.some(message => message.t === 'aiSupport' && message.ready), false);
    assert.equal(f.controller.getSnapshot().desired, true); assert.equal(f.stored.enabled, true);
    const result = await f.chat();
    assert.equal(result.source, 'local'); assert.equal(result.error, undefined); assert.equal(result.text, SERVER_REPLY);
    assert.equal(f.bodies.length, 1); assert.equal(f.generated, 0); assert.equal(f.results.length, 1);
    assert.equal(f.serverMessages.some(message => message.t === 'aiSupportJob'), false);
    assert.deepEqual(f.profile, f.originalProfile);
  });
}
