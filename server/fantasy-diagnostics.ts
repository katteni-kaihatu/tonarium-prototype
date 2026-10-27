import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';

export type FantasyDialogueCaptureMode = 'off' | 'issues' | 'all';
export interface FantasyDiagnosticEvent {
  type: string;
  actorId?: string;
  sessionId?: string;
  requestId?: string;
  combatId?: string;
  activityId?: string;
  encounterId?: string;
  action?: string;
  operation?: string;
  status?: string;
  reason?: string;
  errorCode?: string;
  npcId?: string;
  location?: string;
  activityKind?: string;
  route?: string;
  model?: string;
  quality?: string;
  locale?: 'ko' | 'en' | 'ja';
  progress?: number;
  total?: number;
  completed?: boolean;
  generation?: number;
  ageDays?: number;
  lifespanDays?: number;
  partySize?: number;
  round?: number;
  turn?: number;
  roll?: number;
  rollTarget?: number;
  rollSuccess?: boolean;
  healthDelta?: number;
  manaDelta?: number;
  moneyDelta?: number;
  experienceDelta?: number;
  hungerDelta?: number;
  fatigueDelta?: number;
  durationMs?: number;
  revision?: number;
  expectedRevision?: number;
  worldHour?: number;
  fallback?: boolean;
  cancelled?: boolean;
  issue?: boolean;
  queryChars?: number;
  replyChars?: number;
  droppedCount?: number;
}
export interface FantasyDiagnosticsOptions {
  directory: string;
  captureMode?: FantasyDialogueCaptureMode;
  retentionDays?: number;
  maxFileBytes?: number;
  maxTotalBytes?: number;
  maxFiles?: number;
  maxQueueSize?: number;
  maxTextChars?: number;
  now?: () => number;
}
type Scalar = string | number | boolean;
type LogRow = Record<string, Scalar | Record<string, string>>;
type PendingRow = { row: LogRow; identifiers: Record<string, string> };
const logName = /^play-(\d{8}T\d{9}Z)-[a-f0-9]{8}\.jsonl$/u;
const codePattern = /^[a-zA-Z0-9][a-zA-Z0-9_.:/,+-]{0,95}$/u;
const codeFields = ['action', 'operation', 'status', 'reason', 'errorCode', 'npcId', 'location', 'activityKind', 'route', 'model', 'quality', 'locale'] as const;
const numberFields = ['progress', 'total', 'generation', 'ageDays', 'lifespanDays', 'partySize', 'round', 'turn', 'roll', 'rollTarget', 'healthDelta', 'manaDelta', 'moneyDelta', 'experienceDelta', 'hungerDelta', 'fatigueDelta', 'durationMs', 'revision', 'expectedRevision', 'worldHour', 'queryChars', 'replyChars', 'droppedCount'] as const;
const booleanFields = ['completed', 'rollSuccess', 'fallback', 'cancelled', 'issue'] as const;
const idFields = { actorId: 'actor', sessionId: 'session', requestId: 'request', combatId: 'combat', activityId: 'activity', encounterId: 'encounter' } as const;
const balanceFields = ['healthDelta', 'manaDelta', 'moneyDelta', 'experienceDelta', 'hungerDelta', 'fatigueDelta'] as const;

