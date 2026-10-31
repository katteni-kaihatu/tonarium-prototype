import { fantasyCampFireText } from '../../../shared/fantasy-camping.ts';
import { fantasyTravelRedirectQuote } from '../../../shared/fantasy-engine.ts';
import { fantasyTravelCurrentTransport } from '../../../shared/fantasy-travel.ts';
import { fantasyEscortPenalty } from '../../../shared/fantasy-escort.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { useEffect, useState } from 'react';
import { FANTASY_WORLD_TIME_RATE, type FantasyProfile } from '../../../shared/fantasy.ts';
import { useStore } from '../store.ts';
import { useLocale } from '../locale.ts';
import { FANTASY_JOBS } from '../../../shared/fantasy-data.ts';
import { FANTASY_PROPERTY_PLOTS } from '../../../shared/fantasy-property.ts';
import { FANTASY_TERMS } from '../../../shared/fantasy-lore.ts';
import { fantasyKnownLocations } from '../../../shared/fantasy-town.ts';

export function realDuration(gameHours:number,locale:'ko'|'en'|'ja') {
  const seconds=Math.ceil(gameHours*3600/FANTASY_WORLD_TIME_RATE);
  if(seconds<60)return locale==='ko'?`실제 약 ${seconds}초`:locale==='en'?`About ${seconds} real sec`:`実時間 約${seconds}秒`;
  const minutes=Math.ceil(seconds/60);
  return locale==='ko'?`실제 약 ${minutes}분`:locale==='en'?`About ${minutes} real min`:`実時間 約${minutes}分`;
}

