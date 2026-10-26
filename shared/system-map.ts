import type { SystemCatalog, SystemConnection, SystemInstance, SystemItemPlacement, SystemMap, SystemObject } from './system-types.ts';
import { systemCheck, systemId, validateSystemMap } from './systems.ts';

export function createSystemMap(id: string) {
  systemCheck(systemId(id), 'system map id');
  const map: SystemMap = { schema: 1, id, objects: [], systems: [], connections: [] };
  const builder = {
    object(value: SystemObject) { map.objects.push(structuredClone(value)); return builder; },
    item(value: SystemItemPlacement) {
      const placement = structuredClone(value);
      map.objects.push({ ...placement, itemMode: placement.itemMode ?? 'native', capabilities: placement.capabilities ?? [] });
      return builder;
    },
    system(value: SystemInstance) { map.systems.push(structuredClone(value)); return builder; },
    connect(value: SystemConnection) { map.connections.push(structuredClone(value)); return builder; },
    build(catalog?: SystemCatalog): SystemMap { if (catalog) validateSystemMap(map, catalog); return structuredClone(map); },
  };
  return builder;
}
