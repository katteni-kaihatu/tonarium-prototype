import { BROWSER_AI_MODEL, type BrowserAiClientMsg, type BrowserAiJob, type BrowserAiServerMsg } from '../../../shared/ai-support.ts';
import { BrowserAiWorker, type BrowserAiWorkerCallbacks } from './worker-client.ts';
import { cleanupBrowserAiCache } from './cache.ts';
import { evaluateAiResources, initialAiResourcePolicy, type AiResourcePolicy, type AiResourceReason, type AiResourceSignals } from './resource-policy.ts';

export const AI_SUPPORT_CONSENT_KEY = 'tonarium.browser-ai.consent.v1';
export type AiSupportPhase = 'off' | 'preparing' | 'ready' | 'busy' | 'paused' | 'error' | 'unsupported';
export interface AiSupportSnapshot { consent: 'unknown' | 'on' | 'off'; cooperationConsent: 'unknown' | 'decided'; shareIdle: boolean; allowRemote: boolean; busyKind: 'self' | 'shared' | null; desired: boolean; phase: AiSupportPhase; progress: number; reason: AiResourceReason; loads: number }
interface WorkerAdapter { readonly loaded: boolean; load(): Promise<void>; generate(job: BrowserAiJob, progress?: (text: string) => void): Promise<string>; interrupt(): Promise<void>; dispose(): Promise<void> }
export interface AiSupportEnvironment {
  now(): number; read(): string | null; write(value: string): void; cleanup(): Promise<void>;
  createWorker(callbacks: BrowserAiWorkerCallbacks): WorkerAdapter;
  acquireLock(): Promise<(() => void) | null>;
  signals(): Omit<AiResourceSignals, 'connected'>;
}
const uuid = () => globalThis.crypto?.randomUUID?.() ?? `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export class AiSupportController {
  private snapshot: AiSupportSnapshot = { consent: 'unknown', cooperationConsent: 'unknown', shareIdle: false, allowRemote: false, busyKind: null, desired: false, phase: 'off', progress: 0, reason: null, loads: 0 };
  private listeners = new Set<() => void>();
  private policy: AiResourcePolicy = initialAiResourcePolicy();
  private worker?: WorkerAdapter; private release?: () => void;
  private startup?: Promise<void>; private loading?: Promise<void>; private disposing?: Promise<void>; private interrupting?: Promise<void>;
  private initialized = false; private worldActive = false; private connected = false; private send?: (message: BrowserAiClientMsg) => void;
  private epoch = uuid(); private announced = ''; private generation = 0;
  private job?: BrowserAiJob; private manualPermit = false; private fatalStopped = false; private suspended = false; private nextLockAt = 0;
  private fatalReason: 'gpu' | 'error' = 'error';
  private conversationActive = false; private preempting?: Promise<void>;
  constructor(private env: AiSupportEnvironment) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private patch(patch: Partial<AiSupportSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; for (const listener of this.listeners) listener(); }
  private announce(ready: boolean) {
    const consented = this.worldActive && this.snapshot.cooperationConsent === 'decided';
    const cooperation = { version: 2 as const, shareIdle: consented && this.snapshot.desired && this.snapshot.shareIdle,
      allowRemote: consented && this.snapshot.allowRemote && (!this.snapshot.desired || ready),
      idle: this.worldActive && ready && !this.conversationActive && (!this.job || this.job.scope === 'shared') && !this.interrupting && !this.preempting };
    const key = JSON.stringify([this.epoch, ready, cooperation]);
    if (!this.initialized || ready && !this.worldActive || !this.connected || !this.send || this.announced === key) return;
    try { this.send({ t: 'aiSupport', ready, epoch: this.epoch, model: BROWSER_AI_MODEL, cooperation }); this.announced = key; } catch { /* 再接続時に再通知する。 */ }
  }
  private invalidate() { this.announce(false); this.epoch = uuid(); this.announced = ''; this.generation++; this.job = undefined; this.patch({ busyKind: null }); this.announce(false); }
  private readConsent() {
    let enabled: boolean | undefined, cooperationConsent: 'unknown' | 'decided' = 'unknown', shareIdle = false, allowRemote = false;
    try {
      const saved = JSON.parse(this.env.read() ?? 'null') as { version?: number; model?: string; enabled?: boolean; shareIdle?: boolean; allowRemote?: boolean } | null;
      if ((saved?.version === 1 || saved?.version === 2) && typeof saved.enabled === 'boolean' && (!saved.enabled || saved.model === BROWSER_AI_MODEL)) {
        enabled = saved.enabled;
        if (saved.version === 2 && saved.model === BROWSER_AI_MODEL && typeof saved.shareIdle === 'boolean' && typeof saved.allowRemote === 'boolean') {
          cooperationConsent = 'decided'; shareIdle = saved.shareIdle; allowRemote = saved.allowRemote;
        }
      }
    } catch { /* 初回の明示的な選択を待つ。 */ }
    this.patch({ consent: enabled === undefined ? 'unknown' : enabled ? 'on' : 'off', desired: enabled === true, cooperationConsent, shareIdle, allowRemote });
  }
  private saveConsent() {
    const { desired: enabled, cooperationConsent, shareIdle, allowRemote } = this.snapshot;
    try { this.env.write(JSON.stringify(cooperationConsent === 'decided' ? { version: 2, model: BROWSER_AI_MODEL, enabled, shareIdle, allowRemote } : { version: 1, model: BROWSER_AI_MODEL, enabled })); } catch { /* このタブでは選択を維持する。 */ }
  }
  refreshConsent() {
    if (!this.worldActive || !this.initialized) return;
    const desired = this.snapshot.desired;
    const before = JSON.stringify([this.snapshot.desired, this.snapshot.cooperationConsent, this.snapshot.shareIdle, this.snapshot.allowRemote]);
    this.readConsent();
    if (before === JSON.stringify([this.snapshot.desired, this.snapshot.cooperationConsent, this.snapshot.shareIdle, this.snapshot.allowRemote])) return;
    if (desired !== this.snapshot.desired) { this.invalidate(); if (!this.snapshot.desired) void this.unload(); }
    else if (this.job?.scope === 'shared' && (this.snapshot.cooperationConsent !== 'decided' || !this.snapshot.shareIdle)) void this.cancelShared();
    this.sample();
  }
  setCooperation(shareIdle: boolean, allowRemote: boolean, enabled = this.snapshot.desired) {
    if (!this.worldActive) return;
    const changeEnabled = enabled !== this.snapshot.desired;
    this.patch({ cooperationConsent: 'decided', shareIdle, allowRemote, consent: enabled ? 'on' : 'off' });
    if (changeEnabled) this.setEnabled(enabled);
    this.saveConsent();
    if (!shareIdle && this.job?.scope === 'shared') void this.cancelShared();
    this.sample();
  }
  setConversationActive(active: boolean) {
    if (this.conversationActive === active) return;
    this.conversationActive = active;
    if (active && this.job?.scope === 'shared') void this.cancelShared();
    else this.sample();
  }
  private cancelShared(): Promise<void> {
    if (this.preempting) return this.preempting;
    this.generation++; this.job = undefined; this.patch({ busyKind: null }); this.announce(false);
    this.preempting = (async () => {
      await this.interrupt();
      this.epoch = uuid(); this.announced = '';
    })().finally(() => { this.preempting = undefined; this.sample(); });
    return this.preempting;
  }
  setWorldActive(active: boolean) {
    if (this.worldActive === active) return;
    this.worldActive = active; this.suspended = false; this.policy = initialAiResourcePolicy(); this.nextLockAt = 0;
    if (!active) {
      this.invalidate(); this.patch({ phase: 'off', progress: 0, reason: null }); void this.unload();
      return;
    }
    if (this.initialized) this.readConsent();
    this.initialize();
    if (this.fatalStopped && this.snapshot.desired) this.patch({ phase: this.fatalReason === 'gpu' ? 'unsupported' : 'error', reason: this.fatalReason === 'gpu' ? 'unsupported' : 'error' });
    this.sample();
  }
  initialize() {
    if (!this.worldActive || this.initialized) return;
    this.initialized = true;
    this.readConsent();
    this.startup = (async () => {
      let release: (() => void) | null = null;
      try { release = await this.env.acquireLock(); if (release && this.worldActive) await this.env.cleanup(); }
      catch { /* 再試行時にも清掃する。 */ } finally { release?.(); }
    })();
    void this.startup.finally(() => this.sample());
    this.sample();
  }
  setEnabled(enabled: boolean) {
    if (!this.initialized) this.initialize();
    this.manualPermit = enabled; this.fatalStopped = false; this.nextLockAt = 0;
    this.patch({ consent: enabled ? 'on' : 'off', desired: enabled, ...(enabled ? {} : { phase: 'off' as const, progress: 0, reason: null }) });
    this.saveConsent();
    if (!enabled) { this.invalidate(); void this.unload(); } else this.sample();
  }
  retry() {
    if (!this.worldActive || !this.snapshot.desired) return;
    this.manualPermit = true; this.fatalStopped = false; this.nextLockAt = 0; this.policy = initialAiResourcePolicy(); this.sample();
  }
  setTransport(send: (message: BrowserAiClientMsg) => void, connected: boolean) {
    const changed = this.connected !== connected;
    this.send = send; this.connected = connected;
    if (changed) { this.epoch = uuid(); this.announced = ''; }
    this.sample();
    if (this.worldActive && connected) this.announce(this.snapshot.phase === 'ready' || this.snapshot.phase === 'busy');
  }
  sample() {
    if (!this.worldActive || !this.initialized) return;
    if (!this.snapshot.desired) { this.announce(false); return; }
    const signals = { ...this.env.signals(), connected: this.connected };
    const decision = evaluateAiResources(this.policy, signals); this.policy = decision.state;
    if (this.suspended) { this.pause('hidden', true); return; }
    if (decision.pause) { this.pause(decision.reason, decision.unload, decision.unsupported); return; }
    if (this.fatalStopped) return;
    if (this.interrupting || this.preempting) return;
    if (this.worker?.loaded) {
      if (!this.job) this.patch({ phase: 'ready', reason: null, progress: 1 });
      this.announce(true); return;
    }
    if (this.loading || this.disposing) return;
    if (this.snapshot.loads >= 2 && !this.manualPermit) { this.patch({ phase: 'paused', reason: 'manual' }); this.announce(false); return; }
    if (signals.now < this.nextLockAt) return;
    this.loading = this.load().catch(() => { if (this.worldActive && this.snapshot.desired) this.fatal('error'); }).finally(() => { this.loading = undefined; this.sample(); });
  }
  private pause(reason: AiResourceReason, unload: boolean, unsupported = false) {
    const alreadyPaused = ['paused', 'unsupported'].includes(this.snapshot.phase);
    if (!alreadyPaused || this.job || this.loading && !this.worker?.loaded) {
      this.invalidate();
      if (!unload && this.worker?.loaded) void this.interrupt();
    }
    this.patch({ phase: unsupported ? 'unsupported' : 'paused', reason });
    this.announce(false);
    if (unload || this.loading && !this.worker?.loaded) void this.unload();
  }
  private async load() {
    await this.startup;
    if (!this.worldActive || !this.snapshot.desired || this.suspended || this.fatalStopped || this.policy.paused) return;
    const release = await this.env.acquireLock();
    if (!release) { this.nextLockAt = this.env.now() + 5_000; this.patch({ phase: 'paused', reason: 'other-tab' }); return; }
    if (!this.worldActive || !this.snapshot.desired || this.suspended || this.policy.paused) { release(); return; }
    this.release = release;
    const token = ++this.generation;
    const worker = this.env.createWorker({ onProgress: progress => {
      if (this.worker === worker && this.snapshot.phase === 'preparing') this.patch({ progress: Math.max(0, Math.min(1, progress)) });
    }, onFatal: reason => { if (this.worker === worker) this.fatal(reason); } });
    this.worker = worker; this.manualPermit = false;
    this.patch({ phase: 'preparing', progress: 0, reason: null, loads: this.snapshot.loads + 1 });
    try {
      await worker.load();
      if (this.worker !== worker || token !== this.generation || !this.worldActive || !this.snapshot.desired || this.policy.paused || this.suspended) return;
      this.sample();
    } catch { if (this.worker === worker && token === this.generation) this.fatal('error'); }
  }
  private fatal(reason: 'gpu' | 'error') {
    this.fatalStopped = true; this.fatalReason = reason; this.invalidate(); this.patch({ phase: reason === 'gpu' ? 'unsupported' : 'error', reason: reason === 'gpu' ? 'unsupported' : 'error' });
    void this.unload();
  }
  private interrupt(): Promise<void> {
    if (this.interrupting) return this.interrupting;
    const worker = this.worker;
    if (!worker) return Promise.resolve();
    this.interrupting = worker.interrupt().catch(() => { if (this.worker === worker) this.fatal('error'); })
      .finally(() => { this.interrupting = undefined; this.sample(); });
    return this.interrupting;
  }
  private unload(): Promise<void> {
    if (this.disposing) return this.disposing;
    const worker = this.worker; this.worker = undefined; const release = this.release; this.release = undefined;
    if (!worker && !release) return Promise.resolve();
    this.disposing = (async () => {
      try { if (worker) await worker.dispose(); } catch { /* worker側の強制終了処理にも委ねる。 */ }
      finally { release?.(); }
    })().finally(() => { this.disposing = undefined; this.sample(); });
    return this.disposing;
  }
  async handle(message: BrowserAiServerMsg) {
    if (message.t === 'aiSupportCancel') {
      if (this.job?.leaseId !== message.leaseId || this.job.epoch !== message.epoch) return;
      if (this.job.scope === 'shared') { await this.cancelShared(); return; }
      this.job = undefined; this.generation++;
      this.patch({ busyKind: null });
      await this.interrupt();
      this.sample(); return;
    }
    const job = message.job;
    this.sample();
    if (!this.worldActive || !this.snapshot.desired || !this.connected || this.policy.paused || this.fatalStopped || this.suspended || !this.worker?.loaded
      || this.job || this.interrupting || this.preempting || job.epoch !== this.epoch || job.expiresAt <= this.env.now()
      || job.scope !== undefined && job.scope !== 'self' && job.scope !== 'shared'
      || job.scope === 'shared' && (this.snapshot.cooperationConsent !== 'decided' || !this.snapshot.shareIdle || this.conversationActive)) {
      if (this.connected) this.send?.({ t: 'aiSupportResult', leaseId: job.leaseId, epoch: job.epoch, error: 'unavailable' });
      return;
    }
    const worker = this.worker, token = this.generation; this.job = job; this.patch({ phase: 'busy', busyKind: job.scope === 'shared' ? 'shared' : 'self' }); this.announce(true);
    try {
      let sequence = 0, lastChunkAt = -Infinity;
      const text = await worker.generate(job, part => {
        if (this.job !== job || token !== this.generation || !this.worldActive || !this.connected || !this.snapshot.desired || job.expiresAt <= this.env.now() || this.env.now() - lastChunkAt < 70 || sequence >= 512) return;
        lastChunkAt = this.env.now(); this.send?.({ t: 'aiSupportChunk', leaseId: job.leaseId, epoch: job.epoch, text: part, sequence: ++sequence });
      });
      if (this.job !== job || token !== this.generation || !this.worldActive || !this.connected || !this.snapshot.desired || job.expiresAt <= this.env.now()) return;
      this.send?.({ t: 'aiSupportResult', leaseId: job.leaseId, epoch: job.epoch, text });
    } catch {
      if (this.job === job && token === this.generation && this.connected) this.send?.({ t: 'aiSupportResult', leaseId: job.leaseId, epoch: job.epoch, error: 'unavailable' });
    } finally {
      if (this.job === job) { this.job = undefined; this.patch({ busyKind: null }); this.sample(); }
    }
  }
  pageHide() { if (!this.worldActive) return; this.suspended = true; this.invalidate(); this.patch({ phase: this.snapshot.desired ? 'paused' : 'off', reason: this.snapshot.desired ? 'hidden' : null }); void this.unload(); }
  pageShow() { if (!this.worldActive) return; this.suspended = false; this.sample(); }
}

const browserSignals = (): Omit<AiResourceSignals, 'connected'> => {
  const nav = globalThis.navigator as Navigator & { deviceMemory?: number; gpu?: unknown };
  const memory = (globalThis.performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } })?.memory;
  return { now: Date.now(), visible: typeof document === 'undefined' || document.visibilityState !== 'hidden', online: nav?.onLine !== false,
    webGpu: !!nav?.gpu && !!nav?.locks, deviceMemory: nav?.deviceMemory, heapRatio: memory?.jsHeapSizeLimit ? memory.usedJSHeapSize / memory.jsHeapSizeLimit : undefined, ...observed };
};
let observed: Pick<AiResourceSignals, 'fps' | 'eventLoopDelay' | 'longTaskMs'> = {};
function acquireBrowserLock(): Promise<(() => void) | null> {
  const locks = globalThis.navigator?.locks;
  if (!locks) return Promise.resolve(null);
  return new Promise(resolve => {
    void locks.request('tonarium-browser-ai-owner', { ifAvailable: true }, lock => {
      if (!lock) { resolve(null); return; }
      return new Promise<void>(release => resolve(release));
    }).catch(() => resolve(null));
  });
}
const controller = new AiSupportController({ now: Date.now, read: () => globalThis.localStorage?.getItem(AI_SUPPORT_CONSENT_KEY) ?? null,
  write: value => globalThis.localStorage?.setItem(AI_SUPPORT_CONSENT_KEY, value), cleanup: () => cleanupBrowserAiCache(),
  createWorker: callbacks => new BrowserAiWorker(callbacks), acquireLock: acquireBrowserLock, signals: browserSignals });
export const getAiSupportSnapshot = controller.getSnapshot;
export const subscribeAiSupport = controller.subscribe;
export const setAiSupportEnabled = (enabled: boolean) => controller.setEnabled(enabled);
export const setAiSupportCooperation = (shareIdle: boolean, allowRemote: boolean, enabled?: boolean) => controller.setCooperation(shareIdle, allowRemote, enabled);
let activeConversations = 0;
export function beginAiSupportConversation(): () => void {
  activeConversations++; controller.setConversationActive(true); let ended = false;
  return () => { if (ended) return; ended = true; activeConversations = Math.max(0, activeConversations - 1); controller.setConversationActive(activeConversations > 0); };
}
export const retryAiSupport = () => controller.retry();
export const setAiSupportTransport = (send: (message: BrowserAiClientMsg) => void, connected: boolean) => controller.setTransport(send, connected);
export const handleAiSupportMessage = (message: BrowserAiServerMsg) => { void controller.handle(message); };
let worldActive = false;
let stopMonitoring: (() => void) | undefined;
export function setAiSupportWorldActive(active: boolean) {
  if (worldActive === active) return;
  worldActive = active;
  if (!active) { stopMonitoring?.(); stopMonitoring = undefined; observed = {}; }
  controller.setWorldActive(active);
  if (active) initializeAiSupport();
}
export function initializeAiSupport() {
  if (!worldActive) return;
  controller.initialize();
  if (stopMonitoring || typeof window === 'undefined') return;
  let frames = 0, frameStart = performance.now(), lastTick = performance.now(), longTasks = 0;
  let stopped = false, frameId = 0;
  const frame = () => { if (stopped) return; frames++; frameId = requestAnimationFrame(frame); }; frameId = requestAnimationFrame(frame);
  let observer: PerformanceObserver | undefined;
  if (typeof PerformanceObserver !== 'undefined') {
    try { observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks += entry.duration; }); observer.observe({ type: 'longtask', buffered: false }); } catch { /* このヒントに非対応でも他の指標を使う。 */ }
  }
  const timer = window.setInterval(() => {
    const now = performance.now(), duration = now - frameStart;
    observed = { fps: duration > 0 && document.visibilityState !== 'hidden' ? frames * 1000 / duration : undefined,
      eventLoopDelay: Math.max(0, now - lastTick - 1000), longTaskMs: longTasks };
    frames = 0; frameStart = now; lastTick = now; longTasks = 0; controller.sample();
  }, 1000);
  const sample = () => controller.sample(), hide = () => controller.pageHide(), show = () => controller.pageShow();
  const storage = (event: StorageEvent) => {
    if (event.key === AI_SUPPORT_CONSENT_KEY) controller.refreshConsent();
  };
  for (const event of ['online', 'offline']) window.addEventListener(event, sample);
  document.addEventListener('visibilitychange', sample);
  window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show); window.addEventListener('storage', storage);
  stopMonitoring = () => {
    stopped = true; cancelAnimationFrame(frameId); window.clearInterval(timer); observer?.disconnect();
    for (const event of ['online', 'offline']) window.removeEventListener(event, sample);
    document.removeEventListener('visibilitychange', sample);
    window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show); window.removeEventListener('storage', storage);
  };
}
