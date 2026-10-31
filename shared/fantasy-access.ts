import { fantasyHasJob } from './fantasy-careers.ts';
import type { FantasyCharacter, FantasyEvent, FantasyQuest } from './fantasy.ts';
import { FANTASY_RACES } from './fantasy-data.ts';
import { fantasyBuildings } from './fantasy-town.ts';

type Character = Pick<FantasyCharacter, 'race' | 'job' | 'lifeJob' | 'location'> & Partial<Pick<FantasyCharacter, 'completed' | 'jobXp' | 'contractParties'>>;

function ancestryMatches(character: Character, requirement: { races?: string[]; families?: string[] }): boolean {
  const race = FANTASY_RACES.find(value => value.id === character.race);
  return !!race && (requirement.races === undefined || requirement.races.includes(race.id))
    && (requirement.families === undefined || requirement.families.includes(race.family));
}

export function fantasyEventEligible(character: Character, event: FantasyEvent): boolean {
  return ancestryMatches(character, event) && (event.job === undefined || fantasyHasJob(character,event.job))
    && (event.locations === undefined || event.locations.includes(character.location));
}

export function fantasyQuestEligible(character: Character, quest: FantasyQuest): boolean {
  return fantasyQuestRecordEligible(character, quest)
    && (quest.jobs === undefined || quest.jobs.some(job=>fantasyHasJob(character,job)));
}

export function fantasyQuestRecordEligible(character: Character, quest: FantasyQuest): boolean {
  return ancestryMatches(character, quest) && (quest.building === undefined
    || fantasyBuildings({ location: quest.giver }).some(building => building.id === quest.building))
    && (quest.requiresCompleted === undefined || quest.requiresCompleted.every(id => character.completed?.includes(id)))
    && (quest.jobs === undefined || quest.jobs.some(job=>fantasyHasJob(character,job))
      || quest.jobs.some(id => character.jobXp && Object.hasOwn(character.jobXp, id))
      || !quest.chapter&&!!character.contractParties?.[quest.id]);
}
