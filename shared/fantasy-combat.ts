import type { NpcLocale } from './npc.ts';
import { fantasyCombatEnemy, createFantasyCombatEnemyStats, type FantasyCombatStats } from './fantasy-combat-catalog.ts';
import { createFantasyPartyCombatSnapshot, fantasyPartyCombatScale, type FantasyPartyCombatSnapshot } from './fantasy-party-balance.ts';
import { fantasyCombatActors, fantasyCombatCover, fantasyCombatDistance, fantasyCombatField, fantasyCombatMoveRange, fantasyCombatPath, fantasyCombatPlace, fantasyCombatTileKey, fantasyCombatValidField, fantasyCombatValidTile, fantasyCombatWithinRange, type FantasyCombatBattlefield, type FantasyCombatTile } from './fantasy-combat-tactics.ts';
import { createFantasyEscortBattle, fantasyEscortAtExit, fantasyEscortCanCommand, fantasyEscortHasCommander, fantasyEscortOrderError, fantasyEscortReady, isFantasyEscortBattleOrder, validFantasyEscortBattle, type FantasyEscortBattle, type FantasyEscortBattleInput, type FantasyEscortBattleOrder } from './fantasy-escort-battle.ts';

export type FantasyCombatText = Record<NpcLocale, string>;
export type FantasyCombatPosition = 'front' | 'rear';
export type FantasyCombatRange = 'melee' | 'ranged' | 'magic';
export interface FantasyCombatSkill { id: string; names: FantasyCombatText; kind: 'attack' | 'heal' | 'guard' | 'focus'; mp: number; power: number; magic?: boolean; range?: FantasyCombatRange;
  onHit?: { id: FantasyCombatEffect['id']; power: number; turns: 3; chance: number } }
export interface FantasyCombatPlayer {
  id: string; userId: string; names: FantasyCombatText; stats: FantasyCombatStats; hp: number; mp: number;
  position: FantasyCombatPosition; range: FantasyCombatRange; skills: FantasyCombatSkill[]; generation: number;
  companions?: FantasyCombatCompanionInput[];
}
export interface FantasyCombatCompanionInput { id: string; kind: 'troop' | 'syndicate' | 'summons'; names: FantasyCombatText; stats: FantasyCombatStats; hp: number; mp: number; range: FantasyCombatRange; skills: FantasyCombatSkill[] }
export interface FantasyCombatEffect { id: 'poison' | 'burn' | 'frost'; power: number; turns: number }
export interface FantasyCombatFighter {
  id: string; userId?: string; generation?: number; template?: string; variation?: number; side: 'players' | 'enemies'; names: FantasyCombatText;
  stats: FantasyCombatStats; hp: number; mp: number; position: FantasyCombatPosition; range: FantasyCombatRange; skills: FantasyCombatSkill[];
  effects: FantasyCombatEffect[]; fled: boolean; guarding: boolean; ward: number; wardOwner?: string; wardUnit?: string;
  contribution: { effectiveActions: number; activeRounds: number; manualActions: number };
  tile?: FantasyCombatTile;
  companion?: { ownerId: string; generation: number; member: string; kind: 'troop' | 'syndicate' | 'summons' };
  aim?: { bonus: number; turns: number; owner: string; generation: number; skill: string; mp: number; unit?: string };
}
export type FantasyCombatActorOrder = { type: 'attack'; target: string } | { type: 'guard' } | { type: 'escape' }
  | { type: 'move'; position: FantasyCombatPosition } | { type: 'skill'; skill: string; target: string } | { type: 'item'; item: string; target: string };
