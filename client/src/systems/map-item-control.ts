import type { Item } from '../../../shared/items.ts';
import type { SystemObject, SystemView } from '../../../shared/system-types.ts';
import { systemItemInstanceId } from '../../../shared/system-items.ts';

export function controlledItemObject(item: Item, session: string | null, state: { sid: string; view?: SystemView }): SystemObject | undefined {
  const placement = item.mapPlacement;
  if (placement?.mode !== 'system' || !session || state.sid !== session || state.view?.map.id !== placement.mapId) return;
  try { if (item.id !== systemItemInstanceId(placement.mapId, placement.objectId)) return; } catch { return; }
  return state.view.map.objects.find(object => object.id === placement.objectId && object.itemId === placement.itemId && object.itemMode === 'system');
}
