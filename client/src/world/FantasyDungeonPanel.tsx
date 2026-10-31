import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_DUNGEONS } from '../../../shared/fantasy-dungeon-catalog.ts';
import { fantasyDungeonActionError, fantasyDungeonCampError, fantasyDungeonErrorText, fantasyDungeonView, type FantasyDungeonAction } from '../../../shared/fantasy-dungeon.ts';
import { useLocale } from '../locale.ts';
import { useStore } from '../store.ts';
import { FantasyCampOptions } from './FantasyCampOptions.tsx';
import { FantasyInteriorMapSurvey } from './FantasyInteriorMaps.tsx';
import { ReasonButton } from './FantasyActionButton.tsx';
import { requestFantasyCombat } from './fantasy-combat-transport.ts';
import { requestFantasyParty } from './fantasy-party-transport.ts';
import './fantasy-dungeon.css';

export function requestDungeon(action:FantasyDungeonAction,onAction:(action:FantasyAction)=>void,grouped:boolean) {
  if(grouped&&['dungeonEnter','dungeonMove','dungeonInspect','dungeonExit'].includes(action.type))requestFantasyParty({type:'readyDungeon',action});
  else onAction(action);
}
export function FantasyDungeonEntrances({c,blocked,onAction}:{c:FantasyCharacter;blocked:boolean;onAction:(action:FantasyAction)=>void}) {
  const [locale]=useLocale(),profile=useStore(s=>s.fantasyProfile),party=useStore(s=>s.fantasyParty),selfId=useStore(s=>s.selfId);
  const sites=FANTASY_DUNGEONS.filter(site=>site.location===c.location&&(!site.id.startsWith('frontier-')||c.dungeon?.known?.includes(site.id))&&(!site.prerequisite||c.dungeon?.known?.includes(site.id)||!!c.inventory[`map-dungeon-${site.id}`]||FANTASY_DUNGEONS.find(parent=>parent.id===site.prerequisite)?.rooms.filter(room=>room.enemy?.boss).every(room=>c.dungeon?.sites[site.prerequisite!]?.cleared.includes(room.id))));
  if(c.dungeon?.active||!sites.length||!profile)return null;
  const grouped=!!party?.id,leader=!grouped||(party?.movementLeader?party.movementLeader===selfId:!!party?.members.find(member=>member.id===selfId)?.isLeader);
  return <section className="fr-dungeon-entrances"><h3>{{ko:'안쪽으로 이어지는 길',en:'Passages within',ja:'奥へ続く道'}[locale]}</h3>{sites.map(site=>{
    const action:FantasyDungeonAction={type:'dungeonEnter',site:site.id},sourceError=fantasyDungeonActionError(profile,action),error=sourceError?fantasyDungeonErrorText(sourceError,locale):undefined;
    return <article key={site.id}><b>{site.names[locale]}</b><p>{site.descriptions[locale]}</p><ReasonButton className="fr-btn" disabled={blocked||!!error||!leader} reason={!leader?{ko:'파티장이 입장을 제안합니다.',en:'The leader proposes entry.',ja:'入場はリーダーが提案します。'}[locale]:error} onClick={()=>requestDungeon(action,onAction,grouped)}>{{ko:grouped?'함께 입장 제안':'들어가기',en:grouped?'Propose entry':'Enter',ja:grouped?'一緒に入場を提案':'入る'}[locale]}</ReasonButton></article>;
  })}</section>;
}
export function FantasyDungeonActions({c,blocked,onAction}:{c:FantasyCharacter;blocked:boolean;onAction:(action:FantasyAction)=>void}) {
  const [locale]=useLocale(),view=fantasyDungeonView(c,locale),party=useStore(s=>s.fantasyParty),selfId=useStore(s=>s.selfId);
  if(!view)return null;
  const grouped=!!party?.id,leader=!grouped||(party?.movementLeader?party.movementLeader===selfId:!!party?.members.find(member=>member.id===selfId)?.isLeader);
  const say=(ko:string,en:string,ja:string)=>({ko,en,ja})[locale];
  const campError=fantasyDungeonCampError(c),campReason=campError?fantasyDungeonErrorText(campError,locale):undefined;
  const button=(label:string,action:FantasyDungeonAction,disabled=false)=>{
    const shared=['dungeonMove','dungeonInspect','dungeonExit'].includes(action.type);
    return <ReasonButton className="fr-btn" disabled={blocked||disabled||shared&&!leader} reason={shared&&!leader?say('파티장이 공동 탐사를 제안합니다.','The leader proposes group exploration.','共同探索はリーダーが提案します。'):undefined} onClick={()=>requestDungeon(action,onAction,grouped)}>{label}</ReasonButton>;
  };
  return <section className="fr-dungeon-actions"><small>{view.name}</small><h2>{view.roomName}</h2><p>{view.roomDescription}</p>
    <div className="fr-action-grid">{button(say('주변 조사','Inspect surroundings','周囲を調査'),{type:'dungeonInspect'},!view.canInspect)}
      {view.trap&&!view.trap.disarmed&&!view.trap.spent&&button(say('발견한 함정 해체','Disarm detected trap','発見した罠を解除'),{type:'dungeonDisarm'})}
      {view.trap&&<p>{view.trap.disarmed?say('함정을 해체했다.','The trap is disarmed.','罠は解除済み。'):view.trap.spent?say('작동을 마친 함정이다.','The trap has already sprung.','罠は作動済み。'):say('주의: 함정이 발견됐다.','Warning: a trap was found.','注意：罠を発見した。')}</p>}
      {view.combat&&<ReasonButton className="fr-btn primary" disabled={blocked||!leader} reason={say('파티장이 전투를 제안합니다.','The leader proposes the battle.','戦闘はリーダーが提案します。')} onClick={()=>requestFantasyCombat({type:'start',source:'dungeon',target:view.combat!.target})}>{view.combat.boss?say('수호자와 전투','Fight the guardian','守り手と戦う'):say('막아선 상대와 전투','Confront the enemy','敵と戦う')}</ReasonButton>}
      {view.canInteract&&button(say('흔적·유물 살펴보기','Examine traces and relics','痕跡・遺物を調べる'),{type:'dungeonInteract'})}
    </div>
    {view.special&&<div className="fr-dungeon-special"><h3>{say('신비한 선택','A mysterious choice','不思議な選択')}</h3>{view.special.claimed?<p>{say('이 방의 선택은 이미 끝났다.','You have already made your choice here.','この部屋での選択は終えた。')}</p>:<><p>{say('손을 대면 치유나 가호를 얻거나 저주에 걸릴 수 있다. 약초 한 개를 바치면 안전하게 응답을 받을 수 있다.','Touching may heal, bless or curse you. Offering one herb brings a safe response.','触れると回復や加護を得ることも、呪われることもある。薬草一つを供えれば安全な応答を得られる。')}</p><div className="fr-action-grid">{button(say('손대기','Touch','触れる'),{type:'dungeonChoose',choice:'touch'})}{button(say('약초 바치기','Offer an herb','薬草を供える'),{type:'dungeonChoose',choice:'offer'},!view.special.canOffer)}{button(say('지나치기','Leave it alone','立ち去る'),{type:'dungeonChoose',choice:'leave'})}</div></>}</div>}
    <div className="fr-dungeon-camp"><h3>{say('방의 안전','Room security','部屋の安全')}</h3><p>{campReason??say('이 방은 확보했다. 야영 중 습격에는 여전히 주의해야 한다.','This room is secured. An ambush is still possible while camping.','この部屋は確保できた。野営中の襲撃には引き続き注意しよう。')}</p><FantasyCampOptions c={c} blocked={blocked} onAction={onAction}/></div>
    <FantasyInteriorMapSurvey c={c} blocked={blocked} onAction={onAction}/>
    <h3>{say('통로','Passages','通路')}</h3><div className="fr-action-grid">{view.exits.map(exit=><span key={exit.id}>{button(exit.name,{type:'dungeonMove',room:exit.id})}</span>)}</div>
    {view.canExit?button(say('입구에서 밖으로 나가기','Leave through the entrance','入口から外へ出る'),{type:'dungeonExit'}):<p className="fr-muted">{say('밖으로 나가려면 입구로 돌아가야 한다.','Return to the entrance to leave.','外へ出るには入口へ戻ろう。')}</p>}
  </section>;
}
export function FantasyDungeonMap({c,blocked,onAction}:{c:FantasyCharacter;blocked:boolean;onAction:(action:FantasyAction)=>void}) {
  const [locale]=useLocale(),view=fantasyDungeonView(c,locale),party=useStore(s=>s.fantasyParty),selfId=useStore(s=>s.selfId);
  if(!view)return null;
  const maxX=Math.max(2,...view.rooms.map(room=>room.x)),maxY=Math.max(3,...view.rooms.map(room=>room.y));
  const x=(n:number)=>(n+1)*150,y=(n:number)=>(n+1)*110,grouped=!!party?.id,leader=!grouped||(party?.movementLeader?party.movementLeader===selfId:!!party?.members.find(member=>member.id===selfId)?.isLeader);
  return <div className="fr-dungeon-map"><h2>{view.name}</h2><svg viewBox={`0 0 ${(maxX+2)*150} ${(maxY+2)*110}`} role="img" aria-label={view.name}>
    {view.rooms.flatMap(room=>room.exits.filter(id=>id>room.id).map(id=>{const target=view.rooms.find(candidate=>candidate.id===id);return target?<line key={`${room.id}:${id}`} x1={x(room.x)} y1={y(room.y)} x2={x(target.x)} y2={y(target.y)}/>:null;}))}
    {view.rooms.map(room=>{const reachable=view.exits.some(exit=>exit.id===room.id),enabled=reachable&&!blocked&&leader;const move=()=>{if(enabled)requestDungeon({type:'dungeonMove',room:room.id},onAction,grouped);};return <g key={room.id} className={room.id===view.room?'current':reachable?'reachable':''} transform={`translate(${x(room.x)} ${y(room.y)})`} role={reachable?'button':undefined} tabIndex={enabled?0:undefined} aria-label={room.name} aria-disabled={reachable?!enabled:undefined} onClick={move} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();move();}}}><rect x="-60" y="-30" width="120" height="60" rx="10"/><text textAnchor="middle" y="5">{room.name}</text>{room.id===view.room&&<text className="fr-dungeon-you" textAnchor="middle" y="-43">{c.name} ▼</text>}</g>;})}
  </svg><div className="fr-dungeon-map-controls">{view.exits.map(exit=><ReasonButton key={exit.id} className="fr-btn" disabled={blocked||!leader} reason={{ko:'파티장이 이동을 제안합니다.',en:'The leader proposes movement.',ja:'移動はリーダーが提案します。'}[locale]} onClick={()=>requestDungeon({type:'dungeonMove',room:exit.id},onAction,grouped)}>{exit.name} →</ReasonButton>)}</div></div>;
}
