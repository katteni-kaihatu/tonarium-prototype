import { setupFantasyNavalCombat, ensureFantasyNavalSkills, fantasyNavalRole, fantasyNavalCanHit, fantasyNavalAuxiliary, fantasyNavalHarpoonError, useFantasyNavalHarpoon, advanceFantasyNavalTether, syncFantasyNavalDamage, rescaleFantasyNavalParts, validFantasyNavalState, FANTASY_NAVAL_HARPOON, type FantasyNavalState } from './fantasy-naval.ts';
import { recordFantasyCombatAid as aidReceipt, recordFantasyCombatContribution as receipt, fantasyCombatContributionSource, validFantasyCombatReceipts, type FantasyCombatReceipts, type FantasyCombatReceipt } from './fantasy-combat-contribution.ts';
import { fantasyCombatMoveAttempt } from './fantasy-combat-move-attempt.ts';
import { fantasyJobMagicAttackRatio, fantasyJobHealingBonus } from './fantasy-job-balance.ts';
import { fantasyEnemyCombatSkills, resolveFantasyEnemyAction, validFantasyEnemyCharge } from './fantasy-enemy-combat.ts';
import { fantasyEnemyAttackForRound, type FantasyEnemyCharge } from './fantasy-enemy-attacks.ts';
import { fantasyCombatCarryOrderError, fantasyCombatCarryLog, fantasyCombatIsCarrying, fantasyCombatPatient, pickupFantasyCombatPatient, putDownFantasyCombatPatient, syncFantasyCombatPatient, releaseInvalidFantasyCombatCarries, validFantasyCombatCarries } from './fantasy-combat-carry.ts';
import { applyFantasyMiracleDamage, fantasyMiracleAreaSafe, castFantasyMiracle, fantasyMiracleOrderError, fantasyMiracleSkill, refreshFantasyMiracleAwakening, validFantasyMiracleFighter, type FantasyMiracleFighterState } from './fantasy-miracle-combat.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_ATTACK_SHAPES, fantasyCombatAttackTiles, type FantasyAttackShape } from './fantasy-attack-shapes.ts';
import { fantasyCombatDashLanding, fantasyCombatDashTrail, fantasyCombatSkillMovePath } from './fantasy-combat-movement.ts';
import { FANTASY_COMBAT_FIELD_KINDS, fantasyCombatApplyFields, fantasyCombatCreateFields, validFantasyCombatFields, type FantasyCombatFieldEffect, type FantasyCombatFieldKind } from './fantasy-combat-fields.ts';
import { fantasyCombatEnemy, createFantasyCombatEnemyStats, type FantasyCombatStats } from './fantasy-combat-catalog.ts';
import { createFantasyPartyCombatSnapshot, fantasyPartyCombatScale, type FantasyPartyCombatSnapshot } from './fantasy-party-balance.ts';
import { fantasyCombatActors, fantasyCombatBarricadeField, fantasyCombatRangedTiles, fantasyCombatLineOfSight, fantasyCombatBreakObstacle, fantasyCombatCoverTile, fantasyCombatPlaceObstacle, fantasyCombatCover, fantasyCombatDistance, fantasyCombatField, fantasyCombatMoveRange, fantasyCombatPath, fantasyCombatPlace, fantasyCombatTileKey, fantasyCombatValidField, fantasyCombatValidTile, fantasyCombatWithinRange, type FantasyCombatBattlefield, type FantasyCombatTile } from './fantasy-combat-tactics.ts';
import { fantasyObstacleKind, type FantasyObstacleDamage, type FantasyObstacleBody } from './fantasy-obstacles.ts';
import { fantasyCombatSituationalBonus } from './fantasy-situational.ts';
import { FANTASY_JOB_PATH_PLANS } from './fantasy-job-path-catalog.ts';
import { createFantasyEscortBattle, fantasyEscortAtExit, fantasyEscortHasCommander, fantasyEscortOrderError, fantasyEscortReady, isFantasyEscortBattleOrder, validFantasyEscortBattle, type FantasyEscortBattle, type FantasyEscortBattleInput, type FantasyEscortBattleOrder } from './fantasy-escort-battle.ts';

export type FantasyCombatText = Record<NpcLocale, string>;
export type FantasyCombatPosition = 'front' | 'rear';
export type FantasyCombatRange = 'melee' | 'ranged' | 'magic';
export const FANTASY_COMBAT_BOONS = ['haste', 'regen', 'clarity', 'thorns', 'lifesteal', 'resolve'] as const;
export const FANTASY_COMBAT_HEXES = ['weaken', 'vulnerable', 'blind', 'bleed', 'root', 'silence'] as const;
export type FantasyCombatUtility = typeof FANTASY_COMBAT_BOONS[number] | typeof FANTASY_COMBAT_HEXES[number];
export interface FantasyCombatCondition { contributor?: string; id: FantasyCombatUtility; power: number; turns: number; source?: { owner: string; generation: number; skill: string; mp: number; credited: boolean; unit?: string } }
export interface FantasyCombatSkill { id: string; names: FantasyCombatText; kind: 'attack' | 'heal' | 'guard' | 'focus' | 'cleanse' | 'blessing' | 'miracle' | 'mana' | 'boon' | 'hex'; mp: number; power: number; magic?: boolean; range?: FantasyCombatRange; damageType?: FantasyObstacleDamage;
  utility?: string; field?: FantasyCombatFieldKind;
  visualTier?: import('./fantasy-combat-visuals.ts').FantasyCombatVisualTier;
  visualElement?: 'fire'|'frost'|'storm'|'poison'|'alchemy'|'water'|'earth'|'wind'|'star'|'holy';
  battlefieldWide?: boolean;
  hitBonus?: number; shape?: FantasyAttackShape; secondaryDamage?: number;
  hitUtility?: { id: 'weaken' | 'vulnerable' | 'blind' | 'bleed' | 'root' | 'silence'; power: number; chance: number };
  motion?: { kind: 'reposition' | 'dash' | 'advance'; distance: number };
  reach?: number; radius?: number; selfOnly?: boolean; effects?: { slow?: number; burn?: number; cleanse?: boolean; revive?: boolean; guard?: number; might?: number };
  onHit?: { id: FantasyCombatEffect['id']; power: number; turns: 3; chance: number } }
export interface FantasyCombatPlayer {
  id: string; userId: string; names: FantasyCombatText; stats: FantasyCombatStats; hp: number; mp: number;
  position: FantasyCombatPosition; range: FantasyCombatRange; skills: FantasyCombatSkill[]; generation: number;
  externalCarrying?: {user:string;generation:number};
  companions?: FantasyCombatCompanionInput[]; body?: FantasyObstacleBody; attackDamageType?: FantasyObstacleDamage;
  miracles?: FantasyMiracleFighterState;
  vocation?: { job: string; path?: string };
}
export interface FantasyCombatCompanionInput { id: string; kind: 'troop' | 'syndicate' | 'summons'; names: FantasyCombatText; stats: FantasyCombatStats; hp: number; mp: number; range: FantasyCombatRange; skills: FantasyCombatSkill[] }
export interface FantasyCombatEffect { source?: string; id: 'poison' | 'burn' | 'frost'; power: number; turns: number }
export interface FantasyCombatFighter {
  id: string; userId?: string; generation?: number; template?: string; variation?: number; side: 'players' | 'enemies'; names: FantasyCombatText;
  stats: FantasyCombatStats; hp: number; mp: number; position: FantasyCombatPosition; range: FantasyCombatRange; skills: FantasyCombatSkill[];
  effects: FantasyCombatEffect[]; fled: boolean; guarding: boolean; ward: number; wardOwner?: string; wardUnit?: string;
  contribution: { effectiveActions: number; activeRounds: number; manualActions: number; receipts?: FantasyCombatReceipts };
  tile?: FantasyCombatTile;
  carrying?: string;
  externalCarrying?: {user:string;generation:number};
  /** 体の特徴。穴や低い障害物の通過判定に使う。 */
  body?: FantasyObstacleBody; attackDamageType?: FantasyObstacleDamage;
  companion?: { ownerId: string; generation: number; member: string; kind: 'troop' | 'syndicate' | 'summons' };
  aim?: { bonus: number; turns: number; owner: string; generation: number; skill: string; mp: number; unit?: string };
  blessing?: { power: number; turns: number; owner: string; generation: number; skill: string; mp: number; credited: boolean };
  manaRecoveryUsed?: boolean;
  conditions?: FantasyCombatCondition[];
  vocation?: FantasyCombatPlayer['vocation'];
  miracles?: FantasyMiracleFighterState;
  enemyCharge?: FantasyEnemyCharge;
}
export type FantasyCombatActorOrder = {type:'carry';target:string}|{type:'putDown';tile?:FantasyCombatTile} | { type: 'attack'; target: string } | { type: 'guard' } | { type: 'escape' }
  | { type: 'skillMove'; skill: string; tile: FantasyCombatTile }
  | { type: 'move'; position: FantasyCombatPosition } | { type: 'skill'; skill: string; target: string } | { type: 'item'; item: string; target: string };
