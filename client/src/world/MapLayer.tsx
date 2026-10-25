import { t as tr } from '../i18n/index.ts';
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { ITEM_INFO } from '../i18n/static.ts';
import { ROOM_HALF, SPAWN } from '../../../shared/protocol.ts';
import { NEAR_RANGE, VOICE_RANGE } from '../../../shared/places.ts';
import { WORLDS } from '../i18n/static.ts';
import { type WorldKind } from '../../../shared/worlds.ts';
import { useStore, get, worldKindOf, serverNow } from '../store.ts';
import { CAR, LOOP, STATION_PARTS, carPose, trackAt } from '../../../shared/city.ts';
import { placesOf } from '../spatial.ts';
import { HEAT_CELL_M, cellCenter } from '../voiceHeat.ts';
import { touchOnly } from '../phone.ts';
import { Face } from './common.tsx';
import { boundsOf, moveSelfTo, useHeatCells, useMapBox, useSpaceReset } from './mapShared.ts';

// 3D マップは three 一式が重いので、3D マップを選んだときだけ読み込む
const Map3D = lazy(() => import('./Map3D.tsx').then((m) => ({ default: m.Map3D })));

interface View2D { k: number; tx: number; ty: number }

function Map2D({ kind }: { kind: WorldKind }) {
  const box = useMapBox();
  const b = boundsOf(kind);
  const fit = useMemo<View2D>(() => {
    const k = Math.min((box.x1 - box.x0) / (b.maxX - b.minX), (box.y1 - box.y0) / (b.maxZ - b.minZ)) * 0.94;
    return { k, tx: (box.x0 + box.x1) / 2 - ((b.minX + b.maxX) / 2) * k, ty: (box.y0 + box.y1) / 2 - ((b.minZ + b.maxZ) / 2) * k };
  }, [box.x0, box.x1, box.y0, box.y1, b.minX, b.maxX, b.minZ, b.maxZ]);
  // null のあいだは画面に合わせて収める（パネルをたたむ・窓の大きさが変わるのにも付いていく）
  const [view, setView] = useState<View2D | null>(null);
  const v = view ?? fit;
  useSpaceReset(() => setView(null));
  useEffect(() => setView(null), [kind]);

  useStore((s) => s.avatars);
  useStore((s) => s.participants);
  const heat = useHeatCells();
  const items = useStore((s) => s.items);
  const selfId = useStore((s) => s.selfId);
  const walk = useStore((s) => s.walk);
  const places = placesOf(get());
  // ほかの人は位置がとびとびに届くので目印をなめらかに動かす。ただし拡大・平行移動した直後は追従が遅れないよう瞬時に
  const prevView = useRef(v);
  const smooth = prevView.current === v || (prevView.current.k === v.k && prevView.current.tx === v.tx && prevView.current.ty === v.ty);
  prevView.current = v;
  const me = places.get(selfId);
  const toScreen = (x: number, z: number) => ({ left: v.tx + x * v.k, top: v.ty + z * v.k });

  const down = useRef<{ x: number; y: number; button: number; v: View2D } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    // ホイールを押したときの自動スクロールを出さない
    if (e.button === 1) e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    down.current = { x: e.clientX, y: e.clientY, button: e.button, v };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = down.current;
    if (!d || d.button !== 1 || touchOnly) return;
    setView({ ...d.v, tx: d.v.tx + e.clientX - d.x, ty: d.v.ty + e.clientY - d.y });
  };
  const onUp = (e: React.PointerEvent) => {
    const d = down.current;
    down.current = null;
    if (!d || d.button !== 0 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
    moveSelfTo((e.clientX - v.tx) / v.k, (e.clientY - v.ty) / v.k);
  };
  const onWheel = (e: React.WheelEvent) => {
    const f = Math.exp(-e.deltaY * 0.0015);
    const k = Math.max(fit.k * 0.3, Math.min(fit.k * 8, v.k * f));
    const r = k / v.k;
    setView({ k, tx: e.clientX - (e.clientX - v.tx) * r, ty: e.clientY - (e.clientY - v.ty) * r });
  };

  return (
    <div className="map2d" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { down.current = null; }} onWheel={onWheel} onAuxClick={(e) => e.preventDefault()}>
      <svg width={box.w} height={box.h} aria-hidden="true">
        <defs>
          <radialGradient id="voiceheat">
            <stop offset="0%" stopColor="#ff9a3c" stopOpacity="0.85" />
            <stop offset="60%" stopColor="#ff7a2f" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ff7a2f" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g transform={`translate(${v.tx} ${v.ty}) scale(${v.k})`}>
          <rect className="mfloor" x={b.minX} y={b.minZ} width={b.maxX - b.minX} height={b.maxZ - b.minZ} rx={0.4} />
          {WORLDS[kind].extent && <rect className="mfloor" x={-ROOM_HALF} y={-ROOM_HALF} width={ROOM_HALF * 2} height={ROOM_HALF * 2} rx={0.4} />}
          <circle className="mspawn" cx={SPAWN.x} cy={SPAWN.z} r={SPAWN.r} />
          {/* 地上の物だけ（マンションの上の階の壁や駅の柵は描かない） */}
          {WORLDS[kind].solids.filter((s) => (s.y0 ?? 0) < 0.5).map((s, i) => ('r' in s
            ? <circle key={i} className="msolid" cx={s.x} cy={s.z} r={s.r} />
            : <rect key={i} className="msolid" x={s.x - s.w / 2} y={s.z - s.d / 2} width={s.w} height={s.d} rx={0.08} />))}
          {/* 床と家具より上に出さないと、extent のあるワールドで内側の床に隠れる */}
          {heat.map((c) => {
            const ctr = cellCenter(c.cx, c.cz);
            return <circle key={`${c.cx},${c.cz}`} className="mheat" cx={ctr.x} cy={ctr.z} r={HEAT_CELL_M * 0.95} fill="url(#voiceheat)" opacity={0.25 + c.heat * 0.55} />;
          })}
          {kind === 'city' && <CityTrain2D />}
          {me && walk?.to && <line className="mroute" x1={me.x} y1={me.z} x2={walk.to.x} y2={walk.to.z} />}
          {walk?.to && <g className="mgoal"><circle cx={walk.to.x} cy={walk.to.z} r={0.45} /><circle cx={walk.to.x} cy={walk.to.z} r={0.12} /></g>}
          {me && <circle className="mvoice" cx={me.x} cy={me.z} r={VOICE_RANGE} />}
          {me && <circle className="mnear" cx={me.x} cy={me.z} r={NEAR_RANGE} />}
        </g>
      </svg>
      {Object.values(items).filter((it) => !('holder' in it && it.holder)).map((it) => (
        <span key={it.id} className="mitem" style={{ ...toScreen(it.x, it.z), background: ITEM_INFO[it.kind].tint, color: ITEM_INFO[it.kind].ink }} title={ITEM_INFO[it.kind].name}>
          {ITEM_INFO[it.kind].mark}
        </span>
      ))}
      {get().participants.map((u) => {
        const p = places.get(u.id);
        if (!p) return null;
        return (
          <span key={u.id} className={`mperson ${u.id === selfId ? 'self' : smooth ? 'smooth' : ''} ${p.small ? 'small' : ''}`} style={toScreen(p.x, p.z)}>
            <Face id={u.id} name={u.name} size={p.small ? 22 : 30} />
            <span className="mname">{u.id === selfId ? tr("ui84") : u.name}</span>
          </span>
        );
      })}
    </div>
  );
}

