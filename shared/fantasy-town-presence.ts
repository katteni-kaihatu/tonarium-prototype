import { FANTASY_LOCATIONS } from './fantasy-data.ts';

export interface FantasyTownCandidate {
  id: string; name: string; session: string | null; location: string;
  online: boolean; alive: boolean; travelling: boolean;
  downed?:boolean;
}
export interface FantasyTownPresence {
  location: string | null;
  players: { id: string; name: string;downed?:boolean }[];
}
export function fantasyTownPresence(viewer: FantasyTownCandidate | undefined, candidates: FantasyTownCandidate[]): FantasyTownPresence {
  if (!viewer?.online || !viewer.alive || viewer.travelling || !viewer.session || !FANTASY_LOCATIONS.some(place => place.id === viewer.location && (place.kind === 'city' || place.services.includes('inn')))) return { location: null, players: [] };
  const unique = new Map<string, { id: string; name: string;downed?:boolean }>();
  for (const candidate of candidates) if (candidate.online && candidate.alive && !candidate.travelling && candidate.session === viewer.session && candidate.location === viewer.location) unique.set(candidate.id, { id: candidate.id, name: candidate.name,...(candidate.downed?{downed:true}:{}) });
  return { location: viewer.location, players: [...unique.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}
