import { ITEM_INFO, type ItemInfo, type ItemKind } from './items.ts';
import { MARKET_PRODUCTS } from './market.ts';
import { ITEM_VARIANTS, type ItemVariant } from './item-variants.ts';

export interface SystemItemDefinition {
  id: string;
  kind: ItemKind;
  info: ItemInfo;
  variant?: ItemVariant;
}

export function systemItemDefinitions(): SystemItemDefinition[] {
  const basics: SystemItemDefinition[] = (Object.keys(ITEM_INFO) as ItemKind[])
    .filter(kind => !ITEM_INFO[kind].media && !MARKET_PRODUCTS.some(product => product.category === 'items' && (product.id === kind || product.kind === kind)))
    .map(kind => ({ id: kind, kind, info: { ...ITEM_INFO[kind] } }));
  return [...basics, ...Object.values(ITEM_VARIANTS).filter(entry => !entry.info.media && !MARKET_PRODUCTS.some(product => product.category === 'items' && product.id === entry.id))
    .map(entry => ({ id: entry.id, kind: entry.kind, variant: entry.id, info: { ...entry.info } }))];
}

export function systemItemDefinition(itemId: unknown): SystemItemDefinition | undefined {
  return typeof itemId === 'string' ? systemItemDefinitions().find(definition => definition.id === itemId) : undefined;
}

export function systemItemInstanceId(mapId: string, objectId: string): string {
  const stableId = (value: string) => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value) && !['constructor', 'prototype'].includes(value);
  if (!stableId(mapId) || !stableId(objectId)) throw new Error('system item map/object identity');
  return `system-map:${mapId}:${objectId}`;
}
