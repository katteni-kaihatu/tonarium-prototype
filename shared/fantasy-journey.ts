import { FANTASY_LOCATIONS } from './fantasy-data.ts';
import type { FantasyTravelState } from './fantasy.ts';
import { fantasyTravelPoint, fantasyTravelPosition } from './fantasy-travel.ts';
export interface FantasyJourneyView { path: string[]; startedAt: number; endsAt: number; hour: number; name: string; travel?: FantasyTravelState }
export function fantasyJourneyPoint(journey: FantasyJourneyView) {
  if (journey.travel?.legs.length) {
    const first = fantasyTravelPosition(journey, journey.startedAt), position = fantasyTravelPosition(journey, journey.hour);
    const start = first && fantasyTravelPoint(first), point = position && fantasyTravelPoint(position);
    if (!start || !point) return undefined;
    const endpoints = journey.travel.legs.flatMap(leg => { const place = FANTASY_LOCATIONS.find(place => place.id === leg.to); return place ? [{ x: place.x, y: place.y }] : []; });
    const points = [start, ...endpoints], completed = [start];
    let elapsed = Math.max(0, journey.hour - journey.startedAt);
    for (const [index, leg] of journey.travel.legs.entries()) {
      if (elapsed < leg.hours - 1e-8) break;
      completed.push(endpoints[index]); elapsed -= leg.hours;
    }
    if (completed.at(-1)?.x !== point.x || completed.at(-1)?.y !== point.y) completed.push(point);
    const progress = Math.max(0, Math.min(1, (journey.hour - journey.startedAt) / Math.max(.001, journey.endsAt - journey.startedAt)));
    return { point, points, completed, progress };
  }
  const points = journey.path.flatMap(id => { const place = FANTASY_LOCATIONS.find(place => place.id === id); return place ? [{ x: place.x, y: place.y }] : []; });
  if (!points.length) return undefined;
  const progress = Math.max(0, Math.min(1, (journey.hour - journey.startedAt) / Math.max(.001, journey.endsAt - journey.startedAt)));
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let distance = total * progress;
  const completed = [points[0]];
  for (let index = 0; index < lengths.length; index++) {
    if (distance <= lengths[index]) {
      const fraction = lengths[index] ? distance / lengths[index] : 1;
      const point = { x: points[index].x + (points[index + 1].x - points[index].x) * fraction, y: points[index].y + (points[index + 1].y - points[index].y) * fraction };
      return { point, points, completed: [...completed, point], progress };
    }
    distance -= lengths[index]; completed.push(points[index + 1]);
  }
  return { point: points.at(-1)!, points, completed: points, progress };
}