const TRACK_PATH = (() => {
  const pts: string[] = [];
  for (let s = 0; s <= LOOP; s += 2) { const p = trackAt(s); pts.push(`${p.x.toFixed(2)},${p.z.toFixed(2)}`); }
  return `M${pts.join('L')}Z`;
})();

/** 2D マップの街の線路・駅と、走っている電車。電車の位置は時刻から出すので、短い間隔で描き直す */
function CityTrain2D() {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 150);
    return () => clearInterval(t);
  }, []);
  const now = serverNow();
  return (
    <>
      <path className="mtrack" d={TRACK_PATH} />
      {STATION_PARTS.map((p, i) => {
        const r = p.surfaces[0];
        return <rect key={i} className="mstation" x={r.x0} y={r.z0} width={r.x1 - r.x0} height={r.z1 - r.z0} />;
      })}
      {[0, 1].map((k) => {
        const c = carPose(now, k);
        return (
          <rect
            key={k} className="mtrain" x={-CAR.w / 2} y={-CAR.len / 2} width={CAR.w} height={CAR.len} rx={0.4}
            transform={`translate(${c.x} ${c.z}) rotate(${(-c.ry * 180) / Math.PI})`}
          />
        );
      })}
    </>
  );
}

/** 2D の背景に出すマップ。マップを入れるべきか試すためのもので、設定で なし／2D／3D を選ぶ */
export function MapLayer() {
  const mapMode = useStore((s) => s.mapMode);
  const kind = useStore((s) => worldKindOf(s));
  if (mapMode === '2d') return <Map2D kind={kind} />;
  if (mapMode === '3d') return (
    // 読み込みが終わるまでは 2D マップを出しておく
    <Suspense fallback={<Map2D kind={kind} />}>
      <Map3D key={kind} kind={kind} />
    </Suspense>
  );
  return null;
}
