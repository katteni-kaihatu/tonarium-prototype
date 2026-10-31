import { FANTASY_FRONTIER_BASE, FANTASY_FRONTIER_FORAGE_ITEMS, FANTASY_FRONTIER_ENCOUNTERS } from './fantasy-frontier-data.ts';
import { fantasyHasJob } from './fantasy-careers.ts';
import type { FantasyCharacter, FantasyStat } from './fantasy.ts';
import { FANTASY_ITEMS, FANTASY_LOCATIONS } from './fantasy-data.ts';
import { fantasyBuildings, FANTASY_SETTLEMENTS } from './fantasy-town.ts';
import { FANTASY_MONSTERS } from './fantasy-monsters.ts';
import { FANTASY_WORKSHOP_GATHER_RESOURCES } from './fantasy-workshop-materials.ts';

export type FantasyGatherResource = 'herbs' | 'wood' | 'minerals' | 'gems';
export const FANTASY_GATHERING_NAMES = {
  herbs: { ko: '약초 채집', en: 'Gather herbs', ja: '薬草採集' }, wood: { ko: '목재 채집', en: 'Gather timber', ja: '木材採集' },
  minerals: { ko: '광물 채광', en: 'Mine minerals', ja: '鉱物採掘' }, gems: { ko: '보석 채광', en: 'Mine gems', ja: '宝石採掘' },
};
const placeOf = (character: Pick<FantasyCharacter, 'location'>) => FANTASY_LOCATIONS.find(place => place.id === character.location);
export function fantasyGatheringOptions(character: FantasyCharacter) {
  const place = placeOf(character);
  return (Object.keys(FANTASY_GATHERING_NAMES) as FantasyGatherResource[]).map(resource => {
    const category = resource === 'herbs' ? ['herb'] : resource === 'wood' ? ['wood', 'fiber'] : resource === 'minerals' ? ['ore', 'crystal'] : ['gem'];
    const terrain = !!place && (resource === 'herbs' || resource === 'wood' ? ['forest', 'swamp'].includes(place.kind) || place.id === 'sunmeadow' : ['mountain', 'cave', 'ruin', 'volcano'].includes(place.kind));
    const items = place ? FANTASY_ITEMS.filter(item => {
      const workshop = Object.hasOwn(FANTASY_WORKSHOP_GATHER_RESOURCES, item.id) && FANTASY_WORKSHOP_GATHER_RESOURCES[item.id] === resource;
      const forage = resource === 'herbs' && !!FANTASY_FRONTIER_FORAGE_ITEMS[character.location]?.includes(item.id);
      return (forage || workshop || terrain && category.includes(item.category ?? '')) && (place.resources.includes(item.id) || item.drop && (!item.drop.kinds || item.drop.kinds.includes(place.kind)) && place.danger >= (item.drop.minDanger ?? 0));
    }).map(item => item.id) : [];
    const stat: FantasyStat = resource === 'wood' || resource === 'minerals' ? 'strength' : 'intelligence';
    return { resource, name: FANTASY_GATHERING_NAMES[resource], stat, hours: 2, dc: 10 + (place?.danger ?? 0) + (resource === 'gems' ? 2 : 0), items, available: items.length > 0, ...(items.length ? {} : { reason: 'この場所ではその資源を採集できません。' }) };
  });
}
export function fantasyGatherItem(character: FantasyCharacter, resource: FantasyGatherResource, rng: () => number): string | undefined {
  const option = fantasyGatheringOptions(character).find(option => option.resource === resource);
  if (!option?.available) return undefined;
  const place = placeOf(character)!;
  const weighted = option.items.map(id => ({ id, weight: place.resources.includes(id) ? 5 : Math.max(0.01, FANTASY_ITEMS.find(item => item.id === id)!.drop?.chance ?? 0.2) }));
  let ticket = Math.max(0, Math.min(0.9999999, Number(rng()) || 0)) * weighted.reduce((sum, item) => sum + item.weight, 0);
  return weighted.find(item => { ticket -= item.weight; return ticket < 0; })?.id ?? weighted.at(-1)!.id;
}

