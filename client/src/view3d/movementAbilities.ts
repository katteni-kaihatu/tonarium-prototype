import { JUMP_V, LEAN_ANGLE } from '../../../shared/protocol.ts';

export interface JumpBody { grounded: boolean; vy: number; n: number; extraJump: boolean }

export function pressJump(body: JumpBody, enabled: boolean, freshPress: boolean): 'normal' | 'extra' | null {
  if (!freshPress) return null;
  const normal = body.grounded;
  if (!normal && (!enabled || !body.extraJump)) return null;
  body.vy = JUMP_V;
  body.grounded = false;
  body.extraJump = normal;
  body.n++;
  return normal ? 'normal' : 'extra';
}

export interface LeanContext {
  enabled: boolean; locked: boolean; typing: boolean; survivor: boolean;
  carrying: boolean; dragging: boolean; holdingTool: boolean; bike: boolean;
}

export function canLean(c: LeanContext): boolean {
  return c.enabled && c.locked && !c.typing && !c.survivor && !c.carrying && !c.dragging && !c.holdingTool && !c.bike;
}

export { LEAN_ANGLE } from '../../../shared/protocol.ts';
export function leanAngle(current: number, left: boolean, right: boolean, allowed: boolean, dt: number): number {
  if (!allowed) return 0;
  const target = ((left ? 1 : 0) - (right ? 1 : 0)) * LEAN_ANGLE;
  const angle = current + (target - current) * (1 - Math.exp(-Math.max(0, dt) / 0.12));
  return Math.abs(angle - target) < 0.0001 ? target : angle;
}
