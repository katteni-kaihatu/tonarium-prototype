import { recordFantasyCombatContribution as receipt, recordFantasyCombatAid as aidReceipt } from './fantasy-combat-contribution.ts';
import type { FantasyCombatError, FantasyCombatFighter, FantasyCombatLog, FantasyCombatSkill, FantasyCombatState, FantasyCombatText } from './fantasy-combat.ts';
import { fantasyCombatPlace, type FantasyCombatTile } from './fantasy-combat-tactics.ts';
import { fantasyCombatEnemy } from './fantasy-combat-catalog.ts';
import { FANTASY_LAST_DAWN, FANTASY_LAST_DAWN_SKILL, FANTASY_LAST_DAWN_AWAKENING, FANTASY_LAST_DAWN_QUOTE, FANTASY_MIRACLES } from './fantasy-miracle-catalog.ts';

export type FantasySoulAffliction = 'curse' | 'possession' | 'soul-binding';
export interface FantasyMiracleFighterState {
  cooldowns?: Record<string, number>;
  anchor?: { source: string; round: number; heal: number };
  burden?: { source: string; round: number };
  lastAnchorTarget?: string;
  lastAnchoredRound?: number;
  safeTile?: { tile: FantasyCombatTile; round: number };
  downedKind?: 'damage' | 'sacrifice';
  severity?: 1 | 2 | 3;
  dawnDebt?: boolean;
  afflictions?: FantasySoulAffliction[];
}
type Writer = (text: FantasyCombatText, presentation?: FantasyCombatLog['presentation']) => void;
const text = (ko: string, en: string, ja: string): FantasyCombatText => ({ ko, en, ja });
const all = (s: FantasyCombatState) => [...s.fighters, ...(s.units ?? [])];
const nearby = (a: FantasyCombatFighter, b: FantasyCombatFighter, reach: number) => !a.tile || !b.tile || Math.abs(a.tile.x - b.tile.x) + Math.abs(a.tile.y - b.tile.y) <= reach;
const memory = (f: FantasyCombatFighter) => f.miracles ??= {};
export const fantasyMiracleSkill = (id: string) => id === FANTASY_LAST_DAWN ? FANTASY_LAST_DAWN_SKILL : FANTASY_MIRACLES.find(m => m.id === id)?.skill;
export const fantasyCombatSaint = (f: FantasyCombatFighter) => f.vocation?.job === 'priest' && f.vocation.path === 'priest-saint';
export function fantasyLastDawnAvailable(state: FantasyCombatState, actor: FantasyCombatFighter): boolean {
  const allies = state.fighters.filter(f => f.side === 'players' && f.userId && f.id !== actor.id && !f.fled);
  return state.status === 'active' && fantasyCombatSaint(actor) && actor.hp > 0 && !actor.fled && !actor.miracles?.dawnDebt && allies.length > 0 && allies.filter(f => f.hp === 0).length > allies.length / 2 && state.fighters.some(f => f.side === 'enemies' && f.hp > 0 && !f.fled && (fantasyCombatEnemy(f.template ?? '')?.tier ?? 0) >= 7);
}
export function refreshFantasyMiracleAwakening(state: FantasyCombatState, write?: Writer): void {
  for (const actor of state.fighters.filter(f => f.userId)) {
    const known = actor.skills.some(s => s.id === FANTASY_LAST_DAWN), available = fantasyLastDawnAvailable(state, actor);
    if (available && !known) { actor.skills.push(structuredClone(FANTASY_LAST_DAWN_SKILL)); write?.(FANTASY_LAST_DAWN_AWAKENING, { kind: 'miracle', actor: actor.id, skill: 'miracle-last-dawn-awakening' }); }
    if (!available && known) actor.skills = actor.skills.filter(s => s.id !== FANTASY_LAST_DAWN);
  }
}
export function fantasyMiracleOrderError(state: FantasyCombatState, actor: FantasyCombatFighter, target: FantasyCombatFighter | undefined, skill: FantasyCombatSkill): FantasyCombatError | undefined {
  if (!fantasyMiracleSkill(skill.id)) return;
  if (!fantasyCombatSaint(actor) || !actor.userId) return 'not-owner';
  if (skill.id === 'miracle-return-lantern') return 'blocked';
  if (skill.id === FANTASY_LAST_DAWN) return fantasyLastDawnAvailable(state, actor) ? undefined : 'unnecessary';
  if ((actor.miracles?.cooldowns?.[skill.id] ?? 0) > state.round) return 'cooldown';
  if (actor.mp < skill.mp) return 'mana';
  if (!target || target.side !== 'players' || target.fled || (skill.id==='miracle-rekindle'?target.hp!==0||!target.userId||!!target.miracles?.dawnDebt||target.miracles?.downedKind==='sacrifice':target.hp<=0)) return 'target';
  if (!nearby(actor, target, skill.reach ?? 5)) return 'range';
  if (['miracle-soul-anchor','miracle-burden-wounds'].includes(skill.id)&&target.id===state.escort?.wagon.id)return 'target';
  if (skill.id === 'miracle-soul-anchor' && (actor.miracles?.lastAnchorTarget === target.id || (target.miracles?.lastAnchoredRound ?? -2) >= state.round-1 || target.miracles?.anchor || target.miracles?.burden)) return 'unnecessary';
  if (skill.id === 'miracle-burden-wounds' && (actor.id === target.id || target.miracles?.anchor || target.miracles?.burden)) return 'target';
  if (skill.id === 'miracle-sacred-severance' && !all(state).some(f => f.side === 'players' && f.hp > 0 && nearby(target, f, 2) && f.miracles?.afflictions?.length)) return 'unnecessary';
  if (skill.id === 'miracle-unfailing-cup' && !all(state).some(f => f.side === 'players' && f.id !== actor.id && f.hp > 0 && !f.fled && nearby(actor, f, 5) && f.mp < f.stats.mp)) return 'unnecessary';
}
export function castFantasyMiracle(state: FantasyCombatState, actor: FantasyCombatFighter, target: FantasyCombatFighter | undefined, skill: FantasyCombatSkill, write: Writer): boolean {
  if (!fantasyMiracleSkill(skill.id) || fantasyMiracleOrderError(state, actor, target, skill)) return false;
  if(skill.id==='miracle-rekindle'&&state.battlefield){const probe=structuredClone(state),patient=probe.fighters.find(f=>f.id===target!.id);if(!patient?.tile||!fantasyCombatPlace(probe,patient,patient.tile))return false;}
  const before = new Map(all(state).map(f => [f.id, { hp: f.hp, mp: f.mp }]));
  const m = memory(actor); actor.mp -= skill.mp;
  const entry = FANTASY_MIRACLES.find(m => m.id === skill.id);
  if (entry) (m.cooldowns ??= {})[skill.id] = state.round + entry.cooldown;
  const collapse = () => { actor.hp = 0; m.downedKind = 'sacrifice'; delete m.anchor; delete m.burden; };
  if (skill.id === 'miracle-rekindle') { if(state.battlefield&&(!target!.tile||!fantasyCombatPlace(state,target!,target!.tile)))return false; target!.hp=Math.max(1,Math.ceil(target!.stats.hp*.35)); if(target!.miracles){delete target!.miracles.downedKind;delete target!.miracles.severity;} target!.effects=[]; }
  if (skill.id === 'miracle-soul-anchor') { memory(target!).lastAnchoredRound = state.round; memory(target!).anchor = { source: actor.id, round: state.round, heal: Math.ceil(target!.stats.hp * .18) }; m.lastAnchorTarget = target!.id; }
  if (skill.id === 'miracle-burden-wounds') memory(target!).burden = { source: actor.id, round: state.round };
  if (skill.id === 'miracle-divide-calamity' && target!.tile) m.safeTile = { tile: { ...target!.tile }, round: state.round };
  if (skill.id === 'miracle-sacred-severance') for (const f of all(state)) if (f.side === 'players' && f.hp > 0 && nearby(target!, f, 2) && f.miracles) delete f.miracles.afflictions;
  if (skill.id === 'miracle-unfailing-cup') {
    for (const f of all(state)) if (f.side === 'players' && f.id !== actor.id && f.hp > 0 && !f.fled && nearby(actor, f, 5)) f.mp = Math.min(f.stats.mp, f.mp + Math.ceil(f.stats.mp * .6));
    collapse();
  }
  if (skill.id === FANTASY_LAST_DAWN) {
    for (const f of all(state)) {
      if (f.fled||f.side==='enemies'&&f.hp<=0) continue;
      if (f.side === 'enemies') { const dealt=Math.min(f.hp,Math.round(actor.stats.intelligence * 8 + actor.stats.attack * 3 + actor.stats.hp * 2)); f.hp-=dealt; write(text(`${f.names.ko}: 마지막 새벽의 빛으로 ${dealt} 성속성 피해.`,`${f.names.en}: ${dealt} holy damage from the last dawn.`,`${f.names.ja}：最後の夜明けの光で聖属性${dealt}ダメージ。`)); }
      else if (f.id !== actor.id && !f.miracles?.dawnDebt && f.miracles?.downedKind !== 'sacrifice') { if(f.hp===0&&state.battlefield&&(!f.tile||!fantasyCombatPlace(state,f,f.tile)))continue; f.hp = Math.min(f.stats.hp, f.hp + Math.ceil(f.stats.hp * .55)); if (f.miracles) delete f.miracles.downedKind; f.effects = []; }
    }
    m.dawnDebt = true; collapse(); write(FANTASY_LAST_DAWN_QUOTE, { kind: 'miracle', actor: actor.id, ...(actor.tile ? { from: { ...actor.tile } } : {}), ...(target?.tile ? { to: { ...target.tile } } : {}), skill: skill.id, element: 'holy' });
  } else write(text(`${actor.names.ko}: ${skill.names.ko}.`, `${actor.names.en}: ${skill.names.en}.`, `${actor.names.ja}：${skill.names.ja}。`), { kind: 'miracle', actor: actor.id, target: target!.id, ...(actor.tile ? { from: { ...actor.tile } } : {}), ...(target!.tile ? { to: { ...target!.tile } } : {}), skill: skill.id, element: 'holy' });
  for (const f of all(state)) { const prior = before.get(f.id)!; if (f.side === actor.side) { aidReceipt(actor, f, 'healing', Math.max(0, f.hp - prior.hp)); receipt(actor, 'mana', Math.max(0, f.mp - prior.mp)); if (prior.hp === 0 && f.hp > 0) aidReceipt(actor, f, 'rescue', 1); } else receipt(actor, 'damage', Math.max(0, prior.hp - f.hp)); }
  return true;
}
export function fantasyMiracleAreaSafe(state:FantasyCombatState,target:FantasyCombatFighter):boolean{return !!target.tile&&all(state).some(f=>f.miracles?.safeTile?.round===state.round&&f.miracles.safeTile.tile.x===target.tile!.x&&f.miracles.safeTile.tile.y===target.tile!.y);}
export function applyFantasyMiracleDamage(state: FantasyCombatState, target: FantasyCombatFighter, amount: number, write: Writer, telegraphedArea = false): number {
  if (target.hp <= 0 || amount <= 0) return 0;
  if (telegraphedArea && fantasyMiracleAreaSafe(state,target)) { write(text(`${target.names.ko}의 자리에 재앙이 갈라졌다.`, `Calamity parts around ${target.names.en}.`, `${target.names.ja}のいる場所で災厄が分かれた。`)); return 0; }
  const before = target.hp, m = target.miracles ?? {};
  if (amount >= before && !m.dawnDebt) {
    if (m.anchor && m.anchor.round === state.round) { const heal = m.anchor.heal, source = all(state).find(f => f.id === m.anchor!.source); delete m.anchor; delete m.burden; target.hp = Math.min(target.stats.hp, 1 + heal); aidReceipt(source, target, 'protection', 1); aidReceipt(source, target, 'healing', target.hp - 1); aidReceipt(source, target, 'rescue', 1); write(text(`${target.names.ko}이 영혼의 닻에 붙들려 치명상을 버텼다.`, `The soul anchor holds ${target.names.en} through a lethal wound.`, `${target.names.ja}は魂の錨に繋がれ、致命傷を耐えた。`)); return Math.max(0, before - 1); }
    const source = m.burden && m.burden.round === state.round ? all(state).find(f => f.id === m.burden!.source && f.hp > 0 && !f.fled && !f.miracles?.dawnDebt) : undefined;
    if (source) { delete m.burden; delete m.anchor; source.hp = 0; const cost = memory(source); cost.downedKind = 'sacrifice'; delete cost.anchor; delete cost.burden; target.hp = 1; aidReceipt(source, target, 'protection', 1); aidReceipt(source, target, 'rescue', 1); write(text(`${source.names.ko}이 상처를 대신 짊어지고 실신했다.`, `${source.names.en} bears the wound and collapses.`, `${source.names.ja}は傷を肩代わりして失神した。`)); return before - 1; }
  }
  const dealt = Math.min(before, amount); target.hp -= dealt;
  if (target.hp === 0 && target.userId) { target.miracles=m; m.downedKind = 'damage'; m.severity = amount >= target.stats.hp * .8 ? 3 : amount >= target.stats.hp * .4 ? 2 : 1; }
  return dealt;
}
export function validFantasyMiracleFighter(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const m = value as Record<string, unknown>, num = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= 100000;
  const id = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 200 && !/[\u0000-\u001f\u007f]/u.test(v);
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const tile = (v: unknown) => obj(v) && Object.keys(v).length === 2 && num(v.x) && num(v.y) && Number(v.x) < 30 && Number(v.y) < 30;
  return Object.keys(m).every(k => ['cooldowns','anchor','burden','lastAnchorTarget','lastAnchoredRound','safeTile','downedKind','severity','dawnDebt','afflictions'].includes(k))
    && (m.cooldowns === undefined || obj(m.cooldowns) && Object.entries(m.cooldowns).every(([key, n]) => FANTASY_MIRACLES.some(x => x.id === key) && num(n)))
    && (m.lastAnchoredRound === undefined || num(m.lastAnchoredRound)) && (m.lastAnchorTarget === undefined || id(m.lastAnchorTarget)) && (m.downedKind === undefined || ['damage','sacrifice'].includes(String(m.downedKind))) && (m.severity === undefined || [1,2,3].includes(Number(m.severity))) && (m.dawnDebt === undefined || typeof m.dawnDebt === 'boolean')
    && (m.afflictions === undefined || Array.isArray(m.afflictions) && new Set(m.afflictions).size === m.afflictions.length && m.afflictions.length <= 3 && m.afflictions.every(x => ['curse','possession','soul-binding'].includes(String(x))))
    && (m.anchor === undefined || obj(m.anchor) && Object.keys(m.anchor).length === 3 && id(m.anchor.source) && num(m.anchor.round) && num(m.anchor.heal))
    && (m.burden === undefined || obj(m.burden) && Object.keys(m.burden).length === 2 && id(m.burden.source) && num(m.burden.round))
    && (m.safeTile === undefined || obj(m.safeTile) && Object.keys(m.safeTile).length === 2 && tile(m.safeTile.tile) && num(m.safeTile.round));
}