export const FANTASY_HUNT_MONSTERS = FANTASY_MONSTERS;
export function fantasyHuntTargets(character: FantasyCharacter) {
  const place = placeOf(character);
  if (!place || place.id === FANTASY_FRONTIER_BASE || FANTASY_SETTLEMENTS[place.id] || place.kind === 'city' || place.kind === 'tower') return [];
  return FANTASY_MONSTERS.filter(monster => !monster.navalOnly && monster.tier < 8 && (place.land !== 'frontier' || !!FANTASY_FRONTIER_ENCOUNTERS[place.id]?.includes(monster.id) && monster.tier<=6) && monster.kinds.includes(place.kind) && place.danger >= (monster.minDanger ?? 0)).map(monster => ({ ...monster, hours: 3, danger: Math.max(1, place.danger) }));
}
export function fantasyHuntTarget(character: FantasyCharacter, id?: string) {
  return fantasyHuntTargets(character).find(monster => id ? monster.id === id : true);
}
export function fantasyHuntLoot(monster: typeof FANTASY_MONSTERS[number], rng: () => number): string | undefined {
  if (!monster.loot.length) return undefined;
  let ticket = Math.max(0, Math.min(0.999999, Number(rng()) || 0)) * monster.loot.reduce((sum, loot) => sum + loot.weight, 0);
  return monster.loot.find(loot => { ticket -= loot.weight; return ticket < 0; })?.item ?? monster.loot.at(-1)!.item;
}
export function fantasySkinError(character: FantasyCharacter): string | undefined {
  const carcass = character.carcass;
  if (!carcass || carcass.location !== character.location || character.hour - carcass.hour > 12) return 'この場所には解体できる新しい獲物がありません。';
  return undefined;
}
export const FANTASY_BOAT_OPTIONS = [
  { mode: 'rent' as const, price: 20, hours: 24, name: { ko: '어선 대여', en: 'Rent fishing boat', ja: '漁船を借りる' } },
  { mode: 'buy' as const, price: 180, name: { ko: '어선 구매', en: 'Buy fishing boat', ja: '漁船を買う' } },
];
export function fantasyBoatError(character: FantasyCharacter, mode: string): string | undefined {
  if (!fantasyHasJob(character,'fisher') || !fantasyBuildings(character).some(building => building.id === 'shipyard')) return '漁師として造船所で漁船を手配してください。';
  const option = FANTASY_BOAT_OPTIONS.find(option => option.mode === mode);
  if (!option) return '漁船の手配方法が正しくありません。';
  if (character.fishingBoat?.kind === 'owned' || mode === 'rent' && character.fishingBoat && (character.fishingBoat.expiresAt ?? 0) > character.hour) return 'すでに使える漁船があります。';
  if (character.gold < option.price) return '漁船を手配する金貨が足りません。';
  return undefined;
}
export function fantasyFishingError(character: FantasyCharacter, mode: string, startHour = character.hour): string | undefined {
  if (mode === 'pier' && fantasyFrontierFishingShore(character)) return undefined;
  if (!fantasyHasJob(character,'fisher')) return '釣りは漁師の専門行動です。';
  if (!['pier', 'sea'].includes(mode)) return '釣り場の種類が正しくありません。';
  if (!placeOf(character)?.services.includes('port')) return '港の桟橋や船着き場から釣りへ出発してください。';
  if (mode === 'sea' && (!character.fishingBoat || character.fishingBoat.kind === 'rented' && (character.fishingBoat.expiresAt ?? 0) < startHour + 4)) return '海釣りには、帰港まで使える購入済みかレンタルの漁船が必要です。';
  return undefined;
}
export function fantasyFrontierFishingShore(character: Pick<FantasyCharacter, 'location'>): boolean {
  const place = placeOf(character);
  return !!place && place.land === 'frontier' && place.resources.includes('fish') && ['coast', 'swamp', 'forest'].includes(place.kind);
}
export function fantasyFishingDifficulty(character: FantasyCharacter, mode: 'pier' | 'sea'): number {
  return mode === 'sea' ? 14 : fantasyFrontierFishingShore(character) && !fantasyHasJob(character, 'fisher') ? 12 : 10;
}
export function fantasyFishingOptions(character: FantasyCharacter) {
  return (['pier', 'sea'] as const).map(mode => ({ mode, hours: mode === 'sea' ? 4 : 2, dc: fantasyFishingDifficulty(character, mode), available: !fantasyFishingError(character, mode), reason: fantasyFishingError(character, mode) }));
}
export function fantasyFishingItem(mode: 'pier' | 'sea', rng: () => number): string {
  const options = mode === 'sea' ? ['tuna', 'fish', 'glowfish'] : ['fish', 'trout', 'salmon'];
  return options[Math.floor(Math.max(0, Math.min(0.999999, Number(rng()) || 0)) * options.length)];
}
export function validFantasyFishing(character: FantasyCharacter): boolean {
  const hunt = character.lastHunt;
  if (hunt !== undefined) {
    if (!hunt || typeof hunt !== 'object' || Array.isArray(hunt) || Object.keys(hunt).some(key => !['id', 'location', 'hour', 'success', 'count', 'receipt'].includes(key))
      || typeof hunt.success !== 'boolean' || !Number.isFinite(hunt.hour) || hunt.hour < 0 || hunt.hour > character.hour) return false;
    const combat = Object.hasOwn(hunt, 'count') || Object.hasOwn(hunt, 'receipt');
    if (combat && (Object.keys(hunt).length !== 6 || !hunt.success || !Number.isSafeInteger(hunt.count) || hunt.count! < 1 || hunt.count! > 6
      || typeof hunt.receipt !== 'string' || !/^combat-[a-z0-9-]{1,73}$/.test(hunt.receipt))) return false;
    if (!combat && Object.keys(hunt).length !== 4) return false;
    if (!FANTASY_LOCATIONS.some(location => location.id === hunt.location && FANTASY_MONSTERS.some(monster => monster.id === hunt.id
      && (combat || monster.kinds.includes(location.kind) && location.danger >= (monster.minDanger ?? 0))))) return false;
  }
  const boat = character.fishingBoat;
  if (boat !== undefined && (!boat || typeof boat !== 'object' || !['owned', 'rented'].includes(boat.kind) || Object.keys(boat).some(key => !['kind', 'expiresAt'].includes(key)) || (boat.kind === 'rented' ? !Number.isFinite(boat.expiresAt) || boat.expiresAt! < 0 : boat.expiresAt !== undefined))) return false;
  const carcass = character.carcass;
  return carcass === undefined || !!carcass && typeof carcass === 'object' && Object.keys(carcass).length === 5
    && FANTASY_LOCATIONS.some(location => location.id === carcass.location) && Number.isFinite(carcass.hour) && carcass.hour >= 0 && carcass.hour <= character.hour
    && Number.isInteger(carcass.count) && carcass.count > 0 && carcass.count <= 10 && FANTASY_HUNT_MONSTERS.some(monster => monster.id === carcass.monster && monster.hide === carcass.hide);
}
