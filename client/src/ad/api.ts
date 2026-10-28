import type { AuthProvider } from './user.mjs';

/** ランキング応答の1行。playerId はセーブのキーなのでサーバーは返さない (#210)。自分の行には self が付く */
export interface LeaderboardEntry {
  name: string;
  antimatterLog10: number;
  infinities: number;
  playTimeSec: number;
  self?: boolean;
}

/** スコア送信時の形。こちらは自分の playerId を含む */
export interface LeaderboardSubmission {
  playerId: string;
  name: string;
  antimatterLog10: number;
  infinities: number;
  playTimeSec: number;
}

export class AdApiClient {
  private base: string;
  private auth: AuthProvider;

  constructor(apiBase: string, auth: AuthProvider) {
    this.base = apiBase.replace(/\/+$/, '');
    this.auth = auth;
  }

  private async request(path: string, options: RequestInit = {}): Promise<{ res: Response; data: Record<string, unknown> }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${this.base}${path}`, {
        ...options,
        headers: { ...this.auth.getAuthHeaders(), ...(options.headers ?? {}) },
        signal: controller.signal,
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) {
        const err = new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`);
        (err as Error & { status?: number }).status = res.status;
        throw err;
      }
      return { res, data };
    } finally {
      clearTimeout(timer);
    }
  }

  async save(playerId: string, save: Record<string, unknown>, revision: number): Promise<number> {
    const { data } = await this.request(`/api/save/${encodeURIComponent(playerId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ save, revision }),
    });
    if (!Number.isSafeInteger(data.revision) || Number(data.revision) < 1) throw new Error('Invalid revision');
    return data.revision as number;
  }

  async load(playerId: string): Promise<{ save: Record<string, unknown> | null; revision: number }> {
    const { data } = await this.request(`/api/save/${encodeURIComponent(playerId)}`);
    if (!Number.isSafeInteger(data.revision) || Number(data.revision) < 0) throw new Error('Invalid revision');
    return { save: (data.save ?? null) as Record<string, unknown> | null, revision: data.revision as number };
  }

  private async post(path: string, body: unknown) {
    return (await this.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).data;
  }
  async create(): Promise<{ id: string; token: string }> {
    return this.connection(await this.post('/api/ad/create', {}));
  }
  async exchange(code: string): Promise<{ id: string; token: string }> {
    return this.connection(await this.post('/api/ad/exchange', { code }));
  }
  private connection(data: Record<string, unknown>): { id: string; token: string } {
    if (!data || typeof data.id !== 'string' || !data.id || typeof data.token !== 'string' || !data.token) throw new Error('Invalid connection');
    return { id: data.id, token: data.token };
  }
  async transfer(id: string): Promise<{ code: string; expiresAt: number }> {
    return await this.post('/api/ad/transfer', { id }) as { code: string; expiresAt: number };
  }

  async leaderboard(): Promise<LeaderboardEntry[]> {
    const { data } = await this.request('/api/leaderboard');
    return Array.isArray(data.entries) ? (data.entries as LeaderboardEntry[]) : [];
  }

  async submitScore(entry: LeaderboardSubmission): Promise<void> {
    await this.request('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  }
}
