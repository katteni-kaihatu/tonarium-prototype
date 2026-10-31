import { FANTASY_JOBS, FANTASY_RACES } from './fantasy-data.ts';
import type { FantasySkill } from './fantasy.ts';
import { FANTASY_WEAPON_ATTACK_IDS } from './fantasy-weapon-training.ts';
import { FANTASY_BODY_ATTACK_IDS } from './fantasy-body-combat-catalog.ts';
import type { FantasyCombatSkill } from './fantasy-combat.ts';
import type { FantasyObstacleDamage } from './fantasy-obstacles.ts';
import { FANTASY_JOB_PATHS, fantasyJobPathCombatPassive, fantasyJobPathCombatSkill } from './fantasy-job-paths.ts';
import { FANTASY_JOB_PATH_SKILL_NAMES } from './fantasy-job-path-skill-names.ts';
import { FANTASY_PRIEST_PATH_SKILLS, fantasyPriestCombatSkill } from './fantasy-priest-growth.ts';
import { FANTASY_LIFE_JOBS, fantasyIsLifeJob } from './fantasy-careers.ts';
import { fantasyRetunedCombatRole, type FantasyCombatRole } from './fantasy-combat-role-retune.ts';

export const FANTASY_COMBAT_PROFESSIONS = new Set(['adventurer', 'hunter', 'ranger', 'bard', 'leader', 'crimeboss', 'warrior', 'knight', 'spearfighter', 'archer', 'scout', 'pugilist', 'spellblade', 'shieldbearer', 'mage', 'priest', 'summoner', 'thief', 'smuggler', 'assassin', 'bandit', 'spy']);
const martial = new Set(['ranger-aim', 'adventurer-resolve', 'hunter-focus', 'thief-chance', 'bandit-intimidate', 'approved-skill-warrior-drive', 'approved-skill-spearfighter-press', 'approved-skill-spellblade-channel']);
const elements: Record<string, FantasyObstacleDamage> = { 'dragonblood-flame': 'fire', 'true-dragon-roar': 'fire', 'mage-insight': 'none' };
const lifeSkillIds = new Set(FANTASY_JOBS.filter(job => fantasyIsLifeJob(job.id)).flatMap(job => job.skills.map(skill => skill.id)));
/** Work skills remain in the character's history but never become combat passives or actions. */
export function fantasyIsLifeCareerSkill(id: string): boolean {
  return lifeSkillIds.has(id) || FANTASY_LIFE_JOBS.some(job => id.startsWith(`path-${job}-`));
}
export interface FantasyCombatCapability {
  id: string; source: 'race' | 'job' | 'path' | 'priest'; owner: string; names: NonNullable<FantasySkill['names']>;
  mode: FantasyCombatSkill['kind'] | 'passive' | 'outside-combat'; effect: string;
  duration: 'instant' | 'round' | 'three-rounds' | 'next-attack-two-rounds' | 'equipped'; unlock?: FantasySkill['unlock']; stat?: FantasySkill['stat'];
  damageType?: FantasyObstacleDamage;
  mp?: number; power?: number; conditions?: string[];
}
// 感覚や工夫の技能を魔法扱いにせず、攻撃を助ける戦闘効果へ変換する。
export function fantasyCombatSkillRole(skill: FantasySkill, source: 'race' | 'job', owner: string): FantasyCombatRole | undefined {
  if (skill.kind !== 'active' || source === 'job' && fantasyIsLifeJob(owner) || fantasyIsLifeCareerSkill(skill.id)) return;
  const retuned = fantasyRetunedCombatRole(skill); if (retuned) return retuned;
  if (skill.effect === 'heal' || skill.effect === 'guard') return { kind: skill.effect, power: Math.min(100, Math.round(skill.power * (skill.id === 'priest-grace' ? 1 : 2))) };
  if (skill.effect !== 'check' || source === 'job' && !FANTASY_COMBAT_PROFESSIONS.has(owner)) return;
  if (martial.has(skill.id) || FANTASY_WEAPON_ATTACK_IDS.has(skill.id) || FANTASY_BODY_ATTACK_IDS.has(skill.id) || Object.hasOwn(elements, skill.id)) return { kind: 'attack', power: Math.min(100, Math.round(skill.power * 3)), ...(elements[skill.id] ? { damageType: elements[skill.id] } : {}) };
  return { kind: 'focus', power: Math.min(15, Math.max(3, Math.round(skill.power * 2))) };
}
export const FANTASY_COMBAT_CAPABILITIES: FantasyCombatCapability[] = [
  ...FANTASY_RACES.flatMap(race => race.skills.map(skill => ({ skill, source: 'race' as const, owner: race.id }))),
  ...FANTASY_JOBS.flatMap(job => job.skills.map(skill => ({ skill, source: 'job' as const, owner: job.id }))),
].map(({ skill, source, owner }) => {
  const role = fantasyCombatSkillRole(skill, source, owner);
  const passive = !fantasyIsLifeJob(owner) && skill.kind === 'passive' && ['check', 'guard'].includes(skill.effect);
  const mode = role?.kind ?? (passive ? 'passive' : 'outside-combat');
  return { id: skill.id, source, owner, names: skill.names ?? { ko: skill.name, en: skill.name, ja: skill.name }, mode,
    effect: mode === 'hex' ? `${role!.utility}, three rounds, no stacking` : mode === 'blessing' ? 'Current-round allied ward and finite allied damage blessing; no stacking' : mode === 'focus' ? 'Aim bonus for the next attack; no stacking' : mode === 'guard' ? (owner === 'shieldbearer' ? 'Current-round ward and one owned barrier through the following round' : 'Damage absorption ward') : mode === 'heal' ? 'Restore living ally HP' : mode === 'attack' ? 'Attack an enemy or destructible obstacle' : passive ? (skill.effect === 'guard' ? 'Derived defense bonus' : 'Derived attack bonus only when stat matches combat stat') : 'Living-world skill; no combat action or derived combat stat bonus',
    duration: mode === 'hex' || mode === 'blessing' ? 'three-rounds' : mode === 'focus' ? 'next-attack-two-rounds' : mode === 'guard' ? 'round' : passive ? 'equipped' : 'instant',
    mp: skill.mp, power: role?.power ?? skill.power, ...(skill.unlock ? { unlock: skill.unlock } : {}), ...(skill.stat ? { stat: skill.stat } : {}), ...(role?.damageType ? { damageType: role.damageType } : {}) };
});

