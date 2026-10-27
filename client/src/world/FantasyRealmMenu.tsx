import { useEffect } from 'react';
import type { FantasyProfile } from '../../../shared/fantasy.ts';
import type { FantasyRealmCommand } from '../../../shared/fantasy-realm.ts';
import { get, set, useStore } from '../store.ts';
import { send } from '../net/ws.ts';
import { FantasyEconomyPanel } from './FantasyEconomyPanel.tsx';
import { FantasyCivicPanel } from './FantasyCivicPanel.tsx';
export function requestFantasyRealm(command: FantasyRealmCommand) {
  if (!get().wsConnected || get().fantasyRealmPending) return;
  set({ fantasyRealmPending: true, fantasyRealmError: null }); send({ t: 'fantasyRealmRequest', ...command });
}
export function FantasyRealmMenu({ profile, domain }: { profile: FantasyProfile; domain: 'economy' | 'civic' }) {
  const state = useStore(s => s.fantasyRealm), pending = useStore(s => s.fantasyRealmPending), error = useStore(s => s.fantasyRealmError);
  const connected = useStore(s => s.wsConnected), session = useStore(s => s.session);
  useEffect(() => {
    if (!connected) return;
    const sync = () => send({ t: 'fantasyRealmRequest', domain, command: { type: 'sync' } });
    sync(); const timer = setInterval(sync, 5000); return () => clearInterval(timer);
  }, [connected, session, profile.generation, profile.character?.location, domain]);
  useEffect(() => { if (!pending) return; const timer = setTimeout(() => set({ fantasyRealmPending: false, fantasyRealmError: 'unavailable' }), 10000); return () => clearTimeout(timer); }, [pending]);
  return domain === 'economy'
    ? <FantasyEconomyPanel profile={profile} state={state?.economy ?? null} pending={pending || !connected} error={error} onCommand={command => requestFantasyRealm({ domain, command })}/>
    : <FantasyCivicPanel profile={profile} state={state?.civic ?? null} pending={pending || !connected} error={error} onCommand={command => requestFantasyRealm({ domain, command })}/>;
}
