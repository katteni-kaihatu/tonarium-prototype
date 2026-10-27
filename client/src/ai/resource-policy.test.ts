import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AI_COOLDOWN_MS, AI_HEALTHY_MS, AI_HEAP_PAUSE_RATIO, AI_HEAP_RESUME_RATIO, evaluateAiResources, initialAiResourcePolicy, type AiResourceSignals } from './resource-policy.ts';
import { AiSupportController, initializeAiSupport, setAiSupportWorldActive, type AiSupportEnvironment } from './support.ts';
import { BROWSER_AI_MODEL, type BrowserAiClientMsg, type BrowserAiJob } from '../../../shared/ai-support.ts';
import type { BrowserAiWorkerCallbacks } from './worker-client.ts';
import { BrowserAiBroker } from '../../../server/browser-ai.ts';
import type { BrowserAiGeneration, BrowserAiServerMsg } from '../../../shared/ai-support.ts';

const healthy = (now: number): AiResourceSignals => ({ now, visible: true, online: true, connected: true, webGpu: true, fps: 60, deviceMemory: 8, heapRatio: .3 });
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test('resource observation starts only inside the fantasy world and removes every monitor on exit', async () => {
  const events = new Set<string>();
  let frames = 0, timers = 0, observers = 0, cancellations = 0;
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const globals: Record<string, unknown> = {
    window: { setInterval: () => { timers++; return 1; }, clearInterval: () => { timers--; },
      addEventListener: (type: string) => events.add(`window:${type}`), removeEventListener: (type: string) => events.delete(`window:${type}`) },
    document: { visibilityState: 'visible', addEventListener: (type: string) => events.add(`document:${type}`), removeEventListener: (type: string) => events.delete(`document:${type}`) },
    requestAnimationFrame: () => { frames++; return 1; }, cancelAnimationFrame: () => { cancellations++; },
    PerformanceObserver: class { observe() { observers++; } disconnect() { observers--; } },
  };
  for (const [name, value] of Object.entries(globals)) { originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, value }); }
  try {
    initializeAiSupport(); assert.equal(frames, 0); assert.equal(timers, 0); assert.equal(events.size, 0);
    setAiSupportWorldActive(true); await flush();
    assert.equal(frames, 1); assert.equal(timers, 1); assert.equal(observers, 1); assert.equal(events.size, 6);
    setAiSupportWorldActive(false); await flush();
    assert.equal(cancellations, 1); assert.equal(timers, 0); assert.equal(observers, 0); assert.equal(events.size, 0);
    initializeAiSupport(); assert.equal(frames, 1); assert.equal(timers, 0);
  } finally {
    setAiSupportWorldActive(false);
    for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  }
});

test('resource policy requires repeated visible slowdown and a healthy cooldown before resuming', () => {
  let state = initialAiResourcePolicy();
  for (let i = 0; i < 2; i++) { const result = evaluateAiResources(state, { ...healthy(i * 1000), fps: 18 }); assert.equal(result.pause, false); state = result.state; }
  const paused = evaluateAiResources(state, { ...healthy(2000), fps: 18 }); assert.equal(paused.pause, true); assert.equal(paused.unload, true);
  const firstGood = evaluateAiResources(paused.state, healthy(3000)); assert.equal(firstGood.pause, true);
  const stillCooling = evaluateAiResources(firstGood.state, healthy(3000 + AI_HEALTHY_MS)); assert.equal(stillCooling.pause, true);
  const resumed = evaluateAiResources(stillCooling.state, healthy(2000 + AI_COOLDOWN_MS)); assert.equal(resumed.pause, false);
});

test('hidden tabs pause immediately, unload after a minute, and severe heap pressure unloads without claiming free RAM', () => {
  const hidden = evaluateAiResources(initialAiResourcePolicy(), { ...healthy(100), visible: false });
  assert.equal(hidden.pause, true); assert.equal(hidden.unload, false);
  const longHidden = evaluateAiResources(hidden.state, { ...healthy(60_100), visible: false }); assert.equal(longHidden.unload, true);
  const memory = evaluateAiResources(initialAiResourcePolicy(), { ...healthy(0), heapRatio: .94 }); assert.equal(memory.reason, 'memory'); assert.equal(memory.unload, true);
  const unknown = healthy(0); delete unknown.deviceMemory; delete unknown.heapRatio;
  assert.equal(evaluateAiResources(initialAiResourcePolicy(), unknown).unsupported, false);
  assert.equal(evaluateAiResources(initialAiResourcePolicy(), { ...healthy(0), deviceMemory: 2 }).unsupported, true);
  const low = evaluateAiResources(initialAiResourcePolicy(), { ...healthy(0), deviceMemory: 4 });
  assert.equal(low.reason, 'memory'); assert.equal(low.pause, true); assert.equal(low.unload, true); assert.equal(low.unsupported, false);
  assert.equal(evaluateAiResources(initialAiResourcePolicy(), { ...healthy(0), webGpu: false }).unsupported, true);
});

