import { FANTASY_LAST_DAWN_SKILL } from '../../../shared/fantasy-miracle-catalog.ts';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { NpcLocale as FantasyLocale } from '../../../shared/npc.ts';
import { fantasyCombatVisualDuration } from '../../../shared/fantasy-combat-visuals.ts';
import type { FantasyCombatBeat } from './fantasy-combat-presentation.ts';
import { FantasyElementEffects, FantasyMiracleEffects } from './FantasyElementMiracleEffects.tsx';
import { FantasyUltimateEffects } from './FantasyUltimateEffects.tsx';

export function FantasyCombatEffects({beat,locale,width:columns,height:rows,positions,reducedMotion=false}:{beat?:FantasyCombatBeat;locale:FantasyLocale;width:number;height:number;positions:Record<string,{x:number;y:number}>;reducedMotion?:boolean}) {
  if(!beat)return null;
  const event=beat.event,tier=beat.tier??1,kind=beat.visual;
  const duration=beat.ultimate?.durationMs??fantasyCombatVisualDuration(tier);
  const sourceTile=event.from??positions[event.actor]??beat.actor?.tile??{x:1,y:1};
  const targetTile=event.to??(event.target?positions[event.target]:undefined)??sourceTile;
  const source={x:(sourceTile.x+.5)/columns*1000,y:(sourceTile.y+.5)/rows*800};
  const target=kind==='last-dawn'?{x:500,y:400}:{x:(targetTile.x+.5)/columns*1000,y:(targetTile.y+.5)/rows*800};
  const angle=Math.atan2(target.y-source.y,target.x-source.x)*180/Math.PI;
  const holy=kind==='miracle'||kind==='last-dawn';
  const color=beat.ultimate?.color??(({fire:'#f19a45',frost:'#8ad8ef',storm:'#ac9aef',poison:'#a3c965',water:'#80cbdc',earth:'#bc9c79',wind:'#a2d4b5',star:'#b8a9e9',alchemy:'#68c9b5',miracle:'#e7c97f','last-dawn':'#fff0bd'} as Record<string,string>)[kind]??'#e7c991');
  const style={'--fr-fx-color':color,'--fr-fx-glow':color,'--fr-fx-angle':`${angle}deg`,'--fr-fx-duration':`${duration}ms`,'--fr-fx-detail':tier} as CSSProperties;
  const pointProps={source,target,tier,durationMs:duration,seed:beat.id};
  const particles=Array.from({length:tier===1?5:tier===2?9:15},(_,i)=>{const a=(i*137.5+angle)*Math.PI/180;return {x:Math.cos(a)*(48+tier*12),y:Math.sin(a)*(35+tier*10),angle:i*137.5,delay:`${i*12}ms`};});
  return <>
    <div key={beat.id} className={`fr-combat-effects fr-fx-${kind} fr-fx-tier-${tier} ${reducedMotion?'reduced-motion':''}`} style={style} aria-hidden="true">
      <svg viewBox="0 0 1000 800" preserveAspectRatio="none">
        {kind==='charge'?<g className="fr-fx-charge-rune" transform={`translate(${source.x} ${source.y})`} stroke="#b85b35" fill="none"><ellipse rx="36" ry="23" strokeWidth="3"/><path d="M0-27L25 0L0 27L-25 0ZM-43 0H43M0-31V31" strokeWidth="2"/></g>:null}
        {event.kind==='attack'&&event.tiles?.map(tile=><rect key={`${tile.x},${tile.y}`} className="fr-fx-area-release" x={tile.x/columns*1000+3} y={tile.y/rows*800+3} width={1000/columns-6} height={800/rows-6} rx="6" fill={color} fillOpacity=".16" stroke={color} strokeWidth="2"/>)}
        {(['fire','frost','storm','poison','alchemy','water','earth','wind','star'] as string[]).includes(kind)?<FantasyElementEffects {...pointProps} kind={kind as 'fire'|'frost'|'storm'|'poison'|'alchemy'|'water'|'earth'|'wind'|'star'}/>:null}
        {holy?<FantasyMiracleEffects {...pointProps} id={event.skill??'holy'}/>:null}
        {kind==='ultimate'&&beat.ultimate?<FantasyUltimateEffects {...pointProps} id={event.skill??''} ultimate={beat.ultimate}/>:null}
        {kind==='projectile'?<g>
          <path className="fr-fx-shot-trail" d={`M ${source.x} ${source.y} Q ${(source.x+target.x)/2} ${Math.min(source.y,target.y)-50-tier*12} ${target.x} ${target.y}`} stroke={color} strokeWidth={tier===1?4:7} fill="none"/>
          {tier>=2?<path className="fr-fx-shot-echo" d={`M ${source.x} ${source.y+9} Q ${(source.x+target.x)/2} ${Math.min(source.y,target.y)-30} ${target.x} ${target.y+5}`} stroke={color} strokeWidth="2" fill="none"/>:null}
          <g transform={`translate(${target.x} ${target.y}) rotate(${angle})`}><path className="fr-fx-shot-head" d="M-46 0H14L-2-9M14 0L-2 9" stroke="#fff8df" strokeWidth="4" fill="none"/></g>
        </g>:null}
        {(kind==='slash'||kind==='thrust'||kind==='impact')&&!beat.missed?<g transform={`translate(${target.x} ${target.y})`}>
          {kind==='slash'?<g transform={`rotate(${angle-35})`}>
            <path className="fr-fx-cut" d="M-75 53Q-40-70 79-51Q-11-11-75 53Z" fill={color}/>
            <path className="fr-fx-cut-edge" d="M-75 53Q-40-70 79-51" stroke="#fffbe9" strokeWidth="5" fill="none"/>
            {tier>=2?<path className="fr-fx-cut-follow" d="M-64 68Q-18-52 91-35" stroke={color} strokeWidth="3" fill="none"/>:null}
            {tier>=3?<path className="fr-fx-cut-follow" d="M-88 31Q-61-82 49-64" stroke="#fff5d5" strokeWidth="2" fill="none"/>:null}
          </g>:kind==='thrust'?<g transform={`rotate(${angle})`}>
            <path className="fr-fx-lance" d="M-140-4L4-13L66 0L4 13L-140 4Z" fill={color}/>
            <path className="fr-fx-lance-core" d="M-125 0H55" stroke="#fffcec" strokeWidth="4"/>
            {tier>=2?<path className="fr-fx-lance-lines" d="M-117-20L19-10M-117 20L19 10" stroke={color} strokeWidth="2"/>:null}
          </g>:<g>
            <path className="fr-fx-impact-star" d="M0-57L12-18L48-32L25-1L57 17L18 23L12 53L-4 27L-41 46L-25 12L-57-7L-19-12L-27-45L-5-26Z" fill={color}/>
            <circle className="fr-fx-impact-core" r="18" fill="#fff8df"/>
          </g>}
        </g>:null}
        {(['slash','thrust','projectile','impact'] as string[]).includes(kind)&&!beat.missed?<g transform={`translate(${target.x} ${target.y})`}>
          {Array.from({length:tier},(_,i)=><circle key={`ring-${i}`} className="fr-fx-physical-ring" r={28+i*10} fill="none" stroke={i%2? '#fff8de':color} strokeWidth={i===0?3:1.5} style={{animationDelay:`${i*55}ms`}}/>)}
          {particles.map((p,i)=><g key={i} style={{'--fr-spark-x':`${p.x}px`,'--fr-spark-y':`${p.y}px`,animationDelay:p.delay} as CSSProperties} className="fr-fx-physical-spark"><path d={i%2?'M-2-7L2-7L1 7L-1 7Z':'M0-5L3 0L0 5L-3 0Z'} transform={`rotate(${p.angle})`} fill={i%3?color:'#fffbe3'}/></g>)}
        </g>:null}
      </svg>
      {beat.missed?<span className="fr-fx-miss" style={{left:`${target.x/10}%`,top:`${target.y/8}%`}}>{locale==='ko'?'빗나감':locale==='ja'?'外れ':'Miss'}</span>:null}
    </div>
    {kind==='last-dawn'&&typeof document!=='undefined'?createPortal(<div key={`${beat.id}-quote`} className="fr-fx-dawn-screen-quote" style={style} role="status"><span><strong className="fr-fx-dawn-screen-title">{FANTASY_LAST_DAWN_SKILL.names[locale]}</strong><span>{locale==='ko'?'제게 남은 빛을, 저들에게 돌아갈 아침으로.':locale==='ja'?'私に残る光を、あの人たちに帰る朝へ。':'Let my remaining light become the morning they return to.'}</span></span></div>,document.body):null}
  </>;
}
