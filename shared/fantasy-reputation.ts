import type { FantasyCharacter } from './fantasy.ts';
import { FANTASY_LOCATIONS } from './fantasy-data.ts';
import { fantasyBuildings } from './fantasy-town.ts';

export type FantasyTradeService = 'room' | 'food' | 'goods';

export function fantasyReputation(character: Pick<FantasyCharacter, 'location' | 'reputation'>) {
  const place = FANTASY_LOCATIONS.find(location => location.id === character.location);
  const reputation = character.reputation;
  const land = reputation?.lands[place?.land ?? ''] ?? 0;
  const region = reputation?.regions[character.location] ?? 0;
  const town = reputation?.towns[character.location] ?? 0;
  return { land, region, town, score: Math.round(land * .2 + region * .3 + town * .5) };
}

export function grantFantasyReputation(character: FantasyCharacter, contribution: number): void {
  const place = FANTASY_LOCATIONS.find(location => location.id === character.location);
  if (!place || !Number.isSafeInteger(contribution) || contribution === 0) return;
  const reputation = character.reputation ??= { lands: {}, regions: {}, towns: {} };
  const add = (scope: Record<string, number>, key: string, amount: number) => {
    scope[key] = Math.max(-100, Math.min(100, (scope[key] ?? 0) + amount));
  };
  add(reputation.regions, place.id, contribution);
  add(reputation.lands, place.land, Math.sign(contribution) * Math.max(1, Math.floor(Math.abs(contribution) / 3)));
  if (fantasyBuildings(character).length > 0) add(reputation.towns, place.id, contribution);
}

export function fantasyCanHaggle(character: FantasyCharacter, service: FantasyTradeService): boolean {
  const buildings = fantasyBuildings(character);
  const required = service === 'room' ? ['inn'] : service === 'food' ? ['inn', 'restaurant'] : ['market', 'blacksmith', 'alchemist', 'shipyard', 'archaeology'];
  return buildings.some(building => required.includes(building.id))
    && !(character.bargains?.[service]?.location === character.location && character.bargains[service]!.nextAt > character.hour);
}

export function fantasyHaggle(character: FantasyCharacter, service: FantasyTradeService, rng: () => number) {
  if (!fantasyCanHaggle(character, service)) return null;
  const { score } = fantasyReputation(character);
  const charisma = character.job === 'merchant' || character.job === 'leader' || character.job === 'bard' ? 8 : 0;
  const chance = Math.max(.1, Math.min(.85, .25 + score * .005 + charisma / 100));
  const target = Math.floor(chance * 100);
  const roll = 1 + Math.floor(Math.max(0, Math.min(1 - Number.EPSILON, Number(rng()) || 0)) * 100);
  const success = roll <= target;
  const discount = success ? Math.min(.2, .08 + Math.max(0, score) * .0012) : 0;
  character.bargains ??= {};
  character.bargains[service] = { location: character.location, discount, expiresAt: character.hour + 8, nextAt: character.hour + 4 };
  return { success, discount, chance, roll, target };
}

export function fantasyPrice(character: Pick<FantasyCharacter, 'location' | 'hour' | 'bargains'>, base: number, service: FantasyTradeService): number {
  const bargain = character.bargains?.[service];
  const discount = bargain?.location === character.location && bargain.expiresAt > character.hour ? Math.max(0, Math.min(.2, bargain.discount)) : 0;
  return Math.max(1, Math.ceil(base * (1 - discount)));
}

export function validFantasyReputation(character: FantasyCharacter): boolean {
  const reputation = character.reputation;
  const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (reputation !== undefined) {
    if (!record(reputation) || Object.keys(reputation).length !== 3 || !(['lands', 'regions', 'towns'] as const).every(key => record(reputation[key]))) return false;
    for (const [scope, entries] of Object.entries(reputation)) {
      for (const [key, value] of Object.entries(entries)) {
        if (!Number.isSafeInteger(value) || value < -100 || value > 100) return false;
        if (scope === 'lands' ? !FANTASY_LOCATIONS.some(place => place.land === key) : !FANTASY_LOCATIONS.some(place => place.id === key)) return false;
      }
    }
  }
  if (character.bargains !== undefined) {
    if (!record(character.bargains)) return false;
    for (const [service, bargain] of Object.entries(character.bargains)) {
      if (!['room', 'food', 'goods'].includes(service) || !record(bargain) || Object.keys(bargain).length !== 4
        || !FANTASY_LOCATIONS.some(place => place.id === bargain.location) || typeof bargain.discount !== 'number' || !Number.isFinite(bargain.discount) || bargain.discount < 0 || bargain.discount > .2
        || typeof bargain.expiresAt !== 'number' || !Number.isFinite(bargain.expiresAt) || bargain.expiresAt < 0
        || typeof bargain.nextAt !== 'number' || !Number.isFinite(bargain.nextAt) || bargain.nextAt < 0 || bargain.nextAt > bargain.expiresAt) return false;
    }
  }
  return true;
}
