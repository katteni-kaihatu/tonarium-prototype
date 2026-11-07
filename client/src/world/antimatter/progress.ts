import { bigLog10 } from '../../ad/engine.mjs';
import type { BigNum } from './types.ts';

const clamp = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/** current / goal の割合（0〜1）。桁が離れていても 0 に潰れるだけで例外にしない。 */
export function ratio(current: BigNum | number, goal: BigNum | number): number {
  const log = (value: BigNum | number) => (typeof value === 'number' ? Math.log10(value) : bigLog10(value));
  const goalLog = log(goal);
  if (!Number.isFinite(goalLog)) return 0;
  return clamp(10 ** (log(current) - goalLog));
}

/** 桁数で見た割合。反物質の Infinity までの距離のように、値の比では進み具合が見えないときに使う。 */
export function digitRatio(currentLog10: number, goalLog10: number): number {
  return goalLog10 > 0 ? clamp(currentLog10 / goalLog10) : 0;
}

export const percent = (value: number) => `${Math.round(value * 100)}%`;

/** 整数の目標まであと何個か。BigNum を log 経由で戻すと 31 が 30.999… にずれるので丸めてから数える。 */
export function remaining(current: BigNum, goal: number): number {
  const value = 10 ** bigLog10(current);
  return Math.max(0, Math.ceil(goal - Math.round(value * 1e6) / 1e6));
}
