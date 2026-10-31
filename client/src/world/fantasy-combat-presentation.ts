import { fantasyCombatSounds } from './fantasy-combat-sound.ts';
import { unlockEmoteAudio } from './sounds.ts';
import { fantasyCombatVisualDuration } from '../../../shared/fantasy-combat-visuals.ts';
import { fantasyCombatEnemy } from '../../../shared/fantasy-combat-catalog.ts';
import { useEffect, useRef, useState } from 'react';
import type { FantasyCombatFighter, FantasyCombatLog, FantasyCombatSkill, FantasyCombatState } from '../../../shared/fantasy-combat.ts';
import { fantasyCombatActors, fantasyCombatPath, fantasyCombatTileKey, type FantasyCombatTile } from '../../../shared/fantasy-combat-tactics.ts';
import { fantasyUltimateAnimation, fantasyUltimateCombatSkill, type FantasyUltimateAnimation } from '../../../shared/fantasy-ultimate-skills.ts';

export interface FantasyCombatPresentation {
  kind: 'move' | 'attack' | 'miracle' | 'prepare'; actor: string; target?: string;
  from?: FantasyCombatTile; to?: FantasyCombatTile; path?: FantasyCombatTile[]; tiles?: FantasyCombatTile[]; skill?: string; element?: string;
}
export type FantasyCombatVisualKind = 'charge' | 'slash' | 'thrust' | 'projectile' | 'impact' | 'fire' | 'frost' | 'storm' | 'poison' | 'alchemy' | 'miracle' | 'last-dawn' | 'ultimate' | 'water' | 'earth' | 'wind' | 'star';
export interface FantasyCombatBeat {
  id: string; event: FantasyCombatPresentation; text: FantasyCombatLog['text'];
  actor?: FantasyCombatFighter; skill?: FantasyCombatSkill; tier:number; visual: FantasyCombatVisualKind; ultimate?: FantasyUltimateAnimation; missed?: boolean;
}
type Positions = Record<string, FantasyCombatTile>;
const positionsOf = (battle: FantasyCombatState): Positions => Object.fromEntries(fantasyCombatActors(battle).filter(actor => actor.tile && !actor.fled && (actor.hp > 0 || !!actor.userId || actor.side === 'players' && (actor.companion?.kind === 'troop' || actor.companion?.kind === 'syndicate'))).map(actor => [actor.id, { ...actor.tile! }]));
const sameTile = (a?: FantasyCombatTile, b?: FantasyCombatTile) => !!a && !!b && fantasyCombatTileKey(a) === fantasyCombatTileKey(b);

export function fantasyCombatVisualKind(event: FantasyCombatPresentation, skill?: FantasyCombatSkill, actor?: FantasyCombatFighter): FantasyCombatVisualKind {
  if (event.kind === 'prepare') return 'charge';
  if (event.skill === 'miracle-last-dawn') return 'last-dawn';
  if (event.kind === 'miracle' || skill?.kind === 'miracle' || event.skill?.startsWith('miracle-')) return 'miracle';
  if (event.skill && fantasyUltimateAnimation(event.skill)) return 'ultimate';
  if (event.skill?.startsWith('alchemy-') || event.skill?.includes('alchemical') || /^item-.*(?:bomb|flask|tonic|oil|dust)/.test(event.skill ?? '')) return 'alchemy';
  const element = skill?.visualElement ?? event.element ?? skill?.field ?? skill?.damageType ?? skill?.onHit?.id;
  if (element === 'holy') return 'miracle';
  if(element==='water'||element==='earth'||element==='wind'||element==='star')return element;
  if (element === 'fire' || element === 'burn') return 'fire';
  if (element === 'ice' || element === 'frost') return 'frost';
  if (element === 'storm' || element === 'lightning') return 'storm';
  if (element === 'poison') return 'poison';
  if ((skill?.range ?? actor?.range) !== 'melee') return 'projectile';
  if (skill?.damageType === 'pierce' || actor?.attackDamageType === 'pierce') return 'thrust';
  if (skill?.damageType === 'blunt' || actor?.attackDamageType === 'blunt') return 'impact';
  return 'slash';
}

