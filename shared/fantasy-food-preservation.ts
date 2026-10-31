import type { FantasyCharacter, FantasyFoodLot } from './fantasy.ts';
import { foodMeta } from './fantasy-life.ts';
import { fantasyPreservedFoodAllocation } from './fantasy-bags.ts';
import { fantasyArtifactEffects, type FantasyArtifactCarrier } from './fantasy-frontier-artifacts.ts';

export { FANTASY_PRESERVATION_BAG } from './fantasy-bag-configuration.ts';
export const FANTASY_FOOD_PRESERVATION_RATE = .1;

export function fantasyFoodLotAge(hour: number, lot: Pick<FantasyFoodLot, 'createdAt' | 'preservedHours'>): number {
  return Math.max(0, hour - lot.createdAt - (lot.preservedHours ?? 0));
}

// 経過区間だけを記録し、鞄の付け替えで過去の鮮度を戻さない。
export function advanceFantasyFoodPreservation(c: Pick<FantasyCharacter, 'bag' | 'magicBags' | 'inventory' | 'foodLots'> & FantasyArtifactCarrier, from: number, to: number): void {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from) return;
  const capacity = { ...fantasyPreservedFoodAllocation(c).counts };
  const lots = [...c.foodLots].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const ids = new Set(c.foodLots.map(lot => lot.id));
  const artifactRate = 1 - fantasyArtifactEffects(c).foodAgingReduction;
  for (const lot of lots) {
    const meta = foodMeta(lot.item); if (!meta || lot.count <= 0 || lot.createdAt >= to) continue;
    let selected = Math.min(lot.count, capacity[lot.item] ?? 0);
    capacity[lot.item] = Math.max(0, (capacity[lot.item] ?? 0) - selected);
    const start = Math.max(from, lot.createdAt, lot.preservationAt ?? lot.createdAt);
    if (start >= to) continue;
    const preserve = (food: FantasyFoodLot, rate: number) => {
      const age = fantasyFoodLotAge(start, food);
      const duration = rate < 1 && age < meta.shelfLife ? Math.min(to - start, (meta.shelfLife - age) / rate) : 0;
      food.preservedHours = (food.preservedHours ?? 0) + duration * (1 - rate);
      food.preservationAt = to;
    };
    if (selected > 0 && selected < lot.count) {
      if (c.foodLots.length < 1000) {
        let suffix = 0, id = `${lot.id.slice(0, 100)}-cold-${suffix}`;
        while (ids.has(id)) id = `${lot.id.slice(0, 100)}-cold-${++suffix}`;
        ids.add(id);
        const outside = { ...lot, id, count: lot.count - selected };
        preserve(outside, artifactRate);
        c.foodLots.push(outside); lot.count = selected;
      } else selected = 0;
    }
    preserve(lot, selected > 0 ? Math.min(FANTASY_FOOD_PRESERVATION_RATE, artifactRate) : artifactRate);
  }
}

export function validFantasyFoodPreservation(value: unknown, hour: number): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const lot = value as Record<string, unknown>;
  if (lot.preservedHours === undefined && lot.preservationAt === undefined) return true;
  return typeof lot.createdAt === 'number' && Number.isFinite(lot.createdAt) && lot.createdAt >= 0
    && typeof lot.preservedHours === 'number' && Number.isFinite(lot.preservedHours) && lot.preservedHours >= 0
    && typeof lot.preservationAt === 'number' && Number.isFinite(lot.preservationAt) && lot.preservationAt >= lot.createdAt && lot.preservationAt <= hour
    && lot.preservedHours <= (lot.preservationAt - lot.createdAt) * (1 - FANTASY_FOOD_PRESERVATION_RATE) + 1e-7;
}
