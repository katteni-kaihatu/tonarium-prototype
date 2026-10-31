import type { FantasyPartyCommand } from '../../../shared/fantasy-party.ts';
import { get, set } from '../store.ts';
import { send } from '../net/ws.ts';

let requestSequence=0;
export function requestFantasyParty(command: FantasyPartyCommand) {
  const state = get();
  if (!state.wsConnected || state.fantasyPartyPending || state.fantasyPending || state.fantasyCombatPending) return;
  const sequence=++requestSequence;
  set({ fantasyPartyPending: true, fantasyPartyError: null });
  send({ t: 'fantasyPartyRequest', command });
  setTimeout(() => { if (sequence===requestSequence&&get().fantasyPartyPending) set({ fantasyPartyPending: false, fantasyPartyError: 'unavailable' }); }, 10000);
}
