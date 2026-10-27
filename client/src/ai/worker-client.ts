import type { BrowserAiJob } from '../../../shared/ai-support.ts';
import type { BrowserAiWorkerRequest, BrowserAiWorkerResponse } from './browser-ai.worker.ts';
import { BROWSER_AI_DISPOSE_MS, BROWSER_AI_MAX_JOB_MS, browserAiPlainText, validBrowserAiJob } from './model.ts';
import { cleanupBrowserAiCache, clearBrowserAiCacheMarker, markBrowserAiCacheDirty } from './cache.ts';

export interface BrowserAiWorkerCallbacks { onProgress: (progress: number) => void; onFatal: (reason: 'gpu' | 'error') => void }
export interface BrowserAiWorkerPort {
  postMessage(message: BrowserAiWorkerRequest): void; terminate(): void;
  onmessage: ((event: { data: BrowserAiWorkerResponse }) => void) | null;
  onerror: ((event: { preventDefault?(): void }) => void) | null;
}
export interface BrowserAiWorkerDependencies {
  createWorker(): BrowserAiWorkerPort; cleanup(): Promise<void>; markDirty(): void; clearMarker(): void; now(): number;
}
const abort = () => new DOMException('Browser AI generation cancelled', 'AbortError');
const defaults: BrowserAiWorkerDependencies = {
  createWorker: () => new Worker(new URL('./browser-ai.worker.ts', import.meta.url), { type: 'module', name: 'tonarium-browser-ai' }) as unknown as BrowserAiWorkerPort,
  cleanup: () => cleanupBrowserAiCache(undefined, false), markDirty: markBrowserAiCacheDirty, clearMarker: clearBrowserAiCacheMarker, now: Date.now,
};

export class BrowserAiWorker {
  private port?: BrowserAiWorkerPort;
  private requests = new Map<string, { resolve(value: string | undefined): void; reject(error: unknown): void; progress?: (text: string) => void }>();
  private sequence = 0;
  private loading?: Promise<void>;
  private stopping?: Promise<void>;
  private disposing?: Promise<void>;
  private closing = false;
  private ready = false;
  private fatal = false;
  private active?: string;
  constructor(private callbacks: BrowserAiWorkerCallbacks, private dependencies: BrowserAiWorkerDependencies = defaults) {}
  get loaded(): boolean { return this.ready && !this.closing && !this.fatal; }
  private fail(reason: 'gpu' | 'error'): void {
    this.ready = false;
    for (const request of this.requests.values()) request.reject(new Error(`Browser AI ${reason}`));
    this.requests.clear();
    if (!this.closing && !this.fatal) { this.fatal = true; this.callbacks.onFatal(reason); }
  }
  private send(request: BrowserAiWorkerRequest, progress?: (text: string) => void): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
      if (!this.port) { reject(abort()); return; }
      this.requests.set(request.id, { resolve, reject, progress });
      try { this.port.postMessage(request); } catch (error) { this.requests.delete(request.id); reject(error); }
    });
  }
  private id(kind: string) { return `${kind}:${++this.sequence}`; }
  load(): Promise<void> {
    if (this.closing || this.fatal) return Promise.reject(abort());
    if (this.loaded) return Promise.resolve();
    if (!this.loading) this.loading = (async () => {
      await this.dependencies.cleanup();
      if (this.closing) throw abort();
      this.dependencies.markDirty();
      const port = this.dependencies.createWorker(); this.port = port;
      port.onmessage = ({ data }) => {
        if (this.port !== port) return;
        if (data.type === 'progress') { if (!this.closing && Number.isFinite(data.progress)) this.callbacks.onProgress(Math.max(0, Math.min(1, data.progress))); return; }
        if (data.type === 'fatal') { this.fail(data.reason); return; }
        const request = this.requests.get(data.id);
        if (!request) return;
        if (data.type === 'chunk') { if (this.active === data.id && !this.closing) request.progress?.(data.text); return; }
        this.requests.delete(data.id);
        if (data.type === 'ok') request.resolve(data.text);
        else {
          request.reject(data.reason === 'cancelled' ? abort() : new Error(`Browser AI ${data.reason}`));
          if (data.reason === 'gpu' || data.reason === 'error') this.fail(data.reason);
        }
      };
      port.onerror = event => { event.preventDefault?.(); this.fail('error'); };
      await this.send({ type: 'load', id: this.id('load') });
      await this.dependencies.cleanup();
      if (this.closing) throw abort();
      this.dependencies.clearMarker(); this.ready = true;
    })().catch(async error => { if (!this.closing && !this.fatal) this.fail('error'); await this.dispose(); throw error; });
    return this.loading;
  }
  async generate(job: BrowserAiJob, progress?: (text: string) => void): Promise<string> {
    if (!this.loaded || this.active || this.stopping) throw new Error('Browser AI is not ready');
    if (!validBrowserAiJob(job, this.dependencies.now())) throw new TypeError('Invalid browser AI job');
    const id = this.id(`job:${job.epoch}:${job.leaseId}:${job.requestId}`); this.active = id;
    const timer = setTimeout(() => { void this.interrupt().catch(() => {}); }, Math.max(1, Math.min(BROWSER_AI_MAX_JOB_MS, job.expiresAt - this.dependencies.now())));
    try {
      const text = await this.send({ type: 'generate', id, job: structuredClone(job) }, progress);
      if (this.active !== id || this.closing || this.dependencies.now() >= job.expiresAt) throw abort();
      const plain = browserAiPlainText(text ?? '');
      if (!plain) throw new Error('Empty browser AI response');
      return plain;
    } finally { clearTimeout(timer); if (this.active === id) this.active = undefined; }
  }
  interrupt(): Promise<void> {
    if (this.stopping) return this.stopping;
    if (!this.port || this.closing) return Promise.resolve();
    const active = this.active; this.active = undefined;
    if (active) { this.requests.get(active)?.reject(abort()); this.requests.delete(active); }
    this.stopping = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([this.send({ type: 'interrupt', id: this.id('interrupt') }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Browser AI interruption timed out')), 1000); })]);
      } catch (error) { console.warn('[browser-ai] interruption failed', error instanceof Error ? error.message : String(error)); this.fail('error'); throw error; }
      finally { clearTimeout(timer); this.stopping = undefined; }
    })();
    return this.stopping;
  }
  dispose(): Promise<void> {
    if (this.disposing) return this.disposing;
    this.closing = true; this.ready = false; this.dependencies.markDirty();
    for (const request of this.requests.values()) request.reject(abort()); this.requests.clear(); this.active = undefined;
    this.disposing = (async () => {
      let forced = false, timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const unloaded = (async () => {
          if (this.port) await this.send({ type: 'dispose', id: this.id('dispose') });
          await this.dependencies.cleanup();
          if (!forced) this.dependencies.clearMarker();
        })();
        await Promise.race([unloaded, new Promise<void>(resolve => { timer = setTimeout(() => { forced = true; resolve(); }, BROWSER_AI_DISPOSE_MS); })]);
      } catch { forced = true; }
      finally {
        clearTimeout(timer);
        const port = this.port; this.port = undefined;
        if (port) { port.onmessage = null; port.onerror = null; port.terminate(); }
        for (const request of this.requests.values()) request.reject(abort()); this.requests.clear();
        // 強制終了時はマーカーを残す。ロック解放後に裏で削除せず、次回のロック内清掃へ委ねる。
      }
    })();
    return this.disposing;
  }
}