test('heap pressure pauses at 85 percent and requires 75 percent plus stable cooldown before reloading', () => {
  const pressured = evaluateAiResources(initialAiResourcePolicy(), { ...healthy(0), heapRatio: AI_HEAP_PAUSE_RATIO });
  assert.equal(pressured.reason, 'memory'); assert.equal(pressured.unload, true);
  const improving = evaluateAiResources(pressured.state, { ...healthy(1000), heapRatio: .8 });
  assert.equal(improving.reason, 'memory'); assert.equal(improving.state.memoryPressure, true);
  const missing = evaluateAiResources(improving.state, { ...healthy(2000), heapRatio: undefined });
  assert.equal(missing.reason, 'memory'); assert.equal(missing.pause, true);
  const firstGood = evaluateAiResources(missing.state, { ...healthy(3000), heapRatio: AI_HEAP_RESUME_RATIO });
  assert.equal(firstGood.pause, true); assert.equal(firstGood.state.memoryPressure, false);
  const resumed = evaluateAiResources(firstGood.state, { ...healthy(2000 + AI_COOLDOWN_MS), heapRatio: .7 });
  assert.equal(resumed.pause, false);
});

test('one severe visible stall releases the model while missing frame measurements and hidden throttling do not count as a stall', () => {
  for (const change of [{ fps: 0 }, { fps: 7 }, { eventLoopDelay: 1000 }, { longTaskMs: 1000 }]) {
    const result = evaluateAiResources(initialAiResourcePolicy(), { ...healthy(0), ...change });
    assert.equal(result.reason, 'performance'); assert.equal(result.pause, true); assert.equal(result.unload, true);
  }
  const unmeasured = evaluateAiResources(initialAiResourcePolicy(), { ...healthy(0), fps: undefined });
  assert.equal(unmeasured.pause, false);
  const hidden = evaluateAiResources(initialAiResourcePolicy(), { ...healthy(0), visible: false, fps: 0, eventLoopDelay: 1000 });
  assert.equal(hidden.reason, 'hidden'); assert.equal(hidden.unload, false);
});

test('initial connection and ordinary visibility restoration do not create a performance cooldown', () => {
  const disconnected = evaluateAiResources(initialAiResourcePolicy(), { ...healthy(0), connected: false });
  assert.equal(disconnected.pause, true); assert.equal(disconnected.state.cooldownUntil, 0);
  assert.equal(evaluateAiResources(disconnected.state, healthy(100)).pause, false);
  const hidden = evaluateAiResources(initialAiResourcePolicy(), { ...healthy(0), visible: false, eventLoopDelay: 10_000 });
  assert.equal(evaluateAiResources(hidden.state, healthy(100)).pause, false);
});

function fixture(saved: string | null = null, active = true) {
  let now = 0, stored = saved, locked = false, lockBlocked = false, cleanup = 0;
  let signals: Omit<AiResourceSignals, 'connected'> = healthy(now);
  const sent: BrowserAiClientMsg[] = [], workers: FakeWorker[] = [], order: string[] = [];
  class FakeWorker {
    loaded = false; interrupted = 0; disposed = 0;
    active?: { resolve(value: string): void; reject(error: Error): void };
    constructor(readonly callbacks: BrowserAiWorkerCallbacks) {}
    async load() { order.push('load'); this.loaded = true; this.callbacks.onProgress(.6); }
    generate(_job: BrowserAiJob) { return new Promise<string>((resolve, reject) => { this.active = { resolve, reject }; }); }
    async interrupt() { this.interrupted++; this.active?.reject(new Error('cancelled')); this.active = undefined; }
    async dispose() { this.disposed++; this.loaded = false; this.active?.reject(new Error('disposed')); this.active = undefined; order.push('dispose'); }
  }
  const env: AiSupportEnvironment = {
    now: () => now, read: () => stored, write: value => { stored = value; },
    cleanup: async () => { cleanup++; order.push('cleanup'); },
    createWorker: callbacks => { const worker = new FakeWorker(callbacks); workers.push(worker); return worker; },
    acquireLock: async () => { if (locked || lockBlocked) return null; locked = true; return () => { locked = false; order.push('release'); }; },
    signals: () => ({ ...signals, now }),
  };
  const controller = new AiSupportController(env); controller.setTransport(message => sent.push(message), true);
  if (active) controller.setWorldActive(true);
  const readyJob = (): BrowserAiJob => {
    const ready = sent.filter(message => message.t === 'aiSupport' && message.ready).at(-1);
    assert.ok(ready && ready.t === 'aiSupport');
    return { leaseId: 'lease-one', epoch: ready.epoch, requestId: 'request-one', kind: 'npc', expiresAt: now + 8000,
      messages: [{ role: 'system', content: 'Allowed NPC context.' }, { role: 'user', content: 'Hello.' }], maxTokens: 80, temperature: .7 };
  };
  return { controller, workers, sent, order, readyJob, get cleanup() { return cleanup; }, get stored() { return stored; }, get locked() { return locked; },
    advance(value: number, change: Partial<typeof signals> = {}) { now = value; signals = { ...signals, ...change }; controller.sample(); },
    blockLock(value: boolean) { lockBlocked = value; },
    store(value: string | null) { stored = value; },
  };
}

