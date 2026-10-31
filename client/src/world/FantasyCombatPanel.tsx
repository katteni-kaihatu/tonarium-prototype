import { combatError } from './fantasy-combat-error.ts';
import { FantasyCombatContributionDetails } from './FantasyCombatContributionDetails.tsx';
import { FantasyLastDawnConfirmation } from './FantasyLastDawnConfirmation.tsx';
import { fantasyCombatMiracleReadyClass } from './fantasy-combat-presentation.ts';
import { createPortal } from 'react-dom';
import {FANTASY_SKILL_UTILITIES} from '../../../shared/fantasy-skill-variety.ts';
import { fantasyCombatFieldDescription } from '../../../shared/fantasy-combat-fields.ts';
import {fantasyCombatAttackPreview,fantasyCombatItemAttackPreview,fantasyCombatSkillSummary,fantasyCombatSkillBrief} from '../../../shared/fantasy-combat-preview.ts';
import { playDiceRoll } from './sounds.ts';
import { fantasyCombatRollUpdate, type FantasyCombatRollCursor } from './fantasy-combat-roll.ts';
import { requestFantasyParty } from './fantasy-party-transport.ts';
import { fantasyObstacleKind } from '../../../shared/fantasy-obstacles.ts';
import { useEffect, useRef, useState } from 'react';
import type { FantasyProfile } from '../../../shared/fantasy.ts';
import { FANTASY_ITEMS } from '../../../shared/fantasy-data.ts';
import { foodMeta } from '../../../shared/fantasy-life.ts';
import { fantasyCombatOrderError, fantasyCombatTelegraph, type FantasyCombatOrder, type FantasyCombatLog, type FantasyCombatUnitOrder } from '../../../shared/fantasy-combat.ts';
import { fantasyCombatActors, fantasyCombatMoveRange, type FantasyCombatTile } from '../../../shared/fantasy-combat-tactics.ts';
import { fantasyEscortAdvanceTile, fantasyEscortAtExit, fantasyEscortCanCommand } from '../../../shared/fantasy-escort-battle.ts';
import { FantasyTacticalBoard } from './FantasyTacticalBoard.tsx';
import { FantasyNavalEquipment, FantasyNavalGuide } from './FantasyNavalGuide.tsx';
import { fantasyNavalRole } from '../../../shared/fantasy-naval.ts';
import { fantasyCombatAttackTiles } from '../../../shared/fantasy-attack-shapes.ts';
import { fantasyCombatDashLanding, fantasyCombatSkillMoveRange } from '../../../shared/fantasy-combat-movement.ts';
import { FANTASY_APEX_PROVOCATIONS, fantasyCombatEnemy } from '../../../shared/fantasy-combat-catalog.ts';
import { fantasyCombatHuntOptions, fantasyCombatHumanOptions, fantasyCombatStartError, type FantasyCombatStartKind } from '../../../shared/fantasy-combat-challenges.ts';
import { fantasyMainStage } from '../../../shared/fantasy-main-trials.ts';
import { fantasyStoryCombatRequirement } from '../../../shared/fantasy-combat-stories.ts';
import { fantasyHostileEncounter } from '../../../shared/fantasy-encounters.ts';
import { set, useStore } from '../store.ts';
import { send } from '../net/ws.ts';
import { useLocale } from '../locale.ts';
import { requestFantasyCombat } from './fantasy-combat-transport.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { fantasyPartyErrorText } from '../../../shared/fantasy-party.ts';
import './fantasy-combat.css';


