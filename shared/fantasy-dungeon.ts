import { FANTASY_FRONTIER_LAND } from './fantasy-frontier-data.ts';
import { FANTASY_LOCATIONS } from './fantasy-data.ts';
import type { FantasyCharacter, FantasyProfile, FantasyQuest, FantasyResult, FantasyStat } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_DUNGEONS, type FantasyDungeonRoom } from './fantasy-dungeon-catalog.ts';
import { fantasyWorldCheck, fantasyWorldDamage, fantasyStats } from './fantasy-engine.ts';
import { addFantasyEffect, addFantasyStatus, FANTASY_UTILITY_EFFECT_DEFINITIONS } from './fantasy-effects.ts';
import { FANTASY_DUNGEON_GENERATED_NAMES, generateFantasyDungeon } from './fantasy-dungeon-generator.ts';
import { grantFantasyPractice } from './fantasy-progression.ts';
import { fantasyRegularCombatEnemy } from './fantasy-encounters.ts';
import { fantasyCombatEnemy } from './fantasy-combat-catalog.ts';

export interface FantasyDungeonProgress { layoutSeed?: number; visited?: string[]; surveyed?: string[]; revealed: string[]; inspected: string[]; findings: string[]; detected: string[]; disarmed: string[]; sprung: string[]; cleared: string[]; claimed: string[]; inspectionDays: Record<string, number> }
export interface FantasyDungeonMemory { claimed: string[]; findings: string[]; inspectionDays: Record<string, number> }
export interface FantasyDungeonState { active?: { site: string; room: string }; sites: Record<string, FantasyDungeonProgress>; known?: string[]; memory?: Record<string, FantasyDungeonMemory> }
export type FantasyDungeonAction = { type: 'dungeonEnter'; site: string } | { type: 'dungeonMove'; room: string }
  | { type: 'dungeonChoose'; choice: 'touch' | 'offer' | 'leave' }
  | { type: 'dungeonInspect' | 'dungeonDisarm' | 'dungeonInteract' | 'dungeonExit' };
export interface FantasyDungeonResult extends FantasyResult { discovery?: string; finding?: { site: string; room: string } }
export type FantasyDungeonObjective = Extract<NonNullable<FantasyQuest['objective']>, { type: 'dungeon' }>;
const siteOf = (id: string) => FANTASY_DUNGEONS.find(site => site.id === id);
export function fantasyDungeonSiteFor(c: Pick<FantasyCharacter, 'dungeon'>, id: string) { const site = siteOf(id), seed = c.dungeon?.sites[id]?.layoutSeed; return site && (seed === undefined ? site : generateFantasyDungeon(site, seed)); }
export const fantasyDungeonRoomFor = (c: Pick<FantasyCharacter, 'dungeon'>, site: string, room: string) => fantasyDungeonSiteFor(c, site)?.rooms.find(value => value.id === room);
export const newFantasyDungeonProgress = (layoutSeed?: number): FantasyDungeonProgress => ({ ...(layoutSeed === undefined ? {} : { layoutSeed }), revealed: [], inspected: [], findings: [], detected: [], disarmed: [], sprung: [], cleared: [], claimed: [], inspectionDays: {} });
const remember = (list: string[], id: string) => { if (!list.includes(id)) list.push(id); };
export function rememberFantasyDungeonMemory(c: Pick<FantasyCharacter, 'dungeon'>, site: string): void {
  const dungeon=c.dungeon,progress=dungeon?.sites[site];if(!dungeon||!progress)return;
  dungeon.memory??={};const memory=dungeon.memory[site]??={claimed:[],findings:[],inspectionDays:{}};
  for(const id of progress.claimed)remember(memory.claimed,id);
  for(const id of progress.findings)remember(memory.findings,id);
  for(const [id,day]of Object.entries(progress.inspectionDays))memory.inspectionDays[id]=Math.max(memory.inspectionDays[id]??0,day);
}
export function fantasyDungeonClaimed(c:Pick<FantasyCharacter,'dungeon'>,site:string,room:string):boolean {return !!(c.dungeon?.sites[site]?.claimed.includes(room)||c.dungeon?.memory?.[site]?.claimed.includes(room));}
export function fantasyDungeonInspectionDay(c:Pick<FantasyCharacter,'dungeon'>,site:string,room:string):number|undefined {
  const current=c.dungeon?.sites[site]?.inspectionDays[room],memory=c.dungeon?.memory?.[site]?.inspectionDays[room];
  return current===undefined?memory:memory===undefined?current:Math.max(current,memory);
}
function log(p: FantasyProfile, text: string, kind: FantasyProfile['log'][number]['kind'] = 'story') { p.log.push({ id: Math.max(0, ...p.log.map(value => value.id)) + 1, hour: p.character!.hour, text, kind }); p.log = p.log.slice(-100); }
export const fantasyDungeonSite = siteOf;
export function learnFantasyDungeonMap(c: FantasyCharacter, site: string): boolean { if (!siteOf(site)) return false; c.dungeon ??= { sites: {} }; c.dungeon.known ??= []; if (c.dungeon.known.includes(site)) return false; c.dungeon.known.push(site); return true; }
export function fantasyDungeonCurrent(c: Pick<FantasyCharacter, 'dungeon'>) { const active = c.dungeon?.active; return active && fantasyDungeonRoomFor(c, active.site, active.room); }
export function fantasyDungeonActionHours(_action: FantasyDungeonAction): number { return 0; }
export function isFantasyDungeonAction(value: unknown): value is FantasyDungeonAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>, id = (v: unknown) => typeof v === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(v);
  if (v.type === 'dungeonEnter' || v.type === 'dungeonMove') return Object.keys(v).length === 2 && (v.type === 'dungeonEnter' ? id(v.site) : id(v.room));
  if (v.type === 'dungeonChoose') return Object.keys(v).length === 2 && ['touch', 'offer', 'leave'].includes(String(v.choice));
  return ['dungeonInspect', 'dungeonDisarm', 'dungeonInteract', 'dungeonExit'].includes(String(v.type)) && Object.keys(v).length === 1;
}

