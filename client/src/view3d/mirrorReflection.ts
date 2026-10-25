import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

const surfaces = new Set<Reflector>();
let reflecting = false;

export function createMirrorSurface(width: number, height: number) {
  const geometry = new THREE.PlaneGeometry(width, height);
  const mirror = new Reflector(geometry, {
    textureWidth: 1024, textureHeight: 1024, clipBias: 0.003,
    color: new THREE.Color(0.5, 0.5, 0.5),
  });
  const render = mirror.onBeforeRender;
  surfaces.add(mirror);
  mirror.onBeforeRender = function (...args: Parameters<typeof render>) {
    if (reflecting) return;
    const renderer = args[0];
    const scene = args[1];
    const target = renderer.getRenderTarget();
    const viewport = renderer.getCurrentViewport(new THREE.Vector4());
    const xr = renderer.xr.enabled;
    const shadows = renderer.shadowMap.autoUpdate;
    const visible = mirror.visible;
    const changed = new Map<THREE.Object3D, boolean>();
    const visibility = (object: THREE.Object3D, visible: boolean) => {
      if (object.visible === visible) return;
      if (!changed.has(object)) changed.set(object, object.visible);
      object.visible = visible;
    };
    // 鏡同士の再帰描画と、一人称の手持ちモデルの二重映りを防ぐ。
    for (const surface of surfaces) if (surface !== mirror) visibility(surface, false);
    scene.traverse((object) => {
      if (object.userData.selfBody) visibility(object, true);
      if (object.userData.firstPerson) visibility(object, false);
    });
    reflecting = true;
    try {
      render.apply(mirror, args);
    } finally {
      reflecting = false;
      mirror.visible = visible;
      renderer.xr.enabled = xr;
      renderer.shadowMap.autoUpdate = shadows;
      renderer.setRenderTarget(target);
      renderer.state.viewport(viewport);
      for (const [object, visible] of changed) object.visible = visible;
    }
  };
  return {
    mirror,
    dispose() {
      surfaces.delete(mirror);
      mirror.dispose();
      geometry.dispose();
    },
  };
}
