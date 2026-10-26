import { systemDemoMap } from '../shared/system-demo.ts';
import { cameraTimerDemoMap } from '../shared/camera-timer-demo.ts';
import type { SystemMap } from '../shared/system-types.ts';

export const systemMaps = new Map<string, SystemMap>([[systemDemoMap.id, systemDemoMap], [cameraTimerDemoMap.id, cameraTimerDemoMap]]);
