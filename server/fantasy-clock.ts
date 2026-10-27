import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FANTASY_WORLD_TIME_RATE, type FantasyWorldClock } from '../shared/fantasy.ts';

interface SavedClock { version: 1; hour: number; wallTime: number }
interface ClockOptions {
  now?: () => number;
  initialHour?: number;
  save?: (file: string, text: string) => void;
  onError?: (error: unknown) => void;
}

function saveClock(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, text, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

export class FantasyClock {
  private anchor: SavedClock;
  private lastHour: number;
  private now: () => number;
  private save: (file: string, text: string) => void;
  private onError: (error: unknown) => void;
  private lastSave: number;
  private failed = false;
  readonly loadError?: string;

  constructor(private file: string, options: ClockOptions = {}) {
    this.now = options.now ?? Date.now;
    this.save = options.save ?? saveClock;
    this.onError = options.onError ?? (error => console.error('[fantasy-clock] save/load failed', error));
    const now = this.now();
    this.anchor = { version: 1, hour: Math.max(8, options.initialHour ?? 8), wallTime: now };
    this.lastHour = this.anchor.hour;
    this.lastSave = now;
    try {
      let text: string;
      try { text = fs.readFileSync(file, 'utf8'); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        this.save(file, JSON.stringify(this.anchor));
        return;
      }
      const data = JSON.parse(text) as Partial<SavedClock>;
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.version !== 1
        || typeof data.hour !== 'number' || !Number.isFinite(data.hour) || data.hour < 0
        || typeof data.wallTime !== 'number' || !Number.isSafeInteger(data.wallTime) || data.wallTime < 0) throw new Error('Invalid fantasy world clock');
      this.anchor = data as SavedClock;
      this.lastHour = this.anchor.hour;
    } catch (error) {
      this.loadError = '世界時計を読み込めません。管理者に保存データを確認してください。';
      this.onError(error);
    }
  }

  get error(): string | undefined {
    return this.loadError ?? (this.failed ? '世界時計を保存できません。時間を確定できないため操作を停止しています。' : undefined);
  }

  snapshot(): FantasyWorldClock {
    const now = this.now();
    const hour = this.anchor.hour + Math.max(0, now - this.anchor.wallTime) * FANTASY_WORLD_TIME_RATE / 3_600_000;
    this.lastHour = Math.max(this.lastHour, hour);
    return { hour: this.lastHour, rate: FANTASY_WORLD_TIME_RATE, serverTime: now };
  }

  checkpoint(force = false): void {
    if (this.loadError) return;
    const current = this.snapshot();
    if (!force && !this.failed && current.serverTime - this.lastSave < 60_000) return;
    const next: SavedClock = { version: 1, hour: current.hour, wallTime: current.serverTime };
    try {
      this.save(this.file, JSON.stringify(next));
      this.anchor = next;
      this.lastSave = current.serverTime;
      this.failed = false;
    } catch (error) {
      if (!this.failed) this.onError(error);
      this.failed = true;
    }
  }
}
