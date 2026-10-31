import {useState} from 'react';
import type {FantasyAction,FantasyCharacter} from '../../../shared/fantasy.ts';
import {FANTASY_RELICS} from '../../../shared/fantasy-relic-catalog.ts';
import {fantasyOccultActionError} from '../../../shared/fantasy-occult.ts';
import {useLocale} from '../locale.ts';
import {useStore} from '../store.ts';
import {ReasonButton} from './FantasyActionButton.tsx';
import {realDuration} from './FantasyActivity.tsx';
import {fantasyStats} from '../../../shared/fantasy-engine.ts';
export function FantasyOccultActions({c,blocked,onAction,inventory=false}:{c:FantasyCharacter;blocked:boolean;onAction:(a:FantasyAction)=>void;inventory?:boolean}){
  const [locale]=useLocale(),profile=useStore(s=>s.fantasyProfile),[selected,setSelected]=useState<string>();if(!profile)return null;
  const say=(ko:string,en:string,ja:string)=>({ko,en,ja})[locale];
  if(!inventory){if(c.location!=='starfall-isle'||c.job!=='mage')return null;const action={type:'occultObserve'} as const,error=fantasyOccultActionError(profile,action,locale);return <ReasonButton className="fr-btn" disabled={blocked||!!error} reason={error} onClick={()=>onAction(action)}>{say('밤하늘 관측','Observe the night sky','夜空を観測')} · {realDuration(2,locale)}</ReasonButton>;}
  const relics=FANTASY_RELICS.filter(relic=>c.occult?.relics.includes(relic.id));if(!relics.length)return null;
  return <section><h3>{say('유적에서 가져온 유산','Recovered legacies','遺跡から持ち帰った遺産')}</h3>{relics.map(relic=>{const action={type:'occultRelic',relic:relic.id} as const,error=fantasyOccultActionError(profile,action,locale),read=c.occult?.usedRelics.includes(relic.id);return <article className="fr-card" key={relic.id}><button className="fr-text-button" aria-expanded={selected===relic.id} onClick={()=>setSelected(selected===relic.id?undefined:relic.id)}>{relic.names[locale]}</button>{selected===relic.id&&<div>{relic.passages[locale].map((p,i)=><p key={i}>{p}</p>)}{read?<small>{say('읽은 기록','Studied','読了済み')}</small>:<ReasonButton className="fr-btn" disabled={blocked||!!error} reason={error} onClick={()=>onAction(action)}>{say('유산 살펴보기','Study the legacy','遺産を調べる')} · {realDuration(1,locale)}</ReasonButton>}</div>}</article>;})}</section>;
}
export function FantasyDownedCare({c,onAction}:{c:FantasyCharacter;onAction:(a:FantasyAction)=>void}){
  const [locale]=useLocale(),pending=useStore(s=>s.fantasyPending||!s.wsConnected);if(!c.downed)return null;
  const say=(ko:string,en:string,ja:string)=>({ko,en,ja})[locale];
  return <section className="fr-card fr-downed-care" role="status"><h2>{c.downed.kind==='sacrifice'?say('빈사(실신)','Downed (fainted)','瀕死（失神）'):say('빈사 · 의식 없음','Downed · unconscious','瀕死・意識不明')}</h2><p>{c.downed.kind==='sacrifice'?say('강한 힘을 사용한 대가로 실신했다. 전투가 끝나면 의식을 되찾는다.','Great power has left you fainted. Consciousness returns after combat.','強い力の代償で失神した。戦闘後に意識を取り戻す。'):c.downed.wakesAt!==undefined?say('응급처치를 받았다. 의식이 돌아오기를 기다린다.','Stabilized. Waiting to regain consciousness.','応急手当て済み。意識が戻るのを待っている。'):say('동료의 기적이나 전투 후의 치료가 필요하다.','A companion’s miracle or treatment after combat is needed.','仲間の奇跡か、戦闘後の治療が必要だ。')}</p>{c.downed.wakesAt!==undefined&&<p>{say('회복까지','Until recovery','回復まで')} {Math.max(0,c.downed.wakesAt-c.hour).toFixed(1)} h</p>}{!useStore.getState().fantasyProfile?.combatId&&<div className="fr-action-grid"><ReasonButton className="fr-btn" disabled={pending||c.downed.treatedAt!==undefined} onClick={()=>onAction({type:'downedCare',method:'potion'})}>{say('회복약으로 응급처치','Stabilize with a potion','回復薬で応急手当て')}</ReasonButton><ReasonButton className="fr-btn" disabled={pending} onClick={()=>onAction({type:'downedCare',method:'temple'})}>{say('신전 치료 요청','Request temple treatment','神殿に治療を頼む')} · {Math.ceil(fantasyStats(c).hp/4)+5}G</ReasonButton></div>}</section>;
}
