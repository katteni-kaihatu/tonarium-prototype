// drei の Html は 3D を開いた瞬間にいる人の分が空になることがあり、撮影・配信にも写らないので、スプライトで描く
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { renderedQuaternion } from '../xr/pose.ts';

const FONT = '"Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif';

export function Label({ text, position, bg = 'rgba(0,0,0,0.75)', fg = '#ffffff', height = 0.2 }: {
  text: string;
  position: [number, number, number];
  bg?: string;
  fg?: string;
  /** m */
  height?: number;
}) {
  const { tex, aspect } = useMemo(() => {
    const size = 48;
    const pad = 20;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.font = `600 ${size}px ${FONT}`;
    const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
    const h = size + pad;
    canvas.width = w;
    canvas.height = h;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, h / 2);
    ctx.fill();
    ctx.font = `600 ${size}px ${FONT}`;
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return { tex: t, aspect: w / h };
  }, [text, bg, fg]);
  useEffect(() => () => tex.dispose(), [tex]);
  const roll = useMemo(() => ({ q: new THREE.Quaternion(), e: new THREE.Euler(0, 0, 0, 'YXZ') }), []);
  return (
    <sprite position={position} scale={[height * aspect, height, 1]} userData={{ noRay: true }} renderOrder={10}
      onBeforeRender={(_renderer, _scene, camera, _geometry, material) => {
        roll.e.setFromQuaternion(renderedQuaternion(camera, roll.q), 'YXZ');
        (material as THREE.SpriteMaterial).rotation = -roll.e.z;
      }}>
      <spriteMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  );
}
