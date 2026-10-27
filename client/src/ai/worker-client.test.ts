import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserAiWorker, type BrowserAiWorkerDependencies, type BrowserAiWorkerPort } from './worker-client.ts';
import type { BrowserAiWorkerRequest, BrowserAiWorkerResponse } from './browser-ai.worker.ts';
import type { BrowserAiJob } from '../../../shared/ai-support.ts';

class Port implements BrowserAiWorkerPort {
  onmessage: BrowserAiWorkerPort['onmessage'] = null;
  onerror: BrowserAiWorkerPort['onerror'] = null;
  sent: BrowserAiWorkerRequest[] = [];
  terminated = false;
  autoLoad = true; autoDispose = true;
  postMessage(message: BrowserAiWorkerRequest) {
    this.sent.push(message);
    if (message.type === 'load' && this.autoLoad || message.type === 'interrupt' || message.type === 'dispose' && this.autoDispose) queueMicrotask(() => this.reply({ id: message.id, type: 'ok' }));
  }
  reply(message: BrowserAiWorkerResponse) { this.onmessage?.({ data: message }); }
  terminate() { this.terminated = true; }
}
function fixture() {
  const port = new Port(), status = { dirty: false, cleanups: 0, fatal: [] as string[], progress: [] as number[], created: 0 };
  const deps: BrowserAiWorkerDependencies = { createWorker: () => { status.created++; return port; }, cleanup: async () => { status.cleanups++; }, markDirty: () => { status.dirty = true; }, clearMarker: () => { status.dirty = false; }, now: Date.now };
  return { port, status, worker: new BrowserAiWorker({ onProgress: value => status.progress.push(value), onFatal: reason => status.fatal.push(reason) }, deps) };
}
const job = (): BrowserAiJob => ({ leaseId: 'lease', epoch: 'epoch', requestId: 'request', kind: 'npc', expiresAt: Date.now() + 30000, maxTokens: 160, temperature: .7, messages: [{ role: 'system', content: 'Only server facts.' }, { role: 'user', content: 'Hi.' }] });

test('worker wrapper loads once, reports bounded progress and clears only successful cache markers', async () => {
  const { port, status, worker } = fixture(); await Promise.all([worker.load(), worker.load()]);
  assert.equal(status.created, 1); assert.equal(worker.loaded, true); assert.equal(status.cleanups, 2); assert.equal(status.dirty, false);
  port.reply({ type: 'progress', progress: 1.5 }); assert.deepEqual(status.progress, [1]);
  await worker.dispose(); assert.equal(port.terminated, true); assert.equal(worker.loaded, false); assert.equal(status.dirty, false);
});

test('generation uses unique job IDs and interruption ignores late results while retaining loaded weights', async () => {
  const { port, worker } = fixture(); await worker.load();
  const old = worker.generate(job()); const rejected = assert.rejects(old, { name: 'AbortError' });
  const oldId = port.sent.at(-1)!.id;
  await worker.interrupt(); await rejected; assert.equal(worker.loaded, true);
  const fresh = worker.generate({ ...job(), leaseId: 'new-lease' }), freshId = port.sent.at(-1)!.id;
  assert.notEqual(freshId, oldId); port.reply({ type: 'ok', id: oldId, text: 'stale text' });
  port.reply({ type: 'ok', id: freshId, text: 'fresh text' }); assert.equal(await fresh, 'fresh text');
  assert.equal(port.sent.filter(request => request.type === 'load').length, 1); await worker.dispose();
});

test('normal disposal waits for the unload acknowledgement before terminating and is idempotent', async () => {
  const { port, worker } = fixture(); await worker.load(); port.autoDispose = false;
  const disposing = worker.dispose(); assert.equal(port.terminated, false); assert.equal(worker.loaded, false);
  const request = port.sent.findLast(request => request.type === 'dispose')!;
  port.reply({ type: 'ok', id: request.id }); await disposing; assert.equal(port.terminated, true);
  await worker.dispose(); assert.equal(port.sent.filter(request => request.type === 'dispose').length, 1);
  await assert.rejects(worker.load(), { name: 'AbortError' });
});

test('a hung download is terminated within 1500ms plus scheduler tolerance and leaves cleanup marked for startup', async () => {
  const { port, status, worker } = fixture(); port.autoLoad = false; port.autoDispose = false;
  const loading = worker.load(); const rejected = assert.rejects(loading, { name: 'AbortError' });
  while (!port.sent.length) await new Promise(resolve => setTimeout(resolve, 0));
  const began = Date.now(); await worker.dispose(); const elapsed = Date.now() - began;
  await rejected; assert.ok(elapsed >= 1400 && elapsed < 2300, `${elapsed}ms`);
  assert.equal(port.terminated, true); assert.equal(status.dirty, true); assert.equal(worker.loaded, false); assert.deepEqual(status.fatal, []);
  assert.equal(status.cleanups, 1, 'forced termination must defer cleanup instead of deleting a new tab model after its lock is released');
});

test('GPU failure rejects the request and is reported once without automatically reloading a model', async () => {
  const { port, status, worker } = fixture(); await worker.load(); const generation = worker.generate(job());
  const rejected = assert.rejects(generation, /gpu/);
  port.reply({ type: 'fatal', reason: 'gpu' }); await rejected;
  assert.deepEqual(status.fatal, ['gpu']); assert.equal(worker.loaded, false);
  port.reply({ type: 'fatal', reason: 'gpu' }); assert.deepEqual(status.fatal, ['gpu']);
  await assert.rejects(worker.load(), { name: 'AbortError' }); assert.equal(status.created, 1); await worker.dispose();
});

test('load failure awaits disposal or worker termination so partially allocated GPU memory cannot remain owned', async () => {
  const { port, status, worker } = fixture(); port.autoLoad = false;
  const loading = worker.load(); const rejected = assert.rejects(loading, /gpu/);
  while (!port.sent.length) await new Promise(resolve => setTimeout(resolve, 0));
  port.reply({ type: 'error', id: port.sent[0].id, reason: 'gpu' }); await rejected;
  assert.equal(port.terminated, true); assert.equal(worker.loaded, false); assert.deepEqual(status.fatal, ['gpu']);
  assert.ok(port.sent.some(request => request.type === 'dispose')); assert.equal(status.dirty, false);
});
