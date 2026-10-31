import { useEffect, useRef, useState } from 'react';
import { FANTASY_LOCATIONS, FANTASY_ROUTES } from '../../../shared/fantasy-data.ts';
import type { FantasyLocation } from '../../../shared/fantasy.ts';
import { useLocale } from '../locale.ts';
import { FANTASY_TERMS } from '../../../shared/fantasy-lore.ts';
import { fantasyJourneyPoint, type FantasyJourneyView } from '../../../shared/fantasy-journey.ts';
import { fantasyHasGate } from '../../../shared/fantasy-gates.ts';
import { FANTASY_FINAL_ISLE_ID } from '../../../shared/fantasy-isle-access.ts';
import { fantasyFogReveal } from '../../../shared/fantasy-fog.ts';
import { FANTASY_MAP_BOUNDS, FANTASY_NOCTIS_COAST_PATH, FANTASY_NOCTIS_LABEL, FANTASY_NOCTIS_SHIFT_X, FANTASY_FRONTIER_COAST_PATH, FANTASY_FRONTIER_LABEL, FANTASY_AURELIA_COAST_PATH, FANTASY_SYLVARA_COAST_PATH, FANTASY_KAZARAN_COAST_PATH } from '../../../shared/fantasy-map-geometry.ts';
import { FANTASY_FRONTIER_NAMES } from '../../../shared/fantasy-frontier-data.ts';

export const FANTASY_KIND_NAMES: Record<FantasyLocation['kind'], string> = {
  city: '都市', forest: '森林', mountain: '山岳', cave: '洞窟', ruin: '遺跡', coast: '海岸', swamp: '湿地',
  desert: '砂漠', volcano: '火山', island: '島', tower: '魔塔', snow: '雪原',
};

function Glyph({ kind }: { kind: FantasyLocation['kind'] }) {
  if (kind === 'forest') return <path d="M0-10-7 0h4l-6 7h18L3 0h4ZM0 7v5" />;
  if (kind === 'mountain' || kind === 'volcano' || kind === 'snow') return <path d="m-11 8 8-18 7 13 4-8 7 13Zm5-11 3 2 2-2" />;
  if (kind === 'city') return <path d="M-10 9V-2h5v-6h10v6h5V9ZM-2 9V3h4v6M-10-5v-3m20 3v-3" />;
  if (kind === 'tower' || kind === 'ruin') return <path d="M-7 9V-7l7-4 7 4V9ZM-10 9h20M-3-3h6M-2 9V3h4v6" />;
  if (kind === 'cave') return <path d="M-12 8-7-6 2-10 11 0l2 8ZM-5 8V1q5-8 10 0v7" />;
  if (kind === 'coast' || kind === 'island') return <path d="M-11 6q5-4 10 0t12 0M-7 1l7-12v12h8L4 5H-4Z" />;
  if (kind === 'desert') return <path d="M-12 7q9-16 19 0M-1 5q9-10 14 2M7-7h.1" />;
  return <path d="M-11 7q5-4 10 0t12 0M-5 1V-8m10 9V-5M-9-4l4 3 4-5M1-2l4 2 4-3" />;
}

const west = FANTASY_AURELIA_COAST_PATH;
const east = FANTASY_NOCTIS_COAST_PATH;
const noctisTransform = `translate(${FANTASY_NOCTIS_SHIFT_X} 0)`;

const southWest = FANTASY_SYLVARA_COAST_PATH;
const southEast = FANTASY_KAZARAN_COAST_PATH;
const finalIsle = 'M1049 532q16-21 39-16l22 14 7 26-11 29-29 12-30-19-10-22Z';
const WORLD_WIDTH = FANTASY_MAP_BOUNDS.width, WORLD_HEIGHT = FANTASY_MAP_BOUNDS.height;
const boundCamera = (x: number, y: number, w: number, h: number) => ({ x: Math.max(0, Math.min(WORLD_WIDTH-w,x)), y: Math.max(0, Math.min(WORLD_HEIGHT-h,y)), w, h });

