import type { FantasyProfile } from '../shared/fantasy.ts';
import { fantasyMainStage } from '../shared/fantasy-main-trials.ts';

export interface FantasyCohortMember { user: string; generation: number; location: string; startedAt: number; seed: number }
export interface FantasyInvestigationCohort {
  id: string; kind: 'investigation'; quest: string; stage: 'field' | 'verify' | 'compare'; endsAt: number;
  members: (FantasyCohortMember & { acceptedAt: number; approach: 'observe' | 'analyze' | 'restore' })[];
}
export interface FantasyTravelCohort { id: string; kind: 'travel'; session: string; leader: string; destination: string; transport: string; endsAt: number; members: FantasyCohortMember[] }
export type FantasyCohort = FantasyInvestigationCohort | FantasyTravelCohort;
export interface FantasyQuestEligibility { user: string; generation: number; location: string; quest: string; stage: 'field' | 'verify' | 'compare'; acceptedAt: number }
export interface FantasyDungeonEligibility { user: string; generation: number; location: string; site: string; room: string }
export interface FantasyPartyGroupContext { party: string; session: string; leader: string; eligible?: FantasyQuestEligibility[]; dungeonEligible?: FantasyDungeonEligibility[] }

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 180;
const time = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
export function validFantasyDungeonEligibility(v: unknown): v is FantasyDungeonEligibility[] {
  return Array.isArray(v) && v.length <= 6 && new Set(v.map(x => object(x) ? x.user : undefined)).size === v.length && v.every(x => object(x) && Object.keys(x).length === 5
    && text(x.user) && Number.isSafeInteger(x.generation) && Number(x.generation) >= 1 && text(x.location) && text(x.site) && text(x.room));
}
export function validFantasyQuestEligibility(v: unknown): v is FantasyQuestEligibility[] {
  return Array.isArray(v) && v.length <= 6 && new Set(v.map(x => object(x) ? x.user : undefined)).size === v.length && v.every(x => object(x)
    && Object.keys(x).length === 6 && text(x.user) && Number.isSafeInteger(x.generation) && Number(x.generation) >= 1 && text(x.location) && text(x.quest)
    && ['field', 'verify', 'compare'].includes(String(x.stage)) && time(x.acceptedAt));
}
export function validFantasyCohorts(v: unknown): v is FantasyCohort[] {
  return Array.isArray(v) && v.length <= 1000 && new Set(v.map(x => object(x) ? x.id : undefined)).size === v.length && v.every(x => object(x)
    && text(x.id) && ['investigation', 'travel'].includes(String(x.kind)) && time(x.endsAt) && Array.isArray(x.members) && x.members.length >= (x.kind==='travel'?1:2) && x.members.length <= 6
    && new Set(x.members.map(m => object(m) ? m.user : undefined)).size === x.members.length && x.members.every(m => object(m) && text(m.user)
      && Number.isSafeInteger(m.generation) && Number(m.generation) >= 1 && text(m.location) && time(m.startedAt) && Number.isSafeInteger(m.seed) && Number(m.seed) >= 0 && Number(m.seed) <= 0xffffffff
      && (x.kind !== 'investigation' || time(m.acceptedAt) && ['observe', 'analyze', 'restore'].includes(String(m.approach))))
    && (x.kind === 'investigation' ? text(x.quest) && ['field', 'verify', 'compare'].includes(String(x.stage)) : text(x.session) && text(x.leader) && x.members.some(m => m.user === x.leader) && text(x.destination) && text(x.transport)));
}
export function fantasyCohortActivityMatches(profile: FantasyProfile | undefined, member: FantasyCohortMember, type: 'investigate' | 'travel'): boolean {
  return !!profile?.character && !profile.death && (profile.generation ?? 1) === member.generation && profile.character.location === member.location
    && profile.activity?.action.type === type && profile.activity.startedAt === member.startedAt && profile.activity.seed === member.seed;
}

/** Personal rolls settle first; only the same accepted quest's information proof crosses the cohort. */
export function shareFantasyInvestigationProofs(before: ReadonlyMap<string, FantasyProfile>, profiles: Map<string, FantasyProfile>, cohorts: readonly FantasyCohort[], hour: number): { cohorts: FantasyCohort[]; users: string[] } {
  const users = new Set<string>(), remaining: FantasyCohort[] = [];
  for (const cohort of cohorts) {
    if (cohort.kind !== 'investigation' || cohort.endsAt > hour) { remaining.push(cohort); continue; }
    const eligible = cohort.members.filter(member => {
      const p = profiles.get(member.user), c = p?.character;
      return fantasyCohortActivityMatches(before.get(member.user), member, 'investigate') && !!c && !p!.death && c.hp > 0
        && c.location === member.location && (p!.generation ?? 1) === member.generation && c.quests.includes(cohort.quest)
        && c.mainTrials?.[cohort.quest]?.acceptedAt === member.acceptedAt;
    });
    const success = eligible.some(member => profiles.get(member.user)!.character!.mainTrials![cohort.quest].proofs.some(proof => proof.stage === cohort.stage && proof.hour >= cohort.endsAt - 1e-8));
    if (!success) continue;
    for (const member of eligible) {
      const original = profiles.get(member.user)!;
      if (fantasyMainStage(original.character!, cohort.quest)?.id !== cohort.stage) continue;
      const p = structuredClone(original), c = p.character!, record = c.mainTrials![cohort.quest];
      record.proofs.push({ stage: cohort.stage, approach: member.approach, hour: c.hour });
      record.attempts = Math.max(record.attempts, record.proofs.length);
      const id = Math.max(0, ...p.log.map(log => log.id)) + 1;
      p.log.push({ id, hour: c.hour, kind: 'story', text: '同じ調査に参加した仲間の情報を共有し、証拠を確かめた。' }); p.log = p.log.slice(-100); p.revision++;
      profiles.set(member.user, p); users.add(member.user);
    }
  }
  return { cohorts: remaining, users: [...users] };
}
