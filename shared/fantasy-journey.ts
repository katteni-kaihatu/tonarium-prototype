import { FANTASY_LOCATIONS } from './fantasy-data.ts';
export interface FantasyJourneyView { path: string[]; startedAt: number; endsAt: number; hour: number; name: string }
export function fantasyJourneyPoint(journey: FantasyJourneyView) {
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
