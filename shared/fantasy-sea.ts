import type { FantasyCharacter, FantasyTravelPosition } from './fantasy.ts';
import { FANTASY_ROUTES } from './fantasy-data.ts';

// 乗船済みの海路だけを海戦にし、港や飛空艇の位置を流用しない。
export function fantasySeaPosition(c: Pick<FantasyCharacter,'travelPosition'>): FantasyTravelPosition | undefined {
  const p=c.travelPosition;
  if(!p||p.from===p.to||!Number.isFinite(p.fraction)||p.fraction<=1e-8||p.fraction>=1||p.transport!==undefined&&!['ship','working-ship'].includes(p.transport))return;
  return FANTASY_ROUTES.some(route=>route.mode==='sea'&&(route.from===p.from&&route.to===p.to||route.from===p.to&&route.to===p.from))?p:undefined;
}
