import { FantasyRankBenefits } from './FantasyRankBenefits.tsx';
import { send } from '../net/ws.ts';
import { fantasyFacilityOpen, fantasyFacilityClosedText, fantasyTempleTreatment } from '../../../shared/fantasy-facility-hours.ts';
import { fantasyStats } from '../../../shared/fantasy-engine.ts';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_JOBS, FANTASY_QUESTS } from '../../../shared/fantasy-data.ts';
import { fantasyBuildings, fantasyBuildingStock, fantasyTempleLibraryHoldings, fantasyLibraryHoldings } from '../../../shared/fantasy-town.ts';
import { fantasyPrice, fantasyReputation } from '../../../shared/fantasy-reputation.ts';
import { FANTASY_DINING, FANTASY_LODGINGS } from '../../../shared/fantasy-life.ts';
import { FANTASY_LIBRARY_BOOKS } from '../../../shared/fantasy-library.ts';
import { NPC_PUBLIC, type NpcId } from '../../../shared/npc.ts';
import { useLocale } from '../locale.ts';
import { FantasyQuestBoard } from './FantasyQuestBoard.tsx';
import { realDuration } from './FantasyActivity.tsx';
import { FantasyCommunity } from './FantasyCommunity.tsx';
import { FantasyCrafting } from './FantasyCrafting.tsx';
import { FantasyCommissions } from './FantasyCommissions.tsx';
import { FantasyGuildBoard } from './FantasyGuildBoard.tsx';
import { FantasyGuildAssessment } from './FantasyGuildAssessment.tsx';
import { FantasyWorkforceMenu } from './FantasyWorkforceMenu.tsx';
import { FantasyFishingPanel } from './FantasyFieldActions.tsx';
import { FantasyTownPlayers } from './FantasyTownPlayers.tsx';
import { useStore } from '../store.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { FantasyFiniteShop } from './FantasyFiniteShop.tsx';
import { FantasyEscortPanel } from './FantasyEscortPanel.tsx';
import { actionHelp } from './fantasy-action-help.ts';
import { FantasyCareerPanel } from './FantasyCareerPanel.tsx';
import { fantasyPrayerStatus, fantasyPrayerDisabledReason } from '../../../shared/fantasy-prayer.ts';
import { FantasyUnderworldPanel } from './FantasyUnderworldPanel.tsx';
import { FantasyExpeditionPanel } from './FantasyExpeditionPanel.tsx';
import { fantasyUnderworldNpc, fantasyUnderworldNpcText } from '../../../shared/fantasy-underworld.ts';
import { fantasyCriminalContact } from '../../../shared/fantasy-institutions.ts';
import { fantasyContractIssuer, fantasyPersonalQuest } from '../../../shared/fantasy-contracts.ts';

