import type { FantasyAction, FantasyProfile } from './fantasy.ts';

export function fantasyTravelGearAvailable(profile: FantasyProfile): boolean {
  return profile.activity?.action.type === 'travel' && !!profile.character && profile.character.hp > 0
    && !profile.character.downed && !profile.combatId && !profile.death && !profile.event;
}
export function fantasyCanChangeTravelGear(profile: FantasyProfile, action: FantasyAction): boolean {
  return fantasyTravelGearAvailable(profile) && ['wear', 'equip', 'unequip'].includes(action.type);
}
