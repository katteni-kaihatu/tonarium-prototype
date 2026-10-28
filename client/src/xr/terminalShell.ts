import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function dispose(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      material.dispose();
    }
  });
  textures.forEach(texture => texture.dispose());
  root.removeFromParent();
}

export class TerminalShell {
  readonly group = new THREE.Group();
  readonly ready: Promise<void>;
  private disposed = false;
  constructor(parent: THREE.Group) {
    this.group.userData.noRay = true;
    parent.add(this.group);
    this.ready = new GLTFLoader().loadAsync('/xr/folding-phone.glb').then(gltf => {
      if (this.disposed) { dispose(gltf.scene); return; }
      gltf.scene.traverse(object => { object.userData.noRay = true; object.raycast = () => {}; });
      this.group.add(gltf.scene);
    }).catch(() => { /* 外装がなくても既存の画面を操作できる */ });
  }
  resize(width: number, height: number) { this.group.scale.set(width, height, 1); }
  dispose() { this.disposed = true; dispose(this.group); }
}
