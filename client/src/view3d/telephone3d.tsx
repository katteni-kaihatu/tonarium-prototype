import { useRef } from 'react';
import type * as THREE from 'three';
import type { Item } from '../../../shared/items.ts';
import { openWindow } from '../world/windows.ts';
import { removable, useFollow } from './itemHelpers.ts';
import type { Interactable } from './interact.ts';
import { Label } from './Label.tsx';

export function Telephone3D({ item }: { item: Extract<Item, { kind: 'telephone' }> }) {
  const ref = useRef<THREE.Group>(null);
  useFollow(ref, item.id, item.x, item.z, item.ry);
  const data: Interactable = { ...removable(item), hint: 'クリック: お絵描き伝言を開く',
    use: () => { openWindow(`item:${item.id}`); document.exitPointerLock(); } };
  return <group ref={ref} position={[item.x, 0, item.z]} rotation-y={item.ry} userData={data}>
    <mesh position-y={0.5}><boxGeometry args={[1.4, 1, 0.25]} /><meshStandardMaterial color="#f6e4ec" /></mesh>
    <Label text="お絵描き伝言" position={[0, 1.2, 0]} height={0.18} />
    <Label text={item.game.phase === 'playing' ? `工程 ${item.game.step + 1} / ${item.game.participants.length}` : item.game.phase === 'results' ? '結果鑑賞' : '参加受付'} position={[0, 0.7, 0.16]} height={0.13} />
  </group>;
}
