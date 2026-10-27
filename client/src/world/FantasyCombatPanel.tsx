import { useEffect, useState } from 'react';
import type { FantasyProfile } from '../../../shared/fantasy.ts';
import { FANTASY_ITEMS } from '../../../shared/fantasy-data.ts';
import { foodMeta } from '../../../shared/fantasy-life.ts';
import { fantasyCombatErrorText, fantasyCombatOrderError, fantasyCombatTelegraph, type FantasyCombatError, type FantasyCombatOrder } from '../../../shared/fantasy-combat.ts';
import { fantasyCombatActors, type FantasyCombatTile } from '../../../shared/fantasy-combat-tactics.ts';
import { fantasyEscortAdvanceTile, fantasyEscortAtExit, fantasyEscortCanCommand } from '../../../shared/fantasy-escort-battle.ts';
import { FantasyTacticalBoard } from './FantasyTacticalBoard.tsx';
import { FANTASY_APEX_PROVOCATIONS, fantasyCombatEnemy } from '../../../shared/fantasy-combat-catalog.ts';
import { fantasyCombatHuntOptions, fantasyCombatHumanOptions, fantasyCombatStartError, type FantasyCombatStartKind } from '../../../shared/fantasy-combat-challenges.ts';
import { fantasyMainStage } from '../../../shared/fantasy-main-trials.ts';
import { fantasyStoryCombatRequirement } from '../../../shared/fantasy-combat-stories.ts';
import { fantasyHostileEncounter } from '../../../shared/fantasy-encounters.ts';
import { get, set, useStore } from '../store.ts';
import { send } from '../net/ws.ts';
import { useLocale } from '../locale.ts';
import type { NpcLocale } from '../../../shared/npc.ts';
import { requestFantasyCombat } from './fantasy-combat-transport.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { fantasyPartyErrorText } from '../../../shared/fantasy-party.ts';
import { fantasyErrorText } from './fantasy-copy.ts';
import './fantasy-combat.css';

