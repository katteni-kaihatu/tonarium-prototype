import type { FantasyRealmCommand } from '../../../shared/fantasy-realm.ts';
import { get, set } from '../store.ts';
import { send } from '../net/ws.ts';

export function requestFantasyRealm(command: FantasyRealmCommand) {
  if (!get().wsConnected || get().fantasyRealmPending) return;
  set({ fantasyRealmPending: true, fantasyRealmError: null }); send({ t: 'fantasyRealmRequest', ...command });
}
