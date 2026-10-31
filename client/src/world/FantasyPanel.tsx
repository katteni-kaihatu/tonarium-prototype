import { deferFantasyPanel } from './FantasyDeferredPanel.tsx';
import { fantasyCombatJob, fantasyLifeJob } from '../../../shared/fantasy-careers.ts';
import { fantasyStatusView } from '../../../shared/fantasy-status-view.ts';
import { FantasyStatusEffects } from './FantasyStatusEffects.tsx';
import { fantasyCanChangeTravelGear, fantasyTravelGearAvailable } from '../../../shared/fantasy-travel-gear.ts';
import { FantasyOutdoorCooking } from './FantasyOutdoorCooking.tsx';
import { fantasyHasWorkerCompany } from '../../../shared/fantasy-worker-companions.ts';
import { fantasyCombatOnlySkill } from '../../../shared/fantasy-body-combat-catalog.ts';
import {fantasyBodyTraits} from '../../../shared/fantasy-physiology.ts';
import {FantasyOccultActions,FantasyDownedCare} from './FantasyOccultActions.tsx';
import { FantasyMapMerchant } from './FantasyMapMerchant.tsx';
import { FANTASY_MAP_MERCHANT_EVENT, FANTASY_MAP_MERCHANT_NPC } from '../../../shared/fantasy-map-merchant.ts';
import { FantasyDungeonMap, FantasyDungeonActions, FantasyDungeonEntrances, requestDungeon } from './FantasyDungeonPanel.tsx';
import { isFantasyDungeonAction } from '../../../shared/fantasy-dungeon.ts';
import { fantasyOnRoad } from '../../../shared/fantasy-travel.ts';
import { FantasyPartyConsent } from './FantasyPartyConsent.tsx';
import { requestFantasyParty } from './fantasy-party-transport.ts';
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import type { FantasyAction, FantasyCharacter, FantasyProfile, FantasyRace, FantasyStats } from '../../../shared/fantasy.ts';
import { FANTASY_EVENTS, FANTASY_RACE_FAMILIES, FANTASY_RACES, FANTASY_STAT_NAMES } from '../../../shared/fantasy-data.ts';
import { fantasyActionHours, fantasySkills, fantasyStats, fantasyTransports } from '../../../shared/fantasy-engine.ts';
import { get, set, useStore } from '../store.ts';
import { send } from '../net/ws.ts';
import { appendFantasyGmResponse } from './fantasy-gm-history.ts';
import { FantasyMessenger } from './FantasyMessenger.tsx';
import { NPC_PUBLIC, type NpcId } from '../../../shared/npc.ts';
import { FantasyMenuBoundary } from './FantasyMenuBoundary.tsx';
import { FantasyMap } from './FantasyMap.tsx';
import './fantasy.css';
import './fantasy-terrain.css';
import { fantasyTerrainFrame } from './fantasy-terrain-theme.ts';
import { FantasyTerrainAmbience } from './FantasyTerrainAmbience.tsx';
import { fantasyCharacterCareerNames } from '../../../shared/fantasy-job-display.ts';
import { getLocale, useLanguageChosen, useLocale } from '../locale.ts';
import { FANTASY_TERMS } from '../../../shared/fantasy-lore.ts';
import { fantasyKnownLocations, fantasyFrontierLocations } from '../../../shared/fantasy-town.ts';
import { fantasySkillName } from '../../../shared/fantasy-skill-names.ts';
import { LanguageScreen, LanguageSelect } from '../LanguageScreen.tsx';
import { cleanupRetiredBrowserAi } from '../ai-retirement.ts';
import { fantasyEventText } from '../../../shared/fantasy-narrative.ts';
import { fantasyHostileEncounter } from '../../../shared/fantasy-encounters.ts';
import { requestFantasyCombat } from './fantasy-combat-transport.ts';
import { FANTASY_COMBAT_ENEMIES } from '../../../shared/fantasy-combat-catalog.ts';
import { FantasyActivity, realDuration } from './FantasyActivity.tsx';
import { fantasyErrorText, fantasyLogText, gameClock, genderLabels, statLabels } from './fantasy-copy.ts';
import { fantasyMana, fantasyManaSkillError } from '../../../shared/fantasy-mana.ts';
import { fantasyProfessionGrade } from '../../../shared/fantasy-progression.ts';
import { FANTASY_JOB_GRADES } from '../../../shared/fantasy-skill-expansion.ts';
import { FantasyFieldActions } from './FantasyFieldActions.tsx';
import { FantasyMonsterSites } from './FantasyMonsterSites.tsx';
import { FantasyEnvironment } from './FantasyEnvironment.tsx';
import { FantasyDice } from './FantasyDice.tsx';
import { ReasonButton } from './FantasyActionButton.tsx';
import { actionHelp, skillBriefText, skillDescriptionText, skillEffectText } from './fantasy-action-help.ts';

