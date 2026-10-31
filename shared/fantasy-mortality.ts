import type { FantasyCharacter, FantasyProfile } from './fantasy.ts';
import { FANTASY_LOCATIONS, FANTASY_ROUTES } from './fantasy-data.ts';
import { FANTASY_SETTLEMENTS } from './fantasy-town.ts';
export { validFantasyLifeProfile } from './fantasy-progression.ts';

export function fantasyRescueTown(character: FantasyCharacter, atSea = false, companion = false): string | undefined {
  const place = FANTASY_LOCATIONS.find(place => place.id === character.location);
  if (!place || atSea || ['cave', 'island'].includes(place.kind) || place.danger >= 3) return undefined;
  if (FANTASY_SETTLEMENTS[place.id]) return place.id;
  const adjacent = FANTASY_ROUTES.filter(route => route.mode === 'land' && route.hours <= 2 && (route.from === place.id || route.to === place.id)).sort((a, b) => a.hours - b.hours);
  const near = adjacent.map(route => route.from === place.id ? route.to : route.from).find(id => FANTASY_SETTLEMENTS[id]);
  if (near || !companion) return near;
  const queue = [place.id], seen = new Set(queue);
  while (queue.length) {
    const current = queue.shift()!;
    if (FANTASY_SETTLEMENTS[current]) return current;
    for (const route of FANTASY_ROUTES.filter(route => route.mode === 'land' && (route.from === current || route.to === current))) {
      const id = route.from === current ? route.to : route.from;
      if (!seen.has(id)) { seen.add(id); queue.push(id); }
    }
  }
  return undefined;
}

export function recordFantasyDeath(profile: FantasyProfile, cause: string, atSea = false): void {
  const c = profile.character;
  if (!c || profile.death) return;
  profile.generation ??= 1;
  const location = atSea ? 'sea' : c.location;
  profile.death = { location, hour: c.hour, cause: cause.slice(0, 160) };
  c.hp = 0; profile.event = null; delete profile.activity; delete c.lastDawnPledge; delete c.carrying; delete c.returnLantern;
  profile.pastLives ??= [];
  profile.pastLives.push({ generation: profile.generation, name: c.name, race: c.race, job: c.job, level: c.level,
    hour: c.hour, location, cause: profile.death.cause, visited: [...c.visited], completed: [...c.completed], jobXp: { ...c.jobXp },
    ...(c.reputation ? { reputation: structuredClone(c.reputation) } : {}), ageHours: Math.max(0, c.hour - (c.lifeStartedAt ?? 8)),
  });
}

export function fantasyActivityAtSea(profile: FantasyProfile): boolean {
  const action = profile.activity?.action;
  if (action?.type === 'fish') return action.mode === 'sea';
  if (action?.type === 'travel' && ['ship', 'working-ship'].includes(action.transport)) return true;
  if (action?.type !== 'travel' || !profile.character || ['foot', 'carriage', 'gate'].includes(action.transport)) return false;
  const from = profile.character.location;
  const reachable = new Set([from]), pending = [from];
  while (pending.length) {
    const current = pending.shift()!;
    for (const route of FANTASY_ROUTES.filter(route => route.mode === 'land' && (route.from === current || route.to === current))) {
      const id = route.from === current ? route.to : route.from;
      if (!reachable.has(id)) { reachable.add(id); pending.push(id); }
    }
  }
  return !reachable.has(action.destination);
}
