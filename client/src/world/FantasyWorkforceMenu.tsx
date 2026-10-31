import { useEffect } from 'react';
import { get, set, useStore } from '../store.ts';
import { send } from '../net/ws.ts';
import { useLocale } from '../locale.ts';
import type { FantasyPropertyCommand } from '../../../shared/fantasy-property.ts';
import { fantasyPropertyText } from '../../../shared/fantasy-property.ts';
import { FantasyWorkforcePanel } from './FantasyBusinessPanel.tsx';

export function FantasyWorkforceMenu({ source }: { source: 'guild' | 'blackMarket' }) {
  const profile = useStore(state => state.fantasyProfile), properties = useStore(state => state.fantasyProperties);
  const pending = useStore(state => state.fantasyPropertyPending), connected = useStore(state => state.wsConnected);
  const error = useStore(state => state.fantasyPropertyError), session = useStore(state => state.session);
  const [locale] = useLocale();
  useEffect(() => {
    if (!connected || !profile?.character) return;
    const sync = () => send({ t: 'fantasyPropertyRequest', command: { type: 'sync' } });
    sync(); const timer = setInterval(sync, 5000); return () => clearInterval(timer);
  }, [connected, session, profile?.generation, profile?.character?.location]);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => set({ fantasyPropertyPending: false, fantasyPropertyError: 'unavailable' }), 10000);
    return () => clearTimeout(timer);
  }, [pending]);
  if (!profile?.character) return null;
  const command = (command: FantasyPropertyCommand) => {
    if (!get().wsConnected || get().fantasyPropertyPending || get().fantasyPending) return;
    set({ fantasyPropertyPending: true, fantasyPropertyError: null }); send({ t: 'fantasyPropertyRequest', command });
  };
  return <>{error && <p className="fr-error" role="alert">{fantasyPropertyText(error, locale) ?? { ko: '고용 요청을 처리하지 못했습니다.', en: 'The employment request could not be processed.', ja: '雇用の依頼を処理できませんでした。' }[locale]}</p>}<FantasyWorkforcePanel profile={profile} state={properties} pending={pending || !connected} onCommand={command} source={source}/></>;
}