export function validFantasyDungeon(c: Pick<FantasyCharacter, 'dungeon' | 'location' | 'hour'>): boolean {
  const value = c.dungeon;
  if (value === undefined) return true;
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!object(value) || Object.keys(value).some(key => !['active', 'sites', 'known', 'memory'].includes(key)) || !object(value.sites) || Object.keys(value.sites).length > FANTASY_DUNGEONS.length
    || value.known !== undefined && (!Array.isArray(value.known) || new Set(value.known).size !== value.known.length || value.known.some(id => typeof id !== 'string' || !siteOf(id)))) return false;
  for (const [id, progress] of Object.entries(value.sites)) {
    const site = fantasyDungeonSiteFor(c, id);
    if (!site || !object(progress) || ![9, 10, 11, 12].includes(Object.keys(progress).length) || Object.keys(progress).some(key => !['revealed', 'visited', 'surveyed', 'inspected', 'findings', 'detected', 'disarmed', 'sprung', 'cleared', 'claimed', 'inspectionDays', 'layoutSeed'].includes(key))) return false;
    if (Object.hasOwn(progress, 'layoutSeed') && (!Number.isSafeInteger(progress.layoutSeed) || Number(progress.layoutSeed) < 1 || Number(progress.layoutSeed) > 0xffffffff)) return false;
    if (['revealed', 'inspected', 'findings', 'detected', 'disarmed', 'sprung', 'cleared', 'claimed'].some(key => !Array.isArray(progress[key as keyof FantasyDungeonProgress]))) return false;
    if (progress.visited !== undefined && !Array.isArray(progress.visited) || progress.surveyed !== undefined && !Array.isArray(progress.surveyed)) return false;
    if (!object(progress.inspectionDays) || Object.entries(progress.inspectionDays).some(([id, day]) => !progress.inspected.includes(id) || !Number.isSafeInteger(day) || Number(day) < 0 || Number(day) > Math.floor(c.hour / 24))) return false;
    for (const [key, list] of Object.entries(progress).filter(([key]) => key !== 'inspectionDays' && key !== 'layoutSeed')) if (!Array.isArray(list) || new Set(list).size !== list.length || list.some(id => typeof id !== 'string' || !site.rooms.some(room => room.id === id)
      || key !== 'revealed' && !progress.revealed.includes(id)
      || ['detected', 'disarmed', 'sprung'].includes(key) && !site.rooms.find(room => room.id === id)?.trap
      || key === 'cleared' && !site.rooms.find(room => room.id === id)?.enemy
      || key === 'claimed' && !site.rooms.find(room => room.id === id)?.reward && !site.rooms.find(room => room.id === id)?.discovery && !site.rooms.find(room => room.id === id)?.special)) return false;
    if (progress.findings.some(id => !progress.inspected.includes(id)) || progress.disarmed.some(id => !progress.detected.includes(id))) return false;
  }
  if(value.memory!==undefined){
    if(!object(value.memory)||Object.keys(value.memory).length>FANTASY_DUNGEONS.length)return false;
    for(const [id,memory]of Object.entries(value.memory)){
      const site=siteOf(id);if(!site||!value.sites[id]||!object(memory)||Object.keys(memory).length!==3||Object.keys(memory).some(key=>!['claimed','findings','inspectionDays'].includes(key)))return false;
      const known=(id:unknown,claim=false)=>{
        if(typeof id!=='string')return false;const core=site.rooms.find(room=>room.id===id);if(core)return !claim||!!(core.reward||core.discovery||core.special);
        const match=/^chamber-([1-9][0-9]?)$/.exec(id),n=match?Number(match[1]):0;
        return n>=1&&n<=18-site.rooms.length&&(!claim||n<=3||n%2===1);
      };
      for(const key of ['claimed','findings']as const){const list=memory[key];if(!Array.isArray(list)||list.length>18||new Set(list).size!==list.length||list.some(id=>!known(id,key==='claimed')))return false;}
      if(!object(memory.inspectionDays)||Object.keys(memory.inspectionDays).length>18||Object.entries(memory.inspectionDays).some(([id,day])=>!known(id)||!Number.isSafeInteger(day)||Number(day)<0||Number(day)>Math.floor(c.hour/24)))return false;
    }
  }
  const active = value.active;
  return active === undefined || object(active) && Object.keys(active).length === 2 && typeof active.site === 'string' && typeof active.room === 'string'
    && !!fantasyDungeonRoomFor(c, active.site, active.room) && siteOf(active.site)!.location === c.location && !!value.sites[active.site]?.revealed.includes(active.room);
}

