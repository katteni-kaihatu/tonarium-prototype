import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { UprightBillboard as Billboard } from '../view3d/UprightBillboard.tsx';
import * as THREE from 'three';
import type { SystemObject as ObjectDefinition } from '../../../shared/system-types.ts';
import { useSystems } from './state.ts';
import { Label } from '../view3d/Label.tsx';

function TestButton({ object }: { object: ObjectDefinition }) {
  const cap = useRef<THREE.Mesh>(null), until = useRef(0), seen = useRef('');
  useFrame((_, dt) => {
    const view = useSystems.getState().view;
    const system = view?.systems.find(s => Object.values(s.bindings).flat().includes(object.id));
    const trace = [...view?.traces ?? []].reverse().find(t => t.instanceId === system?.instanceId && t.event === 'press');
    const key = trace ? `${trace.at}:${trace.actor}` : '';
    if (key && key !== seen.current) { seen.current = key; until.current = performance.now() + 180; }
    if (cap.current) cap.current.position.y = THREE.MathUtils.damp(cap.current.position.y, performance.now() < until.current ? 0.13 : 0.2, 22, dt);
  });
  return <>
    <mesh position={[0, 0.075, 0]}><boxGeometry args={[0.65, 0.15, 0.65]} /><meshStandardMaterial color="#27364d" /></mesh>
    <mesh ref={cap} position={[0, 0.2, 0]}><cylinderGeometry args={[0.23, 0.23, 0.16, 24]} /><meshStandardMaterial color={object.color} /></mesh>
  </>;
}

export function demoModel(object: ObjectDefinition, text: string) {
  if (object.id.endsWith('-button')) return <TestButton object={object} />;
  if (object.id === 'timer-text') return <Billboard>
    <mesh position={[0, 0.05, 0.04]}><boxGeometry args={[2.2, 0.8, 0.12]} /><meshStandardMaterial color="#172538" /></mesh>
    <Label text={text} position={[0, 0.05, 0.14]} height={0.45} bg="rgba(10,20,32,0.96)" fg="#8ef0c2" />
  </Billboard>;
  if (object.id === 'chair-object') return <>
    <mesh position={[0, 0.35, 0]}><boxGeometry args={[0.8, 0.1, 0.8]} /><meshStandardMaterial color="#ae875d" /></mesh>
    <mesh position={[0, 0.75, 0.36]}><boxGeometry args={[0.8, 0.8, 0.09]} /><meshStandardMaterial color="#96764c" /></mesh>
    {[-0.3, 0.3].flatMap(x => [-0.3, 0.3].map(z => <mesh key={`${x}:${z}`} position={[x, 0.15, z]}><boxGeometry args={[0.08, 0.3, 0.08]} /><meshStandardMaterial color="#5a4635" /></mesh>))}
  </>;
  return null;
}
