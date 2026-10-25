import type { Item } from './items.ts';
import { JUMP_V } from './protocol.ts';
import type { Solid } from './worlds.ts';

export const JUMP_PAD = { radius: 0.8, height: 0.18, velocity: JUMP_V } as const;
export type JumpPad = Extract<Item, { kind: 'jumpPad' }>;

export function jumpPadSolid(pad: JumpPad): Solid {
  return { x: pad.x, z: pad.z, r: JUMP_PAD.radius, y0: 0, y1: JUMP_PAD.height };
}

export function jumpPadAt(pads: JumpPad[], x: number, z: number, y: number): JumpPad | undefined {
  // 足が上面より下にある側面・下面接触を着地として扱わない。
  if (y < JUMP_PAD.height) return undefined;
  return pads.find(p => Math.hypot(x - p.x, z - p.z) <= JUMP_PAD.radius);
}
