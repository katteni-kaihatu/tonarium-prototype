import type { FantasyActivity } from './fantasy.ts';
import { fantasyCookingActionHours, fantasyCookingUnitHours } from './fantasy-cooking.ts';
export function fantasyCookingInterval(activity: FantasyActivity): number {
  return activity.action.type === 'cookMix' ? fantasyCookingUnitHours(activity.action) : 0;
}
export function validFantasyCookingProgress(activity: FantasyActivity, c: unknown): boolean {
  const hour = (c as { hour?: unknown } | null)?.hour;
  if (typeof hour !== 'number' || !Number.isFinite(hour)) return false;
  const action = activity.action;
  if (activity.cooking === undefined) return action.type !== 'cookMix' || (action.repeats ?? 1) <= 1;
  if (!activity.cooking || typeof activity.cooking !== 'object' || Array.isArray(activity.cooking) || action.type !== 'cookMix' || (action.repeats ?? 1) <= 1 || Object.keys(activity.cooking).length !== 1) return false;
  const completed = activity.cooking.completed, interval = fantasyCookingInterval(activity);
  return Number.isSafeInteger(completed) && completed >= 0 && completed < action.repeats! && interval > 0
    && Math.abs(activity.endsAt - activity.startedAt - fantasyCookingActionHours(action)) < 1e-8
    && activity.startedAt + completed * interval <= hour + 1e-8
    && activity.startedAt + (completed + 1) * interval >= hour - 1e-8;
}
