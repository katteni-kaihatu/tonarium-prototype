import type { BrowserAiJob, BrowserAiMessage } from '../../../shared/ai-support.ts';
import { BROWSER_AI_MODEL, BROWSER_AI_CONTEXT, BROWSER_AI_MAX_TEXT, BROWSER_AI_MAX_JOB_MS, browserAiAppConfig, browserAiPlainText, validBrowserAiJob } from './model.ts';
import { cleanupBrowserAiCache } from './cache.ts';

export type BrowserAiWorkerRequest = { id: string; type: 'load' | 'interrupt' | 'dispose' } | { id: string; type: 'generate'; job: BrowserAiJob };
export type BrowserAiWorkerResponse = { id: string; type: 'ok'; text?: string } | { id: string; type: 'chunk'; text: string } | { id: string; type: 'error'; reason: 'gpu' | 'error' | 'cancelled' | 'invalid' } | { type: 'progress'; progress: number } | { type: 'fatal'; reason: 'gpu' | 'error' };
export interface BrowserAiEngine {
  stream(messages: BrowserAiMessage[], maxTokens: number): Promise<AsyncIterable<string>>;
  interrupt(): void; unload(): Promise<void>; reset(): Promise<void>;
}
export interface BrowserAiRuntimeDependencies {
  create(progress: (value: number) => void): Promise<BrowserAiEngine>;
  cleanup(): Promise<void>;
  now(): number;
}
const abort = () => new DOMException('Browser AI generation cancelled', 'AbortError');
export function browserAiFailure(error: unknown): 'gpu' | 'error' {
  return /webgpu|gpu|device.?lost|shader.f16|\boom\b|\benomem\b|out[\s_-]*of[\s_-]*memory|allocat\w*.*(?:fail|exceed|too large)|(?:fail|unable|could not).*allocat|(?:insufficient|not enough|cannot enlarge).*memory|memory.*(?:limit|exceed|exhaust|fail)/i.test(String(error)) ? 'gpu' : 'error';
}
export function browserAiWorkerError(error: unknown): 'gpu' | 'error' | 'cancelled' | 'invalid' {
  if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
  // 実行時の割当失敗もTypeErrorになるため、不正入力より先に扱う。
  if (browserAiFailure(error) === 'gpu') return 'gpu';
  return error instanceof TypeError ? 'invalid' : 'error';
}

async function createEngine(progress: (value: number) => void): Promise<BrowserAiEngine> {
  const gpu = (globalThis.navigator as Navigator & { gpu?: { requestAdapter(options: { powerPreference: string }): Promise<{ features: { has(feature: string): boolean } } | null> } }).gpu;
  const adapter = await gpu?.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter?.features.has('shader-f16')) throw new Error('WebGPU shader-f16 is unavailable');
  const webllm = await import('@mlc-ai/web-llm');
  // prefill_chunk_size は公開 ChatOptions ではなく WASM metadata に固定されている。
  const engine = await webllm.CreateMLCEngine(BROWSER_AI_MODEL, { appConfig: browserAiAppConfig(webllm.prebuiltAppConfig), initProgressCallback: report => progress(report.progress), logLevel: 'WARN' }, { context_window_size: BROWSER_AI_CONTEXT, temperature: 0.7 });
  return {
    async stream(messages, maxTokens) {
      const chunks = await engine.chat.completions.create({ messages, stream: true, max_tokens: maxTokens, temperature: 0.7, extra_body: { enable_thinking: false } });
      return { async *[Symbol.asyncIterator]() { for await (const chunk of chunks) { const content = chunk.choices[0]?.delta.content; if (typeof content === 'string') yield content; } } };
    },
    interrupt: () => engine.interruptGenerate(), unload: () => engine.unload(), reset: () => engine.resetChat(),
  };
}

