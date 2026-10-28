import type * as THREE from 'three';
import { validTracking } from './pose.ts';

type Transform = Parameters<typeof validTracking>[0];

export class ControllerInput {
  readonly tracked = new Set<THREE.Group>();
  private buttons = new Map<XRInputSource, boolean[]>();

  clear() { this.buttons.clear(); }

  sync(poses: { controller: THREE.Group; source?: XRInputSource; target: Transform; grip: Transform }[], reset: () => void) {
    const states = poses.map(pose => ({ ...pose, valid: validTracking(pose.target) && (!pose.source?.gripSpace || validTracking(pose.grip)) }));
    const restored = new Set<THREE.Group>();
    let lost = false;
    for (const { controller, valid } of states) {
      if (valid) {
        if (!this.tracked.has(controller)) restored.add(controller);
        this.tracked.add(controller);
      } else if (this.tracked.delete(controller)) lost = true;
    }
    if (lost) reset();
    // 復帰中に押されたボタンを、新しい押下として発火させない。
    for (const { controller, source, valid } of states) {
      if (source && (lost || !valid || restored.has(controller))) this.buttons.set(source, source.gamepad?.buttons.map(b => b.pressed) ?? []);
    }
  }

  poll(controller: THREE.Group | undefined, source: XRInputSource) {
    if (!controller || !this.tracked.has(controller) || source.gamepad?.mapping !== 'xr-standard') return null;
    const current = source.gamepad.buttons.map(b => b.pressed), old = this.buttons.get(source) ?? [];
    this.buttons.set(source, current);
    return { current, old };
  }
}
