import { useEffect } from 'react';
import { FANTASY_MAPS } from '../../../shared/fantasy-town.ts';
import { FANTASY_MAP_MERCHANT_NPC } from '../../../shared/fantasy-map-merchant.ts';
import { useLocale } from '../locale.ts';
import { useStore } from '../store.ts';
import { send } from '../net/ws.ts';
import { requestFantasyRealm } from './fantasy-realm-transport.ts';
import { ReasonButton } from './FantasyActionButton.tsx';

export function FantasyMapMerchant({onTalk}:{onTalk:()=>void}) {
  const [locale]=useLocale(),merchant=useStore(s=>s.fantasyRealm?.economy.merchant),hour=useStore(s=>s.fantasyClock?.hour??s.fantasyProfile?.character?.hour??0);
  const c=useStore(s=>s.fantasyProfile?.character),pending=useStore(s=>s.fantasyRealmPending||s.fantasyPending||!s.wsConnected);
  const day=Math.floor(hour/24),say=(ko:string,en:string,ja:string)=>({ko,en,ja})[locale];
  useEffect(()=>{send({t:'fantasyRealmRequest',domain:'economy',command:{type:'sync'}});},[day]);
  return <section className="fr-merchant-stock"><p>{say('나루가 지도 꾸러미를 펼친다.','Naru unfolds a bundle of maps.','ナルが地図の束を広げる。')}</p>
    <ReasonButton className="fr-btn" disabled={pending} onClick={onTalk}>{say('상인과 이야기하기','Talk to the merchant','商人と話す')}</ReasonButton>
    {merchant?.npc===FANTASY_MAP_MERCHANT_NPC?merchant.offers.length?merchant.offers.map(offer=><div className="fr-service-row" key={offer.item}><span>{FANTASY_MAPS.find(map=>map.item===offer.item)?.name[locale]}<small>{say('남은 수량','Remaining','残り')} {offer.count}</small></span><b>{offer.unitPrice} G</b><ReasonButton className="fr-btn" disabled={pending||!c||c.gold<offer.unitPrice||merchant.day!==day} reason={say('소지금 또는 오늘의 남은 재고를 확인해 주세요.','Check your gold and today’s remaining stock.','所持金と今日の在庫を確認してください。')} onClick={()=>requestFantasyRealm({domain:'economy',command:{type:'merchantBuy',item:offer.item,count:1,day:merchant.day,revision:merchant.revision,quotedUnitPrice:offer.unitPrice}})}>{say('구매','Buy','買う')}</ReasonButton></div>):<p>{say('오늘 가져온 지도는 모두 팔렸다.','Today’s maps are sold out.','今日の地図は売り切れた。')}</p>:<p>{say('상인이 남은 지도를 확인하고 있다.','The merchant is checking the remaining charts.','商人が残りの地図を確かめている。')}</p>}
  </section>;
}