export function fantasyDungeonQuestProgress(c: Pick<FantasyCharacter, 'dungeon'>, quest: Pick<FantasyQuest, 'objective'>): number {
  const objective = quest.objective; if (objective?.type !== 'dungeon') return 0;
  const site = fantasyDungeonSiteFor(c, objective.site), progress = c.dungeon?.sites[objective.site]; if (!site || !progress) return 0;
  return Math.min(objective.count, objective.goal === 'inspect' ? new Set([...progress.findings,...(c.dungeon?.memory?.[objective.site]?.findings??[])]).size : site.rooms.filter(room => room.enemy?.boss && progress.cleared.includes(room.id)).length);
}
export function fantasyDungeonQuestReady(c: Pick<FantasyCharacter, 'dungeon' | 'quests' | 'completed'>, quest: FantasyQuest): boolean { return quest.objective?.type === 'dungeon' && c.quests.includes(quest.id) && !c.completed.includes(quest.id) && fantasyDungeonQuestProgress(c, quest) >= quest.objective.count; }
export function fantasyDungeonObjectiveLabel(quest: Pick<FantasyQuest, 'objective'>, locale: NpcLocale): string | undefined {
  if (quest.objective?.type !== 'dungeon') return;
  const site = siteOf(quest.objective.site); if (!site) return;
  return quest.objective.goal === 'inspect' ? ({ ko: `${site.names.ko} 방 조사`, en: `Investigate rooms in ${site.names.en}`, ja: `${site.names.ja}の部屋を調査` })[locale]
    : ({ ko: `${site.names.ko} 수호자 격파`, en: `Defeat the guardian of ${site.names.en}`, ja: `${site.names.ja}の守り手を倒す` })[locale];
}

