// AD ポータルの 3D 表示。研究所のミニチュアで、入口だけを担う。
import { useRef } from 'react';
import * as THREE from 'three';
import type { Item } from '../../../shared/items.ts';
import { openWindow } from '../world/windows.ts';
import type { Interactable } from './interact.ts';
import { removable, useFollow } from './itemHelpers.ts';
import { Label } from './Label.tsx';

const TOWERS: { x: number; z: number; h: number }[] = [
  { x: -0.32, z: 0.18, h: 0.45 },
  { x: 0.32, z: 0.18, h: 0.7 },
  { x: 0, z: -0.32, h: 0.95 },
];

export function AntimatterItem3D({ item }: { item: Item & { kind: 'antimatter' } }) {
  const ref = useRef<THREE.Group>(null);
  useFollow(ref, item.id, item.x, item.z, item.ry);
  const data: Interactable = {
    ...removable(item),
    hint: 'クリック: AD 研究所を開く',
    // パネルをマウスで操作できるようロックを外す
    use: () => { openWindow(`item:${item.id}`); document.exitPointerLock(); },
  };
  return (
    <group ref={ref} position={[item.x, 0, item.z]} rotation-y={item.ry} userData={data}>
      <Label text="AD ポータル" position={[0, 1.95, 0]} height={0.16} bg="rgba(43,26,74,0.95)" />
      <mesh position-y={0.04}>
        <cylinderGeometry args={[0.62, 0.7, 0.08, 32]} />
        <meshStandardMaterial color="#2c2f4a" />
      </mesh>
      <mesh position-y={0.09} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.45, 0.58, 32]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>
      {TOWERS.map((t) => (
        <group key={`${t.x},${t.z}`} position={[t.x, 0.08, t.z]}>
          <mesh position-y={t.h / 2}>
            <cylinderGeometry args={[0.07, 0.09, t.h, 12]} />
            <meshStandardMaterial color="#7fd8ff" emissive="#1d4ed8" emissiveIntensity={0.35} />
          </mesh>
          <mesh position-y={t.h + 0.05}>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial color="#e0f2fe" emissive="#38bdf8" emissiveIntensity={0.8} />
          </mesh>
        </group>
      ))}
      <mesh position-y={0.62}>
        <cylinderGeometry args={[0.05, 0.08, 0.5, 12]} />
        <meshStandardMaterial color="#4c1d95" />
      </mesh>
      <mesh position-y={0.95}>
        <sphereGeometry args={[0.22, 24, 18]} />
        <meshStandardMaterial color="#c084fc" emissive="#9333ea" emissiveIntensity={1.1} />
      </mesh>
      {/* 狙いやすいよう大きめの当たり判定 */}
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[1.3, 1.8, 1.3]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