const FantasyQuestBoard = deferFantasyPanel(() => import('./FantasyQuestBoard.tsx').then(module => ({ default: module.FantasyQuestBoard })));
const FantasyGmChat = deferFantasyPanel(() => import('./FantasyGmChat.tsx').then(module => ({ default: module.FantasyGmChat })));
const FantasyVoyageEnding = deferFantasyPanel(() => import('./FantasyVoyageEnding.tsx').then(module => ({ default: module.FantasyVoyageEnding })));
const FantasyVoyageSceneHistory = deferFantasyPanel(() => import('./FantasyVoyageScenes.tsx').then(module => ({ default: module.FantasyVoyageSceneHistory })));
const FantasyTownPanel = deferFantasyPanel(() => import('./FantasyTownPanel.tsx').then(module => ({ default: module.FantasyTownPanel })));
const FantasyPartyPanel = deferFantasyPanel(() => import('./FantasyPartyPanel.tsx').then(module => ({ default: module.FantasyPartyPanel })));
const FantasyRealmMenu = deferFantasyPanel(() => import('./FantasyRealmMenu.tsx').then(module => ({ default: module.FantasyRealmMenu })));
const FantasyPropertyMenu = deferFantasyPanel(() => import('./FantasyPropertyMenu.tsx').then(module => ({ default: module.FantasyPropertyMenu })));
const FantasyPriestPanel = deferFantasyPanel(() => import('./FantasyPriestPanel.tsx').then(module => ({ default: module.FantasyPriestPanel })));
const FantasyCombatPanel = deferFantasyPanel(() => import('./FantasyCombatPanel.tsx').then(module => ({ default: module.FantasyCombatPanel })));
const FantasyRankingPanel = deferFantasyPanel(() => import('./FantasyRankingPanel.tsx').then(module => ({ default: module.FantasyRankingPanel })));
const FantasyInventory = deferFantasyPanel(() => import('./FantasyInventory.tsx').then(module => ({ default: module.FantasyInventory })));
const FantasyEquipmentPanel = deferFantasyPanel(() => import('./FantasyEquipmentPanel.tsx').then(module => ({ default: module.FantasyEquipmentPanel })));
const FantasyLegacy = deferFantasyPanel(() => import('./FantasyLegacy.tsx').then(module => ({ default: module.FantasyLegacy })));
const FantasyCompanyPanel = deferFantasyPanel(() => import('./FantasySpecialtyPanels.tsx').then(module => ({ default: module.FantasyCompanyPanel })));
const FantasyMagicPanel = deferFantasyPanel(() => import('./FantasySpecialtyPanels.tsx').then(module => ({ default: module.FantasyMagicPanel })));
const FantasyAlchemyPanel = deferFantasyPanel(() => import('./FantasySpecialtyPanels.tsx').then(module => ({ default: module.FantasyAlchemyPanel })));

type Tab = 'location' | 'quests' | 'inventory' | 'equipment' | 'skills' | 'jobs' | 'journal' | 'gm' | 'npc' | 'buildings' | 'company' | 'magic' | 'alchemy' | 'legacy' | 'party' | 'property' | 'priest' | 'economy' | 'civic' | 'blackMarket' | 'ranking';
const genderName = { male: '男性', female: '女性', none: '性別なし' };
const placeName = (id: string) => FANTASY_TERMS.find((t)=>t.category==='place'&&t.id===id)?.names[getLocale()] ?? id;
const jobName = (id: string) => FANTASY_TERMS.find((t)=>t.category==='job'&&t.id===id)?.names[getLocale()] ?? id;
const clock = (h:number) => gameClock(h,getLocale());

function act(action: FantasyAction) {
  const s=get();
  if (!s.wsConnected || s.fantasyPending || !s.fantasyProfile || (s.fantasyProfile.activity&&!['sync','cancel','redirect','escortAbandon'].includes(action.type)&&!fantasyCanChangeTravelGear(s.fantasyProfile,action))) return;
  if (s.fantasyParty?.id && action.type==='travel') { requestFantasyParty({type:'readyTravel',destination:action.destination,transport:action.transport}); return; }
  if (s.fantasyParty?.id && action.type==='redirect') { requestFantasyParty({type:'readyRedirect',destination:action.destination,...(action.transport?{transport:action.transport}:{})}); return; }
  if (s.fantasyParty?.id && isFantasyDungeonAction(action)&&['dungeonEnter','dungeonMove','dungeonInspect','dungeonExit'].includes(action.type)) { requestDungeon(action,()=>{},true); return; }
  if(action.type==='hunt'){if(s.fantasyParty?.id)requestFantasyParty({type:'readyCombat',source:'hunt',target:action.monster??''});else requestFantasyCombat({type:'start',source:'hunt',target:action.monster??''});return;}
  if(action.type==='event'&&action.choice==='fight'&&s.fantasyProfile.event&&fantasyHostileEncounter(s.fantasyProfile.event)){if(s.fantasyParty?.id)requestFantasyParty({type:'readyCombat',source:'encounter',target:s.fantasyProfile.event});else requestFantasyCombat({type:'start',source:'encounter',target:s.fantasyProfile.event});return;}
  if(s.fantasyProfile.combatId&&action.type!=='sync'&&action.type!=='rebirth')return;
  set({ fantasyPending: true, fantasyError: null });
  send({ t:'fantasyAction', revision:s.fantasyProfile.revision, action });
}

function Button({ children, action, disabled=false, primary=false, reason }: { children: ReactNode; action: FantasyAction; disabled?: boolean; primary?: boolean; reason?:string }) {
  const blocked=useStore((s)=>s.fantasyPending || !s.wsConnected || !!s.fantasyProfile?.activity || !!s.fantasyProfile?.combatId);
  const profile=useStore((s)=>s.fantasyProfile);
  const [locale]=useLocale();
  const hours=profile?fantasyActionHours(profile,action):0;
  const unavailable=reason??(profile?.character?actionHelp(profile.character,action,locale):undefined);
  return <ReasonButton className={primary?'fr-btn primary':'fr-btn'} disabled={disabled||blocked||!!unavailable} reason={blocked?undefined:unavailable} onClick={()=>act(action)}>{children}{hours>0&&action.type!=='travel'&&<small className="fr-action-time">{realDuration(hours,locale)}</small>}</ReasonButton>;
}

