import type { FantasyAction, FantasyCharacter, FantasySeason } from './fantasy.ts';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS } from './fantasy-data.ts';

export const FANTASY_SEASON_DAYS = 15;
export const FANTASY_SEASONS: FantasySeason[] = ['spring', 'summer', 'autumn', 'winter'];
export interface FantasyEnvironment {
  day: number; year: number; season: FantasySeason; seasonDay: number; night: boolean;
  weather: 'clear' | 'cloudy' | 'rain' | 'snow'; temperature: number; indoors: boolean;
}
const hash = (text: string) => [...text].reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 17);
export function fantasyEnvironment(character: Pick<FantasyCharacter, 'location' | 'hour'>): FantasyEnvironment {
  const hour = Math.max(0, character.hour);
  const day = Math.floor(hour / 24) + 1;
  const seasonIndex = Math.floor((day - 1) / FANTASY_SEASON_DAYS) % 4;
  const season = FANTASY_SEASONS[seasonIndex];
  const seasonDay = (day - 1) % FANTASY_SEASON_DAYS + 1;
  const night = hour % 24 < 6 || hour % 24 >= 18;
  const place = FANTASY_LOCATIONS.find(place => place.id === character.location);
  const indoors = place?.kind === 'city' || place?.kind === 'tower';
  const landOffset = { aurelia: 0, noctis: -5, sylvara: 2, kazaran: 6, islands: 4 }[place?.land ?? 'aurelia'];
  const kindOffset = place?.kind === 'snow' ? -12 : place?.kind === 'mountain' ? -6 : place?.kind === 'volcano' ? 18 : place?.kind === 'desert' ? 8 : 0;
  const sample = hash(`${character.location}:${Math.floor(hour / 6)}`) % 100;
  let temperature = [16, 29, 15, 0][seasonIndex] + landOffset + kindOffset - (night ? 5 : 0);
  if (place?.kind === 'cave') temperature = 10 + Math.round(landOffset / 2);
  const wetChance = season === 'summer' ? 46 : season === 'autumn' ? 55 : season === 'winter' ? 62 : 24;
  const precipitates = sample < (place?.kind === 'desert' ? wetChance / 3 : wetChance);
  const weather = precipitates ? season === 'winter' && temperature <= 4 ? 'snow' : 'rain' : sample < 78 ? 'cloudy' : 'clear';
  return { day, year: 312 + Math.floor((day - 1) / 60), season, seasonDay, night, weather, temperature, indoors };
}

export function fantasyHasLight(character: Pick<FantasyCharacter, 'inventory' | 'race'>): boolean {
  return FANTASY_ITEMS.some(item => item.light && (character.inventory[item.id] ?? 0) > 0)
    || ['batkin', 'dark-elf', 'moonshadow', 'vampire-night', 'vampire-crimson', 'vampire-moon', 'revenant', 'voidborn'].includes(character.race);
}

export function fantasyEnvironmentPenalty(character: FantasyCharacter, covert = false): number {
  const environment = fantasyEnvironment(character);
  if (environment.indoors) return 0;
  const outfit = FANTASY_ITEMS.find(item => item.id === character.outfit)?.wear;
  const cold = Math.max(0, 8 - environment.temperature - (outfit?.warmth ?? 0));
  const heat = Math.max(0, environment.temperature - 29 - (outfit?.cooling ?? 0));
  const darkness = (environment.night || FANTASY_LOCATIONS.find(place => place.id === character.location)?.kind === 'cave') && !fantasyHasLight(character) ? covert && environment.night && FANTASY_JOBS.some(job => job.id === character.job && job.category === 'crime') ? 1 : 3 : 0;
  const rain = environment.weather === 'rain' && (outfit?.waterproof ?? 0) < 8 ? 1 : 0;
  return Math.min(6, darkness + rain + Math.min(3, Math.ceil(Math.max(cold, heat) / 8)));
}

export function fantasyEnvironmentActionError(character: FantasyCharacter, action: FantasyAction): string | undefined {
  const environment = fantasyEnvironment(character);
  const outdoor = ['explore', 'gather', 'hunt', 'skin', 'fish', 'terrain', 'investigate'].includes(action.type);
  const cave = FANTASY_LOCATIONS.find(place => place.id === character.location)?.kind === 'cave';
  if (outdoor && !environment.indoors && (environment.night || cave) && !fantasyHasLight(character)) return '暗い場所で活動するにはランタンか暗所に適した感覚が必要です。';
  return undefined;
}

export function validFantasyOutfit(character: FantasyCharacter): boolean {
  return character.outfit === undefined || typeof character.outfit === 'string'
    && FANTASY_ITEMS.some(item => item.id === character.outfit && item.wear) && (character.inventory[character.outfit] ?? 0) >= 1;
}
