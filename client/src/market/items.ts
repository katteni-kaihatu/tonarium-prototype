import { ITEM_INFO, MARKET_PRODUCTS } from '../i18n/static.ts';
import { type ItemInfo, type ItemKind } from '../../../shared/items.ts';
import { useOwnedContent } from './store.ts';
import { ITEM_VARIANTS, type ItemVariant } from '../../../shared/item-variants.ts';
import { localizedVariantInfo, localizedVariantUsage } from '../items/metadata.ts';

export interface OwnedItem { id: string; kind: ItemKind; info: ItemInfo; creator: string; productId?: string; text?: string; variant?: ItemVariant; usage?: string }
export function useOwnedItems(): OwnedItem[] {
  const owned = useOwnedContent();
  return [
    ...(Object.keys(ITEM_INFO) as ItemKind[]).filter((kind) => !ITEM_INFO[kind].media && !MARKET_PRODUCTS.some(p => p.category === 'items' && p.kind === kind)).map((kind) => ({ id: kind, kind, info: ITEM_INFO[kind], creator: 'Tonarium' })),
    ...Object.values(ITEM_VARIANTS).map(definition => ({ id: definition.id, kind: definition.kind, variant: definition.id, creator: 'Tonarium',
      info: localizedVariantInfo(definition.id)!, usage: localizedVariantUsage(definition.id) })),
    ...MARKET_PRODUCTS.flatMap((p): OwnedItem[] => p.category === 'items' && owned.includes(p.id) ? [{
      id: p.id, kind: p.kind ?? 'note', creator: p.creator, productId: p.id, text: p.kind ? undefined : p.text,
      info: { ...ITEM_INFO[p.kind ?? 'note'], name: p.name, desc: p.kind ? ITEM_INFO[p.kind].desc : p.description, mark: p.mark, tint: p.color, ink: p.ink },
    }] : []),
  ];
}
