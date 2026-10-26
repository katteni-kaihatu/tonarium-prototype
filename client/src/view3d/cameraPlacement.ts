import * as THREE from 'three';
import type { Item } from '../../../shared/items.ts';
import { DEFAULT_CAMERA_Y } from '../../../shared/items.ts';

export { DEFAULT_CAMERA_Y };
export type CameraItem = Extract<Item, { kind: 'camera' }>;

export function placedCameraPose(item: CameraItem, model?: THREE.Object3D) {
  if (model) return {
    pos: model.getWorldPosition(new THREE.Vector3()),
    quat: model.getWorldQuaternion(new THREE.Quaternion()),
  };
  return {
    pos: new THREE.Vector3(item.x, item.cameraY ?? DEFAULT_CAMERA_Y, item.z),
    quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(item.pitch, item.ry, 0, 'YXZ')),
  };
}

export function cameraStandSegments(height: number, pitch: number) {
  const support = new THREE.Vector3(0, -.075, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
  support.y += height;
  const hub = new THREE.Vector3(0, support.y * .65, support.z);
  const radius = Math.min(.36, Math.max(.08, Math.abs(support.y) * .3));
  const ends = [0, 1, 2].map(i => {
    const angle = i / 3 * Math.PI * 2;
    return { start: new THREE.Vector3(Math.sin(angle) * radius, 0, Math.cos(angle) * radius), end: hub };
  });
  ends.push({ start: hub, end: support });
  return ends.map(({ start, end }) => ({
    start, end,
    position: start.clone().add(end).multiplyScalar(.5),
    length: start.distanceTo(end),
    quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()),
  }));
}
