import type { Ref } from 'react';
import type { Group } from 'three';
import { BIKE } from '../../../shared/vehicle.ts';

export function BikeModel({ lean, front, wheelRef }: {
  lean?: Ref<Group>; front?: Ref<Group>; wheelRef?: (index: number, group: Group | null) => void;
}) {
  const wheel = (index: number) => <group ref={g => wheelRef?.(index, g)}>
    <mesh rotation-y={Math.PI / 2}><torusGeometry args={[BIKE.wheelRadius - 0.065, 0.065, 8, 20]} /><meshStandardMaterial color="#242a30" /></mesh>
    {[0, Math.PI / 3, Math.PI * 2 / 3].map(a => <mesh key={a} rotation-x={a}><boxGeometry args={[0.09, 0.48, 0.035]} /><meshStandardMaterial color="#b7c4cb" /></mesh>)}
  </group>;
  return <group ref={lean}>
    <mesh position-y={0.68}><boxGeometry args={[0.32, 0.38, 1.05]} /><meshStandardMaterial color="#358e81" roughness={0.45} /></mesh>
    <mesh position={[0, 0.93, 0.13]}><boxGeometry args={[0.35, 0.12, 0.65]} /><meshStandardMaterial color="#26313a" /></mesh>
    <group position={[0, BIKE.wheelRadius, BIKE.wheelbase / 2]}>{wheel(0)}</group>
    <group ref={front} position={[0, 0, -BIKE.wheelbase / 2]}>
      <group position-y={BIKE.wheelRadius}>{wheel(1)}</group>
      {[-0.13, 0.13].map(x => <mesh key={x} position={[x, 0.69, 0]}><cylinderGeometry args={[0.025, 0.025, 0.75, 8]} /><meshStandardMaterial color="#aab8bf" /></mesh>)}
      <mesh position-y={1.08}><boxGeometry args={[0.78, 0.055, 0.08]} /><meshStandardMaterial color="#26313a" /></mesh>
    </group>
  </group>;
}
