import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, View } from '@react-three/drei';
import { useShallow } from 'zustand/react/shallow';
import * as THREE from 'three';
import type { User } from '../../../shared/protocol.ts';
import { colorOf, get, useStore } from '../store.ts';
import { useReducedMotion } from '../emotes.ts';
import { OekakiAvatar } from '../view3d/OekakiAvatar.tsx';
import { Emote3D } from '../view3d/Emote3D.tsx';
import { pitchOf } from '../spatial.ts';

/** 各 View は自分の枠だけ描くので、枠が動いたあとに残像が出ないよう毎フレーム全体を消す */
function ClearAll() {
  useFrame(({ gl }) => {
    gl.setScissorTest(false);
    // 直前の View の背景色がクリア色に残っているので透明に戻す
    gl.setClearColor(0x000000, 0);
    gl.clear(true, true);
  }, 1);
  return null;
}

/** 顔の見え方に合わせて描く頻度を変える。止め切るとまばたきや Idle の動きまで消えるため、帯表示では落とすだけにする */
function PortraitFrameDriver() {
  const invalidate = useThree((s) => s.invalidate);
  const setDpr = useThree((s) => s.setDpr);
  const { faceWindow, faceGrid, emoteActive, facesFolded, participants } = useStore(useShallow((s) => ({
    faceWindow: s.windows.some((w) => w.key.startsWith('face:')),
    faceGrid: s.windows.length === 0 && s.mode === '2d' && s.mapMode === 'none',
    emoteActive: Object.keys(s.emotes).length > 0,
    facesFolded: s.folded.faces,
    participants: s.participants,
  })));
  const stopped = facesFolded && !faceWindow;
  const full = !stopped && (faceWindow || faceGrid || emoteActive);

  useEffect(() => {
    setDpr(full ? [1, 2] : 1);
    invalidate();
    if (stopped) return;
    if (full) {
      let raf = 0;
      const loop = () => {
        invalidate();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }
    const timer = setInterval(invalidate, 50);
    return () => clearInterval(timer);
  }, [full, stopped, faceWindow, facesFolded, participants, invalidate, setDpr]);

  return null;
}

/** 顔タイルのアバターをまとめて描く 1 枚のキャンバス（タイルごとに WebGL を作らない） */
export function PortraitCanvas() {
  return (
    <Canvas className="portraits" eventSource={document.body} gl={{ alpha: true }} dpr={[1, 2]} frameloop="demand">
      <ClearAll />
      <PortraitFrameDriver />
      <View.Port />
    </Canvas>
  );
}

const vp = new THREE.Vector4();

/**
 * 背景色。キャンバスは四角くしか切り取れないので、タイルの角丸の外はシェーダーで捨てる。
 * 描く直前に View が設定したビューポート（デバイスピクセル）を読んで、その中での位置で判定する
 */
function RoundedBackground({ color, radius }: { color: THREE.Color; radius: number }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { color: { value: color }, vp: { value: new THREE.Vector4() }, radius: { value: radius } },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.999, 1.0); }',
    fragmentShader: `
      uniform vec3 color; uniform vec4 vp; uniform float radius;
      void main() {
        vec2 hs = vp.zw * 0.5;
        vec2 q = abs(gl_FragCoord.xy - vp.xy - hs) - (hs - radius);
        if (length(max(q, 0.0)) > radius) discard;
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
    depthWrite: false,
  }), [color, radius]);
  return (
    <mesh
      frustumCulled={false} renderOrder={-1} material={material}
      onBeforeRender={(gl) => {
        gl.getCurrentViewport(vp);
        material.uniforms.vp.value.copy(vp);
        material.uniforms.radius.value = radius * gl.getPixelRatio();
      }}
    >
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

/** 顔のタイルに置く。胸から上をアバターの正面（-Z 側）から写す */
function PortraitCamera({ id, small }: { id: string; small: boolean }) {
  const camera = useRef<THREE.PerspectiveCamera>(null);
  const target = useRef(small ? 1.02 : 0.95);
  const reduced = useReducedMotion();
  useFrame((_, dt) => {
    const c = camera.current;
    if (!c) return;
    const emote = get().emotes[id];
    const active = !!emote && !reduced;
    const fallen = active && emote.id === 'fall';
    const k = Math.min(1, dt * 12);
    // Include the feet, raised hands and a sideways fall inside the call tile.
    c.position.z += ((active ? emote.id === 'hop' ? -3.4 : -2.9 : small ? -1 : -1.25) - c.position.z) * k;
    c.position.x += ((fallen ? 0.45 : 0) - c.position.x) * k;
    c.position.y += ((active ? fallen ? 0.3 : 0.8 : 1.05) - c.position.y) * k;
    target.current += ((active ? fallen ? 0.25 : 0.75 : small ? 1.02 : 0.95) - target.current) * k;
    c.lookAt(c.position.x, target.current, 0);
  });
  return <PerspectiveCamera ref={camera} makeDefault fov={30} position={[0, 1.05, small ? -1 : -1.25]} />;
}

export function AvatarView({ u, speaking, small = false, comic = false }: { u: User; speaking: boolean; small?: boolean; comic?: boolean }) {
  const bg = useMemo(() => new THREE.Color(colorOf(u.id)).lerp(new THREE.Color('#ffffff'), 0.8), [u.id]);
  return (
    <View className="avatarview" index={2}>
      <RoundedBackground color={bg} radius={small ? 10 : 14} />
      <PortraitCamera id={u.id} small={small} />
      {comic && <Emote3D id={u.id} portrait />}
      <Suspense fallback={null}>
        <OekakiAvatar userId={u.id} avatarId={u.id} version={u.avatar} speaking={speaking} look={() => pitchOf(u.id)} />
      </Suspense>
    </View>
  );
}