export function fantasyDungeonActionError(profile: FantasyProfile, action: FantasyDungeonAction): string | undefined {
  if (!isFantasyDungeonAction(action)) return '探索の指定が正しくありません。';
  const c = profile.character;
  if (!c || profile.death || c.hp <= 0 || profile.activity || profile.combatId || profile.event) return 'いまの行動や出来事を先に終えてください。';
  if (!validFantasyDungeon(c)) return '探索記録を確認できません。';
  if (action.type === 'dungeonEnter') {
    const site = siteOf(action.site); if (!site || site.location !== c.location || c.dungeon?.active || c.travelPosition) return 'この場所からその入口へは進めません。';
    if (FANTASY_LOCATIONS.find(place=>place.id===site.location)?.land===FANTASY_FRONTIER_LAND&&!c.dungeon?.known?.includes(site.id)) return '場所を発見するか地図を読んでから進んでください。';
    if (!c.charted.includes(site.location) && !c.visited.includes(site.location)) return '場所を発見するか地図を読んでから進んでください。';
    if (site.prerequisite && !c.dungeon?.known?.includes(site.id) && !c.inventory[`map-dungeon-${site.id}`] && !siteOf(site.prerequisite)!.rooms.filter(room => room.enemy?.boss).every(room => c.dungeon?.sites[site.prerequisite!]?.cleared.includes(room.id))) return '下層の地図を持つか、上層の守り手を越えてください。';
    return;
  }
  const active = c.dungeon?.active, room = fantasyDungeonCurrent(c); if (!active || !room) return '先に遺跡や洞窟へ入ってください。';
  const progress = c.dungeon!.sites[active.site];
  if (action.type === 'dungeonChoose' && (!room.special || fantasyDungeonClaimed(c,active.site,room.id) || room.enemy && !progress.cleared.includes(room.id))) return 'この部屋には選べる仕掛けが残っていません。';
  if (action.type === 'dungeonChoose' && action.choice === 'offer' && !(c.inventory.herb > 0)) return '供える薬草が必要です。';
  if (action.type === 'dungeonInspect' && fantasyDungeonInspectionDay(c,active.site,room.id) === Math.floor(c.hour / 24)) return 'この部屋は今日すでに調べました。新しい日に再確認できます。';
  if (action.type === 'dungeonExit' && active.room !== siteOf(active.site)!.entry) return '出口へ戻ってから外へ出てください。';
  if (action.type === 'dungeonMove' && (!room.exits.includes(action.room) || room.enemy && !progress.cleared.includes(room.id) && !(progress.visited ?? progress.revealed).includes(action.room))) return '相手を退けるか、来た道を戻ってください。';
  if (action.type === 'dungeonDisarm' && (!room.trap || !progress.detected.includes(room.id) || progress.disarmed.includes(room.id) || progress.sprung.includes(room.id))) return '解除できる罠は見つかっていません。';
  if (action.type === 'dungeonInteract' && (room.enemy && !progress.cleared.includes(room.id) || !room.reward && !room.discovery || fantasyDungeonClaimed(c,active.site,room.id))) return '守り手を倒し、まだ調べていない品を確認してください。';
  return;
}

export function fantasyDungeonContextBonus(c: FantasyCharacter, disarm = false): number {
  return (c.job === 'thief' ? disarm ? 3 : 2 : c.job === 'ranger' ? disarm ? 1 : 3 : 0)
    + (/elf/.test(c.race) || ['foxkin', 'wolfkin', 'catkin', 'rabbitkin', 'birdkin'].includes(c.race) ? 1 : 0);
}
function check(p: FantasyProfile, stat: FantasyStat, dc: number, rng: () => number, label: string, context: number): boolean {
  const c = p.character!, success = fantasyWorldCheck(p, stat, dc, rng, label, context);
  if (['thief', 'ranger'].includes(c.job)) grantFantasyPractice(c, { key: `dungeon:${c.dungeon!.active!.site}:${stat}`, amount: 2, success });
  return success;
}
function trigger(p: FantasyProfile, room: FantasyDungeonRoom, rng: () => number, failedDisarm = false): void {
  const c = p.character!, active = c.dungeon!.active!, progress = c.dungeon!.sites[active.site], trap = room.trap;
  if (!trap || progress.disarmed.includes(room.id) || progress.sprung.includes(room.id)) return;
  remember(progress.detected, room.id); remember(progress.sprung, room.id);
  if (!failedDisarm && check(p, 'agility', trap.detect, rng, '罠から身をかわす', fantasyDungeonContextBonus(c))) return;
  log(p, '罠が作動した。', 'failure'); fantasyWorldDamage(p, trap.damage);
  if (p.death || c.hp <= 0) delete c.dungeon!.active;
  else if (trap.effect && c.dungeon!.active === active) addFantasyStatus(c, trap.effect);
}

