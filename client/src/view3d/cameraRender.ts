import { t as tr } from '../i18n/index.ts';
// 撮影・配信ともメインとは別の WebGLRenderer で同じシーンを描く
import * as THREE from 'three';
import type { Item } from '../../../shared/items.ts';
import { get, set } from '../store.ts';
import { postImage } from '../items/actions.ts';
import { playShutter } from '../items/effects.ts';

export const world = { scene: null as THREE.Scene | null, camera: null as THREE.PerspectiveCamera | null, pitch: 0 };
/** そのカメラから描くときは本体が写り込まないよう隠す */
export const cameraModels = new Map<string, THREE.Object3D>();
export const localFeeds = new Map<string, HTMLCanvasElement>();

export const CAM_Y = 1.5;

export function cameraPose(item: Item & { kind: 'camera' }) {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  if (item.holder === get().selfId && world.camera) {
    pos.copy(world.camera.position);
    quat.copy(world.camera.quaternion);
  } else {
    pos.set(item.x, CAM_Y, item.z);
    quat.setFromEuler(new THREE.Euler(item.pitch, item.ry, 0, 'YXZ'));
  }
  return { pos, quat };
}

const viewCam = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 100);

export function renderCamera(renderer: THREE.WebGLRenderer, item: Item & { kind: 'camera' }) {
  const { scene } = world;
  if (!scene) return;
  const { pos, quat } = cameraPose(item);
  viewCam.position.copy(pos);
  viewCam.quaternion.copy(quat);
  viewCam.aspect = renderer.domElement.width / renderer.domElement.height;
  viewCam.updateProjectionMatrix();
  renderView(renderer, scene, viewCam, item.holder !== get().selfId, cameraModels.get(item.id));
}

function renderView(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera,
  showSelf = false, model?: THREE.Object3D) {
  const hidden: THREE.Object3D[] = [];
  if (model?.visible) { model.visible = false; hidden.push(model); }
  const shown: THREE.Object3D[] = [];
  // 手に持って撮るときは自分の頭の中から撮ることになるので、自分の体は出さない
  scene.traverse((o) => {
    if ((o.userData.firstPerson || (!showSelf && o.userData.selfBody)) && o.visible) { o.visible = false; hidden.push(o); }
    if (showSelf && o.userData.selfBody && !o.visible) { o.visible = true; shown.push(o); }
  });
  try { renderer.render(scene, camera); }
  finally {
    for (const o of hidden) o.visible = true;
    for (const o of shown) o.visible = false;
  }
}

export function makeRenderer(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

export function takeThumbnail(): string | undefined {
  const { scene, camera } = world;
  if (get().mode !== '3d' || !scene || !camera || !Number.isFinite(camera.aspect) || camera.aspect <= 0) return;
  let renderer: THREE.WebGLRenderer | undefined;
  try {
    renderer = makeRenderer(320, Math.max(1, Math.round(320 / camera.aspect)));
    const view = camera.clone();
    camera.updateWorldMatrix(true, false);
    camera.matrixWorld.decompose(view.position, view.quaternion, view.scale);
    renderView(renderer, scene, view);
    return renderer.domElement.toDataURL('image/jpeg', 0.65);
  } catch {
    return;
  } finally {
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}

let photoRenderer: THREE.WebGLRenderer | null = null;

export function takePhoto(item: Item & { kind: 'camera' }) {
  photoRenderer ??= makeRenderer(1280, 720);
  renderCamera(photoRenderer, item);
  postImage(tr("ui478"), photoRenderer.domElement.toDataURL('image/jpeg', 0.85));
  playShutter();
  set({ flashAt: performance.now() });
}
