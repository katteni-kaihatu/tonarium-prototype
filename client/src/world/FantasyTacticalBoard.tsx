import { FANTASY_LAST_DAWN_SKILL } from '../../../shared/fantasy-miracle-catalog.ts';
import { useEffect } from 'react';
import {fantasyCombatEnemy} from '../../../shared/fantasy-combat-catalog.ts';
import { fantasyCombatFieldDescription } from '../../../shared/fantasy-combat-fields.ts';
import type { FantasyCombatFighter, FantasyCombatSkill, FantasyCombatState } from '../../../shared/fantasy-combat.ts';
import { fantasyCombatSkillMovePath, fantasyCombatSkillMoveRange } from '../../../shared/fantasy-combat-movement.ts';
import { fantasyCombatMoveAttempt, type FantasyCombatMoveAttempt } from '../../../shared/fantasy-combat-move-attempt.ts';
import { fantasyCombatActors, fantasyCombatMoveRange, fantasyCombatPath, fantasyCombatTileKey, type FantasyCombatTile } from '../../../shared/fantasy-combat-tactics.ts';
import { fantasyObstacleKind, fantasyObstacleName } from '../../../shared/fantasy-obstacles.ts';
import type { NpcLocale } from '../../../shared/npc.ts';
import type { CSSProperties } from 'react';
import { FantasyCombatEffects } from './FantasyCombatEffects.tsx';
import { useFantasyCombatPresentation } from './fantasy-combat-presentation.ts';
import { fantasyNavalTile, fantasyNavalRole } from '../../../shared/fantasy-naval.ts';
import { FantasyNavalLegend, fantasyNavalRoleLabel, fantasyNavalTokenName } from './FantasyNavalGuide.tsx';

