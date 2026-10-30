import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { useMapBox } from './mapShared.ts';
import { touchOnly } from '../phone.ts';
export const MAP_FOV = 45;

export function MapControls({ controls, cx, cz, span, flat = false }: {
  controls: React.RefObject<OrbitControlsImpl | null>; cx: number; cz: number; span: number; flat?: boolean;
}) {
  return <OrbitControls ref={controls} target={[cx, 0, cz]} enabled={!touchOnly} screenSpacePanning={false} zoomSpeed={2}
    minPolarAngle={flat ? .08 : 0} maxPolarAngle={Math.PI / 2 - (flat ? .25 : .08)} minDistance={3} maxDistance={span * 5}
    mouseButtons={{ LEFT: -1 as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }} />;
}
/** 画面の中心ではなく、パネルに隠れない範囲の中心にワールドを映す */
export function CenterInBox({ box }: { box: ReturnType<typeof useMapBox> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useEffect(() => {
    const dx = (box.x0 + box.x1) / 2 - box.w / 2;
    const dy = (box.y0 + box.y1) / 2 - box.h / 2;
    camera.setViewOffset(box.w, box.h, -dx, -dy, box.w, box.h);
    return () => camera.clearViewOffset();
  }, [camera, box.w, box.h, box.x0, box.x1, box.y0, box.y1]);
  return null;
}

/** 最初だけカメラを構える。窓の大きさやパネルが変わったときは、見ている角度は保ったままスペースで戻る先だけ更新する。
 * Canvas の中で OrbitControls の後に置くと、ref が付いてから動く */
export function ControlsHome({ controls, camera0, target }: { controls: React.RefObject<OrbitControlsImpl | null>; camera0: THREE.Vector3; target: [number, number, number] }) {
  const placed = useRef(false);
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.position0.copy(camera0);
    c.target0.set(...target);
    if (placed.current) return;
    placed.current = true;
    c.reset();
  }, [controls, camera0, target[0], target[1], target[2]]);
  return null;
}


export function mapCameraHome(cx: number, cz: number, span: number, box: ReturnType<typeof useMapBox>) {
  const frac = Math.min((box.y1 - box.y0) / box.h, (box.x1 - box.x0) / box.h);
  const dist = span / frac / (2 * Math.tan(MAP_FOV * Math.PI / 360)) * 1.1;
  return new THREE.Vector3(cx, 0, cz).addScaledVector(new THREE.Vector3(0, .8, .6), dist);
}