export function FantasyActivity({profile,onCancel,onRedirect,onAbandon}:{profile:FantasyProfile;onCancel?:()=>void;onRedirect?:(destination:string,transport?:string)=>void;onAbandon?:()=>void}) {
  const [locale]=useLocale();
  const clock=useStore(s=>s.fantasyClock);
  const [confirming,setConfirming]=useState(false);
  useEffect(()=>setConfirming(false),[profile.activity?.startedAt,profile.activity?.endsAt,profile.activity?.action.type]);
  const party=useStore(s=>s.fantasyParty),selfId=useStore(s=>s.selfId),pending=useStore(s=>s.fantasyPending||s.fantasyPartyPending||!s.wsConnected);
  const leader=!party?.id||(party.movementLeader?party.movementLeader===selfId:!!party.members.find(member=>member.id===selfId)?.isLeader);
  const activity=profile.activity;
  if(!activity)return null;
  const hour=clock?.hour??profile.character?.hour??activity.startedAt;
  const seconds=Math.max(0,Math.ceil((activity.endsAt-hour)*3600/FANTASY_WORLD_TIME_RATE));
  const remaining=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  const names={ko:{travel:'이동 중',work:'일하는 중',explore:'탐색 중',rest:'노숙 중',lodge:'휴식 중',eat:'식사 중',job:'직업을 배우는 중',craft:'제작 중',event:'행동 중'},en:{travel:'Traveling',work:'Working',explore:'Exploring',rest:'Camping',lodge:'Resting',eat:'Eating',job:'Learning a profession',craft:'Crafting',event:'Resolving a choice'},ja:{travel:'移動中',work:'仕事中',explore:'探索中',rest:'野宿中',lodge:'休息中',eat:'食事中',job:'職業を習得中',craft:'制作中',event:'行動中'}}[locale];
  const property=activity.action.type==='propertyUse'?FANTASY_PROPERTY_PLOTS.find(plot=>activity.action.type==='propertyUse'&&plot.id===activity.action.plot):undefined;
  const name=activity.action.type==='cookMix'?{ko:'요리 중',en:'Cooking',ja:'調理中'}[locale]:activity.action.type==='campCook'?{ko:'야외 요리 중',en:'Cooking outdoors',ja:'野外料理中'}[locale]:activity.action.type==='advanceJob'?{ko:'전문 분야를 배우는 중',en:'Learning a specialty',ja:'専門分野を学んでいる'}[locale]:property?({farmland:{ko:'농사 중',en:'Tending crops',ja:'畑の手入れ中'},commercial:{ko:'영업 중',en:'Running the business',ja:'営業中'},residence:{ko:'집에서 휴식 중',en:'Resting at home',ja:'自宅で休息中'}}[property.kind][locale]):activity.action.type==='priestBranch'?{ko:'성소에서 길을 배우는 중',en:'Learning a sacred path',ja:'聖所で道を学んでいる'}[locale]:activity.action.type==='pray'?{ko:'기도 중',en:'Praying',ja:'祈り中'}[locale]:activity.action.type==='manaTrain'?{ko:'마나 수련 중',en:'Practicing mana',ja:'マナ修練中'}[locale]:activity.action.type==='learn'?{ko:'기술을 배우는 중',en:'Learning a skill',ja:'技能を習得中'}[locale]:names[activity.action.type as keyof typeof names]??{ko:'진행 중',en:'In progress',ja:'進行中'}[locale];
  const action=activity.action;
  const job=action.type==='job'?FANTASY_JOBS.find(j=>j.id===action.job):null;
  const progress=Math.max(0,Math.min(1,(hour-activity.startedAt)/(activity.endsAt-activity.startedAt)));
  const travelling=action.type==='travel';
  const escort=travelling&&action.transport==='escort';
  const mode=fantasyTravelCurrentTransport(activity,hour)??(action.type==='travel'?action.transport:'');
  const redirectLocked=travelling&&['ship','working-ship','airship','gate','escort'].includes(mode);
  const destinations=travelling&&onRedirect&&!redirectLocked&&profile.character?fantasyKnownLocations(profile.character):[];
  const choices=destinations.flatMap(destination=>{
    const variants=[fantasyTravelRedirectQuote(profile,destination,undefined,hour),fantasyTravelRedirectQuote(profile,destination,'carriage',hour)];
    return variants.filter((quote,index)=>quote&&variants.findIndex(other=>other?.id===quote.id)===index).map(quote=>({destination,quote:quote!}));
  });
  const placeName=(id:string)=>FANTASY_TERMS.find(term=>term.category==='place'&&term.id===id)?.names[locale]??id;
  const cancelLabel=confirming?{ko:'정말 취소할까요?',en:'Cancel for sure?',ja:'本当に取り消しますか？'}[locale]:{ko:'행동 취소',en:'Cancel action',ja:'行動を取り消す'}[locale];
  const say=(ko:string,en:string,ja:string)=>({ko,en,ja})[locale];
  return <div className="fr-activity" role="status"><div><b>{name}{job?` · ${job.names[locale]}`:''}</b><span>{seconds>0?`${{ko:'완료까지',en:'Time left',ja:'完了まで'}[locale]} ${remaining}`:{ko:'마무리 중…',en:'Finishing…',ja:'完了処理中…'}[locale]}</span></div>{activity.camp?.fire&&<p>{fantasyCampFireText(activity.camp.fire,locale)}</p>}<progress aria-label={name} value={progress} max={1}/>{activity.cooking&&activity.action.type==='cookMix'&&<p>{say(`조리 ${activity.cooking.completed}/${activity.action.repeats}회 완료`,`Cooked ${activity.cooking.completed}/${activity.action.repeats} repetitions`,`調理 ${activity.cooking.completed}/${activity.action.repeats}回完了`)}</p>}
    {onCancel&&!escort&&<ReasonButton type="button" className={confirming?'fr-cancel armed':'fr-cancel'} disabled={pending||redirectLocked} reason={redirectLocked?say("이동수단에서 내릴 수 있는 지점까지 기다려 주세요.","Wait until this transport reaches a stop.","この移動手段が停まる場所までお待ちください。"):undefined} onClick={()=>{if(confirming){setConfirming(false);onCancel();}else setConfirming(true);}}>{cancelLabel}</ReasonButton>}
    {escort&&onAbandon&&<ReasonButton className="fr-cancel" disabled={pending} onClick={()=>{if(confirming){setConfirming(false);onAbandon();}else setConfirming(true);}}>{confirming?say('위약금을 내고 포기','Pay penalty and abandon','違約金を払い辞退'):say('호위 포기','Abandon escort','護衛を辞退')} · {fantasyEscortPenalty(profile.character?.escort?.reward??0)} G</ReasonButton>}
    {confirming&&<button className="fr-text-button" type="button" onClick={()=>setConfirming(false)}>{say('계속하기','Keep going','続ける')}</button>}
    {escort&&<small>{say('포기하면 도착 보수를 받지 못합니다.','Abandoning forfeits the arrival reward.','辞退すると到着報酬は受け取れません。')}</small>}
    {redirectLocked&&!escort&&<small>{say('탑승 중에는 목적지를 바꿀 수 없습니다.','You cannot change destination while this transport is in transit.','搭乗中は行き先を変えられません。')}</small>}
    {!!choices.length&&<details className="fr-redirect"><summary>{say('목적지 변경','Change destination','目的地を変える')}</summary>
      {mode==='carriage'&&<p>{say('마차에서 내려 도보로 이동합니다. 낸 운임은 돌려받지 못합니다.','You will leave the carriage and continue on foot. Paid fares are not refunded.','馬車を降りて徒歩で進みます。運賃は返金されません。')}</p>}
      <div className="fr-redirect-list">{choices.map(({destination,quote})=><ReasonButton key={destination+quote.id} type="button" className="fr-redirect-item" disabled={pending||!leader} reason={!leader?say('파티장만 목적지 변경을 제안할 수 있습니다.','Only the leader can propose a new destination.','目的地の変更はリーダーが提案できます。'):undefined} onClick={()=>{setConfirming(false);onRedirect?.(destination,quote.id);}}>{placeName(destination)} · {quote.legs?.some(leg=>leg.transport==='carriage')?quote.legs?.some(leg=>leg.transport==='foot')?say('도보 → 마차','Walk → carriage','徒歩 → 馬車'):say('마차','Carriage','馬車'):say('도보','On foot','徒歩')} · {quote.cost} G · {realDuration(quote.hours,locale)}</ReasonButton>)}</div></details>}
  </div>;
}