export function FantasyTacticalBoard({ battle, actor, locale, selected, selectedTargetId, attackTiles = [], landingTile, landingKind, movementSkill, moving, tileLimit, targetIds, onAnimatingChange, onTile, onTarget, onObstacle }: {
  battle: FantasyCombatState; actor?: FantasyCombatFighter; locale: NpcLocale; selected?: FantasyCombatTile; selectedTargetId?: string; moving: boolean; tileLimit?: number; targetIds?: readonly string[]; onAnimatingChange?: (active:boolean)=>void;
  attackTiles?: FantasyCombatTile[]; landingTile?: FantasyCombatTile; landingKind?: 'dash' | 'advance'; movementSkill?: FantasyCombatSkill; onTile: (tile: FantasyCombatTile) => void; onTarget: (id: string) => void; onObstacle?: (tile: FantasyCombatTile) => void;
}) {
  const presentation = useFantasyCombatPresentation(battle);
  useEffect(()=>{onAnimatingChange?.(presentation.playing);return()=>onAnimatingChange?.(false);},[presentation.playing,onAnimatingChange]);
  if (!battle.battlefield) return null;
  const field = battle.battlefield, actors = fantasyCombatActors(battle), text = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const cells = Array.from({ length: field.width * field.height }, (_, index) => ({ x: index % field.width, y: Math.floor(index / field.width) }));
  const affected = new Set(attackTiles.map(fantasyCombatTileKey));
  const charges = battle.status === 'active' ? actors.filter(fighter => fighter.side === 'enemies' && fighter.hp > 0 && !fighter.fled && fighter.enemyCharge && fighter.enemyCharge.resolvesRound >= battle.round) : [];
  const chargeLabel = (fighter: FantasyCombatFighter) => {
    const round = fighter.enemyCharge!.resolvesRound;
    return `${text('다음 행동 뒤', 'After your action', '次の行動後')} · ${text(`${round}라운드 발동`, `Releases in round ${round}`, `${round}ラウンドで発動`)} · ${fighter.names[locale]} · ${fighter.skills.find(skill => skill.id === fighter.enemyCharge!.skill)?.names[locale] ?? text('범위 공격', 'Area attack', '範囲攻撃')}`;
  };
  const danger = new Map<string, FantasyCombatFighter[]>();
  for (const fighter of charges) for (const tile of fighter.enemyCharge!.tiles) {
    const key = fantasyCombatTileKey(tile), existing = danger.get(key) ?? [];
    if (!existing.includes(fighter)) danger.set(key, [...existing, fighter]);
  }
  const moveLimit = tileLimit ?? (actor ? movementSkill ? fantasyCombatSkillMoveRange(actor, movementSkill) : fantasyCombatMoveRange(actor) : 0);
  const ordinaryMoving = moving && tileLimit === undefined && !movementSkill;
  const moveDescription = (attempt: FantasyCombatMoveAttempt) => `${text('거리 판정', 'Distance check', '距離判定')} · ${text('성공률', 'Success chance', '成功率')} ${Math.round(attempt.chance * 100)}%${attempt.extra ? ` · ${text('실패 시', 'On failure', '失敗時')} ${attempt.failureTile.x + 1},${attempt.failureTile.y + 1}` : ''}`;
  const selectedAttempt = ordinaryMoving && actor && selected ? fantasyCombatMoveAttempt(battle, actor, selected) : undefined;
  const movePreview = ordinaryMoving && selected ? `${text('이동 목적지', 'Destination', '移動先')} ${selected.x + 1},${selected.y + 1} · ${selectedAttempt ? moveDescription(selectedAttempt) : text('이동 불가', 'Unavailable', '移動不可')}` : '';
  const patient = (fighter: FantasyCombatFighter) => fighter.side === 'players' && fighter.hp <= 0 && !fighter.fled && (!!fighter.userId || fighter.companion?.kind === 'troop' || fighter.companion?.kind === 'syndicate');
  const carrierOf = (id: string) => actors.find(fighter => fighter.carrying === id);
  const visualTile = (fighter: FantasyCombatFighter) => {
    const carrier = carrierOf(fighter.id);
    return carrier ? presentation.positions[carrier.id] ?? carrier.tile : presentation.positions[fighter.id] ?? fighter.tile;
  };
  const sharesLivingTile = (fighter: FantasyCombatFighter) => {
    const position = visualTile(fighter);
    return !!position && actors.some(other => other.id !== fighter.id && other.hp > 0 && !other.fled && visualTile(other) && fantasyCombatTileKey(visualTile(other)!) === fantasyCombatTileKey(position));
  };
  const landingLabel = landingKind === 'advance' ? text('접근 후 위치', 'Approach landing', '接近後の位置') : text('관통 후 위치', 'Piercing dash landing', '貫通後の位置');
  const beat = presentation.beat;
  const replayText = beat?.visual === 'last-dawn' ? text('제게 남은 빛을, 저들에게 돌아갈 아침으로.', 'Let the light I have left become the morning that returns to them.', '私に残る光を、あの人たちに帰る朝へ。')
    : beat?.event.kind === 'prepare' ? beat.actor?.enemyCharge ? chargeLabel(beat.actor) : ''
    : beat?.ultimate ? `${text('직업 비전', 'Secret art', '職業奥義')} · ${beat.skill?.names[locale] ?? ''}`
      : beat?.visual === 'miracle' ? `${text('기적 발현', 'A miracle awakens', '奇跡の顕現')} · ${beat.skill?.names[locale] ?? beat.actor?.names[locale] ?? ''}`
        : presentation.playing ? text('전투 행동 재생 중', 'Replaying combat actions', '戦闘行動を再生中') : '';
  return <div className={`fr-tactical ${battle.naval ? 'fr-tactical-naval' : ''}`}>
    {battle.naval && <FantasyNavalLegend locale={locale}/>}
    <div className={`fr-tactical-cast-caption ${beat?'active':''}`} role="status" aria-live="polite"><span>{beat?.event.kind==='prepare'?text('준비','PREPARING','準備'):beat?.visual==='last-dawn'?text('기적','MIRACLE','奇跡'):beat?.ultimate?text('최종 기술','ULTIMATE','奥義'):beat?.visual==='miracle'?text('신성술','SACRED','聖術'):beat?text('기술','SKILL','技能'):''}</span><strong title={beat?.skill?.names[locale]??beat?.text[locale]}>{beat?.skill?.names[locale]??(beat?.event.skill==='miracle-last-dawn'?FANTASY_LAST_DAWN_SKILL.names[locale]:beat?.event.skill==='miracle-last-dawn-awakening'?text('마지막 새벽의 기도','Prayer of the Last Dawn','最後の夜明けの祈り'):beat?.text[locale]??'')}</strong><small>{beat?.actor?.names[locale]??''}</small></div>
    <div className="fr-tactical-scroll"><div className={`fr-tactical-stage ${presentation.playing ? 'replaying' : ''}`} style={{ '--fr-board-width': field.width, '--fr-board-height': field.height } as CSSProperties}><div className="fr-tactical-grid" role="group" aria-label={text('전술 지도', 'Tactical map', '戦術地図')} style={{ gridTemplateColumns: `repeat(${field.width}, minmax(${battle.naval ? 24 : 34}px, 1fr))` }}>{cells.map(tile => {
      const key = fantasyCombatTileKey(tile);
      const seaTile = battle.naval ? fantasyNavalTile(battle, tile) : undefined;
      const occupants = actors.filter(fighter => !fighter.fled && (fighter.hp > 0 || patient(fighter)) && fighter.tile && fantasyCombatTileKey(fighter.tile) === key);
      const targetOccupant = occupants.find(fighter => targetIds?.includes(fighter.id));
      const occupant = targetOccupant ?? occupants.find(fighter => fighter.hp > 0) ?? occupants[0];
      const wall = field.blocked.some(t => fantasyCombatTileKey(t) === key), cover = field.cover.some(t => fantasyCombatTileKey(t) === key);
      const obstacle = field.obstacles?.find(entry => fantasyCombatTileKey(entry.tile) === key), obstacleKind = obstacle && fantasyObstacleKind(obstacle.kind);
      const fields = battle.fields?.filter(entry => fantasyCombatTileKey(entry.tile) === key) ?? [];
      const fieldDetails = fields.map(entry => fantasyCombatFieldDescription(entry, battle.round, locale)).join(' · ');
      const attempt = ordinaryMoving && actor ? fantasyCombatMoveAttempt(battle, actor, tile) : undefined;
      const path = moving && actor ? movementSkill ? fantasyCombatSkillMovePath(battle, actor, movementSkill, tile) : tileLimit !== undefined ? fantasyCombatPath(battle, actor, tile) : undefined : undefined;
      const reachable = tileLimit !== undefined ? !!actor && fantasyCombatMoveRange(actor) > 0 && !!path && path.length > 1 && path.length - 1 <= moveLimit && !occupants.length && !wall && !obstacle : movementSkill ? !!path && path.length > 1 && path.length - 1 <= moveLimit : !!attempt;
      const dashAttempt = !!attempt?.extra;
      const exit = !!battle.escort && fantasyCombatTileKey(battle.escort.exit) === key;
      const navalRole = occupant && fantasyNavalRole(battle, occupant), seaName = seaTile === 'water' ? text('바다', 'Open water', '海上') : seaTile === 'deck' ? text('선박 갑판', 'Ship deck', '船の甲板') : '';
      const description = `${tile.x + 1},${tile.y + 1} · ${occupant?.names[locale] ?? (seaTile === 'water' ? seaName : wall ? text('벽', 'Wall', '壁') : exit ? text('호송 출구', 'Caravan exit', '護送出口') : obstacle ? fantasyObstacleName(obstacle.kind, locale) : cover ? text('엄폐', 'Cover', '遮蔽') : text('빈칸', 'Empty', '空きマス'))}${navalRole ? ` · ${fantasyNavalRoleLabel(navalRole, locale)}` : ''}${seaTile ? ` · ${seaName}` : ''}${reachable ? ` · ${text('이동 가능', 'Reachable', '移動可能')}` : ''}`;
      const damageNames = { fire: text('불', 'Fire', '火'), ice: text('냉기', 'Ice', '氷'), blunt: text('타격', 'Blunt', '打撃'), pierce: text('관통', 'Pierce', '貫通'), none: text('없음', 'None', 'なし') };
      const carryDetails = occupant?.carrying || occupant?.externalCarrying ? ` · ${text('부축 중', 'Carrying', '運搬中')}: ${actors.find(fighter => fighter.id === occupant.carrying)?.names[locale] ?? text('전투 밖의 부상자', 'Patient from outside combat', '戦場外の負傷者')}` : '';
      const details = occupant ? `${description} · HP ${occupant.hp}/${occupant.stats.hp} · MP ${occupant.mp}/${occupant.stats.mp} · ${text('공격', 'Attack', '攻撃')} ${occupant.stats.attack} · ${text('방어', 'Defense', '防御')} ${occupant.stats.defense} · ${text('마력 방호', 'Magic resistance', '魔力防護')} ${occupant.stats.magicResist} · ${occupant.range} · ${text('물리 피해','Physical damage','物理被害')} ×${(occupant.template?fantasyCombatEnemy(occupant.template)?.physicalMultiplier:1)??1} · ${text('마법 피해','Magic damage','魔法被害')} ×${(occupant.template?fantasyCombatEnemy(occupant.template)?.magicMultiplier:1)??1}${occupant.hp<=0?' · '+(occupant.miracles?.downedKind==='sacrifice'?text('빈사(실신)','Downed (fainted)','瀕死（失神）'):text('빈사','Downed','瀕死')):''}`
        : obstacle && obstacleKind ? `${description} · ${obstacleKind.breakable ? `HP ${obstacle.hp ?? obstacleKind.hp}/${obstacleKind.hp} · ${text('약점', 'Weakness', '弱点')} ${damageNames[obstacleKind.vulnerable]} ×2` : text('파괴 불가', 'Indestructible', '破壊不可')} · ${obstacleKind.id === 'hole' ? text('비행·대형 도약 판정', 'Flying or large: crossing check', '飛行・大型：越える判定') : obstacleKind.passage === 'block' ? text('이동 차단', 'Blocks movement', '移動を遮る') : text('소형·유연: 하단 통과, 대형·비행: 넘기 판정', 'Small/flexible: passage; large/flying: crossing check', '小柄・柔軟：下側通過、大型・飛行：越える判定')} · ${obstacleKind.blocksSight ? text('시야 차단', 'Blocks sight', '視線を遮る') : text('시야 통과', 'Sight passes', '視線が通る')}${obstacle.expiresRound ? ` · ${text('만료 라운드', 'Expires round', '失効ラウンド')} ${obstacle.expiresRound}` : ''}` : description;
      const targetable = !!occupant && (targetIds === undefined || targetIds.includes(occupant.id));
      const landing = !!landingTile && fantasyCombatTileKey(landingTile) === key;
      const warnings = danger.get(key) ?? [];
      const attackLabel = (affected.has(key) ? ` · ${text('공격 범위', 'Attack area', '攻撃範囲')}` : '') + (landing ? ` · ${landingLabel}` : '') + (attempt ? ` · ${moveDescription(attempt)}` : '') + warnings.map(fighter => ` · ${chargeLabel(fighter)}`).join('');
      return <button key={key} type="button" className={`fr-tactical-cell ${seaTile ? `naval-${seaTile}` : ''} ${seaTile === 'deck' && fantasyNavalTile(battle, { x: tile.x + 1, y: tile.y }) === 'water' ? 'naval-rail' : ''} ${wall ? 'wall' : ''} ${cover ? 'cover' : ''} ${exit ? 'escort-exit' : ''} ${reachable ? 'reachable' : ''} ${dashAttempt ? 'dash-attempt' : ''} ${!moving && targetable ? 'targetable' : ''} ${affected.has(key) ? 'attack-area' : ''} ${warnings.length ? 'enemy-danger' : ''} ${landing ? 'dash-landing' : ''} ${selected && fantasyCombatTileKey(selected) === key ? 'selected' : ''}`}
        title={`${details}${carryDetails}${fieldDetails ? ` · ${fieldDetails}` : ''}${attackLabel}`} aria-label={`${details}${carryDetails}${fieldDetails ? ` · ${fieldDetails}` : ''}${attackLabel}`} aria-pressed={!!selected && fantasyCombatTileKey(selected) === key}
        aria-disabled={presentation.playing || moving && !reachable || undefined} onClick={() => { if (presentation.playing) return; if (moving) { if (reachable) onTile(tile); } else if (occupant && targetable) onTarget(occupant.id); else if (obstacle) onObstacle?.(tile); }}>
        <b aria-hidden="true">{seaTile === 'water' ? '≈' : obstacle ? (obstacleKind?.breakable ? '✹' : '○') : wall ? '▰' : exit ? '⚑' : cover ? '▧' : '·'}</b>{warnings.length > 0 && <span className="fr-enemy-danger-marker" aria-hidden="true">!{warnings.length > 1 ? warnings.length : ''}</span>}{fields.length > 0 && <span className="fr-field-markers" aria-hidden="true">{fields.map(entry => <span key={entry.kind} className={`fr-field-marker ${entry.kind}`}>{{ fire: '♨', frost: '❄', poison: '☁', storm: 'ϟ' }[entry.kind]}{Math.max(0, entry.expiresRound - battle.round)}</span>)}</span>}
      </button>;
    })}</div>{battle.naval && <svg className="fr-naval-tethers" viewBox={`0 0 ${field.width} ${field.height}`} preserveAspectRatio="none" aria-hidden="true">{battle.naval.offshore.flatMap(core => {
      const from = presentation.positions[core.id];
      return from ? core.parts.filter(part => !part.severed && actors.some(actor => actor.id === part.id && actor.hp > 0 && !actor.fled)).map(part => {
        const to = presentation.positions[part.id];
        return to ? <path key={part.id} d={`M${from.x + .5} ${from.y + .5} Q${from.x + 1} ${to.y + .5} ${to.x + .5} ${to.y + .5}`}/> : null;
      }) : [];
    })}</svg>}<div className="fr-tactical-tokens" aria-hidden="true">{actors.filter(unit => !carrierOf(unit.id) && (!patient(unit) || !sharesLivingTile(unit)) && (!unit.fled || presentation.playing) && (unit.hp > 0 || !!unit.userId || patient(unit) || presentation.playing) && presentation.positions[unit.id]).map(unit => {
      const position = presentation.positions[unit.id], key = fantasyCombatTileKey(position);
      const role = fantasyNavalRole(battle, unit);
      return <div key={unit.id} className={`fr-tactical-token ${unit.side} ${role ? `naval-${role}` : ''} ${unit.companion ? 'companion' : ''} ${unit.id === battle.escort?.wagon.id ? 'escort-wagon' : ''} ${unit.id === actor?.id ? 'acting' : ''} ${unit.hp <= 0 ? 'down' : ''} ${unit.carrying || unit.externalCarrying ? 'carrying' : ''} ${selected && fantasyCombatTileKey(selected) === key ? 'selected' : ''} ${affected.has(key) ? 'attack-area' : ''}`} style={{ '--fr-token-x': position.x, '--fr-token-y': position.y } as CSSProperties}>{role && <small className="fr-naval-role">{role === 'body' ? text('본체', 'BODY', '本体') : role === 'appendage' ? text('약점', 'WEAK', '弱点') : text('침입', 'BOARDER', '侵入')}</small>}<b>{unit.id === battle.escort?.wagon.id ? '▣' : role ? fantasyNavalTokenName(unit, role, locale) : unit.names[locale].slice(0, 3)}</b><meter min={0} max={unit.stats.hp} value={unit.hp} />{unit.externalCarrying && <small className="fr-tactical-carry-mark">{text('부축 중', 'Carrying', '運搬中')}</small>}</div>;
    })}</div><div className="fr-tactical-patients">{actors.filter(patient).map(fighter => {
      const position = visualTile(fighter);
      if (!position) return null;
      const sameTilePatients = actors.filter(patient).filter(other => visualTile(other) && fantasyCombatTileKey(visualTile(other)!) === fantasyCombatTileKey(position));
      if (sameTilePatients[0]?.id !== fighter.id) return null;
      const eligible = sameTilePatients.filter(other => targetIds === undefined || targetIds.includes(other.id));
      const shown = sameTilePatients.find(other => other.id === selectedTargetId) ?? eligible[0] ?? fighter;
      const carrier = carrierOf(shown.id), targetable = !moving && !presentation.playing && eligible.length > 0;
      const next = eligible.length ? eligible[(eligible.findIndex(other => other.id === selectedTargetId) + 1) % eligible.length] : undefined;
      const label = `${sameTilePatients.map(other => other.names[locale]).join(', ')} · ${carrier ? `${text('부축 중', 'Carried by', '運搬中')} ${carrier.names[locale]}` : text('부상자', 'Downed patient', '負傷者')} · HP ${shown.hp}/${shown.stats.hp}${eligible.length > 1 ? ` · ${text('다시 누르면 다음 부상자 선택', 'Press again to select the next patient', 'もう一度押すと次の負傷者を選択')}` : ''}`;
      return <div key={fighter.id} className={`fr-tactical-patient-slot ${carrier ? 'carried' : ''}`} style={{ '--fr-token-x': position.x, '--fr-token-y': position.y } as CSSProperties}><button type="button" className="fr-tactical-patient" disabled={!targetable} title={label} aria-label={label} aria-pressed={sameTilePatients.some(other => other.id === selectedTargetId)} onClick={() => { if (next) onTarget(next.id); }}><span aria-hidden="true">{carrier ? '+' : '◇'} {shown.names[locale].slice(0, sameTilePatients.length > 1 ? 2 : 3)}{sameTilePatients.length > 1 ? ` +${sameTilePatients.length - 1}` : ''}</span></button></div>;
    })}</div><FantasyCombatEffects beat={presentation.beat} positions={presentation.positions} width={field.width} height={field.height} locale={locale} reducedMotion={presentation.reduced} /></div></div>
    <div className={`fr-tactical-replay-controls ${charges.length ? 'enemy-warning' : ''} ${movePreview ? 'move-preview' : ''}`}><span role="status" aria-live="polite" aria-atomic="true" tabIndex={charges.length || movePreview ? 0 : undefined} title={[movePreview, charges.map(chargeLabel).join(' / ')].filter(Boolean).join(' / ')}>{[movePreview, charges.length ? charges.map(chargeLabel).join(' / ') : replayText].filter(Boolean).join(' / ')}</span></div>
  </div>;
}
