import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { uprightQuaternion } from '../xr/pose.ts';

export function UprightBillboard({ children, position }: { children: ReactNode; position?: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ gl, camera }) => {
    const group = ref.current;
    if (!group) return;
    uprightQuaternion(gl.xr.isPresenting ? gl.xr.getCamera() : camera, group.quaternion);
    if (group.parent) group.quaternion.premultiply(group.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
  });
  return <group ref={ref} position={position}>{children}</group>;
}
