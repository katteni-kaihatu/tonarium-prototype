import type { AvatarState } from '../../shared/protocol.ts';
import type { BattlefieldState } from '../../shared/battlefield.ts';

export function battlefieldAvatars(state: BattlefieldState | null): Record<string, AvatarState> {
  return Object.fromEntries(Object.values(state?.actors ?? {}).filter(p => p.active && !p.bot).map(p => [p.id,
    { x: p.x, z: p.z, ry: p.aim, y: p.tank ? 1 : 0, walking: false }]));
}
