import * as THREE from 'three';

// SVG の (x,z) と WebGL の床面を、同じ同次座標で画面へ写す。
export function floorMatrix(camera: THREE.Camera, width: number, height: number) {
  const e = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
  const column = (i: number) => [(e[i] + e[i + 3]) * width / 2, (e[i + 3] - e[i + 1]) * height / 2, 0, e[i + 3]];
  return [...column(0), ...column(8), 0, 0, 1, 0, ...column(12)];
}

export function floorAt(camera: THREE.Camera, x: number, y: number, width: number, height: number) {
  if (!(width > 0 && height > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  camera.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(x / width * 2 - 1, 1 - y / height * 2), camera);
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
}

export interface MapPointer { pointerId: number; button: number; buttons: number; clientX: number; clientY: number }
export class MapTap {
  private down: (MapPointer & { moved: boolean; cancelled: boolean }) | null = null;
  start(e: MapPointer) {
    if (this.down) { this.down.cancelled = true; return; }
    this.down = { pointerId: e.pointerId, button: e.button, buttons: e.buttons, clientX: e.clientX, clientY: e.clientY,
      moved: false, cancelled: e.button !== 0 || e.buttons !== 1 };
  }
  move(e: MapPointer) {
    const d = this.down;
    if (!d || e.pointerId !== d.pointerId) return;
    // マウスの追加ボタンは pointerdown ではなく pointermove で届く。
    if (e.buttons > 1) d.cancelled = true;
    if (Math.hypot(e.clientX - d.clientX, e.clientY - d.clientY) > 6) d.moved = true;
  }
  end(e: MapPointer) {
    this.move(e);
    const d = this.down;
    this.cancel();
    return !!d && d.pointerId === e.pointerId && d.button === 0 && e.button === 0 && e.buttons === 0 && !d.moved && !d.cancelled;
  }
  cancel() { this.down = null; }
}
