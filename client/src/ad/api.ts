import type { AuthProvider } from './user.mjs';

export interface LeaderboardEntry {
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

  setAuth(auth: AuthProvider): void {
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

  async save(playerId: string, save: Record<string, unknown>): Promise<void> {
    await this.request(`/api/save/${encodeURIComponent(playerId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ save, updatedAt: new Date().toISOString() }),
    });
  }

  async load(playerId: string): Promise<Record<string, unknown> | null> {
    try {
      const { data } = await this.request(`/api/save/${encodeURIComponent(playerId)}`);
      return (data.save ?? null) as Record<string, unknown> | null;
    } catch (err) {
      if (err instanceof Error && (err as Error & { status?: number }).status === 404) return null;
      throw err;
    }
  }

  async leaderboard(): Promise<LeaderboardEntry[]> {
    const { data } = await this.request('/api/leaderboard');
    return Array.isArray(data.entries) ? (data.entries as LeaderboardEntry[]) : [];
  }

  async submitScore(entry: LeaderboardEntry): Promise<void> {
    await this.request('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  }
}
