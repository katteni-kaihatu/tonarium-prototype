import { t as tr } from '../i18n/index.ts';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { jumpHeight, spawnSlot, type Participant, type AvatarState } from '../../../shared/protocol.ts';
import { useStore, get, serverNow } from '../store.ts';
import { carPose, fromCarLocal } from '../../../shared/city.ts';
import { pitchOf, placesOf } from '../spatial.ts';
import { bump, recentlyHit } from '../items/effects.ts';
import { carrying, type Interactable } from './interact.ts';
import { DEFAULT_EYE_HEIGHT, DEFAULT_PARAMS } from '../../../shared/avatar.ts';
import { useEyeHeight } from './eyeHeight.ts';
import type { PlayerCamera } from './playerCamera.ts';
import { HammerModel } from './items3d.tsx';
import { Label } from './Label.tsx';
import { OekakiAvatar } from './OekakiAvatar.tsx';
import { Emote3D } from './Emote3D.tsx';
import { CameraModel, CamMonitor } from './camera3d.tsx';
import { useLastSaid } from '../world/common.tsx';
import { xr, xrState } from '../xr/runtime.ts';
import { useSystems } from '../systems/state.ts';
import { systemSeat } from '../../../shared/system-presentation.ts';
import { avatarHipHeight, seatedBodyOffset } from './seatedPose.ts';

function MapName({ name, height }: { name: string; height: number }) {
  const gl = useThree(s => s.gl);
  const anchor = useRef<THREE.Group>(null);
  const label = useRef<HTMLSpanElement>(null);
  const point = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    const el = document.createElement('span');
    el.className = 'mname mapname';
    el.textContent = name;
    gl.domElement.parentElement?.appendChild(el);
    label.current = el;
    return () => { el.remove(); label.current = null; };
  }, [gl, name]);
  useFrame(({ camera, size }) => {
    if (!anchor.current || !label.current) return;
    // 人物の補間後の変換から名前も投影し、モデルの読み込みには依存させない。
    camera.updateMatrixWorld();
    anchor.current.getWorldPosition(point).project(camera);
    label.current.style.visibility = point.z >= -1 && point.z <= 1 ? 'visible' : 'hidden';
    label.current.style.left = `${(point.x + 1) * size.width / 2}px`;
    label.current.style.top = `${(1 - point.y) * size.height / 2}px`;
  });
  return <group ref={anchor} position={[0, height + .22, 0]} />;
}

function seatOf(id: string) {
  const systems = useSystems.getState();
  return systems.sid === get().session ? systemSeat(systems.view, id) : undefined;
}

/** 頭の上のチャットの吹き出し（上部の顔と同じく直近 30 秒） */
function ChatBubble({ id, y }: { id: string; y: number }) {
  const said = useLastSaid(id);
  if (!said) return null;
  const text = said.replace(/\s+/g, ' ');
  return <Label position={[0, y, 0]} height={0.2} text={text.length > 32 ? `${text.slice(0, 31)}…` : text} bg="rgba(255,253,249,0.96)" fg="#26262e" />;
}

