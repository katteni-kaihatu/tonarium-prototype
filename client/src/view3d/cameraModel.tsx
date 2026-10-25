import type { Ref } from 'react';
import type { ThreeElements } from '@react-three/fiber';
import type { Group } from 'three';
const CAM_Y = 1.5;
/** レンズは -Z 向き */
export function CameraModel({ live, ...props }: ThreeElements['group'] & { live: boolean }) {
  return (
    <group {...props}>
      <mesh>
        <boxGeometry args={[0.24, 0.15, 0.12]} />
        <meshStandardMaterial color="#27272a" />
      </mesh>
      <mesh position={[0, 0, -0.09]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.045, 0.05, 0.07, 16]} />
        <meshStandardMaterial color="#52525b" />
      </mesh>
      <mesh position={[0.08, 0.05, -0.061]}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshBasicMaterial color={live ? '#ef4444' : '#3f3f46'} />
      </mesh>
    </group>
  );
}
export function CameraStand({ pitch = 0, live = false, modelRef }: { pitch?: number; live?: boolean; modelRef?: Ref<Group> }) {
  return <group>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.sin(a) * 0.18, CAM_Y / 2 - 0.05, Math.cos(a) * 0.18]} rotation={[Math.cos(a) * 0.15, 0, -Math.sin(a) * 0.15]}>
            <cylinderGeometry args={[0.015, 0.015, CAM_Y - 0.1]} />
            <meshStandardMaterial color="#3f3f46" />
          </mesh>
        );
      })}
      <group ref={modelRef} position-y={CAM_Y} rotation-x={pitch}>
        <CameraModel live={live} />
      </group>
  </group>;
}
