import fs from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';

interface Save { save: unknown; revision: number }
interface Score { playerId: string; name: string; antimatterLog10: number; infinities: number; playTimeSec: number }
interface State {
  saves: Record<string, Save>;
  grants: Record<string, string>;
  codes: Record<string, { id: string; expiresAt: number }>;
  scores: Score[];
}
export class AdStoreError extends Error {
  constructor(public status: number) { super(`AD request rejected (${status})`); }
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');

export class AdStore {
  private state: State;
  private attempts = new Map<string, { count: number; until: number }>();
  constructor(private file: string, private now = Date.now, legacyScores: Score[] = []) {
    // 既存ファイルが壊れた場合、新規状態で上書きしない。
    this.state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {
      saves: {}, grants: {}, codes: {}, scores: legacyScores,
    };
  }
  private commit(next: State) {
    const tmp = `${this.file}.tmp`;
    const fd = fs.openSync(tmp, 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(next)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, this.file);
    this.state = next;
  }
  private change<T>(fn: (next: State) => T): T {
    const next = structuredClone(this.state);
    const result = fn(next);
    this.commit(next);
    return result;
  }
  owner(token: string): string {
    const id = this.state.grants[hash(token)];
    if (!token || !id) throw new AdStoreError(403);
    return id;
  }
  authorize(id: string, token: string) {
    if (this.owner(token) !== id) throw new AdStoreError(403);
  }
  limit(key: string, max = 20) {
    const now = this.now();
    for (const [k, v] of this.attempts) if (v.until <= now) this.attempts.delete(k);
    const entry = this.attempts.get(key) ?? { count: 0, until: now + 60_000 };
    if (++entry.count > max) throw new AdStoreError(429);
    this.attempts.set(key, entry);
  }
  create() {
    const id = secret(), token = secret();
    return this.change(next => {
      next.saves[id] = { save: null, revision: 0 };
      next.grants[hash(token)] = id;
      return { id, token };
    });
  }
  load(id: string, token: string) {
    this.authorize(id, token);
    return structuredClone(this.state.saves[id]);
  }
  save(id: string, token: string, revision: unknown, save: unknown) {
    this.authorize(id, token);
    if (!save || typeof save !== 'object' || Array.isArray(save)) throw new AdStoreError(400);
    if (revision !== this.state.saves[id].revision) throw new AdStoreError(409);
    return this.change(next => {
      next.saves[id] = { save, revision: next.saves[id].revision + 1 };
      return { revision: next.saves[id].revision };
    });
  }
  issue(id: string, token: string) {
    this.authorize(id, token);
    this.limit(`issue:${hash(token)}`, 5);
    const code = randomBytes(16).toString('hex');
    const expiresAt = this.now() + 10 * 60_000;
    return this.change(next => {
      for (const [key, value] of Object.entries(next.codes)) if (value.expiresAt <= this.now() || value.id === id) delete next.codes[key];
      next.codes[hash(code)] = { id, expiresAt };
      return { code, expiresAt };
    });
  }
  exchange(code: unknown, peer: string) {
    this.limit(`exchange:${peer}`);
    if (typeof code !== 'string' || !/^[a-f0-9]{32}$/.test(code)) throw new AdStoreError(400);
    const record = this.state.codes[hash(code)];
    if (!record || record.expiresAt <= this.now()) throw new AdStoreError(400);
    const token = secret();
    // 同期処理で消費と権限追加を一つのファイルに確定し、並行交換を直列化する。
    return this.change(next => {
      delete next.codes[hash(code)];
      next.grants[hash(token)] = record.id;
      return { id: record.id, token };
    });
  }
  leaderboard(token: string) {
    let self = '';
    try { self = this.owner(token); } catch { /* 公開ランキングは認証不要 */ }
    return this.state.scores.map(({ playerId, name, antimatterLog10, infinities, playTimeSec }) => ({
      name, antimatterLog10, infinities, playTimeSec, ...(playerId === self ? { self: true } : {}),
    }));
  }
  submit(token: string, entry: Partial<Score>) {
    const id = this.owner(token);
    if (entry.playerId !== id) throw new AdStoreError(403);
    for (const value of [entry.antimatterLog10, entry.infinities, entry.playTimeSec]) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new AdStoreError(400);
    }
    const score: Score = { playerId: id, name: String(entry.name ?? '').slice(0, 24), antimatterLog10: entry.antimatterLog10!, infinities: entry.infinities!, playTimeSec: entry.playTimeSec! };
    this.change(next => {
      next.scores = next.scores.filter(e => e.playerId !== id);
      next.scores.push(score);
      next.scores.sort((a, b) => b.antimatterLog10 - a.antimatterLog10 || b.infinities - a.infinities);
      next.scores = next.scores.slice(0, 50);
    });
  }
}