const ERROR_CODES = ['invalid', 'stale', 'not-active', 'not-owner', 'already-ordered', 'down', 'target', 'range', 'mana', 'item', 'unnecessary'];
export function combatError(text: string, locale: NpcLocale) {
  if (ERROR_CODES.includes(text)) return fantasyCombatErrorText(text as FantasyCombatError, locale);
  const words: Record<string, [string, string]> = {
    unavailable: ['지금 전투 요청을 처리할 수 없어요. 다시 확인해 주세요.', 'Combat is unavailable. Refresh and try again.'],
    busy: ['현재 행동이나 전투를 먼저 마쳐 주세요.', 'Finish the current activity or combat first.'],
    'save-failed': ['저장에 실패해 행동이 확정되지 않았어요. 다시 시도해 주세요.', 'Saving failed; the action was not committed. Try again.'],
    'not-in-world': ['같은 판타지 세계에 참가해야 해요.', 'Join the same fantasy session first.'],
    'not-ready': ['파티원 모두 같은 전투에 준비해야 해요.', 'All party members must ready for the same battle.'],
    '生きている人物で戦闘に参加してください。': ['살아 있는 인물로 참가하세요.', 'A living character is required.'],
    'すでに戦闘中です。': ['이미 전투 중이에요.', 'You are already in combat.'],
    '現在の行動や出来事を先に終えてください。': ['현재 활동이나 사건을 먼저 마쳐 주세요.', 'Finish the current activity or encounter first.'],
    'ここではその相手と戦えません。': ['이곳에서 싸울 수 있는 상대가 아니에요.', 'That opponent is unavailable here.'],
    '危険を確認してから挑んでください。': ['위험을 확인한 뒤 도전해 주세요.', 'Confirm the danger before challenging.'],
    'この場所で危険の兆しを先に調べてください。': ['이곳의 위험한 흔적부터 살펴보세요.', 'Inspect the dangerous signs here first.'],
    'この強敵はまだ再戦に応じません。': ['아직 다시 도전할 수 없어요. 처치 후 게임 하루가 필요해요.', 'Wait one game day after a victory before challenging again.'],
    '戦闘を終えるか離脱してから行動してください。': ['전투를 끝내거나 퇴각한 뒤 행동할 수 있어요.', 'Finish combat or retreat before taking another activity.'],
  };
  if (locale === 'ja') return ({unavailable:'いまは戦闘を処理できません。再確認してください。',busy:'いまの行動や戦闘を先に終えてください。','save-failed':'保存に失敗し、行動は確定していません。もう一度お試しください。','not-in-world':'同じファンタジー世界に参加してください。','not-ready':'全員が同じ戦闘に準備してください。'} as Record<string,string>)[text]??text;
  if (words[text]) return words[text][locale === 'ko' ? 0 : 1];
  const translated = fantasyErrorText(text, locale);
  return /[ぁ-んァ-ン]/.test(translated) ? { ko: '전투 조건이 바뀌었어요. 현재 상태를 다시 확인해 주세요.', en: 'Combat conditions changed. Check the current state.' }[locale] : translated;
}

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
  const reason = !connected ? say('서버 연결을 기다려 주세요.', 'Wait for connection.', '接続を待ってください。') : pending ? say('앞선 요청을 처리 중이에요.', 'A request is pending.', '依頼を処理中です。') : profile.combatId ? say('이미 전투 중이에요.', 'Already in combat.', 'すでに戦闘中です。') : profile.activity ? say('현재 활동을 마쳐 주세요.', 'Finish the current activity.', 'いまの行動を終えてください。') : profile.death ? say('새 삶을 시작해야 해요.', 'Begin a new life first.', '新しい人生を始めてください。') : invalid ? combatError(invalid, locale) : undefined;
  return <section className="fr-combat-menu"><h2>{say('전투', 'Combat', '戦闘')}</h2>{error && <p role="alert" className="fr-error">{combatError(error, locale)}</p>}
    {partyError && <p role="alert" className="fr-error">{fantasyPartyErrorText(partyError, locale)}</p>}
    {party?.members.some(member => member.id === selfId && member.combatReady) && <p role="status">{say('전투 준비가 됐어요. 파티 메뉴에서 전원 준비 후 시작하세요.', 'Battle ready. Begin through Party once everyone is ready.', '戦闘準備完了。全員の準備後、パーティーメニューから始めてください。')}</p>}
    <label>{say('마주할 상대', 'Encounter', '相手')}<select value={kind} onChange={e => { setKind(e.target.value as FantasyCombatStartKind); setTarget(''); confirm(false); }}>{(['hunt', 'story', 'encounter', 'challenge', 'apex'] as const).map(value => <option key={value} value={value}>{{ hunt: say('주변 몬스터', 'Local monsters', '周囲の魔物'), story: say('이야기의 전투', 'Story encounter', '物語の戦い'), encounter: say('발생한 위협', 'Current threat', '発生中の脅威'), challenge: say('사람과의 충돌', 'Human confrontation', '人との衝突'), apex: say('금단의 도전', 'Forbidden challenge', '禁じられた挑戦') }[value]}</option>)}</select></label>
    {options.length ? <label>{say('대상', 'Target', '対象')}<select value={selected} onChange={e => { setTarget(e.target.value); confirm(false); }}>{options.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label> : <p>{say('이곳에는 해당하는 상대가 없어요.', 'No matching encounter is available here.', 'ここには該当する相手がいません。')}</p>}
    {kind === 'story' && selected && <p>{story.find(value => value.id === selected)?.setup}</p>}
    {apex && <><ReasonButton className="fr-btn" disabled={blocked} reason={reason} onClick={() => requestFantasyCombat({ type: 'inspect', target: apex.id })}>{say('위험한 흔적 살피기', 'Inspect the dangerous signs', '危険の兆しを調べる')}</ReasonButton>{knownWarning && <p className="fr-combat-danger">{apex.warning[locale]}</p>}</>}
    {(kind === 'challenge' || kind === 'apex' && knownWarning) && <label className="fr-combat-consent"><input type="checkbox" checked={confirmed} onChange={e => confirm(e.target.checked)}/>{apex ? apex.confirmation[locale] : say('사람을 먼저 공격할 경우의 위험과 책임을 알고 맞선다. 경비대·기사 공격은 범죄다.', 'Confront them knowing the risks and responsibility. Attacking guards or knights is a crime.', '先に攻撃する危険と責任を承知で対する。衛兵や騎士への攻撃は犯罪になる。')}</label>}
    <div className="fr-action-grid"><ReasonButton className="fr-btn primary" disabled={blocked || !selected || !!invalid} reason={reason ?? say('대상을 선택하세요.', 'Choose a target.', '対象を選んでください。')} onClick={() => requestFantasyCombat({ type: 'start', source: kind, target: selected, confirm: confirmed })}>{say('혼자 전투 시작', 'Begin solo', '一人で戦闘を始める')}</ReasonButton>
    {party?.id && <ReasonButton className="fr-btn" disabled={blocked || !selected || !!invalid} reason={reason} onClick={() => { set({ fantasyPartyPending: true }); send({ t: 'fantasyPartyRequest', command: { type: 'readyCombat', source: kind, target: selected, confirm: confirmed } }); }}>{say('이 전투로 파티 준비', 'Ready for this battle', 'この戦闘で準備する')}</ReasonButton>}</div>
    <p className="fr-muted">{say('한 라운드의 입력 제한은 실제 1분이에요. 입력이 없으면 자동 방어하며, 전투는 계속돼요.', 'Each round allows one real minute to choose. Missing orders become automatic defense; combat continues.', '各ラウンドの入力期限は現実の1分です。未入力は自動防御となり、戦闘は続きます。')}</p>
  </section>;
}

