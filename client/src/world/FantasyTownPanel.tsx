import { useState, type ReactNode } from 'react';
import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_RECIPES } from '../../../shared/fantasy-data.ts';
import { FANTASY_MAPS, canSellItem, fantasyBuildings, fantasyBuildingStock, fantasyLibraryHoldings, fantasyCraftFacility, fantasyCanCraft } from '../../../shared/fantasy-town.ts';
import { fantasyPrice, fantasyReputation } from '../../../shared/fantasy-reputation.ts';
import { FANTASY_DINING, FANTASY_LODGINGS } from '../../../shared/fantasy-life.ts';
import { FANTASY_LIBRARY_BOOKS } from '../../../shared/fantasy-library.ts';
import { FANTASY_TERMS } from '../../../shared/fantasy-lore.ts';
import { NPC_PUBLIC, type NpcId } from '../../../shared/npc.ts';
import { useLocale } from '../locale.ts';
import { FantasyQuestBoard } from './FantasyQuestBoard.tsx';
import { realDuration } from './FantasyActivity.tsx';
import { FantasyCommunity } from './FantasyCommunity.tsx';
import { FantasyCrafting } from './FantasyCrafting.tsx';
import { FantasyGuildBoard } from './FantasyGuildBoard.tsx';
import { FantasyFishingPanel } from './FantasyFieldActions.tsx';
import { useStore } from '../store.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { FantasyFiniteShop } from './FantasyFiniteShop.tsx';
import { FantasyShopStock } from './FantasyShopStock.tsx';
import { FantasyEscortPanel } from './FantasyEscortPanel.tsx';
import { actionHelp } from './fantasy-action-help.ts';
import { FantasySaleList } from './FantasySaleList.tsx';
import { FantasyCareerPanel } from './FantasyCareerPanel.tsx';
import { fantasyPrayerStatus, fantasyPrayerDisabledReason } from '../../../shared/fantasy-prayer.ts';

