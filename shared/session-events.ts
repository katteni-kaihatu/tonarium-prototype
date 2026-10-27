import type { Frame, KokosyncClient, Value } from '../vendor/kokosync/index.js';
import type { ChatMessage, RoomClientMsg, RoomServerMsg } from './protocol.ts';
import { DICE_MAX, isDieSides, type DiceRoll } from './dice.ts';
import { isDeltaAction, MEDIA_URL_RE, type Item } from './items.ts';
import { base64, importKey, open, pack, seal, unbase64, type Envelope, type PositionPeer, type SyncConfig } from './session-wire.ts';

export const EVENT_TOPIC = 'tonarium.event.v1';
export const EVENT_BULK_TOPIC = 'tonarium.event.bulk.v1';
export const RECOVERY_TOPIC = 'tonarium.event.recovery.v1';
export const MISSING_TOPIC = 'tonarium.event.missing.v1';
const CACHE_BYTES = 32 * 1024 * 1024;
const CACHE_COUNT = 128;
const CACHE_MS = 60_000;
export type PeerCommand = Extract<RoomClientMsg, { t: 'chat' | 'itemAction' }>;
export interface PeerOperation {
  id: string; at: number; hash: string; key: string; command: PeerCommand; roll?: DiceRoll;
}
export interface PeerCommit { kind: 'peerCommit'; id: string; hash: string; key: string; source: string }
export interface EventPayload { kind: 'message'; message: RoomServerMsg }
interface EventData { id: string; packet: Envelope }

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object' || value instanceof Uint8Array) return value;
  return Object.fromEntries(Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => [k, canonical(value[k])]));
}
export async function eventHash(value: unknown) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', pack(canonical(value))));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}
export function isPeerCommand(msg: any): msg is PeerCommand {
  return !!msg && (msg.t === 'chat' || msg.t === 'itemAction' && !!msg.action &&
    (isDeltaAction(msg.action) || msg.action.a === 'diceRoll'));
}
export function validPeerOperation(value: any): value is PeerOperation {
  if (!value || typeof value.id !== 'string' || !/^[\da-f-]{36}$/i.test(value.id) ||
    !Number.isSafeInteger(value.at) || Math.abs(value.at - Date.now()) > 60_000 ||
    typeof value.hash !== 'string' || !/^[\da-f]{64}$/.test(value.hash) ||
    typeof value.key !== 'string' || !isPeerCommand(value.command)) return false;
  try { if (unbase64(value.key).length !== 32) return false; } catch { return false; }
  if (value.command.t === 'itemAction' && value.command.action.a === 'diceRoll') {
    const a = value.command.action, r = value.roll;
    return isDieSides(a.sides) && Number.isInteger(a.count) && a.count >= 1 && a.count <= DICE_MAX && !!r &&
      r.id === value.id && r.at === value.at && r.sides === a.sides && r.count === a.count && r.secret === !!a.secret &&
      Array.isArray(r.results) && r.results.length === a.count && r.results.every((n: unknown) => Number.isInteger(n) && Number(n) >= 1 && Number(n) <= a.sides);
  }
  return value.roll === undefined;
}

