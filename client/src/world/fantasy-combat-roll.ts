import type { FantasyCombatLog, FantasyCombatState } from '../../../shared/fantasy-combat.ts';
export interface FantasyCombatRollCursor { battle: string; id: number }
/** Initial snapshots are history; subsequent snapshots reveal only their newest fresh roll. */
export function fantasyCombatRollUpdate(previous: FantasyCombatRollCursor | undefined, state: Pick<FantasyCombatState, 'id' | 'logs'>): { cursor: FantasyCombatRollCursor; result?: FantasyCombatLog } {
  const cursor = { battle: state.id, id: state.logs.at(-1)?.id ?? 0 };
  if (!previous || previous.battle !== state.id) return { cursor };
  const result = state.logs.filter(log => log.id > previous.id && log.roll).at(-1);
  return { cursor, ...(result ? { result } : {}) };
}