export function applyFantasyDungeonAction(profile: FantasyProfile, action: FantasyDungeonAction, rng = Math.random): FantasyDungeonResult {
  const error = fantasyDungeonActionError(profile, action); if (error) return { profile, changed: false, error };
  const p = structuredClone(profile), c = p.character!; c.dungeon ??= { sites: {} };
  if (action.type === 'dungeonEnter') {
    const site = siteOf(action.site)!, progress = c.dungeon.sites[site.id] ??= newFantasyDungeonProgress(1 + Math.floor(Math.max(0, Math.min(.999999999999, rng())) * 0xffffffff)); progress.visited ??= [...progress.revealed]; remember(progress.revealed, site.entry); remember(progress.visited, site.entry); c.dungeon.active = { site: site.id, room: site.entry };
    log(p, `${site.names.ja}へ足を踏み入れた。`);
  } else {
    const active = c.dungeon.active!, room = fantasyDungeonRoomFor(c, active.site, active.room)!, progress = c.dungeon.sites[active.site];
    if (action.type === 'dungeonExit') { delete c.dungeon.active; log(p, '入口から地上へ戻った。'); }
    if (action.type === 'dungeonMove') { trigger(p, room, rng); if (!p.death && c.dungeon.active === active) { progress.visited ??= [...progress.revealed]; active.room = action.room; remember(progress.revealed, action.room); remember(progress.visited, action.room); log(p, `${fantasyDungeonRoomFor(c, active.site, action.room)!.names.ja}へ進んだ。`); } }
    if (action.type === 'dungeonInspect') {
      progress.surveyed ??= [...progress.inspected]; remember(progress.surveyed, room.id);
      remember(progress.inspected, room.id); progress.inspectionDays[room.id] = Math.floor(c.hour / 24); rememberFantasyDungeonMemory(c,active.site); c.fatigue = Math.min(100, c.fatigue + 1);
      const success = check(p, 'intelligence', room.trap?.detect ?? 12, rng, '部屋の痕跡と仕掛けを調べる', fantasyDungeonContextBonus(c));
      if (success) { remember(progress.findings, room.id); rememberFantasyDungeonMemory(c,active.site); if (room.trap) remember(progress.detected, room.id); p.revision++; return { profile: p, changed: true, finding: { site: active.site, room: room.id } }; }
    }
    if (action.type === 'dungeonDisarm') { if (check(p, 'dexterity', room.trap!.disarm, rng, '罠の仕掛けを解除する', fantasyDungeonContextBonus(c, true))) remember(progress.disarmed, room.id); else trigger(p, room, rng, true); }
    if (action.type === 'dungeonChoose') {
      remember(progress.claimed, room.id); rememberFantasyDungeonMemory(c,active.site);
      if (action.choice === 'leave') log(p, '不思議な仕掛けには触れず、立ち去ることにした。');
      else {
        if (action.choice === 'offer') c.inventory.herb--;
        const roll = Math.max(0, Math.min(.999999999, rng())), healing = room.special === 'spring';
        if (action.choice === 'touch' && roll < .25 + (progress.layoutSeed ?? 0) % 11 / 100) { addFantasyStatus(c, 'weakness'); log(p, '仕掛けの呪いを受けた。', 'failure'); }
        else if (healing) { c.hp = Math.min(fantasyStats(c).hp, c.hp + Math.max(1, Math.ceil(fantasyStats(c).hp * .35))); log(p, '不思議な泉が傷を癒した。', 'success'); }
        else { const id = room.special === 'shrine' ? 'skill-resolve' : 'skill-clarity'; addFantasyEffect(c, { id, ...FANTASY_UTILITY_EFFECT_DEFINITIONS[id] }); log(p, '仕掛けから一時の加護を授かった。', 'success'); }
      }
    }
    if (action.type === 'dungeonInteract') {
      trigger(p, room, rng); if (!p.death && c.dungeon.active === active) { remember(progress.claimed, room.id); rememberFantasyDungeonMemory(c,active.site); c.gold += room.reward?.gold ?? 0; if (room.reward?.item) c.inventory[room.reward.item] = (c.inventory[room.reward.item] ?? 0) + (room.reward.count ?? 1); log(p, '部屋に残された品と記録を確かめた。', 'success');
        p.revision++; return { profile: p, changed: true, ...(room.discovery ? { discovery: room.discovery } : {}) }; }
    }
    if (action.type !== 'dungeonInspect') c.fatigue = Math.min(100, c.fatigue + 1);
  }
  p.revision++; return { profile: p, changed: true };
}

