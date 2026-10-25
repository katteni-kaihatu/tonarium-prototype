import { HammerModel, ChessModel, NoteModel, PanelModel } from './itemModels.tsx';
export { HammerModel } from './itemModels.tsx';
import { chessView } from '../../../shared/chess.ts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ITEM_INFO, clockTime, type Item } from '../../../shared/items.ts';
import { useStore, get, nameOf, serverNow } from '../store.ts';
import { videoEls, mediaVolume } from '../mediaSync.tsx';
import { YouTubePlayer, youTubeDuration } from '../youtube.tsx';
import { youTubeThumb } from '../media.ts';
import { selectNote } from '../actions.ts';
import { itemAction, removeItem } from '../items/actions.ts';
import { PANELS, chessSelect, chessPromote, chessReset, PROMOTIONS } from '../items/panels.ts';
import { drawPanel } from '../items/PanelCanvas.tsx';
import { carrying, type Interactable } from './interact.ts';
import { drawText, makeCanvasTexture } from './textTexture.ts';
import { Camera3D } from './camera3d.tsx';
import { Label } from './Label.tsx';
import { removable, useFollow } from './itemHelpers.ts';
import { Dice3D } from './dice3d.tsx';

const TABLE_Y = 0.78;

function Note3D({ item }: { item: Item & { kind: 'note' } }) {
  const selfId = useStore((s) => s.selfId);
  const selected = useStore((s) => s.selectedNote === item.id);
  const participants = useStore((s) => s.participants);
  const { canvas, tex } = useMemo(() => makeCanvasTexture(512, 384), []);
  useEffect(() => {
    const other = item.editingBy && item.editingBy !== selfId;
    drawText(canvas, [
      { text: item.text || '（空の付箋）', color: item.text ? '#1c1917' : '#78716c', size: 64 },
      ...(other ? [{ text: `✏ ${nameOf(item.editingBy)} が編集中`, size: 36, color: '#b91c1c' }] : []),
    ], { bg: item.color });
    tex.needsUpdate = true;
  }, [item.text, item.color, item.editingBy, participants, selfId, canvas, tex]);
  const ref = useRef<THREE.Group>(null);
  useFollow(ref, item.id, item.x, item.z, item.ry);
  const data: Interactable = {
    ...removable(item),
    hint: 'クリック: 編集',
    // 文字を打てるようにマウスのロックを外す
    use: () => { selectNote(item.id); document.exitPointerLock(); },
  };
  return (
    <group ref={ref} position={[item.x, 0, item.z]} rotation-y={item.ry} userData={data}>
      <NoteModel color={item.color} texture={tex} selected={selected} />
    </group>
  );
}

