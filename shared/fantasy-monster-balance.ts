import type { FantasyCombatStats } from './fantasy-combat-catalog.ts';
import type { FantasyAdventurerGrade } from './fantasy-adventurer.ts';
import { FANTASY_ADVENTURER_POWER_THRESHOLDS } from './fantasy-adventurer.ts';

/** 固定値の実測と目標との差は検証報告に残す。 */
export const FANTASY_MONSTER_BALANCE_VERSION = '2026-10-31-v6';
const referencePower: Record<FantasyAdventurerGrade, number> = { 1: 60, 2: 90, 3: 125, 4: 168, 5: 215, 6: 295, 7: 440, 8: 600 };

/** 上限のない等級8にも比較用の基準点を置く。 */
export function fantasyMonsterGradePowerReference(grade: FantasyAdventurerGrade): { minimum: number; maximum?: number; reference: number } {
  return { minimum: FANTASY_ADVENTURER_POWER_THRESHOLDS[grade - 1], ...(grade < 8 ? { maximum: FANTASY_ADVENTURER_POWER_THRESHOLDS[grade] - 1 } : {}), reference: referencePower[grade] };
}
export type FantasyMonsterCombatRole = 'slime' | 'swarm' | 'beast' | 'skirmisher' | 'armored' | 'undead' | 'caster' | 'flying' | 'dragon' | 'golem';

/** 挑戦者の装備・戦力・登録等級では敵を強化しない。 */
export const FANTASY_MONSTER_TIER_STATS: Readonly<Record<FantasyAdventurerGrade, Readonly<FantasyCombatStats>>> = {
  1: { hp: 169, mp: 0, attack: 34, defense: 7, agility: 8, intelligence: 8, accuracy: 68, magicResist: 5 },
  2: { hp: 227, mp: 12, attack: 37, defense: 11, agility: 12, intelligence: 13, accuracy: 71, magicResist: 8 },
  3: { hp: 295, mp: 22, attack: 47, defense: 16, agility: 16, intelligence: 19, accuracy: 74, magicResist: 18 },
  4: { hp: 300, mp: 34, attack: 60, defense: 21, agility: 21, intelligence: 27, accuracy: 77, magicResist: 20 },
  5: { hp: 348, mp: 48, attack: 67, defense: 27, agility: 27, intelligence: 37, accuracy: 80, magicResist: 23 },
  6: { hp: 571, mp: 66, attack: 74, defense: 40, agility: 34, intelligence: 49, accuracy: 83, magicResist: 30 },
  7: { hp: 696, mp: 100, attack: 130, defense: 40, agility: 41, intelligence: 66, accuracy: 85, magicResist: 38 },
  8: { hp: 980, mp: 140, attack: 94, defense: 50, agility: 48, intelligence: 66, accuracy: 88, magicResist: 46 },
};

// 種ごとの差は小さく保ち、行動パターンで個性を出す。
const roleBias: Record<FantasyMonsterCombatRole, Partial<FantasyCombatStats>> = {
  slime: { hp: .96, attack: .96, defense: .92, agility: .9, intelligence: .96, magicResist: 1.08 },
  swarm: { hp: .96, attack: .98, defense: .92, agility: 1.12, intelligence: .94, accuracy: 1.02 },
  beast: { hp: 1.02, attack: 1.02, agility: 1.04, intelligence: .96 },
  skirmisher: { hp: .96, defense: .94, agility: 1.12, accuracy: 1.02 },
  armored: { hp: 1.04, attack: 1.02, defense: 1.1, agility: .92 },
  undead: { hp: 1.04, agility: .92, magicResist: 1.08 },
  caster: { hp: .94, mp: 1.1, attack: .94, defense: .94, intelligence: 1.1, magicResist: 1.08 },
  flying: { hp: .96, defense: .94, agility: 1.12, accuracy: 1.02 },
  dragon: { hp: 1.02, mp: 1.08, attack: 1.02, defense: 1.04, intelligence: 1.06 },
  golem: { hp: 1.06, mp: 0, defense: 1.12, agility: .88, intelligence: .94, magicResist: 1.08 },
};

