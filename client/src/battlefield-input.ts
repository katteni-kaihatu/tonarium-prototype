import type { BattleInput } from '../../shared/battlefield.ts';

export function battleInputFor(keys: Record<string, boolean>, aim: number, relative: boolean, fire: boolean): BattleInput {
  const forward = Number(!!(keys.KeyW || keys.ArrowUp)) - Number(!!(keys.KeyS || keys.ArrowDown));
  const side = Number(!!(keys.KeyD || keys.ArrowRight)) - Number(!!(keys.KeyA || keys.ArrowLeft));
  const yaw = relative ? aim : 0;
  const x = side * Math.cos(yaw) - forward * Math.sin(yaw), z = -side * Math.sin(yaw) - forward * Math.cos(yaw);
  const length = Math.max(1, Math.hypot(x, z));
  return { x: x / length, z: z / length, aim: Math.atan2(Math.sin(aim), Math.cos(aim)), fire: fire || !!keys.Space };
}
