import type { BrowserAiGeneration } from '../shared/ai-support.ts';
import { BrowserAiBroker, validBrowserAiGeneration } from './browser-ai.ts';

export interface BrowserAiPoolMember {
  user(): string | null;
  session(): string | null;
  eligible(): boolean;
}
interface Entry { broker: BrowserAiBroker; member: BrowserAiPoolMember; order: number }
interface Assignment { owner: string; requester: BrowserAiBroker; provider: BrowserAiBroker; controller: AbortController }

export class BrowserAiPool {
  private members = new Map<BrowserAiBroker, Entry>();
  private conversations = new Map<string, number>();
  private reservations = new Map<string, number>();
  private assignments = new Map<string, Assignment>();
  private sequence = 0;
  private cursor = 0;
  private now: () => number;
  private reservationMs: number;
  constructor(options: { now?: () => number; reservationMs?: number } = {}) {
    this.now = options.now ?? Date.now;
    this.reservationMs = Math.max(0, Math.min(10_000, options.reservationMs ?? 2000));
  }

  register(broker: BrowserAiBroker, member: BrowserAiPoolMember): () => void {
    const entry: Entry = { broker, member, order: ++this.sequence };
    this.members.set(broker, entry);
    return () => {
      if (this.members.get(broker) !== entry) return;
      this.members.delete(broker);
      for (const assignment of this.assignments.values()) if (assignment.requester === broker || assignment.provider === broker) assignment.controller.abort();
      broker.cancelShared();
    };
  }

  generateFor(user: string, session: string, broker: BrowserAiBroker, personal: BrowserAiGeneration,
    signal: AbortSignal, shared?: BrowserAiGeneration, progress?: (text: string) => void): Promise<string | undefined> {
    const owner = this.members.get(broker), identity = owner && this.identity(owner);
    if (!user || !session || !identity || identity.user !== user || identity.session !== session || !signal || signal.aborted
      || !validBrowserAiGeneration(personal)) return Promise.resolve(undefined);
    const key = JSON.stringify([user, session, personal.kind, personal.requestId]);
    if (this.assignments.has(key)) return Promise.resolve(undefined);
    let provider = broker;
    if (!broker.available) {
      if (!broker.allowsRemote || !shared || !validBrowserAiGeneration(shared) || shared.kind !== personal.kind) return Promise.resolve(undefined);
      this.pruneReservations();
      const candidates = [...this.members.values()].filter(entry => {
        const candidate = this.identity(entry);
        return candidate && candidate.user !== user && candidate.session === session && entry.broker.acceptsShared
          && !this.conversations.has(candidate.user) && !this.reservations.has(candidate.user);
      }).sort((a, b) => a.order - b.order);
      const selected = candidates.find(entry => entry.order > this.cursor) ?? candidates[0];
      if (!selected) return Promise.resolve(undefined);
      provider = selected.broker; this.cursor = selected.order;
    }
    return this.run(key, user, session, broker, provider, provider === broker ? personal : shared!, signal, progress);
  }

  beginConversation(user: string): () => void {
    if (!user) return () => {};
    this.pruneReservations();
    this.conversations.set(user, (this.conversations.get(user) ?? 0) + 1);
    this.reservations.set(user, this.now() + this.reservationMs);
    for (const entry of this.members.values()) if (entry.member.user() === user) entry.broker.cancelShared();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const count = (this.conversations.get(user) ?? 1) - 1;
      if (count > 0) this.conversations.set(user, count); else this.conversations.delete(user);
      this.reservations.set(user, this.now() + this.reservationMs);
    };
  }

  cancelOwner(user: string): void {
    for (const assignment of this.assignments.values()) if (assignment.owner === user) assignment.controller.abort();
  }

  private identity(entry: Entry): { user: string; session: string } | undefined {
    try {
      const user = entry.member.user(), session = entry.member.session();
      return !entry.broker.closed && user && session && entry.member.eligible() ? { user, session } : undefined;
    } catch { return undefined; }
  }

  private pruneReservations(): void {
    for (const [user, until] of this.reservations) if (until <= this.now()) this.reservations.delete(user);
  }

  private async run(key: string, user: string, session: string, requester: BrowserAiBroker, provider: BrowserAiBroker,
    request: BrowserAiGeneration, signal: AbortSignal, progress?: (text: string) => void): Promise<string | undefined> {
    const controller = new AbortController(), abort = () => controller.abort();
    const providerEntry = this.members.get(provider), providerUser = providerEntry && this.identity(providerEntry)?.user;
    const assignment: Assignment = { owner: user, requester, provider, controller };
    this.assignments.set(key, assignment); signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    try {
      const onProgress = (text: string) => {
        const owner = this.members.get(requester), current = owner && this.identity(owner);
        const providerEntry = this.members.get(provider), activeProvider = providerEntry && this.identity(providerEntry);
        if (!controller.signal.aborted && current?.user === user && current.session === session
          && (requester === provider || requester.allowsRemote && !!activeProvider && activeProvider.user === providerUser && activeProvider.session === session)) progress?.(text);
      };
      const answer = await (requester === provider ? provider.generate(request, controller.signal, undefined, onProgress) : provider.generateShared(request, controller.signal, onProgress));
      const ownerEntry = this.members.get(requester), owner = ownerEntry && this.identity(ownerEntry);
      const currentProviderEntry = this.members.get(provider), currentProvider = currentProviderEntry && this.identity(currentProviderEntry);
      if (controller.signal.aborted || !owner || owner.user !== user || owner.session !== session
        || requester !== provider && (!requester.allowsRemote || !currentProvider || currentProvider.user !== providerUser || currentProvider.session !== session)) return undefined;
      return answer;
    } finally {
      signal.removeEventListener('abort', abort);
      if (this.assignments.get(key) === assignment) this.assignments.delete(key);
    }
  }
}
