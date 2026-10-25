import { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';

/** CC0 の実写星空。室内の光には影響させず、撮影にも写る空間内の背景にする。 */
export function AntimatterSky() {
  const source = useLoader(THREE.TextureLoader, '/sky/qwantani-night-puresky-4k.webp');
  const texture = useMemo(() => {
    const sky = source.clone();
    sky.colorSpace = THREE.SRGBColorSpace;
    sky.wrapS = THREE.RepeatWrapping;
    sky.needsUpdate = true;
    return sky;
  }, [source]);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh name="antimatter-starry-sky" rotation-y={0.8} renderOrder={-100} frustumCulled={false} raycast={() => null} userData={{ noRay: true }}>
      {/* 撮影カメラの far=100 にも収まる距離で研究所全体を包む。 */}
      <sphereGeometry args={[80, 64, 40]} />
      <meshBasicMaterial map={texture} color="#8795c0" side={THREE.BackSide} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
