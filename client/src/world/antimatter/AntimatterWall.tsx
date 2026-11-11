import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { bigLog10 } from '../../ad/engine.mjs';
import type { BigNum } from './types.ts';

const ROWS = 2;
// これより多い桁は描いても見分けがつかず重いだけなので、ここで打ち切る。
export const WALL_MAX_DIGITS = 3000;
// エンジンは上位約 15 桁しか正しく持たない。
const PRECISE_DIGITS = 15;
const HEAD_CHARS = 7;
const REFRESH_MS = 150;

/** 反物質をすべて書いたときの桁数（1 未満は 1 桁）。 */
export function antimatterDigits(value: BigNum): number {
  const log = bigLog10(value);
  return Number.isFinite(log) && log >= 0 ? Math.floor(log) + 1 : 1;
}

function preciseDigits(value: BigNum, digits: number): string {
  if (!(value.mantissa > 0)) return '0';
  const count = Math.min(digits, PRECISE_DIGITS);
  // toPrecision は丸めで 9.96 → 1e+1 になるので、切り捨てで上位の桁を取る。
  return String(Math.floor(value.mantissa * 10 ** (count - 1))).slice(0, count);
}

function randomDigits(count: number): string {
  let text = '';
  for (let i = 0; i < count; i++) text += String(Math.floor(Math.random() * 10));
  return text;
}

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function reducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * ヘッダーの帯の後ろに、反物質をすべて書いた数字を 2 行で敷く。文字の高さは固定し、
 * 横だけ押しつぶして全桁を幅に収めるので、桁が増えるほど細く詰まっていく。
 * 正しく持っているのは上位の桁だけなので、それより下は飾りの乱数で埋めて変え続ける。
 */
export function AntimatterWall({ antimatter }: { antimatter: BigNum }) {
  const digits = Math.min(antimatterDigits(antimatter), WALL_MAX_DIGITS);
  const head = preciseDigits(antimatter, digits);
  const fillerLength = Math.max(0, digits - head.length);
  const [filler, setFiller] = useState(() => '0'.repeat(fillerLength));
  useEffect(() => {
    if (fillerLength === 0) { setFiller(''); return; }
    setFiller(randomDigits(fillerLength));
    if (reducedMotion()) return;
    const id = setInterval(() => setFiller(randomDigits(fillerLength)), REFRESH_MS);
    return () => clearInterval(id);
  }, [fillerLength]);

  const text = group(head + filler.padEnd(fillerLength, '0').slice(0, fillerLength));
  const perRow = Math.ceil(text.length / ROWS);
  const lines = Array.from({ length: ROWS }, (_, r) => text.slice(r * perRow, (r + 1) * perRow)).filter(Boolean);

  const box = useRef<HTMLDivElement>(null);
  const [scales, setScales] = useState<number[]>([]);
  // 等幅なので数字が入れ替わっても行の幅は変わらない。測り直すのは文字数か幅が変わったときだけ。
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      setScales([...element.querySelectorAll<HTMLElement>('.adlab-wall-line')].map(line => (line.offsetWidth > width ? width / line.offsetWidth : 1)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [perRow, lines.length]);

  return (
    <div ref={box} className="adlab-wall" aria-hidden="true">
      {lines.map((line, r) => {
        const headCount = r === 0 ? Math.min(line.length, HEAD_CHARS) : 0;
        return (
          <div key={r} className="adlab-wall-row">
            <span className="adlab-wall-line" style={{ transform: `scaleX(${scales[r] ?? 0})` }}>
              <span className="adlab-wall-head">{line.slice(0, headCount)}</span>{line.slice(headCount)}
            </span>
          </div>
        );
      })}
      <span className="adlab-wall-sweep" />
    </div>
  );
}
