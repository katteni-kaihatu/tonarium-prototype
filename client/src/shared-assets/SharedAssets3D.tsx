import { sharedPresentation } from '../../../shared/shared-presentation.ts';
import { useStore } from '../store.ts';
import { Label } from '../view3d/Label.tsx';
import { useSharedAssets } from './state.ts';
export function SharedAssets3D() {
  const sid = useStore(s => s.session); const state = useSharedAssets();
  if (sid !== state.sid) return null;
  return <>{sharedPresentation(state.view, state.catalog).map(p => <group key={p.instanceId} position={[p.x, p.y, p.z]} rotation={[0, p.ry, 0]}>
    <mesh position={[0, p.scale / 2, 0]}><boxGeometry args={[p.scale, p.scale, p.scale]} /><meshStandardMaterial color={p.color} transparent opacity={p.solid ? 1 : 0.35} /></mesh>
    <Label position={[0, p.scale + 0.3, 0]} height={0.22} text={p.label} />
  </group>)}</>;
}
