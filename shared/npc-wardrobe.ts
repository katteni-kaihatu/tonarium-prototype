import { FANTASY_LOCATIONS } from './fantasy-data.ts';
import type { NpcPublicProfile } from './npc.ts';

export type NpcDressCulture = 'western' | 'moon-wrap' | 'rain-hanbok' | 'caravan' | 'island-linen';
export type NpcDressClimate = 'cold' | 'hot' | 'humid' | 'temperate';
export function npcWardrobe(npc: Pick<NpcPublicProfile, 'homeLocation'>) {
  const place = FANTASY_LOCATIONS.find(place => place.id === npc.homeLocation);
  const land = place?.land ?? 'aurelia';
  const culture: NpcDressCulture = ({aurelia:'western',noctis:'moon-wrap',sylvara:'rain-hanbok',kazaran:'caravan',islands:'island-linen',frontier:'western'} as const)[land];
  const climate: NpcDressClimate = place?.kind === 'snow' || place?.kind === 'mountain' || ['mooncity', 'pinewatch'].includes(npc.homeLocation)
    ? 'cold' : land === 'kazaran' || place?.kind === 'desert' || place?.kind === 'volcano'
      ? 'hot' : land === 'sylvara' ? 'humid' : 'temperate';
  return {land,culture,climate,fabric:climate==='cold'?'lined-wool':climate==='hot'?'light-linen':climate==='humid'?'rain-weave':'linen-and-wool'};
}