export function FantasyTownPanel({c,onAction,onTalk,blocked}:{c:FantasyCharacter;onAction:(a:FantasyAction)=>void;onTalk:(npc:NpcId)=>void;blocked:boolean}) {
  const [locale]=useLocale();
  const onRoad=!!c.travelPosition&&c.travelPosition.from!==c.travelPosition.to&&c.travelPosition.fraction>0&&c.travelPosition.fraction<1;
  const connected=useStore(s=>s.wsConnected);
  const profile=useStore(s=>s.fantasyProfile);
  const rooms=useStore(s=>s.fantasyRealm?.economy.location===c.location?s.fantasyRealm.economy.rooms:undefined);
  const civic=useStore(s=>s.fantasyRealm?.civic);
  const presence=(id:string)=>{const activity=civic?.npcs.find(n=>n.npc===id)?.activity;return activity?({ko:{sleep:'쉬는 중',work:'일하는 중',market:'장터 방문',visit:'이웃 방문'},en:{sleep:'Resting',work:'Working',market:'At market',visit:'Visiting'},ja:{sleep:'休憩中',work:'仕事中',market:'市へ',visit:'訪問中'}}[locale])[activity]:'';};
  const [selected,setSelected]=useState<string|null>(null);
  const [bookId,setBookId]=useState<string|null>(null);
  const requesters=useMemo(()=>new Set(FANTASY_QUESTS.filter(q=>q.giver===c.location&&!fantasyPersonalQuest(q)).map(fantasyContractIssuer)),[c.location]);
  const hour=useStore(state=>state.fantasyClock?.hour)??c.hour;
  const present={...c,hour};
  const guildDay=Math.floor(hour/24), guildDaylight=hour%24>=6&&hour%24<18;
  useEffect(()=>{if(connected&&selected==='guild'&&guildDaylight&&!blocked)send({t:'fantasyGuildVisit',locale});},[connected,selected,guildDay,guildDaylight,c.location,locale,blocked]);
  useEffect(()=>{if(connected&&selected==='inn')send({t:'fantasyRealmRequest',domain:'economy',command:{type:'sync'}});},[connected,selected,c.location]);
  const buildings=fantasyBuildings(c);
  const building=buildings.find((b)=>b.id===selected);
  const t={ko:{title:'마을',back:'돌아가기',none:'들어갈 건물이 없습니다.',buy:'구매',sell:'판매',stock:'물건',belongings:'팔 물건',room:'객실',stay:'묵기',food:'식사',eat:'먹기',cook:'제작',jobs:'직업',change:'배우기',work:'일하기',talk:'대화',books:'소장 도서',empty:'소장한 책이 없습니다.',materials:'재료'},en:{title:'Settlement',back:'Back',none:'There are no buildings to enter.',buy:'Buy',sell:'Sell',stock:'Goods',belongings:'Sell belongings',room:'Rooms',stay:'Stay',food:'Meals',eat:'Eat',cook:'Craft',jobs:'Professions',change:'Learn',work:'Work',talk:'Talk',books:'Collection',empty:'No books are held here.',materials:'Materials'},ja:{title:'町',back:'戻る',none:'入れる建物はありません。',buy:'買う',sell:'売る',stock:'品物',belongings:'売る持ち物',room:'客室',stay:'泊まる',food:'食事',eat:'食べる',cook:'制作',jobs:'職業',change:'学ぶ',work:'働く',talk:'話す',books:'蔵書',empty:'蔵書はありません。',materials:'材料'}}[locale];
  const button=(label:ReactNode,action:FantasyAction,disabled=false,reason?:string)=>{const why=reason??actionHelp(present,action,locale);return <ReasonButton type="button" className="fr-btn" disabled={blocked||disabled||!!why} reason={blocked?undefined:why} onClick={()=>onAction(action)}>{label}</ReasonButton>;};
  const residentButton=(id:NpcId)=>{const npc=NPC_PUBLIC.find(entry=>entry.id===id),criminal=fantasyCriminalContact(id),requests=criminal||requesters.has(id);return npc&&<div className="fr-form-row" key={id}><ReasonButton type="button" className="fr-npc-visit" disabled={blocked||c.hp<=0} onClick={()=>onTalk(id)}><span>{npc.name[locale]}<small>{npc.role[locale]} · {presence(id)}</small></span>{t.talk} ↗</ReasonButton>{requests&&<ReasonButton type="button" className="fr-text-button" disabled={blocked||c.hp<=0} onClick={()=>setSelected(`npc:${id}`)}>{criminal?{ko:'의뢰와 신뢰',en:'Requests & trust',ja:'依頼と信用'}[locale]:{ko:'부탁 살펴보기',en:'See requests',ja:'頼みを聞く'}[locale]}</ReasonButton>}</div>;};
  const standing=fantasyReputation(c);
  if(c.dungeon?.active)return <p>{{ko:"입구로 돌아가 밖으로 나간 뒤 시설을 이용할 수 있습니다.",en:"Return to the entrance and leave before visiting facilities.",ja:"入口に戻り、外へ出てから施設を利用してください。"}[locale]}</p>;
  if(onRoad)return <p>{{ko:"이동 경로 위에 있습니다. 마을까지 이동해 주세요.",en:"You are on the road. Reach a settlement first.",ja:"移動経路の途中です。先に町へ向かってください。"}[locale]}</p>;
  const contact=selected?.startsWith('npc:')?NPC_PUBLIC.find(npc=>npc.id===selected.slice(4)&&npc.homeLocation===c.location&&!npc.travelOnly):undefined;
  if(contact){const criminal=fantasyCriminalContact(contact.id),source=criminal?'underworld':contact.building==='temple'?'temple':'personal';return <><button className="fr-text-button" onClick={()=>setSelected(null)}>← {t.title}</button><h2>{contact.name[locale]}</h2><ReasonButton className="fr-btn" disabled={blocked} onClick={()=>onTalk(contact.id)}>{t.talk} ↗</ReasonButton>{criminal&&<p>{fantasyUnderworldNpcText(locale)}</p>}<FantasyGuildBoard c={c} source={source} npc={contact.id} blocked={blocked} onAction={onAction}/>{criminal&&profile&&fantasyUnderworldNpc(c,contact.id)&&<FantasyUnderworldPanel profile={profile} locale={locale} hour={hour} realm="fantasy" npc={contact.id} pending={blocked} onCommand={onAction}/>}</>;}
  if(!building) return <><h2>{t.title}</h2><FantasyTownPlayers location={c.location}/><div className="fr-standing"><span>{{ko:'대륙',en:'Continent',ja:'大陸'}[locale]} {standing.land}</span><span>{{ko:'지역',en:'District',ja:'地域'}[locale]} {standing.region}</span><span>{{ko:'마을 평판',en:'Town standing',ja:'町の評判'}[locale]} {standing.town}</span></div><div className="fr-buildings">{buildings.map((b)=><button key={b.id} onClick={()=>{setSelected(b.id);setBookId(null);}}><span>{{market:'◇',merchantGuild:'◈',blacksmith:'⚒',alchemist:'⚗',tower:'♜',inn:'☾',restaurant:'♨',library:'▤',guild:'⚑',shipyard:'⚓',temple:'✧',archaeology:'⌕'}[b.id]}</span>{b.name[locale]}{!fantasyFacilityOpen(b.id,hour)&&<small> · {{ko:'닫힘',en:'Closed',ja:'閉館'}[locale]}</small>}<b>→</b></button>)}</div>{buildings.length===0&&<p>{t.none}</p>}<div className="fr-residents">{NPC_PUBLIC.filter(npc=>!npc.travelOnly&&npc.homeLocation===c.location&&npc.building==='residence').map(npc=>residentButton(npc.id))}</div><FantasyCommunity character={c}/></>;
  if(!fantasyFacilityOpen(building.id,hour)){const treatment=fantasyTempleTreatment(present,fantasyStats(c).hp);return <><button className="fr-text-button" onClick={()=>setSelected(null)}>← {t.title}</button><h2>{building.name[locale]}</h2><p>{fantasyFacilityClosedText(locale)}</p>{building.id==='temple'&&treatment.patient&&button(<>{{ko:'사제를 깨워 치료받기',en:'Wake the priest for treatment',ja:'司祭を起こして治療を受ける'}[locale]} · {treatment.cost} G<small className="fr-service-effects">HP +{treatment.hp} · {{ko:'상태이상 치료',en:'Treat ailments',ja:'状態異常を治療'}[locale]}</small></>,{type:'templeTreat'},!treatment.eligible)}</>;}
  const stock=fantasyBuildingStock(c,building.id);
  const holding=fantasyLibraryHoldings(c);
  const book=FANTASY_LIBRARY_BOOKS.find((b)=>b.id===bookId&&holding.includes(b.id));
  const priestTeacher=building.id==='temple'?NPC_PUBLIC.find(npc=>building.npcIds.includes(npc.id)&&npc.trainableJobs?.includes('priest')):undefined;
  const prayer=fantasyPrayerStatus(c,hour);
  return <><button className="fr-text-button" onClick={()=>{setSelected(null);setBookId(null);}}>← {t.title}</button><h2>{building.name[locale]}</h2>
    {building.npcIds.map(residentButton)}
    {building.id==='temple'&&fantasyTempleLibraryHoldings(c).length>0&&<details className="fr-fold"><summary>{{ko:'신전 서고',en:'Temple library',ja:'神殿の書庫'}[locale]}</summary>{fantasyTempleLibraryHoldings(c).map(id=>{const volume=FANTASY_LIBRARY_BOOKS.find(book=>book.id===id);return volume&&<article key={id}><h4>{volume.title[locale]}</h4>{volume.body[locale].map((paragraph,index)=><p key={index}>{paragraph}</p>)}{button(c.readBooks?.includes(id)?{ko:'읽음',en:'Read',ja:'読了'}[locale]:{ko:'정독하기',en:'Study',ja:'精読する'}[locale],{type:'read',book:id},!!c.readBooks?.includes(id))}</article>;})}</details>}

    {building.id==='guild'&&<FantasyRankBenefits c={c} source="adventurer" blocked={blocked} onAction={onAction}/>}
    {building.id==='guild'&&<FantasyExpeditionPanel c={present} route="guild" locale={locale} blocked={blocked} onAction={onAction}/>}
    {building.id==='temple'&&c.job==='priest'&&<FantasyRankBenefits c={c} source="priest" blocked={blocked} onAction={onAction}/>}
    {building.id==='temple'&&<FantasyGuildBoard c={c} source="temple" onAction={onAction} blocked={blocked}/>}
    <FantasyQuestBoard c={c} building={building.id} onAction={onAction} blocked={blocked}/>
    {building.id==='guild'&&<><FantasyGuildAssessment c={c} blocked={blocked} onAction={onAction}/><FantasyEscortPanel c={c} guild blocked={blocked} onAction={onAction}/></>}
    {priestTeacher&&<FantasyCareerPanel key={`temple:${c.job}`} c={c} offers={[{job:'priest',via:'npc',npcId:priestTeacher.id}]} onAction={onAction} blocked={blocked}/>}
    {building.id==='temple'&&fantasyTempleTreatment(present,fantasyStats(c).hp).patient&&button(<>{{ko:'치료받기',en:'Receive treatment',ja:'治療を受ける'}[locale]} · {fantasyTempleTreatment(present,fantasyStats(c).hp).cost} G</>,{type:'templeTreat'},!fantasyTempleTreatment(present,fantasyStats(c).hp).eligible)}
    {building.id==='temple'&&<div className="fr-service-row"><span>{{ko:'신전에서 기도',en:'Pray at the temple',ja:'神殿で祈る'}[locale]}<small>{realDuration(prayer.hours,locale)}</small></span>{button(<>{{ko:'기도하기',en:'Pray',ja:'祈る'}[locale]}<small className="fr-service-effects">{[prayer.priestXp?{ko:`사제 숙련 +${prayer.priestXp}`,en:`Priest proficiency +${prayer.priestXp}`,ja:`司祭の熟練 +${prayer.priestXp}`}[locale]:'',prayer.notorietyReduction?{ko:`악명 -${prayer.notorietyReduction}`,en:`Notoriety -${prayer.notorietyReduction}`,ja:`悪名 -${prayer.notorietyReduction}`}[locale]:'',{ko:'하루 1회',en:'Once per day',ja:'1日1回'}[locale]].filter(Boolean).join(' · ')}</small></>,{type:'pray'},!prayer.canPray,fantasyPrayerDisabledReason(c,locale,hour))}</div>}
    {building.id==='library'&&(book?<article className="fr-library-reading"><button className="fr-text-button" onClick={()=>setBookId(null)}>← {t.books}</button><h3>{book.title[locale]}</h3>{book.body[locale].map((p,i)=><p key={i}>{p}</p>)}{button(c.readBooks?.includes(book.id)?{ko:'읽음',en:'Read',ja:'読了'}[locale]:{ko:'정독하기',en:'Study this book',ja:'精読する'}[locale]+' · '+realDuration(1,locale),{type:'read',book:book.id},!!c.readBooks?.includes(book.id))}</article>:<><h3>{t.books}</h3><div className="fr-book-list">{FANTASY_LIBRARY_BOOKS.filter((b)=>b.inGame!==false&&holding.includes(b.id)).map((b)=><button key={b.id} onClick={()=>setBookId(b.id)}>▤ {b.title[locale]} <span>→</span></button>)}{holding.length===0&&<p>{t.empty}</p>}</div></>)}
    {building.id==='inn'&&<><h3>{t.room}</h3>{FANTASY_LODGINGS.map((r)=>{const price=fantasyPrice(present,r.cost,'room'),available=rooms?.find(room=>room.room===r.id)?.available;return <div className="fr-service-row" key={r.id}><span>{r.name[locale]}<small>{r.hours} h · {realDuration(r.hours,locale)}{available!==undefined&&' · '+{ko:`잔여 ${available}`,en:`${available} available`,ja:`空き${available}`}[locale]}</small></span><b>{price} G</b>{button(<>{t.stay}<small className="fr-service-effects">{{ko:'피로',en:'Fatigue',ja:'疲労'}[locale]} -{r.fatigueRecovery} · HP +{Math.round(r.hpRecovery*100)}% · MP +{Math.round(r.mpRecovery*100)}%</small></>,{type:'lodge',room:r.id},c.gold<price||available===0,available===0?{ko:'선택한 객실은 만실입니다.',en:'That room type is full.',ja:'この客室は満室です。'}[locale]:undefined)}</div>;})}</>}
    {(building.id==='inn'||building.id==='restaurant')&&<><h3>{t.food}</h3>{FANTASY_DINING.map((m)=>{const price=fantasyPrice(present,m.cost,'food');return <div className="fr-service-row" key={m.id}><span>{m.name[locale]}<small>{realDuration(m.hours,locale)}</small></span><b>{price} G</b>{button(<>{t.eat}<small className="fr-service-effects">{{ko:'허기',en:'Hunger',ja:'空腹'}[locale]} -{m.nutrition} · HP +{m.hp}{m.mp?` · MP +${m.mp}`:''}</small></>,{type:'eat',meal:m.id},c.gold<price)}</div>;})}</>}
    {building.id==='guild'&&<><FantasyGuildBoard c={c} onAction={onAction} blocked={blocked}/><FantasyWorkforceMenu source="guild"/><details className="fr-fold"><summary>{t.jobs}</summary><FantasyCareerPanel key={`guild:${c.job}`} c={c} offers={FANTASY_JOBS.filter(job=>job.category==='ordinary'&&job.id!=='priest').map(job=>({job:job.id,via:'guild' as const}))} onAction={onAction} blocked={blocked}/></details><div className="fr-action-grid">{button(`${t.work} · ${realDuration(4,locale)}`,{type:'work'})}</div></>}
    <FantasyCrafting c={c} building={building.id} onAction={onAction} blocked={blocked}/>
    <FantasyCommissions c={present} building={building.id} onAction={onAction} blocked={blocked}/>
    {(building.id==='shipyard'||building.id==='market')&&<FantasyFishingPanel c={c} onAction={onAction} blocked={blocked}/>}
    {(stock.length>0||building.id==='archaeology')&&<FantasyFiniteShop key={building.id} building={building.id}/>}

  </>;
}
