import type { FantasyProfile, FantasyActivity } from '../shared/fantasy.ts';
import type { FantasyCombatState } from '../shared/fantasy-combat.ts';
import { FANTASY_LOCATIONS } from '../shared/fantasy-data.ts';
import { parseFantasyRoll } from '../shared/fantasy-roll.ts';
import type { FantasyDiagnosticEvent, FantasyDiagnostics } from './fantasy-diagnostics.ts';

const locations = new Set(FANTASY_LOCATIONS.map(location => location.id));
const activityKinds = new Set(['sync', 'draw', 'keep', 'skip', 'create', 'travel', 'escortAccept', 'escortAbandon', 'finishVoyage', 'voyageDecision', 'explore', 'rest', 'lodge', 'eat', 'work', 'pray', 'propertyUse', 'advanceJob', 'priestVow', 'priestReleaseVow', 'priestBranch', 'gather', 'hunt', 'skin', 'fish', 'boat', 'rebirth', 'read', 'wear', 'terrain', 'job', 'accept', 'complete', 'abandon', 'investigate', 'craft', 'sell', 'buy', 'use', 'equip', 'unequip', 'haggle', 'manaTrain', 'learn', 'skill', 'command', 'magicPrepare', 'magicCast', 'alchemy', 'event']);
const finite = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const locationOf = (value: string | undefined) => value !== undefined && locations.has(value) ? value : undefined;
interface ActivitySnapshot { kind?: string; startedAt: number; endsAt: number; progress?: number; total?: number }
interface ProfileSnapshot {
  revision: number; generation: number; lastLogId: number; dead: boolean;
  health?: number; mana?: number; money?: number; experience?: number; hunger?: number; fatigue?: number;
  hour?: number; bornAt?: number; location?: string; activity?: ActivitySnapshot;
}
interface CombatSnapshot { id: string; revision: number; lastLogId: number; round: number; status: string }
interface ActorSnapshot { profile?: ProfileSnapshot; combat?: CombatSnapshot }
const lastLog = (logs: readonly { id: number }[]) => logs.reduce((last, log) => Math.max(last, finite(log.id) ?? -1), -1);
function activityOf(activity: FantasyActivity | undefined): ActivitySnapshot | undefined {
  if (!activity || finite(activity.startedAt) === undefined || finite(activity.endsAt) === undefined) return undefined;
  const kind = activityKinds.has(activity.action.type) ? activity.action.type : undefined;
  return { kind, startedAt: activity.startedAt, endsAt: activity.endsAt, ...(activity.work ? { progress: finite(activity.work.completed), total: finite(activity.work.totalSteps) ?? 8 } : {}) };
}
function snapshot(profile: FantasyProfile): ProfileSnapshot {
  const c = profile.character;
  return { revision: profile.revision, generation: finite(profile.generation) ?? 1, lastLogId: lastLog(profile.log), dead: !!profile.death,
    health: finite(c?.hp), mana: finite(c?.mp), money: finite(c?.gold), experience: finite(c?.xp), hunger: finite(c?.hunger), fatigue: finite(c?.fatigue),
    hour: finite(c?.hour), bornAt: c ? finite(c.lifeStartedAt) ?? 8 : undefined, location: locationOf(c?.location), activity: activityOf(profile.activity) };
}
function activityEqual(a: ActivitySnapshot | undefined, b: ActivitySnapshot | undefined) {
  return !!a && !!b && a.kind === b.kind && a.startedAt === b.startedAt && a.endsAt === b.endsAt;
}

// 診断のために人物や戦闘の全状態を保持しない。
export class FantasyPlayObserver {
  readonly #sink: Pick<FantasyDiagnostics, 'record'>;
  readonly #maxActors: number;
  readonly #actors = new Map<string, ActorSnapshot>();

  constructor(sink: Pick<FantasyDiagnostics, 'record'>, options: { maxActors?: number } = {}) {
    this.#sink = sink;
    this.#maxActors = Math.max(1, Math.min(16384, Math.floor(finite(options.maxActors) ?? 2048)));
  }
  #actor(actorId: string) {
    const state = this.#actors.get(actorId) ?? {};
    this.#actors.delete(actorId); this.#actors.set(actorId, state);
    while (this.#actors.size > this.#maxActors) this.#actors.delete(this.#actors.keys().next().value!);
    return state;
  }
  #record(event: FantasyDiagnosticEvent) { try { this.#sink.record(event); } catch { /* 診断失敗でプレイを止めない。 */ } }

