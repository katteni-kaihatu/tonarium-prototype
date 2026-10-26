import * as THREE from 'three';
import { AVATAR_SCALE, getAvatarFloorOffset, type AvatarParams } from '../../../shared/avatar.ts';

export function avatarHipHeight(params: AvatarParams) {
  return Math.max(0.08, getAvatarFloorOffset(params) + (76.224609375 - 17.181846619 - params.neckLength - 22.700691223 - params.legsDistanceFromBody) * AVATAR_SCALE);
}

export function seatedBodyOffset(hipHeight: number) {
  return Math.max(0, hipHeight - 0.2);
}

export function stepSeatedWeight(current: number, seated: boolean, dt: number, reducedMotion = false) {
  const target = seated ? 1 : 0;
  if (reducedMotion) return target;
  const next = current + (target - current) * (1 - Math.exp(-12 * Math.max(0, dt)));
  return Math.abs(target - next) < 0.001 ? target : next;
}

export interface LimbPose { position: THREE.Vector3; quaternion: THREE.Quaternion }
const footRotation = new THREE.Quaternion();
const axis = new THREE.Vector3(1, 0, 0);

export function applySeatedFoot(object: THREE.Object3D, base: LimbPose, weight: number) {
  object.position.copy(base.position);
  object.quaternion.copy(base.quaternion).multiply(footRotation.setFromAxisAngle(axis, -Math.PI / 4 * weight));
}
