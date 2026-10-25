import { t as tr, msg } from '../i18n/index.ts';
import { CameraStand } from './cameraModel.tsx';
export { CameraModel } from './cameraModel.tsx';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { Item } from '../../../shared/items.ts';
import { useStore, get, set, nameOf } from '../store.ts';
import { camVideos, publishCamera } from '../net/livekit.ts';
import { itemAction, removeItem } from '../items/actions.ts';
import { CAM_Y, cameraModels, localFeeds, makeRenderer, renderCamera } from './cameraRender.ts';
import { carrying, type Interactable } from './interact.ts';

type CameraItem = Item & { kind: 'camera' };

export function CamMonitor({ item, position }: { item: CameraItem; position: [number, number, number] }) {
  const selfId = useStore((s) => s.selfId);
  const feed = useStore((s) => s.camFeeds[item.id]);
  const own = item.operator === selfId;
  const tex = useMemo(() => {
    if (own) {
      const cv = localFeeds.get(item.id);
      return cv ? new THREE.CanvasTexture(cv) : null;
    }
    const el = camVideos.get(item.id);
    return el ? new THREE.VideoTexture(el) : null;
    // 受信し直したら作り直す
  }, [own, item.id, feed]);
  useEffect(() => {
    if (tex) tex.colorSpace = THREE.SRGBColorSpace;
    return () => tex?.dispose();
  }, [tex]);
  useFrame(() => { if (own && tex) tex.needsUpdate = true; });
  if (!item.live) return null;
  return (
    <Billboard position={position}>
      <mesh userData={{ noRay: true }}>
        <planeGeometry args={[0.72, 0.42]} />
        <meshBasicMaterial color="#111" />
      </mesh>
      <mesh position-z={0.005} userData={{ noRay: true }}>
        <planeGeometry args={[0.68, 0.38]} />
        {tex ? <meshBasicMaterial map={tex} toneMapped={false} /> : <meshBasicMaterial color="#333" />}
      </mesh>
      <mesh position={[-0.27, 0.15, 0.01]} userData={{ noRay: true }}>
        <circleGeometry args={[0.02, 12]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
    </Billboard>
  );
}

export function Camera3D({ item }: { item: CameraItem }) {
  const ref = useRef<THREE.Group>(null);
  const model = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const c = carrying.current?.id === item.id ? carrying.current : null;
    const k = c ? 1 : Math.min(1, dt * 12);
    g.position.x += ((c?.x ?? item.x) - g.position.x) * k;
    g.position.z += ((c?.z ?? item.z) - g.position.z) * k;
    let r = (c?.ry ?? item.ry) - g.rotation.y;
    r = Math.atan2(Math.sin(r), Math.cos(r));
    g.rotation.y += r * k;
  });
  useEffect(() => {
    if (model.current) cameraModels.set(item.id, model.current);
    return () => { cameraModels.delete(item.id); };
  });
  if (item.holder) return null;
  const data: Interactable = {
    carry: item.id,
    remove: () => removeItem(item.id),
    hint: tr("ui473", item.live ? tr("ui474") : ''),
    use: () => itemAction(item.id, { a: 'pick' }),
  };
  return (
    <group ref={ref} position={[item.x, 0, item.z]} rotation-y={item.ry} userData={data}>
      <CameraStand pitch={item.pitch} live={item.live} modelRef={model} />
      <CamMonitor item={item} position={[0, CAM_Y + 0.42, 0]} />
    </group>
  );
}

export function CameraStreamer({ item }: { item: CameraItem }) {
  const renderer = useMemo(() => makeRenderer(640, 360), []);
  const last = useRef(0);
  const itemRef = useRef(item);
  itemRef.current = item;
  useEffect(() => {
    const canvas = renderer.domElement;
    localFeeds.set(item.id, canvas);
    renderCamera(renderer, item);
    const stream = canvas.captureStream(15);
    let stop: (() => Promise<void>) | null = null;
    let cancelled = false;
    publishCamera(item.id, stream.getVideoTracks()[0])
      .then((s) => { if (cancelled) void s(); else stop = s; })
      .catch((e) => {
        set({ voiceError: msg("ui475", (e as Error).message) });
        itemAction(item.id, { a: 'camLive', on: false });
      });
    set((s) => ({ camFeeds: { ...s.camFeeds, [item.id]: performance.now() } }));
    return () => {
      cancelled = true;
      void stop?.();
      localFeeds.delete(item.id);
      set((s) => {
        const camFeeds = { ...s.camFeeds };
        delete camFeeds[item.id];
        return { camFeeds };
      });
      renderer.dispose();
    };
  }, [item.id, renderer]);
  useFrame(() => {
    const now = performance.now();
    if (now - last.current < 66) return;
    last.current = now;
    const it = get().items[itemRef.current.id];
    if (it?.kind === 'camera') renderCamera(renderer, it);
  });
  return null;
}

export function cameraHelp(item: CameraItem) {
  return tr("ui476", item.live ? tr("ui474") : tr("ui477"));
}

export const operatorName = (item: CameraItem) => nameOf(item.operator);
