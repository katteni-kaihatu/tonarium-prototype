import { useRef } from 'react';
import type * as THREE from 'three';
import { JUMP_PAD, type JumpPad } from '../../../shared/jumpPad.ts';
import { removable, useFollow } from './itemHelpers.ts';

export function JumpPadModel() {
  return <>
    <mesh position-y={JUMP_PAD.height / 2}>
      <cylinderGeometry args={[JUMP_PAD.radius, JUMP_PAD.radius, JUMP_PAD.height, 48]} />
      <meshStandardMaterial color="#17634d" metalness={0.3} roughness={0.5} />
    </mesh>
    <mesh rotation-x={-Math.PI / 2} position-y={JUMP_PAD.height + 0.001}>
      <ringGeometry args={[0.57, 0.72, 48]} />
      <meshStandardMaterial color="#8fffd2" emissive="#36b78a" emissiveIntensity={0.5} />
    </mesh>
    <group position-y={JUMP_PAD.height + 0.006}>
      <mesh><boxGeometry args={[0.12, 0.01, 0.5]} /><meshStandardMaterial color="#d8fff0" /></mesh>
      {[-1, 1].map(sign => <mesh key={sign} position={[sign * 0.12, 0, -0.13]} rotation-y={sign * Math.PI / 4}>
        <boxGeometry args={[0.12, 0.01, 0.36]} /><meshStandardMaterial color="#d8fff0" />
      </mesh>)}
    </group>
  </>;
}

export function JumpPad3D({ item }: { item: JumpPad }) {
  const ref = useRef<THREE.Group>(null);
  useFollow(ref, item.id, item.x, item.z, item.ry);
  return <group ref={ref} position={[item.x, 0, item.z]} rotation-y={item.ry} userData={removable(item)}>
    <JumpPadModel />
  </group>;
}
