// 操作できる物体は userData に Interactable を持たせる（照準が当たった物から親をたどって探す）
import * as THREE from 'three';
import { ROOM_HALF } from '../../../shared/protocol.ts';
import { DEFAULT_EYE_HEIGHT } from '../../../shared/avatar.ts';

export interface Interactable {
  bike?: string;
  use?: (hit: THREE.Intersection) => void;
  /** あれば use の代わりに使う */
  drag?: (phase: 'start' | 'move' | 'end', hit: THREE.Intersection | null) => void;
  hint?: string;
  carry?: string;
  remove?: () => void;
  /** 当たった位置で相手が決まる場合は関数 */
  hitTarget?: string | ((hit: THREE.Intersection) => string | null);
  noRay?: boolean;
}

/** 標準アバターの既定値。現在の一人称視点には useEyeHeight を使う。 */
export const EYE = DEFAULT_EYE_HEIGHT;
const LIMIT = ROOM_HALF - 0.5;
export const clampRoom = (v: number) => Math.max(-LIMIT, Math.min(LIMIT, v));

export const carrying = {
  current: null as null | { id: string; x: number; z: number; ry: number; last: number },
};

export function findInteractable(obj: THREE.Object3D | null): { data: Interactable; obj: THREE.Object3D } | null {
  for (let o = obj; o; o = o.parent) {
    const d = o.userData as Interactable;
    if (d.noRay) return null;
    if (d.use || d.drag || d.carry || d.remove || d.hitTarget) return { data: d, obj: o };
  }
  return null;
}

const raycaster = new THREE.Raycaster();
const CENTER = new THREE.Vector2(0, 0);

export function aimOn(obj: THREE.Object3D, camera: THREE.Camera, ray?: THREE.Ray | null) {
  if (ray) { raycaster.ray.copy(ray); raycaster.camera = camera; }
  else raycaster.setFromCamera(CENTER, camera);
  return raycaster.intersectObject(obj, true)[0] ?? null;
}

/**
 * 照準のレイを飛ばす価値のあるメッシュだけを、シーンの走査順に集める。
 * noRay の下にある物は aimAt の判定で必ず読み飛ばされ（ヒットしても skip され、
 * findInteractable も null を返す）、メッシュでない物（スプライト・点・線）のヒットも
 * isMesh 判定で必ず読み飛ばされるため、最初から対象から外しても結果は変わらない。
 * 集める順番は intersectObjects の再帰走査と同じ（親→子の順）で、距離が同点の
 * ヒットの並びまで従来と一致する。
 */
function aimTargets(scene: THREE.Scene): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const walk = (o: THREE.Object3D) => {
    if ((o.userData as Interactable).noRay) return;
    if ((o as THREE.Mesh).isMesh) out.push(o);
    for (const c of o.children) walk(c);
  };
  walk(scene);
  return out;
}

export function aimAt(scene: THREE.Scene, camera: THREE.Camera, ray?: THREE.Ray | null) {
  if (ray) { raycaster.ray.copy(ray); raycaster.camera = camera; }
  else raycaster.setFromCamera(CENTER, camera);
  raycaster.far = 30;
  for (const hit of raycaster.intersectObjects(aimTargets(scene), false)) {
    if (!(hit.object as THREE.Mesh).isMesh) continue;
    let skip = false;
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) if ((o.userData as Interactable).noRay) { skip = true; break; }
    if (skip) continue;
    // 最初に当たった物が操作対象でなければ（壁など）何もない扱い
    const found = findInteractable(hit.object);
    return found ? { ...found, hit } : null;
  }
  return null;
}
