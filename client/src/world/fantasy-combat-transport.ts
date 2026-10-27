import type { FantasyCombatCommand } from '../../../shared/protocol.ts';
import { get, set } from '../store.ts';
import { send } from '../net/ws.ts';

export function requestFantasyCombat(command: FantasyCombatCommand) {
  const s = get();
  if (!s.wsConnected || s.fantasyPending || s.fantasyCombatPending) return;
  set({ fantasyCombatPending: true, fantasyCombatError: null });
  send({ t: 'fantasyCombatRequest', command });
}