function RaceDetails({ race }: { race: FantasyRace }) {
  const [locale]=useLocale();
  const family=FANTASY_RACE_FAMILIES.find((f)=>f.id===race.family);
  const gender={ko:{male:'남성',female:'여성',none:'성별 없음'},en:{male:'Male',female:'Female',none:'Genderless'},ja:genderName}[locale];
  const statsNames={ko:{hp:'HP',mp:'MP',strength:'힘',agility:'민첩',intelligence:'지능',luck:'운',vitality:'체력',dexterity:'재주',charisma:'카리스마'},en:{hp:'HP',mp:'MP',strength:'Strength',agility:'Agility',intelligence:'Intelligence',luck:'Luck',vitality:'Vitality',dexterity:'Dexterity',charisma:'Charisma'},ja:FANTASY_STAT_NAMES}[locale];
  const modifiers=Object.entries(race.modifiers) as [keyof FantasyStats,number][];
  return <>
    <div className="fr-eyebrow">{family?.names[locale]} · {{ko:{一般:'일반',希少:'희귀',稀代:'극희귀',伝承:'전승',伝説:'전설'},en:{一般:'Common',希少:'Rare',稀代:'Very rare',伝承:'Mythic',伝説:'Legendary'},ja:{一般:'一般',希少:'希少',稀代:'稀代',伝承:'伝承',伝説:'伝説'}}[locale][race.rarity as '一般'|'希少'|'稀代'|'伝承'|'伝説']??race.rarity} {race.gender ? ` · ${gender[race.gender]}` : ''}</div>
    <h2>{race.names[locale]}</h2>
    <div className="fr-tags">{modifiers.length?modifiers.map(([key,v])=><span key={key} className={v<0?'negative':''}>{statsNames[key]} {v>0?'+':''}{v}</span>):<span>{{ko:'균형 잡힌 기본 능력',en:'Balanced base attributes',ja:'基礎能力の偏りなし'}[locale]}</span>}</div>
    {race.skills.map((s)=><div key={s.id} className="fr-skill-brief"><span>{s.kind==='passive'?{ko:'패시브',en:'Passive',ja:'常時'}[locale]:{ko:'액티브',en:'Active',ja:'発動'}[locale]}</span><b>{fantasySkillName(s,locale)}</b><p>{skillBriefText(s,locale)}{s.mp>0&&` · MP ${s.mp}`}</p></div>)}
  </>;
}

function Creation({ profile }: { profile: FantasyProfile }) {
  const [locale]=useLocale();const selfName=useStore((s)=>s.selfName);
  const [name,setName]=useState(selfName);const [gender,setGender]=useState<'male'|'female'>('male');
  const [source,setSource]=useState<'human'|'candidate'|'kept'>('human');const draft=profile.draft;
  useEffect(()=>{if(draft.candidate)setSource('candidate');else setSource((v)=>v==='candidate'?(draft.kept?'kept':'human'):v);},[draft.candidate,draft.kept]);
  const raceId=source==='candidate'?draft.candidate:source==='kept'?draft.kept:'human';const race=FANTASY_RACES.find((r)=>r.id===raceId)??FANTASY_RACES[0];
  const t={ko:{title:'당신의 이야기를 시작하세요.',name:'이름',gender:'성별',male:'남성',female:'여성',none:'성별 없음',job:'직업',human:'인간',kept:'킵한 종족',candidate:'이번 종족',draw:'종족 뽑기',left:'남은 기회',keep:'킵하기',skip:'넘기기',create:'이 종족으로 시작'},en:{title:'Begin your own story.',name:'Name',gender:'Gender',male:'Male',female:'Female',none:'Genderless',job:'Profession',human:'Human',kept:'Kept race',candidate:'Current draw',draw:'Draw a race',left:'Draws left',keep:'Keep',skip:'Pass',create:'Begin as this race'},ja:{title:'あなたの物語をはじめる。',name:'名前',gender:'性別',male:'男性',female:'女性',none:'性別なし',job:'職業',human:'人間',kept:'キープした種族',candidate:'今回の種族',draw:'種族を引く',left:'残り',keep:'キープ',skip:'見送る',create:'この種族ではじめる'}}[locale];
  return <div className="fr-creation"><div className="fr-creation-story"><div className="fr-ornament">✦</div><span className="fr-eyebrow">THE LONG JOURNEY</span><h1>{t.title}</h1></div><div className="fr-creation-form"><label>{t.name}<input value={name} maxLength={24} onChange={(e)=>setName(e.target.value)}/></label><div className="fr-form-row"><label>{t.gender}<select value={race.gender??gender} disabled={!!race.gender} onChange={(e)=>setGender(e.target.value as 'male'|'female')}><option value="male">{t.male}</option><option value="female">{t.female}</option>{race.gender==='none'&&<option value="none">{t.none}</option>}</select></label></div><div className="fr-race-sources"><button className={source==='human'?'chosen':''} onClick={()=>setSource('human')}>{t.human}</button>{draft.kept&&<button className={source==='kept'?'chosen':''} onClick={()=>setSource('kept')}>{t.kept}</button>}{draft.candidate&&<button className={source==='candidate'?'chosen':''} onClick={()=>setSource('candidate')}>{t.candidate}</button>}</div><div className="fr-race-result"><RaceDetails race={race}/></div><div className="fr-roll-row"><Button action={{type:'draw'}} disabled={draft.remaining===0||!!draft.candidate} reason={draft.remaining===0?({ko:'추첨 기회를 모두 사용했습니다.',en:'No draws remain.',ja:'抽選回数を使い切りました。'})[locale]:draft.candidate?({ko:'현재 후보를 킵하거나 넘겨 주세요.',en:'Keep or pass the current candidate first.',ja:'現在の候補をキープするか見送ってください。'})[locale]:undefined}>{t.draw}</Button><span>{t.left} <b>{draft.remaining}</b> / 5</span></div>{draft.candidate&&<div className="fr-form-row"><Button action={{type:'keep'}}>{t.keep}</Button><Button action={{type:'skip'}}>{t.skip}</Button></div>}<Button action={{type:'create',name:name.trim(),gender,source}} disabled={!name.trim()||!raceId} reason={!name.trim()?({ko:'이름을 입력하세요.',en:'Enter a name.',ja:'名前を入力してください。'})[locale]:!raceId?({ko:'종족을 선택하세요.',en:'Choose a race.',ja:'種族を選んでください。'})[locale]:undefined} primary>{t.create} →</Button></div></div>;
}

