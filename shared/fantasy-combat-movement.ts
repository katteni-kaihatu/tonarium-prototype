import type { FantasyCombatFighter, FantasyCombatSkill, FantasyCombatState } from './fantasy-combat.ts';
import { fantasyCombatActors, fantasyCombatDistance, fantasyCombatLineOfSight, fantasyCombatPath, fantasyCombatTileKey, fantasyCombatValidTile, type FantasyCombatTile } from './fantasy-combat-tactics.ts';
export function fantasyCombatSkillMoveRange(actor: FantasyCombatFighter, skill: FantasyCombatSkill): number {
  if (actor.carrying || actor.externalCarrying) return 0;
  if (!skill.motion || actor.conditions?.some(condition => condition.id === 'root')) return 0;
  return Math.max(0, skill.motion.distance - (actor.effects.some(effect => effect.id === 'frost') ? 1 : 0));
}
export function fantasyCombatSkillMovePath(state: FantasyCombatState, actor: FantasyCombatFighter, skill: FantasyCombatSkill, tile: FantasyCombatTile): FantasyCombatTile[] | undefined {
  if (skill.motion?.kind !== 'reposition') return undefined;
  const path = fantasyCombatPath(state, actor, tile), limit = fantasyCombatSkillMoveRange(actor, skill);
  if (!path || path.length < 2 || path.length - 1 > limit) return undefined;
  const obstacles = new Set(state.battlefield?.obstacles?.map(entry => fantasyCombatTileKey(entry.tile)) ?? []);
  return path.some(step => obstacles.has(fantasyCombatTileKey(step))) ? undefined : path;
}
export function fantasyCombatDashTrail(from: FantasyCombatTile, center: FantasyCombatTile, landing: FantasyCombatTile, throughTarget = true): FantasyCombatTile[] {
  const path = [{ ...from }];
  for (const [start, end] of throughTarget ? [[from, center], [center, landing]] : [[from, landing]]) {
    const steps = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y)) * 2;
    for (let index = 1; index <= steps; index++) {
      const tile = { x: Math.round(start.x + (end.x - start.x) * index / steps), y: Math.round(start.y + (end.y - start.y) * index / steps) };
      if (fantasyCombatTileKey(tile) !== fantasyCombatTileKey(path.at(-1)!)) path.push(tile);
    }
  }
  return path;
}
export function fantasyCombatDashLanding(state: FantasyCombatState, actor: FantasyCombatFighter, target: FantasyCombatFighter, skill: FantasyCombatSkill): FantasyCombatTile | undefined {
  const field = state.battlefield, from = actor.tile, center = target.tile;
  if (!field || !from || !center || !skill.motion || skill.motion.kind === 'reposition') return undefined;
  const dx = center.x - from.x, dy = center.y - from.y;
  if (!dx && !dy) return undefined;
  const advance = skill.motion.kind === 'advance', sign = advance ? -1 : 1;
  const tile = { x: center.x + sign * (Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0), y: center.y + sign * (Math.abs(dx) < Math.abs(dy) ? Math.sign(dy) : 0) };
  if (!fantasyCombatValidTile(field, tile) || fantasyCombatDistance(from, tile) > fantasyCombatSkillMoveRange(actor, skill) || !fantasyCombatLineOfSight(state, from, tile)) return undefined;
  const living = fantasyCombatActors(state).filter(entry => entry.id !== actor.id && entry.hp > 0 && !entry.fled && entry.tile);
  if (living.some(entry => fantasyCombatTileKey(entry.tile!) === fantasyCombatTileKey(tile))) return undefined;
  const blocked = new Set([...field.blocked, ...(actor.body?.flying ? [] : field.water ?? []), ...(field.obstacles ?? []).map(entry => entry.tile), ...living.filter(entry => advance || entry.side === actor.side).map(entry => entry.tile!)].map(fantasyCombatTileKey));
  if (fantasyCombatDashTrail(from, center, tile, !advance).slice(1).some(next => blocked.has(fantasyCombatTileKey(next)))) return undefined;
  return tile;
}
