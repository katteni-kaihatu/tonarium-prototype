import { useEffect } from 'react';
import type { FantasyProfile } from '../../../shared/fantasy.ts';
import type { FantasyPropertyCommand } from '../../../shared/fantasy-property.ts';
import { get, set, useStore } from '../store.ts';
import { send } from '../net/ws.ts';
import { FantasyPropertyPanel } from './FantasyPropertyPanel.tsx';

export function FantasyPropertyMenu({ profile }: { profile: FantasyProfile }) {
  const state = useStore(s => s.fantasyProperties), pending = useStore(s => s.fantasyPropertyPending);
  const error = useStore(s => s.fantasyPropertyError), connected = useStore(s => s.wsConnected);
  const session = useStore(s => s.session);
  useEffect(() => {
    if (!connected) return;
    const sync = () => send({ t: 'fantasyPropertyRequest', command: { type: 'sync' } });
    sync(); const timer = setInterval(sync, 5000); return () => clearInterval(timer);
  }, [connected, session, profile.generation, profile.character?.location]);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => set({ fantasyPropertyPending: false, fantasyPropertyError: 'unavailable' }), 10000);
    return () => clearTimeout(timer);
  }, [pending]);
  const command = (command: FantasyPropertyCommand) => {
    if (!get().wsConnected || get().fantasyPropertyPending || get().fantasyPending) return;
    set({ fantasyPropertyPending: true, fantasyPropertyError: null }); send({ t: 'fantasyPropertyRequest', command });
  };
  return <FantasyPropertyPanel profile={profile} state={state} pending={pending || !connected} error={error} onCommand={command}/>;
}