export function fantasyCombatEffectTier(event:FantasyCombatPresentation,skill?:FantasyCombatSkill,actor?:FantasyCombatFighter):number{
  if(event.skill==='miracle-last-dawn')return 6;
  if(event.skill?.startsWith('miracle-')||event.kind==='miracle')return 5;
  if(event.skill&&fantasyUltimateAnimation(event.skill))return 4;
  if(skill?.visualTier)return skill.visualTier;
  const grade=actor?.template?fantasyCombatEnemy(actor.template)?.tier??1:1;
  return grade>=7?4:grade>=4?3:grade>=2?2:1;
}

export function fantasyCombatPresentationBeats(battle: FantasyCombatState, before: FantasyCombatState, logs: readonly FantasyCombatLog[]): FantasyCombatBeat[] {
  const actors = fantasyCombatActors(battle), priorActors = fantasyCombatActors(before), areaCasts = new Set<string>();
  return logs.flatMap(entry => {
    const event = entry.presentation;
    if (!event || event.kind === 'move' && actors.some(carrier => carrier.carrying === event.actor)) return [];
    const actor = actors.find(actor => actor.id === event.actor) ?? priorActors.find(actor => actor.id === event.actor);
    if (event.kind === 'prepare' && (battle.status !== 'active' || !actor || actor.hp <= 0 || actor.fled || actor.enemyCharge?.skill !== event.skill)) return [];
    const skill = actor?.skills.find(skill => skill.id === event.skill) ?? (event.skill ? fantasyUltimateCombatSkill(event.skill) : undefined);
    if (event.kind === 'attack' && event.skill && actor?.side === 'enemies') {
      const key = `${entry.round}:${event.actor}:${event.skill}`;
      if (areaCasts.has(key)) return [];
      if (event.tiles?.length || skill?.radius || skill?.shape && skill.shape !== 'single') areaCasts.add(key);
    }
    const prior = priorActors.find(actor => actor.id === event.actor);
    const path = event.kind === 'move' && !event.path && event.to && prior ? fantasyCombatPath(before, { ...prior, tile: event.from ?? prior.tile }, event.to) : undefined;
    return [{ id: `${battle.id}-${entry.id}`, event: path ? { ...event, path } : event, text: entry.text, actor, skill, tier: fantasyCombatEffectTier(event, skill, actor), visual: fantasyCombatVisualKind(event, skill, actor), ultimate: event.skill ? fantasyUltimateAnimation(event.skill) : undefined, missed: event.kind === 'attack' && entry.roll?.success === false }];
  });
}

