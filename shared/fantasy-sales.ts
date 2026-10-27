import type { FantasyCharacter, FantasyFoodLot } from './fantasy.ts';
import { FANTASY_ITEMS } from './fantasy-data.ts';
import { FANTASY_MAPS, canSellItem } from './fantasy-town.ts';
import { foodMeta, type FantasyFoodQuality } from './fantasy-life.ts';
import { fantasySpendItem } from './fantasy-equipment.ts';

type Locale = 'ko' | 'en' | 'ja';
export type FantasySaleReason = 'location' | 'equipped' | 'spoiled';
export interface FantasySaleGroup {
  key: string; item: string; quality?: FantasyFoodQuality; instance?: string; count: number; unitPrice: number;
  canSell: boolean; reason?: FantasySaleReason; gearQuality?: number;
}
export interface FantasySaleSelection { item: string; quality?: FantasyFoodQuality; instance?: string }
const REASONS: Record<FantasySaleReason, Record<Locale, string>> = {
  location: { ko: '현재 장소에는 이 물건을 사 주는 상점이 없습니다.', en: 'No shop here buys this item.', ja: '現在地にはこの品物を買い取る店がありません。' },
  equipped: { ko: '착용 중인 물건은 먼저 해제해야 합니다.', en: 'Unequip this item before selling it.', ja: '装着中の品物は先に外してください。' },
  spoiled: { ko: '상한 음식은 판매할 수 없습니다.', en: 'Spoiled food cannot be sold.', ja: '傷んだ食品は売却できません。' },
};
const data = (item: string) => {
  const entry = FANTASY_ITEMS.find(entry => entry.id === item), map = FANTASY_MAPS.find(map => map.item === item);
  return entry ? { price: entry.price, name: entry.name } : map ? { price: map.price, name: map.name.ja } : undefined;
};
export function fantasySaleBasePrice(item: string): number {
  const entry = data(item);
  return entry ? Math.max(1, Math.floor(entry.price * .5)) : 0;
}
export function fantasyFoodLotQuality(character: Pick<FantasyCharacter, 'hour'>, lot: FantasyFoodLot): FantasyFoodQuality | undefined {
  const meta = foodMeta(lot.item);
  if (!meta) return undefined;
  const age = Math.max(0, character.hour - lot.createdAt);
  return age > meta.shelfLife ? 'spoiled' : age >= meta.shelfLife * .65 ? 'stale' : 'fresh';
}
export function fantasySaleDisabledReason(group: Pick<FantasySaleGroup, 'reason'>, locale: Locale = 'ja'): string | undefined {
  return group.reason ? REASONS[group.reason][locale] : undefined;
}

export function fantasySaleGroups(character: FantasyCharacter, onlyItem?: string): FantasySaleGroup[] {
  const result: FantasySaleGroup[] = [];
  const equipped = new Set(Object.values(character.equippedGear ?? {}));
  for (const [item, count] of Object.entries(character.inventory)) {
    if (onlyItem !== undefined && onlyItem !== item || count < 1 || !data(item)) continue;
    const base = fantasySaleBasePrice(item), local = canSellItem(character, item);
    const make = (group: Omit<FantasySaleGroup, 'item' | 'unitPrice' | 'canSell'> & { unitPrice?: number }) => {
      const unitPrice = group.unitPrice ?? base;
      const reason = !local ? 'location' : group.reason;
      result.push({ ...group, item, unitPrice, canSell: !reason && unitPrice > 0, ...(reason ? { reason } : {}) });
    };
    if (foodMeta(item)) {
      for (const quality of ['fresh', 'stale', 'spoiled'] as const) {
        const lots = character.foodLots.filter(lot => lot.item === item && lot.count > 0 && fantasyFoodLotQuality(character, lot) === quality);
        const amount = lots.reduce((sum, lot) => sum + lot.count, 0);
        if (amount) make({ key: `${item}:food:${quality}`, quality, count: amount, unitPrice: quality === 'spoiled' ? 0 : quality === 'stale' ? Math.max(1, Math.floor(base * .5)) : base, ...(quality === 'spoiled' ? { reason: 'spoiled' } : {}) });
      }
      continue;
    }
    const gear = (character.gear ?? []).filter(instance => instance.item === item);
    for (const instance of gear) make({ key: `${item}:gear:${instance.id}`, instance: instance.id, count: 1, gearQuality: instance.quality, ...(equipped.has(instance.id) ? { reason: 'equipped' } : {}) });
    const plain = Math.max(0, count - gear.length);
    const wornPlain = character.outfit === item || Object.entries(character.equipment ?? {}).some(([slot, value]) => value === item && !character.equippedGear?.[slot as keyof NonNullable<FantasyCharacter['equippedGear']>]);
    if (plain > 0) make({ key: `${item}:plain`, count: plain, ...(wornPlain && plain === 1 ? { reason: 'equipped' } : {}) });
  }
  return result;
}

export function fantasySell(character: FantasyCharacter, selection: FantasySaleSelection): { price: number; name: string; quality?: FantasyFoodQuality; instance?: string; error?: string } {
  const item = data(selection.item), fail = (error: string) => ({ price: 0, name: item?.name ?? selection.item, error });
  if (!item) return fail('品物が見つかりません。');
  if (!canSellItem(character, selection.item)) return fail(REASONS.location.ja);
  if ((character.inventory[selection.item] ?? 0) < 1) return fail('その品物を持っていません。');
  const food = foodMeta(selection.item);
  if (food) {
    if (selection.instance) return fail('食品の個体ではなく、売却する状態のまとまりを選んでください。');
    const groups = fantasySaleGroups(character, selection.item);
    const selected = selection.quality ? groups.find(group => group.quality === selection.quality) : groups.length === 1 ? groups[0] : undefined;
    if (!selected) return fail('売却する食品の状態を選んでください。');
    if (!selected.canSell) return fail(fantasySaleDisabledReason(selected)!);
    const lot = character.foodLots.filter(lot => lot.item === selection.item && lot.count > 0 && fantasyFoodLotQuality(character, lot) === selected.quality).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0];
    if (!lot) return fail('選んだ状態の食品がありません。');
    lot.count--;
    character.foodLots = character.foodLots.filter(lot => lot.count > 0);
    character.inventory[selection.item]--;
    character.gold += selected.unitPrice;
    return { price: selected.unitPrice, name: item.name, quality: selected.quality };
  }
  if (selection.quality) return fail('この品物には食品の状態を指定できません。');
  const selected = selection.instance ? fantasySaleGroups(character, selection.item).find(group => group.instance === selection.instance) : undefined;
  if (selection.instance && (!selected || !selected.canSell)) return fail(selected ? fantasySaleDisabledReason(selected)! : '指定した装備の個体を持っていません。');
  if (!fantasySpendItem(character, selection.item, 1, selection.instance)) return fail(REASONS.equipped.ja);
  const price = selected?.unitPrice ?? fantasySaleBasePrice(selection.item);
  character.gold += price;
  return { price, name: item.name, ...(selection.instance ? { instance: selection.instance } : {}) };
}
