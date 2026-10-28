import { t as tr, getLanguage } from '../i18n/index.ts';
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { MarketProduct } from '../../../shared/market.ts';
import { EMOTES } from '../i18n/static.ts';
import { type ActiveEmote } from '../../../shared/emotes.ts';
import { OekakiAvatar } from '../view3d/OekakiAvatar.tsx';
import { useStore } from '../store.ts';
import { Icon } from '../world/Icon.tsx';
import { WorldMesh, WORLD_BG } from '../view3d/worlds3d.tsx';
import { BikeModel } from '../view3d/BikeModel.tsx';
import { ITEM_INFO } from '../i18n/static.ts';
import { createItem, type Item, type ItemKind } from '../../../shared/items.ts';
import { ChessModel, HammerModel, NoteModel, PanelModel } from '../view3d/itemModels.tsx';
import { CameraStand } from '../view3d/cameraModel.tsx';
import { DiceStand } from '../view3d/diceModel.tsx';
import { MirrorModel } from '../view3d/mirror3d.tsx';
import { JumpPadModel } from '../view3d/jumpPad3d.tsx';
import { Label } from '../view3d/Label.tsx';
import { drawText, makeCanvasTexture } from '../view3d/textTexture.ts';
import { drawCanvasPanel } from '../items/canvasDrawing.ts';
import { contentText } from '../content-translations.ts';

class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p className="market-3d-error">{tr("ui437")}</p> : this.props.children; }
}

/** Same dimensions and stand as the in-world note, without session interactions. */
function NotePreview({ text }: { text: string }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 768;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fde68a'; ctx.fillRect(0, 0, 1024, 768);
    ctx.fillStyle = '#1c1917'; ctx.font = '48px sans-serif';
    let y = 105;
    for (const line of text.split('\n')) {
      let row = '';
      for (const char of line) {
        if (ctx.measureText(row + char).width > 900) { ctx.fillText(row, 60, y); y += 75; row = ''; }
        row += char;
      }
      ctx.fillText(row, 60, y); y += 80;
    }
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace;
    return map;
  }, [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <group>
    <mesh position-y={.45}><cylinderGeometry args={[.03, .03, .9]} /><meshStandardMaterial color="#78716c" /></mesh>
    <group position-y={1.5}>
      <mesh><boxGeometry args={[1.6, 1.2, .04]} /><meshStandardMaterial color="#fde68a" /></mesh>
      {[1, -1].map((side) => <mesh key={side} position-z={side * .021} rotation-y={side === 1 ? 0 : Math.PI}><planeGeometry args={[1.6, 1.2]} /><meshBasicMaterial map={texture} toneMapped={false} /></mesh>)}
    </group>
  </group>;
}

function ProductPreview({ product }: { product: MarketProduct }) {
  const selfId = useStore((s) => s.selfId);
  const avatar = useStore((s) => s.users.find((u) => u.id === s.selfId)?.avatar ?? null);
  const [emote, setEmote] = useState<ActiveEmote | null>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  useEffect(() => {
    if (!emote) return;
    const timer = setTimeout(() => setEmote(null), EMOTES[emote.id].duration);
    return () => clearTimeout(timer);
  }, [emote]);
  const item = product.category === 'items';
  const world = product.category === 'worlds';
  return <div className="market-3d-preview">
    <div className="market-3d-stage" role="img" aria-label={tr("ui438", product.name)}>
      <PreviewBoundary>
        <Canvas camera={{ position: world ? [24, 26, 24] : item ? [2.4, 2, 3.7] : [0, 1.05, -4.6], fov: world ? 45 : 35 }} dpr={[1, 1.5]} fallback={<p>{tr("ui439")}</p>}>
          <color attach="background" args={[product.category === 'worlds' ? WORLD_BG[product.content] : product.color]} />
          {!world && <><ambientLight intensity={1.8} /><directionalLight position={[3, 5, 4]} intensity={2} /></>}
          <Suspense fallback={null}>
            {product.category === 'worlds' ? <WorldMesh kind={product.content} /> : product.category === 'items' ? product.kind === 'bike' ? <BikeModel /> : <NotePreview text={contentText(`product/${product.id}`, 'text', product.text)} /> : <OekakiAvatar avatarId={selfId} version={avatar} speaking={false} previewEmote={emote} />}
          </Suspense>
          {!world && <mesh rotation-x={-Math.PI / 2} position-y={-.03}><circleGeometry args={[1.45, 48]} /><meshStandardMaterial color="#fffdf9" /></mesh>}
          <OrbitControls ref={controls} target={[0, world ? 0 : item ? 1.1 : .85, 0]} enablePan={false} minDistance={world ? 10 : 2.5} maxDistance={world ? 60 : 7} maxPolarAngle={world ? Math.PI / 2.6 : Math.PI / 2} />
        </Canvas>
      </PreviewBoundary>
      <span className="market-3d-label">{tr("ui440")}</span>
    </div>
    <div className="market-preview-controls">
      {product.category === 'emotes' && <button className="primary" disabled={!!emote} onClick={() => setEmote({ id: product.content, at: Date.now(), started: performance.now() })}><Icon name="play" />{emote ? tr("ui441") : tr("ui442")}</button>}
      <button onClick={() => controls.current?.reset()}><Icon name="eye" />{tr("ui443")}</button>
    </div>
    <p className="sub wrap" role="status">{emote ? EMOTES[emote.id].caption : tr("ui444")}</p>
  </div>;
}

