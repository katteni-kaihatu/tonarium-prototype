import type { FantasyCombatFighter, FantasyCombatState } from './fantasy-combat.ts';
import { fantasyCombatMoveRange, fantasyCombatPath, fantasyCombatTileKey, type FantasyCombatTile } from './fantasy-combat-tactics.ts';

export interface FantasyCombatMoveAttempt {
  path: FantasyCombatTile[]; distance: number; normalDistance: number; extra: number;
  threshold: number; chance: number; failureTile: FantasyCombatTile;
}
export function fantasyCombatMoveAttempt(state: FantasyCombatState, actor: FantasyCombatFighter, tile: FantasyCombatTile): FantasyCombatMoveAttempt | undefined {
  if (actor.hp <= 0 || actor.fled) return undefined;
  const normalDistance = fantasyCombatMoveRange(actor);
  if (normalDistance <= 0) return undefined;
  const route = fantasyCombatPath(state, actor, tile);
  if (!route || route.length < 2) return undefined;
  const path = route.map(step => ({ ...step })), distance = path.length - 1, extra = Math.max(0, distance - normalDistance);
  const threshold = extra ? Math.min(20, 17 + extra) : 0;
  const obstacles = new Set((state.battlefield?.obstacles ?? []).map(entry => fantasyCombatTileKey(entry.tile)));
  let failureIndex = Math.min(normalDistance, path.length - 1);
  while (failureIndex > 0 && obstacles.has(fantasyCombatTileKey(path[failureIndex]))) failureIndex--;
  return { path, distance, normalDistance, extra, threshold, chance: extra ? (21 - threshold) / 20 : 1,
    failureTile: { ...path[failureIndex] } };
}