export type FantasyCombatUnitOrder = Exclude<FantasyCombatActorOrder, { type: 'item' | 'escape' }> | { type: 'moveTo'; tile: FantasyCombatTile };
export type FantasyCombatOrder = FantasyCombatActorOrder | { type: 'moveTo'; tile: FantasyCombatTile } | { type: 'unit'; unit: string; order: FantasyCombatUnitOrder } | { type: 'escort'; order: FantasyEscortBattleOrder };
export type FantasyCombatSource = string;
export interface FantasyCombatLog { id: number; round: number; text: FantasyCombatText; roll?: { sides: 20; value: number; target: number; success: boolean } }
export interface FantasyCombatState {
  version: 1; id: string; location: string; source: FantasyCombatSource; revision: number; round: number; seed: number; deadline: number;
  status: 'active' | 'victory' | 'defeat' | 'escaped'; fighters: FantasyCombatFighter[]; orders: Record<string, FantasyCombatOrder>;
  logs: FantasyCombatLog[]; scaling: FantasyPartyCombatSnapshot; startedAt: number; hour: number;
  battlefield?: FantasyCombatBattlefield; units?: FantasyCombatFighter[]; unitOrders?: Record<string, FantasyCombatUnitOrder>;
  escort?: FantasyEscortBattle;
}
export interface FantasyCombatSupply { count: number; names: FantasyCombatText; hp?: number; mp?: number; cleanse?: FantasyCombatEffect['id'][] }
export interface FantasyCombatOptions { supplies?: Record<string, Record<string, FantasyCombatSupply>> }
export interface FantasyCombatSpentItem { userId: string; item: string; count: 1 }
export type FantasyCombatError = 'invalid' | 'stale' | 'not-active' | 'not-owner' | 'already-ordered' | 'down' | 'target' | 'range' | 'mana' | 'item' | 'unnecessary' | 'blocked' | 'capacity';
export interface FantasyCombatResult { state: FantasyCombatState; changed: boolean; error?: FantasyCombatError; spentItems: FantasyCombatSpentItem[]; usedSkills?: { userId: string; skill: string; mp: number }[]; attemptedAttacks?: string[] }
export const FANTASY_COMBAT_ROUND_HOURS = .5;
const t = (ko: string, en: string, ja: string): FantasyCombatText => ({ ko, en, ja });
const living = (f: FantasyCombatFighter) => f.hp > 0 && !f.fled;
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
function log(state: FantasyCombatState, text: FantasyCombatText, roll?: FantasyCombatLog['roll']) {
  state.logs.push({ id: (state.logs.at(-1)?.id ?? 0) + 1, round: state.round, text, ...(roll ? { roll } : {}) });
  state.logs = state.logs.slice(-80);
}
function validSkill(value: unknown): value is FantasyCombatSkill {
  return object(value) && keys(value, ['id', 'names', 'kind', 'mp', 'power', 'magic', 'range', 'onHit']) && identifier(value.id) && localized(value.names)
    && ['attack', 'heal', 'guard', 'focus'].includes(String(value.kind)) && integer(value.mp) && integer(value.power)
    && (value.kind !== 'focus' || integer(value.power, 1, 15))
    && (value.magic === undefined || typeof value.magic === 'boolean') && (value.range === undefined || ['melee', 'ranged', 'magic'].includes(String(value.range)))
    && (value.onHit === undefined || value.kind === 'attack' && object(value.onHit) && Object.keys(value.onHit).length === 4
      && ['poison', 'burn', 'frost'].includes(String(value.onHit.id)) && integer(value.onHit.power, 1, 10) && value.onHit.turns === 3
      && finite(value.onHit.chance) && value.onHit.chance > 0 && value.onHit.chance <= 1);
}
export function isFantasyCombatOrder(value: unknown): value is FantasyCombatOrder {
  if (!object(value)) return false;
  switch (value.type) {
    case 'attack': return Object.keys(value).length === 2 && keys(value, ['type', 'target']) && identifier(value.target);
    case 'guard': case 'escape': return Object.keys(value).length === 1;
    case 'move': return Object.keys(value).length === 2 && keys(value, ['type', 'position']) && ['front', 'rear'].includes(String(value.position));
    case 'skill': return Object.keys(value).length === 3 && keys(value, ['type', 'skill', 'target']) && identifier(value.skill) && identifier(value.target);
    case 'item': return Object.keys(value).length === 3 && keys(value, ['type', 'item', 'target']) && identifier(value.item) && identifier(value.target);
    case 'moveTo': return Object.keys(value).length === 2 && keys(value, ['type', 'tile']) && fantasyCombatValidTile(fantasyCombatField(), value.tile);
    case 'unit': return Object.keys(value).length === 3 && keys(value, ['type', 'unit', 'order']) && identifier(value.unit) && object(value.order)
      && !['unit', 'item', 'escape', 'escort'].includes(String(value.order.type)) && isFantasyCombatOrder(value.order);
    case 'escort': return Object.keys(value).length === 2 && keys(value, ['type', 'order']) && isFantasyEscortBattleOrder(value.order);
    default: return false;
  }
}
export function validFantasyCombatState(value: unknown): value is FantasyCombatState {
  if (!object(value) || !keys(value, ['version', 'id', 'location', 'source', 'revision', 'round', 'seed', 'deadline', 'status', 'fighters', 'orders', 'logs', 'scaling', 'startedAt', 'hour', 'battlefield', 'units', 'unitOrders', 'escort'])
    || value.version !== 1 || !identifier(value.id) || !identifier(value.location) || !integer(value.revision) || !integer(value.round, 1, 10000)
    || !integer(value.seed, 0, 0xffffffff) || !finite(value.startedAt) || value.startedAt < 0 || !finite(value.hour) || value.hour < value.startedAt
    || !finite(value.deadline) || value.deadline < value.hour || !['active', 'victory', 'defeat', 'escaped'].includes(String(value.status))
    || !identifier(value.source)
    || !Array.isArray(value.fighters) || value.fighters.length < 2 || value.fighters.length > 9 || !object(value.orders) || !Array.isArray(value.logs) || value.logs.length > 80) return false;
  const fighters = value.fighters;
  if (value.battlefield !== undefined && !fantasyCombatValidField(value.battlefield)) return false;
  if ((value.units === undefined) !== (value.unitOrders === undefined) || value.units !== undefined && (!Array.isArray(value.units) || value.units.length > 12 || !object(value.unitOrders))) return false;
  const units = (value.units ?? []) as unknown[];
  const all = [...fighters, ...units];
  if (!all.every(f => object(f) && keys(f, ['id', 'userId', 'generation', 'template', 'variation', 'side', 'names', 'stats', 'hp', 'mp', 'position', 'range', 'skills', 'effects', 'fled', 'guarding', 'ward', 'wardOwner', 'wardUnit', 'contribution', 'tile', 'companion', 'aim'])
    && identifier(f.id) && localized(f.names) && ['players', 'enemies'].includes(String(f.side)) && validStats(f.stats) && integer(f.hp, 0, f.stats.hp) && integer(f.mp, 0, f.stats.mp)
    && ['front', 'rear'].includes(String(f.position)) && ['melee', 'ranged', 'magic'].includes(String(f.range)) && Array.isArray(f.skills) && f.skills.length <= 100 && f.skills.every(validSkill)
    && new Set(f.skills.map(s => s.id)).size === f.skills.length && typeof f.fled === 'boolean' && typeof f.guarding === 'boolean' && integer(f.ward)
    && (f.wardOwner === undefined || identifier(f.wardOwner)) && (f.wardUnit === undefined || identifier(f.wardUnit)) && Array.isArray(f.effects) && f.effects.length <= 3
    && (f.aim === undefined || object(f.aim) && keys(f.aim, ['bonus', 'turns', 'owner', 'generation', 'skill', 'mp', 'unit']) && integer(f.aim.bonus, 1, 15) && integer(f.aim.turns, 1, 2) && identifier(f.aim.owner)
      && integer(f.aim.generation, 1) && identifier(f.aim.skill) && integer(f.aim.mp) && (f.aim.unit === undefined || identifier(f.aim.unit)))
    && f.effects.every(e => object(e) && Object.keys(e).length === 3 && ['poison', 'burn', 'frost'].includes(String(e.id)) && integer(e.power, 1, 10000) && integer(e.turns, 1, 10))
    && new Set(f.effects.map(e => e.id)).size === f.effects.length && object(f.contribution) && Object.keys(f.contribution).length === 3
    && ['effectiveActions', 'activeRounds', 'manualActions'].every(key => integer((f.contribution as Record<string, unknown>)[key], 0, 1_000_000))
    && (value.battlefield === undefined ? f.tile === undefined : fantasyCombatValidTile(value.battlefield as FantasyCombatBattlefield, f.tile))
    && (f.companion !== undefined ? units.includes(f) && f.side === 'players' && f.userId === undefined && f.generation === undefined && f.template === undefined && f.variation === undefined
      && object(f.companion) && Object.keys(f.companion).length === 4 && identifier(f.companion.ownerId) && integer(f.companion.generation, 1) && identifier(f.companion.member) && ['troop', 'syndicate', 'summons'].includes(String(f.companion.kind))
      : f.side === 'players' ? !units.includes(f) && identifier(f.userId) && integer(f.generation, 1) && f.template === undefined && f.variation === undefined
      : f.userId === undefined && f.generation === undefined && identifier(f.template) && !!fantasyCombatEnemy(f.template)
        && (!fantasyCombatEnemy(f.template)!.provocationOnly || String(value.source).startsWith('apex:')) && finite(f.variation) && f.variation >= .8 && f.variation <= 1.2))) return false;
  const players = fighters.filter(f => f.side === 'players') as unknown as FantasyCombatFighter[];
  if (players.length < 1 || players.length > 6 || fighters.length - players.length < 1 || fighters.length - players.length > 3
    || new Set(all.map(f => (f as FantasyCombatFighter).id)).size !== all.length || new Set(players.map(p => p.userId)).size !== players.length) return false;
  if (!(units as FantasyCombatFighter[]).every(unit => players.some(p => p.userId === unit.companion!.ownerId && p.generation === unit.companion!.generation)
    && (units as FantasyCombatFighter[]).filter(other => other.companion!.ownerId === unit.companion!.ownerId).length <= 2)) return false;
  if (new Set((units as FantasyCombatFighter[]).map(unit => `${unit.companion!.ownerId}:${unit.companion!.member}`)).size !== units.length) return false;
  if ((all as FantasyCombatFighter[]).some(actor => {
    const aim = actor.aim; if (!aim) return false;
    const owner = players.find(p => p.userId === aim.owner && p.generation === aim.generation), source = aim.unit ? (units as FantasyCombatFighter[]).find(unit => unit.id === aim.unit && unit.companion!.ownerId === aim.owner) : owner;
    return !owner || !source?.skills.some(skill => skill.id === aim.skill && skill.kind === 'focus' && skill.mp === aim.mp && Math.min(15, skill.power) >= aim.bonus);
  })) return false;
  if (value.battlefield !== undefined) {
    const field = value.battlefield as FantasyCombatBattlefield, occupied = (all as FantasyCombatFighter[]).filter(living).map(f => fantasyCombatTileKey(f.tile!));
    if (new Set(occupied).size !== occupied.length || (all as FantasyCombatFighter[]).some(f => field.blocked.some(tile => fantasyCombatTileKey(tile) === fantasyCombatTileKey(f.tile!)))) return false;
  }
  try { fantasyPartyCombatScale(value.scaling as unknown as FantasyPartyCombatSnapshot, 'normal'); } catch { return false; }
  const scale = value.scaling as unknown as FantasyPartyCombatSnapshot;
  if (scale.combatId !== value.id || scale.participantIds.length !== players.length || !players.every(p => scale.participantIds.includes(p.userId!))) return false;
  if (!Object.entries(value.orders).every(([user, order]) => players.some(p => p.userId === user && living(p)) && isFantasyCombatOrder(order) && !['unit', 'escort'].includes(order.type))) return false;
  if (value.unitOrders !== undefined && !Object.entries(value.unitOrders as Record<string, unknown>).every(([id, order]) => (units as FantasyCombatFighter[]).some(unit => unit.id === id && living(unit))
    && isFantasyCombatOrder(order) && !['unit', 'item', 'escape', 'escort'].includes(order.type))) return false;
  let lastLog = 0;
  if (!value.logs.every(entry => {
    if (!object(entry) || !keys(entry, ['id', 'round', 'text', 'roll']) || !integer(entry.id, 1) || entry.id <= lastLog || !integer(entry.round, 1, Number(value.round)) || !localized(entry.text)) return false;
    lastLog = entry.id;
    return entry.roll === undefined || object(entry.roll) && Object.keys(entry.roll).length === 4 && entry.roll.sides === 20 && integer(entry.roll.value, 1, 20) && integer(entry.roll.target, 2, 20) && typeof entry.roll.success === 'boolean';
  })) return false;
  const alivePlayers = players.some(living), aliveEnemies = (fighters as unknown as FantasyCombatFighter[]).some(f => f.side === 'enemies' && living(f));
  const battle = value as unknown as FantasyCombatState;
  if (!validFantasyEscortBattle(battle)) return false;
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
  fantasyCombatPlace(state, fighter, { x: player.position === 'front' ? 4 : 1, y: index + 1 }); state.fighters.push(fighter);
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
export function createFantasyCombat(input: { id: string; location: string; source: FantasyCombatSource; players: FantasyCombatPlayer[]; enemies: { id: string; template: string; position?: FantasyCombatPosition }[]; seed: number; hour: number; tactical?: boolean; escort?: FantasyEscortBattleInput }): FantasyCombatState {
  if (!input || !identifier(input.id) || !identifier(input.location) || !finite(input.hour) || input.hour < 0 || !integer(input.seed, 0, 0xffffffff)
    || !Array.isArray(input.players) || input.players.length < 1 || input.players.length > 6 || !Array.isArray(input.enemies) || input.enemies.length < 1 || input.enemies.length > 3) throw new TypeError('Invalid combat creation');
  const scaling = createFantasyPartyCombatSnapshot({ combatId: input.id, wave: 1, roster: input.players.map(p => ({ playerId: p.userId, kind: 'player', participation: 'engaged', hp: p.hp })) });
  const state: FantasyCombatState = { version: 1, id: input.id, location: input.location, source: structuredClone(input.source), revision: 0, round: 1, seed: input.seed, deadline: input.hour + FANTASY_COMBAT_ROUND_HOURS,
    status: 'active', fighters: [], orders: {}, logs: [], scaling: structuredClone(scaling), startedAt: input.hour, hour: input.hour };
  if (input.tactical) state.battlefield = fantasyCombatField();
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
    const opponent: FantasyCombatFighter = { id: enemy.id, template: template.id, variation: variation.variation, side: 'enemies', names: { ...template.names }, stats, hp: stats.hp, mp: stats.mp,
      position: enemy.position ?? 'front', range: template.pattern === 'arcane' || template.pattern === 'drain' ? 'magic' : 'melee', skills: [], effects: [], fled: false, guarding: false, ward: 0,
      contribution: { effectiveActions: 0, activeRounds: 0, manualActions: 0 } };
    fantasyCombatPlace(state, opponent, { x: opponent.position === 'front' ? 5 : 8, y: Math.min(6, input.enemies.indexOf(enemy) + 1) }); state.fighters.push(opponent);
  }
  if (input.escort) state.escort = createFantasyEscortBattle(state, input.escort);
  log(state, t('전투가 시작되었다. 미입력 시 마감에 방어한다.', 'Combat begins. Missing orders become guards at the deadline.', '戦闘開始。締切まで未入力なら防御する。'));
  if (!validFantasyCombatState(state)) throw new TypeError('Invalid combat state');
  return state;
}
function legalTarget(state: FantasyCombatState, actor: FantasyCombatFighter, target: FantasyCombatFighter, range: FantasyCombatRange): boolean {
  if (actor.side === target.side || !living(target)) return false;
  if (state.battlefield) return fantasyCombatWithinRange(state, actor, target, range);
  if (range !== 'melee') return true;
  return actor.position === 'front' && (target.position === 'front' || !state.fighters.some(f => f.side === target.side && f.position === 'front' && living(f)));
}
function supply(options: FantasyCombatOptions, user: string, item: string): FantasyCombatSupply | undefined {
  const items = options.supplies && Object.hasOwn(options.supplies, user) ? options.supplies[user] : undefined;
  const value = items && Object.hasOwn(items, item) ? items[item] : undefined;
  return value && integer(value.count, 1) && localized(value.names) && (value.hp === undefined || integer(value.hp, 0)) && (value.mp === undefined || integer(value.mp, 0))
    && (value.cleanse === undefined || Array.isArray(value.cleanse) && value.cleanse.length <= 3 && value.cleanse.every(id => ['poison', 'burn', 'frost'].includes(id)))
    && (Number(value.hp) > 0 || Number(value.mp) > 0 || value.cleanse?.length) ? value : undefined;
}
export function fantasyCombatOrderError(state: FantasyCombatState, userId: string, order: FantasyCombatOrder, options: FantasyCombatOptions = {}): FantasyCombatError | undefined {
  if (!isFantasyCombatOrder(order)) return 'invalid';
  if (state.status !== 'active') return 'not-active';
  if (order.type === 'escort') return fantasyEscortOrderError(state, userId, order.order);
  let actor = state.fighters.find(f => f.userId === userId && f.side === 'players');
  if (!actor) return 'not-owner'; if (!living(actor)) return 'down';
  if (order.type === 'unit') {
    const unitId = order.unit, unit = state.units?.find(unit => unit.id === unitId);
    if (!unit || unit.companion?.ownerId !== userId || unit.companion.generation !== actor.generation) return 'not-owner';
    if (!living(unit)) return 'down'; if (unitOrderOf(state, unit.id)) return 'already-ordered';
    actor = unit; order = order.order;
  } else if (orderOf(state, userId)) return 'already-ordered';
  if (order.type === 'guard' || order.type === 'escape') return undefined;
  if (order.type === 'move') return order.position === actor.position ? 'unnecessary' : undefined;
  if (order.type === 'moveTo') {
    if (!state.battlefield || !actor.tile) return 'invalid';
    if (fantasyCombatTileKey(actor.tile) === fantasyCombatTileKey(order.tile)) return 'unnecessary';
    const path = fantasyCombatPath(state, actor, order.tile);
    return path && path.length - 1 <= fantasyCombatMoveRange(actor) ? undefined : 'blocked';
  }
  const target = fantasyCombatActors(state).find(f => f.id === order.target);
  if (!target || !living(target)) return 'target';
  if (order.type === 'attack') return legalTarget(state, actor, target, actor.range) ? undefined : actor.side === target.side ? 'target' : 'range';
  if (order.type === 'item') {
    const item = supply(options, userId, order.item);
    if (!item) return 'item'; if (actor.side !== target.side) return 'target';
    if (state.battlefield && !fantasyCombatWithinRange(state, actor, target, 'ranged')) return 'range';
    return item.hp && target.hp < target.stats.hp || item.mp && target.mp < target.stats.mp || item.cleanse?.some(id => target.effects.some(effect => effect.id === id)) ? undefined : 'unnecessary';
  }
  const skill = actor.skills.find(skill => skill.id === order.skill);
  if (!skill) return 'invalid'; if (actor.mp < skill.mp) return 'mana';
  if (skill.kind === 'attack') return legalTarget(state, actor, target, skill.range ?? (skill.magic ? 'magic' : actor.range)) ? undefined : actor.side === target.side ? 'target' : 'range';
  if (actor.side !== target.side) return 'target';
  if (state.battlefield && !fantasyCombatWithinRange(state, actor, target, 'magic')) return 'range';
  if (skill.kind === 'heal' && target.hp >= target.stats.hp) return 'unnecessary';
  if (skill.kind === 'focus' && target.id === state.escort?.wagon.id) return 'unnecessary';
  if (skill.kind === 'focus' && target.aim && target.aim.bonus >= Math.min(15, skill.power)) return 'unnecessary';
  return undefined;
}
function combatTelegraph(fighter: FantasyCombatFighter, round: number, locale: NpcLocale): string {
  const pattern = fighter.template ? fantasyCombatEnemy(fighter.template)?.pattern : undefined;
  if (!pattern || !living(fighter)) return '';
  const reserve = pattern === 'breath' ? 6 : ['arcane', 'frost', 'drain'].includes(pattern) ? 4 : 0;
  if (reserve && fighter.mp < reserve) return t('마력이 약해져 직접 공격할 태세다.', 'Its mana is low; it prepares a direct attack.', 'マナが弱まり、直接攻撃の構えを取る。')[locale];
  if (pattern === 'breath') return (round % 3 === 0 ? t('숨결을 내뿜으려 한다. 방어가 유효하다.', 'A breath attack is imminent. Guarding helps.', '吐息を放つ構え。防御が有効。') : round % 3 === 2 ? t('크게 숨을 들이마신다.', 'It draws a deep breath.', '大きく息を吸い込む。') : t('전열을 노린다.', 'It watches the front line.', '前衛を狙う。'))[locale];
  if (pattern === 'arcane' || pattern === 'drain') return t('마나를 모아 방호가 약한 틈을 노린다.', 'It gathers mana to strike a weak ward.', 'マナを集め、守りの薄い隙を狙う。')[locale];
  if (pattern === 'venom') return t('독이 맺힌 공격을 준비한다.', 'It readies a venomous strike.', '毒を帯びた一撃を構える。')[locale];
  if (pattern === 'frost') return t('서리가 일어 움직임을 늦추려 한다.', 'Frost gathers to slow its prey.', '霜が集まり、動きを鈍らせようとする。')[locale];
  if (pattern === 'guard' && round % 2 === 0) return t('수비를 굳히려 한다.', 'It is preparing to guard.', '守りを固める構え。')[locale];
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
function status(state: FantasyCombatState) {
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
function addEffect(target: FantasyCombatFighter, id: FantasyCombatEffect['id'], power: number) {
  const effect = target.effects.find(effect => effect.id === id);
  if (effect) { effect.power = Math.max(power, effect.power); effect.turns = 3; } else target.effects.push({ id, power, turns: 3 });
}
function resolveRound(input: FantasyCombatState, at: number, options: FantasyCombatOptions): FantasyCombatResult {
  const state = structuredClone(input), spentItems: FantasyCombatSpentItem[] = [], usedSkills: NonNullable<FantasyCombatResult['usedSkills']> = [], attemptedAttacks: string[] = [];
  const actors = fantasyCombatActors(state);
  for (const unit of state.units ?? []) if (!state.fighters.some(f => f.userId === unit.companion!.ownerId && living(f))) unit.fled = true;
  const activePlayers = actors.filter(f => f.side === 'players' && f.id !== state.escort?.wagon.id && living(f));
  for (const fighter of actors) { fighter.guarding = false; fighter.ward = 0; delete fighter.wardOwner; delete fighter.wardUnit; }
  for (const fighter of state.fighters.filter(f => f.side === 'enemies' && living(f))) {
    if (fantasyCombatEnemy(fighter.template!)?.pattern === 'guard' && state.round % 2 === 0) {
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
  const damage = (attacker: FantasyCombatFighter, target: FantasyCombatFighter, power: number, magic: boolean, coefficient = 1): boolean => {
    const chilled = attacker.effects.some(e => e.id === 'frost'), covered = fantasyCombatCover(state, target), aim = attacker.aim;
    const accuracy = Math.max(10, Math.min(100, attacker.stats.accuracy + (aim?.bonus ?? 0)) - (chilled ? 8 : 0) - (covered ? magic ? 4 : 10 : 0));
    const threshold = Math.max(3, Math.min(19, Math.round(20 - (accuracy + attacker.stats.agility * .25 - target.stats.agility * .35) / 5)));
    const roll = Math.floor(random(state) * 20) + 1, success = roll === 20 || roll !== 1 && roll >= threshold;
    if (aim) {
      delete attacker.aim;
      const owner = state.fighters.find(f => f.userId === aim.owner && f.generation === aim.generation);
      if (owner && living(owner)) { credit(aim.owner, aim.unit, true); usedSkills.push({ userId: aim.owner, skill: aim.skill, mp: aim.mp }); }
    }
    if (!success) { log(state, t(`${attacker.names.ko}의 공격을 ${target.names.ko}이 피했다.`, `${target.names.en} evades ${attacker.names.en}.`, `${target.names.ja}は${attacker.names.ja}の攻撃を避けた。`), { sides: 20, value: roll, target: threshold, success }); return false; }
    const raw = Math.max(1, (magic ? attacker.stats.intelligence * 1.3 + attacker.stats.attack * .4 + power - target.stats.magicResist * .65 : attacker.stats.attack + power - target.stats.defense * .7) * coefficient * fantasyCombatRageMultiplier(attacker, state.round));
    const before = Math.max(1, Math.round(raw * (roll === 20 ? 1.4 : 1) * (covered ? magic ? .9 : .75 : 1))), guarded = Math.max(1, Math.round(before * (target.guarding ? .35 : 1)));
    const absorbed = Math.min(target.ward, guarded); target.ward -= absorbed;
    const amount = Math.max(0, guarded - absorbed), dealt = Math.min(target.hp, amount); target.hp -= dealt;
    if (dealt) credit(attacker.userId ?? attacker.companion?.ownerId, attacker.companion ? attacker.id : undefined); if (target.guarding && before > guarded) credit(target.userId ?? target.companion?.ownerId ?? (target.id === state.escort?.wagon.id ? state.escort?.orderedBy : undefined), target.companion ? target.id : undefined); if (absorbed) credit(target.wardOwner, target.wardUnit);
    log(state, t(`${attacker.names.ko} → ${target.names.ko}: ${dealt} 피해.`, `${attacker.names.en} → ${target.names.en}: ${dealt} damage.`, `${attacker.names.ja} → ${target.names.ja}：${dealt}ダメージ。`), { sides: 20, value: roll, target: threshold, success });
    if (target.hp === 0) log(state, t(`${target.names.ko}이 쓰러졌다.`, `${target.names.en} falls.`, `${target.names.ja}が倒れた。`));
    return true;
  };
  if (state.escort) state.escort.wagon.guarding = state.escort.order?.type !== 'moveTo';
  const ordered = [...actors].filter(f => f.id !== state.escort?.wagon.id && living(f)).sort((a, b) => {
    const priority = (f: FantasyCombatFighter) => f.side === 'players' && actorOrder(state, f)?.type === 'skill' && ['guard', 'focus'].includes(f.skills.find(s => s.id === (actorOrder(state, f) as { skill?: string }).skill)?.kind ?? '') ? 100000 : 0;
    return priority(b) - priority(a) || (b.stats.agility - (b.effects.some(e => e.id === 'frost') ? 3 : 0)) - (a.stats.agility - (a.effects.some(e => e.id === 'frost') ? 3 : 0)) || a.id.localeCompare(b.id);
  });
  for (const actor of ordered) {
    status(state); if (state.status !== 'active') break; if (!living(actor)) continue;
    if (actor.side === 'players') {
      if (actor.companion && !state.fighters.some(f => f.userId === actor.companion!.ownerId && living(f))) { actor.fled = true; continue; }
      const order = actorOrder(state, actor) ?? { type: 'guard' as const };
      if (order.type === 'guard') continue;
      if (order.type === 'unit' || order.type === 'escort') continue;
      if (order.type === 'move' || order.type === 'moveTo') {
        if (state.battlefield && actor.tile) {
          const destination = order.type === 'moveTo' ? order.tile : { x: order.position === 'front' ? 4 : 1, y: actor.tile.y };
          const path = fantasyCombatPath(state, actor, destination);
          if (!path || path.length - 1 > fantasyCombatMoveRange(actor)) { log(state, t(`${actor.names.ko}: 길이 막혀 이동하지 못했다.`, `${actor.names.en}: the route is blocked.`, `${actor.names.ja}：道が塞がれ移動できなかった。`)); continue; }
          actor.tile = { ...destination }; actor.position = destination.x >= 4 ? 'front' : 'rear';
        } else if (order.type === 'move') actor.position = order.position;
        log(state, t(`${actor.names.ko}이 자리를 옮겼다.`, `${actor.names.en} changes position.`, `${actor.names.ja}が位置を変えた。`)); continue;
      }
      if (order.type === 'escape') {
        const quickest = Math.max(...state.fighters.filter(f => f.side === 'enemies' && living(f)).map(f => f.stats.agility));
        const target = Math.max(4, Math.min(18, 11 + Math.round((quickest - actor.stats.agility) / 5))), value = Math.floor(random(state) * 20) + 1;
        const escaped = value === 20 || value !== 1 && value >= target;
        if (escaped) { actor.fled = true; for (const unit of state.units ?? []) if (unit.companion?.ownerId === actor.userId) unit.fled = true; credit(actor.userId); }
        log(state, t(`${actor.names.ko}: 도주 ${escaped ? '성공' : '실패'}.`, `${actor.names.en}: escape ${escaped ? 'succeeded' : 'failed'}.`, `${actor.names.ja}：逃走${escaped ? '成功' : '失敗'}。`), { sides: 20, value, target, success: escaped }); continue;
      }
      let target = actors.find(f => f.id === order.target);
      if (order.type === 'item') {
        const item = supply(options, actor.userId!, order.item);
        if (!item || !target || !living(target) || target.side !== actor.side || state.battlefield && !fantasyCombatWithinRange(state, actor, target, 'ranged')) continue;
        const effects = target.effects;
        const hp = Math.min(target.stats.hp - target.hp, item.hp ?? 0), mp = Math.min(target.stats.mp - target.mp, item.mp ?? 0), cleanse = !!item.cleanse?.some(id => effects.some(effect => effect.id === id));
        if (!hp && !mp && !cleanse) { log(state, t(`${actor.names.ko}: 필요 없는 소모품 사용을 멈췄다.`, `${actor.names.en}: kept an unnecessary consumable.`, `${actor.names.ja}：不要な消耗品は使わなかった。`)); continue; }
        target.hp += hp; target.mp += mp; if (cleanse) target.effects = target.effects.filter(effect => !item.cleanse!.includes(effect.id));
        spentItems.push({ userId: actor.userId!, item: order.item, count: 1 }); credit(actor.userId);
        log(state, t(`${actor.names.ko}이 ${target.names.ko}에게 ${item.names.ko}을 사용했다.`, `${actor.names.en} uses ${item.names.en} on ${target.names.en}.`, `${actor.names.ja}が${target.names.ja}に${item.names.ja}を使った。`)); continue;
      }
      const skill = order.type === 'skill' ? actor.skills.find(s => s.id === order.skill) : undefined;
      if (order.type === 'skill' && (!skill || actor.mp < skill.mp)) continue;
      if (skill && skill.kind !== 'attack') {
        if (!target || !living(target) || target.side !== actor.side || state.battlefield && !fantasyCombatWithinRange(state, actor, target, 'magic')) continue;
        if (skill.kind === 'focus') {
          const bonus = Math.max(1, Math.min(15, skill.power));
          if (target.aim && target.aim.bonus >= bonus) continue;
          const owner = state.fighters.find(f => f.userId === (actor.userId ?? actor.companion!.ownerId))!;
          target.aim = { bonus, turns: 2, owner: owner.userId!, generation: owner.generation!, skill: skill.id, mp: skill.mp, ...(actor.companion ? { unit: actor.id } : {}) };
          log(state, t(`${actor.names.ko}이 ${target.names.ko}의 다음 조준을 도왔다.`, `${actor.names.en} steadies ${target.names.en}'s next aim.`, `${actor.names.ja}が${target.names.ja}の次の狙いを助けた。`));
        } else if (skill.kind === 'heal') {
          const healed = Math.min(target.stats.hp - target.hp, skill.power + Math.floor(actor.stats.intelligence * .8));
          if (!healed) continue; target.hp += healed; credit(actor.userId ?? actor.companion?.ownerId, actor.companion ? actor.id : undefined);
          log(state, t(`${actor.names.ko}이 ${target.names.ko}의 HP를 ${healed} 회복했다.`, `${actor.names.en} restores ${healed} HP to ${target.names.en}.`, `${actor.names.ja}が${target.names.ja}のHPを${healed}回復した。`));
        } else { target.ward += skill.power + Math.floor(actor.stats.intelligence * .3); target.wardOwner = actor.userId ?? actor.companion?.ownerId; if (actor.companion) target.wardUnit = actor.id; else delete target.wardUnit; log(state, t(`${actor.names.ko}이 ${target.names.ko}을 보호했다.`, `${actor.names.en} wards ${target.names.en}.`, `${actor.names.ja}が${target.names.ja}を守った。`)); }
        actor.mp -= skill.mp; continue;
      }
      const range = skill?.range ?? (skill?.magic ? 'magic' : actor.range);
      if (!target || !legalTarget(state, actor, target, range)) target = state.fighters.find(f => legalTarget(state, actor, f, range));
      if (!target) continue;
      if (order.type === 'attack' && actor.userId) attemptedAttacks.push(actor.userId);
      const previousHp = target.hp, hit = damage(actor, target, skill?.power ?? 0, !!skill?.magic || range === 'magic');
      if (skill && hit) actor.mp -= skill.mp;
      if (skill?.onHit && hit && living(target) && target.hp < previousHp && !target.guarding && random(state) < skill.onHit.chance) {
        addEffect(target, skill.onHit.id, skill.onHit.power);
        log(state, t(`${target.names.ko}에게 ${skill.onHit.id === 'burn' ? '화상' : skill.onHit.id === 'frost' ? '냉기' : '중독'}이 남았다.`, `${target.names.en} suffers ${skill.onHit.id}.`, `${target.names.ja}に${skill.onHit.id === 'burn' ? '火傷' : skill.onHit.id === 'frost' ? '冷気' : '毒'}が残った。`));
      }
    } else {
      const basePattern = fantasyCombatEnemy(actor.template!)!.pattern;
      const cost = basePattern === 'breath' && state.round % 3 === 0 ? 6 : ['arcane', 'frost', 'drain'].includes(basePattern) ? 4 : 0;
      const pattern = cost > actor.mp ? 'strike' : basePattern, casting = cost > 0 && actor.mp >= cost;
      if (pattern === 'guard' && state.round % 2 === 0) { actor.guarding = true; continue; }
      const candidates = actors.filter(f => f.side === 'players' && living(f)), fronts = candidates.filter(f => f.position === 'front');
      const magic = casting && (pattern === 'arcane' || pattern === 'drain');
      const pool = magic ? candidates : fronts.length ? fronts : candidates;
      let target = pool[Math.floor(random(state) * pool.length)]; if (!target) continue;
      if (state.battlefield && actor.tile) {
        const range = magic || pattern === 'frost' || pattern === 'breath' && state.round % 3 === 0 ? 'magic' : 'melee';
        const reachable = candidates.filter(candidate => fantasyCombatWithinRange(state, actor, candidate, range));
        if (!reachable.length) {
          const paths = candidates.flatMap(candidate => candidate.tile ? [{ x: candidate.tile.x + 1, y: candidate.tile.y }, { x: candidate.tile.x - 1, y: candidate.tile.y }, { x: candidate.tile.x, y: candidate.tile.y + 1 }, { x: candidate.tile.x, y: candidate.tile.y - 1 }]
            .flatMap(tile => { const path = fantasyCombatPath(state, actor, tile); return path ? [path] : []; }) : []).sort((a, b) => a.length - b.length);
          const path = paths[0];
          if (path?.length && path.length > 1) { actor.tile = path[Math.min(path.length - 1, fantasyCombatMoveRange(actor))]; log(state, t(`${actor.names.ko}이 다가온다.`, `${actor.names.en} advances.`, `${actor.names.ja}が近づいた。`)); }
          continue;
        }
        target = reachable[Math.floor(random(state) * reachable.length)];
        if (state.escort && state.round % 2 === 0) target = reachable.find(candidate => candidate.id === state.escort!.wagon.id) ?? target;
      }
      let hit = false;
      if (pattern === 'breath' && state.round % 3 === 0) {
        for (const victim of candidates.filter(victim => !state.battlefield || fantasyCombatWithinRange(state, actor, victim, 'magic'))) {
          const struck = damage(actor, victim, 0, true, .65); hit ||= struck;
          if (struck && living(victim) && !victim.guarding) addEffect(victim, 'burn', Math.max(1, Math.floor(actor.stats.attack * .04)));
        }
      } else if (damage(actor, target, 0, magic)) {
        hit = true;
        if (pattern === 'venom' && living(target) && !target.guarding) addEffect(target, 'poison', Math.max(1, Math.floor(actor.stats.attack * .08)));
        if (pattern === 'frost' && living(target) && !target.guarding) addEffect(target, 'frost', 1);
        if (pattern === 'drain') actor.hp = Math.min(actor.stats.hp, actor.hp + Math.max(1, Math.floor(actor.stats.attack * .2)));
      }
      if (casting && hit) actor.mp -= cost;
      if (pattern === 'regen' && living(actor)) actor.hp = Math.min(actor.stats.hp, actor.hp + Math.max(1, Math.floor(actor.stats.hp * .025)));
    }
  }
  if (state.escort?.order?.type === 'moveTo' && state.escort.wagon.hp > 0 && state.status === 'active' && fantasyEscortHasCommander(state)) {
    const path = fantasyCombatPath(state, state.escort.wagon, state.escort.order.tile);
    if (path && path.length - 1 <= fantasyCombatMoveRange(state.escort.wagon)) {
      state.escort.wagon.tile = { ...state.escort.order.tile }; credit(state.escort.orderedBy);
      log(state, t('호송 수레가 길을 따라 움직였다.', 'The caravan wagon moves along the route.', '護送馬車が道に沿って進んだ。'));
    } else log(state, t('호송 수레의 길이 막혀 멈췄다.', 'The caravan wagon stops at a blocked route.', '護送馬車は道が塞がれて止まった。'));
  }
  for (const fighter of actors) {
    if (living(fighter)) for (const effect of fighter.effects) {
      if (effect.id !== 'frost') { const amount = Math.min(fighter.hp, effect.power); fighter.hp -= amount; if (amount) log(state, t(`${fighter.names.ko}: 지속 피해 ${amount}.`, `${fighter.names.en}: ${amount} ongoing damage.`, `${fighter.names.ja}：持続ダメージ${amount}。`)); }
      effect.turns--;
    }
    fighter.effects = fighter.effects.filter(effect => effect.turns > 0); fighter.guarding = false; fighter.ward = 0; delete fighter.wardOwner; delete fighter.wardUnit;
    if (fighter.aim && --fighter.aim.turns <= 0) delete fighter.aim;
  }
  for (const unit of state.units ?? []) if (!state.fighters.some(f => f.userId === unit.companion!.ownerId && living(f))) unit.fled = true;
  status(state); state.orders = {}; if (state.unitOrders) state.unitOrders = {}; if (state.escort) { delete state.escort.order; delete state.escort.orderedBy; } state.revision++; state.hour = at; state.deadline = at + FANTASY_COMBAT_ROUND_HOURS;
  if (state.status !== 'active') log(state, state.status === 'victory' ? t('전투에서 승리했다.', 'Victory.', '戦闘に勝利した。') : state.status === 'escaped' ? t('남은 일행이 전장을 벗어났다.', 'The remaining travelers have withdrawn.', '残る一行は戦場を離れた。') : t('전투가 끝났다. 구조와 사망 처리는 각자의 상황을 따른다.', 'Combat ends. Rescue and death follow each traveler’s circumstances.', '戦闘終了。救助と死亡は各自の状況に従う。'));
  else state.round++;
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
    for (const enemy of next.fighters.filter(f => f.side === 'enemies')) {
      const rank = fantasyCombatEnemy(enemy.template!)!.rank, previous = fantasyPartyCombatScale(oldScaling, rank), increased = fantasyPartyCombatScale(next.scaling, rank);
      const hp = Math.max(enemy.stats.hp, Math.ceil(enemy.stats.hp * increased.hpMultiplier / previous.hpMultiplier));
      if (enemy.hp > 0) enemy.hp += hp - enemy.stats.hp;
      enemy.stats.hp = hp;
      enemy.stats.attack = Math.max(enemy.stats.attack, Math.round(enemy.stats.attack * increased.damageMultiplier / previous.damageMultiplier));
      enemy.stats.intelligence = Math.max(enemy.stats.intelligence, Math.round(enemy.stats.intelligence * increased.damageMultiplier / previous.damageMultiplier));
    }
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
  item: t('쓸 수 있는 소모품이 없어요.', 'That consumable is unavailable.', '使える消耗品がありません。'),
  unnecessary: t('지금은 효과가 없는 행동이에요.', 'That action has no effect right now.', '今は効果がない行動です。'),
  blocked: t('길이 막혔거나 한 번에 이동할 수 있는 거리 밖이에요.', 'The route is blocked or beyond this turn’s movement.', '道が塞がれているか、一度に移動できる距離の外です。'),
  capacity: t('참가자는 최대 6명이에요.', 'A battle allows up to six players.', '参加者は最大6人です。'),
};
export const fantasyCombatErrorText = (error: FantasyCombatError, locale: NpcLocale) => ERROR_TEXT[error][locale];
