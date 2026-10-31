import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FantasyContractVisibleOffer } from '../shared/fantasy-contracts.ts';

interface Notice { day: number; offer: string }
interface Saved { version: 1; notices: [string, Notice][] }
interface Options { save?: (file: string, text: string) => void; onError?: (error: unknown) => void }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function valid(value: unknown): value is Saved {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.notices)) return false;
  const seen = new Set<string>();
  return value.notices.every(entry => {
    if (!Array.isArray(entry) || entry.length !== 2) return false;
    const [user, notice] = entry;
    if (typeof user !== 'string' || !user || user.length > 128 || seen.has(user) || !record(notice)
      || !Number.isSafeInteger(notice.day) || Number(notice.day) < 0 || typeof notice.offer !== 'string' || !/^offer-[a-z0-9-]{1,75}$/u.test(notice.offer)) return false;
    seen.add(user); return true;
  });
}
function saveAtomic(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, text, { encoding: 'utf8', flag: 'wx' }); fs.renameSync(temporary, file); }
  finally { try { fs.unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
}

/** 生まれ変わりとは別に記録し、送信前の保存で同日の再通知を防ぐ。 */
export class FantasyNamedCommissions {
  private notices = new Map<string, Notice>();
  private save: NonNullable<Options['save']>;
  private onError: NonNullable<Options['onError']>;
  private failedLoad = false;
  constructor(private file: string, options: Options = {}) {
    this.save = options.save ?? saveAtomic;
    this.onError = options.onError ?? (error => console.error('[fantasy-named-commissions]', error));
    try {
      const saved: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!valid(saved)) throw new Error('Invalid daily commission notice record');
      this.notices = new Map(saved.notices);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { this.failedLoad = true; this.onError(error); }
    }
  }
  current(user: string, day: number): string | undefined { const notice = this.notices.get(user); return notice?.day === day ? notice.offer : undefined; }
  offer(user: string, day: number, create: () => FantasyContractVisibleOffer | undefined): FantasyContractVisibleOffer | undefined {
    if (this.failedLoad || typeof user !== 'string' || !user || user.length > 128 || !Number.isSafeInteger(day) || day < 0 || (this.notices.get(user)?.day ?? -1) >= day) return undefined;
    let offer: FantasyContractVisibleOffer | undefined;
    try { offer = create(); } catch (error) { this.onError(error); return undefined; }
    if (!offer || !offer.available || offer.mine || !/^offer-[a-z0-9-]{1,75}$/u.test(offer.id)) return undefined;
    const next = new Map(this.notices); next.set(user, { day, offer: offer.id });
    try {
      this.save(this.file, JSON.stringify({ version: 1, notices: [...next.entries()] } satisfies Saved));
      this.notices = next;
      return structuredClone(offer);
    } catch (error) { this.onError(error); return undefined; }
  }
}