test('Tonarium outside the fantasy world never initializes, downloads or advertises support even with remembered consent', async () => {
  const f = fixture(JSON.stringify({ version: 1, model: BROWSER_AI_MODEL, enabled: true }), false);
  f.controller.initialize(); f.controller.setTransport(message => f.sent.push(message), true);
  f.advance(100_000); f.controller.retry(); await flush();
  assert.equal(f.cleanup, 0); assert.equal(f.workers.length, 0); assert.equal(f.sent.length, 0);
  assert.equal(f.controller.getSnapshot().consent, 'unknown');
  f.controller.setWorldActive(true); await flush();
  assert.equal(f.workers.length, 1); assert.equal(f.controller.getSnapshot().phase, 'ready');
  f.controller.setWorldActive(false); await flush();
});

test('leaving the fantasy world cancels generation and unloads without forgetting consent, while re-entry creates a new epoch', async () => {
  const f = fixture(JSON.stringify({ version: 1, model: BROWSER_AI_MODEL, enabled: true })); await flush();
  const job = f.readyJob(), worker = f.workers[0], stored = f.stored;
  const pending = f.controller.handle({ t: 'aiSupportJob', job }), old = worker.active!;
  f.controller.setWorldActive(false); old.resolve('A stale answer after leaving the fantasy world.'); await pending; await flush();
  assert.equal(worker.disposed, 1); assert.equal(f.locked, false); assert.equal(f.stored, stored);
  assert.equal(f.controller.getSnapshot().desired, true); assert.equal(f.controller.getSnapshot().phase, 'off');
  const announcements = f.sent.length;
  f.controller.initialize(); f.controller.setTransport(message => f.sent.push(message), false);
  f.controller.setTransport(message => f.sent.push(message), true); f.advance(100_000); f.controller.retry(); await flush();
  assert.equal(f.workers.length, 1); assert.equal(f.sent.length, announcements);
  assert.equal(f.sent.some(message => message.t === 'aiSupportResult' && 'text' in message), false);
  f.controller.setWorldActive(true); await flush();
  assert.equal(f.workers.length, 2); assert.notEqual(f.readyJob().epoch, job.epoch);
  assert.equal(f.controller.getSnapshot().phase, 'ready');
  f.controller.setWorldActive(false); await flush();
});

test('re-entering the fantasy world rechecks a consent choice changed while outside it', async () => {
  const f = fixture(JSON.stringify({ version: 1, model: BROWSER_AI_MODEL, enabled: true })); await flush();
  f.controller.setWorldActive(false); await flush();
  f.store(JSON.stringify({ version: 1, model: BROWSER_AI_MODEL, enabled: false }));
  f.controller.setWorldActive(true); await flush();
  assert.equal(f.controller.getSnapshot().consent, 'off'); assert.equal(f.workers.length, 1);
  f.controller.setWorldActive(false); f.store(null); f.controller.setWorldActive(true); await flush();
  assert.equal(f.controller.getSnapshot().consent, 'unknown'); assert.equal(f.workers.length, 1);
  f.controller.setWorldActive(false); await flush();
});