function bounded(value: number | undefined, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
}
function own(value: object, key: string): unknown {
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}
function code(value: unknown): string | undefined {
  return typeof value === 'string' && codePattern.test(value) && !/(?:password|passwd|authorization|cookie|recovery|ticket|sk-[a-z0-9]{12})/iu.test(value) ? value : undefined;
}
function redact(value: string, maxChars: number) {
  const input = value.slice(0, Math.max(maxChars * 4, 4096));
  const text = input
    .replace(/(?:authorization|cookie|set-cookie)\s*[:=：]\s*[^\r\n]+/giu, '[REDACTED]')
    .replace(/(?:bearer\s+)[a-z0-9._~+/=-]+/giu, '[REDACTED]')
    .replace(/(?:password|passwd|pwd|secret|token|api[_ -]?key|authorization|cookie|recovery(?:[_ -]?(?:code|key))?|ticket|パスワード(?:は)?|秘密鍵|認証(?:コード|トークン)?|回復コード|復旧コード|再発行コード|비밀번호(?:는|가)?|암호(?:는|가)?|인증(?:번호|코드|토큰)?|복구(?:코드|키))(?:\s*["']?\s*[:=：]\s*|\s+(?:is\s+)?)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/giu, '[REDACTED]')
    .replace(/(?:sk-|ghp_|github_pat_)[a-z0-9_-]{12,}|eyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+/giu, '[REDACTED]')
    .replace(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/giu, '[REDACTED]')
    .replace(/(?:\+\d[\d ()-]{7,}\d)/gu, '[REDACTED]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu, '');
  return { text: text.slice(0, maxChars), truncated: input.length < value.length || text.length > maxChars };
}
function issue(row: LogRow) {
  return row.issue === true || row.fallback === true || row.cancelled === true || typeof row.errorCode === 'string' || /error|fail|reject|cancel|timeout|invalid/iu.test(String(row.status ?? '')) || /low|invalid|empty|error/iu.test(String(row.quality ?? ''));
}
async function safeDirectory(directory: string, create: boolean) {
  if (create) await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Diagnostics directory must be a regular directory');
  return fs.realpath(directory);
}
async function files(directory: string) {
  const result: { name: string; bytes: number; timestamp: number }[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const match = logName.exec(entry.name);
    if (!match || !entry.isFile() || entry.isSymbolicLink()) continue;
    const stat = await fs.lstat(path.join(directory, entry.name));
    if (!stat.isFile() || stat.isSymbolicLink()) continue;
    const stamp = match[1];
    const timestamp = Date.parse(`${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}.${stamp.slice(15, 18)}Z`);
    if (Number.isFinite(timestamp)) result.push({ name: entry.name, bytes: stat.size, timestamp });
  }
  return result.sort((a, b) => a.timestamp - b.timestamp || a.name.localeCompare(b.name));
}

export class FantasyDiagnostics {
  readonly directory: string;
  readonly captureMode: FantasyDialogueCaptureMode;
  readonly #retentionDays: number;
  readonly #maxFileBytes: number;
  readonly #maxTotalBytes: number;
  readonly #maxFiles: number;
  readonly #maxQueueSize: number;
  readonly #maxTextChars: number;
  readonly #now: () => number;
  #queue: PendingRow[] = [];
  #worker: Promise<void> | undefined;
  #key: Buffer | undefined;
  #handle: FileHandle | undefined;
  #currentName = '';
  #currentBytes = 0;
  #closed = false;
  #disabled = false;
  #written = 0;
  #dropped = 0;
  #pendingDropped = 0;
  #failures = 0;

  constructor(options: FantasyDiagnosticsOptions) {
    this.directory = path.resolve(options.directory);
    this.captureMode = options.captureMode === 'all' || options.captureMode === 'issues' ? options.captureMode : 'off';
    this.#retentionDays = bounded(options.retentionDays, 14, 1, 365);
    this.#maxFileBytes = bounded(options.maxFileBytes, 4 * 1024 * 1024, 512, 64 * 1024 * 1024);
    this.#maxTotalBytes = bounded(options.maxTotalBytes, 64 * 1024 * 1024, this.#maxFileBytes, 1024 * 1024 * 1024);
    this.#maxFiles = bounded(options.maxFiles, 64, 1, 1024);
    this.#maxQueueSize = bounded(options.maxQueueSize, 1024, 1, 8192);
    this.#maxTextChars = bounded(options.maxTextChars, 1200, 32, 4000);
    this.#now = options.now ?? Date.now;
  }

  get stats() { return { written: this.#written, dropped: this.#dropped, failures: this.#failures, queued: this.#queue.length, disabled: this.#disabled }; }

  record(event: FantasyDiagnosticEvent): void { this.#record(event); }

  recordDialogue(event: FantasyDiagnosticEvent, dialogue: { query?: string; reply?: string }): void { this.#record(event, dialogue); }

  #record(event: FantasyDiagnosticEvent, dialogue?: { query?: string; reply?: string }): void {
    try {
      if (this.#closed || this.#disabled) { this.#dropped++; return; }
      if (this.#queue.length >= this.#maxQueueSize) { this.#dropped++; this.#pendingDropped++; return; }
      if (!event || typeof event !== 'object') return;
      const type = code(own(event, 'type'));
      if (!type) return;
      const row: LogRow = { version: 1, at: new Date(this.#now()).toISOString(), type };
      for (const key of codeFields) { const value = code(own(event, key)); if (value !== undefined) row[key] = value; }
      for (const key of numberFields) { const value = own(event, key); if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e15) row[key] = value; }
      for (const key of booleanFields) { const value = own(event, key); if (typeof value === 'boolean') row[key] = value; }
      const identifiers: Record<string, string> = {};
      for (const [key, target] of Object.entries(idFields)) { const value = own(event, key); if (typeof value === 'string' && value.length <= 512) identifiers[target] = value; }
      if (dialogue && typeof dialogue === 'object') {
        const query = own(dialogue, 'query'), reply = own(dialogue, 'reply');
        if (typeof query === 'string') row.queryChars = query.length;
        if (typeof reply === 'string') row.replyChars = reply.length;
        if (this.captureMode === 'all' || this.captureMode === 'issues' && issue(row)) {
          const captured: Record<string, string> = {};
          if (typeof query === 'string') { const clean = redact(query, this.#maxTextChars); captured.query = clean.text; if (clean.truncated) row.queryTruncated = true; }
          if (typeof reply === 'string') { const clean = redact(reply, this.#maxTextChars); captured.reply = clean.text; if (clean.truncated) row.replyTruncated = true; }
          if (Object.keys(captured).length) row.dialogue = captured;
        }
      }
      this.#queue.push({ row, identifiers });
      this.#schedule();
    } catch { this.#failures++; }
  }

  #schedule() {
    if (!this.#worker) this.#worker = Promise.resolve().then(() => this.#drain()).catch(() => { this.#failures++; }).finally(() => { this.#worker = undefined; });
  }

  async #initialize() {
    if (this.#key) return;
    await safeDirectory(this.directory, true);
    const filename = path.join(this.directory, '.actor-key');
    let handle: FileHandle | undefined;
    try {
      handle = await fs.open(filename, 'wx', 0o600);
      const key = randomBytes(32);
      await handle.writeFile(key); await handle.sync();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    } finally { await handle?.close(); }
    const stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== 32) throw new Error('Invalid private diagnostics key');
    this.#key = await fs.readFile(filename);
    await this.#prune(false);
  }

  async #prune(reserve: boolean) {
    const candidates = await files(this.directory);
    let bytes = candidates.reduce((total, item) => total + item.bytes, 0), count = candidates.length;
    const cutoff = this.#now() - this.#retentionDays * 86_400_000;
    for (const item of candidates) {
      if (item.name === this.#currentName) continue;
      if (item.timestamp >= cutoff && count <= this.#maxFiles - Number(reserve) && bytes <= this.#maxTotalBytes - (reserve ? this.#maxFileBytes : 0)) continue;
      const filename = path.join(this.directory, item.name), stat = await fs.lstat(filename);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      await fs.unlink(filename); count--; bytes -= item.bytes;
    }
  }

  async #append(row: LogRow) {
    let line = JSON.stringify(row) + '\n';
    if (Buffer.byteLength(line) > this.#maxFileBytes) { delete row.dialogue; row.dialogueOmitted = true; line = JSON.stringify(row) + '\n'; }
    const bytes = Buffer.byteLength(line);
    if (bytes > this.#maxFileBytes) { this.#dropped++; this.#pendingDropped++; return; }
    const stamp = new Date(this.#now()).toISOString().replace(/[-:.]/gu, '');
    if (!this.#handle || this.#currentBytes + bytes > this.#maxFileBytes || !this.#currentName.startsWith(`play-${stamp.slice(0, 8)}T`)) {
      await this.#handle?.close(); this.#handle = undefined; this.#currentName = '';
      await this.#prune(true);
      this.#currentName = `play-${stamp}-${randomBytes(4).toString('hex')}.jsonl`;
      this.#handle = await fs.open(path.join(this.directory, this.#currentName), 'ax', 0o600);
      this.#currentBytes = 0;
    }
    await this.#handle.writeFile(line, 'utf8'); this.#currentBytes += bytes; this.#written++;
  }

  async #drain() {
    try {
      await this.#initialize();
      while (this.#queue.length || this.#pendingDropped) {
        if (this.#pendingDropped) {
          const count = this.#pendingDropped; this.#pendingDropped = 0;
          await this.#append({ version: 1, at: new Date(this.#now()).toISOString(), type: 'diagnostics.drop', droppedCount: count });
        }
        const next = this.#queue.shift();
        if (!next) continue;
        for (const [key, value] of Object.entries(next.identifiers)) next.row[key] = createHmac('sha256', this.#key!).update(key).update('\0').update(value).digest('hex').slice(0, 24);
        await this.#append(next.row);
      }
    } catch {
      this.#failures++; this.#disabled = true; this.#dropped += this.#queue.length; this.#queue = [];
      try { await this.#handle?.close(); } catch { /* 診断失敗でプレイを止めない。 */ }
      this.#handle = undefined;
    }
  }

  async flush(): Promise<void> {
    try { while (this.#worker) await this.#worker; } catch { this.#failures++; }
  }

  async close(): Promise<void> {
    this.#closed = true;
    await this.flush();
    try { await this.#handle?.close(); } catch { this.#failures++; }
    this.#handle = undefined;
  }
}

export interface FantasyDiagnosticsReportOptions { directory: string; maxFiles?: number; maxBytes?: number; maxLineBytes?: number; }
async function scanDiagnostics(options: FantasyDiagnosticsReportOptions, consume: (row: Record<string, unknown>, position: { file: string; line: number }) => void) {
  const directory = await safeDirectory(path.resolve(options.directory), false);
  const maxFiles = bounded(options.maxFiles, 256, 1, 1024), maxBytes = bounded(options.maxBytes, 64 * 1024 * 1024, 1024, 1024 * 1024 * 1024), maxLineBytes = bounded(options.maxLineBytes, 32768, 256, 262144);
  const scan = { filesRead: 0, bytesRead: 0, ignoredLines: 0, ignoredPartialLines: 0, unreadableFiles: 0, limited: false };
  const line = (value: string, position: { file: string; line: number }) => {
    try {
      const row = JSON.parse(value);
      if (!row || typeof row !== 'object' || Array.isArray(row) || !code(row.type)) { scan.ignoredLines++; return; }
      consume(row, position);
    } catch { scan.ignoredLines++; }
  };
  const candidates = await files(directory);
  if (candidates.length > maxFiles) scan.limited = true;
  for (const file of candidates.slice(-maxFiles).reverse()) {
    if (scan.bytesRead >= maxBytes) { scan.limited = true; break; }
    let partial = '', oversized = false, lineNumber = 0;
    try {
      const filename = path.join(directory, file.name), stat = await fs.lstat(filename);
      if (!stat.isFile() || stat.isSymbolicLink()) { scan.unreadableFiles++; continue; }
      const remaining = maxBytes - scan.bytesRead;
      const stream = createReadStream(filename, { highWaterMark: 65536, start: 0, end: Math.max(0, remaining - 1) });
      const decoder = new StringDecoder('utf8');
      scan.filesRead++;
      for await (const chunk of stream) {
        const buffer = chunk as Buffer, text = decoder.write(buffer); scan.bytesRead += buffer.length;
        for (const segment of text.split(/(?<=\n)/u)) {
          if (!oversized) { partial += segment; if (Buffer.byteLength(partial) > maxLineBytes) { oversized = true; partial = ''; } }
          if (segment.endsWith('\n')) { lineNumber++; if (oversized) scan.ignoredLines++; else if (partial.trim()) line(partial, { file: file.name, line: lineNumber }); partial = ''; oversized = false; }
        }
      }
      if (partial || oversized) scan.ignoredPartialLines++;
      if (file.bytes > remaining) scan.limited = true;
    } catch { scan.unreadableFiles++; }
  }
  return scan;
}

export async function summarizeDiagnostics(options: FantasyDiagnosticsReportOptions) {
  const report = { records: 0, firstAt: undefined as string | undefined, lastAt: undefined as string | undefined, types: {} as Record<string, number>, statuses: {} as Record<string, number>, errorCodes: {} as Record<string, number>, routes: {} as Record<string, number>, qualities: {} as Record<string, number>, issueRecords: 0, dialogueRecords: 0, droppedRecords: 0, actors: 0, balanceDeltas: {} as Record<string, number>, timings: { count: 0, minMs: 0, maxMs: 0, meanMs: 0, p50Ms: 0, p95Ms: 0 } };
  const durations: number[] = [], actors = new Set<string>();
  let aggregateLimited = false;
  const count = (target: Record<string, number>, value: unknown) => { const key = code(value); if (key) { const bucket = Object.hasOwn(target, key) || Object.keys(target).length < 256 ? key : '_other'; target[bucket] = (Object.hasOwn(target, bucket) ? target[bucket] : 0) + 1; } };
  const scan = await scanDiagnostics(options, row => {
    report.records++; count(report.types, row.type); count(report.statuses, row.status); count(report.errorCodes, row.errorCode); count(report.routes, row.route); count(report.qualities, row.quality);
    if (issue(row as LogRow)) report.issueRecords++;
    if (row.dialogue && typeof row.dialogue === 'object') report.dialogueRecords++;
    if (row.type === 'diagnostics.drop' && typeof row.droppedCount === 'number' && row.droppedCount > 0 && row.droppedCount <= 1e15) report.droppedRecords += row.droppedCount;
    if (typeof row.actor === 'string' && /^[a-f0-9]{24}$/u.test(row.actor)) { if (actors.size < 100000) actors.add(row.actor); else aggregateLimited = true; }
    if (typeof row.at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(row.at) && Number.isFinite(Date.parse(row.at))) { if (!report.firstAt || row.at < report.firstAt) report.firstAt = row.at; if (!report.lastAt || row.at > report.lastAt) report.lastAt = row.at; }
    for (const key of balanceFields) { const value = row[key]; if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e15) report.balanceDeltas[key] = (report.balanceDeltas[key] ?? 0) + value; }
    if (typeof row.durationMs === 'number' && Number.isFinite(row.durationMs) && row.durationMs >= 0 && row.durationMs <= 86_400_000) { if (durations.length < 1000000) durations.push(row.durationMs); else aggregateLimited = true; }
  });
  durations.sort((a, b) => a - b); report.actors = actors.size;
  if (durations.length) report.timings = { count: durations.length, minMs: durations[0], maxMs: durations.at(-1)!, meanMs: durations.reduce((sum, value) => sum + value, 0) / durations.length, p50Ms: durations[Math.ceil(durations.length * 0.5) - 1], p95Ms: durations[Math.ceil(durations.length * 0.95) - 1] };
  return { ...report, ...scan, limited: scan.limited || aggregateLimited };
}

export interface FantasyConversationReadOptions extends FantasyDiagnosticsReportOptions { from?: string; to?: string; npc?: string; locale?: 'ko' | 'en' | 'ja'; actor?: string; limit?: number; }
export interface FantasyDiagnosticConversation {
  at: string;
  startedAt?: string;
  type: string;
  actor?: string;
  npcId?: string;
  locale?: 'ko' | 'en' | 'ja';
  status?: string;
  route?: string;
  reason?: string;
  errorCode?: string;
  durationMs?: number;
  query?: string;
  reply?: string;
  queryTruncated: boolean;
  replyTruncated: boolean;
}
function dateBoundary(value: string | undefined, end: boolean) {
  if (value === undefined) return end ? Infinity : -Infinity;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/u.test(value);
  if (!dateOnly && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) throw new Error('Use an ISO date or timestamp');
  const result = Date.parse(dateOnly ? `${value}T00:00:00.000Z` : value);
  if (!Number.isFinite(result) || dateOnly && new Date(result).toISOString().slice(0, 10) !== value) throw new Error('Invalid date');
  return result + (dateOnly && end ? 86_400_000 - 1 : 0);
}
export async function readDiagnosticConversations(options: FantasyConversationReadOptions) {
  const from = dateBoundary(options.from, false), to = dateBoundary(options.to, true);
  if (from > to) throw new Error('from date must precede to date');
  if (options.npc !== undefined && !code(options.npc)) throw new Error('Invalid NPC code');
  if (options.locale !== undefined && !['ko', 'en', 'ja'].includes(options.locale)) throw new Error('Invalid locale');
  if (options.actor !== undefined && !/^[a-f0-9]{24}$/u.test(options.actor)) throw new Error('Use an anonymous actor hash');
  const limit = bounded(options.limit, 100, 1, 1000), conversations: FantasyDiagnosticConversation[] = [];
  interface Turn { id: string; at: string; type: string; key?: string; queryHash?: string; paired?: boolean; startedAt?: string; kind: 'request' | 'reply' | 'other'; }
  const turns: Turn[] = [];
  let pairingLimited = false;
  const describe = (row: Record<string, unknown>, position: { file: string; line: number }): Turn | undefined => {
    if (typeof row.type !== 'string' || !/^(?:(?:ai|npc|gm)[._]|dialogue$)/u.test(row.type) || typeof row.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(row.at)) return;
    const at = Date.parse(row.at), dialogue = row.dialogue;
    if (!Number.isFinite(at) || !dialogue || typeof dialogue !== 'object' || Array.isArray(dialogue)) return;
    if (options.npc !== undefined && row.npcId !== options.npc || options.locale !== undefined && row.locale !== options.locale || options.actor !== undefined && row.actor !== options.actor) return;
    const query = own(dialogue, 'query'), reply = own(dialogue, 'reply');
    if (typeof query !== 'string' && typeof reply !== 'string') return;
    const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{24}$/u.test(value) ? value : undefined;
    const actor = hash(row.actor), request = hash(row.request);
    return { id: `${position.file}:${position.line}`, at: row.at, type: row.type,
      kind: /[._]request$/u.test(row.type) ? 'request' : /[._]reply$/u.test(row.type) ? 'reply' : 'other',
      ...(actor && request ? { key: [actor, request, hash(row.session) ?? '', code(row.npcId) ?? '', code(row.locale) ?? ''].join(':') } : {}),
      ...(typeof query === 'string' ? { queryHash: createHash('sha256').update(query).digest('hex') } : {}) };
  };
  const scan = await scanDiagnostics(options, (row, position) => {
    const turn = describe(row, position);
    if (!turn) return;
    if (turns.length >= 65536) { pairingLimited = true; return; }
    turns.push(turn);
  });
  turns.sort((a, b) => a.at.localeCompare(b.at) || (a.kind === 'request' ? 0 : 1) - (b.kind === 'request' ? 0 : 1) || a.id.localeCompare(b.id));
  const pending = new Map<string, Turn[]>();
  for (const turn of turns) {
    if (!turn.key || !turn.queryHash) continue;
    if (turn.kind === 'request') { const requests = pending.get(turn.key) ?? []; requests.push(turn); pending.set(turn.key, requests); }
    else if (turn.kind === 'reply') {
      const requests = pending.get(turn.key);
      if (!requests) continue;
      const index = requests.findLastIndex(request => request.queryHash === turn.queryHash);
      if (index < 0) continue;
      const request = requests.splice(index, 1)[0]; request.paired = true; turn.startedAt = request.at;
      if (!requests.length) pending.delete(turn.key);
    }
  }
  const matching = turns.filter(turn => !turn.paired && Date.parse(turn.at) >= from && Date.parse(turn.at) <= to);
  const selected = new Map(matching.slice(-limit).map(turn => [turn.id, turn]));
  let reread: Awaited<ReturnType<typeof scanDiagnostics>> | undefined;
  if (selected.size) reread = await scanDiagnostics(options, (row, position) => {
    const original = selected.get(`${position.file}:${position.line}`);
    if (!original) return;
    const current = describe(row, position);
    if (!current || current.at !== original.at || current.type !== original.type || current.key !== original.key || current.queryHash !== original.queryHash) return;
    const dialogue = row.dialogue as object, query = own(dialogue, 'query'), reply = own(dialogue, 'reply');
    const conversation: FantasyDiagnosticConversation = { at: original.at, type: original.type, queryTruncated: row.queryTruncated === true, replyTruncated: row.replyTruncated === true };
    if (original.startedAt) conversation.startedAt = original.startedAt;
    if (typeof row.actor === 'string' && /^[a-f0-9]{24}$/u.test(row.actor)) conversation.actor = row.actor;
    for (const key of ['npcId', 'status', 'route', 'reason', 'errorCode'] as const) { const value = code(row[key]); if (value !== undefined) conversation[key] = value; }
    if (original.kind === 'request') conversation.status = 'pending';
    if (typeof row.durationMs === 'number' && Number.isFinite(row.durationMs) && row.durationMs >= 0 && row.durationMs <= 86_400_000) conversation.durationMs = row.durationMs;
    if (row.locale === 'ko' || row.locale === 'en' || row.locale === 'ja') conversation.locale = row.locale;
    if (typeof query === 'string') { const clean = redact(query, 4000); conversation.query = clean.text; conversation.queryTruncated ||= clean.truncated; }
    if (typeof reply === 'string') { const clean = redact(reply, 4000); conversation.reply = clean.text; conversation.replyTruncated ||= clean.truncated; }
    conversations.push(conversation);
  });
  conversations.sort((a, b) => a.at.localeCompare(b.at));
  return { conversations, matched: matching.length, ...scan, rereadBytes: reread?.bytesRead ?? 0, limited: scan.limited || pairingLimited || matching.length > limit || reread?.limited === true || selected.size !== conversations.length };
}