for (const path of FANTASY_JOB_PATHS) {
  const index = FANTASY_JOB_PATHS.filter(entry => entry.job === path.job).findIndex(entry => entry.id === path.id), pair = FANTASY_JOB_PATH_SKILL_NAMES[path.job][index];
  const art = fantasyJobPathCombatSkill(`path-${path.id}-art`), passive = fantasyJobPathCombatPassive(`path-${path.id}-insight`);
  const conditions = [`Current job ${path.job}; discovered and selected path ${path.id}; job XP >= 100 and its advanced skill unlocked`];
  if (passive) FANTASY_COMBAT_CAPABILITIES.push({ id: `path-${path.id}-insight`, source: 'path', owner: path.job, names: { ko: pair[0][0], en: pair[0][1], ja: pair[0][2] }, mode: 'passive', effect: `Derived stat bonus, maximum +3: ${Object.keys(passive).join(', ')}`, duration: 'equipped', mp: 0, power: 1, conditions });
  if (art) FANTASY_COMBAT_CAPABILITIES.push({ id: `path-${path.id}-art`, source: 'path', owner: path.job, names: { ko: pair[1][0], en: pair[1][1], ja: pair[1][2] }, mode: art.kind, effect: art.kind === 'attack' ? `${art.range} attack against enemy or obstacle${art.onHit ? `; ${art.onHit.id} ${art.onHit.power}, ${art.onHit.chance * 100}% on damaging unguarded hit, 3 rounds` : ''}` : art.kind === 'heal' ? 'Restore living ally HP' : path.job === 'shieldbearer' ? 'Current-round ward and one owned barrier through the following round' : 'One-round allied damage absorption', duration: art.kind === 'guard' ? 'round' : 'instant', mp: art.mp, power: art.power, conditions });
}
for (const skill of FANTASY_PRIEST_PATH_SKILLS) {
  const art = fantasyPriestCombatSkill(skill.id), passive = skill.kind === 'passive' && skill.effect === 'guard';
  FANTASY_COMBAT_CAPABILITIES.push({ id: skill.id, source: 'priest', owner: 'priest', names: skill.names!, mode: art?.kind ?? (passive ? 'passive' : 'outside-combat'), effect: art?.kind === 'focus' ? 'Next allied attack aim bonus; one use, no stacking' : art?.kind === 'guard' ? 'One-round allied damage absorption' : art?.kind === 'heal' ? 'Restore living ally HP' : passive ? 'Derived defense bonus' : 'Living-world investigation or travel bonus', duration: art?.kind === 'focus' ? 'next-attack-two-rounds' : art?.kind === 'guard' ? 'round' : passive ? 'equipped' : 'instant', mp: art?.mp ?? skill.mp, power: art?.power ?? skill.power, conditions: [`Current priest job; selected ${skill.id.split('-')[1]} branch; faith rank and skill practice scale power`] });
}