test('unknown or declined consent performs no worker creation or loading and cleanup precedes explicit opt-in', async () => {
  for (const saved of [null, JSON.stringify({ version: 1, model: BROWSER_AI_MODEL, enabled: false })]) {
    const f = fixture(saved); f.controller.initialize(); await flush();
    assert.equal(f.workers.length, 0); assert.equal(f.cleanup, 1);
    f.controller.setEnabled(false); f.advance(100_000); await flush(); assert.equal(f.workers.length, 0);
    f.controller.setEnabled(true); await flush(); assert.equal(f.workers.length, 1); assert.equal(f.controller.getSnapshot().phase, 'ready');
    assert.ok(f.order.indexOf('cleanup') < f.order.indexOf('load')); assert.equal(JSON.parse(f.stored!).enabled, true);
    f.controller.setEnabled(false); await flush(); assert.equal(f.workers[0].disposed, 1); assert.equal(f.locked, false);
  }
});

test('a previously consenting player loads immediately on first connection without an artificial cooldown', async () => {
  const f = fixture(JSON.stringify({ version: 1, model: BROWSER_AI_MODEL, enabled: true }));
  f.controller.setTransport(message => f.sent.push(message), false); f.controller.initialize(); await flush();
  assert.equal(f.workers.length, 0); assert.equal(f.controller.getSnapshot().reason, 'connection');
  f.controller.setTransport(message => f.sent.push(message), true); await flush();
  assert.equal(f.workers.length, 1); assert.equal(f.controller.getSnapshot().phase, 'ready');
});

test('turning support off cancels an in-flight lease, disposes the worker and ignores its stale result', async () => {
  const f = fixture(); f.controller.initialize(); f.controller.setEnabled(true); await flush();
  const worker = f.workers[0], job = f.readyJob(), pending = f.controller.handle({ t: 'aiSupportJob', job });
  assert.equal(f.controller.getSnapshot().phase, 'busy'); f.controller.setEnabled(false); await pending; await flush();
  assert.equal(worker.disposed, 1); assert.equal(f.controller.getSnapshot().phase, 'off');
  assert.ok(!f.sent.some(message => message.t === 'aiSupportResult' && 'text' in message));
  f.advance(500_000); await flush(); assert.equal(f.workers.length, 1); assert.equal(f.controller.getSnapshot().desired, false);
});

test('sustained game slowdown cancels generation, releases GPU memory and reloads only after hysteresis', async () => {
  const f = fixture(); f.controller.initialize(); f.controller.setEnabled(true); await flush();
  const job = f.readyJob(), pending = f.controller.handle({ t: 'aiSupportJob', job });
  f.advance(1000, { fps: 15 }); f.advance(2000, { fps: 15 }); f.advance(3000, { fps: 15 });
  await pending; await flush(); assert.equal(f.controller.getSnapshot().phase, 'paused'); assert.equal(f.workers[0].disposed, 1); assert.equal(f.locked, false);
  f.advance(4000, { fps: 60 }); f.advance(50_000); await flush();
  assert.equal(f.controller.getSnapshot().phase, 'ready'); assert.equal(f.workers.length, 2);
  assert.ok(!f.sent.some(message => message.t === 'aiSupportResult' && 'text' in message));
});

test('severe heap pressure allows only one automatic reload before manual retry is required', async () => {
  const f = fixture(); f.controller.initialize(); f.controller.setEnabled(true); await flush();
  f.advance(1000, { heapRatio: .95 }); await flush(); assert.equal(f.workers[0].disposed, 1);
  f.advance(2000, { heapRatio: .2 }); f.advance(48_000); await flush(); assert.equal(f.workers.length, 2);
  f.advance(49_000, { heapRatio: .95 }); await flush(); f.advance(50_000, { heapRatio: .2 }); f.advance(96_000); await flush();
  assert.equal(f.workers.length, 2); assert.equal(f.controller.getSnapshot().reason, 'manual');
  f.controller.retry(); await flush(); assert.equal(f.workers.length, 3); assert.equal(f.controller.getSnapshot().phase, 'ready');
});

test('hidden unload, network reconnect and page-cache restoration never return an old lease', async () => {
  const f = fixture(); f.controller.initialize(); f.controller.setEnabled(true); await flush();
  const job = f.readyJob(), pending = f.controller.handle({ t: 'aiSupportJob', job });
  f.controller.setTransport(message => f.sent.push(message), false); await pending; await flush();
  assert.equal(f.workers[0].disposed, 0);
  f.controller.setTransport(message => f.sent.push(message), true); f.advance(1000); f.advance(50_000); await flush();
  assert.equal(f.controller.getSnapshot().phase, 'ready');
  f.advance(51_000, { visible: false }); f.advance(111_000); await flush(); assert.equal(f.workers[0].disposed, 1);
  f.controller.pageHide(); f.controller.pageShow(); f.advance(112_000, { visible: true }); f.advance(160_000); await flush();
  assert.equal(f.workers.length, 2); assert.notEqual(f.readyJob().epoch, job.epoch);
});

