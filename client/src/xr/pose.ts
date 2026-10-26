import * as THREE from 'three';

/** 初期の立ち位置をアバターの目へ合わせ、以後の実移動は消さない。 */
export function calibratedOrigin(base: THREE.Vector3, yaw: number, initial: THREE.Vector3, eye: number, out = new THREE.Vector3()) {
  return out.set(-initial.x, eye - initial.y, -initial.z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).add(base);
}

export function uprightQuaternion(camera: THREE.Camera, out = new THREE.Quaternion()) {
  const e = new THREE.Euler().setFromQuaternion(camera.getWorldQuaternion(out), 'YXZ');
  e.z = 0;
  return out.setFromEuler(e);
}

export function carryPosition(ray: THREE.Ray, distance = 2) {
  return ray.at(distance, new THREE.Vector3());
}