export function fantasyDungeonCombatPlan(c: FantasyCharacter, target: string) {
  const active = c.dungeon?.active, room = fantasyDungeonCurrent(c);
  if (!active || target !== `${active.site}:${active.room}` || !room?.enemy || c.dungeon!.sites[active.site].cleared.includes(active.room)) return;
  const original = fantasyCombatEnemy(room.enemy.template);
  const enemy = FANTASY_LOCATIONS.find(place=>place.id===c.location)?.land===FANTASY_FRONTIER_LAND?original:fantasyRegularCombatEnemy(c, `dungeon:${target}`, original?.kind === 'human' ? 'person' : 'monster');
  if (!enemy) return;
  return { source: `dungeon:${target}`, victoryKey: `dungeon:${target}`, enemies: [{ id: room.enemy.boss ? 'dungeon-boss' : 'dungeon-guard', template: enemy.id, position: 'front' as const }] };
}
export function markFantasyDungeonVictory(c: FantasyCharacter, target: string): boolean {
  const active = c.dungeon?.active; if (!active || target !== `${active.site}:${active.room}` || !fantasyDungeonCurrent(c)?.enemy) return false;
  const progress = c.dungeon!.sites[active.site]; if (progress.cleared.includes(active.room)) return false; remember(progress.cleared, active.room); return true;
}
// 情報だけを共有し、個人の罠・消費・受領記録は上書きしない。
export function shareFantasyDungeonFinding(c: FantasyCharacter, site: string, room: string): boolean {
  if (c.dungeon?.active?.site !== site || c.dungeon.active.room !== room || !fantasyDungeonRoomFor(c, site, room)) return false;
  const progress = c.dungeon.sites[site]; remember(progress.inspected, room); remember(progress.findings, room); rememberFantasyDungeonMemory(c,site); if (fantasyDungeonRoomFor(c, site, room)!.trap) remember(progress.detected, room); return true;
}

export function fantasyDungeonView(c: Pick<FantasyCharacter, 'dungeon' | 'location' | 'hour'> & Partial<Pick<FantasyCharacter, 'inventory'>>, locale: NpcLocale) {
  const active = c.dungeon?.active, site = active && fantasyDungeonSiteFor(c, active.site), progress = active && c.dungeon?.sites[active.site]; if (!active || !site || !progress) return null;
  const current = fantasyDungeonRoomFor(c, active.site, active.room)!;
  return { site: site.id, name: site.names[locale], description: site.descriptions[locale], room: current.id, roomName: current.names[locale], roomDescription: current.descriptions[locale], canExit: current.id === site.entry,
    rooms: site.rooms.filter(room => progress.revealed.includes(room.id)).map(room => ({ id: room.id, name: room.names[locale], x: room.x, y: room.y, exits: room.exits.filter(id => progress.revealed.includes(id)), inspected: progress.findings.includes(room.id), cleared: progress.cleared.includes(room.id) })),
    exits: current.exits.map(id => ({ id, name: progress.revealed.includes(id) ? fantasyDungeonRoomFor(c, site.id, id)!.names[locale] : ({ ko: '살펴보지 않은 통로', en: 'Unexplored passage', ja: '未探索の通路' })[locale] })),
    ...(current.trap && progress.detected.includes(current.id) ? { trap: { disarmed: progress.disarmed.includes(current.id), spent: progress.sprung.includes(current.id) } } : {}),
    ...(current.enemy && !progress.cleared.includes(current.id) ? { combat: { target: `${site.id}:${current.id}`, boss: !!current.enemy.boss } } : {}),
    canCamp: fantasyDungeonCanCamp(c),
    ...(current.special ? { special: { kind: current.special, claimed: fantasyDungeonClaimed(c,site.id,current.id), canOffer: !fantasyDungeonClaimed(c,site.id,current.id) && (c.inventory?.herb ?? 0) > 0 } } : {}),
    canInspect: fantasyDungeonInspectionDay(c,site.id,current.id) !== Math.floor(c.hour / 24),
    canInteract: !!(current.discovery || current.reward) && !fantasyDungeonClaimed(c,site.id,current.id) && (!current.enemy || progress.cleared.includes(current.id)) };
}

