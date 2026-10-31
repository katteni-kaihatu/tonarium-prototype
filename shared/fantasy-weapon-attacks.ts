import type { FantasyCombatSkill } from './fantasy-combat.ts';
import type { FantasyAttackShape } from './fantasy-attack-shapes.ts';
import { FANTASY_BODY_COMBAT_TECHNIQUES, fantasyBodyAdjustAttack } from './fantasy-body-combat-catalog.ts';

export interface FantasyWeaponAttackContext { weapon: string; traits: string[]; mastery?: number }
export function fantasyWeaponTechniqueReady(id: string, weapon: string): boolean {
  if (id.endsWith('-reposition')) return true;
  if (['tech-thief-piercing-dash', 'tech-assassin-tendon', 'tech-assassin-shadow-step', 'tech-spellblade-wave'].includes(id)) return /sword|blade|dagger/.test(weapon);
  if (id === 'tech-warrior-charge') return /sword|blade|axe|mace|hammer/.test(weapon);
  if (['tech-knight-shieldbreak', 'tech-bandit-crush'].includes(id)) return /sword|blade|axe|spear|lance|halberd/.test(weapon);
  if (id === 'tech-scout-pin') return /bow|crossbow/.test(weapon);
  if (id === 'tech-warrior-cleave') return /sword|blade|axe|halberd/.test(weapon);
  if (id === 'tech-spearfighter-thrust' || id === 'tech-spearfighter-sweep') return /spear|lance|pike|halberd|polearm/.test(weapon);
  if (/^tech-(archer|hunter|ranger)-/.test(id)) return /bow|crossbow/.test(weapon);
  return true;
}
interface Pattern { reach: number; shape: FantasyAttackShape; radius?: number; secondaryDamage?: number; hitUtility?: FantasyCombatSkill['hitUtility']; onHit?: FantasyCombatSkill['onHit']; magic?: boolean; range?: FantasyCombatSkill['range']; motion?: FantasyCombatSkill['motion'] }
const patterns: Record<string, Pattern> = {
  'tech-warrior-charge': { reach: 4, range: 'melee', shape: 'single', motion: { kind: 'advance', distance: 3 }, hitUtility: { id: 'weaken', power: 2, chance: .4 } },
  'tech-pugilist-step-strike': { reach: 3, range: 'melee', shape: 'single', motion: { kind: 'advance', distance: 2 } },
  'tech-assassin-shadow-step': { reach: 4, range: 'melee', shape: 'single', motion: { kind: 'advance', distance: 3 }, hitUtility: { id: 'bleed', power: 2, chance: .5 } },
  'tech-knight-shieldbreak': { reach: 1, shape: 'single', hitUtility: { id: 'vulnerable', power: 2, chance: .5 } },
  'tech-scout-pin': { reach: 6, range: 'ranged', shape: 'single', hitUtility: { id: 'root', power: 1, chance: .4 } },
  'tech-assassin-tendon': { reach: 1, shape: 'single', hitUtility: { id: 'bleed', power: 2, chance: .65 } },
  'tech-bandit-crush': { reach: 1, shape: 'fan', secondaryDamage: 60, hitUtility: { id: 'weaken', power: 2, chance: .45 } },
  'tech-spearfighter-sweep': { reach: 2, shape: 'fan', secondaryDamage: 60, hitUtility: { id: 'root', power: 1, chance: .35 } },
  'tech-hunter-hamstring': { reach: 7, shape: 'single', onHit: { id: 'frost', power: 1, turns: 3, chance: .5 } },
  'tech-spellblade-wave': { reach: 4, range: 'magic', magic: true, shape: 'line', secondaryDamage: 75 },
  'tech-thief-piercing-dash': { reach: 3, range: 'melee', shape: 'line', secondaryDamage: 75, motion: { kind: 'dash', distance: 4 } },
  'tech-warrior-cleave': { reach: 1, shape: 'fan', secondaryDamage: 60 },
  'tech-spearfighter-thrust': { reach: 2, shape: 'line', secondaryDamage: 75 },
  'tech-archer-piercing': { reach: 7, shape: 'line', secondaryDamage: 75 },
  'tech-archer-volley': { reach: 6, shape: 'burst', radius: 1, secondaryDamage: 65 },
  'tech-hunter-aimed-shot': { reach: 8, shape: 'single' },
  'tech-ranger-piercing': { reach: 7, shape: 'line', secondaryDamage: 75 },
  'tech-pugilist-sweep': { reach: 1, shape: 'fan', secondaryDamage: 60 },
  'path-warrior-greatsword-art': { reach: 2, shape: 'fan', secondaryDamage: 60 },
  'path-warrior-axe-art': { reach: 1, shape: 'fan', secondaryDamage: 60 },
  'path-knight-lancer-art': { reach: 3, shape: 'line', secondaryDamage: 75, motion: { kind: 'dash', distance: 4 } },
  'path-spearfighter-pike-art': { reach: 3, shape: 'line', secondaryDamage: 75 },
  'path-spearfighter-javelin-art': { reach: 6, shape: 'single' },
  'path-spearfighter-dragon-art': { reach: 3, shape: 'single' },
  'path-archer-longbow-art': { reach: 8, shape: 'single' },
  'path-archer-arcane-art': { reach: 7, shape: 'line', secondaryDamage: 75 },
  'path-archer-crossbow-art': { reach: 7, shape: 'line', secondaryDamage: 75 },
  'path-ranger-tracker-art': { reach: 7, shape: 'line', secondaryDamage: 75 },
  'path-ranger-marksman-art': { reach: 8, shape: 'single' },
  'path-spellblade-flame-art': { reach: 2, shape: 'fan', secondaryDamage: 60 },
  'path-spellblade-frost-art': { reach: 3, shape: 'line', secondaryDamage: 75 },
  'path-spellblade-wind-art': { reach: 4, shape: 'line', secondaryDamage: 75 },
  'path-spellblade-star-art': { reach: 3, shape: 'burst', radius: 1, secondaryDamage: 65 },
};
export function fantasyWeaponAttackProfile(skill: FantasyCombatSkill, context: FantasyWeaponAttackContext): FantasyCombatSkill {
  if (skill.id === 'tech-archer-reposition' || skill.id === 'tech-ranger-reposition') return { ...skill, kind: 'focus', power: 1, selfOnly: true, motion: { kind: 'reposition', distance: 6 } };
  if (skill.kind !== 'attack') return skill;
  const body = FANTASY_BODY_COMBAT_TECHNIQUES.find(entry => entry.skill.id === skill.id);
  if (body) return fantasyBodyAdjustAttack({ ...skill, ...body.combat, magic: body.combat.magic === true, power: body.combat.power + Math.min(3, Math.max(0, skill.power - 9)) }, context.traits, body.tags);
  if (skill.id === 'dragonblood-flame' || skill.id === 'true-dragon-roar') return fantasyBodyAdjustAttack({ ...skill, range: 'magic', magic: true, damageType: 'fire', reach: skill.id === 'true-dragon-roar' ? 5 : 3, radius: 0, shape: 'cone', secondaryDamage: 60, hitUtility: { id: 'vulnerable', power: 2, chance: .35 } }, context.traits, ['breath', 'arcane']);
  const weapon = context.weapon, pole = /spear|lance|pike|halberd|polearm/.test(weapon), broad = /great-?sword|great-?axe|battle-?axe|war-?axe/.test(weapon);
  const unarmed = skill.id.startsWith('tech-pugilist-') || skill.id.startsWith('path-pugilist-');
  const projectile = /bow|crossbow|javelin/.test(weapon), longbow = /longbow|long-bow/.test(weapon);
  let range = /^tech-(archer|hunter|ranger)-/.test(skill.id) ? 'ranged' : /^tech-(warrior|spearfighter|pugilist)-/.test(skill.id) ? 'melee' : skill.range ?? (skill.magic ? 'magic' : projectile ? 'ranged' : 'melee');
  const fallback: Pattern = range === 'magic' ? { reach: 8, shape: 'single' } : range === 'ranged' ? { reach: /javelin/.test(weapon) ? 5 : 7, shape: 'single' }
    : unarmed ? { reach: 1, shape: 'single' } : pole ? { reach: 2, shape: 'line', secondaryDamage: 75 } : /whip/.test(weapon) ? { reach: 3, shape: 'single' } : broad ? { reach: 2, shape: 'fan', secondaryDamage: 60 } : { reach: 1, shape: 'single' };
  const pattern = patterns[skill.id] ?? fallback;
  // 初学者の威力は変えず、熟練者が長期戦で弱点を作れるようにする。
  const practiced = Number.isFinite(context.mastery) && context.mastery! >= 200;
  const masteredCharge = practiced && skill.id === 'tech-warrior-charge';
  const masteredWeakness = practiced && ['tech-archer-piercing', 'tech-knight-shieldbreak'].includes(skill.id) ? 6 : 0;
  range = pattern.range ?? range;
  let reach = pattern.reach;
  const magic = pattern.magic ?? (/^tech-/.test(skill.id) ? false : skill.magic);
  const physical = magic !== true && range !== 'magic';
  const precise = pattern.shape === 'single' && pattern.reach >= 7;
  if (physical && range === 'melee') {
    if (!unarmed && (pole || broad)) reach = Math.max(reach, 2);
  }
  const bowTechnique = range === 'ranged' && skill.id !== 'path-spearfighter-javelin-art' && !/javelin/.test(weapon);
  if (bowTechnique && longbow) reach++;
  const tags = [physical && range === 'melee' && !pattern.motion ? 'physical-melee' : '', bowTechnique && precise ? 'precision' : '', pattern.shape === 'fan' ? 'sweep' : '', pole && pattern.shape === 'line' && !pattern.motion ? 'thrust' : '', unarmed && !pattern.motion ? 'unarmed' : '', magic ? 'arcane' : ''].filter(Boolean);
  return fantasyBodyAdjustAttack({ ...skill, ...pattern, ...(masteredWeakness ? { hitUtility: { id: 'vulnerable' as const, power: masteredWeakness, chance: 1 } } : {}), ...(masteredCharge ? { hitUtility: { id: 'weaken' as const, power: 4, chance: .8 } } : {}), ...(magic !== undefined ? { magic } : {}), range, reach: Math.min(10, reach), radius: pattern.radius ?? 0 }, context.traits, tags);
}
