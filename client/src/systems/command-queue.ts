import type { SystemCommand } from '../../../shared/system-types.ts';

export type QueuedSystemCommand = Exclude<SystemCommand, { kind: 'map' }>;
export interface SystemCommandContext { sid: string; mapId: string; revision: number; ready: boolean }
export interface SystemCommandReply {
  sid: string;
  mapId: string;
  revision: number;
  commandId: string;
  outcome: 'applied' | 'duplicate' | 'rejected';
  error?: string;
}
export interface SystemCommandQueueOptions {
  context: () => SystemCommandContext | undefined;
  send: (command: QueuedSystemCommand) => void;
  error: (message: string) => void;
  timeoutMs?: number;
  maxRetries?: number;
  timers?: { set: (callback: () => void, milliseconds: number) => unknown; clear: (handle: unknown) => void };
}
interface PendingCommand {
  command: QueuedSystemCommand;
  sid: string;
  mapId: string;
  retries: number;
  sentRevision: number;
  timer?: unknown;
}

const unavailable = '공유 시스템 연결이 준비된 뒤 다시 입력해 주세요.';
const changed = '맵이나 연결이 바뀌어 대기 중인 입력을 취소했습니다.';
const uncertain = '입력 결과를 확인하지 못했습니다. 상태를 확인한 뒤 다시 입력해 주세요.';

export class SystemCommandQueue {
  private waiting: QueuedSystemCommand[] = [];
  private pending?: PendingCommand;
  private scope?: { sid: string; mapId: string };
  private revisionFloor = 0;
  private recent = new Set<string>();
  private closed = false;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly timers: NonNullable<SystemCommandQueueOptions['timers']>;

  constructor(private options: SystemCommandQueueOptions) {
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.maxRetries = options.maxRetries ?? 8;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0 || !Number.isInteger(this.maxRetries) || this.maxRetries < 0 || this.maxRetries > 8) throw new Error('Invalid system command queue limits');
    this.timers = options.timers ?? { set: (callback, milliseconds) => setTimeout(callback, milliseconds), clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>) };
  }

  get size() { return this.waiting.length + (this.pending ? 1 : 0); }

  private context() {
    const context = this.options.context();
    return context?.ready && context.sid && context.mapId && Number.isSafeInteger(context.revision) && context.revision >= 0 ? context : undefined;
  }
  private matches(context: SystemCommandContext) { return this.scope?.sid === context.sid && this.scope.mapId === context.mapId; }
  private remember(id: string) {
    this.recent.add(id);
    if (this.recent.size > 256) this.recent.delete(this.recent.values().next().value!);
  }

  enqueue(command: QueuedSystemCommand): boolean {
    if (this.closed) return false;
    const context = this.context();
    if (!context) { this.reset(); this.options.error(unavailable); return false; }
    if (this.scope && !this.matches(context)) this.reset(changed);
    if (!this.scope) this.scope = { sid: context.sid, mapId: context.mapId };
    if (this.size >= 128) { this.options.error('입력이 너무 많습니다. 잠시 기다린 뒤 다시 입력해 주세요.'); return false; }
    if (this.recent.has(command.id) || this.pending?.command.id === command.id || this.waiting.some(queued => queued.id === command.id)) {
      this.options.error('이미 처리한 입력입니다. 새 입력으로 다시 요청해 주세요.'); return false;
    }
    this.waiting.push(structuredClone(command));
    return this.pending ? true : this.dispatch();
  }

  private dispatch(): boolean {
    if (this.closed || this.pending || !this.waiting.length) return false;
    const context = this.context();
    if (!context || !this.matches(context)) { this.reset(changed); return false; }
    const pending: PendingCommand = { command: this.waiting.shift()!, sid: context.sid, mapId: context.mapId, retries: 0, sentRevision: -1 };
    this.pending = pending;
    return this.transmit(pending, context);
  }

  private transmit(pending: PendingCommand, context: SystemCommandContext): boolean {
    this.revisionFloor = Math.max(this.revisionFloor, context.revision);
    pending.sentRevision = this.revisionFloor;
    const attempt = pending.retries;
    pending.timer = this.timers.set(() => {
      if (this.pending === pending && pending.retries === attempt) this.reset(uncertain);
    }, this.timeoutMs);
    try {
      this.options.send({ ...structuredClone(pending.command), revision: this.revisionFloor });
      return true;
    } catch {
      // 送信途中の例外では適用済みか分からないため、後続も自動で流さない。
      this.reset(uncertain); return false;
    }
  }

  reply(reply: SystemCommandReply): boolean {
    if (this.closed || !this.pending) return false;
    const context = this.context();
    if (!context || !this.matches(context)) { this.reset(changed); return false; }
    const pending = this.pending;
    if (reply.commandId !== pending.command.id || reply.sid !== pending.sid || reply.mapId !== pending.mapId ||
      !['applied', 'duplicate', 'rejected'].includes(reply.outcome) || !Number.isSafeInteger(reply.revision) || reply.revision < 0) return false;
    if (reply.outcome === 'rejected' && reply.error === 'system revision conflict' && reply.revision <= pending.sentRevision) return false;
    this.timers.clear(pending.timer);
    this.revisionFloor = Math.max(this.revisionFloor, context.revision, reply.revision);
    if (reply.outcome === 'rejected' && reply.error === 'system revision conflict' && pending.retries < this.maxRetries) {
      pending.retries++;
      this.transmit(pending, context);
      return true;
    }
    this.pending = undefined;
    this.remember(pending.command.id);
    if (reply.outcome === 'rejected') this.options.error(reply.error === 'system revision conflict'
      ? '다른 변경과 계속 충돌합니다. 상태를 확인한 뒤 다시 입력해 주세요.'
      : reply.error ?? '공유 시스템 입력을 처리하지 못했습니다.');
    this.dispatch();
    return true;
  }

  reset(reason?: string) {
    const hadInputs = this.size > 0;
    if (this.pending) { this.timers.clear(this.pending.timer); this.remember(this.pending.command.id); }
    for (const command of this.waiting) this.remember(command.id);
    this.pending = undefined; this.waiting = []; this.scope = undefined; this.revisionFloor = 0;
    if (reason && hadInputs) this.options.error(reason);
  }

  dispose() { this.reset(); this.closed = true; }
}
