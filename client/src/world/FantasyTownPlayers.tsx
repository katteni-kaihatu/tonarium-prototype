import { useLocale } from '../locale.ts';
import { useStore } from '../store.ts';
import {send} from '../net/ws.ts';
import {ReasonButton} from './FantasyActionButton.tsx';

export function FantasyTownPlayers({ location }: { location: string }) {
  const [locale] = useLocale(), roster = useStore(state => state.fantasyTownPresence), self = useStore(state => state.selfId);
  const allies=useStore(s=>s.fantasyParty?.members)?.map(member=>member.id)??[];
  const c=useStore(s=>s.fantasyProfile?.character),busy=useStore(s=>!s.wsConnected||s.fantasyPending||!!s.fantasyProfile?.activity||!!s.fantasyProfile?.combatId||!!s.fantasyProfile?.character?.downed);
  if (roster?.location !== location) return null;
  const others = roster.players.filter(player => player.id !== self);
  return <section className="fr-town-players" aria-live="polite"><h3>{{ko:'이곳의 여행자',en:'Travelers here',ja:'この町の旅人'}[locale]} · {others.length}</h3>
    {others.length ? <ul>{others.map(player => <li key={player.id}>{player.name}{player.downed&&<><small> · {{ko:'빈사',en:'Downed',ja:'瀕死'}[locale]}</small>{allies.includes(player.id)&&<><ReasonButton className="fr-btn" disabled={busy||!c} onClick={()=>send({t:'fantasyAid',target:player.id,method:'potion'})}>{{ko:'회복약 투여',en:'Give a potion',ja:'回復薬を与える'}[locale]}</ReasonButton><ReasonButton className="fr-btn" disabled={busy||!c} onClick={()=>send({t:'fantasyAid',target:player.id,method:'temple'})}>{{ko:'신전 치료비 지불',en:'Pay for temple care',ja:'神殿治療費を払う'}[locale]}</ReasonButton></>}</>}</li>)}</ul> : <p className="fr-muted">{{ko:'지금은 다른 여행자가 보이지 않습니다.',en:'No other travelers are here right now.',ja:'今はほかの旅人は見当たりません。'}[locale]}</p>}
  </section>;
}