test('another tab holding the lock blocks all downloads and unsupported devices never create a worker', async () => {
  const f = fixture(); f.blockLock(true); f.controller.initialize(); f.controller.setEnabled(true); await flush();
  assert.equal(f.workers.length, 0); assert.equal(f.controller.getSnapshot().reason, 'other-tab');
  f.blockLock(false); f.advance(6000); await flush(); assert.equal(f.workers.length, 1);
  f.controller.setEnabled(false); await flush(); assert.equal(f.locked, false);
  const weak = fixture(); weak.advance(0, { deviceMemory: 2 }); weak.controller.initialize(); weak.controller.setEnabled(true); await flush();
  assert.equal(weak.workers.length, 0); assert.equal(weak.controller.getSnapshot().phase, 'unsupported');
});

test('a known 4GB device keeps support consent without downloading, advertising readiness or handling a browser job', async () => {
  const f = fixture(); f.advance(0, { deviceMemory: 4 }); f.controller.initialize(); f.controller.setEnabled(true); await flush();
  assert.equal(f.workers.length, 0); assert.equal(f.controller.getSnapshot().phase, 'paused'); assert.equal(f.controller.getSnapshot().reason, 'memory');
  assert.equal(f.controller.getSnapshot().desired, true); assert.equal(JSON.parse(f.stored!).enabled, true);
  assert.ok(!f.sent.some(message => message.t === 'aiSupport' && message.ready));
  await f.controller.handle({ t: 'aiSupportJob', job: { leaseId: 'weak-device', epoch: 'stale', requestId: 'request', kind: 'npc', expiresAt: 8000, maxTokens: 80, temperature: .7, messages: [{ role: 'system', content: 'Known facts.' }, { role: 'user', content: 'Hi.' }] } });
  assert.ok(f.sent.some(message => message.t === 'aiSupportResult' && message.error === 'unavailable'));
  f.advance(500_000); f.controller.retry(); await flush();
  assert.equal(f.workers.length, 0); assert.equal(f.controller.getSnapshot().reason, 'memory');
  f.controller.setWorldActive(false); await flush();
});

test('severe performance stalls unload immediately and preserve the two-load automatic limit', async () => {
  const f = fixture(); f.controller.setEnabled(true); await flush(); const stored = f.stored;
  f.advance(1000, { eventLoopDelay: 1200 }); await flush(); assert.equal(f.workers[0].disposed, 1);
  f.advance(2000, { eventLoopDelay: 0 }); f.advance(48_000); await flush(); assert.equal(f.workers.length, 2);
  f.advance(49_000, { longTaskMs: 1200 }); await flush(); assert.equal(f.workers[1].disposed, 1);
  f.advance(50_000, { longTaskMs: 0 }); f.advance(96_000); await flush();
  assert.equal(f.workers.length, 2); assert.equal(f.controller.getSnapshot().reason, 'manual'); assert.equal(f.stored, stored);
  assert.ok(!f.sent.some(message => message.t === 'aiSupportResult' && 'text' in message));
  f.controller.setWorldActive(false); await flush();
});

test('GPU fatal errors dispose the loaded model and cannot trigger an automatic download loop', async () => {
  const f = fixture(); f.controller.initialize(); f.controller.setEnabled(true); await flush();
  f.workers[0].callbacks.onFatal('gpu'); await flush(); assert.equal(f.workers[0].disposed, 1);
  f.advance(500_000); await flush(); assert.equal(f.workers.length, 1); assert.equal(f.controller.getSnapshot().phase, 'unsupported');
  f.controller.setWorldActive(false); await flush(); f.controller.setWorldActive(true); await flush();
  assert.equal(f.workers.length, 1); assert.equal(f.controller.getSnapshot().phase, 'unsupported');
  f.controller.retry(); await flush(); assert.equal(f.workers.length, 2);
});

const cooperation = (enabled: boolean, shareIdle: boolean, allowRemote: boolean) => JSON.stringify({ version: 2, model: BROWSER_AI_MODEL, enabled, shareIdle, allowRemote });
test('legacy self-only consent never silently permits sharing or remote processing', async () => {
  for (const enabled of [true, false]) {
    const f = fixture(JSON.stringify({ version: 1, model: BROWSER_AI_MODEL, enabled })); await flush();
    assert.equal(f.controller.getSnapshot().desired, enabled); assert.equal(f.controller.getSnapshot().cooperationConsent, 'unknown');
    assert.equal(f.controller.getSnapshot().shareIdle, false); assert.equal(f.controller.getSnapshot().allowRemote, false);
    assert.ok(f.sent.filter(message => message.t === 'aiSupport').every(message => message.t === 'aiSupport' && !message.cooperation?.shareIdle && !message.cooperation?.allowRemote));
    if (enabled) {
      await f.controller.handle({ t: 'aiSupportJob', job: { ...f.readyJob(), scope: 'shared' } });
      assert.equal(f.workers[0].active, undefined);
    }
    f.controller.setWorldActive(false); await flush();
  }
});

