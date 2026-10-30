import { Suspense, lazy } from 'react';
import { useStore, worldKindOf } from '../store.ts';

const Map2D = lazy(() => import('./Map2D.tsx').then(m => ({ default: m.Map2D })));
const Map3D = lazy(() => import('./Map3D.tsx').then(m => ({ default: m.Map3D })));

export function MapLayer() {
  const mode = useStore(s => s.mapMode);
  const kind = useStore(s => worldKindOf(s));
  return <Suspense fallback={null}>
    {mode === '2d' && <Map2D key={kind} kind={kind} />}
    {mode === '3d' && <Map3D key={kind} kind={kind} />}
  </Suspense>;
}
