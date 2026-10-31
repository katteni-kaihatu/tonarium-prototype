import { useEffect, useRef, useState } from 'react';
import type { FantasyProfile } from '../../../shared/fantasy.ts';
import { parseFantasyRoll, type FantasyRollView } from '../../../shared/fantasy-roll.ts';
import { useLocale } from '../locale.ts';
import { fantasyLogText } from './fantasy-copy.ts';
import { playDiceRoll } from './sounds.ts';

/** 転がる演出の長さと、結果を読み取れるように残す長さ。 */
const ROLLING_MS = 2500;
const DISPLAY_MS = 5500;

export function FantasyDice({profile}:{profile:FantasyProfile}) {
  const [locale]=useLocale();
  const seen=useRef<{life:string;id:number}|null>(null);
  const [queue,setQueue]=useState<(FantasyRollView&{id:number})[]>([]);
  const [rolling,setRolling]=useState(true);
  const openedAt=useRef(0);
  const [pinned,setPinned]=useState(false);
  const roll=queue[0];
  const life=`${profile.generation??1}:${profile.character?.name??''}`;
  useEffect(()=>{
    const last=profile.log.at(-1)?.id??0;
    if(!seen.current||seen.current.life!==life){seen.current={life,id:last};setQueue([]);return;}
    const previous=seen.current.id;seen.current.id=last;
    const added=profile.log.filter(log=>log.id>previous).flatMap(log=>{const parsed=parseFantasyRoll(log.text);return parsed?[{...parsed,id:log.id}]:[];});
    if(added.length)setQueue(current=>[...current,...added]);
  },[life,profile.revision,profile.log]);
  useEffect(()=>{
    if(!roll)return;
    openedAt.current=Date.now();setRolling(true);setPinned(false);
    playDiceRoll();
    const settle=setTimeout(()=>setRolling(false),ROLLING_MS);
    return()=>clearTimeout(settle);
  },[roll?.id]);
  // 自動送りは窓を開いた時刻から数える。保持を選んだときだけ停止する。
  useEffect(()=>{
    if(!roll||pinned)return;
    const finish=setTimeout(()=>setQueue(current=>current.slice(1)),Math.max(0,openedAt.current+DISPLAY_MS-Date.now()));
    return()=>clearTimeout(finish);
  },[roll?.id,pinned]);
  if(!roll)return null;
  const t={ko:{success:'성공',failure:'실패',high:'높은 눈 채택',low:'낮은 눈 채택',close:'닫기'},en:{success:'Success',failure:'Failure',high:'Keep highest',low:'Keep lowest',close:'Close'},ja:{success:'成功',failure:'失敗',high:'高い目を採用',low:'低い目を採用',close:'閉じる'}}[locale];
  const label=fantasyLogText(roll.label,locale,profile.character);
  return <div className="fr-dice-overlay" aria-live="polite"><section className={`fr-dice-card ${rolling?'rolling':roll.success?'success':'failure'}`}>
    <button className="fr-text-button fr-dice-close" onClick={()=>setQueue(current=>current.slice(1))} aria-label={t.close}>×</button>
    <button type="button" className="fr-text-button" aria-pressed={!pinned} onClick={()=>setPinned(value=>!value)}>{{ko:pinned?'결과 유지 중 · 자동 넘기기 켜기':'자동 넘기기 켜짐 · 결과 유지',en:pinned?'Result kept · enable auto advance':'Auto advance on · keep result',ja:pinned?'結果を保持中・自動送りを有効にする':'自動送り有効・結果を保持'}[locale]}</button>{queue.length>1&&<small>{queue.length} {{ko:'개 판정',en:'checks',ja:'件の判定'}[locale]}</small>}
    <small>{label}</small><b>{roll.dice.length}D{roll.sides}</b>
    <div className="fr-dice-pool">{roll.dice.map((value,index)=><div key={index} className={`fr-die ${value===roll.kept?'kept':''}`} style={{animationDelay:`${index*60}ms`}}><span>{value}</span></div>)}</div>
    {!rolling&&<><span>{roll.rule==='highest'?t.high:roll.rule==='lowest'?t.low:''}</span><p>{roll.kept} {roll.modifier>=0?'+':'−'} {Math.abs(roll.modifier)} = <strong>{roll.total}</strong> / DC {roll.dc}</p><h3>{roll.success?t.success:t.failure}</h3></>}
  </section></div>;
}
