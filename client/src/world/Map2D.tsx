import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type { WorldKind } from '../../../shared/worlds.ts';
import { NEAR_RANGE, VOICE_RANGE } from '../../../shared/places.ts';
import { ITEM_INFO } from '../i18n/static.ts';
import { useStore, get } from '../store.ts';
import { placesOf } from '../spatial.ts';
import { HEAT_CELL_M, cellCenter } from '../voiceHeat.ts';
import { touchOnly } from '../phone.ts';
import { Avatar3D, Standee } from '../view3d/Participants3D.tsx';
import { boundsOf, moveSelfTo, useHeatCells, useMapBox, useSpaceReset } from './mapShared.ts';
import { CenterInBox, ControlsHome, MapControls, MAP_FOV, mapCameraHome } from './mapCamera.tsx';
import { floorAt, floorMatrix, MapTap } from './mapProjection.ts';
import { CityTrain2D, MapBackdrop, MapItemMark } from './mapSymbols.tsx';

function Floor({ kind, plane }: { kind: WorldKind; plane: React.RefObject<SVGSVGElement | null> }) {
  useStore(s => s.avatars);
  useStore(s => s.participants);
  useStore(s => s.selfId);
  const walk = useStore(s => s.walk);
  const heat = useHeatCells();
  const me = placesOf(get()).get(get().selfId);
  return <svg ref={plane} className="mapfloor" width="1" height="1" aria-hidden="true">
    <defs><radialGradient id="voiceheat">
      <stop offset="0%" stopColor="#ff9a3c" stopOpacity="0.85" />
      <stop offset="60%" stopColor="#ff7a2f" stopOpacity="0.35" />
      <stop offset="100%" stopColor="#ff7a2f" stopOpacity="0" />
    </radialGradient></defs>
    <MapBackdrop kind={kind} tx={0} ty={0} k={1} />
    {heat.map(c => {
      const ctr = cellCenter(c.cx, c.cz);
      return <circle key={`${c.cx},${c.cz}`} className="mheat" cx={ctr.x} cy={ctr.z} r={HEAT_CELL_M * .95} fill="url(#voiceheat)" opacity={.25 + c.heat * .55} />;
    })}
    {kind === 'city' && <CityTrain2D />}
    {me && walk?.to && <line className="mroute" x1={me.x} y1={me.z} x2={walk.to.x} y2={walk.to.z} />}
    {walk?.to && <g className="mgoal"><circle cx={walk.to.x} cy={walk.to.z} r={.45} /><circle cx={walk.to.x} cy={walk.to.z} r={.12} /></g>}
    {me && <circle className="mvoice" cx={me.x} cy={me.z} r={VOICE_RANGE} />}
    {me && <circle className="mnear" cx={me.x} cy={me.z} r={NEAR_RANGE} />}
  </svg>;
}

function Projection({ plane, marks, cameraRef }: {
  plane: React.RefObject<SVGSVGElement | null>;
  marks: React.RefObject<HTMLDivElement | null>;
  cameraRef: React.RefObject<THREE.Camera | null>;
}) {
  const point = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    cameraRef.current = camera;
    camera.updateMatrixWorld();
    if (plane.current) plane.current.style.transform = `matrix3d(${floorMatrix(camera, size.width, size.height).join(',')})`;
    for (const el of marks.current?.children ?? []) {
      const mark = el as HTMLElement;
      point.set(Number(mark.dataset.x), 0, Number(mark.dataset.z)).project(camera);
      mark.style.visibility = point.z >= -1 && point.z <= 1 ? 'visible' : 'hidden';
      mark.style.left = `${(point.x + 1) * size.width / 2}px`;
      mark.style.top = `${(1 - point.y) * size.height / 2}px`;
    }
  });
  return null;
}

export function Map2D({ kind }: { kind: WorldKind }) {
  const box = useMapBox();
  const bounds = boundsOf(kind);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  const camera0 = useMemo(() => mapCameraHome(cx, cz, span, box), [cx, cz, span, box.w, box.h, box.x0, box.x1, box.y0, box.y1]);
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useRef<THREE.Camera>(null);
  const plane = useRef<SVGSVGElement>(null);
  const marks = useRef<HTMLDivElement>(null);
  const gesture = useRef(new MapTap());
  const participants = useStore(s => s.participants);
  const selfId = useStore(s => s.selfId);
  const items = useStore(s => s.items);
  useSpaceReset(() => { gesture.current.cancel(); controls.current?.reset(); });
  const onUp = (e: React.PointerEvent) => {
    if (!gesture.current.end(e) || e.buttons !== 0 || !camera.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const p = floorAt(camera.current, e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
    if (p) moveSelfTo(p.x, p.z);
  };
  return <div className="map2d"
    onPointerDownCapture={e => {
      if (!e.isPrimary) { gesture.current.cancel(); return; }
      gesture.current.start(e);
      if (touchOnly && e.button === 0) {
        // マウスでは OrbitControls に捕捉を任せ、capture の移し替えを避ける。
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { gesture.current.cancel(); }
      }
    }}
    onPointerMoveCapture={e => gesture.current.move(e)} onPointerUpCapture={onUp}
    onPointerCancelCapture={() => gesture.current.cancel()} onLostPointerCaptureCapture={() => gesture.current.cancel()}
    onAuxClick={e => e.preventDefault()} onContextMenu={e => e.preventDefault()}>
    <Floor kind={kind} plane={plane} />
    <Canvas camera={{ fov: MAP_FOV, near: .1, far: Math.max(400, span * 12), position: camera0.toArray() }}>
      <CenterInBox box={box} />
      <Suspense fallback={null}>
        {participants.map(user => user.mode === '2d'
          ? <Standee key={user.id} user={user} overview />
          : <Avatar3D key={user.id} id={user.id} self={user.id === selfId} overview />)}
      </Suspense>
      <MapControls controls={controls} cx={cx} cz={cz} span={span} flat />
      <ControlsHome controls={controls} camera0={camera0} target={[cx, 0, cz]} />
      <Projection plane={plane} marks={marks} cameraRef={camera} />
    </Canvas>
    <div className="mapmarks" ref={marks}>
      {Object.values(items).filter(it => !('holder' in it && it.holder)).map(it =>
        <div key={it.id} data-x={it.x} data-z={it.z} className="mapmark">
          <MapItemMark left={0} top={0} tint={ITEM_INFO[it.kind].tint} ink={ITEM_INFO[it.kind].ink} name={ITEM_INFO[it.kind].name} mark={ITEM_INFO[it.kind].mark} />
        </div>)}
    </div>
  </div>;
}