/** 2D で参加している人。3D の人と同じアバターで、スポーンエリア・置かれた場所・ついていく相手の後ろに立つ */
export function Standee({ user, overview = false }: { user: Participant; overview?: boolean }) {
  const [standingHeight, setHeight] = useState(DEFAULT_EYE_HEIGHT);
  const [seatOffset, setSeatOffset] = useState(seatedBodyOffset(avatarHipHeight(DEFAULT_PARAMS)));
  const isSeated = useSystems(s => s.sid === get().session && Object.values(s.view?.seats ?? {}).includes(user.id));
  const height = Math.max(0.3, standingHeight - (isSeated ? seatOffset : 0));
  const speaking = useStore((s) => !!s.speaking[user.id]);
  const micOff = useStore((s) => s.voice === 'connected' && s.micOn[user.id] === false);
  const ref = useRef<THREE.Group>(null);
  const card = useRef<THREE.Group>(null);
  const pos0 = spawnSlot(0);
  useFrame((_, dt) => {
    const g = ref.current;
    const s = get();
    const seat = seatOf(user.id);
    const carried = !seat && carrying.current?.id === `user:${user.id}` ? carrying.current : null;
    const standing = placesOf(s).get(user.id);
    const pos = seat ? { ...seat, ry: standing?.ry ?? g?.rotation.y ?? 0, small: false } : carried ? { x: carried.x, z: carried.z, ry: carried.ry + Math.PI, small: false } : standing;
    if (g && pos) {
      const k = carried ? 1 : Math.min(1, dt * 8);
      g.position.x += (pos.x - g.position.x) * k;
      g.position.z += (pos.z - g.position.z) * k;
      g.position.y += ((seat?.y ?? 0) - g.position.y) * k;
      let r = pos.ry - g.rotation.y;
      r = Math.atan2(Math.sin(r), Math.cos(r));
      g.rotation.y += r * k;
      const sc = g.scale.x + ((pos.small ? 0.45 : 1) - g.scale.x) * k;
      g.scale.setScalar(sc);
    }
    const b = bump(s.hits[user.id]);
    card.current?.scale.set(1 + 0.3 * b, 1 - 0.45 * b, 1 + 0.3 * b);
  }, overview ? -.1 : 0);
  return (
    <group ref={ref} position={[pos0.x, 0, pos0.z]} userData={{ hitTarget: user.id, ...(!isSeated ? { carry: `user:${user.id}` } : {}), hint: tr("ui536", user.name) } satisfies Interactable}>
      <group ref={card}>
        <Suspense fallback={null}>
          <OekakiAvatar userId={user.id} avatarId={user.id} version={user.avatar} speaking={speaking} walking={overview ? () => user.id === get().selfId && !!get().walk?.to : undefined} seated={() => !!seatOf(user.id)} onEyeHeight={setHeight} onSeatOffset={setSeatOffset} />
        </Suspense>
      </group>
      <mesh position-y={Math.max(.7, height) / 2}>
        <cylinderGeometry args={[0.35, 0.35, Math.max(.7, height), 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {speaking && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.05}>
          <ringGeometry args={[0.32, 0.42, 32]} />
          <meshBasicMaterial color="#22c55e" />
        </mesh>
      )}
      <ChatBubble id={user.id} y={height + .54} />
      <Emote3D id={user.id} />
      {overview ? <MapName name={user.name} height={height} /> : <Label
        position={[0, height + .22, 0]} text={`2D ${micOff ? '🔇 ' : ''}${user.name}`}
        bg={recentlyHit(user.id) ? 'rgba(240,177,50,0.95)' : speaking ? 'rgba(35,165,90,0.95)' : 'rgba(78,80,88,0.9)'}
        fg={recentlyHit(user.id) ? '#1e1f22' : '#ffffff'}
      />}
    </group>
  );
}

export function Entrance() {
  const participants = useStore((s) => s.participants);
  useStore((s) => s.hits);
  const in2d = participants.filter((p) => p.mode === '2d');
  return <>{in2d.map((u) => <Standee key={u.id} user={u} />)}</>;
}

