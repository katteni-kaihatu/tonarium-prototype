import type { FantasyBusiness } from '../shared/fantasy-business.ts';
import { fantasyWarehouseItem } from '../shared/fantasy-business.ts';
import type { FantasyCookingStock } from '../shared/fantasy-cooking.ts';
import { foodMeta } from '../shared/fantasy-life.ts';

export function fantasyCookingWarehouse(business: FantasyBusiness) {
  const inventory = Object.fromEntries(Object.entries(business.inventory).filter(([item]) => fantasyWarehouseItem(item)));
  const foodLots: FantasyCookingStock['foodLots'] = [];
  const portions: { parcel: number; lot: number; key: string; count: number }[] = [];
  for (const [parcel, { goods }] of (business.parcels ?? []).entries()) {
    if (!goods.food || goods.gear || goods.interiorMap || !foodMeta(goods.item)) continue;
    for (const [lot, source] of goods.food.entries()) {
      // 荷包みをまたぐ同じロットIDも、元の荷包みへ正確に戻す。
      const key = `warehouse-${parcel}-${lot}`;
      foodLots.push({ ...source, id: key });
      portions.push({ parcel, lot, key, count: source.count });
      inventory[source.item] = (inventory[source.item] ?? 0) + source.count;
    }
  }
  const stock: FantasyCookingStock = { inventory, foodLots };
  const originalInventory = { ...inventory };
  return {
    stock,
    remaining(): FantasyBusiness {
      const next = structuredClone(business);
      for (const [item, count] of Object.entries(next.inventory)) {
        if (!Object.hasOwn(originalInventory, item)) continue;
        const left = stock.inventory[item] ?? 0;
        if (!Number.isSafeInteger(left) || left < 0 || left > count) throw new Error('Invalid remaining cooking warehouse inventory');
        if (left) next.inventory[item] = left;
        else delete next.inventory[item];
      }
      const remaining = new Map(stock.foodLots.map(lot => [lot.id, lot.count]));
      for (const portion of portions) {
        const left = remaining.get(portion.key) ?? 0;
        if (!Number.isSafeInteger(left) || left < 0 || left > portion.count) throw new Error('Invalid remaining cooking warehouse food');
        const goods = next.parcels![portion.parcel].goods;
        goods.food![portion.lot].count = left;
        goods.count -= portion.count - left;
      }
      if (next.parcels) next.parcels = next.parcels.filter(parcel => {
        if (parcel.goods.food) parcel.goods.food = parcel.goods.food.filter(lot => lot.count > 0);
        return parcel.goods.count > 0;
      });
      return next;
    },
  };
}
