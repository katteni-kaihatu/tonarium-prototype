/** Deterministic test player policy: navigate real paths and clear a sealed lane rather than bypassing the rules. */
import { fantasyCombatOrderError, type FantasyCombatOrder, type FantasyCombatState } from './fantasy-combat.ts';
import { fantasyCombatDistance, fantasyCombatMoveRange, fantasyCombatPath } from './fantasy-combat-tactics.ts';
import { fantasyObstacleKind } from './fantasy-obstacles.ts';
export function fantasyTestClearRoute(state: FantasyCombatState, user: string, useSkills = false): FantasyCombatOrder | undefined {
  const actor = state.fighters.find(fighter => fighter.userId === user);
  if (!actor?.tile || !state.battlefield) return;
  const obstacles = (state.battlefield.obstacles ?? []).filter(entry => fantasyObstacleKind(entry.kind)?.breakable)
    .sort((a, b) => fantasyCombatDistance(actor.tile!, a.tile) - fantasyCombatDistance(actor.tile!, b.tile) || a.tile.y - b.tile.y);
  for (const entry of obstacles) {
    const attacks: FantasyCombatOrder[] = [...(useSkills ? actor.skills.filter(skill => skill.kind === 'attack').map(skill => ({ type: 'break' as const, tile: entry.tile, skill: skill.id })) : []), { type: 'break', tile: entry.tile }];
    for (const order of attacks) if (!fantasyCombatOrderError(state, user, order)) return order;
  }
  const paths = obstacles.flatMap(entry => [{ x: entry.tile.x - 1, y: entry.tile.y }, { x: entry.tile.x + 1, y: entry.tile.y }, { x: entry.tile.x, y: entry.tile.y - 1 }, { x: entry.tile.x, y: entry.tile.y + 1 }]
    .flatMap(tile => { const path = fantasyCombatPath(state, actor, tile); return path && path.length > 1 ? [path] : []; })).sort((a, b) => a.length - b.length);
  for (const path of paths) {
    const order: FantasyCombatOrder = { type: 'moveTo', tile: path[Math.min(path.length - 1, fantasyCombatMoveRange(actor))] };
    if (!fantasyCombatOrderError(state, user, order)) return order;
  }
}