export class BrowserAiRuntime {
  private engine?: BrowserAiEngine;
  private loading?: Promise<void>;
  private active?: { token: object; cancelled: boolean; done: Promise<string> };
  private closing = false;
  constructor(private dependencies: BrowserAiRuntimeDependencies = { create: createEngine, cleanup: () => cleanupBrowserAiCache(), now: Date.now }, private progress: (value: number) => void = () => {}) {}
  get loaded() { return !!this.engine && !this.closing; }
  load(): Promise<void> {
    if (this.closing) return Promise.reject(abort());
    if (this.engine) return Promise.resolve();
    if (!this.loading) this.loading = (async () => {
      const engine = await this.dependencies.create(value => { if (!this.closing) this.progress(Math.max(0, Math.min(1, value))); });
      this.engine = engine;
      if (this.closing) { await engine.unload(); this.engine = undefined; throw abort(); }
      try { await this.dependencies.cleanup(); }
      catch (error) { this.engine = undefined; await engine.unload().catch(() => {}); throw error; }
    })().catch(error => { this.loading = undefined; throw error; });
    return this.loading;
  }
  generate(job: BrowserAiJob, progress?: (text: string) => void): Promise<string> {
    if (!this.loaded || this.active) return Promise.reject(new Error('Browser AI is not ready'));
    if (!validBrowserAiJob(job, this.dependencies.now())) return Promise.reject(new TypeError('Invalid browser AI job'));
    const engine = this.engine!, state = { token: {}, cancelled: false, done: Promise.resolve('') };
    const cancelled = () => state.cancelled || this.closing || this.active?.token !== state.token;
    this.active = state;
    state.done = (async () => {
      const timer = setTimeout(() => { state.cancelled = true; engine.interrupt(); }, Math.max(1, Math.min(BROWSER_AI_MAX_JOB_MS, job.expiresAt - this.dependencies.now())));
      try {
        await engine.reset();
        if (cancelled() || this.dependencies.now() >= job.expiresAt) throw abort();
        const chunks = await engine.stream(structuredClone(job.messages), job.maxTokens);
        let text = '';
        for await (const chunk of chunks) {
          if (cancelled() || this.dependencies.now() >= job.expiresAt) throw abort();
          text += chunk;
          const spoken = browserAiPlainText(text);
          if (spoken) progress?.(spoken);
          if (text.length >= BROWSER_AI_MAX_TEXT * 2) { engine.interrupt(); break; }
        }
        if (cancelled()) throw abort();
        const plain = browserAiPlainText(text);
        if (!plain) throw new Error('Empty browser AI response');
        return plain;
      } finally {
        clearTimeout(timer);
        try { if (job.scope === 'shared' && !this.closing) await engine.reset(); }
        finally { if (this.active?.token === state.token) this.active = undefined; }
      }
    })();
    return state.done;
  }
  async interrupt(): Promise<void> {
    const active = this.active;
    if (!active) return;
    active.cancelled = true; this.engine?.interrupt();
    await active.done.catch(() => {});
  }
  async dispose(): Promise<void> {
    this.closing = true;
    await this.interrupt();
    await this.loading?.catch(() => {});
    const engine = this.engine; this.engine = undefined;
    if (engine) await engine.unload();
    await this.dependencies.cleanup();
  }
}

const scope = globalThis as unknown as { postMessage?: (message: BrowserAiWorkerResponse) => void; onmessage?: (event: { data: BrowserAiWorkerRequest }) => void; onunhandledrejection?: (event: { reason: unknown; preventDefault(): void }) => void };
if (typeof document === 'undefined' && typeof scope.postMessage === 'function') {
  const runtime = new BrowserAiRuntime(undefined, progress => scope.postMessage!({ type: 'progress', progress }));
  scope.onmessage = event => {
    const request = event.data;
    if (!request || typeof request.id !== 'string') return;
    void (async () => {
      try {
        let text: string | undefined;
        if (request.type === 'load') await runtime.load();
        else if (request.type === 'generate') text = await runtime.generate(request.job, part => scope.postMessage!({ id: request.id, type: 'chunk', text: part }));
        else if (request.type === 'interrupt') await runtime.interrupt();
        else if (request.type === 'dispose') await runtime.dispose();
        else return;
        scope.postMessage!({ id: request.id, type: 'ok', ...(text === undefined ? {} : { text }) });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) console.warn('[browser-ai] worker failure', error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300));
        scope.postMessage!({ id: request.id, type: 'error', reason: browserAiWorkerError(error) });
      }
    })();
  };
  scope.onunhandledrejection = event => { event.preventDefault(); scope.postMessage!({ type: 'fatal', reason: browserAiFailure(event.reason) }); };
}