export function FantasyCombatMenu({ profile }: { profile: FantasyProfile }) {
  const [locale] = useLocale(), c = profile.character;
  const connected = useStore(s => s.wsConnected), pending = useStore(s => s.fantasyCombatPending || s.fantasyPending || s.fantasyPartyPending);
  const error = useStore(s => s.fantasyCombatError), party = useStore(s => s.fantasyParty);
  const combatPending = useStore(s => s.fantasyCombatPending), partyError = useStore(s => s.fantasyPartyError), selfId = useStore(s => s.selfId);
  const [kind, setKind] = useState<FantasyCombatStartKind>('hunt'), [target, setTarget] = useState(''), [confirmed, confirm] = useState(false);
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  useEffect(() => { if (!combatPending) return; const timer = setTimeout(() => set({ fantasyCombatPending: false, fantasyCombatError: 'unavailable' }), 10000); return () => clearTimeout(timer); }, [combatPending]);
  if (!c) return null;
  const story = c.quests.flatMap(quest => { const stage = fantasyMainStage(c, quest), value = stage && fantasyStoryCombatRequirement(c, quest, stage.id); return value && stage?.location === c.location ? [{ id: quest, name: stage.labels[locale], setup: value.setup[locale] }] : []; });
  const options = kind === 'hunt' ? fantasyCombatHuntOptions(c).map(enemy => ({ id: enemy.id, name: enemy.names[locale] }))
    : kind === 'challenge' ? fantasyCombatHumanOptions(c).map(enemy => ({ id: enemy.id, name: enemy.names[locale] }))
    : kind === 'apex' ? FANTASY_APEX_PROVOCATIONS.filter(value => value.location === c.location).map(value => ({ id: value.id, name: fantasyCombatEnemy(value.enemy)?.names[locale] ?? value.id }))
    : kind === 'story' ? story : profile.event && fantasyHostileEncounter(profile.event) ? [{ id: profile.event, name: say('눈앞의 위협', 'The immediate threat', '目の前の脅威') }] : [];
  const selected = options.some(value => value.id === target) ? target : options[0]?.id ?? '';
  const apex = kind === 'apex' ? FANTASY_APEX_PROVOCATIONS.find(value => value.id === selected) : undefined;
  const knownWarning = apex && c.apexWarnings?.[apex.id]?.location === c.location && c.hour - c.apexWarnings[apex.id].hour <= 1;
  const invalid = selected ? fantasyCombatStartError(profile, kind, selected, confirmed) : undefined;
  const blocked = pending || !connected || !!profile.combatId || !!profile.activity || !!profile.death;
  const reason = !connected ? say('서버 연결을 기다려 주세요.', 'Wait for connection.', '接続を待ってください。') : pending ? say('앞선 요청을 처리 중이에요.', 'A request is pending.', '依頼を処理中です。') : profile.combatId ? say('이미 전투 중이에요.', 'Already in combat.', 'すでに戦闘中です。') : profile.activity ? say('현재 활동을 마쳐 주세요.', 'Finish the current activity.', 'いまの行動を終えてください。') : profile.death ? say('새 삶을 시작해야 해요.', 'Begin a new life first.', '新しい人生を始めてください。')  : invalid ? combatError(invalid, locale) : undefined;
  return <section className="fr-combat-menu"><h2>{say('전투', 'Combat', '戦闘')}</h2>{error && <p role="alert" className="fr-error">{combatError(error, locale)}</p>}
    {partyError && <p role="alert" className="fr-error">{fantasyPartyErrorText(partyError, locale)}</p>}
    {party?.members.some(member => member.id === selfId && member.combatReady) && <p role="status">{say('전투 준비가 됐어요. 파티 메뉴에서 전원 준비 후 시작하세요.', 'Battle ready. Begin through Party once everyone is ready.', '戦闘準備完了。全員の準備後、パーティーメニューから始めてください。')}</p>}
    <section className="fr-combat-group"><h3>{say('마주할 상대','Encounter','相手')}</h3><div className="fr-combat-choice-grid">{(['hunt','story','encounter','challenge','apex'] as const).map(value=><button key={value} className="fr-btn" aria-pressed={kind===value} onClick={()=>{setKind(value);setTarget('');confirm(false);}}>{{hunt:say('주변 몬스터','Local monsters','周囲の魔物'),story:say('이야기의 전투','Story encounter','物語の戦い'),encounter:say('발생한 위협','Current threat','発生中の脅威'),challenge:say('사람과의 충돌','Human confrontation','人との衝突'),apex:say('금단의 도전','Forbidden challenge','禁じられた挑戦')}[value]}</button>)}</div></section><section className="fr-combat-group"><h3>{say('대상','Target','対象')}</h3><div className="fr-combat-choice-grid">{options.map(value=><button className="fr-btn" key={value.id} aria-pressed={selected===value.id} onClick={()=>{setTarget(value.id);confirm(false);}}>{value.name}</button>)}</div>{!options.length&&<p>{say('이곳에는 해당하는 상대가 없어요.','No matching encounter is available here.','ここには該当する相手がいません。')}</p>}</section>
    {kind === 'story' && selected && <p>{story.find(value => value.id === selected)?.setup}</p>}
    {apex && <><ReasonButton className="fr-btn" disabled={blocked} reason={reason} onClick={() => requestFantasyCombat({ type: 'inspect', target: apex.id })}>{say('위험한 흔적 살피기', 'Inspect the dangerous signs', '危険の兆しを調べる')}</ReasonButton>{knownWarning && <p className="fr-combat-danger">{apex.warning[locale]}</p>}</>}
    {(kind === 'challenge' || kind === 'apex' && knownWarning) && <label className="fr-combat-consent"><input type="checkbox" checked={confirmed} onChange={e => confirm(e.target.checked)}/>{apex ? apex.confirmation[locale] : say('사람을 먼저 공격할 경우의 위험과 책임을 알고 맞선다. 경비대·기사 공격은 범죄다.', 'Confront them knowing the risks and responsibility. Attacking guards or knights is a crime.', '先に攻撃する危険と責任を承知で対する。衛兵や騎士への攻撃は犯罪になる。')}</label>}
    <div className="fr-action-grid"><ReasonButton className="fr-btn primary" disabled={blocked || !selected || !!invalid || !!party?.id && !party.members.some(member => member.id === selfId && member.isLeader)} reason={party?.id && !party.members.some(member => member.id === selfId && member.isLeader) ? say('파티장만 전투를 제안할 수 있습니다.', 'Only the leader can propose a battle.', '戦闘を提案できるのはリーダーだけです。') : reason ?? say('대상을 선택하세요.', 'Choose a target.', '対象を選んでください。')} onClick={() => party?.id ? requestFantasyParty({ type: 'readyCombat', source: kind, target: selected, confirm: confirmed }) : requestFantasyCombat({ type: 'start', source: kind, target: selected, confirm: confirmed })}>{party?.id ? say('파티에 전투 제안', 'Propose battle to party', 'パーティーに戦闘を提案') : say('혼자 전투 시작', 'Begin solo', '一人で戦闘を始める')}</ReasonButton></div>
    <p className="fr-muted">{say('한 라운드의 입력 제한은 실제 1분이에요. 입력이 없으면 자동 방어하며, 전투는 계속돼요.', 'Each round allows one real minute to choose. Missing orders become automatic defense; combat continues.', '各ラウンドの入力期限は現実の1分です。未入力は自動防御となり、戦闘は続きます。')}</p>
  </section>;
}

