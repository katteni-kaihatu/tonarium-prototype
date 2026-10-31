import type { FantasyActivity, FantasyAction } from './fantasy.ts';

/** 実時間10秒＝ゲーム内5分。移動中はこの間隔ごとに襲撃を抽選する。 */
export const FANTASY_AMBUSH_SLOT_HOURS = 1 / 12;
export const FANTASY_AMBUSH_CHANCE = .03;
/** 護送する荷があるため、護衛の隊列は狙われやすい。 */
export const FANTASY_ESCORT_AMBUSH_CHANCE = .09;

export function fantasyAmbushChance(action: FantasyAction): number {
  return action.type === 'travel' && action.transport === 'escort' ? FANTASY_ESCORT_AMBUSH_CHANCE : FANTASY_AMBUSH_CHANCE;
}

function ambushRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

/** 移動の残り区間のうち、最初に襲撃が起きる時刻を返す。抽選は保存済みの種から決まる。 */
export function fantasyAmbushHit(activity: Pick<FantasyActivity, 'action' | 'startedAt' | 'endsAt' | 'seed'>, until: number, after = activity.startedAt): { hour: number; slot: number } | undefined {
  if (activity.action.type !== 'travel') return undefined;
  const chance = fantasyAmbushChance(activity.action);
  const limit = Math.min(until, activity.endsAt);
  const slots = Math.floor((limit - activity.startedAt) / FANTASY_AMBUSH_SLOT_HOURS);
  for (let slot = Math.max(0, Math.floor((after - activity.startedAt + 1e-8) / FANTASY_AMBUSH_SLOT_HOURS)); slot < slots; slot++) {
    const hour = activity.startedAt + (slot + 1) * FANTASY_AMBUSH_SLOT_HOURS;
    if (hour >= activity.endsAt - 1e-9) break;
    if (ambushRandom((activity.seed ^ Math.imul(slot + 1, 0x9e3779b1)) >>> 0)() < chance) return { hour, slot };
  }
  return undefined;
}
