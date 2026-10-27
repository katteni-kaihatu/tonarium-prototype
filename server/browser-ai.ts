import { randomUUID } from 'node:crypto';
import { BROWSER_AI_MODEL, type BrowserAiCooperation, type BrowserAiGenerate, type BrowserAiGeneration, type BrowserAiJob, type BrowserAiServerMsg } from '../shared/ai-support.ts';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const token = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export function browserAiText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string' || value.length > maximum + 4096 || controls.test(value)) return undefined;
  const clean = value.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/gi, '').trim();
  if (!clean || clean.length > maximum || /^[\[{]/.test(clean) || /```|<\/?think>|<(?:tool_call|function_call|script|iframe)\b|"(?:action|actions|suggestions|tool_calls|function_call)"\s*:/i.test(clean)) return undefined;
  return clean;
}

export function validBrowserAiGeneration(value: unknown): value is BrowserAiGeneration {
  return record(value) && exact(value, ['messages', 'maxTokens', 'temperature', 'requestId', 'kind'])
    && token(value.requestId) && ['npc', 'gm'].includes(String(value.kind))
    && Number.isInteger(value.maxTokens) && Number(value.maxTokens) >= 1 && Number(value.maxTokens) <= 256
    && typeof value.temperature === 'number' && Number.isFinite(value.temperature) && value.temperature >= 0 && value.temperature <= 1
    && Array.isArray(value.messages) && value.messages.length > 0 && value.messages.length <= 16
    && value.messages.every(message => record(message) && exact(message, ['role', 'content']) && ['system', 'user', 'assistant'].includes(String(message.role))
      && typeof message.content === 'string' && !controls.test(message.content))
    && value.messages.reduce((sum: number, message: { content: string }) => sum + message.content.length, 0) <= 20_000;
}

function validCooperation(value: unknown): value is BrowserAiCooperation {
  return record(value) && exact(value, ['version', 'shareIdle', 'allowRemote', 'idle']) && value.version === 2
    && typeof value.shareIdle === 'boolean' && typeof value.allowRemote === 'boolean' && typeof value.idle === 'boolean';
}

interface Pending {
  job: BrowserAiJob; signal: AbortSignal; abort: () => void; timer: ReturnType<typeof setTimeout>;
  resolve: (text: string | undefined) => void;
  progress?: (text: string) => void; sequence: number;
}

/** 応答の所有権は、プールの依頼人ではなく実際に貸し出した接続で検証する。 */
export class BrowserAiBroker {
  private ready = false;
  private epoch = '';
  private closedState = false;
  private cooperation?: BrowserAiCooperation;
  private pending?: Pending;
  private now: () => number;
  private timeoutMs: number;
  constructor(private send: (message: BrowserAiServerMsg) => void, options: { now?: () => number; timeoutMs?: number } = {}) {
    this.now = options.now ?? Date.now;
    this.timeoutMs = Math.min(30_000, Math.max(1, options.timeoutMs ?? 20_000));
  }

  get closed(): boolean { return this.closedState; }
  get available(): boolean { return !this.closedState && this.ready && !this.pending; }
  get acceptsShared(): boolean { return this.available && this.cooperation?.shareIdle === true && this.cooperation.idle; }
  get allowsRemote(): boolean { return !this.closedState && this.cooperation?.allowRemote === true; }
  get pendingScope(): 'self' | 'shared' | undefined { return this.pending?.job.scope; }

  setReady(value: unknown): boolean {
    if (this.closedState || !record(value) || !(exact(value, ['t', 'ready', 'epoch', 'model'])
      || exact(value, ['t', 'ready', 'epoch', 'model', 'cooperation']) && validCooperation(value.cooperation))
      || value.t !== 'aiSupport' || typeof value.ready !== 'boolean' || !token(value.epoch) || value.model !== BROWSER_AI_MODEL) return false;
    const cancel = !value.ready || value.epoch !== this.epoch;
    this.epoch = value.epoch; this.ready = value.ready;
    this.cooperation = value.cooperation === undefined ? undefined : structuredClone(value.cooperation as BrowserAiCooperation);
    if (cancel) this.cancel();
    else if (this.pending?.job.scope === 'shared' && (!this.cooperation?.shareIdle || !this.cooperation.idle)) this.cancelShared();
    return true;
  }

  generate: BrowserAiGenerate = (request, signal, _shared, progress) => this.start(request, signal, 'self', progress);

  generateShared(request: BrowserAiGeneration, signal: AbortSignal, progress?: (text: string) => void): Promise<string | undefined> {
    if (!this.acceptsShared) return Promise.resolve(undefined);
    return this.start(request, signal, 'shared', progress);
  }

  private start(request: BrowserAiGeneration, signal: AbortSignal, scope: 'self' | 'shared', progress?: (text: string) => void): Promise<string | undefined> {
    if (!this.available || !signal || signal.aborted || !validBrowserAiGeneration(request)) return Promise.resolve(undefined);
    const job: BrowserAiJob = { ...structuredClone(request), requestId: scope === 'shared' ? randomUUID() : request.requestId,
      leaseId: randomUUID(), epoch: this.epoch, expiresAt: this.now() + this.timeoutMs, scope };
    return new Promise(resolve => {
      const pending: Pending = { job, signal, resolve, progress, sequence: 0, abort: () => this.finish(pending, undefined, true), timer: setTimeout(() => this.finish(pending, undefined, true), this.timeoutMs) };
      this.pending = pending;
      signal.addEventListener('abort', pending.abort, { once: true });
      if (signal.aborted) { pending.abort(); return; }
      try { this.send({ t: 'aiSupportJob', job }); }
      catch { this.finish(pending, undefined, false); }
    });
  }

  result(value: unknown): boolean {
    const pending = this.pending;
    if (!pending || !record(value) || !['aiSupportResult', 'aiSupportChunk'].includes(String(value.t)) || value.leaseId !== pending.job.leaseId || value.epoch !== pending.job.epoch) return false;
    if (this.now() >= pending.job.expiresAt) { this.finish(pending, undefined, true); return false; }
    if (value.t === 'aiSupportChunk') {
      if (!exact(value, ['t', 'leaseId', 'epoch', 'text', 'sequence']) || !Number.isSafeInteger(value.sequence) || Number(value.sequence) <= pending.sequence || Number(value.sequence) > 512) return false;
      const text = browserAiText(value.text, pending.job.kind === 'npc' ? 1200 : 2400);
      if (!text) return false;
      pending.sequence = Number(value.sequence); pending.progress?.(text); return true;
    }
    const textResult = exact(value, ['t', 'leaseId', 'epoch', 'text']);
    const errorResult = exact(value, ['t', 'leaseId', 'epoch', 'error']) && ['cancelled', 'unavailable', 'invalid'].includes(String(value.error));
    const text = textResult ? browserAiText(value.text, pending.job.kind === 'npc' ? 1200 : 2400) : undefined;
    this.finish(pending, text, !text && pending.job.scope === 'shared');
    return !!text || errorResult;
  }

  close(): void {
    this.closedState = true; this.ready = false; this.cooperation = undefined; this.cancel();
  }

  cancelPending(): void { this.cancel(); }
  cancelShared(): void { if (this.pending?.job.scope === 'shared') this.finish(this.pending, undefined, true); }

  private cancel(): void { if (this.pending) this.finish(this.pending, undefined, true); }

  private finish(pending: Pending, text: string | undefined, notify: boolean): void {
    if (this.pending !== pending) return;
    this.pending = undefined;
    clearTimeout(pending.timer); pending.signal.removeEventListener('abort', pending.abort);
    if (notify && pending.job.scope === 'shared') this.ready = false;
    if (notify) {
      try { this.send({ t: 'aiSupportCancel', leaseId: pending.job.leaseId, epoch: pending.job.epoch }); }
      catch { /* 切断後の通知失敗でも待機を終える。 */ }
    }
    pending.resolve(text);
  }
}