function CharacterCard({ character: c }: { character: FantasyCharacter }) {
  const [locale]=useLocale();
  const worldHour=useStore(s=>s.fantasyClock?.hour)??c.hour;
  const battle=useStore(s=>s.fantasyCombat),self=useStore(s=>s.selfId),profile=useStore(s=>s.fantasyProfile);
  const fighter=battle?.status==='active'?battle.fighters.find(f=>f.userId===self&&f.generation===(profile?.generation??1)&&!f.companion):undefined;
  const activity=profile?.activity;
  const currentEffects=fantasyStatusView({...c,hour:Math.max(c.hour,worldHour)},locale,{camping:activity?.action.type==='rest',campfire:!!activity?.camp?.fire&&activity.camp.fire!=='none',fighter});
  const stats=fantasyStats(c);
  const race=FANTASY_RACES.find((r)=>r.id===c.race);
  const combatJob=fantasyCombatJob(c), lifeJob=fantasyLifeJob(c);
  const career=fantasyCharacterCareerNames({...c,job:combatJob})?.[locale];
  const lifeCareer=lifeJob&&fantasyCharacterCareerNames({...c,job:lifeJob})?.[locale];
  const mana=fantasyMana(c);
  const keys=['strength','agility','intelligence','luck','vitality','dexterity','charisma'] as const;
  return <aside className="fr-character"><div className="fr-character-seal">{c.name.slice(0,1)}</div><span className="fr-eyebrow">YOUR STORY</span><h2>{c.name}</h2><p>{race?.names[getLocale()]} · {genderLabels[locale][c.gender]}</p><div className="fr-character-job">{{ko:'주직업',en:'Main profession',ja:'主職'}[locale]} · {jobName(combatJob)}{career?` · ${career}`:null} · {FANTASY_JOB_GRADES[fantasyProfessionGrade(c,combatJob)].names[locale]}{lifeJob&&<small style={{display:'block'}}>{{ko:'서브직업',en:'Secondary profession',ja:'副職'}[locale]} · {jobName(lifeJob)}{lifeCareer?` · ${lifeCareer}`:null} · {FANTASY_JOB_GRADES[fantasyProfessionGrade(c,lifeJob)].names[locale]}</small>}<span>Lv. {c.level}</span></div>
    <div className="fr-meter"><span>HP <b>{c.hp} / {stats.hp}</b></span><meter min={0} max={stats.hp} value={c.hp}/></div>
    <div className="fr-meter mana"><span>MP <b>{c.mp} / {stats.mp}</b></span><meter min={0} max={stats.mp} value={c.mp}/></div>

    <div className="fr-needs-meters">{([['fatigue',c.fatigue],['hunger',c.hunger]] as const).map(([key,value])=><div key={key} className={`fr-meter need ${value>=70?'danger':value>=40?'warning':''}`}><span>{{fatigue:{ko:'피로',en:'Fatigue',ja:'疲れ'},hunger:{ko:'허기',en:'Hunger',ja:'空腹'}}[key][locale]} <b>{Math.round(value)} / 100</b></span><meter min={0} max={100} high={70} low={40} optimum={0} value={value} aria-label={{fatigue:{ko:'피로',en:'Fatigue',ja:'疲れ'},hunger:{ko:'허기',en:'Hunger',ja:'空腹'}}[key][locale]}/></div>)}</div>
    <div className="fr-stat-grid">{keys.map((key)=>stats[key]!==undefined&&<div key={key}><span>{statLabels[locale][key]}</span><b>{stats[key]}</b></div>)}</div>
    <FantasyStatusEffects effects={currentEffects} locale={locale}/>
    <details className="fr-body-traits"><summary>{{ko:'신체 특성',en:'Body traits',ja:'身体の特徴'}[locale]}</summary>{fantasyBodyTraits(c).map(trait=><p key={trait.id}><b>{trait.names[locale]}</b><small>{trait.descriptions[locale]}</small></p>)}</details><div className="fr-wallet"><span>{{ko:'소지금',en:'Gold',ja:'所持金'}[locale]}</span><b>{c.gold.toLocaleString()} <small>G</small></b></div><div className="fr-xp">XP {c.xp} · {{ko:'직업 숙련',en:'Proficiency',ja:'職業熟練'}[locale]} {c.jobXp[combatJob]??0}{lifeJob&&<> · {jobName(lifeJob)} {c.jobXp[lifeJob]??0}</>}</div>
    {!!c.honors?.length&&<div className='fr-effect-tags'>{c.honors.map(id=><span key={id}>{FANTASY_COMBAT_ENEMIES.find(enemy=>enemy.reward.honor?.id===id)?.reward.honor?.names[locale]??id}</span>)}</div>}
    {(c.notoriety??0)>0&&<div className="fr-xp">{{ko:'악명',en:'Notoriety',ja:'悪名'}[locale]} {c.notoriety}</div>}
    {mana.stage>0&&<small>{{ko:'마나 수련',en:'Mana practice',ja:'マナ修練'}[locale]} {mana.stage} · {{ko:'부하',en:'Strain',ja:'負荷'}[locale]} {mana.strain}</small>}
    <div className="fr-character-bottom"><span>{{ko:'현재 위치',en:'Location',ja:'現在地'}[locale]}</span><b>{placeName(c.location)}</b><span>{clock(worldHour)}</span></div>
  </aside>;
}

