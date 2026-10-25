import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Item } from '../../../shared/items.ts';
import { removable, useFollow } from './itemHelpers.ts';
import { createMirrorSurface } from './mirrorReflection.ts';

export function MirrorPanel({ width, height }: { width: number; height: number }) {
  const surface = useRef<THREE.Group>(null);
  useEffect(() => {
    const group = surface.current;
    if (!group) return;
    const resource = createMirrorSurface(width, height);
    group.add(resource.mirror);
    return () => {
      group.remove(resource.mirror);
      resource.dispose();
    };
  }, [width, height]);
  return <group>
    <mesh position={[0, 0, -0.055]}>
      <boxGeometry args={[width + 0.14, height + 0.14, 0.1]} />
      <meshStandardMaterial color="#354754" metalness={0.5} roughness={0.35} />
    </mesh>
    <group ref={surface} position={[0, 0, 0.001]} />
  </group>;
}

export function MirrorModel() {
  return <group>
    <group position-y={1.3}><MirrorPanel width={1.8} height={2.2} /></group>
    {[-0.7, 0.7].map((x) => <mesh key={x} position={[x, 0.065, -0.06]}>
      <boxGeometry args={[0.16, 0.13, 0.7]} />
      <meshStandardMaterial color="#354754" />
    </mesh>)}
  </group>;
}

export function Mirror3D({ item }: { item: Extract<Item, { kind: 'mirror' }> }) {
  const ref = useRef<THREE.Group>(null);
  useFollow(ref, item.id, item.x, item.z, item.ry);
  return <group ref={ref} position={[item.x, 0, item.z]} rotation-y={item.ry} userData={removable(item)}>
    <MirrorModel />
  </group>;
}
