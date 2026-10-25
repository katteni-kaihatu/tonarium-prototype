import { useEffect, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
const STAND_Y = 0.7;
function Bowl() {
  const geo = useMemo(() => {
    const pts = [[0, 0], [0.26, 0], [0.38, 0.05], [0.45, 0.13], [0.47, 0.19], [0.45, 0.2], [0.43, 0.14], [0.36, 0.07], [0.25, 0.035], [0, 0.035]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(pts, 48);
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#a06a42" roughness={0.75} side={THREE.DoubleSide} />
    </mesh>
  );
}
export function DiceStand({ children }: { children?: ReactNode }) {
  return <group>
      <mesh position-y={STAND_Y - 0.02}>
        <cylinderGeometry args={[0.52, 0.52, 0.04, 32]} />
        <meshStandardMaterial color="#7a4e30" roughness={0.8} />
      </mesh>
      <mesh position-y={(STAND_Y - 0.04) / 2}>
        <cylinderGeometry args={[0.07, 0.16, STAND_Y - 0.04, 16]} />
        <meshStandardMaterial color="#5a3826" roughness={0.8} />
      </mesh>
      <group position-y={STAND_Y}>
        <Bowl />
        {children}
      </group>
  </group>;
}