function InitialNote({ item }: { item: Item & { kind: 'note' } }) {
  const { canvas, tex } = useMemo(() => makeCanvasTexture(512, 384), []);
  useEffect(() => {
    drawText(canvas, [{ text: tr("ui445"), color: '#78716c', size: 64 }], { bg: item.color });
    tex.needsUpdate = true;
  }, [canvas, tex, item.color, getLanguage()]);
  useEffect(() => () => tex.dispose(), [tex]);
  return <NoteModel color={item.color} texture={tex} />;
}

function InitialCanvas({ item }: { item: Item & { kind: 'canvas' } }) {
  const { canvas, tex } = useMemo(() => makeCanvasTexture(1280, 1040), []);
  useEffect(() => {
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    drawCanvasPanel(ctx, item, {});
    tex.needsUpdate = true;
  }, [canvas, tex, item, getLanguage()]);
  useEffect(() => () => tex.dispose(), [tex]);
  return <PanelModel item={item} width={1.8 * 640 / 520} texture={tex} />;
}

function InitialModel({ item }: { item: Item }) {
  switch (item.kind) {
    case 'telephone': return <><mesh position-y={0.5}><boxGeometry args={[1.4, 1, 0.25]} /><meshStandardMaterial color="#f6e4ec" /></mesh><Label text="お絵描き伝言" position={[0, 1.2, 0]} height={0.18} /></>;
    case 'jumpPad': return <JumpPadModel />;
    case 'mirror': return <MirrorModel />;
    case 'bike': return <BikeModel />;
    case 'note': return <InitialNote item={item} />;
    case 'hammer': return <HammerModel position={[0, 0.12, 0.3]} rotation-x={-Math.PI / 2} />;
    case 'chess':
    case 'chessAi': return <ChessModel item={item} />;
    case 'canvas': return <InitialCanvas item={item} />;
    case 'camera': return <CameraStand />;
    case 'dice': return <><DiceStand /><Label text={tr("ui446")} position={[0, 1.25, 0]} height={0.1} /></>;
    default: return null;
  }
}

function StandardPreview({ kind }: { kind: ItemKind }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const rememberView = useCallback((instance: OrbitControlsImpl | null) => {
    controls.current = instance;
    // target の適用後に保存し、リセットで原点へ向き直るのを防ぐ。
    instance?.saveState();
  }, []);
  const item = useMemo(() => createItem(kind, { id: 'preview', x: 0, z: 0, ry: 0, createdBy: '' }, () => 0), [kind]);
  const targetY = kind === 'hammer' ? 0.2 : kind === 'canvas' ? 1.4 : kind === 'note' ? 1.1 : 0.75;
  const position: [number, number, number] = kind === 'hammer' ? [1.1, 1.1, 1.7] : [2.4, targetY + 1.6, kind === 'camera' ? -3.7 : 3.7];
  if (!item || !ITEM_INFO[kind].in3d) return <img className="item-illustration" src={ITEM_INFO[kind].illustration} alt={ITEM_INFO[kind].name} />;
  return <div className="market-3d-preview">
    <div className="market-3d-stage" role="img" aria-label={tr("ui438", ITEM_INFO[kind].name)}>
      <PreviewBoundary>
        <Canvas camera={{ position, fov: 35 }} dpr={[1, 1.5]} fallback={<p>{tr("ui439")}</p>}>
          <color attach="background" args={[ITEM_INFO[kind].tint]} />
          <ambientLight intensity={1.8} /><directionalLight position={[3, 5, 4]} intensity={2} />
          <InitialModel item={item} />
          <mesh rotation-x={-Math.PI / 2} position-y={-.03}><circleGeometry args={[1.45, 48]} /><meshStandardMaterial color="#fffdf9" /></mesh>
          <OrbitControls ref={rememberView} target={[0, targetY, 0]} enablePan={false} minDistance={0.8} maxDistance={7} maxPolarAngle={Math.PI / 2} />
        </Canvas>
      </PreviewBoundary>
      <span className="market-3d-label">{tr("ui440")}</span>
    </div>
    <div className="market-preview-controls"><button onClick={() => controls.current?.reset()}><Icon name="eye" />{tr("ui443")}</button></div>
    <p className="sub wrap">{tr("ui447")}</p>
  </div>;
}

export default function Preview3D(props: { product: MarketProduct; kind?: never } | { kind: ItemKind; product?: never }) {
  return props.product ? <ProductPreview product={props.product} /> : <StandardPreview kind={props.kind} />;
}