  profile(actorId: string, sessionId: string | null, profile: FantasyProfile): void {
    try {
      if (!actorId || actorId.length > 512 || !Number.isSafeInteger(profile.revision)) return;
      const actor = this.#actor(actorId), previous = actor.profile;
      if (previous && profile.revision <= previous.revision) return;
      const next = snapshot(profile);
      actor.profile = next;
      const context: Omit<FantasyDiagnosticEvent, 'type'> = { actorId, ...(sessionId === null ? {} : { sessionId }), revision: next.revision, generation: next.generation, worldHour: next.hour, location: next.location,
        ...(next.hour !== undefined && next.bornAt !== undefined ? { ageDays: Math.max(0, next.hour - next.bornAt) / 24 } : {}) };
      if (!previous) { this.#record({ type: 'profile.resume', ...context }); return; }
      const changes: FantasyDiagnosticEvent = { type: 'profile.delta', ...context };
      let changed = next.generation !== previous.generation || next.hour !== previous.hour || next.location !== undefined && next.location !== previous.location;
      for (const [source, destination] of [['health', 'healthDelta'], ['mana', 'manaDelta'], ['money', 'moneyDelta'], ['experience', 'experienceDelta'], ['hunger', 'hungerDelta'], ['fatigue', 'fatigueDelta']] as const) {
        if (next[source] !== undefined && previous[source] !== undefined) {
          const difference = next[source]! - previous[source]!;
          if (Number.isFinite(difference) && difference !== 0) { changes[destination] = difference; changed = true; }
        }
      }
      if (changed) this.#record(changes);
      if (next.dead && !previous.dead) {
        const endHour = finite(profile.death?.hour) ?? next.hour;
        this.#record({ type: 'lifecycle.death', ...context, ...(endHour !== undefined && next.bornAt !== undefined ? { lifespanDays: Math.max(0, endHour - next.bornAt) / 24 } : {}) });
      }
      if (next.generation > previous.generation) this.#record({ type: 'lifecycle.rebirth', ...context });
      const oldActivity = previous.activity, activity = next.activity, sameActivity = activityEqual(oldActivity, activity);
      const activityContext = (value: ActivitySnapshot, generation = next.generation) => ({ ...context, activityKind: value.kind, activityId: `${generation}:${value.kind ?? 'unknown'}:${value.startedAt}:${value.endsAt}` });
      if (oldActivity && !sameActivity) {
        const completed = !next.dead && next.generation === previous.generation && next.hour !== undefined && next.hour >= oldActivity.endsAt;
        if (completed && oldActivity.progress !== undefined && oldActivity.total !== undefined && oldActivity.progress < oldActivity.total)
          this.#record({ type: 'activity.progress', ...activityContext(oldActivity, previous.generation), progress: oldActivity.total, total: oldActivity.total });
        this.#record({ type: completed ? 'activity.end' : 'activity.cancel', ...activityContext(oldActivity, previous.generation), completed, cancelled: !completed });
      }
      if (activity && !sameActivity) this.#record({ type: 'activity.start', ...activityContext(activity) });
      if (activity && sameActivity && activity.progress !== undefined && activity.progress !== oldActivity!.progress)
        this.#record({ type: 'activity.progress', ...activityContext(activity), progress: activity.progress, total: activity.total });
      const lowerLogId = next.generation === previous.generation ? previous.lastLogId : -1;
      for (const entry of profile.log) if (entry.id > lowerLogId) {
        const roll = parseFantasyRoll(entry.text);
        if (roll) this.#record({ type: 'roll.result', ...context, roll: roll.total, rollTarget: roll.dc, rollSuccess: roll.success });
      }
      if (next.generation === previous.generation) next.lastLogId = Math.max(previous.lastLogId, next.lastLogId);
    } catch { /* 診断用の不正入力でプレイを止めない。 */ }
  }

  combat(actorId: string, sessionId: string | null, state: FantasyCombatState | null): void {
    try {
      if (!actorId || actorId.length > 512) return;
      const actor = this.#actor(actorId), previous = actor.combat;
      if (!state) {
        if (previous) { this.#record({ type: 'combat.end', actorId, ...(sessionId === null ? {} : { sessionId }), combatId: previous.id, revision: previous.revision, round: previous.round, status: previous.status }); delete actor.combat; }
        return;
      }
      if (!state.id || state.id.length > 512 || !Number.isSafeInteger(state.revision) || previous?.id === state.id && previous.revision >= state.revision) return;
      const sameBattle = previous?.id === state.id;
      const context: Omit<FantasyDiagnosticEvent, 'type'> = { actorId, ...(sessionId === null ? {} : { sessionId }), combatId: state.id, revision: state.revision, round: finite(state.round), worldHour: finite(state.hour), location: locationOf(state.location),
        status: ['active', 'victory', 'defeat', 'escaped'].includes(state.status) ? state.status : undefined,
        partySize: new Set(state.fighters.filter(fighter => fighter.side === 'players' && typeof fighter.userId === 'string').map(fighter => fighter.userId)).size };
      this.#record({ type: 'combat.state', ...context });
      if (sameBattle) for (const entry of state.logs) if (entry.id > previous.lastLogId && entry.roll)
        this.#record({ type: 'combat.roll', ...context, roll: finite(entry.roll.value), rollTarget: finite(entry.roll.target), rollSuccess: entry.roll.success === true });
      actor.combat = { id: state.id, revision: state.revision, lastLogId: Math.max(sameBattle ? previous.lastLogId : -1, lastLog(state.logs)), round: state.round, status: context.status ?? 'unknown' };
    } catch { /* 診断用の不正入力でプレイを止めない。 */ }
  }

  forget(actorId: string): void { this.#actors.delete(actorId); }
}
