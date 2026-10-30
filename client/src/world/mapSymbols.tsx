import { memo, useEffect, useState } from 'react';
import { ROOM_HALF, SPAWN } from '../../../shared/protocol.ts';
import type { WorldKind } from '../../../shared/worlds.ts';
import { WORLDS } from '../i18n/static.ts';
import { CAR, LOOP, STATION_PARTS, carPose, trackAt } from '../../../shared/city.ts';
import { serverNow } from '../store.ts';
import { boundsOf } from './mapShared.ts';
/**
 * 床・スポーン・地物の静的な層。アバター受信では描き直さないよう、ビュー変換と
 * ワールド種別だけを数値で受け取る memo 部品にする（変換が変われば当然描き直す）。
 */
export const MapBackdrop = memo(function MapBackdrop({ kind, tx, ty, k }: { kind: WorldKind; tx: number; ty: number; k: number }) {
  const b = boundsOf(kind);
  return (
    <g transform={`translate(${tx} ${ty}) scale(${k})`}>
      <rect className="mfloor" x={b.minX} y={b.minZ} width={b.maxX - b.minX} height={b.maxZ - b.minZ} rx={0.4} />
      {WORLDS[kind].extent && <rect className="mfloor" x={-ROOM_HALF} y={-ROOM_HALF} width={ROOM_HALF * 2} height={ROOM_HALF * 2} rx={0.4} />}
      <circle className="mspawn" cx={SPAWN.x} cy={SPAWN.z} r={SPAWN.r} />
      {/* 地上の物だけ（マンションの上の階の壁や駅の柵は描かない） */}
      {WORLDS[kind].solids.filter((s) => (s.y0 ?? 0) < 0.5).map((s, i) => ('r' in s
        ? <circle key={i} className="msolid" cx={s.x} cy={s.z} r={s.r} />
        : <rect key={i} className="msolid" x={s.x - s.w / 2} y={s.z - s.d / 2} width={s.w} height={s.d} rx={0.08} />))}
    </g>
  );
});

/** 置きアイテムの目印。自分の位置が変わったときだけ描き直す */
export const MapItemMark = memo(function MapItemMark({ left, top, tint, ink, name, mark }: { left: number; top: number; tint: string; ink: string; name: string; mark: string }) {
  return (
    <span className="mitem" style={{ left, top, background: tint, color: ink }} title={name}>
      {mark}
    </span>
  );
});

const TRACK_PATH = (() => {
  const pts: string[] = [];
  for (let s = 0; s <= LOOP; s += 2) { const p = trackAt(s); pts.push(`${p.x.toFixed(2)},${p.z.toFixed(2)}`); }
  return `M${pts.join('L')}Z`;
})();

/** 2D マップの街の線路・駅と、走っている電車。電車の位置は時刻から出すので、短い間隔で描き直す */
export function CityTrain2D() {
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