export function FantasyCombatPanel({ profile }: { profile: FantasyProfile }) {
  const [locale] = useLocale(), battle = useStore(s => s.fantasyCombat), selfId = useStore(s => s.selfId), connected = useStore(s => s.wsConnected);
  const pending = useStore(s => s.fantasyCombatPending || s.fantasyPending), error = useStore(s => s.fantasyCombatError), clock = useStore(s => s.fantasyClock?.hour);
  const [mode, setMode] = useState('attack'), [selection, setSelection] = useState(''), [target, setTarget] = useState('');
  const [actorId, setActorId] = useState(''), [tile, setTile] = useState<FantasyCombatTile>();
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  useEffect(() => { if (profile.combatId && connected) send({ t: 'fantasyCombatRequest', command: { type: 'sync' } }); }, [profile.combatId, connected]);
  useEffect(() => { if (!pending) return; const timer = setTimeout(() => set({ fantasyCombatPending: false, fantasyCombatError: 'unavailable' }), 10000); return () => clearTimeout(timer); }, [pending]);
  if (!battle) return profile.combatId ? <section className="fr-combat"><p>{say('전장을 불러오는 중…', 'Loading the battlefield…', '戦場を読み込み中…')}</p><button className="fr-btn" onClick={() => send({ t: 'fantasyCombatRequest', command: { type: 'sync' } })}>{say('다시 확인', 'Refresh', '再確認')}</button></section> : null;
  const own = battle.fighters.find(fighter => fighter.userId === selfId && fighter.generation === (profile.generation ?? 1));
  const controlled = [own, ...(battle.units ?? []).filter(unit => unit.companion?.ownerId === selfId && unit.companion.generation === (profile.generation ?? 1)), ...(fantasyEscortCanCommand(battle, selfId) ? [battle.escort!.wagon] : [])].filter((fighter): fighter is NonNullable<typeof fighter> => !!fighter && fighter.hp > 0 && !fighter.fled);
  const actor = controlled.find(fighter => fighter.id === actorId) ?? controlled[0], unit = !!actor?.companion, escorted = actor?.id === battle.escort?.wagon.id;
  const currentMode = escorted ? mode === 'guard' ? 'guard' : 'move' : unit && ['item', 'escape'].includes(mode) ? 'attack' : mode;
  const skills = actor?.skills ?? [], supplies = FANTASY_ITEMS.filter(item => !foodMeta(item.id) && item.category !== 'food' && (profile.character?.inventory[item.id] ?? 0) > 0 && !!item.use && (item.use.hp || item.use.mp || item.use.cure?.length));
  const chosen = currentMode === 'skill' ? skills.find(skill => skill.id === selection) ?? skills[0] : undefined;
  const item = currentMode === 'item' ? supplies.find(item => item.id === selection) ?? supplies[0] : undefined;
  const allies = currentMode === 'item' || chosen && chosen.kind !== 'attack';
  const targets = fantasyCombatActors(battle).filter(fighter => fighter.hp > 0 && !fighter.fled && fighter.side === (allies ? 'players' : 'enemies'));
  const selected = targets.some(fighter => fighter.id === target) ? target : (allies && own && targets.some(f => f.id === own.id) ? own.id : targets[0]?.id ?? '');
  const baseOrder: FantasyCombatOrder = currentMode === 'guard' || currentMode === 'escape' ? { type: currentMode } : currentMode === 'move' ? battle.battlefield ? { type: 'moveTo', tile: tile ?? actor?.tile ?? { x: 0, y: 0 } } : { type: 'move', position: actor?.position === 'front' ? 'rear' : 'front' } : currentMode === 'skill' ? { type: 'skill', skill: chosen?.id ?? '', target: selected } : currentMode === 'item' ? { type: 'item', item: item?.id ?? '', target: selected } : { type: 'attack', target: selected };
  const order: FantasyCombatOrder = escorted ? { type: 'escort', order: baseOrder as { type: 'guard' } | { type: 'moveTo'; tile: FantasyCombatTile } } : unit && !['item', 'escape', 'unit', 'escort'].includes(baseOrder.type) ? { type: 'unit', unit: actor!.id, order: baseOrder as Exclude<FantasyCombatOrder, { type: 'unit' | 'item' | 'escape' | 'escort' }> } : baseOrder;
  const stock = Object.fromEntries(supplies.map(item => [item.id, { count: profile.character!.inventory[item.id], names: item.names ?? { ko: item.name, en: item.name, ja: item.name }, hp: item.use?.hp, mp: item.use?.mp, cleanse: item.use?.cure?.filter((effect): effect is 'poison' | 'burn' | 'frost' => ['poison', 'burn', 'frost'].includes(effect)) }]));
  const invalid = fantasyCombatOrderError(battle, selfId, order, { supplies: { [selfId]: stock } });
  const blocked = pending || !connected || !!profile.activity || !!profile.death || !!invalid;
  const reason = !connected ? say('서버 연결을 기다려 주세요.', 'Wait for connection.', '接続を待ってください。') : pending ? say('행동을 확인 중이에요.', 'Confirming the order.', '行動を確認中です。') : profile.activity ? say('현재 활동을 마쳐 주세요.', 'Finish the current activity.', 'いまの行動を終えてください。') : profile.death ? say('이 인물의 삶은 끝났어요.', 'This character’s life has ended.', 'この人物の人生は終わりました。') : invalid ? combatError(invalid, locale) : undefined;
  const seconds = Math.max(0, Math.ceil((battle.deadline - (clock ?? battle.hour)) * 120));
  const submitted = (fighter: NonNullable<typeof actor>) => fighter.id === battle.escort?.wagon.id ? !!battle.escort.order : fighter.companion ? Object.hasOwn(battle.unitOrders ?? {}, fighter.id) : Object.hasOwn(battle.orders, selfId);
  return <section className="fr-combat" aria-label={say('전장', 'Battlefield', '戦場')}><header><h2>{say('전투', 'Combat', '戦闘')} · {say('라운드', 'Round', 'ラウンド')} {battle.round}</h2>{battle.status === 'active' && <span>{seconds}s · {Object.keys(battle.orders).length + Object.keys(battle.unitOrders ?? {}).length + (battle.escort?.order ? 1 : 0)}/{fantasyCombatActors(battle).filter(f => f.side === 'players' && f.hp > 0 && !f.fled).length}</span>}</header>
    {error && <p role="alert" className="fr-error">{combatError(error, locale)}</p>}
    {battle.escort && <div className="fr-escort-objective"><b>{say('호송 수레 보호', 'Protect the caravan wagon', '護送馬車を守る')}</b><span>HP {battle.escort.wagon.hp}/{battle.escort.wagon.stats.hp} · {fantasyEscortAtExit(battle) ? say('출구 도착', 'Exit reached', '出口に到達') : say('출구', 'Exit', '出口') + ` ${battle.escort.exit.x + 1},${battle.escort.exit.y + 1}`}</span>{battle.status === 'active' && <small>{say('수레를 지키며 출구까지 이동하고 습격자를 물리치세요.', 'Keep the wagon safe, reach the exit, and defeat the attackers.', '馬車を守りながら出口へ進め、襲撃者を倒してください。')}</small>}</div>}
    <FantasyTacticalBoard battle={battle} actor={actor} locale={locale} selected={tile} moving={currentMode === 'move'} onTile={setTile} onTarget={setTarget} />
    <div className="fr-combat-roster">{(['enemies', 'players'] as const).map(side => <div key={side} className={`fr-combat-side ${side}`}>{fantasyCombatActors(battle).filter(f => f.side === side).map(fighter => <article key={fighter.id} className={`${fighter.hp <= 0 || fighter.fled ? 'down' : ''} ${fighter.id === actor?.id ? 'self' : ''}`}><b>{fighter.names[locale]}{fighter.companion && ` · ${say('동료', 'Companion', '仲間')}`}</b><small>{fighter.tile ? `${fighter.tile.x + 1},${fighter.tile.y + 1}` : fighter.position === 'front' ? say('전열', 'Front', '前列') : say('후열', 'Rear', '後列')}{fighter.fled && ` · ${say('퇴각', 'Retreated', '離脱')}`}</small><meter min={0} max={fighter.stats.hp} value={fighter.hp}/><span>HP {fighter.hp}/{fighter.stats.hp}{side === 'players' && ` · MP ${fighter.mp}/${fighter.stats.mp}`}</span>{fighter.effects.length > 0 && <small>{fighter.effects.map(effect => ({ poison: say('중독', 'Poison', '毒'), burn: say('화상', 'Burn', '火傷'), frost: say('냉기', 'Frost', '凍傷') }[effect.id])).join(' · ')}</small>}{side === 'enemies' && fighter.hp > 0 && battle.status === 'active' && <p className="fr-combat-telegraph">{fantasyCombatTelegraph(fighter, battle.round, locale)}</p>}</article>)}</div>)}</div>
    {battle.status === 'active' && own && own.hp > 0 && !own.fled && <div className="fr-combat-orders">{controlled.length > 1 && <label>{say('명령 대상', 'Command actor', '指示する仲間')}<select value={actor?.id ?? ''} onChange={e => { setActorId(e.target.value); setMode('attack'); setSelection(''); setTarget(''); setTile(undefined); }}>{controlled.map(fighter => <option key={fighter.id} value={fighter.id}>{fighter.names[locale]}{submitted(fighter) ? ' ✓' : ''}</option>)}</select></label>}<label>{say('행동', 'Action', '行動')}<select value={currentMode} onChange={e => { setMode(e.target.value); setSelection(''); setTarget(''); setTile(undefined); }}>{['attack', 'guard', 'skill', 'item', 'move', 'escape'].filter(value => escorted ? ['guard', 'move'].includes(value) : !unit || !['item', 'escape'].includes(value)).map(value => <option key={value} value={value}>{{ attack: say('공격', 'Attack', '攻撃'), guard: say('방어', 'Defend', '防御'), skill: say('기술', 'Skill', '技能'), item: say('소모품', 'Consumable', '消耗品'), move: say('이동', 'Move', '移動'), escape: say('퇴각 시도', 'Try to retreat', '離脱を試みる') }[value]}</option>)}</select></label>
      {currentMode === 'skill' && <select aria-label={say('배운 기술', 'Learned skill', '習得技能')} value={chosen?.id ?? ''} onChange={e => setSelection(e.target.value)}>{skills.map(skill => <option key={skill.id} value={skill.id}>{skill.names[locale]} · {skill.mp} MP</option>)}</select>}
      {chosen && <small>{chosen.kind === 'heal' ? say('아군 HP 회복', 'Heal allied HP', '味方のHPを回復') : chosen.kind === 'guard' ? say('아군 피해 흡수', 'Absorb damage for an ally', '味方の被害を吸収') : chosen.kind === 'focus' ? say('아군의 다음 명중 보조 · 1회, 최대 2라운드', 'Aid the next allied attack · one use, up to two rounds', '味方の次の命中を補助・1回、最大2ラウンド') : say('상대를 공격', 'Attack an opponent', '相手を攻撃')} · {say('위력', 'Power', '威力')} {chosen.power}{chosen.kind === 'focus' ? '%p' : ''}{chosen.onHit && ` · ${say('유효 명중 시', 'On a damaging hit', '有効な命中時')} ${Math.round(chosen.onHit.chance * 100)}% ${{ burn: say('화상', 'Burn', '火傷'), poison: say('중독', 'Poison', '毒'), frost: say('냉기', 'Frost', '冷気') }[chosen.onHit.id]}`}</small>}
      {currentMode === 'item' && <select aria-label={say('소모품', 'Consumable', '消耗品')} value={item?.id ?? ''} onChange={e => setSelection(e.target.value)}>{supplies.map(item => <option key={item.id} value={item.id}>{item.names?.[locale] ?? item.name} ×{profile.character!.inventory[item.id]}</option>)}</select>}
      {!['guard', 'escape', 'move'].includes(currentMode) && <select aria-label={say('대상', 'Target', '対象')} value={selected} onChange={e => setTarget(e.target.value)}>{targets.map(fighter => <option key={fighter.id} value={fighter.id}>{fighter.names[locale]}</option>)}</select>}
      <ReasonButton className="fr-btn primary" disabled={blocked} reason={reason} onClick={() => {
        requestFantasyCombat({ type: 'order', combatId: battle.id, revision: battle.revision, order });
        const next = controlled.find(fighter => fighter.id !== actor?.id && !submitted(fighter));
        if (next) { setActorId(next.id); setMode('attack'); setSelection(''); setTarget(''); setTile(undefined); }
      }}>{actor && submitted(actor) ? say('행동 확정됨', 'Order confirmed', '行動確定済み') : say('행동 확정', 'Confirm action', '行動を確定')}</ReasonButton>
      {escorted && <ReasonButton className="fr-btn" disabled={pending || !connected || !fantasyEscortAdvanceTile(battle) || !!battle.escort?.order} reason={reason ?? say('출구 방향의 길이 막혔거나 명령을 이미 내렸습니다.', 'The exit route is blocked or the order is already given.', '出口への道が塞がれているか、指示済みです。')} onClick={() => { const destination = fantasyEscortAdvanceTile(battle); if (destination) requestFantasyCombat({ type: 'order', combatId: battle.id, revision: battle.revision, order: { type: 'escort', order: { type: 'moveTo', tile: destination } } }); }}>{say('출구 방향으로 전진', 'Advance toward the exit', '出口へ進む')}</ReasonButton>}
    </div>}
    {battle.status !== 'active' && <div className="fr-combat-result"><h3>{{ victory: say('승리', 'Victory', '勝利'), defeat: say('패배', 'Defeat', '敗北'), escaped: say('퇴각', 'Retreated', '離脱') }[battle.status]}</h3><p>{say('보상과 생존 결과는 각자의 기록에서 확인할 수 있어요.', 'Check your own journal for rewards and survival outcomes.', '報酬と生存結果は各自の手記で確認できます。')}</p><button className="fr-btn" onClick={() => set({ fantasyCombat: null, fantasyCombatError: null })}>{say('여정으로 돌아가기', 'Return to the journey', '旅に戻る')}</button></div>}
    <details className="fr-combat-log" open><summary>{say('전투 기록', 'Combat log', '戦闘記録')}</summary>{battle.logs.slice(-12).map(entry => <p key={entry.id}>{entry.roll && <span className="fr-combat-die" key={`${battle.id}-${entry.id}`}>D20 · {entry.roll.value}</span>}{entry.text[locale]}</p>)}</details>
  </section>;
}
