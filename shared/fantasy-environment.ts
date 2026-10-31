import type { FantasyAction, FantasyCharacter, FantasySeason } from './fantasy.ts';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_LOCATIONS } from './fantasy-data.ts';
import { fantasyArtifactEffects } from './fantasy-frontier-artifacts.ts';

export const FANTASY_SEASON_DAYS = 15;
export const FANTASY_SEASONS: FantasySeason[] = ['spring', 'summer', 'autumn', 'winter'];
export interface FantasyEnvironment {
  day: number; year: number; season: FantasySeason; seasonDay: number; night: boolean;
  weather: 'clear' | 'cloudy' | 'rain' | 'snow'; temperature: number; indoors: boolean;
}
const hash = (text: string) => [...text].reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 17);
export function fantasyEnvironment(character: Pick<FantasyCharacter, 'location' | 'hour'> & Partial<Pick<FantasyCharacter, 'travelPosition'>>): FantasyEnvironment {
  const hour = Math.max(0, character.hour);
  const day = Math.floor(hour / 24) + 1;
  const seasonIndex = Math.floor((day - 1) / FANTASY_SEASON_DAYS) % 4;
  const season = FANTASY_SEASONS[seasonIndex];
  const seasonDay = (day - 1) % FANTASY_SEASON_DAYS + 1;
  const night = hour % 24 < 6 || hour % 24 >= 18;
  const position = character.travelPosition;
  const onRoad = !!position && position.from !== position.to && position.fraction > 1e-8;
  const climateLocation = onRoad ? position.fraction < .5 ? position.from : position.to : character.location;
  const place = FANTASY_LOCATIONS.find(place => place.id === climateLocation);
  const indoors = !onRoad && (place?.kind === 'city' || place?.kind === 'tower');
  const landOffset = { aurelia: 0, noctis: -5, sylvara: 2, kazaran: 6, islands: 4, frontier: 1 }[place?.land ?? 'aurelia'];
  const kindOffset = place?.kind === 'snow' ? -12 : place?.kind === 'mountain' ? -6 : place?.kind === 'volcano' ? 18 : place?.kind === 'desert' ? 8 : 0;
  const sample = hash(`${climateLocation}:${Math.floor(hour / 6)}`) % 100;
  let temperature = [16, 29, 15, 0][seasonIndex] + landOffset + kindOffset - (night ? 5 : 0);
  if (place?.kind === 'cave') temperature = 10 + Math.round(landOffset / 2);
  const wetChance = season === 'summer' ? 46 : season === 'autumn' ? 55 : season === 'winter' ? 62 : 24;
  const precipitates = sample < (place?.kind === 'desert' ? wetChance / 3 : wetChance);
  const weather = precipitates ? season === 'winter' && temperature <= 4 ? 'snow' : 'rain' : sample < 78 ? 'cloudy' : 'clear';
  return { day, year: 312 + Math.floor((day - 1) / 60), season, seasonDay, night, weather, temperature, indoors };
}

export const FANTASY_LIGHT_STRENGTH: Readonly<Record<string, 1 | 2 | 3>> = {
  'guild-loan-lantern': 1, lantern: 2, 'everglow-lantern': 3,
};
// 複数の灯りは重ねず、最も強い一つを使う。
export function fantasyLightStrength(inventory: Readonly<Record<string, number>>): 0 | 1 | 2 | 3 {
  let strength: 0 | 1 | 2 | 3 = 0;
  for (const item of FANTASY_ITEMS) if (item.light && (inventory[item.id] ?? 0) > 0) {
    const quality = FANTASY_LIGHT_STRENGTH[item.id] ?? (item.category === 'magic-tool' ? 3 : 2);
    if (quality > strength) strength = quality;
  }
  return strength;
}
function fantasyHasNightVision(race: string): boolean {
  return ['batkin', 'dark-elf', 'moonshadow', 'vampire-night', 'vampire-crimson', 'vampire-moon', 'revenant', 'voidborn'].includes(race);
}
export function fantasyHasLight(character: Pick<FantasyCharacter, 'inventory' | 'race'>): boolean {
  return fantasyLightStrength(character.inventory) > 0 || fantasyHasNightVision(character.race);
}