test('versioned consent separates donating, receiving and declining without overriding the old device choice', async () => {
  const donor = fixture(); donor.controller.setCooperation(true, true, true); await flush();
  assert.deepEqual(JSON.parse(donor.stored!), JSON.parse(cooperation(true, true, true))); assert.equal(donor.controller.getSnapshot().phase, 'ready');
  donor.controller.setEnabled(false); await flush();
  assert.equal(donor.controller.getSnapshot().allowRemote, true); assert.equal(donor.controller.getSnapshot().shareIdle, true);
  const off = donor.sent.filter(message => message.t === 'aiSupport').at(-1)!;
  assert.ok(off.t === 'aiSupport' && !off.ready && off.cooperation?.allowRemote && !off.cooperation.shareIdle);
  const receiver = fixture(); receiver.controller.setCooperation(false, true, false); await flush();
  assert.equal(receiver.workers.length, 0); assert.equal(receiver.controller.getSnapshot().desired, false);
  assert.ok(receiver.sent.some(message => message.t === 'aiSupport' && !message.ready && message.cooperation?.allowRemote));
  const own = fixture(JSON.stringify({ version: 1, model: BROWSER_AI_MODEL, enabled: true })); await flush();
  own.controller.setCooperation(false, false); await flush();
  assert.equal(own.controller.getSnapshot().desired, true); assert.equal(own.controller.getSnapshot().cooperationConsent, 'decided');
  assert.deepEqual(JSON.parse(own.stored!), JSON.parse(cooperation(true, false, false)));
  const serverOnly = fixture(); serverOnly.controller.setCooperation(false, false); await flush();
  assert.equal(serverOnly.workers.length, 0); assert.deepEqual(JSON.parse(serverOnly.stored!), JSON.parse(cooperation(false, false, false)));
  assert.ok(serverOnly.sent.filter(message => message.t === 'aiSupport').every(message => message.t === 'aiSupport' && !message.ready && !message.cooperation?.shareIdle && !message.cooperation?.allowRemote));
  for (const f of [donor, receiver, own, serverOnly]) { f.controller.setWorldActive(false); await flush(); }
});

test('shared work keeps own-conversation idle while its anonymous busy state is tracked separately', async () => {
  const f = fixture(cooperation(true, true, true)); await flush();
  const job = { ...f.readyJob(), scope: 'shared' as const };
  const pending = f.controller.handle({ t: 'aiSupportJob', job });
  assert.equal(f.controller.getSnapshot().busyKind, 'shared');
  const busy = f.sent.filter(message => message.t === 'aiSupport').at(-1)!;
  assert.ok(busy.t === 'aiSupport' && busy.ready && busy.cooperation?.idle === true);
  assert.equal(JSON.stringify(f.controller.getSnapshot()).includes(job.messages[1].content), false);
  f.workers[0].active!.resolve('A shared reply.'); await pending;
  assert.equal(f.controller.getSnapshot().busyKind, null);
  const ready = f.sent.filter(message => message.t === 'aiSupport').at(-1)!;
  assert.ok(ready.t === 'aiSupport' && ready.cooperation?.idle === true);
  f.controller.setWorldActive(false); await flush();
});

test('opening the own conversation preempts shared work, acknowledges interruption and keeps its loaded model', async () => {
  const f = fixture(cooperation(true, true, true)); await flush();
  const job = { ...f.readyJob(), scope: 'shared' as const }, worker = f.workers[0];
  const pending = f.controller.handle({ t: 'aiSupportJob', job }), old = worker.active!, start = f.sent.length;
  f.controller.setConversationActive(true); await pending; await flush(); old.resolve('late shared reply'); await flush();
  assert.equal(worker.interrupted, 1); assert.equal(worker.disposed, 0); assert.equal(f.workers.length, 1);
  const notices = f.sent.slice(start).filter(message => message.t === 'aiSupport');
  assert.ok(notices.some(message => message.t === 'aiSupport' && !message.ready));
  const ready = notices.at(-1)!; assert.ok(ready.t === 'aiSupport' && ready.ready && !ready.cooperation?.idle); assert.notEqual(ready.epoch, job.epoch);
  assert.ok(!f.sent.some(message => message.t === 'aiSupportResult' && 'text' in message));
  await f.controller.handle({ t: 'aiSupportJob', job: { ...f.readyJob(), scope: 'shared' } }); assert.equal(worker.active, undefined);
  const own = f.controller.handle({ t: 'aiSupportJob', job: { ...f.readyJob(), scope: 'self', leaseId: 'self-priority' } });
  assert.equal(f.controller.getSnapshot().busyKind, 'self'); worker.active!.resolve('Own answer'); await own;
  f.controller.setConversationActive(false);
  const idle = f.sent.filter(message => message.t === 'aiSupport').at(-1)!; assert.ok(idle.t === 'aiSupport' && idle.cooperation?.idle);
  f.controller.setWorldActive(false); await flush();
});

