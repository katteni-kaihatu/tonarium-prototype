import { createItem, type Item, type ItemMapPlacement } from '../shared/items.ts';
import { systemItemDefinition, systemItemInstanceId } from '../shared/system-items.ts';
import type { SystemView } from '../shared/system-types.ts';

export function isSystemControlledItem(item: Item): boolean { return item.mapPlacement?.mode === 'system'; }

export interface SystemItemChanges {
  items: Map<string, Item>;
  changed: Item[];
  removed: string[];
}

export function reconcileSystemItems(current: ReadonlyMap<string, Item>, view: SystemView, options: { createMissingNative?: boolean } = {}, rng = Math.random): SystemItemChanges {
  const planned = view.map.objects.filter(object => object.itemId !== undefined).map(object => {
    const definition = systemItemDefinition(object.itemId);
    if (!definition) throw new Error(`Unknown map item: ${object.itemId}`);
    const id = systemItemInstanceId(view.map.id, object.id), existing = current.get(id);
    if (existing && (!existing.mapPlacement || existing.mapPlacement.mapId !== view.map.id || existing.mapPlacement.objectId !== object.id)) throw new Error(`Map item identity conflict: ${id}`);
    const mode = object.itemMode ?? 'native';
    const placement: ItemMapPlacement = { mapId: view.map.id, objectId: object.id, itemId: definition.id, mode, position: [...object.position], rotation: object.rotation ?? 0 };
    return { id, object, definition, existing, placement };
  });
  const wanted = new Set(planned.map(item => item.id));
  if (wanted.size !== planned.length) throw new Error('Duplicate map item identity');
  const items = new Map(current), changed: Item[] = [], removed: string[] = [];
  for (const [id, item] of current) if (item.mapPlacement && !wanted.has(id)) { items.delete(id); removed.push(id); }
  for (const { id, object, definition, existing, placement } of planned) {
    if (!existing && placement.mode === 'native' && options.createMissingNative === false) continue;
    const sameAsset = existing?.kind === definition.kind && existing.mapPlacement?.itemId === definition.id && existing.mapPlacement.mode === placement.mode
      && (existing.kind === 'camera' ? existing.variant : undefined) === definition.variant;
    const sourceChanged = !existing?.mapPlacement || JSON.stringify(existing.mapPlacement.position) !== JSON.stringify(placement.position) || existing.mapPlacement.rotation !== placement.rotation;
    if (sameAsset && placement.mode === 'native' && !sourceChanged) continue;
    const next = sameAsset ? structuredClone(existing) : createItem(definition.kind, { id, x: object.position[0], z: object.position[2], ry: placement.rotation, createdBy: 'system-map', ...(definition.variant ? { variant: definition.variant } : {}) }, rng);
    if (!next) throw new Error(`Map item could not be created: ${definition.id}`);
    if (!sameAsset && next.kind === 'note') next.text = object.text ?? next.text;
    if (placement.mode === 'system') {
      const value = view.objects[object.id];
      if (!value) throw new Error(`Map item state unavailable: ${object.id}`);
      next.x = value.position[0]; next.z = value.position[2]; next.ry = placement.rotation;
      if (next.kind === 'note') next.text = value.text ?? object.text ?? next.text;
    } else if (sourceChanged) {
      next.x = object.position[0]; next.z = object.position[2]; next.ry = placement.rotation;
      if (next.kind === 'bike') { next.rider = null; next.speed = 0; next.heading = placement.rotation; next.roll = 0; next.steer = 0; next.slipping = false; next.remainder = 0; next.rideVersion++; }
    }
    next.mapPlacement = placement;
    if (!existing || JSON.stringify(existing) !== JSON.stringify(next)) { items.set(id, next); changed.push(next); }
  }
  return { items, changed, removed };
}