export function proposeEvent(command: RoomClientMsg, context: { sid: string; user: string; name: string; at: number; item?: Item }):
  { id: string; at: number; command: PeerCommand; roll?: DiceRoll; payload: EventPayload } | null {
  if (!isPeerCommand(command)) return null;
  const id = crypto.randomUUID(), at = Math.round(context.at);
  let message: RoomServerMsg;
  let roll: DiceRoll | undefined;
  if (command.t === 'chat') {
    const text = String(command.text ?? '').trim().slice(0, 1000);
    const image = typeof command.image === 'string' && /^data:image\/(jpeg|png|gif);base64,/.test(command.image) && command.image.length < 2_000_000 ? command.image : undefined;
    const scope = command.scope === 'near' || command.scope === 'announce' ? command.scope : 'all';
    // 近距離の宛先はサーバーが確定するため、本文は従来経路で扱う。
    if (scope === 'near') return null;
    let media = command.media;
    if (media) {
      if (!MEDIA_URL_RE.test(media.url)) return null;
      const size = (n: number) => Math.max(1, Math.min(10000, Math.round(Number(n) || 1)));
      media = { kind: /\.(mp4|webm)$/.test(media.url) ? 'video' : 'image', url: media.url, w: size(media.w), h: size(media.h) };
    }
    if (!text && !image && !media) return null;
    const m: ChatMessage = { id, from: context.user, fromName: context.name, text, at, scope,
      ...(typeof command.clientRequestId === 'string' && /^[\da-f-]{36}$/i.test(command.clientRequestId) ? { clientRequestId: command.clientRequestId } : {}),
      ...(image ? { image } : {}), ...(media ? { media } : {}) };
    message = { t: 'chat', sid: context.sid, m };
  } else if (command.action.a === 'diceRoll') {
    const item = context.item, a = command.action;
    if (item?.kind !== 'dice' || !isDieSides(a.sides) || !Number.isInteger(a.count) || a.count < 1 || a.count > DICE_MAX) return null;
    roll = { id, by: context.user, sides: a.sides, count: a.count, secret: !!a.secret, at,
      results: Array.from({ length: a.count }, () => Math.floor(Math.random() * a.sides) + 1) };
    message = { t: 'item', sid: context.sid, item: { ...item, updatedBy: context.user, roll: roll.secret ? { ...roll, results: null } : roll } };
  } else {
    if (context.item?.kind !== 'canvas') return null;
    message = { t: 'itemAction', sid: context.sid, id: command.id, action: command.action, by: context.user };
  }
  return { id, at, command, ...(roll ? { roll } : {}), payload: { kind: 'message', message } };
}

