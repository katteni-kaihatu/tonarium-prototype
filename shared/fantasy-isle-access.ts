export const FANTASY_FINAL_ISLE_ID = 'beyond-dawn-isle';
export const FANTASY_FINAL_ISLE_UNLOCK_QUEST = 'main-night-17';
export const FANTASY_FINAL_ISLE_LAST_QUEST = 'main-night-18';

export function fantasyIsleAccess(character: { completed?: readonly string[] }): boolean {
  return character.completed?.some(id => id === FANTASY_FINAL_ISLE_UNLOCK_QUEST || id === FANTASY_FINAL_ISLE_LAST_QUEST) === true;
}

export function fantasyIsleLocationVisible(character: { completed?: readonly string[] }, location: string): boolean {
  return location !== FANTASY_FINAL_ISLE_ID || fantasyIsleAccess(character);
}
