import { battleDistance, type BattlefieldState } from '../../shared/battlefield.ts';
import { get } from './store.ts';
import { send } from './net/ws.ts';

export function toggleBattleTank() {
  const s = get();
  const battle: BattlefieldState | null | undefined = s.battlefields[s.session ?? ''];
  const me = battle?.actors[s.selfId];
  if (!battle || !me?.alive) return;
  const tank = Object.values(battle.tanks).filter(t => !t.rider && battleDistance(t, me) <= 2.5).sort((a, b) => battleDistance(a, me) - battleDistance(b, me))[0];
  if (me.tank || tank) send({ t: 'battleMount', id: me.tank ? null : tank.id });
}