function LocationPanel({ c, selected, blocked }: { c: FantasyCharacter; selected: string; blocked: boolean }) {
  const [locale]=useLocale();
  const known=fantasyKnownLocations(c).includes(selected);
  const here=selected===c.location&&!fantasyOnRoad(c);
  const t={ko:{unknown:'미지의 장소',explore:'탐색',work:'일하기',camp:'노숙',go:'출발',empty:'이용 가능한 이동수단이 없습니다.'},en:{unknown:'Unknown place',explore:'Explore',work:'Work',camp:'Camp',go:'Depart',empty:'No transport is available.'},ja:{unknown:'未知の場所',explore:'探索',work:'働く',camp:'野宿',go:'出発',empty:'利用できる移動手段はありません。'}}[locale];
  const transports=here?[]:fantasyTransports(c,selected).filter((t)=>t.available);
  const names:Record<string,Record<string,string>>={foot:{ko:'도보',en:'On foot',ja:'徒歩'},carriage:{ko:'마차',en:'Carriage',ja:'馬車'},ship:{ko:'도보・정기선',en:'Walk & ferry',ja:'徒歩・定期船'},'working-ship':{ko:'도보・일손선',en:'Walk & working passage',ja:'徒歩・手伝い船'},airship:{ko:'비공정',en:'Airship',ja:'飛空艇'},gate:{ko:'전이문',en:'Transfer gate',ja:'転移門'},escort:{ko:'의뢰받은 호위 동행',en:'Assigned caravan escort',ja:'受注した護衛の同行'}};
  return <><h2>{known?placeName(selected):t.unknown}</h2>{here?<><FantasyFieldActions c={c} onAction={act} blocked={blocked}/><FantasyMonsterSites c={c} blocked={blocked}/><FantasyDungeonEntrances c={c} blocked={blocked} onAction={act}/><FantasyOccultActions c={c} blocked={blocked} onAction={act}/></>:<div className="fr-transports">{transports.map((tr)=><div className="fr-transport" key={tr.id}><b>{names[tr.id]?.[locale]??tr.name}</b><div className="fr-transport-price"><span>{tr.reward ? `+${tr.reward} G` : `${tr.cost} G`}</span><span>{Number(tr.hours.toFixed(2))} h · {realDuration(tr.hours,locale)}</span></div><Button action={{type:'travel',destination:selected,transport:tr.id}}>{t.go} →</Button></div>)}{transports.length===0&&<p>{t.empty}</p>}</div>}</>;
}

function SkillsPanel({c}:{c:FantasyCharacter}){
  const [locale]=useLocale();const [selected,setSelected]=useState<string|null>(null);
  const t={ko:{title:'스킬',passive:'패시브',active:'액티브',use:'발동',locked:'아직 배우지 않은 기술',xp:'숙련',job:'직업 숙련',book:'읽기',mentor:'스승의 가르침',practice:'유효한 활동'},en:{title:'Skills',passive:'Passive',active:'Active',use:'Use',locked:'Skills to learn',xp:'Proficiency',job:'Job proficiency',book:'Read',mentor:'Learn from a mentor',practice:'Effective practice'},ja:{title:'スキル',passive:'常時',active:'発動',use:'使う',locked:'これから学べる技能',xp:'熟練',job:'職業熟練',book:'読む',mentor:'師の教え',practice:'有効な実践'}}[locale];
  const skills=fantasySkills(c);
  return <><h2>{t.title}</h2>{skills.map(skill=><div className="fr-skill-row" key={skill.id}><span><button type="button" className="fr-skill-inspect" aria-expanded={selected===skill.id} onClick={()=>setSelected(selected===skill.id?null:skill.id)}><b>{fantasySkillName(skill,locale)}</b></button><small>{skill.kind==='passive'?t.passive:t.active}{skill.mp>0&&' · MP '+skill.mp} · {t.xp} {c.skillXp?.[skill.id]??0}</small><small className="fr-skill-gloss">{skillBriefText(skill,locale)}</small></span>{skill.kind==='active'&&<Button action={{type:'skill',skill:skill.id}} reason={fantasyCombatOnlySkill(skill.id)?{ko:'이 기술은 전투 화면에서 사용하세요.',en:'Use this technique on the battlefield.',ja:'この技は戦場で使ってください。'}[locale]:undefined} disabled={c.mp<skill.mp||!!fantasyManaSkillError(c,skill.id)||(skill.restore==='mp'?c.mp>=fantasyStats(c).mp||c.manaRecoveryAt!==undefined&&c.hour-c.manaRecoveryAt<6:skill.utility?false:skill.effect==='heal'?c.hp>=fantasyStats(c).hp:!!c.buff)}>{t.use}</Button>}{selected===skill.id&&<div className="fr-skill-description"><p>{skillDescriptionText(skill,locale)}</p><p>{{ko:'현재 효과',en:'Current effect',ja:'現在の効果'}[locale]} · {fantasyCombatOnlySkill(skill.id)?{ko:'전투 화면에서 사거리·효과·위치를 선택하세요.',en:'Choose reach, effects and position on the battlefield.',ja:'戦闘画面で射程・効果・位置を選んでください。'}[locale]:skillEffectText(skill,locale,c)}</p></div>}</div>)}</>;
}

function Journal({profile,onSelect,blocked}:{profile:FantasyProfile;onSelect:(id:string)=>void;blocked:boolean}){
  const [locale]=useLocale();
  return <><div className="fr-eyebrow">CHRONICLE</div><h2>{{ko:'여행 기록',en:'Travel journal',ja:'あなたの旅の手記'}[locale]}</h2><div className="fr-journal">{profile.character&&<FantasyVoyageSceneHistory c={profile.character}/>} {profile.character&&<FantasyVoyageEnding c={profile.character} onAction={act} onSelect={onSelect} blocked={blocked}/>} {[...profile.log].reverse().map((l)=><article key={l.id} className={l.kind}><time>{clock(l.hour)}</time><p>{fantasyLogText(l.text,locale,profile.character)}</p></article>)}</div></>;
}

