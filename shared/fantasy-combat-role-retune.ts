import type { FantasySkill } from './fantasy.ts';
import type { FantasyCombatSkill } from './fantasy-combat.ts';

export type FantasyCombatRole = Pick<FantasyCombatSkill, 'kind' | 'power'> & Partial<Pick<FantasyCombatSkill, 'damageType' | 'range' | 'reach' | 'utility' | 'effects'>>;

/** 既存の費用・解禁・熟練条件を保ち、役割の効果だけを抑えて調整する。 */
export function fantasyRetunedCombatRole(skill: FantasySkill): FantasyCombatRole | undefined {
  if (skill.kind !== 'active') return;
  const power = Math.min(12, Math.max(1, Math.round(skill.power)));
  if (skill.id === 'bard-courage') return { kind: 'blessing', power, range: 'magic', reach: 8, effects: { might: Math.min(4, Math.max(1, Math.floor(power / 2))) } };
  if (skill.id === 'spy-cover') return { kind: 'hex', utility: 'blind', power, range: 'magic', reach: 8 };
  if (skill.id === 'bandit-intimidate') return { kind: 'hex', utility: 'weaken', power, range: 'magic', reach: 5 };
}
