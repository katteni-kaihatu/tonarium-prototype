import { t as tr } from '../i18n/index.ts';
import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { NEAR_RANGE, VOICE_RANGE } from '../../../shared/places.ts';
import type { WorldKind } from '../../../shared/worlds.ts';
import { useStore, get } from '../store.ts';
import { placesOf } from '../spatial.ts';
import { HEAT_CELL_M, cellCenter } from '../voiceHeat.ts';
import { Avatar3D, Entrance } from '../view3d/Participants3D.tsx';
import { CenterInBox, ControlsHome, MapControls, MAP_FOV, mapCameraHome } from './mapCamera.tsx';
import { Item3D } from '../view3d/items3d.tsx';
import { ShareDisplay } from '../view3d/shareDisplay.tsx';
import { WORLD_BG, WorldMesh } from '../view3d/worlds3d.tsx';
import { Face } from './common.tsx';
import { boundsOf, moveSelfTo, useHeatCells, useMapBox, useSpaceReset } from './mapShared.ts';

/** 3D マップでの自分の声が届く範囲 */
function VoiceRing() {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const s = get();
    const p = placesOf(s).get(s.selfId);
    if (ref.current && p) ref.current.position.set(p.x, 0.03, p.z);
  });
  return (
    <group ref={ref} rotation-x={-Math.PI / 2}>
      <mesh><ringGeometry args={[VOICE_RANGE - 0.08, VOICE_RANGE, 96]} /><meshBasicMaterial color="#2F5FC4" transparent opacity={0.7} /></mesh>
      <mesh><ringGeometry args={[NEAR_RANGE - 0.05, NEAR_RANGE, 48]} /><meshBasicMaterial color="#23A55A" transparent opacity={0.8} /></mesh>
    </group>
  );
}

/** 3D マップでの声の湯気。真上から見るマップでは、床の温かい光として出す */
function HeatDiscs() {
  const cells = useHeatCells();
  return (
    <>
      {cells.map((c) => {
        const ctr = cellCenter(c.cx, c.cz);
        return (
          <mesh key={`${c.cx},${c.cz}`} rotation-x={-Math.PI / 2} position={[ctr.x, 0.04, ctr.z]}>
            <circleGeometry args={[HEAT_CELL_M * 0.95, 32]} />
            <meshBasicMaterial color="#ff8a3c" transparent opacity={0.08 + c.heat * 0.22} depthWrite={false} />
          </mesh>
        );
      })}
    </>
  );
}

/** 3D マップでの目的地の目印 */
function Goal3D() {
  const to = useStore((s) => s.walk?.to);
  if (!to) return null;
  return (
    <group position={[to.x, 0.04, to.z]}>
      <mesh rotation-x={-Math.PI / 2}><ringGeometry args={[0.32, 0.45, 32]} /><meshBasicMaterial color="#E2533F" /></mesh>
      <mesh position-y={0.6}><coneGeometry args={[0.16, 0.45, 16]} /><meshBasicMaterial color="#E2533F" /></mesh>
    </group>
  );
}

/** 上から見るとアバターは小さいので、2D マップと同じ顔の目印を頭の上に出す。
 * 目印は Canvas の外の普通の DOM に置き、毎フレーム画面上の位置へ動かす */
function PinProjector({ els }: { els: React.RefObject<Map<string, HTMLElement>> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const places = placesOf(get());
    for (const [id, el] of els.current) {
      const p = places.get(id);
      if (p) v.set(p.x, (p.y ?? 0) + 2.2, p.z).project(camera);
      const shown = !!p && v.z < 1;
      el.style.visibility = shown ? 'visible' : 'hidden';
      if (shown) el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`;
    }
  });
  return null;
}

function PersonPins({ els }: { els: React.RefObject<Map<string, HTMLElement>> }) {
  const participants = useStore((s) => s.participants);
  const selfId = useStore((s) => s.selfId);
  return (
    <>
      {participants.map((u) => (
        <span key={u.id} className={`mpin ${u.id === selfId ? 'self' : ''}`} ref={(el) => { if (el) els.current.set(u.id, el); else els.current.delete(u.id); }}>
          <Face id={u.id} name={u.name} size={26} /><span className="mname">{u.id === selfId ? tr("ui84") : u.name}</span>
        </span>
      ))}
    </>
  );
}

const FOV = MAP_FOV;
const CLIP_Y: Partial<Record<WorldKind, number>> = { room: 3, cafe: 3 };

export function Map3D({ kind }: { kind: WorldKind }) {
  const box = useMapBox();
  const avatarIds = useStore((s) => s.avatarIds);
  const items = useStore((s) => s.items);
  const b = boundsOf(kind);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const controls = useRef<OrbitControlsImpl>(null);
  const pins = useRef(new Map<string, HTMLElement>());
  // パネルに隠れない範囲にワールド全体が入る距離から、斜め上に構える
  const camera0 = useMemo(() => {
    return mapCameraHome(cx, cz, span, box);
  }, [cx, cz, span, box.w, box.h, box.x0, box.x1, box.y0, box.y1]);
  useSpaceReset(() => controls.current?.reset());
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.nativeEvent.button !== 0 || e.delta > 6) return;
    moveSelfTo(e.point.x, e.point.z);
  };
  return (
    <div className="map3d" onAuxClick={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()}>
      {/* 天井や梁が見下ろす視界をふさぐ部屋では、マップでは天井より上を切り落とす */}
      <Canvas camera={{ fov: FOV, near: 0.1, far: 400, position: camera0.toArray() }} onCreated={({ gl }) => { const y = CLIP_Y[kind]; if (y !== undefined) gl.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), y)]; }}>
        <color attach="background" args={[WORLD_BG[kind]]} />
        <CenterInBox box={box} />
        <WorldMesh kind={kind} map />
        <ShareDisplay />
        <Entrance />
        {avatarIds.map((id) => <Avatar3D key={id} id={id} />)}
        {Object.values(items).map((it) => <Item3D key={it.id} item={it} />)}
        <VoiceRing />
        <HeatDiscs />
        <Goal3D />
        <PinProjector els={pins} />
        <mesh rotation-x={-Math.PI / 2} position={[cx, 0.02, cz]} onClick={onClick}>
          <planeGeometry args={[span * 4, span * 4]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <Suspense fallback={null}>
          <MapControls controls={controls} cx={cx} cz={cz} span={span} />
          <ControlsHome controls={controls} camera0={camera0} target={[cx, 0, cz]} />
        </Suspense>
      </Canvas>
      <PersonPins els={pins} />
    </div>
  );
}
