export type SaveFailureOp = 'local' | 'server' | 'sync';
export type SaveFailurePhase = 'write' | 'backup' | 'request' | 'load';

export interface AdSaveFailure {
  at: number;
  lastAt: number;
  count: number;
  op: SaveFailureOp;
  phase: SaveFailurePhase;
  name: string;
  message: string;
  status: number | null;
  quota: boolean;
  revision: number | null;
  infinities: number | null;
  antimatterLog10: number | null;
  boosts: number | null;
  galaxies: number | null;
  lastTick: number | null;
  profileId: string | null;
  storageKeys: number | null;
  storageChars: number | null;
  recoveryCount: number | null;
}

export const SAVE_FAILURE_LIMIT = 20;

export function describeSaveError(error: unknown): Pick<AdSaveFailure, 'name' | 'message' | 'status' | 'quota'> {
  const named = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown save error');
  const statusValue = (error as { status?: unknown } | null)?.status;
  const status = typeof statusValue === 'number' && Number.isFinite(statusValue) ? statusValue : null;
  const name = named.name || 'Error';
  const quota = name === 'QuotaExceededError' || status === 22 || /quota/i.test(named.message);
  return { name, message: named.message.slice(0, 300), status, quota };
}

export function pushSaveFailure(list: AdSaveFailure[], entry: Omit<AdSaveFailure, 'count' | 'lastAt'>): AdSaveFailure[] {
  const last = list[0];
  if (last && last.op === entry.op && last.phase === entry.phase && last.name === entry.name && last.message === entry.message && last.status === entry.status) {
    return [{ ...last, lastAt: entry.at, count: last.count + 1, revision: entry.revision, infinities: entry.infinities, antimatterLog10: entry.antimatterLog10, boosts: entry.boosts, galaxies: entry.galaxies, lastTick: entry.lastTick, profileId: entry.profileId, storageKeys: entry.storageKeys, storageChars: entry.storageChars, recoveryCount: entry.recoveryCount }, ...list.slice(1)];
  }
  return [{ ...entry, lastAt: entry.at, count: 1 }, ...list].slice(0, SAVE_FAILURE_LIMIT);
}

const stamp = (value: number | null) => value === null || !Number.isFinite(value) ? '-' : new Date(value).toISOString();
const num = (value: number | null) => value === null || !Number.isFinite(value) ? '-' : String(value);

export function formatSaveFailures(list: AdSaveFailure[]): string {
  return list.map(item => [
    `${stamp(item.at)} x${item.count}${item.count > 1 ? ` last ${stamp(item.lastAt)}` : ''}`,
    `${item.op} / ${item.phase}  ${item.name}${item.status === null ? '' : ` HTTP ${item.status}`}${item.quota ? '  quota' : ''}`,
    `revision=${num(item.revision)}  infinities=${num(item.infinities)}  amLog=${num(item.antimatterLog10)}  boosts=${num(item.boosts)}  galaxies=${num(item.galaxies)}`,
    `lastTick=${stamp(item.lastTick)}`,
    `storageKeys=${num(item.storageKeys)}  storageChars=${num(item.storageChars)}  recovery=${num(item.recoveryCount)}`,
    `profile=${item.profileId ?? '-'}`,
    item.message,
  ].join('\n')).join('\n\n');
}