/** 詠唱・防御・再生の行動差を含む固定の種別予算。挑戦者情報は参照しない。 */
const bossProfiles: Readonly<Record<string, {tier: FantasyAdventurerGrade; stats: Readonly<FantasyCombatStats>}>> = {
  'monster-red-dragon': { tier: 7, stats: { hp: 798, mp: 108, attack: 132, defense: 38, agility: 41, intelligence: 70, accuracy: 85, magicResist: 38 } },
  'monster-frost-dragon': { tier: 7, stats: { hp: 744, mp: 108, attack: 132, defense: 38, agility: 41, intelligence: 70, accuracy: 85, magicResist: 38 } },
  'monster-storm-dragon': { tier: 7, stats: { hp: 662, mp: 108, attack: 132, defense: 38, agility: 41, intelligence: 70, accuracy: 85, magicResist: 38 } },
  'monster-abyss-hydra': { tier: 7, stats: { hp: 784, mp: 100, attack: 132, defense: 36, agility: 43, intelligence: 63, accuracy: 85, magicResist: 38 } },
  'monster-obsidian-guardian': { tier: 7, stats: { hp: 870, mp: 0, attack: 143, defense: 55, agility: 36, intelligence: 62, accuracy: 85, magicResist: 41 } },
  'monster-lich': { tier: 7, stats: { hp: 676, mp: 110, attack: 101, defense: 34, agility: 41, intelligence: 61, accuracy: 85, magicResist: 41 } },
  'monster-phoenix': { tier: 7, stats: { hp: 492, mp: 100, attack: 131, defense: 34, agility: 46, intelligence: 66, accuracy: 87, magicResist: 38 } },
  'monster-elder-dragon': { tier: 8, stats: { hp: 941, mp: 151, attack: 96, defense: 52, agility: 48, intelligence: 70, accuracy: 88, magicResist: 46 } },
  'monster-ancient-frost-dragon': { tier: 8, stats: { hp: 935, mp: 151, attack: 98, defense: 52, agility: 48, intelligence: 70, accuracy: 88, magicResist: 46 } },
  'monster-ancient-storm-dragon': { tier: 8, stats: { hp: 907, mp: 151, attack: 96, defense: 52, agility: 48, intelligence: 70, accuracy: 88, magicResist: 46 } },
  'monster-void-chimera': { tier: 8, stats: { hp: 850, mp: 140, attack: 77, defense: 50, agility: 50, intelligence: 50, accuracy: 88, magicResist: 46 } },
};

export function fantasyMonsterCombatStats(tier: FantasyAdventurerGrade, role: FantasyMonsterCombatRole, species?: string): FantasyCombatStats {
  const fixed = species ? bossProfiles[species] : undefined;
  if (fixed?.tier === tier) return { ...fixed.stats };
  const value = { ...FANTASY_MONSTER_TIER_STATS[tier] };
  for (const key of Object.keys(value) as (keyof FantasyCombatStats)[]) value[key] = Math.round(value[key] * (roleBias[role][key] ?? 1));
  // 入門の洞窟スライムは同級の通常種より体力を一割抑える。
  if (tier === 1 && species === 'monster-cave-slime') value.hp = Math.round(value.hp * .9);
  value.accuracy = Math.min(95, value.accuracy);
  return value;
}

/** 測定の合格基準。戦闘結果の抽選には使わない。 */
export function fantasyMonsterSoloWinTarget(adventurer: FantasyAdventurerGrade, monster: FantasyAdventurerGrade): { min: number; max: number } | undefined {
  if (monster === 7) return adventurer === 6 ? { min: 0, max: .05 } : adventurer === 7 ? { min: .35, max: .45 } : adventurer === 8 ? { min: .55, max: .65 } : undefined;
  if (monster === 8) return adventurer === 7 ? { min: 0, max: .2 } : adventurer === 8 ? { min: .45, max: .55 } : undefined;
  if (monster === adventurer) return { min: .6, max: .8 };
  if (monster === adventurer - 1) return { min: .8, max: 1 };
  if (monster === adventurer + 1) return { min: .1, max: .4 };
  return undefined;
}
