import type { FantasyCombatFighter, FantasyCombatSkill, FantasyCombatState } from './fantasy-combat.ts';
import { fantasyCombatDistance, fantasyCombatLineOfSight, type FantasyCombatTile } from './fantasy-combat-tactics.ts';
import type { NpcLocale } from './npc.ts';
import { fantasyCombatDashLanding } from './fantasy-combat-movement.ts';

export const FANTASY_ATTACK_SHAPES = ['single', 'line', 'cone', 'fan', 'burst'] as const;
export type FantasyAttackShape = typeof FANTASY_ATTACK_SHAPES[number];
export const fantasyAttackGeometry = (skill: Pick<FantasyCombatSkill, 'shape' | 'radius'>): FantasyAttackShape => skill.shape ?? (skill.radius ? 'burst' : 'single');
export function fantasyAttackShapeName(shape: FantasyAttackShape, locale: NpcLocale): string {
  return { single: { ko: '단일', en: 'Single', ja: '単体' }, line: { ko: '직선 관통', en: 'Piercing line', ja: '直線貫通' }, cone: { ko: '전방 원뿔 90°', en: 'Forward cone 90°', ja: '前方円錐90°' }, fan: { ko: '전방 부채꼴 180°', en: 'Forward fan 180°', ja: '前方扇形180°' }, burst: { ko: '대상 중심 원형', en: 'Target-centered burst', ja: '対象中心の円形' } }[shape][locale];
}
export function fantasyCombatAttackTiles(state: FantasyCombatState, actor: FantasyCombatFighter, center: FantasyCombatTile, skill: FantasyCombatSkill): FantasyCombatTile[] {
  const field = state.battlefield, origin = actor.tile;
  if (!field || !origin || skill.kind !== 'attack' || center.x < 0 || center.y < 0 || center.x >= field.width || center.y >= field.height) return [];
  if(skill.battlefieldWide)return Array.from({length:field.width*field.height},(_,i)=>({x:i%field.width,y:Math.floor(i/field.width)}));
  const shape = fantasyAttackGeometry(skill), range = skill.range ?? (skill.magic ? 'magic' : actor.range);
  const landing = skill.motion?.kind === 'dash' ? fantasyCombatDashLanding(state, actor, { tile: center } as FantasyCombatFighter, skill) : undefined;
  if (skill.motion?.kind === 'dash' && !landing) return [];
  if (skill.motion?.kind === 'advance' && !fantasyCombatDashLanding(state, actor, { tile: center } as FantasyCombatFighter, skill)) return [];
  const reach = landing ? fantasyCombatDistance(origin, landing) : skill.reach ?? (range === 'melee' ? 1 : range === 'ranged' ? 7 : 8);
  if (fantasyCombatDistance(origin, center) > reach || !fantasyCombatLineOfSight(state, origin, center)) return [];
  if (shape === 'single') return [{ ...center }];
  const dx = center.x - origin.x, dy = center.y - origin.y, length = Math.hypot(dx, dy);
  if (shape !== 'burst' && !length) return [];
  const result: FantasyCombatTile[] = [];
  for (let y = 0; y < field.height; y++) for (let x = 0; x < field.width; x++) {
    const tile = { x, y };
    if (shape === 'burst') {
      if (fantasyCombatDistance(center, tile) <= (skill.radius ?? 0) && fantasyCombatLineOfSight(state, center, tile)) result.push(tile);
      continue;
    }
    const tx = x - origin.x, ty = y - origin.y, dot = dx * tx + dy * ty, cross = dx * ty - dy * tx;
    if ((!tx && !ty) || fantasyCombatDistance(origin, tile) > reach || !fantasyCombatLineOfSight(state, origin, tile)) continue;
    // 中心を向く連続方向で判定し、斜めの狙いを四方向に丸めない。
    if (shape === 'line' ? dot > 0 && Math.abs(cross) / length <= .5 : shape === 'cone' ? dot > 0 && dot >= Math.abs(cross) : dot >= 0) result.push(tile);
  }
  return result;
}
