import type { FantasyCombatError, FantasyCombatFighter, FantasyCombatState } from './fantasy-combat.ts';
import { FANTASY_LOCATIONS } from './fantasy-data.ts';
import { fantasyCombatDistance, fantasyCombatMoveRange, fantasyCombatPath, fantasyCombatTileKey, fantasyCombatValidTile, type FantasyCombatTile } from './fantasy-combat-tactics.ts';

export interface FantasyEscortBattleInput { owner: string; contractId: string; destination: string; leader?: string }
export type FantasyEscortBattleOrder = { type: 'guard' } | { type: 'moveTo'; tile: FantasyCombatTile };
export interface FantasyEscortBattle {
  owner: string; ownerGeneration: number; contractId: string; destination: string; leader?: string; leaderGeneration?: number;
  origin: { hp: number; defense: number }; wagon: FantasyCombatFighter; exit: FantasyCombatTile; order?: FantasyEscortBattleOrder; orderedBy?: string;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 160 && !/[\u0000-\u001f\u007f]/.test(v);
const integer = (v: unknown, min = 0, max = 1_000_000): v is number => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
const live = (f: FantasyCombatFighter) => f.hp > 0 && !f.fled;
const wagonId = (state: FantasyCombatState) => `wagon-${state.id}`.slice(0, 190);
const statsOf = (origin: FantasyEscortBattle['origin']) => ({ hp: Math.max(100, Math.min(400, 100 + Math.floor(origin.hp * .5))), mp: 0, attack: 0, defense: 10 + Math.floor(origin.defense * .15), agility: 0, intelligence: 0, accuracy: 0, magicResist: 10 });
export function isFantasyEscortBattleOrder(value: unknown): value is FantasyEscortBattleOrder {
  return object(value) && (value.type === 'guard' && Object.keys(value).length === 1 || value.type === 'moveTo' && Object.keys(value).length === 2 && fantasyCombatValidTile({ width: 10, height: 8, blocked: [], cover: [] }, value.tile));
}
export function createFantasyEscortBattle(state: FantasyCombatState, input: FantasyEscortBattleInput): FantasyEscortBattle {
  if (!state.battlefield || !object(input) || Object.keys(input).some(key => !['owner', 'contractId', 'destination', 'leader'].includes(key))
    || !id(input.owner) || !id(input.contractId) || !FANTASY_LOCATIONS.some(place => place.id === input.destination) || state.source !== `escort:${input.contractId}`) throw new TypeError('Invalid escort battle');
  const owner = state.fighters.find(f => f.userId === input.owner && live(f)), leader = input.leader && state.fighters.find(f => f.userId === input.leader && live(f));
  if (!owner || input.leader !== undefined && (!id(input.leader) || !leader) || state.fighters.some(f => f.id === wagonId(state))) throw new TypeError('Invalid escort commander');
  const origin = { hp: owner.stats.hp, defense: owner.stats.defense }, stats = statsOf(origin), wagon: FantasyCombatFighter = { id: wagonId(state), side: 'players', names: { ko: '호송 수레와 마부', en: 'Caravan wagon and driver', ja: '護送馬車と御者' },
    stats, hp: stats.hp, mp: 0, position: 'rear', range: 'melee', skills: [], effects: [], fled: false, guarding: false, ward: 0, contribution: { effectiveActions: 0, activeRounds: 0, manualActions: 0 }, tile: { x: 1, y: 4 } };
  const occupied = new Set([...state.fighters, ...(state.units ?? [])].filter(live).map(f => f.tile && fantasyCombatTileKey(f.tile)));
  if (occupied.has(fantasyCombatTileKey(wagon.tile!))) wagon.tile = { x: 0, y: 4 };
  if (occupied.has(fantasyCombatTileKey(wagon.tile!))) wagon.tile = { x: 0, y: 7 };
  return { owner: input.owner, ownerGeneration: owner.generation!, contractId: input.contractId, destination: input.destination,
    ...(leader && leader.userId !== owner.userId ? { leader: leader.userId!, leaderGeneration: leader.generation! } : {}), origin, wagon, exit: { x: 9, y: 4 } };
}
export function fantasyEscortCanCommand(state: FantasyCombatState, user: string): boolean {
  const escort = state.escort, actor = state.fighters.find(f => f.userId === user && live(f));
  return !!escort && !!actor && (escort.owner === user && escort.ownerGeneration === actor.generation || escort.leader === user && escort.leaderGeneration === actor.generation);
}
export function fantasyEscortAtExit(state: FantasyCombatState): boolean {
  return !!state.escort?.wagon.tile && fantasyCombatTileKey(state.escort.wagon.tile) === fantasyCombatTileKey(state.escort.exit);
}
export function fantasyEscortBattleWon(state: FantasyCombatState): boolean { return !!state.escort && state.status === 'victory' && state.escort.wagon.hp > 0 && fantasyEscortAtExit(state); }
export function fantasyEscortHasCommander(state: FantasyCombatState): boolean { return !!state.escort && state.fighters.some(f => !!f.userId && fantasyEscortCanCommand(state, f.userId)); }
export function fantasyEscortReady(state: FantasyCombatState): boolean { return !state.escort || !!state.escort.order || !fantasyEscortHasCommander(state); }
export function fantasyEscortOrderError(state: FantasyCombatState, user: string, order: FantasyEscortBattleOrder): FantasyCombatError | undefined {
  if (!state.escort || !isFantasyEscortBattleOrder(order)) return 'invalid';
  if (!fantasyEscortCanCommand(state, user)) return 'not-owner';
  if (state.escort.wagon.hp <= 0) return 'down';
  if (state.escort.order) return 'already-ordered';
  if (order.type === 'guard') return undefined;
  const path = fantasyCombatPath(state, state.escort.wagon, order.tile);
  if (path?.length === 1) return 'unnecessary';
  return path && path.length - 1 <= fantasyCombatMoveRange(state.escort.wagon) ? undefined : 'blocked';
}
export function fantasyEscortAdvanceTile(state: FantasyCombatState): FantasyCombatTile | undefined {
  if (!state.escort) return undefined;
  const path = fantasyCombatPath(state, state.escort.wagon, state.escort.exit);
  return path && path.length > 1 ? path[Math.min(path.length - 1, fantasyCombatMoveRange(state.escort.wagon))] : undefined;
}
export function validFantasyEscortBattle(state: FantasyCombatState): boolean {
  const e = state.escort;
  if (e === undefined) return !state.source.startsWith('escort:');
  if (!state.battlefield || !object(e) || Object.keys(e).some(key => !['owner', 'ownerGeneration', 'contractId', 'destination', 'leader', 'leaderGeneration', 'origin', 'wagon', 'exit', 'order', 'orderedBy'].includes(key))
    || !id(e.owner) || !integer(e.ownerGeneration, 1) || !id(e.contractId) || state.source !== `escort:${e.contractId}` || !FANTASY_LOCATIONS.some(place => place.id === e.destination)
    || !state.fighters.some(f => f.userId === e.owner && f.generation === e.ownerGeneration) || (e.leader === undefined) !== (e.leaderGeneration === undefined)
    || e.leader !== undefined && (!id(e.leader) || !integer(e.leaderGeneration, 1) || !state.fighters.some(f => f.userId === e.leader && f.generation === e.leaderGeneration))
    || !object(e.origin) || Object.keys(e.origin).length !== 2 || !integer(e.origin.hp, 1) || !integer(e.origin.defense)
    || !fantasyCombatValidTile(state.battlefield, e.exit) || e.exit.x !== 9 || e.exit.y !== 4
    || (e.order === undefined) !== (e.orderedBy === undefined) || e.order !== undefined && (!isFantasyEscortBattleOrder(e.order) || !e.orderedBy || !fantasyEscortCanCommand(state, e.orderedBy))) return false;
  const w = e.wagon, stats = statsOf(e.origin);
  if (!object(w) || Object.keys(w).some(key => !['id', 'side', 'names', 'stats', 'hp', 'mp', 'position', 'range', 'skills', 'effects', 'fled', 'guarding', 'ward', 'wardOwner', 'wardUnit', 'contribution', 'tile'].includes(key))
    || w.id !== wagonId(state) || w.side !== 'players' || !object(w.names) || Object.keys(w.names).length !== 3 || !(['ko', 'en', 'ja'] as const).every(locale => id(w.names[locale]))
    || !object(w.stats) || Object.keys(w.stats).length !== 8 || Object.entries(stats).some(([key, n]) => w.stats[key as keyof typeof stats] !== n) || !integer(w.hp, 0, stats.hp) || w.mp !== 0 || w.position !== 'rear' || w.range !== 'melee'
    || !Array.isArray(w.skills) || w.skills.length !== 0 || !Array.isArray(w.effects) || w.effects.length > 3 || !w.effects.every(effect => object(effect) && Object.keys(effect).length === 3 && ['poison', 'burn', 'frost'].includes(String(effect.id)) && integer(effect.power, 1, 10000) && integer(effect.turns, 1, 10))
    || new Set(w.effects.map(effect => effect.id)).size !== w.effects.length || w.fled !== false || typeof w.guarding !== 'boolean' || !integer(w.ward)
    || w.wardOwner !== undefined && (!id(w.wardOwner) || !state.fighters.some(f => f.userId === w.wardOwner))
    || w.wardUnit !== undefined && (!id(w.wardUnit) || !state.units?.some(unit => unit.id === w.wardUnit && unit.companion?.ownerId === w.wardOwner))
    || !object(w.contribution) || Object.keys(w.contribution).length !== 3 || !['effectiveActions', 'activeRounds', 'manualActions'].every(key => Object.hasOwn(w.contribution, key)) || Object.values(w.contribution).some(n => n !== 0)
    || !fantasyCombatValidTile(state.battlefield, w.tile) || state.battlefield.blocked.some(tile => fantasyCombatTileKey(tile) === fantasyCombatTileKey(w.tile!))) return false;
  if (w.hp > 0 && [...state.fighters, ...(state.units ?? [])].some(f => live(f) && f.tile && fantasyCombatDistance(f.tile, w.tile!) === 0)) return false;
  return true;
}