type FantasyPanelProps = { socialOpen: boolean; onSocialToggle: () => void };

export function FantasyPanel(props: FantasyPanelProps) {
  useEffect(() => { void cleanupRetiredBrowserAi().catch(() => {}); }, []);
  const languageChosen = useLanguageChosen();
  const selfId = useStore(state => state.selfId);
  return languageChosen ? <FantasyPanelContent key={selfId} {...props}/> : <LanguageScreen/>;
}

export function FantasyPanelContent({socialOpen,onSocialToggle}: FantasyPanelProps){
  const [locale]=useLocale();
  const nav: [Tab,string][]=[['location',{ko:'여행',en:'Travel',ja:'旅先'}[locale]],['buildings',{ko:'마을',en:'Town',ja:'町'}[locale]],['inventory',{ko:'소지품',en:'Bag',ja:'持ち物'}[locale]],['equipment',{ko:'장비',en:'Equipment',ja:'装備'}[locale]],['skills',{ko:'스킬',en:'Skills',ja:'スキル'}[locale]],['quests',{ko:'받은 의뢰',en:'Accepted',ja:'受注依頼'}[locale]],['journal',{ko:'기록',en:'Journal',ja:'手記'}[locale]],['party',{ko:'파티',en:'Party',ja:'パーティー'}[locale]],['property',{ko:'부동산',en:'Property',ja:'不動産'}[locale]],['economy',{ko:'거래',en:'Trade',ja:'取引'}[locale]],['civic',{ko:'마을 소식',en:'Town affairs',ja:'町の便り'}[locale]],['gm','GM'],['legacy',{ko:'발자취',en:'Legacies',ja:'足跡'}[locale]]];
  const profile=useStore((s)=>s.fantasyProfile);
  const combatState=useStore(s=>s.fantasyCombat);
  const combatSelfId=useStore(s=>s.selfId);
  const finalBattle=!!profile?.death&&!!combatState&&combatState.fighters.some(f=>f.userId===combatSelfId&&f.generation===(profile.generation??1)&&!f.fled)&&(combatState.status==='active'||profile.death.hour===combatState.hour);
  const party=useStore(s=>s.fantasyParty);
  const error=useStore((s)=>s.fantasyError);
  const pending=useStore((s)=>s.fantasyPending);
  const connected=useStore((s)=>s.wsConnected);
  const worldClock=useStore((s)=>s.fantasyClock);
  const session=useStore((s)=>s.session);
  const [selected,setSelected]=useState('hearth');
  const [selectedTab,setTab]=useState<Tab>('location');
  const [showCharacter,setShowCharacter]=useState(false);
  const [chatNpc,setChatNpc]=useState<NpcId|null>(null);
  const [messengerOpen,setMessengerOpen]=useState(false);
  const guildGreeting=useStore(s=>s.fantasyGuildGreeting);
  useEffect(()=>{if(!guildGreeting)return;if(profile?.character?.location===guildGreeting.location&&(profile.generation??1)===guildGreeting.generation&&!profile.combatId&&!profile.activity&&!profile.death){setChatNpc(guildGreeting.npcId);setMessengerOpen(true);}set({fantasyGuildGreeting:null});},[guildGreeting,profile?.character?.location,profile?.generation,profile?.combatId,profile?.activity,profile?.death]);
  const [menuOpen,setMenuOpen]=useState(true);
  const [combatControlsHost,setCombatControlsHost]=useState<HTMLDivElement|null>(null);
  const inCombat=!!profile?.combatId||combatState?.status==='active';
  const gmReply=useStore(s=>s.gmReply);
  useEffect(()=>{if(gmReply)appendFantasyGmResponse(gmReply);},[gmReply]);
  useEffect(()=>{if(chatNpc&&!(chatNpc===FANTASY_MAP_MERCHANT_NPC&&profile?.event===FANTASY_MAP_MERCHANT_EVENT)&&NPC_PUBLIC.find(n=>n.id===chatNpc)?.homeLocation!==profile?.character?.location)setMessengerOpen(false);},[profile?.character?.location,chatNpc]);
  useEffect(()=>{if(!connected||!profile?.character)return;const sync=()=>send({t:'fantasyRealmRequest',domain:'civic',command:{type:'sync'}});sync();const timer=setInterval(sync,10000);return()=>clearInterval(timer);},[connected,session,profile?.generation,profile?.character?.location]);
  const previousLocation=useRef<string|undefined>(undefined);
  useEffect(()=>{if(connected)send({t:'fantasyAction',revision:get().fantasyProfile?.revision??0,action:{type:'sync'}});},[connected,session]);
  useEffect(()=>{const loc=profile?.character?.location;if(loc&&loc!==previousLocation.current){setSelected(loc);previousLocation.current=loc;}},[profile?.character?.location]);
  useEffect(()=>{if(!pending)return;const timer=setTimeout(()=>set({fantasyPending:false,fantasyError:'応答を確認できませんでした。再同期してから続けてください。'}),10000);return()=>clearTimeout(timer);},[pending]);
  const select=(id:string)=>{setSelected(id);setTab('location');};
  const c=profile?.character;
  if(c?.job==='priest')nav.splice(5,0,['priest',{ko:'신앙',en:'Faith',ja:'信仰'}[locale]]);
  if(c?.blackMarketClues?.includes(c.location))nav.splice(11,0,['blackMarket',{ko:'뒷골목 경매',en:'Backstreet auction',ja:'裏通りの競売'}[locale]]);
  const legalBlock=useStore(s=>s.fantasyRealm?.civic.actionBlock);
  const blocked=pending||!connected||!!profile?.activity||!!profile?.combatId||!!legalBlock||!!c?.downed;
  const travelEquipment=!!profile&&fantasyTravelGearAvailable(profile)&&!pending&&connected&&!legalBlock;
  if(c&&(['leader','crimeboss','summoner'].includes(c.job)||fantasyHasWorkerCompany(c)))nav.splice(5,0,['company',{ko:c.job==='leader'?'부대':c.job==='crimeboss'?'조직':c.job==='summoner'?'소환':'고용 전투원',en:'Company',ja:'仲間'}[locale]]);
  if(c&&['mage','priest'].includes(c.job))nav.splice(5,0,['magic',{ko:'마법 조합',en:'Spells',ja:'魔法合成'}[locale]]);
  if(c&&fantasyLifeJob(c)==='alchemist')nav.splice(5,0,['alchemy',{ko:'연금 조합',en:'Alchemy',ja:'錬金調合'}[locale]]);
  nav.push(['ranking',{ko:'랭킹',en:'Rankings',ja:'順位'}[locale]]);
  const tab = nav.some(([id]) => id === selectedTab) ? selectedTab : 'location';
  const travel=profile?.activity?.action.type==='travel'?profile.activity:undefined;
  const travelAction=travel?.action.type==='travel'?travel.action:undefined;
  const journey=c&&travel&&travelAction?{path:fantasyTransports(c,travelAction.destination).find(route=>route.id===travelAction.transport)?.path??[c.location,travelAction.destination],travel:travel.travel,startedAt:travel.startedAt,endsAt:travel.endsAt,hour:worldClock?.hour??c.hour,name:c.name}:c&&fantasyOnRoad(c)&&c.travelPosition?{path:[c.travelPosition.from,c.travelPosition.to],startedAt:0,endsAt:1,hour:c.travelPosition.fraction,name:c.name}:undefined;
  const terrain=fantasyTerrainFrame(profile??undefined,worldClock?.hour,journey?.path);
  const event=profile?.event?FANTASY_EVENTS.find((e)=>e.id===profile.event):null;
  const eventText=event?fantasyEventText(event,locale):null;
  return <section lang={locale} className={`fantasy-panel ${socialOpen?'social-open':''} ${showCharacter?'show-character':''}`} style={terrain.tokens as CSSProperties} data-fr-terrain={terrain.progress>=1?terrain.to.terrain:terrain.from.terrain} data-fr-season={terrain.to.season} aria-label={{ko:'기나긴 여정 RPG',en:'The Long Journey RPG',ja:'悠久の旅路 RPG'}[locale]} aria-busy={pending}>
    <FantasyTerrainAmbience frame={terrain}/>
    <header className="fr-header"><div className="fr-title"><span aria-hidden="true">✦</span><div><h1>{FANTASY_TERMS.find((t)=>t.id==='world-title')?.names[locale]}</h1><small>TONARIUM · A LIFE IN FANTASY</small></div></div><div className="fr-header-actions"><LanguageSelect/>{c&&<button className="fr-btn fr-character-toggle" onClick={()=>setShowCharacter(!showCharacter)}>{{ko:'캐릭터',en:'Character',ja:'人物'}[locale]}</button>}<button className="fr-btn" aria-pressed={socialOpen} onClick={onSocialToggle}>{socialOpen?{ko:'지도 펼치기',en:'Expand map',ja:'地図を広く'}[locale]:{ko:'참가자·채팅',en:'People & chat',ja:'参加者・チャット'}[locale]}</button>{worldClock&&<span className="fr-clock">{clock(worldClock.hour)}</span>}</div></header>
    {(!connected||error)&&<div className="fr-error" role="status">{!connected?{ko:'서버에 다시 연결하고 있습니다.',en:'Reconnecting to the server.',ja:'サーバーに再接続しています。'}[locale]:fantasyErrorText(error??'',locale)}<ReasonButton className="fr-btn" disabled={!connected} onClick={()=>{set({fantasyPending:false});act({type:'sync'});}}>{{ko:'다시 연결',en:'Resync',ja:'再同期'}[locale]}</ReasonButton></div>}
    {!profile?<div className="fr-loading">✦ {{ko:'이야기를 불러오는 중…',en:'Opening your story…',ja:'物語の頁をひらいています…'}[locale]}</div>:!c?<Creation profile={profile}/>:profile.death&&!finalBattle?<FantasyLegacy profile={profile} death onAction={act} blocked={blocked}/>:<>
      <FantasyDownedCare c={c} onAction={act}/><FantasyPartyConsent/><FantasyActivity profile={profile} onCancel={()=>act({type:'cancel'})} onAbandon={()=>act({type:'escortAbandon'})} onRedirect={(destination,transport)=>act({type:'redirect',destination,...(transport?{transport}:{})})}/><div className={`fr-game-layout ${inCombat?'fr-in-combat':''}`}><CharacterCard character={c}/><main className="fr-center">{profile.combatId||finalBattle||(combatState&&combatState.status!=='active')?<FantasyCombatPanel profile={profile} controlsHost={inCombat?combatControlsHost:null}/>:c.dungeon?.active?<FantasyDungeonMap c={c} blocked={blocked} onAction={act}/>:<FantasyMap current={c.location} selected={selected} visited={c.visited} known={fantasyKnownLocations(c)} frontier={fantasyFrontierLocations(c)} onSelect={select} journey={journey}/>}<div className="fr-map-caption"><span>{fantasyOnRoad(c)&&c.travelPosition?`${placeName(c.travelPosition.from)} ↔ ${placeName(c.travelPosition.to)}`:placeName(c.location)}</span><FantasyEnvironment c={{...c,hour:worldClock?.hour??c.hour}}/></div><div className="fr-latest"><p>{fantasyLogText(profile.log.at(-1)?.text??'',locale,c)}</p><button className="fr-text-button" onClick={()=>setTab('journal')}>{{ko:'기록 읽기',en:'Read journal',ja:'手記を読む'}[locale]} ↗</button></div></main><aside className={`fr-detail ${inCombat||menuOpen?'open':'collapsed'} ${inCombat?'fr-combat-detail':''}`}>{inCombat?<div className="fr-combat-sidebar" ref={setCombatControlsHost}/>:<><button type="button" className="fr-detail-toggle" aria-expanded={menuOpen} aria-label={{ko:menuOpen?'모험 메뉴 접기':'모험 메뉴 펼치기',en:menuOpen?'Collapse the adventure menu':'Expand the adventure menu',ja:menuOpen?'冒険メニューを折りたたむ':'冒険メニューを開く'}[locale]} onClick={()=>setMenuOpen(v=>!v)}>{menuOpen?'»':'«'}</button><nav aria-label={{ko:'모험 메뉴',en:'Adventure menu',ja:'冒険メニュー'}[locale]}>{nav.map(([id,name])=><button key={id} aria-pressed={tab===id} className={tab===id?'on':''} onClick={()=>setTab(id)}>{name}</button>)}</nav><FantasyMenuBoundary menu={`${tab}:${selected}:${locale}`}><div className={`fr-detail-content ${tab==='npc'?'fr-npc-content':''}`} key={tab==='location'?selected:tab}>{tab==='location'&&(c.dungeon?.active?<><FantasyDungeonActions c={c} blocked={blocked} onAction={act}/><FantasyOutdoorCooking c={c} blocked={blocked} onAction={act} mageAvailable={useStore.getState().fantasyRealm?.economy?.campMage===true}/></>:<LocationPanel c={c} selected={selected} blocked={blocked}/>)} {tab==='quests'&&<FantasyQuestBoard c={c} onSelect={select} onAction={act} blocked={blocked}/>} {tab==='inventory'&&<FantasyInventory c={c} onAction={act} blocked={blocked} travelEquipment={travelEquipment}/>} {tab==='equipment'&&<FantasyEquipmentPanel c={c} onAction={act} blocked={blocked} travelEquipment={travelEquipment} onInventory={()=>setTab('inventory')}/>} {tab==='skills'&&<SkillsPanel c={c}/>} {tab==='buildings'&&<FantasyTownPanel key={c.location} c={c} onAction={act} onTalk={(id)=>{setChatNpc(id);setMessengerOpen(true);}} blocked={blocked}/>} {tab==='company'&&<FantasyCompanyPanel c={c} onAction={act} blocked={blocked}/>} {tab==='magic'&&<FantasyMagicPanel c={c} onAction={act} blocked={blocked}/>} {tab==='alchemy'&&<FantasyAlchemyPanel c={c} onAction={act} blocked={blocked}/>} {tab==='party'&&<FantasyPartyPanel profile={profile}/>} {tab==='property'&&<FantasyPropertyMenu profile={profile} onAction={act}/>} {(tab==='economy'||tab==='civic'||tab==='blackMarket')&&<FantasyRealmMenu profile={profile} domain={tab}/>} {tab==='priest'&&<FantasyPriestPanel profile={profile} onAction={act}/>} {tab==='ranking'&&<FantasyRankingPanel/>} {tab==='legacy'&&<FantasyLegacy profile={profile} onAction={act}/>} {tab==='journal'&&<Journal profile={profile} onSelect={select} blocked={blocked}/>} {tab==='gm'&&<FantasyGmChat profile={profile} onAction={act} onSelect={select} onTab={(next)=>setTab(next==='jobs'?'buildings':next)} blocked={blocked}/>} </div></FantasyMenuBoundary></>}</aside></div>
      {event&&!profile.activity&&!profile.combatId&&!party?.combatProposal&&<div className="fr-event-backdrop"><div className="fr-event" role="dialog" aria-modal="true" aria-label={eventText?.name}><span className="fr-eyebrow">A TWIST IN YOUR STORY · {fantasyHostileEncounter(event.id)?{ko:'위험한 조우',en:'Hostile encounter',ja:'危険な遭遇'}[locale]:event.job?jobName(event.job):{ko:'종족의 인연',en:'Ancestry encounter',ja:'種族の縁'}[locale]}</span><h2>{eventText?.name}</h2><p>{eventText?.description}</p>{event.id===FANTASY_MAP_MERCHANT_EVENT&&<FantasyMapMerchant onTalk={()=>{setChatNpc(FANTASY_MAP_MERCHANT_NPC);setMessengerOpen(true);}}/>}<div className="fr-event-choices">{event.choices.map((choice)=><div key={choice.id}><Button action={{type:'event',choice:choice.id}} primary>{eventText?.choices[choice.id]??choice.label}</Button></div>)}</div></div></div>}
    </>}
    {profile&&<FantasyDice profile={profile}/>}
    {chatNpc&&!profile?.death&&<FantasyMessenger key={chatNpc} npcId={chatNpc} hidden={!messengerOpen} theme={terrain.tokens} onClose={()=>setMessengerOpen(false)}/>}
    <footer className="fr-footer"><span><i className={connected?'online':''}/>{pending?{ko:'행동 처리 중…',en:'Resolving action…',ja:'行動を確定しています…'}[locale]:connected?{ko:'서버에 저장됨',en:'Saved on server',ja:'サーバーに保存済み'}[locale]:{ko:'연결 대기',en:'Waiting for connection',ja:'接続待ち'}[locale]}</span><span>{FANTASY_TERMS.find((t)=>t.id==='world-title')?.names[locale]}</span></footer>
  </section>;
}
