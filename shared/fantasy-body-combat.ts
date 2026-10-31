import type { FantasyCharacter, FantasySkill } from './fantasy.ts';
import { fantasyBodyTraits } from './fantasy-physiology.ts';
import { FANTASY_BODY_COMBAT_TECHNIQUES, fantasyBodyCombatCapabilities } from './fantasy-body-combat-catalog.ts';
export function fantasyBodyCombatSkills(character: Pick<FantasyCharacter, 'race' | 'level'>): FantasySkill[] {
  const capabilities = fantasyBodyCombatCapabilities(fantasyBodyTraits(character).map(trait => trait.id));
  return FANTASY_BODY_COMBAT_TECHNIQUES.filter(entry => character.level >= entry.level && (Array.isArray(entry.requires) ? entry.requires : [entry.requires]).every(id => capabilities.has(id))).map(entry => entry.skill);
}
