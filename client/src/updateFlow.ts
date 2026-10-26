export interface UpdatePreferences { enabled: boolean; seconds: number }
export const validUpdateSeconds = (value: number) => Number.isInteger(value) && value >= 1 && value <= 300;
export function readUpdatePreferences(storage: Pick<Storage, 'getItem'>, electron: boolean): UpdatePreferences {
  const fallback = { enabled: !electron, seconds: 5 };
  try {
    const saved = JSON.parse(storage.getItem(`tonarium.updates.${electron ? 'electron' : 'web'}`) ?? 'null');
    return { enabled: typeof saved?.enabled === 'boolean' ? saved.enabled : fallback.enabled,
      seconds: validUpdateSeconds(saved?.seconds) ? saved.seconds : 5 };
  } catch { return fallback; }
}

export function saveUpdatePreferences(storage: Pick<Storage, 'setItem'>, electron: boolean, preferences: UpdatePreferences) {
  if (typeof preferences.enabled !== 'boolean' || !validUpdateSeconds(preferences.seconds)) throw new Error('Invalid update preferences');
  storage.setItem(`tonarium.updates.${electron ? 'electron' : 'web'}`, JSON.stringify(preferences));
}

export class UpdateCountdown {
  version: string | null = null;
  deadline: number | null = null;
  private seen = new Set<string>();
  detect(version: string | null, preferences: UpdatePreferences, now: number) {
    if (!version || this.seen.has(version)) return;
    this.seen.add(version);
    this.version = version;
    if (this.deadline === null && preferences.enabled) this.deadline = now + preferences.seconds * 1000;
  }
  cancel() { this.deadline = null; }
  remaining(now: number) { return this.deadline === null ? null : Math.max(0, Math.ceil((this.deadline - now) / 1000)); }
}
