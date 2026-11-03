import type { Item } from '../../../shared/items.ts';

export function windowKeyOf(item: Item, camFeeds: Record<string, number>) {
  if (item.mapPlacement?.mode === 'system') return `item:${item.id}`;
  if (item.kind === 'hammer') return null;
  if (item.kind === 'camera') return item.live && camFeeds[item.id] ? `cam:${item.id}` : null;
  return `item:${item.id}`;
}