export interface FantasyWeatherContext { camping?: boolean; campfire?: boolean; covert?: boolean }
export function fantasyWeatherExposure(character: FantasyCharacter, context: FantasyWeatherContext = {}) {
  const artifact = fantasyArtifactEffects(character);
  const environment = fantasyEnvironment(character);
  const place = FANTASY_LOCATIONS.find(place => place.id === character.location);
  const position = character.travelPosition, onRoad = !!position && position.from !== position.to && position.fraction > 1e-8;
  const indoors = !!character.dungeon?.active || !onRoad && (place?.kind === 'cave' || environment.indoors && (!context.camping || place?.kind === 'tower'));
  const worn = (character.inventory[character.outfit ?? ''] ?? 0) > 0 ? FANTASY_ITEMS.find(item => item.id === character.outfit && item.wear) : undefined;
  const tools = FANTASY_ITEMS.filter(item => item.weatherTool && (character.inventory[item.id] ?? 0) > 0 && (!item.weatherTool.campOnly || context.camping));
  const protection = (axis: 'warmth' | 'cooling' | 'waterproof') => {
    const tool = tools.reduce<typeof tools[number] | undefined>((best, item) => (item.weatherTool?.[axis] ?? 0) > (best?.weatherTool?.[axis] ?? 0) ? item : best, undefined);
    const value = Math.min(axis === 'warmth' ? 48 : 32, (worn?.wear?.[axis] ?? 0) + (tool?.weatherTool?.[axis] ?? 0) + (axis === 'warmth' && context.camping && context.campfire ? 8 : 0));
    return { value, items: [worn?.wear?.[axis] ? worn.id : undefined, tool?.id].filter((id): id is string => !!id) };
  };
  const warmth = protection('warmth'), cooling = protection('cooling'), waterproof = protection('waterproof');
  const heatBurden = environment.temperature >= 29 ? Math.floor(Math.max(0, (worn?.wear?.warmth ?? 0) - 8) / 6) : 0;
  const cold = indoors ? 0 : Math.max(0, Math.min(3, Math.ceil(Math.max(0, 8 - environment.temperature - warmth.value) / 8)) - artifact.coldRelief);
  const overheatedClothes = heatBurden > 0 && environment.temperature - 29 + heatBurden > cooling.value ? 1 : 0;
  const heat = indoors ? 0 : Math.max(0, Math.min(3, Math.ceil(Math.max(0, environment.temperature - 29 - cooling.value) / 8) + overheatedClothes) - artifact.heatRelief);
  const rain = !indoors && environment.weather === 'rain' && waterproof.value < 8 ? Math.max(0, 1 - artifact.rainRelief) : 0;
  const dark = !environment.indoors && (environment.night || place?.kind === 'cave');
  const darknessBase = context.covert && environment.night && FANTASY_JOBS.some(job => job.id === character.job && job.category === 'crime') ? 2 : 4;
  const light = Math.max(fantasyLightStrength(character.inventory), context.camping && context.campfire ? 2 : 0);
  const darkness = dark && !fantasyHasNightVision(character.race) ? Math.max(1, darknessBase - light - artifact.darknessRelief) : 0;
  return { environment, indoors, warmth, cooling, waterproof, cold, heat, rain, darkness, light, heatBurden,
    penalty: Math.min(6, darkness + rain + Math.max(cold, heat)), campFatigueLoss: Math.max(cold, heat) * 3 + rain * 4 };
}

export function fantasyEnvironmentPenalty(character: FantasyCharacter, covert = false): number {
  return fantasyWeatherExposure(character, { covert }).penalty;
}

export function fantasyCampWeatherLoss(character: FantasyCharacter, from: number, to: number, campfire = false): number {
  let loss = 0;
  for (let start = from; start < to - 1e-9;) {
    const end = Math.min(to, (Math.floor(start / 6) + 1) * 6);
    if (end <= start) break;
    loss += (end - start) / 8 * fantasyWeatherExposure({ ...character, hour: (start + end) / 2 }, { camping: true, campfire }).campFatigueLoss;
    start = end;
  }
  return loss;
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
