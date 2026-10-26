import { createSystemMap } from './system-map.ts';
import { systemItemInstanceId } from './system-items.ts';
import type { Item } from './items.ts';
import type { SystemMap, SystemView } from './system-types.ts';

const mapId = 'camera-timer-demo', cameraObjectId = 'delayed-camera';

export const cameraTimerDemoMap = createSystemMap('camera-timer-demo')
  .item({ id: 'delayed-camera', itemId: 'camera', itemMode: 'system', capabilities: ['interact'], position: [0, 0, -2], rotation: Math.PI })
  .system({ instanceId: 'camera-shot', systemId: 'camera-trigger', bindings: { camera: ['delayed-camera'] }, config: {} })
  .system({ instanceId: 'camera-delay', systemId: 'timer', bindings: {}, config: { duration: 5 } })
  .connect({ from: 'camera-shot', output: 'reset', to: 'camera-delay', input: 'reset' })
  .connect({ from: 'camera-shot', output: 'start', to: 'camera-delay', input: 'start' })
  .connect({ from: 'camera-delay', output: 'finished', to: 'camera-shot', input: 'complete' })
  .build();

export function isCameraTimerItem(item: Item): boolean {
  const placement = item.mapPlacement;
  return item.kind === 'camera' && item.id === systemItemInstanceId(mapId, cameraObjectId)
    && placement?.mapId === mapId && placement.objectId === cameraObjectId
    && placement.itemId === 'camera' && placement.mode === 'system';
}

export function cameraTimerRemoval(view: SystemView, item: Item): SystemMap | undefined {
  if (!isCameraTimerItem(item) || view.map.id !== mapId || !Object.hasOwn(view.objects, cameraObjectId)
    || !view.map.objects.some(object => object.id === cameraObjectId && object.itemId === 'camera' && object.itemMode === 'system')) return;
  const map = structuredClone(view.map), removed = new Set(['camera-shot', 'camera-delay']);
  map.objects = map.objects.filter(object => object.id !== cameraObjectId);
  map.systems = map.systems.filter(system => !removed.has(system.instanceId));
  map.connections = map.connections.filter(connection => !removed.has(connection.from) && !removed.has(connection.to));
  return map;
}
