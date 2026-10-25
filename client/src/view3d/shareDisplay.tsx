import { t as tr } from '../i18n/index.ts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore, get, nameOf } from '../store.ts';
import { shareVideoEl } from '../net/livekit.ts';
import { placesOf } from '../spatial.ts';
import { Label } from './Label.tsx';
import { carrying, type Interactable } from './interact.ts';

function useShareAspect() {
  const [aspect, setAspect] = useState(16 / 9);
  useEffect(() => {
    const f = () => { if (shareVideoEl.videoWidth) setAspect(shareVideoEl.videoWidth / shareVideoEl.videoHeight); };
    shareVideoEl.addEventListener('resize', f);
    shareVideoEl.addEventListener('loadedmetadata', f);
    f();
    return () => {
      shareVideoEl.removeEventListener('resize', f);
      shareVideoEl.removeEventListener('loadedmetadata', f);
    };
  }, []);
  return aspect;
}

/** 裏から見ても左右が反転しないよう、表と裏に 1 枚ずつ貼る */
function VideoPanel({ w, h, tex }: { w: number; h: number; tex: THREE.Texture }) {
  return (
    <>
      <mesh position-z={0.026}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <mesh position-z={-0.026} rotation-y={Math.PI}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <mesh>
        <boxGeometry args={[w + 0.06, h + 0.06, 0.05]} />
        <meshStandardMaterial color="#1e1f24" roughness={0.6} />
      </mesh>
    </>
  );
}

const STAND_H = 2.1;
const camDir = new THREE.Vector3();

/**
 * 画面共有している人の配信ディスプレイ。アイテムではない。
 * 3D の人は床に立てたもの（その場に残り、右クリックで運べる）、2D の人は頭の上にくっつく
 */
export function ShareDisplay() {
  const sharer = useStore((s) => s.sharer);
  const user = useStore((s) => s.participants.find((p) => p.id === s.sharer));
  const tex = useMemo(() => {
    const t = new THREE.VideoTexture(shareVideoEl);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  const aspect = useShareAspect();
  const ref = useRef<THREE.Group>(null);
  const grounded = user?.mode === '3d' ? user.display : null;
  const head = user?.mode === '2d';
  useFrame(({ camera }, dt) => {
    const g = ref.current;
    if (!g || !user) return;
    if (grounded) {
      const c = carrying.current?.id === `display:${user.id}` ? carrying.current : null;
      const k = c ? 1 : Math.min(1, dt * 12);
      g.position.x += ((c?.x ?? grounded.x) - g.position.x) * k;
      g.position.z += ((c?.z ?? grounded.z) - g.position.z) * k;
      g.position.y = 0;
      let r = (c?.ry ?? grounded.ry) - g.rotation.y;
      r = Math.atan2(Math.sin(r), Math.cos(r));
      g.rotation.y += r * k;
    } else if (head) {
      const p = placesOf(get()).get(user.id);
      if (!p) return;
      g.position.set(p.x, p.small ? 0.75 : 1.55, p.z);
      // 頭の上のものは誰からでも見えるよう、カメラの方へ向ける
      camDir.set(camera.position.x - p.x, 0, camera.position.z - p.z);
      g.rotation.y = Math.atan2(camDir.x, camDir.z);
    }
  });
  if (!sharer || !user || (!grounded && !head)) return null;
  if (grounded) {
    const w = 1.6;
    const h = w / aspect;
    const data: Interactable = { carry: `display:${user.id}`, hint: tr("ui530", nameOf(user.id)) };
    return (
      <group ref={ref} position={[grounded.x, 0, grounded.z]} rotation-y={grounded.ry} userData={data}>
        <mesh position-y={STAND_H / 2 - 0.2}>
          <cylinderGeometry args={[0.03, 0.03, STAND_H - 0.4, 8]} />
          <meshStandardMaterial color="#2c2d33" />
        </mesh>
        <mesh position-y={0.02}>
          <cylinderGeometry args={[0.32, 0.36, 0.04, 24]} />
          <meshStandardMaterial color="#2c2d33" />
        </mesh>
        <group position-y={STAND_H - 0.2 + h / 2 - 0.4}>
          <VideoPanel w={w} h={h} tex={tex} />
          <Label position={[0, h / 2 + 0.16, 0]} height={0.16} text={tr("ui531", nameOf(user.id))} bg="rgba(217,72,59,0.95)" />
        </group>
      </group>
    );
  }
  const w = 0.9;
  const h = w / aspect;
  return (
    <group ref={ref} userData={{ noRay: true }}>
      <group position-y={0.15 + h / 2}>
        <VideoPanel w={w} h={h} tex={tex} />
        <Label position={[0, h / 2 + 0.11, 0]} height={0.11} text={tr("ui531", nameOf(user.id))} bg="rgba(217,72,59,0.95)" />
      </group>
    </group>
  );
}
