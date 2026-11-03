import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
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
import { t as tr } from '../i18n/index.ts';
import { itemLabel } from './common.tsx';
import { itemAction } from '../items/actions.ts';
import { openWindow } from './windows.ts';
import { mapItemTarget, mapShareTarget, runMapTarget, type MapTarget } from './mapActions.ts';

const activate = (target: MapTarget) => runMapTarget(get(), target, {
  pick: id => itemAction(id, { a: 'pick' }), open: openWindow,
});

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
    const places = placesOf(get());
    for (const el of marks.current?.children ?? []) {
      const mark = el as HTMLElement;
      if (mark.dataset.participant) {
        const place = places.get(mark.dataset.participant);
        if (!place) { mark.style.visibility = 'hidden'; continue; }
        mark.dataset.x = String(place.x);
        mark.dataset.z = String(place.z);
      }
      point.set(Number(mark.dataset.x), 0, Number(mark.dataset.z)).project(camera);
      mark.style.visibility = point.z >= -1 && point.z <= 1 ? 'visible' : 'hidden';
      mark.style.left = `${(point.x + 1) * size.width / 2}px`;
      mark.style.top = `${(1 - point.y) * size.height / 2}px`;
    }
  });
  return null;
}

export function Map2D({ kind }: { kind: WorldKind }) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
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
  const gesture = useRef(new MapTap<MapTarget>());
  const participants = useStore(s => s.participants);
  const selfId = useStore(s => s.selfId);
  const items = useStore(s => s.items);
  const camFeeds = useStore(s => s.camFeeds);
  const sharer = useStore(s => s.sharer);
  const session = useStore(s => s.session);
  const state = get();
  const places = placesOf(state);
  useEffect(() => useStore.subscribe((s, prev) => {
    if (s.session !== prev.session || s.sharer !== prev.sharer
      || prev.participants.some(p => p.sharing && !s.participants.some(next => next.id === p.id && next.sharing))) gesture.current.cancel();
  }), []);
  const targetAt = (el: EventTarget | null) => {
    const button = el instanceof Element ? el.closest<HTMLButtonElement>('button[data-map-kind]') : null;
    if (!button || !session) return null;
    return { kind: button.dataset.mapKind, id: button.dataset.mapId, session } as MapTarget;
  };
  const keyboardClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    // ポインターの click は pointerup で処理済み。キーボードの合成 click だけ受ける。
    if (e.detail === 0) {
      const target = targetAt(e.currentTarget);
      if (target) activate(target);
    }
  };
  useSpaceReset(() => { gesture.current.cancel(); controls.current?.reset(); });
  const onUp = (e: React.PointerEvent) => {
    const tap = gesture.current.finish(e);
    if (!tap) return;
    if (tap.target) { activate(tap.target); return; }
    if (!camera.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const p = floorAt(camera.current, e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
    if (p) moveSelfTo(p.x, p.z);
  };
  return <div className="map2d" ref={setRoot}
    onPointerDownCapture={e => {
      if (!e.isPrimary) { gesture.current.cancel(); return; }
      gesture.current.start(e, targetAt(e.target));
      if (touchOnly && e.button === 0) {
        // マウスでは OrbitControls に捕捉を任せ、capture の移し替えを避ける。
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { gesture.current.cancel(); }
      }
    }}
    onPointerMoveCapture={e => gesture.current.move(e)} onPointerUpCapture={onUp}
    onPointerCancelCapture={() => gesture.current.cancel()} onLostPointerCaptureCapture={() => gesture.current.cancel()}
    onWheelCapture={() => gesture.current.cancel()}
    onAuxClick={e => e.preventDefault()} onContextMenu={e => e.preventDefault()}>
    <Floor kind={kind} plane={plane} />
    <Canvas camera={{ fov: MAP_FOV, near: .1, far: Math.max(400, span * 12), position: camera0.toArray() }}>
      <CenterInBox box={box} />
      <Suspense fallback={null}>
        {participants.map(user => user.mode === '2d'
          ? <Standee key={user.id} user={user} overview />
          : <Avatar3D key={user.id} id={user.id} self={user.id === selfId} overview />)}
      </Suspense>
      <MapControls controls={controls} cx={cx} cz={cz} span={span} flat domElement={root ?? undefined} />
      <ControlsHome controls={controls} camera0={camera0} target={[cx, 0, cz]} />
      <Projection plane={plane} marks={marks} cameraRef={camera} />
    </Canvas>
    <div className="mapmarks" ref={marks}>
      {Object.values(items).filter(it => !('holder' in it && it.holder)).map(it => {
        const target = mapItemTarget({ ...state, items, camFeeds }, it.id);
        const label = itemLabel(it);
        const actionLabel = tr('mapItemAction', label, target?.kind === 'pick' ? tr('ui614') : tr('ui617'));
        const mark = <MapItemMark left={0} top={0} tint={ITEM_INFO[it.kind].tint} ink={ITEM_INFO[it.kind].ink} name={target ? actionLabel : label} mark={ITEM_INFO[it.kind].mark} />;
        return <div key={it.id} data-x={it.x} data-z={it.z} className="mapmark">
          {target ? <button type="button" className="mapaction" data-map-kind={target.kind} data-map-id={it.id}
            title={actionLabel} aria-label={actionLabel} onClick={keyboardClick}>{mark}</button> : mark}
        </div>;
      })}
      {participants.filter(p => mapShareTarget({ ...state, sharer }, p.id)).map(p => {
        const place = places.get(p.id);
        if (!place) return null;
        const label = tr('mapWatchShare', p.name);
        return <div key={`share:${p.id}`} className="mapmark" data-participant={p.id} data-x={place.x} data-z={place.z}>
          <button type="button" className="mapaction mapshare" data-map-kind="share" data-map-id={p.id}
            title={label} aria-label={label} onClick={keyboardClick}>{tr('ui588')}</button>
        </div>;
      })}
    </div>
  </div>;
}
