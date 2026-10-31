import type { FantasyCharacter } from './fantasy.ts';
import { FANTASY_BAGS } from './fantasy-bag-catalog.ts';

export const FANTASY_PRESERVATION_BAG = 'preserve-magic-bag';
type Configuration = Pick<FantasyCharacter, 'bag' | 'magicBags'>;

export function fantasyNormalBagId(c: Configuration): string {
  return FANTASY_BAGS.some(bag => bag.id === c.bag && bag.kind === 'basic') ? c.bag! : 'starter-pack';
}
export function fantasyEquippedMagicBags(c: Configuration): string[] {
  if (Array.isArray(c.magicBags)) return [...c.magicBags];
  return FANTASY_BAGS.some(bag => bag.id === c.bag && bag.kind === 'magic') ? [c.bag!] : [];
}

// 保存袋の食品枠は、普通の品物の追加容量に使わない。
export function fantasyFoodStorageAllocation(inventory: Readonly<Record<string, number>>, bags: readonly string[], foodIds: ReadonlySet<string>, weightOf: (item: string) => number) {
  const counts: Record<string, number> = {}, types = new Set<string>(); let weight = 0;
  for (const bag of bags) {
    const storage = FANTASY_BAGS.find(entry => entry.id === bag && entry.id === FANTASY_PRESERVATION_BAG); if (!storage) continue;
    let remaining = storage.weightLimit, slots = storage.slotLimit;
    for (const item of Object.keys(inventory).sort()) {
      const count = inventory[item] - (counts[item] ?? 0), unitWeight = weightOf(item);
      if (!foodIds.has(item) || !Number.isSafeInteger(count) || count < 1 || slots < 1 || !Number.isFinite(unitWeight) || unitWeight <= 0) continue;
      const stored = Math.min(count, Math.floor(remaining / unitWeight)); if (stored < 1) continue;
      counts[item] = (counts[item] ?? 0) + stored; remaining -= stored * unitWeight; weight += stored * unitWeight; slots--; types.add(item);
    }
  }
  return { counts, weight, slots: types.size };
}
