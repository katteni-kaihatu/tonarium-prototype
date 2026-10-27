import { useEffect, useRef, useState } from 'react';
import type { FantasyProfile } from '../../../shared/fantasy.ts';
import { parseFantasyRoll, type FantasyRollView } from '../../../shared/fantasy-roll.ts';
import { useLocale } from '../locale.ts';
import { fantasyLogText } from './fantasy-copy.ts';

export function FantasyDice({profile}:{profile:FantasyProfile}) {
  const [locale]=useLocale();
  const seen=useRef<{life:string;id:number}|null>(null);
  const [queue,setQueue]=useState<(FantasyRollView&{id:number})[]>([]);
  const [rolling,setRolling]=useState(true);
  const roll=queue[0];
  const life=`${profile.generation??1}:${profile.character?.name??''}`;
  useEffect(()=>{
    const last=profile.log.at(-1)?.id??0;
    if(!seen.current||seen.current.life!==life){seen.current={life,id:last};setQueue([]);return;}
    const previous=seen.current.id;seen.current.id=last;
    const added=profile.log.filter(log=>log.id>previous).flatMap(log=>{const parsed=parseFantasyRoll(log.text);return parsed?[{...parsed,id:log.id}]:[];});
    if(added.length)setQueue(current=>[...current,...added].slice(-8));
  },[life,profile.revision,profile.log]);
  useEffect(()=>{
    if(!roll)return;
    setRolling(true);
    const settle=setTimeout(()=>setRolling(false),650);
    const finish=setTimeout(()=>setQueue(current=>current.slice(1)),2800);
    return()=>{clearTimeout(settle);clearTimeout(finish);};
  },[roll?.id,life]);
  if(!roll)return null;
  const t={ko:{success:'성공',failure:'실패',high:'높은 눈 채택',low:'낮은 눈 채택',close:'닫기'},en:{success:'Success',failure:'Failure',high:'Keep highest',low:'Keep lowest',close:'Close'},ja:{success:'成功',failure:'失敗',high:'高い目を採用',low:'低い目を採用',close:'閉じる'}}[locale];
  const label=fantasyLogText(roll.label,locale,profile.character);
  return <div className="fr-dice-overlay" aria-live="polite"><section className={`fr-dice-card ${rolling?'rolling':roll.success?'success':'failure'}`}>
    <button className="fr-text-button fr-dice-close" onClick={()=>setQueue([])} aria-label={t.close}>×</button>
    <small>{label}</small><b>{roll.dice.length}D{roll.sides}</b>
    <div className="fr-dice-pool">{roll.dice.map((value,index)=><div key={index} className={`fr-die ${value===roll.kept?'kept':''}`} style={{animationDelay:`${index*60}ms`}}><span>{value}</span></div>)}</div>
    {!rolling&&<><span>{roll.rule==='highest'?t.high:roll.rule==='lowest'?t.low:''}</span><p>{roll.kept} {roll.modifier>=0?'+':'−'} {Math.abs(roll.modifier)} = <strong>{roll.total}</strong> / DC {roll.dc}</p><h3>{roll.success?t.success:t.failure}</h3></>}
  </section></div>;
}