// 接続時の履歴は再生せず、以降に届いた確定イベントだけを描画する。
export function useFantasyCombatPresentation(battle: FantasyCombatState) {
  const [positions, setPositions] = useState<Positions>(() => positionsOf(battle));
  const [beat, setBeat] = useState<FantasyCombatBeat>();
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const previous = useRef<FantasyCombatState | undefined>(undefined);
  const cursor = useRef(0), queue = useRef<FantasyCombatBeat[]>([]), running = useRef(false);
  const latest = useRef(battle), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), generation = useRef(0);
  latest.current = battle;

  useEffect(() => {
    const unlock=()=>unlockEmoteAudio();
    const hide=()=>{if(document.visibilityState==='hidden')fantasyCombatSounds.stopAll();};
    document.addEventListener('pointerdown',unlock,{capture:true,passive:true});
    document.addEventListener('keydown',unlock,true);
    document.addEventListener('visibilitychange',hide);
    return ()=>{document.removeEventListener('pointerdown',unlock,true);document.removeEventListener('keydown',unlock,true);document.removeEventListener('visibilitychange',hide);fantasyCombatSounds.stopAll();};
  },[]);

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    const before = previous.current;
    previous.current = battle;
    if (!before || before.id !== battle.id) {
      generation.current++; clearTimeout(timer.current); running.current = false; queue.current = [];fantasyCombatSounds.stopAll();
      cursor.current = battle.logs.at(-1)?.id ?? 0;
      setPositions(positionsOf(battle)); setBeat(undefined); setPlaying(false);
      return;
    }
    const fresh = battle.logs.filter(entry => entry.id > cursor.current);
    cursor.current = Math.max(cursor.current, battle.logs.at(-1)?.id ?? 0);
    const actors = fantasyCombatActors(battle), priorActors = fantasyCombatActors(before);
    const incoming = fantasyCombatPresentationBeats(battle, before, fresh);
    if (reduced) {
      generation.current++; clearTimeout(timer.current); running.current = false; queue.current = [];
      setPositions(positionsOf(battle)); setPlaying(false);
      incoming.filter(beat=>beat.event.kind!=='move'&&beat.event.kind!=='prepare').slice(-6).forEach((beat,index)=>fantasyCombatSounds.play(beat,index*.12));
      const miracle = incoming.filter(beat => beat.visual === 'charge' || beat.visual === 'miracle' || beat.visual === 'last-dawn' || beat.visual === 'ultimate').at(-1);
      setBeat(miracle);
      if (miracle) timer.current = setTimeout(() => setBeat(undefined), 3200);
      return;
    }
    // 旧サーバーの戦闘でも、確定した移動だけは既存の経路探索で補間する。
    for (const actor of actors) {
      const prior = priorActors.find(entry => entry.id === actor.id);
      if (!actor.tile || !prior?.tile || actors.some(carrier => carrier.carrying === actor.id) || sameTile(actor.tile, prior.tile) || incoming.some(beat => beat.event.kind === 'move' && beat.event.actor === actor.id)) continue;
      const path = fantasyCombatPath(before, prior, actor.tile);
      incoming.push({ id: `${battle.id}-${battle.revision}-${actor.id}`, event: { kind: 'move', actor: actor.id, from: prior.tile, to: actor.tile, ...(path ? { path } : {}) }, actor, text: { ko: '', en: '', ja: '' }, tier:1, visual: 'impact' });
    }
    queue.current.push(...incoming);
    // 長い未受信区間を再生し続けて現在の戦場から離れないようにする。
    if (queue.current.length > 40) queue.current = queue.current.slice(-40);
    if (running.current) return;
    if (!queue.current.length) { setPositions(positionsOf(battle)); return; }
    running.current = true; setPlaying(true);
    const activeGeneration = generation.current;
    const schedule = (next: () => void, delay: number) => { timer.current = setTimeout(() => { if (activeGeneration === generation.current) next(); }, delay); };
    const next = () => {
      const current = queue.current.shift();
      if (!current) {
        running.current = false; setPlaying(false); setBeat(undefined); setPositions(positionsOf(latest.current)); return;
      }
      if (current.event.kind === 'move') {
        setBeat(undefined);
        const { actor, from, to } = current.event;
        const path = current.event.path?.length ? current.event.path : from && to ? [from, to] : to ? [to] : [];
        let index = 0;
        const step = () => {
          const tile = path[index++];
          if (!tile) { next(); return; }
          setPositions(value => ({ ...value, [actor]: tile }));
          schedule(index < path.length ? step : next, queue.current.length > 14 ? 75 : 135);
        };
        step();
      } else {
        if (current.event.kind !== 'prepare') fantasyCombatSounds.play(current);
        setBeat(current);
        schedule(next,current.ultimate?.durationMs??fantasyCombatVisualDuration(current.tier));
      }
    };
    next();
  }, [battle, reduced]);

  useEffect(() => () => { generation.current++; clearTimeout(timer.current); }, []);
  const charging = beat?.event.kind === 'prepare' ? battle.fighters.find(actor => actor.id === beat.event.actor) : undefined;
  const visibleBeat = beat?.event.kind === 'prepare' && (battle.status !== 'active' || !charging || charging.hp <= 0 || charging.fled || charging.enemyCharge?.skill !== beat.event.skill) ? undefined : beat;
  return { positions, beat: visibleBeat, playing, reduced };
}

export const fantasyCombatMiracleReadyClass = (skill?: FantasyCombatSkill, usable = false) => (skill?.kind === 'miracle' || skill?.id.startsWith('miracle-')) && usable ? 'fr-miracle-ready' : '';
