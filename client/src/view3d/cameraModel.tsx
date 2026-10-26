import type { Ref } from 'react';
import type { ThreeElements } from '@react-three/fiber';
import type { Group } from 'three';
import { cameraStandSegments, DEFAULT_CAMERA_Y } from './cameraPlacement.ts';
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
export function CameraStand({ height = DEFAULT_CAMERA_Y, pitch = 0, live = false, modelRef }: { height?: number; pitch?: number; live?: boolean; modelRef?: Ref<Group> }) {
  return <group>
      {cameraStandSegments(height, pitch).map((segment, i) => {
        return (
          <mesh key={i} position={segment.position} quaternion={segment.quaternion}>
            <cylinderGeometry args={[0.015, 0.015, segment.length]} />
            <meshStandardMaterial color="#3f3f46" />
          </mesh>
        );
      })}
      <group ref={modelRef} position-y={height} rotation-x={pitch}>
        <CameraModel live={live} />
      </group>
  </group>;
}