test('server cancellation of a shared lease sends false then a new ready acknowledgement before donating again', async () => {
  const f = fixture(cooperation(true, true, true)); await flush();
  const job = { ...f.readyJob(), scope: 'shared' as const }, pending = f.controller.handle({ t: 'aiSupportJob', job });
  const start = f.sent.length;
  await f.controller.handle({ t: 'aiSupportCancel', leaseId: job.leaseId, epoch: job.epoch }); await pending;
  const notices = f.sent.slice(start).filter(message => message.t === 'aiSupport');
  assert.ok(notices[0].t === 'aiSupport' && !notices[0].ready);
  assert.ok(notices.at(-1)!.t === 'aiSupport' && notices.at(-1)!.ready); assert.notEqual(f.readyJob().epoch, job.epoch);
  assert.equal(f.workers[0].disposed, 0);
  await f.controller.handle({ t: 'aiSupportJob', job }); assert.equal(f.workers[0].active, undefined);
  f.controller.setWorldActive(false); await flush();
});

test('shared cancellation never advertises readiness before the worker interruption acknowledgement', async () => {
  const f = fixture(cooperation(true, true, true)); await flush();
  const worker = f.workers[0], job = { ...f.readyJob(), scope: 'shared' as const };
  let acknowledge: (() => void) | undefined;
  worker.interrupt = async () => { worker.interrupted++; worker.active?.reject(new Error('cancelled')); worker.active = undefined; await new Promise<void>(resolve => { acknowledge = resolve; }); };
  const pending = f.controller.handle({ t: 'aiSupportJob', job }), start = f.sent.length;
  f.controller.setConversationActive(true); await pending; f.controller.sample();
  assert.ok(!f.sent.slice(start).some(message => message.t === 'aiSupport' && message.ready));
  acknowledge!(); await flush();
  assert.ok(f.sent.slice(start).some(message => message.t === 'aiSupport' && message.ready && message.epoch !== job.epoch));
  assert.equal(worker.disposed, 0); f.controller.setWorldActive(false); await flush();
});

test('resource-limited opted-in devices retain preferences but keep server fallback and do not donate', async () => {
  const f = fixture(cooperation(true, true, true)); await flush();
  const stored = f.stored; f.advance(1000, { heapRatio: .9 }); await flush();
  assert.equal(f.controller.getSnapshot().desired, true); assert.equal(f.stored, stored);
  const notice = f.sent.filter(message => message.t === 'aiSupport').at(-1)!;
  assert.ok(notice.t === 'aiSupport' && !notice.ready && !notice.cooperation?.idle && !notice.cooperation?.allowRemote);
  f.controller.setEnabled(false); await flush();
  const receive = f.sent.filter(message => message.t === 'aiSupport').at(-1)!;
  assert.ok(receive.t === 'aiSupport' && !receive.ready && receive.cooperation?.allowRemote);
  f.controller.setWorldActive(false); await flush();
  const outside = f.sent.filter(message => message.t === 'aiSupport').at(-1)!;
  assert.ok(outside.t === 'aiSupport' && !outside.cooperation?.allowRemote && !outside.cooperation?.shareIdle);
});

test('cooperation-only storage revocation cancels shared work without changing enabled state or redownloading', async () => {
  const f = fixture(cooperation(true, true, true)); await flush();
  const pending = f.controller.handle({ t: 'aiSupportJob', job: { ...f.readyJob(), scope: 'shared' } });
  f.store(cooperation(true, false, false)); f.controller.refreshConsent(); await pending; await flush();
  assert.equal(f.controller.getSnapshot().desired, true); assert.equal(f.controller.getSnapshot().shareIdle, false);
  assert.equal(f.workers.length, 1); assert.equal(f.workers[0].disposed, 0); assert.equal(f.workers[0].interrupted, 1);
  const notice = f.sent.filter(message => message.t === 'aiSupport').at(-1)!;
  assert.ok(notice.t === 'aiSupport' && !notice.cooperation?.shareIdle && !notice.cooperation?.allowRemote);
  f.controller.setWorldActive(false); await flush();
});

