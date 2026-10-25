import { useEffect, useRef, useState } from 'react';
import { ROOM_HALF } from '../../../shared/protocol.ts';
import { WORLDS } from '../i18n/static.ts';
import { type WorldKind } from '../../../shared/worlds.ts';
import { useStore, get, worldKindOf } from '../store.ts';
import { placesOf } from '../spatial.ts';
import { walkTo } from '../walk.ts';
import { usePhone } from '../phone.ts';
import { addHeat, decayHeat, heatCells, type HeatCell } from '../voiceHeat.ts';

export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }

export const boundsOf = (k: WorldKind): Bounds => WORLDS[k].extent ?? { minX: -ROOM_HALF, maxX: ROOM_HALF, minZ: -ROOM_HALF, maxZ: ROOM_HALF };

/** 前面のパネルと顔の帯に隠れない、マップを収める画面の範囲 */
export function useMapBox() {
  const phone = usePhone();
  const folded = useStore((s) => s.folded);
  const [size, setSize] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => {
    const on = () => setSize({ w: innerWidth, h: innerHeight });
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);
  const inset = phone
    ? { l: 8, t: 150, r: 8, b: 130 }
    : { l: folded.left ? 92 : 360, t: 150, r: folded.right ? 92 : 340, b: 144 };
  return { ...size, x0: inset.l, y0: inset.t, x1: Math.max(inset.l + 120, size.w - inset.r), y1: Math.max(inset.t + 120, size.h - inset.b) };
}

export function moveSelfTo(x: number, z: number) {
  const s = get();
  const from = placesOf(s).get(s.selfId);
  if (from) walkTo(x, z, from);
}

/** ボタンなどにフォーカスがあるときのスペースはその操作に任せ、何も選んでいない（マップを押した後など）ときだけ拾う */
const onMap = (t: EventTarget | null) => t === document.body || (t instanceof Element && !!t.closest('.map2d, .map3d'));

export function useSpaceReset(reset: () => void) {
  const ref = useRef(reset);
  ref.current = reset;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !onMap(e.target)) return;
      e.preventDefault();
      ref.current();
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, []);
}

// 熱はマップの部品ではなくセッション側の状態として 1 つだけ持ち、2D／3D を切り替えても同じ湯気が見えるようにする
const heatMap = new Map<string, number>();
let heatLastAt = 0;
let heatScope = '';

function sampleHeat(): HeatCell[] {
  const s = get();
  const scope = `${s.session ?? ''}:${worldKindOf(s)}`;
  if (scope !== heatScope) { heatScope = scope; heatMap.clear(); heatLastAt = 0; }
  const now = performance.now();
  const dt = heatLastAt ? (now - heatLastAt) / 1000 : 0;
  heatLastAt = now;
  if (dt > 0) {
    decayHeat(heatMap, dt);
    // タブを離れていた間の発話状態は古い可能性があるので、溜める量だけ 1 秒ぶんまでに抑える
    const addDt = Math.min(dt, 1);
    const places = placesOf(s);
    for (const [id, on] of Object.entries(s.speaking)) {
      if (!on) continue;
      const p = places.get(id);
      if (p) addHeat(heatMap, p.x, p.z, addDt);
    }
  }
  return heatCells(heatMap);
}

/** 冷めていく様子が見えるよう、表示中だけ定期的にサンプルし直す */
export function useHeatCells(): HeatCell[] {
  const [cells, setCells] = useState<HeatCell[]>([]);
  const sig = useRef('');
  const enabled = useStore((s) => s.voiceHeat);
  useEffect(() => {
    if (!enabled) { heatMap.clear(); sig.current = ''; setCells([]); return; }
    const update = () => {
      const next = sampleHeat();
      // 熱が無い・頭打ちの間は描き直さない
      const key = next.map((c) => `${c.cx},${c.cz},${c.heat.toFixed(2)}`).join(';');
      if (key !== sig.current) { sig.current = key; setCells(next); }
    };
    update();
    const t = setInterval(update, 500);
    return () => clearInterval(t);
  }, [enabled]);
  return cells;
}