export function FantasyTownPanel({c,onAction,onTalk,blocked}:{c:FantasyCharacter;onAction:(a:FantasyAction)=>void;onTalk:(npc:NpcId)=>void;blocked:boolean}) {
  const [locale]=useLocale();
  const civic=useStore(s=>s.fantasyRealm?.civic);
  const presence=(id:string)=>{const activity=civic?.npcs.find(n=>n.npc===id)?.activity;return activity?({ko:{sleep:'쉬는 중',work:'일하는 중',market:'장터 방문',visit:'이웃 방문'},en:{sleep:'Resting',work:'Working',market:'At market',visit:'Visiting'},ja:{sleep:'休憩中',work:'仕事中',market:'市へ',visit:'訪問中'}}[locale])[activity]:'';};
  const [selected,setSelected]=useState<string|null>(null);
  const [bookId,setBookId]=useState<string|null>(null);
  const hour=useStore(state=>state.fantasyClock?.hour)??c.hour;
  const present={...c,hour};
  const buildings=fantasyBuildings(c);
  const building=buildings.find((b)=>b.id===selected);
  const t={ko:{title:'마을',back:'돌아가기',none:'들어갈 건물이 없습니다.',buy:'구매',sell:'판매',stock:'물건',belongings:'팔 물건',room:'객실',stay:'묵기',food:'식사',eat:'먹기',cook:'제작',jobs:'직업',change:'배우기',work:'일하기',talk:'대화',books:'소장 도서',empty:'소장한 책이 없습니다.',materials:'재료'},en:{title:'Settlement',back:'Back',none:'There are no buildings to enter.',buy:'Buy',sell:'Sell',stock:'Goods',belongings:'Sell belongings',room:'Rooms',stay:'Stay',food:'Meals',eat:'Eat',cook:'Craft',jobs:'Professions',change:'Learn',work:'Work',talk:'Talk',books:'Collection',empty:'No books are held here.',materials:'Materials'},ja:{title:'町',back:'戻る',none:'入れる建物はありません。',buy:'買う',sell:'売る',stock:'品物',belongings:'売る持ち物',room:'客室',stay:'泊まる',food:'食事',eat:'食べる',cook:'制作',jobs:'職業',change:'学ぶ',work:'働く',talk:'話す',books:'蔵書',empty:'蔵書はありません。',materials:'材料'}}[locale];
  const name=(id:string)=>FANTASY_ITEMS.find((item)=>item.id===id)?.names?.[locale]??FANTASY_TERMS.find((term)=>term.id===id)?.names[locale]??FANTASY_MAPS.find((m)=>m.item===id)?.name[locale]??FANTASY_ITEMS.find((i)=>i.id===id)?.name??id;
  const button=(label:ReactNode,action:FantasyAction,disabled=false,reason?:string)=>{const why=reason??actionHelp(present,action,locale);return <ReasonButton type="button" className="fr-btn" disabled={blocked||disabled||!!why} reason={blocked?undefined:why} onClick={()=>onAction(action)}>{label}</ReasonButton>;};
  const residentButton=(id:NpcId)=>{const npc=NPC_PUBLIC.find(entry=>entry.id===id);return npc&&<ReasonButton type="button" className="fr-npc-visit" key={id} disabled={blocked||c.hp<=0} onClick={()=>onTalk(id)}><span>{npc.name[locale]}<small>{npc.role[locale]} · {presence(id)}</small></span>{t.talk} ↗</ReasonButton>;};
  const standing=fantasyReputation(c);
  if(!building) return <><h2>{t.title}</h2><div className="fr-standing"><span>{{ko:'대륙',en:'Continent',ja:'大陸'}[locale]} {standing.land}</span><span>{{ko:'지역',en:'District',ja:'地域'}[locale]} {standing.region}</span><span>{{ko:'마을 평판',en:'Town standing',ja:'町の評判'}[locale]} {standing.town}</span></div><div className="fr-buildings">{buildings.map((b)=><button key={b.id} onClick={()=>{setSelected(b.id);setBookId(null);}}><span>{{market:'◇',blacksmith:'⚒',alchemist:'⚗',tower:'♜',inn:'☾',restaurant:'♨',library:'▤',guild:'⚑',shipyard:'⚓',temple:'✧',archaeology:'⌕'}[b.id]}</span>{b.name[locale]}<b>→</b></button>)}</div>{buildings.length===0&&<p>{t.none}</p>}<div className="fr-residents">{NPC_PUBLIC.filter(npc=>npc.homeLocation===c.location&&npc.building==='residence').map(npc=>residentButton(npc.id))}</div><FantasyCommunity character={c}/></>;
  const stock=fantasyBuildingStock(c,building.id);
  const holding=fantasyLibraryHoldings(c);
  const book=FANTASY_LIBRARY_BOOKS.find((b)=>b.id===bookId&&holding.includes(b.id));
  const recipes=FANTASY_RECIPES.filter(r=>r.job===c.job&&fantasyCraftFacility(r.job)===building.id);
  const priestTeacher=building.id==='temple'?NPC_PUBLIC.find(npc=>building.npcIds.includes(npc.id)&&npc.trainableJobs?.includes('priest')):undefined;
  const prayer=fantasyPrayerStatus(c,hour);
  return <><button className="fr-text-button" onClick={()=>{setSelected(null);setBookId(null);}}>← {t.title}</button><h2>{building.name[locale]}</h2>
    {building.npcIds.map(residentButton)}
    <FantasyQuestBoard c={c} building={building.id} onAction={onAction} blocked={blocked}/>
    {building.id==='guild'&&<FantasyEscortPanel c={c} guild blocked={blocked} onAction={onAction}/>}
    {priestTeacher&&<FantasyCareerPanel key={`temple:${c.job}`} c={c} offers={[{job:'priest',via:'npc',npcId:priestTeacher.id}]} onAction={onAction} blocked={blocked}/>}
    {building.id==='temple'&&<div className="fr-service-row"><span>{{ko:'신전에서 기도',en:'Pray at the temple',ja:'神殿で祈る'}[locale]}<small>{realDuration(prayer.hours,locale)}</small></span>{button(<>{{ko:'기도하기',en:'Pray',ja:'祈る'}[locale]}<small className="fr-service-effects">{[prayer.priestXp?{ko:`사제 숙련 +${prayer.priestXp}`,en:`Priest proficiency +${prayer.priestXp}`,ja:`司祭の熟練 +${prayer.priestXp}`}[locale]:'',prayer.notorietyReduction?{ko:`악명 -${prayer.notorietyReduction}`,en:`Notoriety -${prayer.notorietyReduction}`,ja:`悪名 -${prayer.notorietyReduction}`}[locale]:'',{ko:'하루 1회',en:'Once per day',ja:'1日1回'}[locale]].filter(Boolean).join(' · ')}</small></>,{type:'pray'},!prayer.canPray,fantasyPrayerDisabledReason(c,locale,hour))}</div>}
    {building.id==='library'&&(book?<article className="fr-library-reading"><button className="fr-text-button" onClick={()=>setBookId(null)}>← {t.books}</button><h3>{book.title[locale]}</h3>{book.body[locale].map((p,i)=><p key={i}>{p}</p>)}{button(c.readBooks?.includes(book.id)?{ko:'읽음',en:'Read',ja:'読了'}[locale]:{ko:'정독하기',en:'Study this book',ja:'精読する'}[locale]+' · '+realDuration(1,locale),{type:'read',book:book.id},!!c.readBooks?.includes(book.id))}</article>:<><h3>{t.books}</h3><div className="fr-book-list">{FANTASY_LIBRARY_BOOKS.filter((b)=>b.inGame!==false&&holding.includes(b.id)).map((b)=><button key={b.id} onClick={()=>setBookId(b.id)}>▤ {b.title[locale]} <span>→</span></button>)}{holding.length===0&&<p>{t.empty}</p>}</div></>)}
    {building.id==='inn'&&<><h3>{t.room}</h3>{FANTASY_LODGINGS.map((r)=>{const price=fantasyPrice(present,r.cost,'room');return <div className="fr-service-row" key={r.id}><span>{r.name[locale]}<small>{r.hours} h · {realDuration(r.hours,locale)}</small></span><b>{price} G</b>{button(<>{t.stay}<small className="fr-service-effects">{{ko:'피로',en:'Fatigue',ja:'疲労'}[locale]} -{r.fatigueRecovery} · HP +{Math.round(r.hpRecovery*100)}% · MP +{Math.round(r.mpRecovery*100)}%</small></>,{type:'lodge',room:r.id},c.gold<price)}</div>;})}</>}
    {(building.id==='inn'||building.id==='restaurant')&&<><h3>{t.food}</h3>{FANTASY_DINING.map((m)=>{const price=fantasyPrice(present,m.cost,'food');return <div className="fr-service-row" key={m.id}><span>{m.name[locale]}<small>{realDuration(m.hours,locale)}</small></span><b>{price} G</b>{button(<>{t.eat}<small className="fr-service-effects">{{ko:'허기',en:'Hunger',ja:'空腹'}[locale]} -{m.nutrition} · HP +{m.hp}{m.mp?` · MP +${m.mp}`:''}</small></>,{type:'eat',meal:m.id},c.gold<price)}</div>;})}</>}
    {building.id==='guild'&&<><FantasyGuildBoard c={c} onAction={onAction} blocked={blocked}/><details className="fr-fold"><summary>{t.jobs}</summary><FantasyCareerPanel key={`guild:${c.job}`} c={c} offers={FANTASY_JOBS.filter(job=>job.category==='ordinary'&&job.id!=='priest').map(job=>({job:job.id,via:'guild' as const}))} onAction={onAction} blocked={blocked}/></details><div className="fr-action-grid">{button(`${t.work} · ${realDuration(4,locale)}`,{type:'work'})}</div></>}
    <FantasyCrafting c={c} building={building.id} onAction={onAction} blocked={blocked}/>
    {building.id==='shipyard'&&<FantasyFishingPanel c={c} onAction={onAction} blocked={blocked}/>}
    {(stock.length>0||building.id==='archaeology')&&<FantasyFiniteShop key={building.id} building={building.id}/>}

  </>;
}
