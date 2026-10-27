import type { FantasyCombatFighter, FantasyCombatRange, FantasyCombatState } from './fantasy-combat.ts';

export interface FantasyCombatTile { x: number; y: number }
export interface FantasyCombatBattlefield { width: 10; height: 8; blocked: FantasyCombatTile[]; cover: FantasyCombatTile[] }
export const fantasyCombatTileKey = (tile: FantasyCombatTile) => `${tile.x}:${tile.y}`;
export const fantasyCombatDistance = (a: FantasyCombatTile, b: FantasyCombatTile) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const fantasyCombatActors = (state: FantasyCombatState): FantasyCombatFighter[] => [...state.fighters, ...(state.units ?? []), ...(state.escort ? [state.escort.wagon] : [])];
export const fantasyCombatField = (): FantasyCombatBattlefield => ({ width: 10, height: 8,
  blocked: [{ x: 4, y: 0 }, { x: 5, y: 0 }, { x: 4, y: 7 }, { x: 5, y: 7 }],
  cover: [{ x: 3, y: 2 }, { x: 3, y: 5 }, { x: 6, y: 2 }, { x: 6, y: 5 }],
});
export function fantasyCombatValidTile(field: FantasyCombatBattlefield, tile: unknown): tile is FantasyCombatTile {
  if (!tile || typeof tile !== 'object' || Array.isArray(tile)) return false;
  const value = tile as Record<string, unknown>;
  return Object.keys(value).length === 2 && Number.isInteger(value.x) && Number.isInteger(value.y)
    && Number(value.x) >= 0 && Number(value.x) < field.width && Number(value.y) >= 0 && Number(value.y) < field.height;
}
export function fantasyCombatValidField(value: unknown): value is FantasyCombatBattlefield {
  if (!value || typeof value !== 'object') return false;
  const field = value as FantasyCombatBattlefield;
  return Object.keys(field).length === 4 && field.width === 10 && field.height === 8
    && [field.blocked, field.cover].every(list => Array.isArray(list) && list.length <= 20
      && list.every(tile => fantasyCombatValidTile(field, tile)) && new Set(list.map(fantasyCombatTileKey)).size === list.length)
    && !field.cover.some(tile => field.blocked.some(block => fantasyCombatTileKey(tile) === fantasyCombatTileKey(block)));
}
export const fantasyCombatMoveRange = (actor: FantasyCombatFighter) => Math.max(1, Math.min(4, 2 + Math.floor(actor.stats.agility / 20) - (actor.effects.some(effect => effect.id === 'frost') ? 1 : 0)));
export function fantasyCombatPath(state: FantasyCombatState, actor: FantasyCombatFighter, destination: FantasyCombatTile): FantasyCombatTile[] | undefined {
  const field = state.battlefield;
  if (!field || !actor.tile || !fantasyCombatValidTile(field, destination)) return undefined;
  const occupied = new Set([...field.blocked.map(fantasyCombatTileKey), ...fantasyCombatActors(state)
    .filter(f => f.id !== actor.id && f.hp > 0 && !f.fled && f.tile).map(f => fantasyCombatTileKey(f.tile!))]);
  const queue: FantasyCombatTile[][] = [[actor.tile]], seen = new Set([fantasyCombatTileKey(actor.tile)]);
  for (let index = 0; index < queue.length; index++) {
    const path = queue[index], current = path.at(-1)!;
    if (fantasyCombatTileKey(current) === fantasyCombatTileKey(destination)) return path;
    for (const next of [{ x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y }, { x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 }]) {
      const key = fantasyCombatTileKey(next);
      if (fantasyCombatValidTile(field, next) && !occupied.has(key) && !seen.has(key)) { seen.add(key); queue.push([...path, next]); }
    }
  }
  return undefined;
}
export function fantasyCombatLineOfSight(state: FantasyCombatState, a: FantasyCombatTile, b: FantasyCombatTile): boolean {
  const field = state.battlefield;
  if (!field) return true;
  const dx = b.x - a.x, dy = b.y - a.y, steps = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
  for (let i = 1; i < steps; i++) {
    const x = Math.round(a.x + dx * i / steps), y = Math.round(a.y + dy * i / steps);
    if (field.blocked.some(tile => tile.x === x && tile.y === y)) return false;
  }
  return true;
}
export function fantasyCombatWithinRange(state: FantasyCombatState, actor: FantasyCombatFighter, target: FantasyCombatFighter, range: FantasyCombatRange): boolean {
  return !!actor.tile && !!target.tile && fantasyCombatDistance(actor.tile, target.tile) <= (range === 'melee' ? 1 : range === 'ranged' ? 7 : 8)
    && fantasyCombatLineOfSight(state, actor.tile, target.tile);
}
export function fantasyCombatCover(state: FantasyCombatState, target: FantasyCombatFighter): boolean {
  return !!target.tile && !!state.battlefield?.cover.some(tile => tile.x === target.tile!.x && tile.y === target.tile!.y);
}
export function fantasyCombatPlace(state: FantasyCombatState, actor: FantasyCombatFighter, preferred: FantasyCombatTile): boolean {
  if (!state.battlefield) return true;
  const occupied = new Set([...state.battlefield.blocked.map(fantasyCombatTileKey), ...fantasyCombatActors(state)
    .filter(f => f.id !== actor.id && f.hp > 0 && !f.fled && f.tile).map(f => fantasyCombatTileKey(f.tile!))]);
  const candidates = Array.from({ length: 80 }, (_, index) => ({ x: index % 10, y: Math.floor(index / 10) }))
    .filter(tile => !occupied.has(fantasyCombatTileKey(tile)))
    .sort((a, b) => fantasyCombatDistance(a, preferred) - fantasyCombatDistance(b, preferred) || a.y - b.y || a.x - b.x);
  if (!candidates[0]) return false;
  actor.tile = candidates[0]; return true;
}
