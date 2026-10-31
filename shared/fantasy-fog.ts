import type { FantasyLocation } from './fantasy.ts';
import type { FantasyJourneyView } from './fantasy-journey.ts';
import { FANTASY_LOCATIONS, FANTASY_ROUTES } from './fantasy-data.ts';
import { fantasyJourneyPoint } from './fantasy-journey.ts';
import { FANTASY_MAINLAND_COASTS } from './fantasy-map-geometry.ts';

export type FantasyFogPlace = Pick<FantasyLocation, 'id' | 'x' | 'y' | 'land'>;
export interface FantasyFogReveal {
  circles: FantasyFogPlace[];
  triangles: FantasyFogPlace[][];
  connections: FantasyFogPlace[][];
  coasts: { land: FantasyFogPlace['land']; points: { x: number; y: number }[]; complete: boolean }[];
  trails: { x: number; y: number }[][];
}
interface Mesh { triangles: FantasyFogPlace[][]; connections: FantasyFogPlace[][] }
const meshes = new WeakMap<readonly FantasyFogPlace[], Mesh>();
const squareDistance = (a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const MAX_LOCAL_EDGE = 320;
function localMesh(places: readonly FantasyFogPlace[]): Mesh {
  const cached = meshes.get(places);
  if (cached) return cached;
  const triangles: FantasyFogPlace[][] = [], connections: FantasyFogPlace[][] = [];
  for (const land of ['aurelia', 'noctis', 'sylvara', 'kazaran', 'frontier']) {
    const nodes = places.filter(place => place.land === land);
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j], edge = squareDistance(a, b);
      if (edge > MAX_LOCAL_EDGE ** 2 || edge < 1e-8) continue;
      const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (!nodes.some(other => other !== a && other !== b && squareDistance(middle, other) < edge / 4 - 1e-6)) connections.push([a, b]);
      for (let k = j + 1; k < nodes.length; k++) {
        const c = nodes[k];
        if (squareDistance(a, c) > MAX_LOCAL_EDGE ** 2 || squareDistance(b, c) > MAX_LOCAL_EDGE ** 2) continue;
        const determinant = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
        if (Math.abs(determinant) < 1e-8) continue;
        const aa = a.x ** 2 + a.y ** 2, bb = b.x ** 2 + b.y ** 2, cc = c.x ** 2 + c.y ** 2;
        const center = {
          x: (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / determinant,
          y: (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / determinant,
        };
        const radius = squareDistance(center, a);
        if (!nodes.some(other => other !== a && other !== b && other !== c && squareDistance(center, other) < radius - 1e-6)) triangles.push([a, b, c]);
      }
    }
  }
  const mesh = { triangles, connections }; meshes.set(places, mesh);
  return mesh;
}
type Point = { x: number; y: number };
const projection = (point: Point, a: Point, b: Point): Point => {
  const length = squareDistance(a, b);
  const fraction = length ? Math.max(0, Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / length)) : 0;
  return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
};
const side = (p: Point, a: Point, b: Point) => (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
function coastalReveal(visited: readonly FantasyFogPlace[], mesh: Mesh): FantasyFogReveal['coasts'] {
  const areas: FantasyFogReveal['coasts'] = [];
  for (const [land, outline] of Object.entries(FANTASY_MAINLAND_COASTS)) {
    const nodes = visited.filter(point => point.land === land);
    if (!nodes.length) continue;
    const triangles = mesh.triangles.filter(points => points[0].land === land);
    const edges = [...mesh.connections.filter(points => points[0].land === land), ...triangles.flatMap(points => [[points[0], points[1]], [points[1], points[2]], [points[2], points[0]]])];
    const closest = (point: Point): Point => {
      for (const [a, b, c] of triangles) {
        const signs = [side(point, a, b), side(point, b, c), side(point, c, a)];
        if (!(signs.some(value => value < -1e-6) && signs.some(value => value > 1e-6))) return point;
      }
      const candidates: Point[] = [...nodes, ...edges.map(([a, b]) => projection(point, a, b))];
      return candidates.reduce((best, candidate) => squareDistance(point, candidate) < squareDistance(point, best) ? candidate : best);
    };
    const shore = outline.flatMap((a, index) => {
      const b = outline[(index + 1) % outline.length], steps = Math.ceil(Math.sqrt(squareDistance(a, b)) / 24);
      return Array.from({ length: steps }, (_, step) => ({ x: a.x + (b.x - a.x) * step / steps, y: a.y + (b.y - a.y) * step / steps }));
    }).map(point => { const anchor = closest(point); return { point, anchor, covered: squareDistance(point, anchor) <= 190 ** 2 }; });
    if (shore.every(sample => sample.covered)) {
      areas.push({ land: land as FantasyFogPlace['land'], points: [...outline], complete: true });
      continue;
    }
    const start = shore.findIndex(sample => !sample.covered);
    let run: typeof shore = [];
    const flush = () => {
      if (run.length > 1) areas.push({ land: land as FantasyFogPlace['land'], points: [...run.map(sample => sample.point), ...run.map(sample => sample.anchor).reverse()], complete: false });
      run = [];
    };
    // 海岸に届いた部分だけ陸側の探索領域へつなぎ、遠い海を開かない。
    for (let offset = 1; offset <= shore.length; offset++) {
      const sample = shore[(start + offset) % shore.length];
      if (sample.covered) run.push(sample); else flush();
    }
  }
  return areas;
}
function travelledTrails(journey: FantasyJourneyView | undefined, places: readonly FantasyFogPlace[]): FantasyFogReveal['trails'] {
  if (!journey || !Number.isFinite(journey.hour)) return [];
  const nodes = new Map(places.map(place => [place.id, place]));
  if (journey.travel?.legs.length) {
    const trails: FantasyFogReveal['trails'] = [];
    let elapsed = Math.max(0, Math.min(journey.hour, journey.endsAt) - journey.startedAt);
    for (const leg of journey.travel.legs) {
      const from = nodes.get(leg.from), to = nodes.get(leg.to);
      if (!(leg.hours > 0) || !Number.isFinite(leg.hours)) break;
      const fraction = Math.max(0, Math.min(1, elapsed / leg.hours)), start = leg.startFraction ?? 0;
      const point = (progress: number) => ({ x: from!.x + (to!.x - from!.x) * progress, y: from!.y + (to!.y - from!.y) * progress });
      if (fraction > 0 && from && to && leg.transport !== 'gate' && Number.isFinite(start)) trails.push([point(start), point(start + (1 - start) * fraction)]);
      elapsed -= leg.hours;
      if (elapsed <= 0) break;
    }
    return trails;
  }
  const moving = fantasyJourneyPoint(journey);
  if (!moving || moving.progress <= 0) return [];
  return moving.completed.slice(1).flatMap((point, index) => {
    const from = journey.path[index], to = journey.path[index + 1];
    const gate = FANTASY_ROUTES.some(route => route.mode === 'gate' && (route.from === from && route.to === to || route.from === to && route.to === from));
    const physical = FANTASY_ROUTES.some(route => route.mode !== 'gate' && (route.from === from && route.to === to || route.from === to && route.to === from));
    return gate && !physical ? [] : [[moving.completed[index], point]];
  });
}
export function fantasyFogReveal(known: readonly string[], visited: readonly string[], journey?: FantasyJourneyView, places: readonly FantasyFogPlace[] = FANTASY_LOCATIONS): FantasyFogReveal {
  const knownIds = new Set(known), visitedIds = new Set(visited), explored = places.filter(place => visitedIds.has(place.id)), mesh = localMesh(explored);
  return {
    circles: places.filter(place => knownIds.has(place.id)),
    triangles: mesh.triangles.filter(triangle => triangle.every(place => visitedIds.has(place.id))),
    connections: mesh.connections.filter(connection => connection.every(place => visitedIds.has(place.id))),
    coasts: coastalReveal(explored, mesh),
    trails: travelledTrails(journey, places),
  };
}