export function FantasyMap({ current, selected, visited, known = visited, frontier = [], onSelect, journey }: {
  current?: string; selected: string; visited: string[]; known?: string[]; frontier?: string[]; onSelect: (id: string) => void; journey?: FantasyJourneyView;
}) {
  const [locale] = useLocale();
  const finalIsleKnown = known.includes(FANTASY_FINAL_ISLE_ID);
  const reveal = fantasyFogReveal(known, visited, journey);
  const knownAreaPath = reveal.circles.map((l)=>`M${l.x+78} ${l.y}a78 78 0 1 0-156 0a78 78 0 1 0 156 0Z`).join(' ');
  const fogLine = (points: readonly { x: number; y: number }[]) => points.map((point,index)=>`${index?'L':'M'}${point.x} ${point.y}`).join(' ');
  const unknown = { ko: '미지의 장소', en: 'Unknown place', ja: '未知の場所' }[locale];
  const title = { ko: '여행자의 지도', en: 'The traveler’s map', ja: '旅人の地図' }[locale];
  const nameOf = (l: FantasyLocation) => known.includes(l.id) ? FANTASY_TERMS.find((t) => t.category === 'place' && t.id === l.id)?.names[locale] ?? l.names?.[locale] ?? l.name : unknown;
  const [camera, setCamera] = useState({x:0,y:0,w:1000,h:620});
  const moving = journey ? fantasyJourneyPoint(journey) : undefined;
  useEffect(()=>{
    if(!moving)return;
    const xs=moving.points.map(point=>point.x),ys=moving.points.map(point=>point.y);
    const w=Math.min(WORLD_WIDTH,Math.max(600,Math.max(...xs)-Math.min(...xs)+220,(Math.max(...ys)-Math.min(...ys)+180)*WORLD_WIDTH/WORLD_HEIGHT));
    const h=w*WORLD_HEIGHT/WORLD_WIDTH;
    setCamera(boundCamera((Math.min(...xs)+Math.max(...xs)-w)/2,(Math.min(...ys)+Math.max(...ys)-h)/2,w,h));
  },[journey?.startedAt,journey?.path.join('/')]);
  const drag = useRef<{id:number;x:number;y:number;camera:typeof camera;scale:number;moved:boolean}|null>(null);
  const suppressClick = useRef(false);
  const focus = FANTASY_LOCATIONS.find((l) => l.id === selected && (known.includes(l.id)||frontier.includes(l.id)));
  const view = `${camera.x} ${camera.y} ${camera.w} ${camera.h}`;
  const zoomBy = (factor:number) => setCamera(current=>{const w=Math.max(450,Math.min(WORLD_WIDTH,current.w*factor));const h=w/WORLD_WIDTH*WORLD_HEIGHT;return boundCamera(current.x+current.w/2-w/2,current.y+current.h/2-h/2,w,h);});
  const mapText={ko:{label:'드래그하여 이동하고 목적지를 고르는 세계 지도',land:'육로',sea:'항로',gate:'전이문',all:'전체',focus:'선택 위치',in:'확대',out:'축소'},en:{label:'Drag the world map and choose a destination',land:'Road',sea:'Passage',gate:'Gate',all:'World',focus:'Selected',in:'Zoom in',out:'Zoom out'},ja:{label:'ドラッグして移動し目的地を選ぶ世界地図',land:'陸路',sea:'航路',gate:'転移門',all:'全体',focus:'選択地点',in:'拡大',out:'縮小'}}[locale];
  return (
    <div className="fr-map">
      <div className="fr-map-heading"><span>THE LONG JOURNEY</span><b>{title}</b></div>
      <svg viewBox={view} role="group" tabIndex={0} aria-label={mapText.label} className="fr-atlas"
        onPointerDown={e=>{if(e.button!==0)return;const rect=e.currentTarget.getBoundingClientRect();drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,camera,scale:Math.min(rect.width/camera.w,rect.height/camera.h)||1,moved:false};}}
        onPointerMove={e=>{const state=drag.current;if(!state||state.id!==e.pointerId)return;const dx=e.clientX-state.x,dy=e.clientY-state.y;if(!state.moved&&Math.hypot(dx,dy)<5)return;state.moved=true;suppressClick.current=true;e.currentTarget.setPointerCapture(e.pointerId);setCamera(boundCamera(state.camera.x-dx/state.scale,state.camera.y-dy/state.scale,state.camera.w,state.camera.h));}}
        onPointerUp={e=>{if(drag.current?.id===e.pointerId){if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);drag.current=null;setTimeout(()=>{suppressClick.current=false;},0);}}}
        onPointerCancel={()=>{drag.current=null;suppressClick.current=false;}}
        onClickCapture={e=>{if(suppressClick.current){e.preventDefault();e.stopPropagation();}}}
        onKeyDown={e=>{if(e.target!==e.currentTarget)return;const delta={ArrowLeft:[-70,0],ArrowRight:[70,0],ArrowUp:[0,-70],ArrowDown:[0,70]}[e.key];if(delta){e.preventDefault();setCamera(current=>boundCamera(current.x+delta[0],current.y+delta[1],current.w,current.h));}}}>
        <defs>
          <pattern id="fr-waves" width="35" height="26" patternUnits="userSpaceOnUse"><path d="M3 16q6-4 12 0t12 0" fill="none" stroke="#648a88" strokeWidth=".6" opacity=".24" /></pattern>
          <pattern id="fr-grain" width="7" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".5" fill="#6b624b" opacity=".13" /></pattern>
          <linearGradient id="fr-sea" x2="0" y2="1"><stop stopColor="#a9c1b6"/><stop offset="1" stopColor="#d3d4b8"/></linearGradient>
          <linearGradient id="fr-land" x2=".5" y2="1"><stop stopColor="#e0d5aa"/><stop offset=".6" stopColor="#c8c391"/><stop offset="1" stopColor="#d6c393"/></linearGradient>
          <clipPath id="fr-landclip"><path d={west}/><path d={east}/><path d={southWest}/><path d={southEast}/><path d={FANTASY_FRONTIER_COAST_PATH}/></clipPath>
          <filter id="fr-terrain-wash" filterUnits="userSpaceOnUse" x="0" y="0" width={WORLD_WIDTH} height={WORLD_HEIGHT} colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation="9"/></filter>
          <g id="fr-revealed-shape" fill="#000">
            <path d={knownAreaPath}/>
            {reveal.coasts.map((area,index)=><path key={`shore-${index}`} d={`${fogLine(area.points)}Z`} stroke="#000" strokeWidth="28" strokeLinejoin="round"/>)}
            <g clipPath="url(#fr-landclip)">
              {reveal.triangles.map((points,index)=><path key={`cell-${index}`} d={`${fogLine(points)}Z`}/>)}
              {reveal.connections.map((points,index)=><path key={`link-${index}`} d={fogLine(points)} fill="none" stroke="#000" strokeWidth="104" strokeLinecap="round"/>)}
            </g>
            {reveal.trails.map((points,index)=><path key={`trail-${index}`} d={fogLine(points)} fill="none" stroke="#000" strokeWidth="64" strokeLinecap="round"/>)}
          </g>
          <filter id="fr-fog-feather" filterUnits="userSpaceOnUse" x="0" y="0" width={WORLD_WIDTH} height={WORLD_HEIGHT} colorInterpolationFilters="sRGB"><feMorphology operator="dilate" radius="12"/><feGaussianBlur stdDeviation="14"/><feComponentTransfer><feFuncA type="linear" slope="1.06" intercept="-.06"/></feComponentTransfer></filter>
          <pattern id="fr-fog-grain" width="61" height="49" patternUnits="userSpaceOnUse"><path d="M0 25q20-12 40 0t25 0M-20 47q20-12 40 0t25 0" fill="none" stroke="#d7ddce" strokeWidth="3" opacity=".12"/></pattern>
          <mask id="fr-fog-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={WORLD_WIDTH} height={WORLD_HEIGHT} style={{maskType:'luminance'}}><rect width={WORLD_WIDTH} height={WORLD_HEIGHT} fill="#fff"/><use href="#fr-revealed-shape" filter="url(#fr-fog-feather)"/></mask>
        </defs>
        <rect width={WORLD_WIDTH} height={WORLD_HEIGHT} fill="url(#fr-sea)" />
        <rect width={WORLD_WIDTH} height={WORLD_HEIGHT} fill="url(#fr-waves)" />
        <g fill="none" stroke="#f2edd4" opacity=".42">{[west,east,southWest,southEast,FANTASY_FRONTIER_COAST_PATH,...(finalIsleKnown?[finalIsle]:[])].map((path,i)=><path key={i} d={path} strokeWidth="17"/>)}</g>
        <g fill="url(#fr-land)" stroke="#7e8765" strokeWidth="1.8"><path d={west}/><path d={east}/><path d={southWest}/><path d={southEast}/><path d={FANTASY_FRONTIER_COAST_PATH}/><path d="m838 604 45-20 40 32-5 51-48 23-41-35Z"/>
          <path d="m550 65 34 2 23 26-10 26-34 7-25-18Z"/><path d="m536 209 45-7 35 20 2 44-32 24-40-12-18-34Z"/>
          <path d="m554 372 38-9 32 31-7 40-34 21-35-24-9-27Z"/><path d="m544 493 32-14 30 24-3 42-32 12-32-30Z"/>
          {finalIsleKnown&&<path d={finalIsle}/>}
        </g>
        {finalIsleKnown&&<g fill="none" stroke="#789174" strokeWidth="2" opacity=".65"><path d="M1051 559q10-29 31-25t19 38q-15 14-31 5"/><path d="m1060 543 4-8 4 8m27 32 3-8 3 8"/></g>}
        <g clipPath="url(#fr-landclip)">
          <g filter="url(#fr-terrain-wash)">
            <path d="M62 94q190-80 398 20l-19 75-57 30-95-48-94 31-92-23Z" fill="#e9e4ce" opacity=".65"/>
            <path d="m105 227 81-49 101 42-4 70-91 38-81-18Zm218 128 82-33 61 35-29 106-69 17-43-63Z" fill="#86a16e" opacity=".37"/>
            <path d="m747 346 100-25 91 50-16 119-81 24-96-54Z" transform={noctisTransform} fill="#d4aa74" opacity=".62"/>
            <path d="M688 176q100 40 182 5" transform={noctisTransform} fill="none" stroke="#91a578" strokeWidth="34" opacity=".28"/>
          </g>
          <g fill="none" stroke="#8ca9a2" strokeWidth="3"><path d="M291 121q-27 62 10 113t-38 132q-36 48-9 104t-12 66"/><path d="M810 172q-41 86-23 144t-78 107" transform={noctisTransform}/></g>
          <g fill="#b1ad87" stroke="#817f65" strokeWidth=".9" opacity=".65">
            {[[330,150],[350,175],[365,143],[380,190],[394,163],[418,189],[339,199]].map(([x,y]) => <path key={`${x}-${y}`} d={`M${x-12} ${y+12}l12-28 14 28-14-7Z`}/>)}
            <g transform={noctisTransform}>{[[710,260],[731,285],[752,255],[773,281],[790,252],[809,279]].map(([x,y]) => <path key={`${x}-${y}`} d={`M${x-12} ${y+12}l12-28 14 28-14-7Z`}/>)}</g>
          </g>
          <g fill="#678367" stroke="#4e735a" strokeWidth=".7" opacity=".6">
            {[[134,245],[151,259],[174,243],[198,261],[219,244],[242,267],[161,287],[195,291],[226,288],[354,392],[374,411],[394,389],[410,420],[362,440]].map(([x,y]) => <path key={`${x}-${y}`} d={`M${x} ${y-10}l-6 12h4l-5 6h14l-5-6h4Z`}/>)}
            <g transform={noctisTransform}>{[[716,179],[737,194],[758,176],[781,194],[807,184],[834,198]].map(([x,y]) => <path key={`${x}-${y}`} d={`M${x} ${y-10}l-6 12h4l-5 6h14l-5-6h4Z`}/>)}</g>
          </g>
          <g filter="url(#fr-terrain-wash)">
            <path d="M110 810q160-120 400 20l-20 180-320 55Z" fill="#699477" opacity=".3"/>
            <path d="M1180 790q200-160 480 20l-90 220-300 20Z" fill="#d5a469" opacity=".45"/>
            <path d="M1960 490q150-45 255 150l-45 290-140 70-95-210Z" fill="#6f956c" opacity=".5"/>
            <path d="m2160 120 135 5 65 170-155 32-90-75Z" fill="#f0eee0" opacity=".85"/>
            <path d="m2340 520 180 15 20 210-150 80-60-115Z" fill="#d6ae70" opacity=".65"/>
            <path d="m2340 330 150 0 35 170-175 25Z" fill="#a18e7d" opacity=".55"/>
            <path d="m2110 840 155-20 65 140-125 90-100-100Z" fill="#789c90" opacity=".5"/>
          </g>
          <path d="M2240 280q-75 110-20 235t-20 205q-60 95-10 225" fill="none" stroke="#8ca9a2" strokeWidth="4"/>
          <g fill="#b1ad87" stroke="#817f65" strokeWidth=".9" opacity=".75">
            {[[2160,420],[2190,460],[2235,390],[2280,350],[2330,370],[2310,775],[2350,820],[2410,910],[2450,960]].map(([x,y]) => <path key={`frontier-rock-${x}-${y}`} d={`M${x-13} ${y+12}l13-31 15 31-15-8Z`}/>)}
            <path d="m2399 447 26-53 29 53-27-12Z" fill="#9f8b78"/><path d="m2418 411 8-17 9 17" fill="none" stroke="#a76d51" strokeWidth="3"/>
          </g>
          <g fill="#678367" stroke="#4e735a" strokeWidth=".7" opacity=".65">
            {[[2000,565],[2030,590],[2060,550],[2090,610],[2055,675],[2100,710],[2140,755],[2110,800],[2155,850]].map(([x,y]) => <path key={`frontier-tree-${x}-${y}`} d={`M${x} ${y-10}l-6 12h4l-5 6h14l-5-6h4Z`}/>)}
          </g>
          <rect width={WORLD_WIDTH} height={WORLD_HEIGHT} fill="url(#fr-grain)"/>
        </g>
        <g fill="#566857" className="fr-land-label"><text x="253" y="125">A U R E L I A</text><text x={FANTASY_NOCTIS_LABEL.x} y={FANTASY_NOCTIS_LABEL.y}>N O C T I S</text><text x="315" y="790">S Y L V A R A</text><text x="1415" y="755">K A Z A R A N</text><text x={FANTASY_FRONTIER_LABEL.x} y={FANTASY_FRONTIER_LABEL.y}>{FANTASY_FRONTIER_NAMES[locale]}</text></g>
        <g fill="#4e7779" className="fr-sea-label"><text x="554" y="345" transform="rotate(-90 554 345)">{{ko:'별 나 루 바 다',en:'S T A R C R O S S  S E A',ja:'星 渡 り の 海'}[locale]}</text><text x="277" y="584">{{ko:'서쪽 끝, 이름 모를 바다로',en:'Westward, into unnamed waters',ja:'西の果て、まだ名もなき海へ'}[locale]}</text></g>
        <g fill="none" strokeWidth="1.3" opacity=".65">
          {FANTASY_ROUTES.map((r) => {
            if ((r.from===FANTASY_FINAL_ISLE_ID||r.to===FANTASY_FINAL_ISLE_ID)&&!finalIsleKnown) return null;
            const a=FANTASY_LOCATIONS.find((l)=>l.id===r.from), b=FANTASY_LOCATIONS.find((l)=>l.id===r.to);
            return a && b ? <path key={`${r.from}-${r.to}-${r.mode}`} d={`M${a.x} ${a.y}L${b.x} ${b.y}`} stroke={r.mode==='land'?'#8d7956':r.mode==='sea'?'#547d86':'#9478a1'} strokeDasharray={r.mode==='land'?'4 4':r.mode==='sea'?'2 6':'1 7'}/> : null;
          })}
        </g>
        <g transform="translate(945 64)" className="fr-compass" fill="none" stroke="#5e705e"><circle r="25" strokeWidth=".7"/><path d="M0-33 6 0 0 33-6 0ZM-29 0H29"/><path d="M0-27 4 0H0Z" fill="#5e705e"/><text y="-39" fill="#5e705e" stroke="none" textAnchor="middle">N</text></g>
        <g mask="url(#fr-fog-mask)" pointerEvents="none"><rect width={WORLD_WIDTH} height={WORLD_HEIGHT} fill="#87968b" opacity=".96"/><rect width={WORLD_WIDTH} height={WORLD_HEIGHT} fill="url(#fr-fog-grain)"/></g>
        {FANTASY_LOCATIONS.filter((l)=>known.includes(l.id)||frontier.includes(l.id)).map((l) => (
          <g key={l.id} transform={`translate(${l.x} ${l.y})`} role="button" tabIndex={0} aria-label={nameOf(l)} aria-pressed={selected===l.id}
            className={`fr-map-node ${selected===l.id?'selected':''} ${current===l.id?'current':''}`} onClick={()=>onSelect(l.id)} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(l.id);}}}>
            <title>{nameOf(l)}</title>
            <circle r="21" className="fr-node-hit" />
            {current===l.id && <circle r="24" className="fr-current-ring"/>}
            <circle r="16" className="fr-node-bg" />
            <g className="fr-node-glyph">{known.includes(l.id)?<Glyph kind={l.kind}/>:<text y="5" textAnchor="middle" fill="#63785d" stroke="none" fontSize="16">?</text>}</g>
            {visited.includes(l.id) && current!==l.id && <circle cx="12" cy="-12" r="3" fill="#42684b" stroke="#f5edd5" strokeWidth="1.5"/>}
            {known.includes(l.id) && fantasyHasGate(l.id) && <g transform="translate(-15 -13)" aria-label={mapText.gate}><title>{mapText.gate}</title><circle r="6" fill="#f3e9f5" stroke="#9478a1"/><path d="M-2 3V-2a2 2 0 0 1 4 0V3M-3 3H3" fill="none" stroke="#725986" strokeWidth="1"/></g>}
            <text y="32" textAnchor="middle" className="fr-node-label">{known.includes(l.id)?nameOf(l):'?'}</text>
            {current===l.id && !moving && <text y="-31" textAnchor="middle" className="fr-you-label">{{ko:'현재 위치',en:'You are here',ja:'現在地'}[locale]}</text>}
          </g>
        ))}
        {moving&&<g pointerEvents="none" aria-label={{ko:'캐릭터 이동 경로',en:'Character travel route',ja:'人物の移動経路'}[locale]}>
          <polyline points={moving.points.map(point=>`${point.x},${point.y}`).join(' ')} fill="none" stroke="#694e24" strokeWidth="3" strokeDasharray="9 6" opacity=".7"/>
          <polyline points={moving.completed.map(point=>`${point.x},${point.y}`).join(' ')} fill="none" stroke="#e8bc60" strokeWidth="5"/>
          <g className="fr-traveler" transform={`translate(${moving.point.x} ${moving.point.y})`}><circle r="17" fill="#f8edcf" stroke="#74522a" strokeWidth="2"/><path d="M-6 8Q-6 0 0 0T6 8M0-9a4 4 0 1 0 0 8a4 4 0 1 0 0-8" fill="#5c6a43"/><text y="-24" textAnchor="middle" fill="#604b2e" fontSize="12">{journey?.name}</text></g>
        </g>}
        <rect x="12" y="12" width={WORLD_WIDTH-24} height={WORLD_HEIGHT-24} rx="3" fill="none" stroke="#697d68" strokeWidth=".8" opacity=".55" pointerEvents="none"/>
      </svg>
      <div className="fr-map-key"><span><i/>{mapText.land}</span><span><i className="sea"/>{mapText.sea}</span><span><i className="gate"/>{mapText.gate}</span></div>
      <div className="fr-map-controls"><button type="button" onClick={()=>zoomBy(.75)} aria-label={mapText.in}>＋</button><button type="button" onClick={()=>zoomBy(1.34)} aria-label={mapText.out}>−</button><button type="button" onClick={()=>setCamera({x:0,y:0,w:WORLD_WIDTH,h:WORLD_HEIGHT})}>{mapText.all}</button><button type="button" onClick={()=>focus&&setCamera(boundCamera(focus.x-400,focus.y-260,800,520))}>{mapText.focus}</button></div>
    </div>
  );
}
