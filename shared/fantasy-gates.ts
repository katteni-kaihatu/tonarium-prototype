export const FANTASY_GATE_SETTLEMENTS = Object.freeze([
  'hearth', 'suncourt', 'mooncity', 'inkstone-city', 'canopy-hall', 'loom-village', 'redweave', 'sunloom',
] as const);
export const FANTASY_GATE_HOURS = .25;
export const fantasyHasGate = (location: string): boolean => FANTASY_GATE_SETTLEMENTS.some(id => id === location);
export function fantasyGateFare(routeHours: number, ordinaryFares: readonly number[] = []): number {
  const distance = Number.isFinite(routeHours) ? Math.max(0, routeHours) : 0;
  return Math.max(120 + Math.ceil(distance * 8), ...ordinaryFares.filter(fare => Number.isFinite(fare) && fare >= 0).map(fare => Math.ceil(fare) + 80));
}
