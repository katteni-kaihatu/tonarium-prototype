import { useEffect } from 'react';
import type { FantasyProfile } from '../../../shared/fantasy.ts';
import { useStore } from '../store.ts';
import { send } from '../net/ws.ts';
import { FantasyEconomyPanel } from './FantasyEconomyPanel.tsx';
import { requestFantasyRealm } from './FantasyRealmMenu.tsx';
export function FantasyFiniteShop({ building }: { building: string }) {
  const profile = useStore(s => s.fantasyProfile), state = useStore(s => s.fantasyRealm?.economy ?? null), pending = useStore(s => s.fantasyRealmPending), error = useStore(s => s.fantasyRealmError);
  useEffect(() => { send({ t: 'fantasyRealmRequest', domain: 'economy', command: { type: 'sync' } }); }, [building, profile?.character?.location]);
  return profile ? <FantasyEconomyPanel building={building} shopOnly profile={profile as FantasyProfile} state={state} pending={pending} error={error} onCommand={command => requestFantasyRealm({ domain: 'economy', command })}/> : null;
}
