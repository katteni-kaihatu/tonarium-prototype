import { useId, useState } from 'react';
import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_WORLD_TIME_RATE } from '../../../shared/fantasy.ts';
import { fantasyCampCompanions, fantasyCampingKit } from '../../../shared/fantasy-camping.ts';
import { fantasyDungeonCampError, fantasyDungeonErrorText } from '../../../shared/fantasy-dungeon.ts';
import { useLocale } from '../locale.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import './fantasy-dungeon.css';

export function FantasyCampOptions({c,blocked,onAction}:{c:FantasyCharacter;blocked:boolean;onAction:(action:FantasyAction)=>void}) {
  const [locale]=useLocale(),[watch,setWatch]=useState(false),id=useId();
  const say=(ko:string,en:string,ja:string)=>({ko,en,ja})[locale];
  const source=c.dungeon?.active?fantasyDungeonCampError(c):undefined,reason=source?fantasyDungeonErrorText(source,locale):undefined,companions=fantasyCampCompanions(c),kit=fantasyCampingKit(c),minutes=Math.ceil(8*60/FANTASY_WORLD_TIME_RATE);
  return <div className="fr-camp-options"><small>{say(`8시간 · 실제 ${minutes}분`,`8 hours · ${minutes} real min`,`8時間・実時間${minutes}分`)} · HP +20% · MP +{Math.round(kit.mp*100)}% · {say('피로','Fatigue','疲労')} -{watch?`${Math.floor(kit.fatigue*.75)}–${kit.fatigue}`:kit.fatigue} · {say('현재 날씨 기준','Current weather estimate','現在の天候での目安')}</small><label htmlFor={id}><input id={id} type="checkbox" checked={watch} disabled={blocked} onChange={event=>setWatch(event.target.checked)}/>{say('교대 망보기 참여','Join the rotating watch','交代の見張りに参加')}</label>
    <p>{say('같은 곳에서 야영하며 동의한 파티원이나 건강한 편성 동료와 교대합니다. 망볼 사람이 둘 이상일 때 습격 위험이 줄고, 참여자의 피로 회복은 약 25% 줄어듭니다.','Rotate with consenting party campers at the same spot or healthy assigned companions. At least two watchers reduce ambush risk; participants recover about 25% less fatigue.','同じ場所で野営する同意済みの仲間や、元気な編成済みの仲間と交代する。見張りが二人以上なら襲撃の危険が下がり、参加者の疲労回復は約25%少なくなる。')}</p>
    {companions>0&&<small>{say(`함께 망볼 수 있는 동료: ${companions}명`,`Available companion watchers: ${companions}`,`見張りに参加できる仲間：${companions}人`)}</small>}
    <ReasonButton className="fr-btn" disabled={blocked||!!reason} reason={reason} onClick={()=>onAction({type:'rest',...(watch?{watch:true}:{})})}>{c.dungeon?.active?say('확보한 방에서 야영','Camp in this secured room','確保した部屋で野営'):say('야영 시작','Make camp','野営を始める')}</ReasonButton>
  </div>;
}
