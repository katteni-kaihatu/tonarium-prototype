import type { FantasyProfile, FantasyCharacter } from './fantasy.ts';
import { FANTASY_BUSINESS_WORKERS } from './fantasy-worker-catalog.ts';
import type { FantasyCompanion } from './fantasy-specializations.ts';
import type { FantasyCombatRange, FantasyCombatSkill } from './fantasy-combat.ts';
import type { FantasyCombatStats } from './fantasy-combat-catalog.ts';

export const fantasyWorkerCompanionId = (npc: string) => `worker-${npc}`;
export const fantasyIsWorkerCompanion = (id: string): boolean => FANTASY_BUSINESS_WORKERS.some(worker => !!worker.combatJob && fantasyWorkerCompanionId(worker.id) === id);
export const FANTASY_WORKER_COMPANIONS = FANTASY_BUSINESS_WORKERS.filter(worker => !!worker.combatJob).map(worker => ({
  id: fantasyWorkerCompanionId(worker.id), kind: 'troop' as const, names: worker.names,
  role: { ko: '고용 전투원', en: 'Employed fighter', ja: '雇用戦闘員' }, cost: worker.fee, mp: 0,
  hp: 55 + Math.min(45, Math.floor(worker.initialXp / 4)), check: 1, guard: worker.combatJob === 'warrior' ? 2 : 1,
}));
export function fantasyWorkerCompanionCapacity(c: Pick<FantasyCharacter, 'job' | 'jobXp'>): number {
  const xp = c.jobXp.leader ?? 0;
  return c.job === 'leader' ? 2 + (xp >= 100 ? 2 : xp >= 30 ? 1 : 0) : 2;
}
export function fantasyHasWorkerCompany(c: Pick<FantasyCharacter, 'specialization'>): boolean {
  return !!c.specialization?.companies?.troop?.members.some(member => fantasyIsWorkerCompanion(member.id));
}
export function enlistFantasyWorkerCompanion(profile: FantasyProfile, candidate: { id: string; names: Record<'ko' | 'en' | 'ja', string>; race: string; job: string; wage: number; level: number }): boolean {
  const c = profile.character, id = fantasyWorkerCompanionId(candidate.id), template = FANTASY_WORKER_COMPANIONS.find(entry => entry.id === id);
  if (!c || profile.death || profile.activity || profile.combatId || profile.event || c.hp <= 0 || c.downed || c.travelPosition || !template || !Number.isSafeInteger(candidate.level) || candidate.level < 1 || candidate.level > 6) return false;
  const members = c.specialization?.companies?.troop?.members ?? [];
  if (members.some(member => member.id === id) || members.filter(member => c.job === 'leader' || fantasyIsWorkerCompanion(member.id)).length >= fantasyWorkerCompanionCapacity(c)) return false;
  c.specialization ??= {}; c.specialization.companies ??= {}; c.specialization.companies.troop ??= { members: [] };
  c.specialization.companies.troop.members.push({ id, hp: template.hp, condition: 'ready', assigned: false, missions: 0, workerLevel: Math.max(1, Math.min(6, Math.floor(candidate.level))) });
  return true;
}
export function fantasyWorkerCompanionLevel(member: Pick<FantasyCompanion, 'workerLevel' | 'missions'>): number {
  return Math.min(10, Math.max(1, member.workerLevel ?? 1) + Math.floor(member.missions / 8));
}
export function fantasyWorkerCompanionCombat(member: FantasyCompanion): { job: string; stats: FantasyCombatStats; range: FantasyCombatRange; skills: FantasyCombatSkill[] } | undefined {
  const worker = FANTASY_BUSINESS_WORKERS.find(worker => fantasyWorkerCompanionId(worker.id) === member.id && worker.combatJob), template = FANTASY_WORKER_COMPANIONS.find(template => template.id === member.id);
  if (!worker || !template) return;
  const level = fantasyWorkerCompanionLevel(member), job = worker.combatJob!, magic = job === 'mage' || job === 'priest', ranged = job === 'archer' || job === 'ranger';
  const range = magic ? 'magic' : ranged ? 'ranged' : 'melee';
  const l = (ko: string, en: string, ja: string) => ({ ko, en, ja });
  const art = (slug: string, names: Record<'ko' | 'en' | 'ja', string>, kind: FantasyCombatSkill['kind'], power: number, mp: number, extra: Partial<FantasyCombatSkill> = {}): FantasyCombatSkill => ({ id: `${member.id}-${slug}`, names, kind, power: power + level, mp, range, ...extra });
  const skills = job === 'warrior' ? [art('strike', l('전사의 강타', 'Warrior’s Strike', '戦士の強打'), 'attack', 6, 3, { damageType: 'blunt' }), art('cover', l('호위 방패', 'Escort Shield', '護衛の盾'), 'guard', 7, 3, { range: 'magic' })]
    : job === 'archer' ? [art('shot', l('정밀 사격', 'Precise Shot', '精密射撃'), 'attack', 5, 3, { hitBonus: 10, damageType: 'pierce' }), art('aim', l('궁수의 조준', 'Archer’s Aim', '弓手の照準'), 'focus', 3, 2, { power: Math.min(15, 3 + level) })]
      : job === 'ranger' ? [art('arrow', l('숲길의 화살', 'Trail Arrow', '森道の矢'), 'attack', 5, 3, { damageType: 'pierce' }), art('snare', l('추적자의 속박', 'Tracker’s Snare', '追跡者の足止め'), 'hex', 2, 4, { range: 'magic', utility: 'root', power: Math.min(6, 1 + Math.floor(level / 2)) })]
        : job === 'mage' ? [art('flame', l('고용 마술사의 화염', 'Retainer’s Flame', '雇用魔術師の炎'), 'attack', 7, 5, { magic: true, damageType: 'fire', onHit: { id: 'burn', power: 1 + Math.floor(level / 4), turns: 3, chance: .35 } }), art('veil', l('마력 방호', 'Arcane Ward', '魔力の防護'), 'guard', 7, 4)]
          : [art('mend', l('고용 사제의 치유', 'Retainer’s Mending', '雇用司祭の癒やし'), 'heal', 10, 5), art('ward', l('사제의 축복 방패', 'Priest’s Blessed Shield', '司祭の祝福盾'), 'guard', 8, 4)];
  return { job, range, skills, stats: {
    hp: template.hp + level * (job === 'warrior' ? 10 : 7), mp: magic ? 24 + level * 5 : 10 + level * 2,
    attack: (job === 'warrior' ? 18 : magic ? 14 : 16) + level * 4, defense: template.guard * 2 + (job === 'warrior' ? 9 : 5) + level * 2,
    agility: (ranged ? 10 : 7) + level, intelligence: (magic ? 11 : 5) + level * (magic ? 2 : 1),
    accuracy: Math.min(94, (ranged ? 76 : 70) + level), magicResist: (magic ? 10 : 4) + level * 2,
  } };
}