test('changing sharing permissions never retries a model stopped by a fatal GPU error', async () => {
  const f = fixture(cooperation(true, true, true)); await flush();
  f.workers[0].callbacks.onFatal('gpu'); await flush();
  f.controller.setCooperation(false, false); f.advance(500_000); await flush();
  assert.equal(f.controller.getSnapshot().desired, true); assert.equal(f.controller.getSnapshot().phase, 'unsupported');
  assert.equal(f.workers.length, 1); assert.equal(f.controller.getSnapshot().allowRemote, false);
  f.controller.setWorldActive(false); await flush();
});

async function connectedCooperation() {
  const f = fixture(cooperation(true, true, true)); await flush();
  const serverMessages: BrowserAiServerMsg[] = [], handled: Promise<void>[] = [], results: BrowserAiClientMsg[] = [];
  const broker = new BrowserAiBroker(message => { serverMessages.push(message); handled.push(f.controller.handle(message)); }, { now: () => 0 });
  const ready = f.sent.findLast(message => message.t === 'aiSupport' && message.ready)!;
  assert.equal(broker.setReady(ready), true);
  f.controller.setTransport(message => {
    f.sent.push(message);
    if (message.t === 'aiSupport') broker.setReady(message);
    else { results.push(message); broker.result(message); }
  }, true);
  const worker = f.workers[0], originalGenerate = worker.generate.bind(worker); let generations = 0;
  worker.generate = job => { generations++; return originalGenerate(job); };
  const request: BrowserAiGeneration = { requestId: 'anonymous-request', kind: 'npc', maxTokens: 80, temperature: .7,
    messages: [{ role: 'system', content: 'Only public innkeeper facts.' }, { role: 'user', content: 'What meals are available?' }] };
  return { f, broker, worker, request, serverMessages, handled, results, get generations() { return generations; } };
}

test('a real controller-broker bridge keeps shared work alive through startup announcements and sampling, then accepts exactly one result', async () => {
  const b = await connectedCooperation();
  try {
    assert.equal(b.broker.acceptsShared, true);
    const response = b.broker.generateShared(b.request, new AbortController().signal);
    await flush(); b.f.controller.sample(); b.f.controller.sample(); await flush();
    assert.equal(b.generations, 1); assert.equal(b.serverMessages.filter(message => message.t === 'aiSupportCancel').length, 0);
    assert.equal(b.broker.pendingScope, 'shared'); assert.equal(b.broker.acceptsShared, false);
    assert.equal(await b.broker.generateShared(b.request, new AbortController().signal), undefined);
    assert.equal(b.generations, 1);
    b.worker.active!.resolve('There is warm soup today.');
    assert.equal(await response, 'There is warm soup today.'); await Promise.all(b.handled);
    assert.equal(b.results.length, 1); assert.equal(b.broker.pendingScope, undefined); assert.equal(b.broker.acceptsShared, true);
    assert.equal(b.serverMessages.filter(message => message.t === 'aiSupportCancel').length, 0);
    assert.equal(b.broker.result(b.results[0]), false);
  } finally { b.broker.close(); b.f.controller.setWorldActive(false); await flush(); }
});

test('a real controller-broker bridge cancels a shared lease once only when an own conversation opens', async () => {
  const b = await connectedCooperation();
  try {
    const response = b.broker.generateShared(b.request, new AbortController().signal); await flush();
    assert.equal(b.generations, 1); b.f.controller.sample();
    assert.equal(b.serverMessages.filter(message => message.t === 'aiSupportCancel').length, 0);
    const old = b.worker.active!;
    b.f.controller.setConversationActive(true);
    assert.equal(await response, undefined); await Promise.all(b.handled); await flush();
    assert.equal(b.serverMessages.filter(message => message.t === 'aiSupportCancel').length, 1);
    assert.equal(b.worker.interrupted, 1); assert.equal(b.worker.disposed, 0); assert.equal(b.broker.acceptsShared, false);
    old.resolve('A discarded late shared reply.'); await flush(); assert.equal(b.results.length, 0);
    b.f.controller.setConversationActive(false); assert.equal(b.broker.acceptsShared, true);
  } finally { b.broker.close(); b.f.controller.setWorldActive(false); await flush(); }
});