export class SessionEvents {
  private peers = new Set<string>();
  private cache = new Map<string, { data: EventData; size: number; at: number }>();
  private cacheBytes = 0;
  private pending = new Map<string, { commit: PeerCommit; finish(value: EventPayload): void; fail(error: Error): void; timer: ReturnType<typeof setTimeout>; recovery: ReturnType<typeof setTimeout> }>();
  private jobs: { to: string; data: EventData; size: number }[] = [];
  private queuedBytes = 0;
  private active = 0;
  private closed = false;
  private key: Promise<CryptoKey>;
  constructor(private client: KokosyncClient, private config: SyncConfig) { this.key = importKey(config.key); }
  update(peers: PositionPeer[]) { this.peers = new Set(peers.filter((p) => p.delivery).map((p) => p.peer)); }
  async prepare(command: RoomClientMsg, context: Parameters<typeof proposeEvent>[1]): Promise<PeerOperation | null> {
    const proposal = proposeEvent(command, context);
    if (!proposal || !this.config.peerDelivery || this.closed) return null;
    const key = base64(crypto.getRandomValues(new Uint8Array(32)));
    const packet = await seal(await importKey(key), proposal.id, 'event', 1, proposal.payload);
    const data = { id: proposal.id, packet }, size = pack(data).length;
    if (this.closed || size > (this.client.capabilities.peerDelivery?.messageBytes ?? 0)) return null;
    const operation = { id: proposal.id, at: proposal.at, key, hash: await eventHash(proposal.payload), command: proposal.command,
      ...(proposal.roll ? { roll: proposal.roll } : {}) };
    this.remember(this.config.peer, data, size);
    for (const to of this.peers) if (to !== this.config.peer && to !== this.config.server && this.queuedBytes + size <= CACHE_BYTES && this.jobs.length < CACHE_COUNT) {
      this.jobs.push({ to, data, size }); this.queuedBytes += size;
    }
    this.pump();
    return operation;
  }
  private pump() {
    // SDKの制御・復旧用の転送枠を使い切らない。
    while (!this.closed && this.active < 2 && this.jobs.length) {
      const job = this.jobs.shift()!;
      if (!this.peers.has(job.to)) { this.queuedBytes -= job.size; continue; }
      this.active++;
      void this.client.sendTo(job.to, job.size > 16384 ? EVENT_BULK_TOPIC : EVENT_TOPIC, job.data as unknown as Value)
        .catch(() => {}).finally(() => { this.active--; this.queuedBytes -= job.size; this.pump(); });
    }
  }
  private cacheKey(peer: string, id: string) { return `${peer}:${id}`; }
  private remember(peer: string, data: EventData, size: number) {
    if (size > CACHE_BYTES || this.closed) return;
    const key = this.cacheKey(peer, data.id), old = this.cache.get(key);
    if (old) return;
    this.cache.set(key, { data, size, at: Date.now() }); this.cacheBytes += size;
    for (const [id, entry] of this.cache) {
      if (this.cacheBytes <= CACHE_BYTES && this.cache.size <= CACHE_COUNT && Date.now() - entry.at < CACHE_MS) break;
      this.cache.delete(id); this.cacheBytes -= entry.size;
    }
    const waiting = this.pending.get(key);
    if (waiting) void this.read(waiting.commit).then((value) => { if (value) waiting.finish(value); }).catch(() => {});
  }
  receive(frame: Frame) {
    if (this.closed) return;
    if (frame.topic === RECOVERY_TOPIC && frame.peer === this.config.server) return this.receiveRecovery(frame);
    if ((frame.topic !== EVENT_TOPIC && frame.topic !== EVENT_BULK_TOPIC) || !this.peers.has(frame.peer)) return;
    const data = frame.value as EventData;
    if (!data || typeof data.id !== 'string' || data.id.length !== 36 || data.packet?.grant !== data.id || data.packet?.lane !== 'event') return;
    this.remember(frame.peer, data, pack(data).length);
  }
  private async read(commit: PeerCommit) {
    const id = this.cacheKey(commit.source, commit.id), entry = this.cache.get(id);
    if (!entry) return;
    if (Date.now() - entry.at >= CACHE_MS) { this.cache.delete(id); this.cacheBytes -= entry.size; return; }
    const result = await open(await importKey(commit.key), commit.id, 'event', entry.data.packet);
    if (result.seq !== 1 || await eventHash(result.value) !== commit.hash) return;
    return result.value as EventPayload;
  }
  private async receiveRecovery(frame: Frame) {
    const result = await open(await this.key, this.config.token, 'recovery', frame.value);
    const { source, id, payload } = result.value;
    const waiting = this.pending.get(this.cacheKey(source, id));
    if (waiting && await eventHash(payload) === waiting.commit.hash) waiting.finish(payload);
  }
  async resolve(commit: PeerCommit): Promise<EventPayload> {
    if (this.closed) throw new Error('Session closed');
    try { const value = await this.read(commit); if (value) return value; } catch { /* 復号できないコピーもサーバーから回復する。 */ }
    if (this.closed) throw new Error('Session closed');
    const id = this.cacheKey(commit.source, commit.id);
    return new Promise((resolve, reject) => {
      const cleanup = () => { const entry = this.pending.get(id); if (entry) { clearTimeout(entry.timer); clearTimeout(entry.recovery); this.pending.delete(id); } };
      const fail = (error: Error) => { cleanup(); reject(error); };
      const finish = (value: EventPayload) => { cleanup(); resolve(value); };
      const timer = setTimeout(() => fail(new Error('Peer event recovery timed out')), 10_000);
      const recovery = setTimeout(() => {
        void this.client.sendTo(this.config.server, MISSING_TOPIC, { id: commit.id, source: commit.source }).catch((error) => fail(error));
      }, 250);
      this.pending.set(id, { commit, finish, fail, timer, recovery });
      // read()の間に届いたコピーも取り込む。
      void this.read(commit).then((value) => { if (value) finish(value); }).catch(() => {});
    });
  }
  close() {
    this.closed = true;
    for (const entry of [...this.pending.values()]) entry.fail(new Error('Session closed'));
    this.cache.clear(); this.cacheBytes = 0; this.jobs = [];
  }
}