export type FantasyCombatUnitOrder = Exclude<FantasyCombatActorOrder, { type: 'item' | 'escape' | 'carry' | 'putDown' }> | { type: 'moveTo'; tile: FantasyCombatTile };
export type FantasyCombatOrder = FantasyCombatActorOrder | { type: 'moveTo'; tile: FantasyCombatTile } | { type: 'break'; tile: FantasyCombatTile; skill?: string } | { type: 'unit'; unit: string; order: FantasyCombatUnitOrder } | { type: 'escort'; order: FantasyEscortBattleOrder };
export type FantasyCombatSource = string;
export interface FantasyCombatPresentation { kind: 'move' | 'attack' | 'miracle' | 'prepare'; actor: string; target?: string; from?: FantasyCombatTile; to?: FantasyCombatTile; path?: FantasyCombatTile[]; tiles?: FantasyCombatTile[]; skill?: string; element?: string }
export interface FantasyCombatLog { presentation?: FantasyCombatPresentation; id: number; round: number; text: FantasyCombatText; roll?: { sides: 20; value: number; target: number; success: boolean } }
export interface FantasyCombatState {
  version: 1; id: string; location: string; source: FantasyCombatSource; revision: number; round: number; seed: number; deadline: number;
  status: 'active' | 'victory' | 'defeat' | 'escaped'; fighters: FantasyCombatFighter[]; orders: Record<string, FantasyCombatOrder>;
  logs: FantasyCombatLog[]; scaling: FantasyPartyCombatSnapshot; startedAt: number; hour: number;
  naval?: FantasyNavalState; battlefield?: FantasyCombatBattlefield; units?: FantasyCombatFighter[]; unitOrders?: Record<string, FantasyCombatUnitOrder>;
  escort?: FantasyEscortBattle; fields?: FantasyCombatFieldEffect[];
}
export interface FantasyCombatSupply { count: number; names: FantasyCombatText; hp?: number; mp?: number; cleanse?: FantasyCombatEffect['id'][]; combat?: FantasyCombatSkill }
export interface FantasyCombatOptions { supplies?: Record<string, Record<string, FantasyCombatSupply>> }
export interface FantasyCombatSpentItem { userId: string; item: string; count: 1 }
export type FantasyCombatError = 'invalid' | 'stale' | 'not-active' | 'not-owner' | 'already-ordered' | 'down' | 'target' | 'range' | 'mana' | 'item' | 'unnecessary' | 'blocked' | 'capacity' | 'silenced' | 'cooldown' | 'carrying';
export interface FantasyCombatResult { state: FantasyCombatState; changed: boolean; error?: FantasyCombatError; spentItems: FantasyCombatSpentItem[]; usedSkills?: { userId: string; skill: string; mp: number; kind?: 'obstacle' | 'circle' | 'mana' | 'utility' }[]; attemptedAttacks?: string[] }
export const FANTASY_COMBAT_ROUND_HOURS = .5;
const t = (ko: string, en: string, ja: string): FantasyCombatText => ({ ko, en, ja });
const living = (f: FantasyCombatFighter) => f.hp > 0 && !f.fled;
export const fantasyCombatCondition = (f: FantasyCombatFighter, id: FantasyCombatUtility) => f.conditions?.find(condition => condition.id === id);
const harmful = (id: string) => (FANTASY_COMBAT_HEXES as readonly string[]).includes(id);
const hasAilment = (f: FantasyCombatFighter) => f.effects.length > 0 || !!f.conditions?.some(condition => harmful(condition.id));
const cleanseAilments = (f: FantasyCombatFighter) => { const count = f.effects.length + (f.conditions?.filter(condition => harmful(condition.id)).length ?? 0); f.effects = []; if (f.conditions) f.conditions = f.conditions.filter(condition => !harmful(condition.id)); return count; };
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const integer = (n: unknown, min = 0, max = 1_000_000): n is number => Number.isSafeInteger(n) && Number(n) >= min && Number(n) <= max;
const identifier = (s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 200 && s.trim() === s && !/[\u0000-\u001f\u007f]/u.test(s);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const localized = (v: unknown): v is FantasyCombatText => object(v) && Object.keys(v).length === 3 && ['ko', 'en', 'ja'].every(key => typeof v[key] === 'string' && (v[key] as string).length > 0 && (v[key] as string).length <= 1000);
const keys = (v: Record<string, unknown>, allowed: readonly string[]) => Object.keys(v).every(key => allowed.includes(key));
const orderOf = (state: FantasyCombatState, user: string) => Object.hasOwn(state.orders, user) ? state.orders[user] : undefined;
const unitOrderOf = (state: FantasyCombatState, id: string) => state.unitOrders && Object.hasOwn(state.unitOrders, id) ? state.unitOrders[id] : undefined;
const actorOrder = (state: FantasyCombatState, actor: FantasyCombatFighter) => actor.companion ? unitOrderOf(state, actor.id) : actor.userId ? orderOf(state, actor.userId) : undefined;
const validStats = (v: unknown): v is FantasyCombatStats => object(v) && Object.keys(v).length === 8 && ['hp', 'mp', 'attack', 'defense', 'agility', 'intelligence', 'accuracy', 'magicResist'].every(key => integer(v[key])) && Number(v.hp) > 0 && Number(v.accuracy) <= 100;
function random(state: FantasyCombatState): number {
  state.seed = (state.seed + 0x6d2b79f5) >>> 0;
  let value = state.seed;
  value = Math.imul(value ^ value >>> 15, value | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}
function log(state: FantasyCombatState, text: FantasyCombatText, roll?: FantasyCombatLog['roll'], presentation?: FantasyCombatPresentation) {
  state.logs.push({ id: (state.logs.at(-1)?.id ?? 0) + 1, round: state.round, text, ...(roll ? { roll } : {}), ...(presentation ? { presentation } : {}) });
  state.logs = state.logs.slice(-80);
}
function validSkill(value: unknown): value is FantasyCombatSkill {
  return object(value) && keys(value, ['id', 'names', 'kind', 'mp', 'power', 'magic', 'range', 'onHit', 'damageType', 'reach', 'radius', 'selfOnly', 'effects', 'hitBonus', 'utility', 'field', 'shape', 'secondaryDamage', 'hitUtility', 'motion', 'visualTier', 'visualElement', 'battlefieldWide']) && identifier(value.id) && localized(value.names)
    && (value.visualTier === undefined || integer(value.visualTier,1,6))
    && (value.visualElement === undefined || ['fire','frost','storm','poison','alchemy','water','earth','wind','star','holy'].includes(String(value.visualElement)))
    && (value.battlefieldWide === undefined || value.battlefieldWide === true && value.id === 'miracle-last-dawn')
    && (value.hitUtility === undefined || value.kind === 'attack' && object(value.hitUtility) && Object.keys(value.hitUtility).length === 3 && (FANTASY_COMBAT_HEXES as readonly unknown[]).includes(value.hitUtility.id) && integer(value.hitUtility.power, 1, 6) && finite(value.hitUtility.chance) && value.hitUtility.chance > 0 && value.hitUtility.chance <= 1)
    && (value.motion === undefined || object(value.motion) && Object.keys(value.motion).length === 2 && integer(value.motion.distance, 1, 6) && (value.motion.kind === 'reposition' && value.kind === 'focus' || value.motion.kind === 'dash' && value.kind === 'attack' && value.shape === 'line' || value.motion.kind === 'advance' && value.kind === 'attack' && value.shape === 'single'))
    && (value.shape === undefined || value.kind === 'attack' && (FANTASY_ATTACK_SHAPES as readonly unknown[]).includes(value.shape) && integer(value.reach, 1, 12))
    && (value.secondaryDamage === undefined || value.kind === 'attack' && value.shape !== undefined && integer(value.secondaryDamage, 1, 100))
    && (value.field === undefined || (FANTASY_COMBAT_FIELD_KINDS as readonly string[]).includes(String(value.field)) && ['attack', 'hex'].includes(String(value.kind)))
    && ['attack', 'heal', 'guard', 'focus', 'cleanse', 'blessing', 'miracle', 'mana', 'boon', 'hex'].includes(String(value.kind)) && integer(value.mp) && integer(value.power)
    && (value.utility === undefined ? !['boon', 'hex'].includes(String(value.kind)) : (value.kind === 'boon' ? FANTASY_COMBAT_BOONS as readonly string[] : value.kind === 'hex' ? FANTASY_COMBAT_HEXES as readonly string[] : []).includes(String(value.utility)) && integer(value.power, 1, 12))
    && (value.reach === undefined || integer(value.reach, 0, 12)) && (value.radius === undefined || integer(value.radius, 0, 4)) && (value.selfOnly === undefined || typeof value.selfOnly === 'boolean')
    && (value.effects === undefined || object(value.effects) && keys(value.effects, ['slow', 'burn', 'cleanse', 'revive', 'guard', 'might'])
      && ['slow', 'burn', 'guard', 'might'].every(key => (value.effects as Record<string, unknown>)[key] === undefined || integer((value.effects as Record<string, unknown>)[key], 1, key === 'might' ? 6 : 100))
      && ['cleanse', 'revive'].every(key => (value.effects as Record<string, unknown>)[key] === undefined || typeof (value.effects as Record<string, unknown>)[key] === 'boolean'))
    && (value.kind !== 'focus' || integer(value.power, 1, 15))
    && (value.hitBonus === undefined || integer(value.hitBonus, -20, 20))
    && (value.damageType === undefined || ['fire', 'ice', 'blunt', 'pierce', 'none'].includes(String(value.damageType)))
    && (value.magic === undefined || typeof value.magic === 'boolean') && (value.range === undefined || ['melee', 'ranged', 'magic'].includes(String(value.range)))
    && (value.onHit === undefined || value.kind === 'attack' && object(value.onHit) && Object.keys(value.onHit).length === 4
      && ['poison', 'burn', 'frost'].includes(String(value.onHit.id)) && integer(value.onHit.power, 1, 10) && value.onHit.turns === 3
      && finite(value.onHit.chance) && value.onHit.chance > 0 && value.onHit.chance <= 1);
}
export function isFantasyCombatOrder(value: unknown): value is FantasyCombatOrder {
  if (!object(value)) return false;
  switch (value.type) {
    case 'putDown': return keys(value,['type','tile']) && (value.tile===undefined ? Object.keys(value).length===1 : Object.keys(value).length===2 && fantasyCombatValidTile(fantasyCombatField(),value.tile));
    case 'carry':
    case 'attack': return Object.keys(value).length === 2 && keys(value, ['type', 'target']) && identifier(value.target);
    case 'guard': case 'escape': return Object.keys(value).length === 1;
    case 'move': return Object.keys(value).length === 2 && keys(value, ['type', 'position']) && ['front', 'rear'].includes(String(value.position));
    case 'skill': return Object.keys(value).length === 3 && keys(value, ['type', 'skill', 'target']) && identifier(value.skill) && identifier(value.target);
    case 'skillMove': return Object.keys(value).length === 3 && keys(value, ['type', 'skill', 'tile']) && identifier(value.skill) && fantasyCombatValidTile(fantasyCombatField(), value.tile);
    case 'item': return Object.keys(value).length === 3 && keys(value, ['type', 'item', 'target']) && identifier(value.item) && identifier(value.target);
    case 'moveTo': return Object.keys(value).length === 2 && keys(value, ['type', 'tile']) && fantasyCombatValidTile(fantasyCombatField(), value.tile);
    case 'break': return keys(value, ['type', 'tile', 'skill']) && (value.skill === undefined || identifier(value.skill)) && fantasyCombatValidTile(fantasyCombatField(), value.tile);
    case 'unit': return Object.keys(value).length === 3 && keys(value, ['type', 'unit', 'order']) && identifier(value.unit) && object(value.order)
      && !['unit', 'item', 'escape', 'escort'].includes(String(value.order.type)) && isFantasyCombatOrder(value.order);
    case 'escort': return Object.keys(value).length === 2 && keys(value, ['type', 'order']) && isFantasyEscortBattleOrder(value.order);
    default: return false;
  }
}
export function validFantasyCombatState(value: unknown): value is FantasyCombatState {
  if (!object(value) || !keys(value, ['version', 'id', 'location', 'source', 'revision', 'round', 'seed', 'deadline', 'status', 'fighters', 'orders', 'logs', 'scaling', 'startedAt', 'hour', 'battlefield', 'units', 'unitOrders', 'escort', 'fields', 'naval'])
    || value.version !== 1 || !identifier(value.id) || !identifier(value.location) || !integer(value.revision) || !integer(value.round, 1, 10000)
    || !integer(value.seed, 0, 0xffffffff) || !finite(value.startedAt) || value.startedAt < 0 || !finite(value.hour) || value.hour < value.startedAt
    || !finite(value.deadline) || value.deadline < value.hour || !['active', 'victory', 'defeat', 'escaped'].includes(String(value.status))
    || !identifier(value.source)
    || !Array.isArray(value.fighters) || value.fighters.length < 2 || value.fighters.length > (value.naval?18:/^(guild|hunt):/.test(String(value.source))?12:9) || !object(value.orders) || !Array.isArray(value.logs) || value.logs.length > 80) return false;
  const fighters = value.fighters;
  if (value.battlefield !== undefined && !fantasyCombatValidField(value.battlefield)) return false;
  if ((value.units === undefined) !== (value.unitOrders === undefined) || value.units !== undefined && (!Array.isArray(value.units) || value.units.length > 12 || !object(value.unitOrders))) return false;
  const units = (value.units ?? []) as unknown[];
  const all = [...fighters, ...units];
  if (!all.every(f => object(f) && keys(f, ['id', 'userId', 'generation', 'template', 'variation', 'side', 'names', 'stats', 'hp', 'mp', 'position', 'range', 'skills', 'effects', 'fled', 'guarding', 'ward', 'wardOwner', 'wardUnit', 'contribution', 'tile', 'companion', 'aim', 'body', 'attackDamageType', 'blessing', 'manaRecoveryUsed', 'conditions', 'vocation', 'miracles', 'carrying', 'externalCarrying', 'enemyCharge'])
    && validFantasyMiracleFighter(f.miracles)
    && (f.vocation === undefined || f.side === 'players' && object(f.vocation) && keys(f.vocation, ['job', 'path']) && identifier(f.vocation.job) && (['unassigned', 'priest'].includes(f.vocation.job) || Object.hasOwn(FANTASY_JOB_PATH_PLANS, f.vocation.job))
      && (f.vocation.path === undefined || identifier(f.vocation.path) && (f.vocation.job === 'priest' && ['care','ward','oath','pilgrim','inquisitor','paladin','saint'].some(branch => `priest-${branch}` === (f.vocation as Record<string, unknown>).path) || (FANTASY_JOB_PATH_PLANS[f.vocation.job] ?? []).some(plan => `${(f.vocation as Record<string, unknown>).job}-${plan[0]}` === (f.vocation as Record<string, unknown>).path))))
    && (f.manaRecoveryUsed === undefined || typeof f.manaRecoveryUsed === 'boolean')
    && (f.conditions === undefined || Array.isArray(f.conditions) && f.conditions.length <= 12 && new Set(f.conditions.map(condition => condition?.id)).size === f.conditions.length
      && f.conditions.every(condition => object(condition) && keys(condition, ['id', 'power', 'turns', 'source', 'contributor']) && (condition.contributor === undefined || identifier(condition.contributor) && all.some(actor => actor.id === condition.contributor)) && [...FANTASY_COMBAT_BOONS, ...FANTASY_COMBAT_HEXES].includes(condition.id as FantasyCombatUtility) && integer(condition.power, 1, 12) && integer(condition.turns, 1, 3)
        && (condition.source === undefined || object(condition.source) && keys(condition.source, ['owner', 'generation', 'skill', 'mp', 'credited', 'unit']) && identifier(condition.source.owner) && integer(condition.source.generation, 1) && identifier(condition.source.skill) && integer(condition.source.mp) && typeof condition.source.credited === 'boolean' && (condition.source.unit === undefined || identifier(condition.source.unit)))))
    && (f.body === undefined || object(f.body) && keys(f.body, ['small', 'large', 'flying', 'flexible']) && Object.values(f.body).every(value => typeof value === 'boolean'))
    && (f.attackDamageType === undefined || ['fire', 'ice', 'blunt', 'pierce', 'none'].includes(String(f.attackDamageType)))
    && identifier(f.id) && localized(f.names) && ['players', 'enemies'].includes(String(f.side)) && validStats(f.stats) && integer(f.hp, 0, f.stats.hp) && integer(f.mp, 0, f.stats.mp)
    && ['front', 'rear'].includes(String(f.position)) && ['melee', 'ranged', 'magic'].includes(String(f.range)) && Array.isArray(f.skills) && f.skills.length <= 100 && f.skills.every(validSkill)
    && new Set(f.skills.map(s => s.id)).size === f.skills.length && typeof f.fled === 'boolean' && typeof f.guarding === 'boolean' && integer(f.ward)
    && (f.wardOwner === undefined || identifier(f.wardOwner)) && (f.wardUnit === undefined || identifier(f.wardUnit)) && Array.isArray(f.effects) && f.effects.length <= 3
    && (f.aim === undefined || object(f.aim) && keys(f.aim, ['bonus', 'turns', 'owner', 'generation', 'skill', 'mp', 'unit']) && integer(f.aim.bonus, 1, 15) && integer(f.aim.turns, 1, 2) && identifier(f.aim.owner)
      && integer(f.aim.generation, 1) && identifier(f.aim.skill) && integer(f.aim.mp) && (f.aim.unit === undefined || identifier(f.aim.unit)))
    && (f.blessing === undefined || object(f.blessing) && Object.keys(f.blessing).length === 7 && keys(f.blessing, ['power', 'turns', 'owner', 'generation', 'skill', 'mp', 'credited'])
      && integer(f.blessing.power, 1, 6) && integer(f.blessing.turns, 1, 3) && identifier(f.blessing.owner) && integer(f.blessing.generation, 1) && identifier(f.blessing.skill) && integer(f.blessing.mp) && typeof f.blessing.credited === 'boolean')
    && f.effects.every(e => object(e) && keys(e, ['id', 'power', 'turns', 'source']) && (e.source === undefined || identifier(e.source) && all.some(actor => actor.id === e.source)) && ['poison', 'burn', 'frost'].includes(String(e.id)) && integer(e.power, 1, 10000) && integer(e.turns, 1, 10))
    && new Set(f.effects.map(e => e.id)).size === f.effects.length && object(f.contribution) && keys(f.contribution, ['effectiveActions', 'activeRounds', 'manualActions', 'receipts']) && validFantasyCombatReceipts(f.contribution.receipts)
    && ['effectiveActions', 'activeRounds', 'manualActions'].every(key => integer((f.contribution as Record<string, unknown>)[key], 0, 1_000_000))
    && (value.battlefield === undefined ? f.tile === undefined : fantasyCombatValidTile(value.battlefield as FantasyCombatBattlefield, f.tile))
    && (f.companion !== undefined ? units.includes(f) && f.side === 'players' && f.userId === undefined && f.generation === undefined && f.template === undefined && f.variation === undefined
      && object(f.companion) && Object.keys(f.companion).length === 4 && identifier(f.companion.ownerId) && integer(f.companion.generation, 1) && identifier(f.companion.member) && ['troop', 'syndicate', 'summons'].includes(String(f.companion.kind))
      : f.side === 'players' ? !units.includes(f) && identifier(f.userId) && integer(f.generation, 1) && f.template === undefined && f.variation === undefined
      : f.userId === undefined && f.generation === undefined && identifier(f.template) && !!fantasyCombatEnemy(f.template)
        && (!fantasyCombatEnemy(f.template)!.provocationOnly || String(value.source).startsWith('apex:')) && finite(f.variation) && f.variation >= .8 && f.variation <= 1.2))) return false;
  if (all.some(f => object(f) && f.enemyCharge !== undefined && !validFantasyEnemyCharge(f.enemyCharge, f as unknown as FantasyCombatFighter, value as unknown as FantasyCombatState))) return false;
  const players = fighters.filter(f => f.side === 'players') as unknown as FantasyCombatFighter[];
  if (players.length < 1 || players.length > 6 || fighters.length - players.length < 1 || fighters.length - players.length > (value.naval?12:/^(guild|hunt):/.test(String(value.source))?6:3)
    || new Set(all.map(f => (f as FantasyCombatFighter).id)).size !== all.length || new Set(players.map(p => p.userId)).size !== players.length) return false;
  if (!(units as FantasyCombatFighter[]).every(unit => players.some(p => p.userId === unit.companion!.ownerId && p.generation === unit.companion!.generation)
    && (units as FantasyCombatFighter[]).filter(other => other.companion!.ownerId === unit.companion!.ownerId).length <= 2)) return false;
  if (new Set((units as FantasyCombatFighter[]).map(unit => `${unit.companion!.ownerId}:${unit.companion!.member}`)).size !== units.length) return false;
  if ((all as FantasyCombatFighter[]).some(actor => {
    const aim = actor.aim; if (!aim) return false;
    const owner = players.find(p => p.userId === aim.owner && p.generation === aim.generation), source = aim.unit ? (units as FantasyCombatFighter[]).find(unit => unit.id === aim.unit && unit.companion!.ownerId === aim.owner) : owner;
    return !owner || !source?.skills.some(skill => skill.id === aim.skill && skill.kind === 'focus' && skill.mp === aim.mp && Math.min(15, skill.power) >= aim.bonus);
  })) return false;
  if ((all as FantasyCombatFighter[]).some(actor => actor.blessing && !players.some(owner => owner.userId === actor.blessing!.owner && owner.generation === actor.blessing!.generation
    && owner.skills.some(skill => skill.id === actor.blessing!.skill && skill.mp === actor.blessing!.mp && (skill.effects?.might ?? 0) >= actor.blessing!.power)))) return false;
  if ((all as FantasyCombatFighter[]).some(actor => actor.conditions?.some(condition => {
    const source = condition.source; if (!source) return false;
    const owner = players.find(owner => owner.userId === source.owner && owner.generation === source.generation);
    const caster = source.unit ? (units as FantasyCombatFighter[]).find(unit => unit.id === source.unit && unit.companion?.ownerId === source.owner && unit.companion.generation === source.generation) : owner;
    return !owner || !caster?.skills.some(skill => skill.id === source.skill && skill.mp === source.mp && (skill.utility === condition.id && skill.power >= condition.power || skill.kind === 'attack' && skill.hitUtility?.id === condition.id && skill.hitUtility.power >= condition.power));
  }))) return false;
  if (value.battlefield !== undefined) {
    if ((value.battlefield as FantasyCombatBattlefield).obstacles?.some(entry => entry.owner !== undefined && (!(all as FantasyCombatFighter[]).some(actor => actor.id === entry.owner) || entry.expiresRound! <= Number(value.round) || entry.expiresRound! > Number(value.round) + 2))) return false;
    const field = value.battlefield as FantasyCombatBattlefield, occupied = (all as FantasyCombatFighter[]).filter(living).map(f => fantasyCombatTileKey(f.tile!));
    if (new Set(occupied).size !== occupied.length || (all as FantasyCombatFighter[]).some(f => [...field.blocked, ...(field.obstacles ?? []).map(entry => entry.tile)].some(tile => fantasyCombatTileKey(tile) === fantasyCombatTileKey(f.tile!)))) return false;
  }
  try { fantasyPartyCombatScale(value.scaling as unknown as FantasyPartyCombatSnapshot, 'normal'); } catch { return false; }
  const scale = value.scaling as unknown as FantasyPartyCombatSnapshot;
  if (scale.combatId !== value.id || scale.participantIds.length !== players.length || !players.every(p => scale.participantIds.includes(p.userId!))) return false;
  if (!Object.entries(value.orders).every(([user, order]) => players.some(p => p.userId === user && living(p)) && isFantasyCombatOrder(order) && !['unit', 'escort'].includes(order.type))) return false;
  if (value.unitOrders !== undefined && !Object.entries(value.unitOrders as Record<string, unknown>).every(([id, order]) => (units as FantasyCombatFighter[]).some(unit => unit.id === id && living(unit))
    && isFantasyCombatOrder(order) && !['unit', 'item', 'escape', 'escort', 'carry', 'putDown'].includes(order.type))) return false;
  const presentationActors=object(value.escort)&&object(value.escort.wagon)?[...all,value.escort.wagon]:all;
  let lastLog = 0;
  if (!value.logs.every(entry => {
    if (!object(entry) || !keys(entry, ['id', 'round', 'text', 'roll', 'presentation']) || !integer(entry.id, 1) || entry.id <= lastLog || !integer(entry.round, 1, Number(value.round)) || !localized(entry.text)) return false;
    if (entry.presentation !== undefined) { const p = entry.presentation; if (!object(p) || !keys(p, ['kind','actor','target','from','to','path','tiles','skill','element']) || !['move','attack','miracle','prepare'].includes(String(p.kind)) || !identifier(p.actor) || !presentationActors.some(f => object(f) && f.id === p.actor) || p.target !== undefined && (!identifier(p.target) || !presentationActors.some(f => object(f) && f.id === p.target)) || ['skill','element'].some(key => p[key] !== undefined && !identifier(p[key])) || ['from','to'].some(key => p[key] !== undefined && (value.battlefield === undefined || !fantasyCombatValidTile(value.battlefield as FantasyCombatBattlefield,p[key]))) || p.path !== undefined && (!Array.isArray(p.path) || p.path.length > 100 || value.battlefield === undefined || !p.path.every(tile => fantasyCombatValidTile(value.battlefield as FantasyCombatBattlefield,tile))) || p.tiles !== undefined && (!Array.isArray(p.tiles) || !p.tiles.length || p.tiles.length > 80 || value.battlefield === undefined || !p.tiles.every(tile => fantasyCombatValidTile(value.battlefield as FantasyCombatBattlefield,tile)) || new Set(p.tiles.map(tile => fantasyCombatTileKey(tile as FantasyCombatTile))).size !== p.tiles.length)) return false; }
    lastLog = entry.id;
    return entry.roll === undefined || object(entry.roll) && Object.keys(entry.roll).length === 4 && entry.roll.sides === 20 && integer(entry.roll.value, 1, 20) && integer(entry.roll.target, 2, 20) && typeof entry.roll.success === 'boolean';
  })) return false;
  const alivePlayers = players.some(living), aliveEnemies = (fighters as unknown as FantasyCombatFighter[]).some(f => f.side === 'enemies' && living(f));
  const battle = value as unknown as FantasyCombatState;
  if (!validFantasyNavalState(battle)) return false;
  if (!validFantasyCombatCarries(battle)) return false;
  if (!validFantasyEscortBattle(battle) || !validFantasyCombatFields(battle)) return false;
  if (battle.escort) {
    const safe = battle.escort.wagon.hp > 0, extracted = fantasyEscortAtExit(battle), commanded = fantasyEscortHasCommander(battle);
    return value.status === 'active' ? alivePlayers && safe && commanded && (aliveEnemies || !extracted)
      : value.status === 'victory' ? !aliveEnemies && safe && extracted
        : value.status === 'defeat' ? !safe || !commanded || !alivePlayers && !players.some(p => p.fled)
          : !alivePlayers && players.some(p => p.fled);
  }
  return value.status === 'active' ? alivePlayers && aliveEnemies : value.status === 'victory' ? !aliveEnemies : value.status === 'defeat' ? !alivePlayers && !players.some(p => p.fled) : !alivePlayers && players.some(p => p.fled);
}
function addPlayer(state: FantasyCombatState, player: FantasyCombatPlayer, index: number) {
  const { companions, ...hero } = structuredClone(player);
  const fighter: FantasyCombatFighter = { ...hero, side: 'players', effects: [], fled: false, guarding: false, ward: 0, contribution: { effectiveActions: 0, activeRounds: 0, manualActions: 0 } };
  fantasyCombatPlace(state, fighter, { x: state.battlefield?.obstacles?.length ? player.position === 'front' ? 2 : 1 : player.position === 'front' ? 4 : 1, y: index + 1 }); ensureFantasyNavalSkills(state, fighter); state.fighters.push(fighter);
  if (companions?.length) {
    if (!Array.isArray(companions) || companions.length > 2) throw new TypeError('Invalid combat companions');
    state.units ??= []; state.unitOrders ??= {};
    for (const [unitIndex, unit] of companions.entries()) {
      if (!identifier(unit.id) || !localized(unit.names) || !validStats(unit.stats) || !integer(unit.hp, 1, unit.stats.hp) || !integer(unit.mp, 0, unit.stats.mp)
        || !['troop', 'syndicate', 'summons'].includes(unit.kind) || !['melee', 'ranged', 'magic'].includes(unit.range) || !unit.skills.every(validSkill)) throw new TypeError('Invalid combat companion');
      const ally: FantasyCombatFighter = { id: `${player.id}-unit-${unit.id}`, names: unit.names, side: 'players', stats: unit.stats, hp: unit.hp, mp: unit.mp,
        position: unit.range === 'melee' ? 'front' : 'rear', range: unit.range, skills: unit.skills, effects: [], fled: false, guarding: false, ward: 0,
        contribution: { effectiveActions: 0, activeRounds: 0, manualActions: 0 }, companion: { ownerId: player.userId, generation: player.generation, member: unit.id, kind: unit.kind } };
      fantasyCombatPlace(state, ally, { x: unitIndex ? 0 : 2, y: index + 1 }); state.units.push(ally);
    }
  }
}
export function createFantasyCombat(input: { id: string; location: string; source: FantasyCombatSource; players: FantasyCombatPlayer[]; enemies: { id: string; template: string; position?: FantasyCombatPosition }[]; seed: number; hour: number; tactical?: boolean; naval?: boolean; terrain?: 'barricade'; escort?: FantasyEscortBattleInput }): FantasyCombatState {
  if (!input || !identifier(input.id) || !identifier(input.location) || !finite(input.hour) || input.hour < 0 || !integer(input.seed, 0, 0xffffffff)
    || !Array.isArray(input.players) || input.players.length < 1 || input.players.length > 6 || !Array.isArray(input.enemies) || input.enemies.length < 1 || input.enemies.length > (/^(guild|hunt):/.test(String(input.source))?6:3)) throw new TypeError('Invalid combat creation');
  const scaling = createFantasyPartyCombatSnapshot({ combatId: input.id, wave: 1, roster: input.players.map(p => ({ playerId: p.userId, kind: 'player', participation: 'engaged', hp: p.hp })) });
  const state: FantasyCombatState = { version: 1, id: input.id, location: input.location, source: structuredClone(input.source), revision: 0, round: 1, seed: input.seed, deadline: input.hour + FANTASY_COMBAT_ROUND_HOURS,
    status: 'active', fighters: [], orders: {}, logs: [], scaling: structuredClone(scaling), startedAt: input.hour, hour: input.hour };
  if (input.tactical) state.battlefield = input.source.startsWith('apex:') ? fantasyCombatField() : input.terrain === 'barricade' ? fantasyCombatBarricadeField(input.seed) : fantasyCombatField(input.seed);
  for (const player of input.players) {
    if (!player || !identifier(player.id) || !identifier(player.userId) || !localized(player.names) || !validStats(player.stats) || !integer(player.hp, 1, player.stats.hp) || !integer(player.mp, 0, player.stats.mp)
      || !integer(player.generation, 1) || !Array.isArray(player.skills) || !player.skills.every(validSkill)) throw new TypeError('Invalid combat player');
    addPlayer(state, player, state.fighters.length);
  }
  for (const enemy of input.enemies) {
    const template = fantasyCombatEnemy(enemy.template); if (!template) throw new TypeError('Unknown combat enemy');
    if (template.provocationOnly && !input.source.startsWith('apex:')) throw new TypeError('Apex combat requires an explicit provocation');
    const variation = createFantasyCombatEnemyStats(template.id, () => random(state));
    const scale = fantasyPartyCombatScale(scaling, template.rank), stats = { ...variation.stats, hp: Math.ceil(variation.stats.hp * scale.hpMultiplier), attack: Math.round(variation.stats.attack * scale.damageMultiplier), intelligence: Math.round(variation.stats.intelligence * scale.damageMultiplier) };
    const enemySkills = input.tactical ? fantasyEnemyCombatSkills(template) : [];
    const barricadeArcher = input.terrain === 'barricade' && /goblin-raider|bandit|poacher|archer/.test(template.id);
    if (barricadeArcher && enemySkills.length && enemySkills.every(skill => skill.range === 'melee')) enemySkills.push({id:'enemy-barricade-shot',names:t('엄폐 사격','Covering shot','遮蔽射撃'),kind:'attack',mp:0,power:0,range:'ranged',reach:7,shape:'single',damageType:'pierce',visualTier:2});
    const opponent: FantasyCombatFighter = { id: enemy.id, template: template.id, variation: variation.variation, side: 'enemies', names: { ...template.names }, stats, hp: stats.hp, mp: stats.mp,
      position: enemy.position ?? 'front', range: barricadeArcher ? 'ranged' : enemySkills[0]?.range ?? (template.pattern === 'arcane' || template.pattern === 'drain' ? 'magic' : 'melee'), skills: enemySkills, effects: [], fled: false, guarding: false, ward: 0,
      contribution: { effectiveActions: 0, activeRounds: 0, manualActions: 0 } };
    fantasyCombatPlace(state, opponent, input.terrain === 'barricade' ? fantasyCombatRangedTiles(input.enemies.length)[input.enemies.indexOf(enemy)] : { x: opponent.position === 'front' ? 5 : 8, y: Math.min(6, input.enemies.indexOf(enemy) + 1) }); state.fighters.push(opponent);
  }
  if (input.naval) setupFantasyNavalCombat(state);
  if (input.escort) state.escort = createFantasyEscortBattle(state, input.escort);
  log(state, t('전투가 시작되었다. 미입력 시 마감에 방어한다.', 'Combat begins. Missing orders become guards at the deadline.', '戦闘開始。締切まで未入力なら防御する。'));
  if (!validFantasyCombatState(state)) throw new TypeError('Invalid combat state');
  return state;
}
function legalTarget(state: FantasyCombatState, actor: FantasyCombatFighter, target: FantasyCombatFighter, range: FantasyCombatRange): boolean {
  if (actor.side === target.side || !living(target) || !fantasyNavalCanHit(state, actor, target, range)) return false;
  if (state.battlefield) return fantasyCombatWithinRange(state, actor, target, range);
  if (range !== 'melee') return true;
  return actor.position === 'front' && (target.position === 'front' || !state.fighters.some(f => f.side === target.side && f.position === 'front' && living(f)));
}
function skillInRange(state: FantasyCombatState, actor: FantasyCombatFighter, target: FantasyCombatFighter, skill: FantasyCombatSkill): boolean {
  if (actor.id !== target.id && skill.reach === 0) return false;
  if (!state.battlefield) return true;
  const range = skill.range ?? (skill.kind !== 'attack' || skill.magic ? 'magic' : actor.range);
  if (skill.kind === 'attack' && !fantasyNavalCanHit(state, actor, target, range)) return false;
  return !!actor.tile && !!target.tile && fantasyCombatDistance(actor.tile, target.tile) <= (skill.reach ?? (range === 'melee' ? 1 : range === 'ranged' ? 7 : 8))
    && fantasyCombatLineOfSight(state, actor.tile, target.tile);
}
function skillTarget(state: FantasyCombatState, actor: FantasyCombatFighter, target: FantasyCombatFighter, skill: FantasyCombatSkill): boolean {
  if (target.fled || skill.selfOnly && target.id !== actor.id) return false;
  if (skill.kind === 'attack' && !fantasyNavalCanHit(state, actor, target, skill.range ?? (skill.magic ? 'magic' : actor.range))) return false;
  if (skill.utility && target.id === state.escort?.wagon.id) return false;
  if (skill.kind === 'miracle') return target.side === actor.side && target.side === 'players' && !!target.userId && target.hp === 0 && !target.miracles?.dawnDebt && target.miracles?.downedKind !== 'sacrifice';
  return living(target) && (skill.kind === 'attack' || skill.kind === 'hex' ? target.side !== actor.side : target.side === actor.side);
}
function skillTargets(state: FantasyCombatState, actor: FantasyCombatFighter, center: FantasyCombatFighter, skill: FantasyCombatSkill): FantasyCombatFighter[] {
  if (!skillTarget(state, actor, center, skill) || !skillInRange(state, actor, center, skill)) return [];
  if (skill.kind === 'attack' && skill.shape && state.battlefield && center.tile) {
    const tiles = new Set(fantasyCombatAttackTiles(state, actor, center.tile, skill).map(fantasyCombatTileKey));
    return [center, ...fantasyCombatActors(state).filter(target => target.id !== center.id && skillTarget(state, actor, target, skill) && !!target.tile && tiles.has(fantasyCombatTileKey(target.tile)))];
  }
  if (!skill.radius || !state.battlefield || !center.tile || skill.selfOnly) return [center];
  return [center, ...fantasyCombatActors(state).filter(target => target.id !== center.id && skillTarget(state, actor, target, skill) && !!target.tile
    && fantasyCombatDistance(center.tile!, target.tile) <= skill.radius! && fantasyCombatLineOfSight(state, center.tile!, target.tile)
    && (skill.kind === 'attack' || skill.kind === 'hex' || skillInRange(state, actor, target, skill)))];
}
export function fantasyCombatAttackError(state: FantasyCombatState, actor: FantasyCombatFighter, target: FantasyCombatFighter, skill?: FantasyCombatSkill): FantasyCombatError | undefined {
  if (skill?.motion && fantasyCombatIsCarrying(actor)) return 'carrying';
  if (skill?.motion && skill.motion.kind !== 'reposition' && !fantasyCombatDashLanding(state, actor, target, skill)) return 'blocked';
  if (skill && skill.mp > 0 && fantasyCombatCondition(actor, 'silence')) return 'silenced';
  if (state.status !== 'active') return 'not-active';
  if (!living(actor)) return 'down';
  if (!living(target) || actor.side === target.side) return 'target';
  if (skill && (skill.kind !== 'attack' || !actor.skills.some(known => known.id === skill.id))) return 'invalid';
  if (skill && actor.mp < skill.mp) return 'mana';
  const range = skill?.range ?? (skill?.magic ? 'magic' : actor.range);
  return (skill?.reach !== undefined ? skillInRange(state, actor, target, skill) : legalTarget(state, actor, target, range)) ? undefined : 'range';
}
export interface FantasyCombatHitChance { chance: number; threshold: number; accuracy: number; distancePenalty: number; statusPenalty: number; focusBonus: number; skillBonus: number; covered: boolean; situationalBonus: number; situationalLabels: string[] }
export function fantasyCombatHitChance(state: FantasyCombatState, attacker: FantasyCombatFighter, target: FantasyCombatFighter, skill?: FantasyCombatSkill, options: { range?: FantasyCombatRange; magic?: boolean } = {}): FantasyCombatHitChance {
  const range = options.range ?? skill?.range ?? (skill?.magic ? 'magic' : attacker.range);
  const magic = options.magic ?? (skill?.reach !== undefined ? skill.magic === true : skill?.magic === true || range === 'magic');
  const chill = attacker.effects.find(effect => effect.id === 'frost')?.power ?? 0;
  const targetChill = target.effects.find(effect => effect.id === 'frost')?.power ?? 0;
  const covered = fantasyCombatCover(state, target, attacker), focusBonus = attacker.aim?.bonus ?? 0, skillBonus = skill?.hitBonus ?? 0;
  const distance = state.battlefield && attacker.tile && target.tile ? fantasyCombatDistance(attacker.tile, target.tile) : 0;
  const distancePenalty = range === 'melee' ? 0 : Math.min(10, Math.max(0, distance - 3));
  const statusPenalty = (chill ? Math.min(20, 7 + chill) : 0) + (fantasyCombatCondition(attacker, 'blind')?.power ?? 0) * 2;
  const clarity = magic ? fantasyCombatCondition(attacker, 'clarity')?.power ?? 0 : 0;
  const situational = fantasyCombatSituationalBonus(attacker.vocation, { id: target.template, kind: target.template ? fantasyCombatEnemy(target.template)?.kind : undefined });
  const accuracy = Math.max(10, Math.min(100, attacker.stats.accuracy + focusBonus + skillBonus + clarity + situational.accuracy) - statusPenalty - distancePenalty - (fantasyCombatCondition(target, 'haste')?.power ?? 0) - (covered ? magic ? 4 : 10 : 0));
  const evasion = Math.max(0, target.stats.agility - (targetChill ? Math.min(9, 2 + targetChill) : 0));
  const threshold = Math.max(3, Math.min(19, Math.round(20 - (accuracy + attacker.stats.agility * .25 - evasion * .35) / 5)));
  return { chance: (21 - threshold) / 20, threshold, accuracy, distancePenalty, statusPenalty, focusBonus, skillBonus, covered, situationalBonus: situational.accuracy, situationalLabels: situational.label };
}
function supply(options: FantasyCombatOptions, user: string, item: string): FantasyCombatSupply | undefined {
  const items = options.supplies && Object.hasOwn(options.supplies, user) ? options.supplies[user] : undefined;
  const value = items && Object.hasOwn(items, item) ? items[item] : undefined;
  return value && integer(value.count, 1) && localized(value.names) && (value.hp === undefined || integer(value.hp, 0)) && (value.mp === undefined || integer(value.mp, 0))
    && (value.combat === undefined || validSkill(value.combat) && value.combat.mp === 0 && ['attack', 'boon', 'hex'].includes(value.combat.kind))
    && (value.cleanse === undefined || Array.isArray(value.cleanse) && value.cleanse.length <= 3 && value.cleanse.every(id => ['poison', 'burn', 'frost'].includes(id)))
    && (Number(value.hp) > 0 || Number(value.mp) > 0 || value.cleanse?.length || value.combat) ? value : undefined;
}
export function fantasyCombatOrderError(state: FantasyCombatState, userId: string, order: FantasyCombatOrder, options: FantasyCombatOptions = {}): FantasyCombatError | undefined {
  if (!isFantasyCombatOrder(order)) return 'invalid';
  if (state.status !== 'active') return 'not-active';
  if (order.type === 'escort') return fantasyEscortOrderError(state, userId, order.order);
  let actor = state.fighters.find(f => f.userId === userId && f.side === 'players');
  if (!actor) return 'not-owner'; if (!living(actor)) return 'down';
  let alreadyOrdered: boolean;
  if (order.type === 'unit') {
    const unitId = order.unit, unit = state.units?.find(unit => unit.id === unitId);
    if (!unit || unit.companion?.ownerId !== userId || unit.companion.generation !== actor.generation) return 'not-owner';
    if (!living(unit)) return 'down'; alreadyOrdered = !!unitOrderOf(state, unit.id);
    actor = unit; order = order.order;
  } else alreadyOrdered = !!orderOf(state, userId);
  // New carry operations belong to the party's out-of-combat aid flow, including nested unit orders.
  if (order.type === 'carry' || order.type === 'putDown') return 'blocked';
  if (alreadyOrdered) return 'already-ordered';
  if (order.type === 'escape' && actor.miracles?.afflictions?.includes('soul-binding')) return 'blocked';
  if (order.type === 'guard' || order.type === 'escape') return undefined;
  if (order.type === 'skillMove') {
    const skill = actor.skills.find(entry => entry.id === order.skill);
    if (fantasyCombatIsCarrying(actor)) return 'carrying';
    if (!skill || skill.motion?.kind !== 'reposition') return 'invalid';
    if (actor.mp < skill.mp) return 'mana';
    if (skill.mp > 0 && fantasyCombatCondition(actor, 'silence')) return 'silenced';
    return fantasyCombatSkillMovePath(state, actor, skill, order.tile) ? undefined : 'blocked';
  }
  if (order.type === 'move' && fantasyCombatIsCarrying(actor)) return 'carrying';
  if (order.type === 'move') return fantasyCombatCondition(actor, 'root') ? 'blocked' : order.position === actor.position ? 'unnecessary' : undefined;
  if (order.type === 'moveTo') {
    if (fantasyCombatCondition(actor, 'root')) return 'blocked';
    if (!state.battlefield || !actor.tile) return 'invalid';
    if (fantasyCombatTileKey(actor.tile) === fantasyCombatTileKey(order.tile)) return 'unnecessary';
    return fantasyCombatMoveAttempt(state, actor, order.tile) ? undefined : 'blocked';
  }
  if (order.type === 'break') {
    const entry = state.battlefield?.obstacles?.find(value => fantasyCombatTileKey(value.tile) === fantasyCombatTileKey(order.tile));
    if (!entry || !fantasyObstacleKind(entry.kind)?.breakable) return 'target';
    const skill = order.skill ? actor.skills.find(skill => skill.id === order.skill) : undefined;
    if (order.skill && (!skill || skill.kind !== 'attack')) return 'invalid';
    if (skill && fantasyMiracleSkill(skill.id)) return 'blocked';
    if (skill?.motion) return 'target';
    if (skill?.mp && fantasyCombatCondition(actor, 'silence')) return 'silenced';
    if (skill && actor.mp < skill.mp) return 'mana';
    const range = skill?.range ?? (skill?.magic ? 'magic' : actor.range);
    if (!actor.tile) return 'range';
    const reach = skill?.reach ?? (range === 'melee' ? 1 : range === 'magic' ? 8 : 7);
    return fantasyCombatDistance(actor.tile, order.tile) <= reach && fantasyCombatLineOfSight(state, actor.tile, order.tile, true) ? undefined : 'range';
  }
  const target = fantasyCombatActors(state).find(f => f.id === order.target);
  if (order.type === 'skill' && order.skill === FANTASY_NAVAL_HARPOON) return fantasyNavalHarpoonError(state, actor, target);
  if (!target) return 'target';
  if (order.type === 'attack') return fantasyCombatAttackError(state, actor, target);
  if (order.type === 'item') {
    const item = supply(options, userId, order.item);
    if (!item) return 'item';
    if (item.combat) {
      if (!skillTarget(state, actor, target, item.combat)) return 'target';
      if (!skillInRange(state, actor, target, item.combat)) return 'range';
      return undefined;
    }
    if (actor.side !== target.side || !living(target)) return 'target';
    if (state.battlefield && !fantasyCombatWithinRange(state, actor, target, 'ranged')) return 'range';
    return item.hp && target.hp < target.stats.hp || item.mp && target.mp < target.stats.mp || item.cleanse?.some(id => target.effects.some(effect => effect.id === id)) ? undefined : 'unnecessary';
  }
  const skill = actor.skills.find(skill => skill.id === order.skill);
  if (!skill) return 'invalid'; if (actor.mp < skill.mp) return 'mana';
  if (skill.motion?.kind === 'reposition') return 'target';
  if (skill.mp > 0 && fantasyCombatCondition(actor, 'silence')) return 'silenced';
  if (fantasyMiracleSkill(skill.id)) return fantasyMiracleOrderError(state, actor, target, skill);
  if (skill.kind === 'attack') return fantasyCombatAttackError(state, actor, target, skill);
  if (skill.utility) {
    if (!skillTarget(state, actor, target, skill)) return 'target';
    if (!skillInRange(state, actor, target, skill)) return 'range';
    const condition = target.conditions?.find(condition => condition.id === skill.utility);
    return condition && condition.power >= skill.power && condition.turns >= 2 ? 'unnecessary' : undefined;
  }
  if (!skillTarget(state, actor, target, skill)) return 'target';
  if (skill.reach !== undefined && !skillInRange(state, actor, target, skill)) return 'range';
  if (actor.side !== target.side) return 'target';
  if (state.battlefield && !(skill.reach !== undefined ? skillInRange(state, actor, target, skill) : fantasyCombatWithinRange(state, actor, target, 'magic'))) return 'range';
  if (skill.kind === 'mana' && (actor.manaRecoveryUsed || target.mp >= target.stats.mp)) return 'unnecessary';
  if (skill.kind === 'heal' && !skill.effects?.guard && !skillTargets(state, actor, target, skill).some(target => target.hp < target.stats.hp || skill.effects?.cleanse && hasAilment(target))) return 'unnecessary';
  if (skill.kind === 'cleanse' && !skill.effects?.guard && !skillTargets(state, actor, target, skill).some(hasAilment)) return 'unnecessary';
  if (skill.kind === 'blessing' && skill.effects?.might && target.blessing && (target.blessing.power > skill.effects.might || target.blessing.power === skill.effects.might && target.blessing.turns >= 2)) return 'unnecessary';
  if (skill.kind === 'focus' && target.id === state.escort?.wagon.id) return 'unnecessary';
  if (skill.kind === 'focus' && target.aim && target.aim.bonus >= Math.min(15, skill.power)) return 'unnecessary';
  return undefined;
}
function combatTelegraph(fighter: FantasyCombatFighter, round: number, locale: NpcLocale): string {
  const pattern = fighter.template ? fantasyCombatEnemy(fighter.template)?.pattern : undefined;
  if (!pattern || !living(fighter)) return '';
  if (fighter.enemyCharge) {
    const charge=fighter.enemyCharge, skill=fighter.skills.find(skill=>skill.id===charge.skill);
    return t(`${skill?.names.ko??'강한 공격'} · ${charge.resolvesRound}라운드에 표시 구역을 타격한다.`,`${skill?.names.en??'Powerful attack'} · strikes the marked area in round ${charge.resolvesRound}.`,`${skill?.names.ja??'強攻撃'}・${charge.resolvesRound}ラウンドに表示範囲を攻撃する。`)[locale];
  }
  if (fighter.skills.some(skill=>skill.id.startsWith('enemy-'))) {
    const selected=fantasyEnemyAttackForRound(fantasyCombatEnemy(fighter.template!)!,round);
    if (selected.mp>fighter.mp || selected.magic&&fantasyCombatCondition(fighter,'silence')) return t('가까운 상대를 직접 노린다.','It seeks a nearby target for a direct strike.','近くの相手への直接攻撃を狙う。')[locale];
    return (selected.prepare?t(`${selected.names.ko}의 힘을 모으려 한다.`,`It is about to prepare ${selected.names.en}.`,`${selected.names.ja}の力を溜めようとしている。`):t(`${selected.names.ko}을 쓸 틈을 노린다.`,`It looks for an opening to use ${selected.names.en}.`,`${selected.names.ja}を使う隙を窺う。`))[locale];
  }
  if (fighter.range === 'ranged') return t('먼 거리에서 사격할 틈을 노린다.', 'It readies a distant shot.', '遠くから射撃の隙を窺う。')[locale];
  const reserve = pattern === 'breath' ? 6 : ['arcane', 'frost', 'drain'].includes(pattern) ? 4 : 0;
  if (reserve && fighter.mp < reserve) return t('마력이 약해져 직접 공격할 태세다.', 'Its mana is low; it prepares a direct attack.', 'マナが弱まり、直接攻撃の構えを取る。')[locale];
  if (pattern === 'breath') return (round % 3 === 0 ? t('숨결을 내뿜으려 한다. 방어가 유효하다.', 'A breath attack is imminent. Guarding helps.', '吐息を放つ構え。防御が有効。') : round % 3 === 2 ? t('크게 숨을 들이마신다.', 'It draws a deep breath.', '大きく息を吸い込む。') : t('전열을 노린다.', 'It watches the front line.', '前衛を狙う。'))[locale];
  if (pattern === 'arcane' || pattern === 'drain') return t('마나를 모아 방호가 약한 틈을 노린다.', 'It gathers mana to strike a weak ward.', 'マナを集め、守りの薄い隙を狙う。')[locale];
  if (pattern === 'venom') return t('독이 맺힌 공격을 준비한다.', 'It readies a venomous strike.', '毒を帯びた一撃を構える。')[locale];
  if (pattern === 'frost') return t('서리가 일어 움직임을 늦추려 한다.', 'Frost gathers to slow its prey.', '霜が集まり、動きを鈍らせようとする。')[locale];
  if (pattern === 'guard' && round % 3 === 0) return t('수비를 굳히려 한다.', 'It is preparing to guard.', '守りを固める構え。')[locale];
  if (pattern === 'regen') return t('상처가 서서히 아문다.', 'Its wounds slowly knit.', '傷がゆっくり塞がる。')[locale];
  return t('가까운 전열을 살핀다.', 'It studies the nearby front line.', '近くの前衛を窺う。')[locale];
}
export function fantasyCombatRageMultiplier(fighter: FantasyCombatFighter, round: number): number {
  return fighter.template && fantasyCombatEnemy(fighter.template)?.provocationOnly && round >= 20 ? 1 + Math.min(10, 1 + Math.floor((round - 20) / 3)) * .1 : 1;
}
export function fantasyCombatTelegraph(fighter: FantasyCombatFighter, round: number, locale: NpcLocale): string {
  const base = combatTelegraph(fighter, round, locale);
  if (!base || !fighter.template || !fantasyCombatEnemy(fighter.template)?.provocationOnly || round < 18) return base;
  const multiplier = fantasyCombatRageMultiplier(fighter, round), percent = Math.round((multiplier - 1) * 100);
  return base + ' ' + (round < 20 ? t('장기전에 분노가 쌓인다. 20라운드부터 피해가 점차 커진다.', 'Rage gathers in the long fight. Damage will rise gradually from round 20.', '長期戦で怒りが募る。20ラウンドから被害が徐々に増える。')
    : t(`격노로 피해가 ${percent}% 증가했다.`, `Rage increases damage by ${percent}%.`, `激怒で被害が${percent}%増えている。`))[locale];
}
function syncNaval(state: FantasyCombatState) {
  for (const severed of syncFantasyNavalDamage(state)) log(state, t(`${severed.part.names.ko} 절단 → ${severed.core.names.ko}: ${severed.damage} 피해.`, `${severed.part.names.en} severed → ${severed.core.names.en}: ${severed.damage} damage.`, `${severed.part.names.ja}を切断 → ${severed.core.names.ja}：${severed.damage}ダメージ。`));
}
function status(state: FantasyCombatState) {
  syncNaval(state);
  const players = state.fighters.filter(f => f.side === 'players');
  if (state.escort) {
    if (state.escort.wagon.hp <= 0) state.status = 'defeat';
    else if (!state.fighters.some(f => f.side === 'enemies' && living(f)) && fantasyEscortAtExit(state)) state.status = 'victory';
    else if (!players.some(living)) state.status = players.some(f => f.fled) ? 'escaped' : 'defeat';
    else if (!fantasyEscortHasCommander(state)) state.status = 'defeat';
    return;
  }
  if (!state.fighters.some(f => f.side === 'enemies' && living(f))) state.status = 'victory';
  else if (!players.some(living)) state.status = players.some(f => f.fled) ? 'escaped' : 'defeat';
}
function addEffect(target: FantasyCombatFighter, id: FantasyCombatEffect['id'], power: number, source?: string) {
  const effect = target.effects.find(effect => effect.id === id);
  if (effect) { if (power >= effect.power) { effect.power = power; effect.source = source; } effect.turns = 3; } else target.effects.push({ id, power, turns: 3, ...(source ? { source } : {}) });
}
function resolveRound(input: FantasyCombatState, at: number, options: FantasyCombatOptions): FantasyCombatResult {
  const state = structuredClone(input), spentItems: FantasyCombatSpentItem[] = [], usedSkills: NonNullable<FantasyCombatResult['usedSkills']> = [], attemptedAttacks: string[] = [];
  const actors = fantasyCombatActors(state);
  releaseInvalidFantasyCombatCarries(state);
  const miracleLog = (text: FantasyCombatText, presentation?: FantasyCombatPresentation) => log(state, text, undefined, presentation);
  const conditionReceipts = new Set<string>();
  const conditionReceipt = (condition: FantasyCombatCondition | undefined, target: FantasyCombatFighter, kind: FantasyCombatReceipt, amount = 1) => {
    const source = condition?.source; if (!condition || amount <= 0) return;
    const actor = source ? fantasyCombatContributionSource(state, source.owner, source.generation, source.unit) : actors.find(f => f.id === condition.contributor);
    if (!actor) return;
    if (kind === 'control') {
      if (condition!.id === 'root' && target.side === 'enemies' && state.battlefield && !actors.some(other => other.side !== target.side && living(other) && other.tile && [{ x: other.tile.x - 1, y: other.tile.y }, { x: other.tile.x + 1, y: other.tile.y }, { x: other.tile.x, y: other.tile.y - 1 }, { x: other.tile.x, y: other.tile.y + 1 }].some(tile => (fantasyCombatPath(state, target, tile, true)?.length ?? 0) > 1))) return;
      const key = `${actor.id}:${source?.skill ?? 'item'}:${target.id}:${condition.id}`; if (conditionReceipts.has(key)) return; conditionReceipts.add(key);
    }
    if (kind === 'healing' || kind === 'protection' || kind === 'rescue') aidReceipt(actor, target, kind, amount); else receipt(actor, kind, amount);
  };
  const applyFields = (actor: FantasyCombatFighter) => {
    const before = actor.hp;
    const results = fantasyCombatApplyFields(state, actor);
    const total = Math.max(0, before - actor.hp); if (total) { actor.hp = before; const dealt = applyFantasyMiracleDamage(state, actor, total, miracleLog); let remaining = dealt; for (const effect of results) { const field = state.fields?.find(f => f.kind === effect.kind && actor.tile && fantasyCombatTileKey(f.tile) === fantasyCombatTileKey(actor.tile)); const source = actors.find(f => f.id === field?.source); const amount = Math.min(remaining, effect.damage); if (source?.side !== actor.side) receipt(source, 'damage', amount); remaining -= amount; } }
    releaseInvalidFantasyCombatCarries(state);
    for (const effect of results) log(state, t(`${actor.names.ko}: ${effect.kind} 바닥 효과${effect.damage ? `, ${effect.damage} 피해` : ''}.`, `${actor.names.en}: ${effect.kind} ground effect${effect.damage ? `, ${effect.damage} damage` : ''}.`, `${actor.names.ja}：${effect.kind}の床効果${effect.damage ? `、${effect.damage}ダメージ` : ''}。`));
  };
  const traverse = (actor: FantasyCombatFighter, path: FantasyCombatTile[]) => {
    if (['body', 'appendage'].includes(fantasyNavalRole(state, actor) ?? '')) return;
    const walked = actor.tile ? [{ ...actor.tile }] : [];
    for (const tile of path.slice(1)) { if (!living(actor)) break; actor.tile = { ...tile }; syncFantasyCombatPatient(state,actor); walked.push({ ...tile }); applyFields(actor); }
    if (walked.length > 1) { const patient=fantasyCombatPatient(state,actor); if(patient)log(state,t(`${patient.names.ko}이 부축을 받으며 이동했다.`,`${patient.names.en} is carried along.`,`${patient.names.ja}が運ばれて移動した。`),undefined,{kind:'move',actor:patient.id,from:walked[0],to:walked.at(-1),path:walked}); }
    if (walked.length > 1) log(state, t(`${actor.names.ko}이 이동했다.`, `${actor.names.en} moves.`, `${actor.names.ja}が移動した。`), undefined, { kind: 'move', actor: actor.id, from: walked[0], to: walked.at(-1), path: walked });
  };
  const wardReceipts = new Map<string, { actor: FantasyCombatFighter; remaining: number }[]>();
  const addWard = (target: FantasyCombatFighter, actor: FantasyCombatFighter, amount: number) => {
    target.ward += amount;
    const entries = wardReceipts.get(target.id) ?? []; entries.push({ actor, remaining: amount }); wardReceipts.set(target.id, entries);
  };
  const circleWards = new Map<string, { userId: string; skill: string; mp: number }>();
  const circleReceipts = new Set<string>();
  const circleReceipt = (actor: FantasyCombatFighter, skill: FantasyCombatSkill) => {
    const userId = actor.userId ?? actor.companion?.ownerId;
    if (!userId || circleReceipts.has(`${userId}:${skill.id}`)) return;
    for (const target of actors) if (target.blessing?.owner === userId && target.blessing.skill === skill.id) target.blessing.credited = true;
    circleReceipts.add(`${userId}:${skill.id}`); usedSkills.push({ userId, skill: skill.id, mp: skill.mp, kind: 'circle' });
  };
  releaseInvalidFantasyCombatCarries(state);
  for (const unit of state.units ?? []) if (!state.fighters.some(f => f.userId === unit.companion!.ownerId && living(f))) unit.fled = true;
  const activePlayers = actors.filter(f => f.side === 'players' && f.id !== state.escort?.wagon.id && living(f));
  for (const fighter of actors) { fighter.guarding = false; fighter.ward = 0; delete fighter.wardOwner; delete fighter.wardUnit; }
  for (const fighter of state.fighters.filter(f => f.side === 'enemies' && living(f))) {
    if (!(state.battlefield && fighter.skills.length) && fantasyCombatEnemy(fighter.template!)?.pattern === 'guard' && state.round % 3 === 0) {
      fighter.guarding = true;
      log(state, t(`${fighter.names.ko}이 수비를 굳혔다.`, `${fighter.names.en} braces its guard.`, `${fighter.names.ja}が守りを固めた。`));
    }
  }
  for (const player of activePlayers) {
    const order = actorOrder(state, player);
    const directed = player.userId && ((state.units ?? []).some(unit => unit.companion!.ownerId === player.userId && living(unit) && unitOrderOf(state, unit.id)) || state.escort?.orderedBy === player.userId && !!state.escort?.order);
    if (order || directed) { player.contribution.manualActions++; player.contribution.activeRounds++; }
    if (!order || order.type === 'guard') {
      player.guarding = true;
      if (!order) log(state, t(`${player.names.ko}: 미입력으로 방어했다.`, `${player.names.en}: guarded without an order.`, `${player.names.ja}：未入力のため防御した。`));
    }
  }
  const credit = (user: string | undefined, unitId?: string, prepared = false) => {
    const actor = user ? state.fighters.find(f => f.userId === user) : undefined;
    if (actor && (prepared || orderOf(state, user!) || (state.units ?? []).some(unit => unit.companion?.ownerId === user && unitOrderOf(state, unit.id)) || state.escort?.orderedBy === user && !!state.escort?.order)) actor.contribution.effectiveActions++;
    const unit = unitId ? state.units?.find(unit => unit.id === unitId && unit.companion?.ownerId === user) : undefined;
    if (unit && (prepared || unitOrderOf(state, unit.id))) unit.contribution.effectiveActions++;
  };
  const utilityCredit = (condition: FantasyCombatCondition | undefined) => {
    const source = condition?.source; if (!source || source.credited) return;
    source.credited = true;
    const owner = state.fighters.find(fighter => fighter.userId === source.owner && fighter.generation === source.generation);
    if (!owner || !living(owner)) return;
    credit(source.owner, source.unit, true); if (!source.unit) usedSkills.push({ userId: source.owner, skill: source.skill, mp: source.mp, kind: 'utility' });
  };
  const resistStatus = (target: FantasyCombatFighter) => {
    const resolve = fantasyCombatCondition(target, 'resolve'); if (!resolve) return false;
    conditionReceipt(resolve, target, 'control'); utilityCredit(resolve); target.conditions = target.conditions!.filter(condition => condition !== resolve); return true;
  };
  const inflict = (target: FantasyCombatFighter, id: FantasyCombatEffect['id'], power: number, source?: FantasyCombatFighter) => { if (!resistStatus(target)) addEffect(target, id, power, source?.id); };
  const applyUtility = (actor: FantasyCombatFighter, target: FantasyCombatFighter, skill: FantasyCombatSkill, fromItem = false) => {
    const existing = target.conditions?.find(condition => condition.id === skill.utility);
    if (existing && existing.power >= skill.power && existing.turns >= 2) return false;
    if (skill.kind === 'hex' && resistStatus(target)) return false;
    const condition: FantasyCombatCondition = { id: skill.utility as FantasyCombatUtility, power: skill.power, turns: 3, ...(fromItem ? { contributor: actor.id } : {}),
      ...(!fromItem && (actor.userId || actor.companion) ? { source: { owner: actor.userId ?? actor.companion!.ownerId, generation: actor.generation ?? actor.companion!.generation, skill: skill.id, mp: skill.mp, credited: false, ...(actor.companion ? { unit: actor.id } : {}) } } : {}) };
    target.conditions = [...(target.conditions ?? []).filter(condition => condition.id !== skill.utility), condition];
    return true;
  };
  const damage = (attacker: FantasyCombatFighter, target: FantasyCombatFighter, power: number, magic: boolean, coefficient = 1, skill?: FantasyCombatSkill, range?: FantasyCombatRange, telegraphedArea = false): boolean => {
    if (telegraphedArea && fantasyMiracleAreaSafe(state,target)) {
      const source = actors.find(actor => actor.miracles?.safeTile?.round === state.round && actor.miracles.safeTile.tile.x === target.tile?.x && actor.miracles.safeTile.tile.y === target.tile?.y);
      const key = `${source?.id}:calamity:${target.id}`; if (!conditionReceipts.has(key)) { receipt(source, 'control', 1); conditionReceipts.add(key); }
      applyFantasyMiracleDamage(state,target,1,miracleLog,true); return false;
    }
    const enemyElement=attacker.template?({breath:'fire',frost:'frost',venom:'poison',arcane:'storm'} as Record<string,string>)[fantasyCombatEnemy(attacker.template)?.pattern??'']:undefined;
    const { threshold, covered } = fantasyCombatHitChance(state, attacker, target, skill, { magic, ...(range ? { range } : {}) }), aim = attacker.aim;
    const roll = Math.floor(random(state) * 20) + 1, success = roll === 20 || roll !== 1 && roll >= threshold;
    const without = (actor: FantasyCombatFighter, id: FantasyCombatUtility) => ({ ...actor, conditions: actor.conditions?.filter(c => c.id !== id) });
    const counterHit = (a: FantasyCombatFighter, b: FantasyCombatFighter) => roll === 20 || roll !== 1 && roll >= fantasyCombatHitChance(state, a, b, skill, { magic, ...(range ? { range } : {}) }).threshold;
    if (!success && counterHit(without(attacker, 'blind'), target)) conditionReceipt(fantasyCombatCondition(attacker, 'blind'), attacker, 'control');
    if (!success && counterHit(attacker, without(target, 'haste'))) conditionReceipt(fantasyCombatCondition(target, 'haste'), target, 'control');
    if (success && magic && !counterHit(without(attacker, 'clarity'), target)) conditionReceipt(fantasyCombatCondition(attacker, 'clarity'), attacker, 'control');
    utilityCredit(fantasyCombatCondition(attacker, 'blind')); utilityCredit(fantasyCombatCondition(target, 'haste'));
    if (magic) utilityCredit(fantasyCombatCondition(attacker, 'clarity'));
    if (aim) {
      delete attacker.aim;
      const owner = state.fighters.find(f => f.userId === aim.owner && f.generation === aim.generation);
      if (owner && living(owner)) { credit(aim.owner, aim.unit, true); usedSkills.push({ userId: aim.owner, skill: aim.skill, mp: aim.mp }); }
    }
    if (!success) { log(state, t(`${attacker.names.ko}의 공격을 ${target.names.ko}이 피했다.`, `${target.names.en} evades ${attacker.names.en}.`, `${target.names.ja}は${attacker.names.ja}の攻撃を避けた。`), { sides: 20, value: roll, target: threshold, success }, { kind: 'attack', actor: attacker.id, target: target.id, ...(attacker.tile ? { from: { ...attacker.tile } } : {}), ...(target.tile ? { to: { ...target.tile } } : {}), ...(skill ? { skill: skill.id } : {}), ...(skill?.id.startsWith('priest-') ? { element: 'holy' } : skill?.field || skill?.damageType || enemyElement ? { element: skill?.field ?? skill?.damageType ?? enemyElement } : {}) }); return false; }
    const resistance = target.template ? fantasyCombatEnemy(target.template) : undefined;
    power += fantasyCombatSituationalBonus(attacker.vocation, { id: target.template, kind: resistance?.kind }).power;
    const multiplier = (target.miracles?.afflictions?.includes('curse') ? 1.15 : 1) * (attacker.miracles?.afflictions?.includes('possession') ? .85 : 1) * Math.max(.5, Math.min(1.5, (magic ? resistance?.magicMultiplier : resistance?.physicalMultiplier) ?? 1));
    const clarity = fantasyCombatCondition(target, 'clarity'), weakened = fantasyCombatCondition(attacker, 'weaken'), vulnerable = fantasyCombatCondition(target, 'vulnerable'), resolve = fantasyCombatCondition(target, 'resolve');
    const mitigation = (1 - Math.min(.3, (weakened?.power ?? 0) * .02)) * (1 + Math.min(.35, (vulnerable?.power ?? 0) * .025)) * (1 - Math.min(.3, (resolve?.power ?? 0) * .02));
    const raw = Math.max(1, (magic ? attacker.stats.intelligence * 1.3 + attacker.stats.attack * fantasyJobMagicAttackRatio(attacker.vocation?.job) + power + (attacker.blessing?.power ?? 0) - (target.stats.magicResist + (clarity?.power ?? 0) * 2) * .65 : attacker.stats.attack + power + (attacker.blessing?.power ?? 0) - target.stats.defense * .7) * coefficient * fantasyCombatRageMultiplier(attacker, state.round) * multiplier * mitigation);
    const before = Math.max(1, Math.round(raw * (roll === 20 ? 1.4 : 1) * (covered ? magic ? .9 : .75 : 1))), guarded = Math.max(1, Math.round(before * (target.guarding ? .35 : 1)));
    const threatenedHp = target.hp;
    const criticalCover = (roll === 20 ? 1.4 : 1) * (covered ? magic ? .9 : .75 : 1);
    const basePower = magic ? attacker.stats.intelligence * 1.3 + attacker.stats.attack * fantasyJobMagicAttackRatio(attacker.vocation?.job) + power + (attacker.blessing?.power ?? 0) - target.stats.magicResist * .65 : attacker.stats.attack + power + (attacker.blessing?.power ?? 0) - target.stats.defense * .7;
    const baseScale = coefficient * fantasyCombatRageMultiplier(attacker, state.round) * multiplier;
    const damageAt = (clarityPower: number, weakPower: number, resolvePower: number, vulnerablePower = vulnerable?.power ?? 0, blessingPower = attacker.blessing?.power ?? 0) => Math.max(1, Math.round(Math.max(1, (basePower - (magic ? clarityPower * 1.3 : 0) - ((attacker.blessing?.power ?? 0) - blessingPower)) * baseScale * (1 - Math.min(.3, weakPower * .02)) * (1 + Math.min(.35, vulnerablePower * .025)) * (1 - Math.min(.3, resolvePower * .02))) * criticalCover));
    const stages = [damageAt(0, 0, 0), damageAt(magic ? clarity?.power ?? 0 : 0, 0, 0), damageAt(magic ? clarity?.power ?? 0 : 0, weakened?.power ?? 0, 0), before];
    if (magic) conditionReceipt(clarity, target, 'protection', Math.max(0, Math.min(threatenedHp, stages[0]) - Math.min(threatenedHp, stages[1])));
    conditionReceipt(weakened, target, 'protection', Math.max(0, Math.min(threatenedHp, stages[1]) - Math.min(threatenedHp, stages[2])));
    conditionReceipt(resolve, target, 'protection', Math.max(0, Math.min(threatenedHp, stages[2]) - Math.min(threatenedHp, stages[3])));
    if (target.guarding && actorOrder(state, target)?.type === 'guard') aidReceipt(target, target, 'protection', Math.max(0, Math.min(threatenedHp, before) - Math.min(threatenedHp, guarded)));
    const absorbed = Math.min(target.ward, guarded); target.ward -= absorbed;
    let absorption = absorbed, prevented = Math.max(0, Math.min(threatenedHp, guarded) - Math.min(threatenedHp, guarded - absorbed));
    for (const entry of wardReceipts.get(target.id) ?? []) { const used = Math.min(absorption, entry.remaining), credited = Math.min(prevented, used); aidReceipt(entry.actor, target, 'protection', credited); entry.remaining -= used; absorption -= used; prevented -= credited; }

    const amount = Math.max(0, guarded - absorbed), dealt = applyFantasyMiracleDamage(state, target, amount, miracleLog, telegraphedArea);
    if (attacker.side !== target.side) receipt(attacker, 'damage', dealt);
    if (dealt) {
      const noVulnerable = damageAt(magic ? clarity?.power ?? 0 : 0, weakened?.power ?? 0, resolve?.power ?? 0, 0);
      const noBlessing = damageAt(magic ? clarity?.power ?? 0 : 0, weakened?.power ?? 0, resolve?.power ?? 0, vulnerable?.power ?? 0, 0);
      const finalDamage = (n: number) => Math.min(threatenedHp, Math.max(0, Math.max(1, Math.round(n * (target.guarding ? .35 : 1))) - absorbed));
      conditionReceipt(vulnerable, target, 'assistance', Math.max(0, dealt - finalDamage(noVulnerable)));
      if (attacker.blessing) receipt(fantasyCombatContributionSource(state, attacker.blessing.owner, attacker.blessing.generation), 'assistance', Math.max(0, dealt - finalDamage(noBlessing)));
      utilityCredit(weakened); utilityCredit(vulnerable); utilityCredit(resolve); if (magic) utilityCredit(clarity);
      const drain = fantasyCombatCondition(attacker, 'lifesteal'), thorns = fantasyCombatCondition(target, 'thorns');
      if (drain && living(attacker)) { const healed = Math.min(attacker.stats.hp - attacker.hp, Math.max(1, Math.floor(dealt * Math.min(.3, drain.power * .02)))); attacker.hp += healed; if (healed) { conditionReceipt(drain, attacker, 'healing', healed); utilityCredit(drain); } }
      if (thorns && living(attacker)) { const reflected = applyFantasyMiracleDamage(state, attacker, Math.min(attacker.hp, thorns.power, dealt), miracleLog); if (reflected) { conditionReceipt(thorns, attacker, 'damage', reflected); utilityCredit(thorns); log(state, t(`${attacker.names.ko}: 반사 피해 ${reflected}.`, `${attacker.names.en}: ${reflected} reflected damage.`, `${attacker.names.ja}：反射ダメージ${reflected}。`)); } }
    }
    const blessing = attacker.blessing;
    if (dealt && blessing && !blessing.credited) {
      blessing.credited = true; credit(blessing.owner, undefined, true);
      if (!circleReceipts.has(`${blessing.owner}:${blessing.skill}`)) { circleReceipts.add(`${blessing.owner}:${blessing.skill}`); usedSkills.push({ userId: blessing.owner, skill: blessing.skill, mp: blessing.mp, kind: 'circle' }); }
    }
    const ward = circleWards.get(target.id);
    if (absorbed && ward && !circleReceipts.has(`${ward.userId}:${ward.skill}`)) {
      circleReceipts.add(`${ward.userId}:${ward.skill}`); usedSkills.push({ ...ward, kind: 'circle' });
      if (target.blessing?.owner === ward.userId && target.blessing.skill === ward.skill) target.blessing.credited = true;
    }
    if (dealt) credit(attacker.userId ?? attacker.companion?.ownerId, attacker.companion ? attacker.id : undefined); if (target.guarding && before > guarded) credit(target.userId ?? target.companion?.ownerId ?? (target.id === state.escort?.wagon.id ? state.escort?.orderedBy : undefined), target.companion ? target.id : undefined); if (absorbed) credit(target.wardOwner, target.wardUnit);
    log(state, t(`${attacker.names.ko} → ${target.names.ko}: ${dealt} 피해.`, `${attacker.names.en} → ${target.names.en}: ${dealt} damage.`, `${attacker.names.ja} → ${target.names.ja}：${dealt}ダメージ。`), { sides: 20, value: roll, target: threshold, success }, { kind: 'attack', actor: attacker.id, target: target.id, ...(attacker.tile ? { from: { ...attacker.tile } } : {}), ...(target.tile ? { to: { ...target.tile } } : {}), ...(skill ? { skill: skill.id } : {}), ...(skill?.id.startsWith('priest-') ? { element: 'holy' } : skill?.field || skill?.damageType || enemyElement ? { element: skill?.field ?? skill?.damageType ?? enemyElement } : {}) });
    syncNaval(state);
    if (target.hp === 0) log(state, t(`${target.names.ko}이 쓰러졌다.`, `${target.names.en} falls.`, `${target.names.ja}が倒れた。`));
    return true;
  };
  for (const actor of actors) applyFields(actor);
  refreshFantasyMiracleAwakening(state, miracleLog);
  if (state.escort) state.escort.wagon.guarding = state.escort.order?.type !== 'moveTo';
  const ordered = [...actors].filter(f => f.id !== state.escort?.wagon.id && living(f)).sort((a, b) => {
    const priority = (f: FantasyCombatFighter) => {
      const order = actorOrder(state, f), skill = order?.type === 'skill' ? f.skills.find(entry => entry.id === order.skill) : undefined;
      if (f.side === 'enemies' && f.enemyCharge) return -100000;
      return f.side === 'players' && skill && fantasyMiracleSkill(skill.id) ? 200000 : f.side === 'players' && skill && !skill.motion && ['guard', 'focus', 'blessing'].includes(skill.kind) ? 100000 : 0;
    };
    const chill = (f: FantasyCombatFighter) => { const power = f.effects.find(e => e.id === 'frost')?.power ?? 0; return power ? Math.min(9, 2 + power) : 0; };
    return priority(b) - priority(a) || (b.stats.agility - chill(b)) - (a.stats.agility - chill(a)) || a.id.localeCompare(b.id);
  });
  for (const actor of ordered) {
    releaseInvalidFantasyCombatCarries(state); status(state); if (state.status !== 'active') break; if (!living(actor)) continue;
    if (actor.side === 'players') {
      if (actor.companion && !state.fighters.some(f => f.userId === actor.companion!.ownerId && living(f))) { actor.fled = true; continue; }
      const order = actorOrder(state, actor) ?? { type: 'guard' as const };
      if (order.type === 'guard') continue;
      if (order.type === 'unit' || order.type === 'escort') continue;
      if(order.type==='carry'||order.type==='putDown'){
        if(fantasyCombatCarryOrderError(state,actor,order))continue;
        if(order.type==='carry'){
          const patient=actors.find(f=>f.id===order.target)!,from={...patient.tile!};
          pickupFantasyCombatPatient(state,actor,order.target);
          log(state,fantasyCombatCarryLog(actor,patient),undefined,{kind:'move',actor:patient.id,from,to:{...patient.tile!},path:[from,{...patient.tile!}]});
        }else{
          const patient=fantasyCombatPatient(state,actor),from=patient?.tile?{...patient.tile}:undefined;
          putDownFantasyCombatPatient(state,actor,order.tile);
          log(state,fantasyCombatCarryLog(actor,patient,true),undefined,patient&&from?{kind:'move',actor:patient.id,from,to:{...patient.tile!},path:[from,{...patient.tile!}]}:undefined);
        }
        continue;
      }
      if (order.type === 'skillMove') {
        const skill = actor.skills.find(entry => entry.id === order.skill);
        if (!skill || skill.motion?.kind !== 'reposition' || actor.mp < skill.mp || skill.mp > 0 && fantasyCombatCondition(actor, 'silence')) continue;
        const path = fantasyCombatSkillMovePath(state, actor, skill, order.tile);
        if (!path) continue;
        actor.mp -= skill.mp; traverse(actor, path); actor.position = actor.tile!.x >= 4 ? 'front' : 'rear';
        credit(actor.userId ?? actor.companion?.ownerId, actor.companion ? actor.id : undefined); circleReceipt(actor, skill);
        log(state, t(`${actor.names.ko}이 ${skill.names.ko}로 위치를 잡았다.`, `${actor.names.en} repositions with ${skill.names.en}.`, `${actor.names.ja}が${skill.names.ja}で位置を取った。`)); continue;
      }
      if (order.type === 'move' || order.type === 'moveTo') {
        if(order.type==='move'&&fantasyCombatIsCarrying(actor))continue;
        if (fantasyCombatCondition(actor, 'root')) { conditionReceipt(fantasyCombatCondition(actor, 'root'), actor, 'control'); utilityCredit(fantasyCombatCondition(actor, 'root')); continue; }
        if (state.battlefield && actor.tile) {
          const destination = order.type === 'moveTo' ? order.tile : { x: order.position === 'front' ? 4 : 1, y: actor.tile.y };
          const attempt = fantasyCombatMoveAttempt(state, actor, destination);
          let path = attempt?.path;
          if (!path || !attempt || order.type === 'move' && attempt.extra > 0) { log(state, t(`${actor.names.ko}: 길이 막혀 이동하지 못했다.`, `${actor.names.en}: the route is blocked.`, `${actor.names.ja}：道が塞がれ移動できなかった。`)); continue; }
          if (attempt.extra > 0) {
            const value = Math.floor(random(state) * 20) + 1, success = value === 20 || value !== 1 && value >= attempt.threshold;
            log(state,t(`${actor.names.ko}: 무리한 이동 ${success ? '성공' : '실패 · 기본 거리까지만 전진'}.`,`${actor.names.en}: overextended move ${success ? 'succeeded' : 'failed; advancing only the guaranteed distance'}.`,`${actor.names.ja}：無理な移動${success ? '成功' : '失敗・通常距離まで前進'}。`),{sides:20,value,target:attempt.threshold,success});
            if (!success) path = path.slice(0,path.findIndex(tile => fantasyCombatTileKey(tile) === fantasyCombatTileKey(attempt.failureTile)) + 1);
          }
          if (path.length < 2) continue;
          const crossings = path.slice(1).flatMap(tile => state.battlefield!.obstacles?.filter(entry => fantasyCombatTileKey(entry.tile) === fantasyCombatTileKey(tile)) ?? []);
          let crossed = true;
          for (const entry of crossings) {
            const over = actor.body?.flying || actor.body?.large, bonus = actor.body?.flying ? 5 : over ? Math.floor(actor.stats.attack / 20) : actor.body?.small ? 3 : actor.body?.flexible ? 2 : 0;
            const threshold = Math.max(3, Math.min(18, 12 - bonus - Math.floor(actor.stats.agility / 20))), value = Math.floor(random(state) * 20) + 1;
            const success = value === 20 || value !== 1 && value >= threshold;
            log(state, t(`${actor.names.ko}: 장애물 ${over ? '넘기' : '하단 통과'} ${success ? '성공' : '실패'}.`, `${actor.names.en}: ${over ? 'cross' : 'passage'} ${success ? 'succeeded' : 'failed'}.`, `${actor.names.ja}：障害物の${over ? '乗り越え' : '下側通過'}${success ? '成功' : '失敗'}。`), { sides: 20, value, target: threshold, success });
            if (!success) { crossed = false; break; }
          }
          if (!crossed) continue;
          traverse(actor, path); actor.position = actor.tile!.x >= 4 ? 'front' : 'rear';
        } else if (order.type === 'move') actor.position = order.position;
        utilityCredit(fantasyCombatCondition(actor, 'haste')); log(state, t(`${actor.names.ko}이 자리를 옮겼다.`, `${actor.names.en} changes position.`, `${actor.names.ja}が位置を変えた。`)); continue;
      }
      if (order.type === 'escape') {
        const quickest = Math.max(...state.fighters.filter(f => f.side === 'enemies' && living(f)).map(f => f.stats.agility));
        const target = Math.max(4, Math.min(18, 11 + Math.round((quickest - actor.stats.agility) / 5) + (fantasyCombatIsCarrying(actor)?2:0))), value = Math.floor(random(state) * 20) + 1;
        const escaped = value === 20 || value !== 1 && value >= target;
        if (escaped) { actor.fled = true; const patient=fantasyCombatPatient(state,actor);if(patient)patient.fled=true; for (const unit of state.units ?? []) if (unit.companion?.ownerId === actor.userId) unit.fled = true; credit(actor.userId); }
        log(state, t(`${actor.names.ko}: 도주 ${escaped ? '성공' : '실패'}.`, `${actor.names.en}: escape ${escaped ? 'succeeded' : 'failed'}.`, `${actor.names.ja}：逃走${escaped ? '成功' : '失敗'}。`), { sides: 20, value, target, success: escaped }); continue;
      }
      if (order.type === 'break') {
        const entry = state.battlefield?.obstacles?.find(value => fantasyCombatTileKey(value.tile) === fantasyCombatTileKey(order.tile));
        const kind = entry && fantasyObstacleKind(entry.kind), skill = order.skill ? actor.skills.find(skill => skill.id === order.skill && skill.kind === 'attack') : undefined;
        if (!entry || !kind?.breakable || !actor.tile || order.skill && !skill || skill && actor.mp < skill.mp || skill?.motion) continue;
        if (skill?.mp && fantasyCombatCondition(actor, 'silence')) { conditionReceipt(fantasyCombatCondition(actor, 'silence'), actor, 'control'); utilityCredit(fantasyCombatCondition(actor, 'silence')); continue; }
        const range = skill?.range ?? (skill?.magic ? 'magic' : actor.range), reach = skill?.reach ?? (range === 'melee' ? 1 : range === 'magic' ? 8 : 7);
        if (fantasyCombatDistance(actor.tile, order.tile) > reach || !fantasyCombatLineOfSight(state, actor.tile, order.tile, true)) continue;
        const situational = fantasyCombatSituationalBonus(actor.vocation, {}, entry.kind);
        const value = Math.floor(random(state) * 20) + 1, threshold = Math.max(3, Math.min(19, Math.round(20 - (actor.stats.accuracy + situational.accuracy) / 5))), success = value === 20 || value !== 1 && value >= threshold;
        if (skill) actor.mp -= skill.mp;
        if (!success) { log(state, t(`${actor.names.ko}의 장애물 공격이 빗나갔다.`, `${actor.names.en} misses the obstacle.`, `${actor.names.ja}の障害物への攻撃が外れた。`), { sides: 20, value, target: threshold, success }); continue; }
        const magic = skill?.reach !== undefined ? skill.magic === true : skill?.magic || range === 'magic';
        const power = Math.max(1, Math.round((magic ? actor.stats.intelligence * 1.3 + actor.stats.attack * .4 : actor.stats.attack) + (skill?.power ?? 0) + situational.power));
        const broken = fantasyCombatBreakObstacle(state, order.tile, power, skill?.damageType ?? actor.attackDamageType ?? (magic ? 'none' : 'blunt'))!;
        credit(actor.userId ?? actor.companion?.ownerId, actor.companion ? actor.id : undefined);
        if (skill && actor.userId) usedSkills.push({ userId: actor.userId, skill: skill.id, mp: skill.mp, kind: 'obstacle' });
        log(state, t(`${actor.names.ko} → ${kind.names.ko}: ${broken.dealt} 피해${broken.destroyed ? ', 파괴' : ''}.`, `${actor.names.en} → ${kind.names.en}: ${broken.dealt} damage${broken.destroyed ? ', destroyed' : ''}.`, `${actor.names.ja} → ${kind.names.ja}：${broken.dealt}ダメージ${broken.destroyed ? '、破壊' : ''}。`), { sides: 20, value, target: threshold, success });
        continue;
      }
      let target = actors.find(f => f.id === order.target);
      if (order.type === 'item') {
        const item = supply(options, actor.userId!, order.item);
        if (item?.combat) {
          if (!target) continue;
          const targets = skillTargets(state, actor, target, item.combat); if (!targets.length) continue;
          let effective = false;
          for (const victim of targets) {
            if (item.combat.kind === 'attack') { const before = victim.hp; damage(actor, victim, item.combat.power, item.combat.magic === true, 1, item.combat); effective ||= victim.hp < before; }
            else if (item.combat.utility) effective = applyUtility(actor, victim, item.combat, true) || effective;
          }
          if (target.tile) fantasyCombatCreateFields(state, actor, target.tile, item.combat);
          spentItems.push({ userId: actor.userId!, item: order.item, count: 1 });
          if (effective && item.combat.kind !== 'attack') credit(actor.userId);
          log(state, t(`${actor.names.ko}이 ${item.names.ko}을 사용했다.`, `${actor.names.en} uses ${item.names.en}.`, `${actor.names.ja}が${item.names.ja}を使った。`)); continue;
        }
        if (!item || !target || !living(target) || target.side !== actor.side || state.battlefield && !fantasyCombatWithinRange(state, actor, target, 'ranged')) continue;
        const effects = target.effects;
        const hp = Math.min(target.stats.hp - target.hp, item.hp ?? 0), mp = Math.min(target.stats.mp - target.mp, item.mp ?? 0), cleanse = !!item.cleanse?.some(id => effects.some(effect => effect.id === id));
        if (!hp && !mp && !cleanse) { log(state, t(`${actor.names.ko}: 필요 없는 소모품 사용을 멈췄다.`, `${actor.names.en}: kept an unnecessary consumable.`, `${actor.names.ja}：不要な消耗品は使わなかった。`)); continue; }
        target.hp += hp; target.mp += mp; aidReceipt(actor, target, 'healing', hp); receipt(actor, 'mana', mp); if (cleanse) { const before = target.effects.length; target.effects = target.effects.filter(effect => !item.cleanse!.includes(effect.id)); receipt(actor, 'control', before - target.effects.length); }
        spentItems.push({ userId: actor.userId!, item: order.item, count: 1 }); credit(actor.userId);
        log(state, t(`${actor.names.ko}이 ${target.names.ko}에게 ${item.names.ko}을 사용했다.`, `${actor.names.en} uses ${item.names.en} on ${target.names.en}.`, `${actor.names.ja}が${target.names.ja}に${item.names.ja}を使った。`)); continue;
      }
      if (order.type === 'skill' && order.skill === FANTASY_NAVAL_HARPOON) {
        if (target && useFantasyNavalHarpoon(state, actor, target)) {
          receipt(actor, 'control', 1); credit(actor.userId);
          log(state, t(`${actor.names.ko}: 공용 작살로 ${target.names.ko}을 갑판 곁에 묶었다.`, `${actor.names.en} tethers ${target.names.en} beside the deck with the shared harpoon.`, `${actor.names.ja}が共用銛で${target.names.ja}を甲板のそばに繋いだ。`), undefined, { kind: 'attack', actor: actor.id, target: target.id, skill: FANTASY_NAVAL_HARPOON });
        }
        continue;
      }
      const skill = order.type === 'skill' ? actor.skills.find(s => s.id === order.skill) : undefined;
      if (order.type === 'skill' && (!skill || actor.mp < skill.mp)) continue;
      if (skill?.mp && fantasyCombatCondition(actor, 'silence')) { conditionReceipt(fantasyCombatCondition(actor, 'silence'), actor, 'control'); utilityCredit(fantasyCombatCondition(actor, 'silence')); continue; }
      if (skill?.selfOnly && target?.id !== actor.id) continue;
      if (skill && fantasyMiracleSkill(skill.id)) { if (castFantasyMiracle(state, actor, target, skill, miracleLog)) { credit(actor.userId); circleReceipt(actor, skill); } continue; }
      if (skill?.utility) {
        if (!target || !skillTarget(state, actor, target, skill) || !skillInRange(state, actor, target, skill)) continue;
        const existing = target.conditions?.find(condition => condition.id === skill.utility);
        if (existing && existing.power >= skill.power && existing.turns >= 2) continue;
        actor.mp -= skill.mp;
        if (!applyUtility(actor, target, skill)) continue;
        log(state, t(`${actor.names.ko} → ${target.names.ko}: ${skill.names.ko} (3라운드).`, `${actor.names.en} → ${target.names.en}: ${skill.names.en} (3 rounds).`, `${actor.names.ja} → ${target.names.ja}：${skill.names.ja}（3ラウンド）。`));
        continue;
      }
      if (skill?.kind === 'mana') {
        if (actor.manaRecoveryUsed || !target || !living(target) || target.side !== actor.side || state.battlefield && !skillInRange(state, actor, target, skill)) continue;
        const selfCost=actor===target?skill.mp:0;
        const restored = Math.min(target.stats.mp - target.mp + selfCost, skill.power + Math.floor(actor.stats.intelligence * .4));
        if (restored <= selfCost) continue;
        actor.mp -= skill.mp; target.mp += restored; actor.manaRecoveryUsed = true; receipt(actor, 'mana', restored - selfCost);
        credit(actor.userId ?? actor.companion?.ownerId, actor.companion ? actor.id : undefined);
        if (actor.userId) usedSkills.push({ userId: actor.userId, skill: skill.id, mp: skill.mp, kind: 'mana' });
        log(state, t(`${actor.names.ko}이 ${target.names.ko}의 MP를 ${restored} 회복했다.`, `${actor.names.en} restores ${restored} MP to ${target.names.en}.`, `${actor.names.ja}が${target.names.ja}のMPを${restored}回復した。`));
        continue;
      }
      if (skill && skill.reach !== undefined) {
        if (!target) continue;
        const movingAttack = skill.motion && skill.motion.kind !== 'reposition';
        const landing = movingAttack ? fantasyCombatDashLanding(state, actor, target, skill) : undefined;
        if (movingAttack && !landing) continue;
        let advanceMoved = false;
        if (skill.motion?.kind === 'advance' && landing && fantasyCombatTileKey(actor.tile!) !== fantasyCombatTileKey(landing)) {
          actor.mp -= skill.mp;
          traverse(actor, fantasyCombatDashTrail(actor.tile!, target.tile!, landing, false));
          actor.position = actor.tile!.x >= 4 ? 'front' : 'rear'; advanceMoved = true;
          credit(actor.userId ?? actor.companion?.ownerId, actor.companion ? actor.id : undefined); circleReceipt(actor, skill);
          log(state, t(`${actor.names.ko}이 상대 앞으로 파고들었다.`, `${actor.names.en} closes in on the target.`, `${actor.names.ja}が対象の手前へ踏み込んだ。`));
          if (!living(actor)) continue;
        }
        const targets = skillTargets(state, actor, target, skill);
        if (!targets.length) continue;
        if (skill.kind === 'attack' && skill.effects?.guard) {
          addWard(actor, actor, skill.effects.guard); actor.wardOwner = actor.userId ?? actor.companion?.ownerId; if (actor.companion) actor.wardUnit = actor.id; else delete actor.wardUnit;
          if (actor.userId) circleWards.set(actor.id, { userId: actor.userId, skill: skill.id, mp: skill.mp });
        }
        let effective = advanceMoved;
        for (const victim of targets) {
          if (!living(actor)) break;
          if (skill.kind === 'attack') {
            const before = victim.hp, hit = damage(actor, victim, skill.power, skill.magic === true, victim.id === target.id ? 1 : (skill.secondaryDamage ?? 100) / 100, skill);
            if (hit && victim.hp < before) {
              effective = true;
              if (living(victim) && !victim.guarding) {
                if (skill.effects?.burn) inflict(victim, 'burn', skill.effects.burn, actor);
                if (skill.effects?.slow) inflict(victim, 'frost', skill.effects.slow, actor);
                if (skill.hitUtility && random(state) < skill.hitUtility.chance && applyUtility(actor, victim, { ...skill, kind: 'hex', utility: skill.hitUtility.id, power: skill.hitUtility.power })) {
                  const condition = victim.conditions?.find(entry => entry.id === skill.hitUtility!.id);
                  if (condition?.source) condition.source.credited = true;
                  log(state, t(`${victim.names.ko}에게 ${skill.names.ko}의 추가 효과가 남았다.`, `${victim.names.en} suffers the secondary effect of ${skill.names.en}.`, `${victim.names.ja}に${skill.names.ja}の追加効果が残った。`));
                }
                if (skill.onHit && random(state) < skill.onHit.chance) {
                  inflict(victim, skill.onHit.id, skill.onHit.power, actor);
                  log(state, t(`${victim.names.ko}에게 ${skill.onHit.id === 'burn' ? '화상' : skill.onHit.id === 'frost' ? '냉기' : '중독'}이 남았다.`, `${victim.names.en} suffers ${skill.onHit.id}.`, `${victim.names.ja}に${skill.onHit.id === 'burn' ? '火傷' : skill.onHit.id === 'frost' ? '冷気' : '毒'}が残った。`));
                }
              }
            }
          } else if (skill.kind === 'miracle') {
            if (state.battlefield && !fantasyCombatPlace(state, victim, victim.tile!)) continue;
            if (victim.miracles?.dawnDebt || victim.miracles?.downedKind === 'sacrifice') continue;
            if (victim.miracles) { delete victim.miracles.downedKind; delete victim.miracles.severity; }
            victim.hp = Math.min(victim.stats.hp, Math.max(1, skill.power + Math.floor(actor.stats.intelligence * .5))); aidReceipt(actor, victim, 'healing', victim.hp); aidReceipt(actor, victim, 'rescue', 1); cleanseAilments(victim); effective = true;
            log(state, t(`${actor.names.ko}의 기적이 ${victim.names.ko}을 일으켰다.`, `${actor.names.en}'s miracle raises ${victim.names.en}.`, `${actor.names.ja}の奇跡が${victim.names.ja}を立ち上がらせた。`));
          } else {
            if (skill.kind === 'heal') { const healed = Math.min(victim.stats.hp - victim.hp, skill.power + Math.floor(actor.stats.intelligence * .8) + fantasyJobHealingBonus(actor.vocation?.job,actor.stats.hp)); victim.hp += healed; aidReceipt(actor, victim, 'healing', healed); effective ||= healed > 0;
              if (healed) log(state, t(`${actor.names.ko}이 ${victim.names.ko}의 HP를 ${healed} 회복했다.`, `${actor.names.en} restores ${healed} HP to ${victim.names.en}.`, `${actor.names.ja}が${victim.names.ja}のHPを${healed}回復した。`)); }
            if ((skill.kind === 'cleanse' || skill.effects?.cleanse) && hasAilment(victim)) { receipt(actor, 'control', cleanseAilments(victim)); effective = true;
              log(state, t(`${victim.names.ko}의 해로운 기운이 정화되었다.`, `${victim.names.en}'s ailments are cleansed.`, `${victim.names.ja}の悪い気が浄化された。`)); }
            if (skill.kind === 'guard' || skill.kind === 'blessing' || skill.effects?.guard) {
              addWard(victim, actor, (skill.effects?.guard ?? skill.power) + Math.floor(actor.stats.intelligence * .3));
              victim.wardOwner = actor.userId ?? actor.companion?.ownerId; if (actor.companion) victim.wardUnit = actor.id; else delete victim.wardUnit;
              if (victim.wardOwner) circleWards.set(victim.id, { userId: victim.wardOwner, skill: skill.id, mp: skill.mp });
              log(state, t(`${actor.names.ko}이 ${victim.names.ko}을 보호했다.`, `${actor.names.en} wards ${victim.names.en}.`, `${actor.names.ja}が${victim.names.ja}を守った。`));
            }
            if (skill.effects?.might && actor.userId && (!victim.blessing || victim.blessing.power < skill.effects.might || victim.blessing.power === skill.effects.might && victim.blessing.turns < 2)) victim.blessing = { power: skill.effects.might, turns: 3, owner: actor.userId, generation: actor.generation!, skill: skill.id, mp: skill.mp, credited: false };
          }
        }
        const terrainChanged = target.tile ? fantasyCombatCreateFields(state, actor, target.tile, skill) : false;
        const warded = targets.some(victim => circleWards.get(victim.id)?.skill === skill.id) || circleWards.get(actor.id)?.skill === skill.id;
        if (skill.motion?.kind === 'dash' && landing && living(actor) && fantasyCombatTileKey(actor.tile!) !== fantasyCombatTileKey(landing)) {
          let safe = { ...actor.tile! }; const replayPath = [{...actor.tile!}];
          for (const tile of fantasyCombatDashTrail(actor.tile!, target.tile!, landing, true).slice(1)) {
            actor.tile = { ...tile }; replayPath.push({...tile}); applyFields(actor);
            const occupied = actors.some(other => other.id !== actor.id && living(other) && other.tile && fantasyCombatTileKey(other.tile) === fantasyCombatTileKey(tile));
            if (!occupied) safe = { ...tile };
            if (!living(actor)) { actor.tile = safe; break; }
          }
          actor.position = actor.tile!.x >= 4 ? 'front' : 'rear';
          if (!effective) credit(actor.userId ?? actor.companion?.ownerId, actor.companion ? actor.id : undefined);
          effective = true;
          log(state, t(`${actor.names.ko}이 적을 뚫고 뒤편으로 빠졌다.`, `${actor.names.en} dashes through to the far side.`, `${actor.names.ja}が敵を貫いて背後へ抜けた。`),undefined,{kind:'move',actor:actor.id,from:replayPath[0],to:{...actor.tile!},path:replayPath,skill:skill.id});
        }
        if (!advanceMoved && (effective || warded || terrainChanged)) actor.mp -= skill.mp;
        if (effective) { if(skill.kind!=='attack') log(state,t(`${actor.names.ko}: ${skill.names.ko}.`,`${actor.names.en}: ${skill.names.en}.`,`${actor.names.ja}：${skill.names.ja}。`),undefined,{kind:'attack',actor:actor.id,target:target.id,...(actor.tile?{from:{...actor.tile}}:{}),...(target.tile?{to:{...target.tile}}:{}),skill:skill.id}); circleReceipt(actor, skill); if (skill.kind !== 'attack') credit(actor.userId ?? actor.companion?.ownerId, actor.companion ? actor.id : undefined); }
        continue;
      }
      if (skill && skill.kind !== 'attack') {
        if (!target || !skillTarget(state, actor, target, skill) || !skillInRange(state, actor, target, skill)) continue;
        if (skill.kind === 'focus') {
          const bonus = Math.max(1, Math.min(15, skill.power));
          if (target.aim && target.aim.bonus >= bonus) continue;
          const owner = state.fighters.find(f => f.userId === (actor.userId ?? actor.companion!.ownerId))!;
          target.aim = { bonus, turns: 2, owner: owner.userId!, generation: owner.generation!, skill: skill.id, mp: skill.mp, ...(actor.companion ? { unit: actor.id } : {}) };
          log(state, t(`${actor.names.ko}이 ${target.names.ko}의 다음 조준을 도왔다.`, `${actor.names.en} steadies ${target.names.en}'s next aim.`, `${actor.names.ja}が${target.names.ja}の次の狙いを助けた。`));
        } else if (skill.kind === 'heal') {
          const healed = Math.min(target.stats.hp - target.hp, skill.power + Math.floor(actor.stats.intelligence * .8) + fantasyJobHealingBonus(actor.vocation?.job,actor.stats.hp));
          if (!healed) continue; target.hp += healed; aidReceipt(actor, target, 'healing', healed); credit(actor.userId ?? actor.companion?.ownerId, actor.companion ? actor.id : undefined);
          log(state, t(`${actor.names.ko}이 ${target.names.ko}의 HP를 ${healed} 회복했다.`, `${actor.names.en} restores ${healed} HP to ${target.names.en}.`, `${actor.names.ja}が${target.names.ja}のHPを${healed}回復した。`));
        } else { addWard(target, actor, skill.power + Math.floor(actor.stats.intelligence * .3)); if (skill.id.includes('shieldbearer')) { if (state.battlefield) state.battlefield.obstacles = state.battlefield.obstacles?.filter(entry => entry.owner !== actor.id) ?? []; const cover = fantasyCombatCoverTile(state, actor); if (cover && fantasyCombatPlaceObstacle(state, 'low-wall', cover, { owner: actor.id, expiresRound: state.round + 2 })) log(state, t('방패를 세워 임시 엄폐물을 만들었다.', 'Set up a shield as temporary cover.', '盾を立てて仮の遮蔽を作った。')); } target.wardOwner = actor.userId ?? actor.companion?.ownerId; if (actor.companion) target.wardUnit = actor.id; else delete target.wardUnit; log(state, t(`${actor.names.ko}이 ${target.names.ko}을 보호했다.`, `${actor.names.en} wards ${target.names.en}.`, `${actor.names.ja}が${target.names.ja}を守った。`)); }
        actor.mp -= skill.mp; log(state,t(`${actor.names.ko}: ${skill.names.ko}.`,`${actor.names.en}: ${skill.names.en}.`,`${actor.names.ja}：${skill.names.ja}。`),undefined,{kind:'attack',actor:actor.id,target:target.id,...(actor.tile?{from:{...actor.tile}}:{}),...(target.tile?{to:{...target.tile}}:{}),skill:skill.id}); continue;
      }
      const range = skill?.range ?? (skill?.magic ? 'magic' : actor.range);
      if (!target || !legalTarget(state, actor, target, range)) target = state.fighters.find(f => legalTarget(state, actor, f, range));
      if (!target) continue;
      if (order.type === 'attack' && actor.userId) attemptedAttacks.push(actor.userId);
      const previousHp = target.hp, hit = damage(actor, target, skill?.power ?? 0, !!skill?.magic || range === 'magic', 1, skill, range);
      if (skill && hit) actor.mp -= skill.mp;
      if (skill?.onHit && hit && living(target) && target.hp < previousHp && !target.guarding && random(state) < skill.onHit.chance) {
        inflict(target, skill.onHit.id, skill.onHit.power, actor);
        log(state, t(`${target.names.ko}에게 ${skill.onHit.id === 'burn' ? '화상' : skill.onHit.id === 'frost' ? '냉기' : '중독'}이 남았다.`, `${target.names.en} suffers ${skill.onHit.id}.`, `${target.names.ja}に${skill.onHit.id === 'burn' ? '火傷' : skill.onHit.id === 'frost' ? '冷気' : '毒'}が残った。`));
      }
    } else {
      if (resolveFantasyEnemyAction(state, actor, actors.filter(target => target.side === 'players' && living(target)), {
        random: () => random(state),
        damage: (target,power,magic,scale,skill,area) => damage(actor,target,power,magic,scale,skill,skill.range,area),
        log: (text,presentation) => log(state,text,undefined,presentation),
        move: path => { traverse(actor,path); },
        inflict: (target,id,power) => inflict(target,id,power),
        utility: (target,skill) => { applyUtility(actor,target,skill); },
        creditSilence: () => { conditionReceipt(fantasyCombatCondition(actor,'silence'), actor, 'control'); utilityCredit(fantasyCombatCondition(actor,'silence')); },
        creditRoot: () => { conditionReceipt(fantasyCombatCondition(actor,'root'), actor, 'control'); utilityCredit(fantasyCombatCondition(actor,'root')); },
      })) continue;
      const basePattern = fantasyCombatEnemy(actor.template!)!.pattern;
      const cost = basePattern === 'breath' && state.round % 3 === 0 ? 6 : ['arcane', 'frost', 'drain'].includes(basePattern) ? 4 : 0;
      const silenced = !!fantasyCombatCondition(actor, 'silence') && cost > 0 && actor.mp >= cost;
      if (silenced) { conditionReceipt(fantasyCombatCondition(actor, 'silence'), actor, 'control'); utilityCredit(fantasyCombatCondition(actor, 'silence')); }
      const pattern = cost > actor.mp || silenced ? 'strike' : basePattern, casting = cost > 0 && actor.mp >= cost && !silenced;
      if (pattern === 'guard' && state.round % 3 === 0) { actor.guarding = true; continue; }
      const candidates = actors.filter(f => f.side === 'players' && living(f)), fronts = candidates.filter(f => f.position === 'front');
      const magic = casting && (pattern === 'arcane' || pattern === 'drain');
      const attackRange = magic || pattern === 'frost' || pattern === 'breath' && state.round % 3 === 0 ? 'magic' : actor.range;
      const pool = magic ? candidates : fronts.length ? fronts : candidates;
      let target = pool[Math.floor(random(state) * pool.length)]; if (!target) continue;
      if (state.battlefield && actor.tile) {
        const reachable = candidates.filter(candidate => fantasyCombatWithinRange(state, actor, candidate, attackRange));
        if (!reachable.length) {
          if (fantasyCombatCondition(actor, 'root')) { conditionReceipt(fantasyCombatCondition(actor, 'root'), actor, 'control'); utilityCredit(fantasyCombatCondition(actor, 'root')); continue; }
          const paths = candidates.flatMap(candidate => candidate.tile ? [{ x: candidate.tile.x + 1, y: candidate.tile.y }, { x: candidate.tile.x - 1, y: candidate.tile.y }, { x: candidate.tile.x, y: candidate.tile.y + 1 }, { x: candidate.tile.x, y: candidate.tile.y - 1 }]
            .flatMap(tile => { const path = fantasyCombatPath(state, actor, tile, true); return path ? [path] : []; }) : []).sort((a, b) => {
              const cost = (path: FantasyCombatTile[]) => path.length + path.slice(1).reduce((sum, tile) => sum + (state.fields?.some(field => fantasyCombatTileKey(field.tile) === fantasyCombatTileKey(tile)) ? 8 : 0), 0);
              return cost(a) - cost(b);
            });
          const path = paths[0];
          if (path?.length && path.length > 1) { traverse(actor, path.slice(0, fantasyCombatMoveRange(actor) + 1)); log(state, t(`${actor.names.ko}이 다가온다.`, `${actor.names.en} advances.`, `${actor.names.ja}が近づいた。`)); }
          continue;
        }
        target = reachable[Math.floor(random(state) * reachable.length)];
        if (state.escort && state.round % 2 === 0) target = reachable.find(candidate => candidate.id === state.escort!.wagon.id) ?? target;
      }
      let hit = false;
      if (pattern === 'breath' && state.round % 3 === 0) {
        for (const victim of candidates.filter(victim => !state.battlefield || fantasyCombatWithinRange(state, actor, victim, 'magic'))) {
          const struck = damage(actor, victim, 0, true, .65, undefined, 'magic', true); hit ||= struck;
          if (struck && living(victim) && !victim.guarding) inflict(victim, 'burn', Math.max(1, Math.floor(actor.stats.attack * .04)));
        }
      } else if (damage(actor, target, 0, magic, 1, undefined, attackRange)) {
        hit = true;
        if (pattern === 'venom' && living(target) && !target.guarding) inflict(target, 'poison', Math.max(1, Math.floor(actor.stats.attack * .08)));
        if (pattern === 'frost' && living(target) && !target.guarding) inflict(target, 'frost', 1);
        if (pattern === 'drain') actor.hp = Math.min(actor.stats.hp, actor.hp + Math.max(1, Math.floor(actor.stats.attack * .2)));
      }
      if (casting && hit) actor.mp -= cost;
      if (hit && living(target) && (fantasyCombatEnemy(actor.template!)?.tier ?? 0) >= 5 && ['arcane','drain'].includes(pattern) && state.round % 3 === 0) { const id = pattern === 'drain' ? 'soul-binding' as const : state.round % 2 ? 'curse' as const : 'possession' as const; target.miracles ??= {}; target.miracles.afflictions = [...new Set([...(target.miracles.afflictions ?? []),id])]; log(state,t(`${target.names.ko}에게 강한 영혼의 속박이 남았다.`,`${target.names.en} suffers a profound soul affliction.`,`${target.names.ja}に強い魂の束縛が残った。`)); }
      if (pattern === 'regen' && living(actor)) actor.hp = Math.min(actor.stats.hp, actor.hp + Math.max(1, Math.floor(actor.stats.hp * .025)));
    }
  }
  if (state.escort?.order?.type === 'moveTo' && state.escort.wagon.hp > 0 && state.status === 'active' && fantasyEscortHasCommander(state)) {
    const path = fantasyCombatPath(state, state.escort.wagon, state.escort.order.tile);
    if (path && path.length - 1 <= fantasyCombatMoveRange(state.escort.wagon)) {
      traverse(state.escort.wagon, path); credit(state.escort.orderedBy);
      log(state, t('호송 수레가 길을 따라 움직였다.', 'The caravan wagon moves along the route.', '護送馬車が道に沿って進んだ。'));
    } else log(state, t('호송 수레의 길이 막혀 멈췄다.', 'The caravan wagon stops at a blocked route.', '護送馬車は道が塞がれて止まった。'));
  }
  for (const fighter of actors) {
    if (living(fighter)) for (const effect of fighter.effects) {
      if (effect.id !== 'frost') { const amount = applyFantasyMiracleDamage(state, fighter, effect.power, miracleLog); if (amount && effect.source) { const source = actors.find(f => f.id === effect.source); if (source?.side !== fighter.side) receipt(source, 'damage', amount); } if (amount) log(state, t(`${fighter.names.ko}: 지속 피해 ${amount}.`, `${fighter.names.en}: ${amount} ongoing damage.`, `${fighter.names.ja}：持続ダメージ${amount}。`)); }
      effect.turns--;
    }
    fighter.effects = fighter.effects.filter(effect => effect.turns > 0); fighter.guarding = false; fighter.ward = 0; delete fighter.wardOwner; delete fighter.wardUnit;
    for (const condition of fighter.conditions ?? []) {
      if (living(fighter) && condition.id === 'regen') { const healed = Math.min(fighter.stats.hp - fighter.hp, condition.power); fighter.hp += healed; if (healed) { conditionReceipt(condition, fighter, 'healing', healed); utilityCredit(condition); } }
      if (living(fighter) && condition.id === 'bleed') { const dealt = applyFantasyMiracleDamage(state, fighter, condition.power, miracleLog); if (dealt) { conditionReceipt(condition, fighter, 'damage', dealt); utilityCredit(condition); } log(state, t(`${fighter.names.ko}: 출혈 피해 ${dealt}.`, `${fighter.names.en}: ${dealt} bleeding damage.`, `${fighter.names.ja}：出血ダメージ${dealt}。`)); }
      condition.turns--;
    }
    if (fighter.conditions) fighter.conditions = fighter.conditions.filter(condition => condition.turns > 0);
    if (fighter.aim && --fighter.aim.turns <= 0) delete fighter.aim;
    if (fighter.blessing && --fighter.blessing.turns <= 0) delete fighter.blessing;
  }
  releaseInvalidFantasyCombatCarries(state);
  for (const unit of state.units ?? []) if (!state.fighters.some(f => f.userId === unit.companion!.ownerId && living(f))) unit.fled = true;
  for (const fighter of actors) if (fighter.miracles) { if ((fighter.miracles.anchor?.round ?? Infinity) <= state.round) delete fighter.miracles.anchor; if ((fighter.miracles.burden?.round ?? Infinity) <= state.round) delete fighter.miracles.burden; if ((fighter.miracles.safeTile?.round ?? Infinity) <= state.round) delete fighter.miracles.safeTile; }
  status(state); state.orders = {}; if (state.unitOrders) state.unitOrders = {}; if (state.escort) { delete state.escort.order; delete state.escort.orderedBy; } state.revision++; state.hour = at; state.deadline = at + FANTASY_COMBAT_ROUND_HOURS;
  if (state.status !== 'active') log(state, state.status === 'victory' ? t('전투에서 승리했다.', 'Victory.', '戦闘に勝利した。') : state.status === 'escaped' ? t('남은 일행이 전장을 벗어났다.', 'The remaining travelers have withdrawn.', '残る一行は戦場を離れた。') : t('전투가 끝났다. 구조와 사망 처리는 각자의 상황을 따른다.', 'Combat ends. Rescue and death follow each traveler’s circumstances.', '戦闘終了。救助と死亡は各自の状況に従う。'));
  else state.round++;
  advanceFantasyNavalTether(state);
  for (const enemy of state.fighters) if (enemy.enemyCharge && (!living(enemy) || state.status !== 'active' || !enemy.tile || fantasyCombatTileKey(enemy.tile) !== fantasyCombatTileKey(enemy.enemyCharge.origin))) delete enemy.enemyCharge;
  refreshFantasyMiracleAwakening(state, miracleLog);
  if (state.battlefield?.obstacles) state.battlefield.obstacles = state.battlefield.obstacles.filter(entry => !entry.expiresRound || entry.expiresRound > state.round);
  if (state.fields) state.fields = state.fields.filter(field => field.expiresRound > state.round);
  return { state, changed: true, spentItems, ...(usedSkills.length ? { usedSkills } : {}), ...(attemptedAttacks.length ? { attemptedAttacks } : {}) };
}
export function submitFantasyCombatOrder(state: FantasyCombatState, userId: string, revision: number, order: FantasyCombatOrder, hour: number, options: FantasyCombatOptions = {}): FantasyCombatResult {
  const fail = (error: FantasyCombatError): FantasyCombatResult => ({ state, changed: false, error, spentItems: [] });
  if (!validFantasyCombatState(state) || !identifier(userId) || !finite(hour) || hour < state.hour) return fail('invalid');
  if (state.revision !== revision) return fail('stale');
  if (state.status !== 'active') return fail('not-active');
  if (hour >= state.deadline) return { ...advanceFantasyCombat(state, hour, options), error: 'stale' };
  const error = fantasyCombatOrderError(state, userId, order, options); if (error) return fail(error);
  const next = structuredClone(state);
  if (order.type === 'escort') { next.escort!.order = structuredClone(order.order); next.escort!.orderedBy = userId; }
  else if (order.type === 'unit') next.unitOrders = { ...next.unitOrders, [order.unit]: structuredClone(order.order) };
  else next.orders = { ...next.orders, [userId]: structuredClone(order) };
  if (next.fighters.filter(f => f.side === 'players' && living(f)).every(f => orderOf(next, f.userId!))
    && (next.units ?? []).filter(unit => living(unit) && next.fighters.some(f => f.userId === unit.companion!.ownerId && living(f))).every(unit => unitOrderOf(next, unit.id)) && fantasyEscortReady(next)) return resolveRound(next, hour, options);
  return { state: next, changed: true, spentItems: [] };
}
export function advanceFantasyCombat(state: FantasyCombatState, hour: number, options: FantasyCombatOptions = {}): FantasyCombatResult {
  if (!validFantasyCombatState(state) || !finite(hour) || hour < state.hour) return { state, changed: false, error: 'invalid', spentItems: [] };
  let next = state, changed = false; const spentItems: FantasyCombatSpentItem[] = [], usedSkills: NonNullable<FantasyCombatResult['usedSkills']> = [], attemptedAttacks: string[] = [];
  for (let count = 0; count < 64 && next.status === 'active' && next.deadline <= hour; count++) {
    const result = resolveRound(next, next.deadline, options); next = result.state; changed = true; spentItems.push(...result.spentItems); usedSkills.push(...result.usedSkills ?? []); attemptedAttacks.push(...result.attemptedAttacks ?? []);
  }
  return { state: next, changed, spentItems, ...(usedSkills.length ? { usedSkills } : {}), ...(attemptedAttacks.length ? { attemptedAttacks } : {}) };
}
export function addFantasyCombatParticipant(state: FantasyCombatState, player: FantasyCombatPlayer, hour: number): FantasyCombatResult {
  const fail = (error: FantasyCombatError): FantasyCombatResult => ({ state, changed: false, error, spentItems: [] });
  if (!validFantasyCombatState(state) || !finite(hour) || hour < state.hour || !player) return fail('invalid');
  if (state.status !== 'active') return fail('not-active');
  if (hour >= state.deadline) return fail('stale');
  if (state.fighters.filter(f => f.side === 'players').length >= 6) return fail('capacity');
  if (state.fighters.some(f => f.id === player.id || f.userId === player.userId)) return fail('not-owner');
  const next = structuredClone(state), oldScaling = next.scaling;
  try {
    const standalone = createFantasyCombat({ id: 'joining-validation', location: next.location, source: next.escort ? 'joining-validation' : next.source, players: [player], enemies: [{ id: 'join-enemy', template: next.fighters.find(f => f.side === 'enemies')!.template! }], seed: 0, hour });
    if (!validFantasyCombatState(standalone)) return fail('invalid');
    addPlayer(next, player, next.fighters.filter(f => f.side === 'players').length);
    next.scaling = createFantasyPartyCombatSnapshot({ combatId: next.id, wave: 1, roster: next.fighters.filter(f => f.side === 'players').map(f => ({ playerId: f.userId!, kind: 'player', participation: 'engaged', hp: Math.max(1, f.hp) })) });
    for (const enemy of next.fighters.filter(f => f.side === 'enemies' && !fantasyNavalAuxiliary(next, f))) {
      const rank = fantasyCombatEnemy(enemy.template!)!.rank, previous = fantasyPartyCombatScale(oldScaling, rank), increased = fantasyPartyCombatScale(next.scaling, rank);
      const hp = Math.max(enemy.stats.hp, Math.ceil(enemy.stats.hp * increased.hpMultiplier / previous.hpMultiplier));
      if (enemy.hp > 0) enemy.hp = fantasyNavalRole(next, enemy) === 'body' ? Math.ceil(enemy.hp / enemy.stats.hp * hp) : enemy.hp + hp - enemy.stats.hp;
      enemy.stats.hp = hp;
      enemy.stats.attack = Math.max(enemy.stats.attack, Math.round(enemy.stats.attack * increased.damageMultiplier / previous.damageMultiplier));
      enemy.stats.intelligence = Math.max(enemy.stats.intelligence, Math.round(enemy.stats.intelligence * increased.damageMultiplier / previous.damageMultiplier));
    }
    rescaleFantasyNavalParts(next);
    next.orders = {}; if (next.unitOrders) next.unitOrders = {}; if (next.escort) { delete next.escort.order; delete next.escort.orderedBy; } next.revision++; next.hour = hour; next.deadline = hour + FANTASY_COMBAT_ROUND_HOURS;
    log(next, t(`${player.names.ko}이 전장에 합류했다. 모두 행동을 다시 골라야 한다.`, `${player.names.en} joins the battlefield. Everyone must choose again.`, `${player.names.ja}が戦場に合流した。全員が行動を選び直す。`));
    if (!validFantasyCombatState(next)) return fail('invalid');
    return { state: next, changed: true, spentItems: [] };
  } catch { return fail('invalid'); }
}
const ERROR_TEXT: Record<FantasyCombatError, FantasyCombatText> = {
  invalid: t('전투 요청을 확인할 수 없어요.', 'The combat request is invalid.', '戦闘の依頼を確認できません。'),
  stale: t('전투가 갱신되었어요. 현재 라운드에서 다시 골라 주세요.', 'Combat changed. Choose again in the current round.', '戦闘が更新されました。今のラウンドで選び直してください。'),
  'not-active': t('이 전투는 끝났어요.', 'This combat has ended.', 'この戦闘は終わりました。'),
  'not-owner': t('본인의 행동만 고를 수 있어요.', 'Choose only your own action.', '自分の行動だけ選べます。'),
  'already-ordered': t('이번 라운드의 행동을 이미 골랐어요.', 'You already chose this round’s action.', 'このラウンドの行動は選択済みです。'),
  down: t('쓰러졌거나 전장을 떠난 상태예요.', 'You are down or have left the field.', '倒れているか戦場を離れています。'),
  target: t('그 대상에게는 사용할 수 없어요.', 'That target is not valid.', 'その対象には使えません。'),
  range: t('사거리나 시야 밖이에요. 먼저 자리를 옮겨 주세요.', 'Out of range or sight. Change position first.', '射程か視界の外です。先に位置を変えてください。'),
  mana: t('MP가 부족해요.', 'Not enough MP.', 'MPが足りません。'),
  carrying: t('부축 중에는 한 명만 메고 일반 이동만 할 수 있어요. 먼저 내려놓아 주세요.', 'You can carry only one ally and use ordinary movement. Put them down first.', '運べる仲間は一人で、通常移動のみ可能です。先に降ろしてください。'),
  cooldown: t('재사용 대기 중이에요.', 'This action is on cooldown.', '再使用までお待ちください。'),
  silenced: t('침묵 상태에서는 MP를 쓰는 기술을 사용할 수 없어요.', 'Silence blocks skills that spend MP.', '沈黙中はMPを使う技を使えません。'),
  item: t('쓸 수 있는 소모품이 없어요.', 'That consumable is unavailable.', '使える消耗品がありません。'),
  unnecessary: t('지금은 효과가 없는 행동이에요.', 'That action has no effect right now.', '今は効果がない行動です。'),
  blocked: t('길이 막혔거나 한 번에 이동할 수 있는 거리 밖이에요.', 'The route is blocked or beyond this turn’s movement.', '道が塞がれているか、一度に移動できる距離の外です。'),
  capacity: t('참가자는 최대 6명이에요.', 'A battle allows up to six players.', '参加者は最大6人です。'),
};
export const fantasyCombatErrorText = (error: FantasyCombatError, locale: NpcLocale) => ERROR_TEXT[error][locale];