export function fantasyDungeonLogText(text: string, locale: NpcLocale): string | undefined {
  for (const site of FANTASY_DUNGEONS) {
    if (text === `${site.names.ja}へ足を踏み入れた。`) return ({ ko: `${site.names.ko}에 들어섰다.`, en: `Entered ${site.names.en}.`, ja: text })[locale];
    for (const room of site.rooms) if (text === `${room.names.ja}へ進んだ。`) return ({ ko: `${room.names.ko}(으)로 이동했다.`, en: `Moved to ${room.names.en}.`, ja: text })[locale];
  }
  for (const names of FANTASY_DUNGEON_GENERATED_NAMES) if (text === `${names.ja}へ進んだ。`) return ({ ko: `${names.ko}(으)로 이동했다.`, en: `Moved to ${names.en}.`, ja: text })[locale];
  const fixed: Record<string, [string, string]> = {
    '不思議な仕掛けには触れず、立ち去ることにした。': ['신비한 장치에 손대지 않기로 했다.', 'Left the mysterious mechanism untouched.'],
    '仕掛けの呪いを受けた。': ['장치의 저주에 걸렸다.', 'The mechanism inflicted a curse.'],
    '不思議な泉が傷を癒した。': ['신비한 샘이 상처를 치유했다.', 'The mysterious spring healed your wounds.'],
    '仕掛けから一時の加護を授かった。': ['장치에서 일시적인 가호를 받았다.', 'The mechanism granted a temporary blessing.'],
    '部屋の痕跡と仕掛けを調べる': ['방의 흔적과 장치 조사', 'Inspect room traces and mechanisms'],
    '罠の仕掛けを解除する': ['함정 장치 해제', 'Disarm the trap'],
    '罠から身をかわす': ['함정 회피', 'Avoid the trap'],
    '入口から地上へ戻った。': ['입구를 통해 지상으로 돌아왔다.', 'Returned to the surface through the entrance.'],
    '罠が作動した。': ['함정이 작동했다.', 'The trap was triggered.'],
    '部屋に残された品と記録を確かめた。': ['방에 남은 물품과 기록을 확인했다.', 'Claimed the room’s remaining objects and records.'],
    '仲間と遺跡の守り手を退け、この部屋の先へ進めるようになった。': ['동료들과 수호자를 물리쳐 이 방 너머로 나아갈 수 있게 됐다.', 'The guardian fell. The way beyond this room is open.'],
  };
  if (fixed[text]) return locale === 'ja' ? text : fixed[text][locale === 'ko' ? 0 : 1];
  const damage = /^罠で(\d+)の傷を負った。$/.exec(text);
  if (damage) return ({ ko: `함정으로 ${damage[1]} 피해를 입었다.`, en: `The trap dealt ${damage[1]} damage.`, ja: text })[locale];
  const roll = /^(部屋の痕跡と仕掛けを調べる|罠の仕掛けを解除する|罠から身をかわす)：d20=(\d+)、補正([+-]?\d+)、合計(-?\d+) \/ DC(\d+) → (成功|失敗)$/.exec(text);
  if (!roll) return;
  const labels: Record<string, [string, string]> = { '部屋の痕跡と仕掛けを調べる': ['방의 흔적과 장치 조사', 'Inspect room traces and mechanisms'], '罠の仕掛けを解除する': ['함정 장치 해제', 'Disarm the trap'], '罠から身をかわす': ['함정 회피', 'Avoid the trap'] };
  return locale === 'ja' ? text : locale === 'ko' ? `${labels[roll[1]][0]}: d20=${roll[2]}, 보정${roll[3]}, 합계${roll[4]} / DC${roll[5]} → ${roll[6] === '成功' ? '성공' : '실패'}`
    : `${labels[roll[1]][1]}: d20=${roll[2]}, modifier ${roll[3]}, total ${roll[4]} / DC${roll[5]} → ${roll[6] === '成功' ? 'Success' : 'Failure'}`;
}
export function fantasyDungeonErrorText(text: string, locale: NpcLocale): string | undefined {
  const errors: Record<string, [string, string]> = {
    'この部屋には選べる仕掛けが残っていません。': ['이 방에는 선택할 장치가 남아 있지 않습니다.', 'No unclaimed mechanism remains in this room.'],
    '供える薬草が必要です。': ['바칠 약초가 필요합니다.', 'You need an herb to make an offering.'],
    '野営する前に部屋の安全を調べてください。': ['야영 전에 방의 안전을 조사하세요.', 'Inspect the room before making camp.'],
    '敵や罠を片付けてから野営してください。': ['적과 함정을 처리한 뒤 야영하세요.', 'Clear the enemies and resolve the traps before camping.'],
    '探索の指定が正しくありません。': ['탐색 요청이 올바르지 않습니다.', 'The exploration request is invalid.'],
    '探索記録を確認できません。': ['탐색 기록을 확인할 수 없습니다.', 'The exploration record is invalid.'],
    'この場所からその入口へは進めません。': ['이곳에서 해당 입구로 들어갈 수 없습니다.', 'That entrance cannot be reached from here.'],
    '場所を発見するか地図を読んでから進んでください。': ['장소를 발견하거나 지도를 읽은 뒤 들어가세요.', 'Discover the site or read its map before entering.'],
    '下層の地図を持つか、上層の守り手を越えてください。': ['심층 지도를 익히거나 윗동굴의 수호자를 물리치세요.', 'Learn the depths map or defeat the upper cavern’s guardian.'],
    '先に遺跡や洞窟へ入ってください。': ['먼저 유적이나 동굴에 들어가세요.', 'Enter a ruin or cavern first.'],
    'この部屋は今日すでに調べました。新しい日に再確認できます。': ['오늘은 이 방을 이미 조사했습니다. 다음 날 다시 확인할 수 있습니다.', 'You have inspected this room today. Try again on a new day.'],
    '出口へ戻ってから外へ出てください。': ['입구로 돌아가면 밖으로 나갈 수 있습니다.', 'Return to the entrance before leaving.'],
    '相手を退けるか、来た道を戻ってください。': ['상대를 물리치거나 왔던 길로 돌아가세요.', 'Defeat the guard or retreat along a known passage.'],
    '解除できる罠は見つかっていません。': ['해제할 수 있는 함정을 발견하지 못했습니다.', 'No trap is available to disarm.'],
    '守り手を倒し、まだ調べていない品を確認してください。': ['수호자를 물리친 뒤 아직 챙기지 않은 물품을 확인하세요.', 'Defeat the guard and choose objects you have not already claimed.'],
  };
  return errors[text] ? locale === 'ja' ? text : errors[text][locale === 'ko' ? 0 : 1] : undefined;
}

export function fantasyDungeonCampError(c: Pick<FantasyCharacter, 'dungeon'>): string | undefined {
  const active = c.dungeon?.active, room = fantasyDungeonCurrent(c), progress = active && c.dungeon?.sites[active.site];
  if (!active || !room || !progress || !progress.revealed.includes(room.id) || !progress.inspected.includes(room.id)) return '野営する前に部屋の安全を調べてください。';
  if (room.enemy && !progress.cleared.includes(room.id) || room.trap && !progress.disarmed.includes(room.id) && !progress.sprung.includes(room.id)) return '敵や罠を片付けてから野営してください。';
}
export function fantasyDungeonCanCamp(c: Pick<FantasyCharacter, 'dungeon'>): boolean { return !fantasyDungeonCampError(c); }
