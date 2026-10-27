import type { FantasyProfile, FantasyResult } from '../shared/fantasy.ts';
import { newFantasyProfile } from '../shared/fantasy-engine.ts';
import { recordFantasyDeath } from '../shared/fantasy-mortality.ts';

export function resetFantasyTestLife(profile: FantasyProfile): FantasyResult {
  if (!profile.character) return { profile, changed: false, error: '初期化する人物がいません。' };
  const previous = structuredClone(profile);
  if (!previous.death) recordFantasyDeath(previous, 'Test journey reset');
  const next = newFantasyProfile();
  next.revision = profile.revision + 1;
  next.generation = (profile.generation ?? 1) + 1;
  next.pastLives = previous.pastLives ?? [];
  return { profile: next, changed: true };
}

export function fantasyTestToolsAllowed(flag: string | undefined, address: string | undefined): boolean {
  return flag === '1' && !!address && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
}
