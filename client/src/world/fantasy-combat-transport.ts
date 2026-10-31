import { requestFantasyParty } from './fantasy-party-transport.ts';
import type { FantasyCombatCommand } from '../../../shared/protocol.ts';
import { get, set } from '../store.ts';
import { send } from '../net/ws.ts';

export function requestFantasyCombat(command: FantasyCombatCommand) {
  if (command.type==='start'&&command.source!=='escort'&&get().fantasyParty?.id) { requestFantasyParty({type:'readyCombat',source:command.source,target:command.target,...(command.confirm!==undefined?{confirm:command.confirm}:{})}); return; }
  const s = get();
  if (!s.wsConnected || s.fantasyPending || s.fantasyCombatPending) return;
  set({ fantasyCombatPending: true, fantasyCombatError: null });
  send({ t: 'fantasyCombatRequest', command });
}
