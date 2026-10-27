import * as THREE from 'three';
import type { TrackedPose } from '../../../shared/xr-pose.ts';

/** 初期の立ち位置をアバターの目へ合わせ、以後の実移動は消さない。 */
export function calibratedOrigin(base: THREE.Vector3, yaw: number, initial: THREE.Vector3, eye: number, out = new THREE.Vector3()) {
  return out.set(-initial.x, eye - initial.y, -initial.z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).add(base);
}

export function uprightQuaternion(camera: THREE.Camera, out = new THREE.Quaternion()) {
  const e = new THREE.Euler().setFromQuaternion(renderedQuaternion(camera, out), 'YXZ');
  e.z = 0;
  return out.setFromEuler(e);
}

// XRカメラは親を持たず、getWorldQuaternionで再計算するとリグ変換が失われる。
export function renderedQuaternion(camera: THREE.Camera, out = new THREE.Quaternion()) {
  return out.setFromRotationMatrix(new THREE.Matrix4().extractRotation(camera.matrixWorld));
}

export function avatarTrackingPose(position: THREE.Vector3, quaternion: THREE.Quaternion, initial: THREE.Vector3, eye: number, headYaw: number): TrackedPose {
  const inverse = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -headYaw);
  const p = position.clone().sub(initial).add(new THREE.Vector3(0, eye, 0)).applyQuaternion(inverse);
  return { p: p.toArray() as TrackedPose['p'], q: inverse.multiply(quaternion).toArray() as TrackedPose['q'] };
}

export function applyTrackedPose(object: THREE.Object3D, base: THREE.Object3D, pose: TrackedPose, offset = new THREE.Vector3(), correction = new THREE.Quaternion()) {
  const q = new THREE.Quaternion().fromArray(pose.q);
  const p = new THREE.Vector3().fromArray(pose.p).add(offset.clone().applyQuaternion(q));
  object.position.copy(object.parent!.worldToLocal(base.localToWorld(p)));
  const parentQ = object.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
  object.quaternion.copy(parentQ.multiply(base.getWorldQuaternion(new THREE.Quaternion())).multiply(q).multiply(correction));
}

export function controllerRay(controller: THREE.Object3D, out = new THREE.Ray()) {
  controller.updateWorldMatrix(true, false);
  out.origin.setFromMatrixPosition(controller.matrixWorld);
  out.direction.set(0, 0, -1).transformDirection(controller.matrixWorld);
  return out;
}

export function carryPosition(ray: THREE.Ray, distance = 2) {
  return ray.at(distance, new THREE.Vector3());
}
