import type { Item } from '../../../shared/items.ts';

export function imageItemCreator(item: Item, users: readonly { id: string; name: string }[]): string | undefined {
  if (item.kind !== 'image') return undefined;
  return users.find((u) => u.id === item.createdBy)?.name.trim() || item.createdByName?.trim() || undefined;
}