function Hammer3D({ item }: { item: Item & { kind: 'hammer' } }) {
  const ref = useRef<THREE.Group>(null);
  useFollow(ref, item.id, item.x, item.z, item.ry);
  if (item.holder) return null;
  const data: Interactable = {
    ...removable(item),
    hint: 'クリック: ハンマーを拾う',
    use: () => itemAction(item.id, { a: 'pick' }),
  };
  return (
    <group ref={ref} position={[item.x, 0, item.z]} rotation-y={item.ry} userData={data}>
      <HammerModel position={[0, 0.12, 0.3]} rotation-x={-Math.PI / 2} />
      {/* 拾いやすいよう大きめの当たり判定 */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.5, 0.3, 0.9]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Chess3D({ item }: { item: Item & { kind: 'chess' | 'chessAi' } }) {
  const ref = useRef<THREE.Group>(null);
  useFollow(ref, item.id, item.x, item.z, item.ry);
  const ui = useStore((s) => s.itemUi[item.id]);
  const active = ui?.chessRevision === item.chess.revision;
  const view = chessView(item.chess);
  const promoting = active && ui?.promotionTo !== undefined;
  const reset = () => {
    const it = get().items[item.id];
    if (it) chessReset(it, get().itemUi[item.id] ?? {});
  };
  const pick = (i: number) => () => {
    const it = get().items[item.id];
    if (it) chessSelect(it, get().itemUi[item.id] ?? {}, i);
  };
  const sqData = (i: number): Interactable => ({ use: pick(i), hint: view.over ? view.status : `${view.status} · クリック: 駒を選ぶ / 動かす` });
  return <group ref={ref} position={[item.x, 0, item.z]} rotation-y={item.ry}>
    <ChessModel item={item} ui={ui} tableData={{ ...removable(item), hint: ITEM_INFO[item.kind].name }} sqData={sqData} actions={<>
      {promoting ? PROMOTIONS.map(([promotion, label], index) => (
        <group key={promotion} position={[(index - 1.5) * 0.46, TABLE_Y, 1.12]}
          userData={{ use: () => {
            const it = get().items[item.id];
            if (it) chessPromote(it, get().itemUi[item.id] ?? {}, promotion);
          }, hint: `${label}に昇格` } satisfies Interactable}>
          <mesh><boxGeometry args={[0.43, 0.08, 0.25]} /><meshStandardMaterial color="#476b8c" /></mesh>
          <Label text={label} position={[0, 0.14, 0]} height={0.07} />
        </group>
      )) : <group position={[0, TABLE_Y, 1.12]} userData={{ use: reset, hint: ui?.resetConfirm ? 'もう一度クリックして初期化' : '新しい対局を始める' } satisfies Interactable}>
        <mesh><boxGeometry args={[0.8, 0.08, 0.25]} /><meshStandardMaterial color="#476b8c" /></mesh>
        <Label text={ui?.resetConfirm ? '初期化する？ クリックで確定' : '新しい対局'} position={[0, 0.14, 0]} height={0.08} />
      </group>}</>} />
  </group>;
}

const PANEL_H = 1.8;

function CompatPanel3D({ item }: { item: Item }) {
  const ref = useRef<THREE.Group>(null);
  useFollow(ref, item.id, item.x, item.z, item.ry);
  const panel = PANELS[item.kind]!;
  const ui = useStore((s) => s.itemUi[item.id]);
  const { canvas, tex } = useMemo(() => {
    const cv = document.createElement('canvas');
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return { canvas: cv, tex: t };
  }, []);
  useEffect(() => {
    drawPanel(canvas, item, ui ?? {});
    tex.needsUpdate = true;
  }, [item, ui, canvas, tex]);
  const w = (PANEL_H * panel.w) / panel.h;
  const at = (hit: THREE.Intersection) => [hit.uv!.x * panel.w, (1 - hit.uv!.y) * panel.h] as const;
  const latest = () => [get().items[item.id] ?? item, get().itemUi[item.id] ?? {}] as const;
  const data: Interactable = {
    ...removable(item),
    ...(panel.drag
      ? {
        hint: 'クリックしたまま照準を動かす: 描く',
        drag: (phase, hit) => {
          if (hit?.uv) panel.drag!(phase, ...at(hit), ...latest());
          else if (phase === 'end') panel.drag!('end', 0, 0, ...latest());
        },
      } satisfies Interactable
      : {
        hint: 'クリック: 照準の位置を押す',
        use: (hit) => { if (hit.uv) panel.click(...at(hit), ...latest()); },
      } satisfies Interactable),
  };
  return (
    <group ref={ref} position={[item.x, 0, item.z]} rotation-y={item.ry}>
      <PanelModel item={item} width={w} texture={tex} data={data} />
    </group>
  );
}

const BOARD_Y = 1.6;
/** 板の大きさ（m）。縦長も横長も収まるように */
function boardSize(w: number, h: number): [number, number] {
  const a = w / h;
  let bw = 1.8;
  let bh = bw / a;
  if (bh > 1.3) { bh = 1.3; bw = bh * a; }
  return [bw, bh];
}

type ClockItem = Item & { kind: 'video' | 'youtube' };
const playToggle = (item: ClockItem): Interactable => ({
  ...removable(item),
  hint: 'クリック: 再生／一時停止（みんな）',
  use: () => {
    const it = get().items[item.id];
    if (it?.kind !== 'video' && it?.kind !== 'youtube') return;
    const dur = it.kind === 'video' ? videoEls.get(it.id)?.duration ?? Infinity : youTubeDuration(it.id) || Infinity;
    const pos = Math.min(clockTime(it.clock, serverNow()), dur);
    const ended = pos >= dur - 0.2;
    itemAction(it.id, { a: it.clock.playing && !ended ? 'mediaPause' : 'mediaPlay', pos: ended ? 0 : pos });
  },
});

function Board({ item, w, h, data, children, label }: {
  item: Item; w: number; h: number; data: Interactable; children: React.ReactNode; label?: string;
}) {
  const ref = useRef<THREE.Group>(null);
  useFollow(ref, item.id, item.x, item.z, item.ry);
  return (
    <group ref={ref} position={[item.x, 0, item.z]} rotation-y={item.ry}>
      <mesh position-y={(BOARD_Y - h / 2) / 2}>
        <cylinderGeometry args={[0.04, 0.04, BOARD_Y - h / 2]} />
        <meshStandardMaterial color="#4e5058" />
      </mesh>
      <mesh position={[0, BOARD_Y, -0.03]}>
        <boxGeometry args={[w + 0.08, h + 0.08, 0.04]} />
        <meshStandardMaterial color="#1e1f22" />
      </mesh>
      <mesh position-y={BOARD_Y} userData={data}>
        <planeGeometry args={[w, h]} />
        {children}
      </mesh>
      {label && <Label position={[0, BOARD_Y + h / 2 + 0.18, 0]} height={0.16} text={label} />}
    </group>
  );
}

function Image3D({ item }: { item: Item & { kind: 'image' } }) {
  const tex = useMemo(() => {
    const t = new THREE.TextureLoader().load(item.url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [item.url]);
  useEffect(() => () => tex.dispose(), [tex]);
  const [w, h] = boardSize(item.w, item.h);
  return <Board item={item} w={w} h={h} data={removable(item)}><meshBasicMaterial map={tex} toneMapped={false} /></Board>;
}

function Video3D({ item }: { item: Item & { kind: 'video' } }) {
  // <video> は MediaSync が作るので、できるまで待つ
  const [tex, setTex] = useState<THREE.VideoTexture | null>(null);
  const shown = useRef(-1);
  useFrame(() => {
    const el = videoEls.get(item.id);
    if (!el) return;
    if (!tex) {
      const t = new THREE.VideoTexture(el);
      t.colorSpace = THREE.SRGBColorSpace;
      setTex(t);
      return;
    }
    // 新しいフレームの通知は再生中しか来ないので、止まっているときの最初の 1 枚やシーク後はここで描き直す
    if (el.paused && el.readyState >= 2 && el.currentTime !== shown.current) {
      shown.current = el.currentTime;
      tex.needsUpdate = true;
    }
  });
  useEffect(() => () => tex?.dispose(), [tex]);
  const [w, h] = boardSize(item.w, item.h);
  return (
    <Board item={item} w={w} h={h} data={playToggle(item)} label={item.clock.playing ? '▶ 動画' : '❚❚ 動画（クリックで再生）'}>
      {/* 同じ種類の要素だと R3F はマテリアルを使い回し、仮の暗い color が残って映像が真っ黒になるので key で作り直す */}
      {tex ? <meshBasicMaterial key="video" map={tex} toneMapped={false} /> : <meshBasicMaterial key="empty" color="#111" />}
    </Board>
  );
}

/** px / m。YouTube のプレーヤーを板にぴったり重ねるための Html の倍率（distanceFactor） */
const YT_PX = 800;

function YouTube3D({ item }: { item: Item & { kind: 'youtube' } }) {
  const thumb = useMemo(() => {
    const t = new THREE.TextureLoader().load(youTubeThumb(item.videoId));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [item.videoId]);
  useEffect(() => () => thumb.dispose(), [thumb]);
  const [w, h] = boardSize(16, 9);
  // HTML の重ね表示は板の裏から見ても映ってしまうので、カメラが裏側にいるときは隠す
  const overlay = useRef<HTMLDivElement>(null);
  useFrame(({ camera }) => {
    const it = get().items[item.id] ?? item;
    const front = Math.sin(it.ry) * (camera.position.x - it.x) + Math.cos(it.ry) * (camera.position.z - it.z) > 0;
    if (overlay.current) overlay.current.style.visibility = front ? 'visible' : 'hidden';
  });
  // 2D のウィンドウでも開いているときは、二重に鳴らないよう板の方を消音
  const volume = () => (get().windows.some((x) => x.key === `item:${item.id}`) ? 0 : mediaVolume(item));
  return (
    <Board item={item} w={w} h={h} data={playToggle(item)} label={`YouTube${item.title ? `：${item.title.slice(0, 30)}` : ''}`}>
      <meshBasicMaterial map={thumb} toneMapped={false} />
      {/* 他サイトの動画はテクスチャにできないので、本物のプレーヤーを板の位置に重ねる */}
      <Html transform distanceFactor={400 / YT_PX} position={[0, 0, 0.005]} pointerEvents="none" zIndexRange={[1, 0]}>
        <div ref={overlay} className="yt3d" style={{ width: w * YT_PX, height: h * YT_PX }}>
          <YouTubePlayer item={item} volume={volume} />
        </div>
      </Html>
    </Board>
  );
}

/** 注目を集めたアイテムの足元の輪と光の柱 */
export function AttentionGlow({ item }: { item: Item }) {
  const ref = useRef<THREE.Group>(null);
  const ring = useRef<THREE.MeshBasicMaterial>(null);
  const beam = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const until = get().attention[item.id] ?? 0;
    const left = until - performance.now();
    g.visible = left > 0;
    if (!g.visible) return;
    const it = get().items[item.id] ?? item;
    g.position.set(it.x, 0, it.z);
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
    const fade = Math.min(1, left / 1500);
    if (ring.current) ring.current.opacity = (0.5 + 0.5 * pulse) * fade;
    if (beam.current) beam.current.opacity = (0.12 + 0.12 * pulse) * fade;
    g.scale.setScalar(1 + 0.08 * pulse);
  });
  return (
    <group ref={ref} visible={false} userData={{ noRay: true }}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
        <ringGeometry args={[0.9, 1.1, 48]} />
        <meshBasicMaterial ref={ring} color="#FFB347" transparent depthWrite={false} />
      </mesh>
      <mesh position-y={1.6}>
        <cylinderGeometry args={[0.95, 0.95, 3.2, 32, 1, true]} />
        <meshBasicMaterial ref={beam} color="#FFD27A" transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function Item3D({ item }: { item: Item }) {
  switch (item.kind) {
    case 'image': return <Image3D item={item} />;
    case 'video': return <Video3D item={item} />;
    case 'youtube': return <YouTube3D item={item} />;
    case 'note': return <Note3D item={item} />;
    case 'hammer': return <Hammer3D item={item} />;
    case 'camera': return <Camera3D item={item} />;
    case 'chessAi':
    case 'chess': return <Chess3D item={item} />;
    case 'dice': return <Dice3D item={item} />;
    default: return PANELS[item.kind] ? <CompatPanel3D item={item} /> : null;
  }
}
