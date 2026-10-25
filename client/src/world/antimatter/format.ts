import type { BigNum } from './types.ts';

const SMALL_SUFFIXES = ['', 'K', 'M', 'B', 'T'];

function aaSuffix(group: number): string | null {
  const n = group - SMALL_SUFFIXES.length;
  if (n < 0 || n >= 26 * 26) return null;
  const a = String.fromCharCode(97 + Math.floor(n / 26));
  const b = String.fromCharCode(97 + (n % 26));
  return `${a}${b}`;
}

function normalize(mantissa: number, exponent: number): BigNum {
  if (mantissa === 0 || !Number.isFinite(mantissa)) return { mantissa: 0, exponent: 0 };
  const shift = Math.floor(Math.log10(Math.abs(mantissa)));
  if (shift !== 0) {
    mantissa /= 10 ** shift;
    exponent += shift;
  }
  if (Math.abs(mantissa) >= 10) {
    mantissa /= 10;
    exponent += 1;
  }
  if (Math.abs(mantissa) < 1 && mantissa !== 0) {
    mantissa *= 10;
    exponent -= 1;
  }
  return { mantissa, exponent: Math.trunc(exponent) };
}

export function toBig(value: number | string | BigNum): BigNum {
  if (typeof value === 'number') return normalize(value, 0);
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return normalize(n, 0);
    const m = /^([+-]?[\d.]+)e([+-]?\d+)$/i.exec(value.trim());
    if (m) return normalize(Number(m[1]), Number(m[2]));
    throw new TypeError(`toBig: cannot parse "${value}"`);
  }
  return normalize(Number(value.mantissa ?? 0), Number(value.exponent ?? 0));
}

export function bigLog10(value: BigNum): number {
  const x = toBig(value);
  return x.mantissa === 0 ? -Infinity : x.exponent + Math.log10(Math.abs(x.mantissa));
}

export function bigToNumber(value: BigNum): number {
  const x = toBig(value);
  return x.mantissa * 10 ** x.exponent;
}

// engine.mjs の formatNumber と同じ表示規則。ゲーム計算ではなく表示だけに使う。
export function formatNumber(value: number | string | BigNum, decimals = 2): string {
  let x: BigNum;
  try {
    x = toBig(value);
  } catch {
    return String(value);
  }
  if (x.mantissa === 0) return '0';
  const sign = x.mantissa < 0 ? '-' : '';
  const abs: BigNum = { mantissa: Math.abs(x.mantissa), exponent: x.exponent };
  const log10 = bigLog10(abs);
  if (log10 < 3) {
    const n = bigToNumber(abs);
    const s = Number.isInteger(n) ? String(n) : n.toFixed(Math.min(decimals, 2)).replace(/\.?0+$/, '');
    return sign + s;
  }
  if (abs.exponent >= 1000) return `${sign}${abs.mantissa.toFixed(decimals)}e${abs.exponent}`;
  const group = Math.floor(log10 / 3);
  const suffix = group < SMALL_SUFFIXES.length ? SMALL_SUFFIXES[group] : aaSuffix(group);
  if (suffix === null) return `${sign}${abs.mantissa.toFixed(decimals)}e${abs.exponent}`;
  const scaledMantissa = abs.mantissa * 10 ** (abs.exponent - group * 3);
  return `${sign}${scaledMantissa.toFixed(decimals)}${suffix}`;
}

export function formatFromLog10(log10: number): string {
  if (!Number.isFinite(log10)) return '0';
  if (log10 < 3) return formatNumber(10 ** log10);
  const exponent = Math.floor(log10);
  const mantissa = 10 ** (log10 - exponent);
  return `${mantissa.toFixed(2)}e${exponent}`;
}

export function formatDuration(totalSec: number): string {
  let rest = Math.max(0, Math.floor(Number(totalSec) || 0));
  const d = Math.floor(rest / 86400);
  rest -= d * 86400;
  const h = Math.floor(rest / 3600);
  rest -= h * 3600;
  const m = Math.floor(rest / 60);
  const s = rest - m * 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}日`);
  if (d > 0 || h > 0) parts.push(`${h}時間`);
  if (d > 0 || h > 0 || m > 0) parts.push(`${m}分`);
  parts.push(`${s}秒`);
  return parts.join(' ');
}

export const formatDurationMs = (ms: number): string => formatDuration((Number(ms) || 0) / 1000);