/** 自分の体は三人称と外部カメラで表示する。 */
export function Avatar3D({ id, self = false, rig, overview = false }: { id: string; self?: boolean; rig?: PlayerCamera; overview?: boolean }) {
  const eye = useEyeHeight();
  const [standingHeight, setHeight] = useState(DEFAULT_EYE_HEIGHT);
  const [seatOffset, setSeatOffset] = useState(seatedBodyOffset(avatarHipHeight(DEFAULT_PARAMS)));
  const isSeated = useSystems(s => s.sid === get().session && Object.values(s.view?.seats ?? {}).includes(id));
  const height = Math.max(0.3, standingHeight - (isSeated ? seatOffset : 0));
  const onEyeHeight = useCallback((value: number) => {
    setHeight(value);
    if (self) eye.current.target = value;
  }, [self, eye]);
  const onSeatOffset = useCallback((value: number) => { setSeatOffset(value); if (self) eye.current.seatOffset = value; }, [self, eye]);
  const name = useStore((s) => s.participants.find((p) => p.id === id)?.name);
  const speaking = useStore((s) => !!s.speaking[id]);
  const micOff = useStore((s) => s.voice === 'connected' && s.micOn[id] === false);
  const holding = useStore((s) => Object.values(s.items).some((i) => i.kind === 'hammer' && i.holder === id));
  const camera = useStore((s) => Object.values(s.items).find((i) => i.kind === 'camera' && i.holder === id));
  const avatarV = useStore((s) => s.participants.find((p) => p.id === id)?.avatar ?? null);
  const ref = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const hand = useRef<THREE.Group>(null);
  const born = (self ? get().selfAvatar : get().avatars[id]) ?? { x: 0, z: 0, ry: 0 };
  // 受信ごとに React が座標を上書きすると、useFrame の補間が打ち消される。
  const initialTransform = useRef({ position: [born.x, 0, born.z] as [number, number, number], ry: born.ry });
  // 途中から見えた人の過去のジャンプは再生しない
  const jump = useRef({ n: born.jump ?? 0, at: -Infinity });
  // 電車に乗っている間は車内の位置をなめらかにつなぎ、今の電車の位置に足して置く
  const ride = useRef<NonNullable<typeof born.ride> | null>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const seat = seatOf(id);
    const state: AvatarState | undefined = (self ? get().selfAvatar : get().avatars[id]) ?? seat;
    if (!state) return;
    const r = state.ride;
    const bike = !seat && Object.values(get().items).find(i => i.kind === 'bike' && i.rider === id);
    const k = state.xr ? 1 : bike ? 1 - Math.exp(-12 * dt) : Math.min(1, dt * 10);
    if (seat) {
      ride.current = null;
      g.position.x += (seat.x - g.position.x) * k;
      g.position.z += (seat.z - g.position.z) * k;
    } else if (bike) {
      ride.current = null;
      g.position.x += (bike.x - g.position.x) * k;
      g.position.z += (bike.z - g.position.z) * k;
    } else if (r && !self) {
      const L = ride.current;
      if (!L || L.car !== r.car) ride.current = { ...r };
      else {
        L.along += (r.along - L.along) * k;
        L.side += (r.side - L.side) * k;
        L.ry += Math.atan2(Math.sin(r.ry - L.ry), Math.cos(r.ry - L.ry)) * k;
      }
      const c = carPose(serverNow(), r.car);
      const p = fromCarLocal(c, ride.current!.along, ride.current!.side);
      g.position.x = p.x;
      g.position.z = p.z;
    } else {
      ride.current = null;
      g.position.x += (state.x - g.position.x) * k;
      g.position.z += (state.z - g.position.z) * k;
    }
    const j = jump.current;
    if ((state.jump ?? 0) !== j.n) { j.n = state.jump ?? 0; j.at = performance.now(); }
    if (seat) g.position.y += (seat.y - g.position.y) * k;
    else if (bike) g.position.y = 0;
    else if (state.y !== undefined) g.position.y += (state.y - g.position.y) * Math.min(1, dt * 15);
    else g.position.y = jumpHeight(performance.now() - j.at);
    const targetRy = bike ? bike.ry : ride.current && r ? carPose(serverNow(), r.car).ry + ride.current.ry : state.ry;
    let d = targetRy - g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.order = 'YXZ';
    g.rotation.y += ride.current ? d : d * k;
    g.rotation.z = bike || state.xr ? 0 : state.lean ?? 0;
    const s = get();
    if (self && rig) {
      g.visible = rig.thirdPerson || xrState().active;
      g.position.copy(rig.avatarPosition);
      g.rotation.order = 'YXZ';
      g.rotation.set(0, rig.yaw + (xrState().active ? xr.headYaw : 0), xrState().active ? 0 : rig.lean);
    }
    const b = bump(s.hits[id]);
    body.current?.scale.set(1 + 0.3 * b, 1 - 0.45 * b, 1 + 0.3 * b);
    if (hand.current) hand.current.rotation.x = -0.4 - bump(s.swings[id], performance.now(), 350) * 1.6;
  }, -.1);
  if (!name) return null;
  return (
    <group
      ref={ref} position={initialTransform.current.position} rotation-y={initialTransform.current.ry} visible={overview || !self}
      userData={self ? { noRay: true, selfBody: true } : ({ hitTarget: id } satisfies Interactable)}
    >
      <group ref={body}>
        <Suspense fallback={null}>
          <OekakiAvatar userId={id} avatarId={id} version={avatarV} speaking={speaking} look={() => pitchOf(id)}
            tracked={() => self && xrState().active ? xr.pose : get().avatars[id]?.xr} handsOnly={() => self && xrState().active}
            trackingRoot={() => ref.current}
            seated={() => !!seatOf(id)} onSeatOffset={onSeatOffset}
            crouching={() => (self ? get().selfAvatar : get().avatars[id])?.crouching === true}
            walking={() => {
              const s = get();
              const a = self ? s.selfAvatar : s.avatars[id];
              return a?.walking === true && !a.ride && !(self && s.movementMode !== 'walk')
                && !Object.values(s.items).some((i) => i.kind === 'bike' && i.rider === id);
            }} onEyeHeight={onEyeHeight} />
        </Suspense>
      </group>
      {/* 板ポリのモデルは横から当てにくいので、照準用の当たり判定を別に置く */}
      <mesh position-y={Math.max(.7, height) / 2}>
        <cylinderGeometry args={[0.35, 0.35, Math.max(.7, height), 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {holding && (
        <group ref={hand} position={[0.32, height + (.6 - DEFAULT_EYE_HEIGHT), -0.1]}>
          <HammerModel />
        </group>
      )}
      {camera?.kind === 'camera' && (
        <>
          <CameraModel live={camera.live} position={[0.2, height + (.9 - DEFAULT_EYE_HEIGHT), -0.3]} />
          <CamMonitor item={camera} position={[0, height + (1.95 - DEFAULT_EYE_HEIGHT), 0]} />
        </>
      )}
      {speaking && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
          <ringGeometry args={[0.45, 0.62, 32]} />
          <meshBasicMaterial color="#22c55e" />
        </mesh>
      )}
      {!self && <ChatBubble id={id} y={height + .54} />}
      <Emote3D id={id} />
      {overview ? <MapName name={name} height={height} /> : <Label position={[0, height + 0.22, 0]} text={`${micOff ? '🔇 ' : ''}${name}`} bg={speaking ? 'rgba(35,165,90,0.95)' : 'rgba(0,0,0,0.75)'} />}
    </group>
  );
}
