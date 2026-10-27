import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_ITEMS } from '../../../shared/fantasy-data.ts';
import { fantasySaleGroups, fantasySaleDisabledReason } from '../../../shared/fantasy-sales.ts';
import { useLocale } from '../locale.ts';
import { useStore } from '../store.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { itemDisplayName } from './fantasy-action-help.ts';

export function FantasySaleList({c,onAction,blocked,item,archaeology=false}:{c:FantasyCharacter;onAction:(action:FantasyAction)=>void;blocked:boolean;item?:string;archaeology?:boolean}) {
  const [locale]=useLocale(),hour=useStore(state=>state.fantasyClock?.hour)??c.hour;
  const groups=fantasySaleGroups({...c,hour},item).filter(group=>!archaeology||FANTASY_ITEMS.find(item=>item.id===group.item)?.category==='relic');
  const name=(id:string)=>itemDisplayName(id,locale);
  const quality={ko:{fresh:'상태가 좋은 묶음',stale:'상태가 변한 묶음',spoiled:'상한 묶음'},en:{fresh:'Well-kept batch',stale:'Deteriorated batch',spoiled:'Spoiled batch'},ja:{fresh:'状態のよい品',stale:'変化した品',spoiled:'傷んだ品'}}[locale];
  return <div className="fr-sale-list">{!groups.length&&<p className="fr-muted">{{ko:'팔 소지품이 없습니다.',en:'There are no belongings to sell.',ja:'売る持ち物がありません。'}[locale]}</p>}{groups.map(group=><div className="fr-service-row" key={group.key}><span>{name(group.item)} × {group.count}{group.quality&&<small>{quality[group.quality]}</small>}{group.instance&&<small>{'★'.repeat(group.gearQuality??1)}</small>}</span><b className="fr-sale-price">{group.unitPrice} G <small>/ 1</small></b><ReasonButton type="button" className="fr-btn" disabled={blocked||!group.canSell} reason={blocked?undefined:fantasySaleDisabledReason(group,locale)} onClick={()=>onAction({type:'sell',item:group.item,...(group.quality?{quality:group.quality}:{}),...(group.instance?{instance:group.instance}:{})})}>{{ko:'1개 판매',en:'Sell one',ja:'1個売る'}[locale]}</ReasonButton></div>)}</div>;
}