export function FantasyCombatPanel({ profile, controlsHost }: { profile: FantasyProfile; controlsHost?: HTMLElement | null }) {
  const [locale] = useLocale(), battle = useStore(s => s.fantasyCombat), selfId = useStore(s => s.selfId), connected = useStore(s => s.wsConnected);
  const pending = useStore(s => s.fantasyCombatPending || s.fantasyPending), error = useStore(s => s.fantasyCombatError), clock = useStore(s => s.fantasyClock?.hour);
  const [mode, setMode] = useState('attack'), [selection, setSelection] = useState(''), [target, setTarget] = useState('');
  const [actorId, setActorId] = useState(''), [tile, setTile] = useState<FantasyCombatTile>(), [obstacle, setObstacle] = useState<FantasyCombatTile>();
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const [presenting,setPresenting]=useState(false);
  const [dawnConfirmation, setDawnConfirmation] = useState<{battle:string;revision:number;actor:string;order:FantasyCombatOrder}>();
  useEffect(() => { setDawnConfirmation(undefined); }, [battle?.id, battle?.revision, connected, profile.generation]);
  const rollCursor = useRef<FantasyCombatRollCursor | undefined>(undefined), [combatRoll, setCombatRoll] = useState<FantasyCombatLog>(), [rolling, setRolling] = useState(false);
  useEffect(() => {
    if (!battle) { rollCursor.current = undefined; setCombatRoll(undefined); return; }
    const update = fantasyCombatRollUpdate(rollCursor.current, battle), changedBattle = rollCursor.current?.battle !== battle.id;
    rollCursor.current = update.cursor;
    if (changedBattle) setCombatRoll(undefined);
    if (update.result) setCombatRoll(update.result);
  }, [battle?.id, battle?.revision, battle?.logs]);
  useEffect(() => {
    if (!combatRoll) { setRolling(false); return; }
    playDiceRoll(2500);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    setRolling(!reduced);
    const timer = setTimeout(() => setRolling(false), 2500);
    const finish = setTimeout(() => setCombatRoll(undefined), 5500);
    return () => { clearTimeout(timer); clearTimeout(finish); };
  }, [combatRoll?.id]);
  useEffect(() => { if (profile.combatId && connected) send({ t: 'fantasyCombatRequest', command: { type: 'sync' } }); }, [profile.combatId, connected]);
  useEffect(() => { if (!pending) return; const timer = setTimeout(() => set({ fantasyCombatPending: false, fantasyCombatError: 'unavailable' }), 10000); return () => clearTimeout(timer); }, [pending]);
  if (!battle) return profile.combatId ? <section className="fr-combat"><p>{say('전장을 불러오는 중…', 'Loading the battlefield…', '戦場を読み込み中…')}</p><button className="fr-btn" onClick={() => send({ t: 'fantasyCombatRequest', command: { type: 'sync' } })}>{say('다시 확인', 'Refresh', '再確認')}</button></section> : null;
  const own = battle.fighters.find(fighter => fighter.userId === selfId && fighter.generation === (profile.generation ?? 1));
  const controlled = [own, ...(battle.units ?? []).filter(unit => unit.companion?.ownerId === selfId && unit.companion.generation === (profile.generation ?? 1)), ...(fantasyEscortCanCommand(battle, selfId) ? [battle.escort!.wagon] : [])].filter((fighter): fighter is NonNullable<typeof fighter> => !!fighter && fighter.hp > 0 && !fighter.fled);
  const actor = controlled.find(fighter => fighter.id === actorId) ?? controlled[0], unit = !!actor?.companion, escorted = actor?.id === battle.escort?.wagon.id;
  const carrying = !!actor?.carrying || !!actor?.externalCarrying;
  const carriedPatient = actor?.carrying ? fantasyCombatActors(battle).find(fighter => fighter.id === actor.carrying) : undefined;
  const currentMode = escorted ? mode === 'guard' ? 'guard' : 'move' : unit && ['item', 'escape'].includes(mode) ? 'attack' : mode;
  const skills = actor?.skills ?? [], supplies = FANTASY_ITEMS.filter(item => !foodMeta(item.id) && item.category !== 'food' && (profile.character?.inventory[item.id] ?? 0) > 0 && (item.combatUse || !!item.use && (item.use.hp || item.use.mp || item.use.cure?.length)));
  const chosen = currentMode === 'skill' ? skills.find(skill => skill.id === selection) ?? skills[0] : undefined;
  const item = currentMode === 'item' ? supplies.find(item => item.id === selection) ?? supplies[0] : undefined;
  const itemSkill=item?.combatUse?{id:`item-${item.id}`,names:item.names??{ko:item.name,en:item.name,ja:item.name},range:'magic' as const,...item.combatUse,mp:0}:undefined;
  const effectiveSkill=chosen??itemSkill;
  const shipHarpoon = effectiveSkill?.id === 'naval-deck-harpoon';
  const freeMove = chosen?.motion?.kind === 'reposition';
  const allies = currentMode === 'item' ? !itemSkill || !['attack','hex'].includes(itemSkill.kind) : chosen && !['attack','hex'].includes(chosen.kind);
  const targets = fantasyCombatActors(battle).filter(fighter => (chosen?.kind==='miracle'?fighter.hp<=0&&!!fighter.userId&&!fighter.miracles?.dawnDebt&&fighter.miracles?.downedKind!=='sacrifice':fighter.hp>0) && !fighter.fled && fighter.side === (allies ? 'players' : 'enemies')&&(!effectiveSkill?.selfOnly||fighter.id===actor?.id)&&(!shipHarpoon||fantasyNavalRole(battle,fighter)==='body'));
  const selected = targets.some(fighter => fighter.id === target) ? target : effectiveSkill?.selfOnly ? actor?.id ?? '' : effectiveSkill?.battlefieldWide ? targets[0]?.id ?? '' : '';
  const activeObstacle = !shipHarpoon && ['attack', 'skill'].includes(currentMode) && obstacle && battle.battlefield?.obstacles?.some(entry => entry.tile.x === obstacle.x && entry.tile.y === obstacle.y) ? obstacle : undefined;
  const needsTarget = !freeMove && !activeObstacle && !effectiveSkill?.battlefieldWide && !['guard', 'escape', 'move'].includes(currentMode);
  const targetMissing = needsTarget && !selected;
  const baseOrder: FantasyCombatOrder = activeObstacle ? { type: 'break', tile: activeObstacle, ...(currentMode === 'skill' && chosen ? { skill: chosen.id } : {}) } : currentMode === 'guard' || currentMode === 'escape' ? { type: currentMode } : currentMode === 'move' ? battle.battlefield ? { type: 'moveTo', tile: tile ?? actor?.tile ?? { x: 0, y: 0 } } : { type: 'move', position: actor?.position === 'front' ? 'rear' : 'front' } : currentMode === 'skill' ? freeMove ? { type: 'skillMove', skill: chosen!.id, tile: tile ?? actor?.tile ?? { x: 0, y: 0 } } : { type: 'skill', skill: chosen?.id ?? '', target: selected } : currentMode === 'item' ? { type: 'item', item: item?.id ?? '', target: selected } : { type: 'attack', target: selected };
  const order: FantasyCombatOrder = escorted ? { type: 'escort', order: baseOrder as { type: 'guard' } | { type: 'moveTo'; tile: FantasyCombatTile } } : unit && !['item', 'escape', 'unit', 'escort', 'break'].includes(baseOrder.type) ? { type: 'unit', unit: actor!.id, order: baseOrder as FantasyCombatUnitOrder } : baseOrder;
  const stock = Object.fromEntries(supplies.map(item => [item.id, { count: profile.character!.inventory[item.id], names: item.names ?? { ko: item.name, en: item.name, ja: item.name }, ...(item.combatUse?{combat:{id:`item-${item.id}`,names:item.names??{ko:item.name,en:item.name,ja:item.name},range:'magic' as const,...item.combatUse,mp:0}}:{}), hp: item.use?.hp, mp: item.use?.mp, cleanse: item.use?.cure?.filter((effect): effect is 'poison' | 'burn' | 'frost' => ['poison', 'burn', 'frost'].includes(effect)) }]));
  const invalid = fantasyCombatOrderError(battle, selfId, order, { supplies: { [selfId]: stock } });
  const blocked = presenting || pending || !connected || !!profile.activity || !!profile.death || targetMissing || !!invalid;
  const reason = presenting ? say('전투 연출이 끝날 때까지 기다려 주세요.','Please wait until the combat animation finishes.','戦闘の演出が終わるまでお待ちください。') : !connected ? say('서버 연결을 기다려 주세요.', 'Wait for connection.', '接続を待ってください。') : pending ? say('행동을 확인 중이에요.', 'Confirming the order.', '行動を確認中です。') : profile.activity ? say('현재 활동을 마쳐 주세요.', 'Finish the current activity.', 'いまの行動を終えてください。') : profile.death ? say('이 인물의 삶은 끝났어요.', 'This character’s life has ended.', 'この人物の人生は終わりました。') : targetMissing ? say('전장에서 대상을 선택해 주세요.', 'Choose a target on the battlefield.', '戦場で対象を選んでください。') : invalid ? combatError(invalid, locale) : undefined;
  const seconds = Math.max(0, Math.ceil((battle.deadline - (clock ?? battle.hour)) * 120));
  const previewTarget=targets.find(fighter=>fighter.id===selected),hitPreview=actor&&previewTarget&&(currentMode==='attack'||effectiveSkill?.kind==='attack')&&!activeObstacle&&!shipHarpoon?itemSkill&&item?fantasyCombatItemAttackPreview(battle,selfId,item.id,previewTarget,{supplies:{[selfId]:stock}}):fantasyCombatAttackPreview(battle,actor,previewTarget,effectiveSkill):undefined;
  const attackTiles = actor && previewTarget?.tile && effectiveSkill?.kind === 'attack' && !activeObstacle && !shipHarpoon ? fantasyCombatAttackTiles(battle, actor, previewTarget.tile, effectiveSkill) : [];
  const landingTile = actor && previewTarget && chosen?.motion && chosen.motion.kind !== 'reposition' && !activeObstacle ? fantasyCombatDashLanding(battle, actor, previewTarget, chosen) : undefined;
  const selectingTile = currentMode === 'move' || freeMove;
  const moveRange = actor ? freeMove && chosen ? fantasyCombatSkillMoveRange(actor, chosen) : fantasyCombatMoveRange(actor) : 0;
  const submitted = (fighter: NonNullable<typeof actor>) => fighter.id === battle.escort?.wagon.id ? !!battle.escort.order : fighter.companion ? Object.hasOwn(battle.unitOrders ?? {}, fighter.id) : Object.hasOwn(battle.orders, selfId);
  const submitOrder = (nextOrder: FantasyCombatOrder) => {
    setCombatRoll(undefined);
    requestFantasyCombat({ type: 'order', combatId: battle.id, revision: battle.revision, order: nextOrder });
    const next = controlled.find(fighter => fighter.id !== actor?.id && !submitted(fighter));
    if (next) { setActorId(next.id); setObstacle(undefined); setMode('attack'); setSelection(''); setTarget(''); setTile(undefined); }
  };
  const controls = (battle.status === 'active' && own && own.hp > 0 && !own.fled && <div className={`fr-combat-orders ${battle.naval ? "naval" : ""}`}>{controlled.length > 1 && <label>{say('명령 대상', 'Command actor', '指示する仲間')}<select value={actor?.id ?? ''} onChange={e => { setActorId(e.target.value); setObstacle(undefined); setMode('attack'); setSelection(''); setTarget(''); setTile(undefined); }}>{controlled.map(fighter => <option key={fighter.id} value={fighter.id}>{fighter.names[locale]}{submitted(fighter) ? ' ✓' : ''}</option>)}</select></label>}<section className="fr-combat-group fr-combat-action-picker"><h3>{say('행동 선택','Choose action','行動を選択')}</h3><div className="fr-combat-choice-grid">{['attack','guard','skill','item','move','escape'].filter(value=>escorted?['guard','move'].includes(value):!unit||!['item','escape'].includes(value)).map(value=><button key={value} className="fr-btn" disabled={presenting} title={presenting?say('전투 연출 중입니다.','Combat is playing.','戦闘演出中です。'):undefined} aria-pressed={currentMode===value} onClick={()=>{setMode(value);if(!['attack','skill'].includes(value))setObstacle(undefined);setSelection('');setTarget('');setTile(undefined);}}>{{attack:say('공격','Attack','攻撃'),guard:say('방어','Defend','防御'),skill:say('기술','Skills','技能'),item:say('소모품','Items','消耗品'),move:say('이동','Move','移動'),escape:say('퇴각','Retreat','離脱')}[value]}</button>)}</div></section>
      <FantasyNavalEquipment battle={battle} actor={actor} locale={locale} blocked={presenting} selected={currentMode === 'skill' && chosen?.id === 'naval-deck-harpoon'} onSelect={id => { setMode('skill'); setSelection(id); setTarget(''); setTile(undefined); setObstacle(undefined); }}/>
      <FantasyNavalGuide battle={battle} locale={locale}/>
      <section className="fr-combat-guide" aria-label={say('전장 안내', 'Battlefield guide', '戦場案内')} aria-live="polite" aria-atomic="true">
        <p>{effectiveSkill?.battlefieldWide ? say('전장 전체에 적용됩니다. 대상을 따로 선택하지 않아도 됩니다.','Affects the entire battlefield. No individual target is needed.','戦場全体に作用します。個別の対象選択は不要です。') : selectingTile ? freeMove || escorted ? say(`이동할 칸을 선택하세요. 최대 ${moveRange}칸`, `Choose a destination. Up to ${moveRange} tiles`, `移動先を選んでください。最大${moveRange}マス`) : say(`${moveRange}칸까지 기본 이동. 황색 칸은 낮은 확률로 더 멀리 이동을 시도합니다.`, `${moveRange} tiles of normal movement. Amber tiles allow a low-chance attempt to go farther.`, `通常移動は${moveRange}マス。黄土色のマスは低確率でさらに遠くへの移動を試みます。`) : say('전장에서 대상을 선택하세요. ▰ 벽 · ▧ 엄폐', 'Choose a target on the field. ▰ Wall · ▧ Cover', '戦場で対象を選んでください。▰ 壁・▧ 遮蔽')}</p>
        {carrying && <p className="fr-guide-carry"><b>{say('부축 중', 'Carrying', '運搬中')}: {carriedPatient?.names[locale] ?? say('전투 밖의 부상자', 'Patient from outside combat', '戦場外の負傷者')}</b> · {say('이동 거리가 절반으로 줄고 돌진·도약 기술을 쓸 수 없어요.', 'Movement range is halved; movement skills are unavailable.', '移動距離が半分になり、移動技能は使えません。')}</p>}
        <p className="fr-guide-attack" style={{visibility:attackTiles.length ? 'visible' : 'hidden'}} aria-hidden={!attackTiles.length}>{say('금색 테두리: 공격 범위', 'Gold outline: attack area', '金色の枠：攻撃範囲')}</p>
        <p className="fr-guide-landing" style={{visibility:landingTile ? 'visible' : 'hidden'}} aria-hidden={!landingTile}>{chosen?.motion?.kind === 'advance' ? say('청록색 테두리: 접근 후 위치', 'Teal outline: approach landing', '青緑の枠：接近後の位置') : say('청록색 테두리: 관통 후 위치', 'Teal outline: piercing dash landing', '青緑の枠：貫通後の位置')}</p>
      </section>
      {activeObstacle && <p>{say('장애물 대상', 'Obstacle target', '障害物対象')}: {fantasyObstacleKind(battle.battlefield?.obstacles?.find(entry => entry.tile.x === activeObstacle.x && entry.tile.y === activeObstacle.y)?.kind ?? '')?.names[locale] ?? `${activeObstacle.x + 1},${activeObstacle.y + 1}`} · {say('공격 또는 공격 기술을 고르세요.', 'Choose Attack or an offensive Skill.', '攻撃か攻撃技能を選んでください。')} <button type="button" className="fr-btn" onClick={() => setObstacle(undefined)}>{say('선택 취소', 'Clear target', '選択解除')}</button></p>}
      {currentMode==='skill'&&skills.some(skill=>skill.id!=='naval-deck-harpoon')&&<section className="fr-combat-group"><h3>{say('배운 기술','Learned skills','習得技能')} · {chosen?.names[locale]}</h3><div className="fr-combat-choice-grid">{skills.filter(skill=>skill.id!=='naval-deck-harpoon').map(skill=><button className={`fr-btn ${skill.id==='miracle-last-dawn'?fantasyCombatMiracleReadyClass(skill,!presenting):''}`} disabled={presenting || carrying && !!skill.motion} key={skill.id} aria-pressed={chosen?.id===skill.id} title={presenting?say('전투 연출 중입니다.','Combat is playing.','戦闘演出中です。'):carrying && skill.motion ? say('부축 중에는 이동 기술을 쓸 수 없어요.', 'Movement skills are unavailable while carrying.', '運搬中は移動技能を使えません。') : fantasyCombatSkillSummary(skill,locale,actor)} onClick={()=>{setSelection(skill.id);setTarget('');setTile(undefined);setObstacle(undefined);}}><b>{skill.names[locale]}</b><small>{carrying && skill.motion ? say('부축 중에는 이동 기술을 쓸 수 없어요.', 'Movement skills are unavailable while carrying.', '運搬中は移動技能を使えません。') : fantasyCombatSkillBrief(skill,locale)}</small></button>)}</div></section>}
      {effectiveSkill&&<p className="fr-combat-skill-summary">{shipHarpoon ? say('본체를 선측으로 끌어당겨 잠시 근접 공격이 닿게 해요. 작살의 재사용 시간은 선원 모두가 공유해요.', 'Pull the body alongside so melee attacks can reach while the tether holds. The crew shares the harpoon cooldown.', '本体を船縁へ引き寄せ、繋ぎ留めている間は近接攻撃が届くようにします。銛の再使用待ちは乗員で共有します。') : fantasyCombatSkillSummary(effectiveSkill,locale,actor)}</p>}
      {currentMode === 'item' && <select aria-label={say('소모품', 'Consumable', '消耗品')} value={item?.id ?? ''} onChange={e => setSelection(e.target.value)}>{supplies.map(item => <option key={item.id} value={item.id}>{item.names?.[locale] ?? item.name} ×{profile.character!.inventory[item.id]}</option>)}</select>}
      {needsTarget && <p className="fr-combat-selected-target" role="status">{previewTarget ? <><b>{say('선택한 대상', 'Selected target', '選択した対象')}: {previewTarget.names[locale]}{previewTarget.id === actor?.id ? ` · ${say('자신', 'Self', '自分')}` : ''}</b><span>HP {previewTarget.hp}/{previewTarget.stats.hp} · MP {previewTarget.mp}/{previewTarget.stats.mp}</span></> : say('전장에서 대상을 눌러 선택하세요.', 'Click a target on the battlefield.', '戦場の対象を押して選んでください。')}</p>}

      {hitPreview&&<p className="fr-hit-preview" role="status">{hitPreview.chance!==undefined?say('명중률','Hit chance','命中率')+' '+Math.round(hitPreview.chance*100)+'%':combatError(hitPreview.error??'target',locale)}{hitPreview.distancePenalty? ' · '+say('거리 보정','Distance','距離補正')+' −'+hitPreview.distancePenalty:''}{hitPreview.focusBonus?' · '+say('조준 보정','Aim bonus','照準補正')+' +'+hitPreview.focusBonus:''}{hitPreview.situationalBonus?' · '+say('상황 보정','Situational bonus','状況補正')+' +'+hitPreview.situationalBonus:''}{hitPreview.statusPenalty?' · '+say('상태 보정','Status','状態補正')+' −'+hitPreview.statusPenalty:''}</p>}<ReasonButton className="fr-btn primary" disabled={blocked} reason={reason} onClick={() => {
        if (chosen?.id === 'miracle-last-dawn' && baseOrder.type === 'skill' && actor) {
          setDawnConfirmation({ battle: battle.id, revision: battle.revision, actor: actor.id, order: structuredClone(order) });
          return;
        }
        submitOrder(order);
      }}>{actor && submitted(actor) ? say('행동 확정됨', 'Order confirmed', '行動確定済み') : say('행동 확정', 'Confirm action', '行動を確定')}</ReasonButton>
      {escorted && <ReasonButton className="fr-btn" disabled={pending || !connected || !fantasyEscortAdvanceTile(battle) || !!battle.escort?.order} reason={reason ?? say('출구 방향의 길이 막혔거나 명령을 이미 내렸습니다.', 'The exit route is blocked or the order is already given.', '出口への道が塞がれているか、指示済みです。')} onClick={() => { const destination = fantasyEscortAdvanceTile(battle); if (destination) { setCombatRoll(undefined); requestFantasyCombat({ type: 'order', combatId: battle.id, revision: battle.revision, order: { type: 'escort', order: { type: 'moveTo', tile: destination } } }); } }}>{say('출구 방향으로 전진', 'Advance toward the exit', '出口へ進む')}</ReasonButton>}
    </div>);
  const deathConfirmation = dawnConfirmation && dawnConfirmation.battle === battle.id && dawnConfirmation.revision === battle.revision && dawnConfirmation.actor === actor?.id && battle.status === 'active' && <FantasyLastDawnConfirmation locale={locale} onCancel={() => setDawnConfirmation(undefined)} onConfirm={() => {
    const requested = dawnConfirmation;
    setDawnConfirmation(undefined);
    if (presenting || pending || !connected || profile.death || profile.activity || requested.battle !== battle.id || requested.revision !== battle.revision || requested.actor !== actor?.id || fantasyCombatOrderError(battle, selfId, requested.order, { supplies: { [selfId]: stock } })) return;
    submitOrder(requested.order);
  }}/>;
  return <section className="fr-combat" aria-label={say('전장', 'Battlefield', '戦場')}>{deathConfirmation}<header><h2>{say('전투', 'Combat', '戦闘')} · {say('라운드', 'Round', 'ラウンド')} {battle.round}</h2>{battle.status === 'active' && <span>{seconds}s · {Object.keys(battle.orders).length + Object.keys(battle.unitOrders ?? {}).length + (battle.escort?.order ? 1 : 0)}/{fantasyCombatActors(battle).filter(f => f.side === 'players' && f.hp > 0 && !f.fled).length}</span>}</header>
    <FantasyTacticalBoard onAnimatingChange={setPresenting} battle={battle} actor={actor} locale={locale} selected={effectiveSkill?.battlefieldWide?undefined:activeObstacle ?? tile ?? previewTarget?.tile} selectedTargetId={effectiveSkill?.battlefieldWide?undefined:selected || undefined} attackTiles={attackTiles} landingTile={landingTile} landingKind={chosen?.motion?.kind === 'advance' ? 'advance' : 'dash'} movementSkill={freeMove ? chosen : undefined} moving={selectingTile} tileLimit={escorted ? moveRange : undefined} onTile={tile => { setTile(tile); setObstacle(undefined); }} targetIds={needsTarget ? targets.map(fighter => fighter.id) : []} onTarget={id => { if (targets.some(fighter => fighter.id === id)) { setTarget(id); setObstacle(undefined); setTile(undefined); } }} onObstacle={tile => { if (!unit && !escorted && !effectiveSkill?.battlefieldWide && !shipHarpoon) { setObstacle(tile); setTile(undefined); if (!['attack', 'skill'].includes(currentMode)) setMode('attack'); } }} />
    {error && <p role="alert" className="fr-error">{combatError(error, locale)}</p>}
    {combatRoll?.roll && <div className={`fr-dice-card ${rolling ? 'rolling' : combatRoll.roll.success ? 'success' : 'failure'}`} role="status" aria-live="polite" style={{ minHeight: 0, minWidth: 0, maxWidth: '100%', padding: 12, marginBlock: 12 }}>
      <small>{combatRoll.text[locale]}</small><div className="fr-dice-pool" style={{ margin: '10px 0' }}><div className="fr-die kept"><span>{combatRoll.roll.value}</span></div></div>
      <p>{rolling ? say('D20 판정 중…', 'Rolling D20…', 'D20判定中…') : `D20 ${combatRoll.roll.value} / ${say('목표', 'Target', '目標')} ${combatRoll.roll.target} · ${combatRoll.roll.success ? say('성공', 'Success', '成功') : say('실패', 'Failure', '失敗')}`}</p>
    </div>}
    {battle.escort && <div className="fr-escort-objective"><b>{say('호송 수레 보호', 'Protect the caravan wagon', '護送馬車を守る')}</b><span>HP {battle.escort.wagon.hp}/{battle.escort.wagon.stats.hp} · {fantasyEscortAtExit(battle) ? say('출구 도착', 'Exit reached', '出口に到達') : say('출구', 'Exit', '出口') + ` ${battle.escort.exit.x + 1},${battle.escort.exit.y + 1}`}</span>{battle.status === 'active' && <small>{say('수레를 지키며 출구까지 이동하고 습격자를 물리치세요.', 'Keep the wagon safe, reach the exit, and defeat the attackers.', '馬車を守りながら出口へ進め、襲撃者を倒してください。')}</small>}</div>}
    {!!battle.fields?.length && <section className="fr-combat-group fr-field-legend"><h3>{say('특수 바닥 · 아군과 적 모두 영향', 'Special ground · affects allies and enemies', '特殊な床・敵味方に影響')}</h3>{battle.fields.filter((field, index, all) => all.findIndex(other => other.kind === field.kind && other.expiresRound === field.expiresRound && other.power === field.power) === index).map(field => <p key={`${field.kind}:${field.expiresRound}:${field.power}`}>{fantasyCombatFieldDescription(field, battle.round, locale)}</p>)}</section>}
    <div className="fr-combat-roster">{(['enemies', 'players'] as const).map(side => <div key={side} className={`fr-combat-side ${side}`}>{fantasyCombatActors(battle).filter(f => f.side === side).map(fighter => <article key={fighter.id} className={`${fighter.hp <= 0 || fighter.fled ? 'down' : ''} ${fighter.id === actor?.id ? 'self' : ''}`}><b>{fighter.names[locale]}{fighter.companion && ` · ${say('동료', 'Companion', '仲間')}`}</b><small>{fighter.position === 'front' ? say('전열', 'Front', '前列') : say('후열', 'Rear', '後列')}{fighter.hp<=0&&fighter.userId&&` · ${fighter.miracles?.downedKind==='sacrifice'?say('빈사(실신)','Downed (fainted)','瀕死（失神）'):say('빈사','Downed','瀕死')}`}{fighter.fled && ` · ${say('퇴각', 'Retreated', '離脱')}`}</small><meter min={0} max={fighter.stats.hp} value={fighter.hp}/><span>HP {fighter.hp}/{fighter.stats.hp}{side === 'players' && ` · MP ${fighter.mp}/${fighter.stats.mp}`}</span>{fighter.effects.length > 0 && <small>{fighter.effects.map(effect => ({ poison: say('중독', 'Poison', '毒'), burn: say('화상', 'Burn', '火傷'), frost: say('냉기', 'Frost', '凍傷') }[effect.id])).join(' · ')}</small>}{fighter.miracles?.afflictions?.length?<small>{fighter.miracles.afflictions.map(id=>({curse:say('강한 저주 · 받는 피해 증가','Profound curse · increased damage taken','強い呪い・被ダメージ増加'),possession:say('빙의 · 주는 피해 감소','Possession · reduced damage dealt','憑依・与ダメージ低下'),'soul-binding':say('영혼 속박 · 도주 불가','Soul binding · escape blocked','魂の束縛・逃走不可')})[id]).join(' · ')}</small>:null}{fighter.conditions?.length? <small>{fighter.conditions.map(condition=>(FANTASY_SKILL_UTILITIES.find(entry=>entry.id===condition.id)?.names[locale]??condition.id)+' '+condition.turns).join(' · ')}</small>:null}{side === 'enemies' && fighter.hp > 0 && battle.status === 'active' && <p className="fr-combat-telegraph">{fantasyCombatTelegraph(fighter, battle.round, locale)}</p>}</article>)}</div>)}</div>
    {controlsHost ? createPortal(controls, controlsHost) : controls}
    {battle.status !== 'active' && <div className="fr-combat-result"><h3>{{ victory: say('승리', 'Victory', '勝利'), defeat: say('패배', 'Defeat', '敗北'), escaped: say('퇴각', 'Retreated', '離脱') }[battle.status]}</h3><p>{say('보상과 생존 결과는 각자의 기록에서 확인할 수 있어요.', 'Check your own journal for rewards and survival outcomes.', '報酬と生存結果は各自の手記で確認できます。')}</p><FantasyCombatContributionDetails battle={battle} locale={locale}/><button className="fr-btn" onClick={() => set({ fantasyCombat: null, fantasyCombatError: null })}>{profile.death?say('남긴 발자취 보기','View this life’s legacy','残した足跡を見る'):say('여정으로 돌아가기', 'Return to the journey', '旅に戻る')}</button></div>}
    <section className="fr-combat-log"><h3>{say('전투 기록', 'Combat log', '戦闘記録')}</h3>{battle.logs.slice(-12).map(entry => <p key={entry.id}>{entry.roll && <span className="fr-combat-die" style={{ animation: 'none' }} key={`${battle.id}-${entry.id}`}>D20 · {entry.roll.value}</span>}{entry.text[locale]}</p>)}</section>
  </section>;
}
