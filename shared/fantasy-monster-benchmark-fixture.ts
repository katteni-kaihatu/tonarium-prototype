import { fantasyMonsterGradePowerReference } from './fantasy-monster-balance.ts';
import type { FantasyAdventurerGrade } from './fantasy-adventurer.ts';
import type { FantasyCombatStats } from './fantasy-combat-catalog.ts';

// 診断用の合成値。実際の装備検証や人物の能力値には流用しない。
const shapes: Record<FantasyAdventurerGrade, Omit<FantasyCombatStats, 'attack'>> = {
  1: { hp: 100, mp: 50, defense: 10, agility: 10, intelligence: 10, accuracy: 72, magicResist: 8 },
  2: { hp: 115, mp: 55, defense: 15, agility: 13, intelligence: 13, accuracy: 75, magicResist: 11 },
  3: { hp: 145, mp: 65, defense: 21, agility: 17, intelligence: 17, accuracy: 78, magicResist: 16 },
  4: { hp: 180, mp: 75, defense: 28, agility: 22, intelligence: 22, accuracy: 82, magicResist: 22 },
  5: { hp: 220, mp: 90, defense: 36, agility: 28, intelligence: 28, accuracy: 86, magicResist: 29 },
  6: { hp: 290, mp: 110, defense: 46, agility: 35, intelligence: 35, accuracy: 90, magicResist: 38 },
  7: { hp: 390, mp: 140, defense: 60, agility: 44, intelligence: 44, accuracy: 94, magicResist: 50 },
  8: { hp: 520, mp: 180, defense: 76, agility: 54, intelligence: 54, accuracy: 95, magicResist: 64 },
};

/** 公開の戦力式を逆算し、比較用の基準値を再現する。 */
export function fantasyMonsterBenchmarkStats(grade: FantasyAdventurerGrade): FantasyCombatStats {
  const shape = shapes[grade], power = fantasyMonsterGradePowerReference(grade).reference;
  const durability = shape.hp * (1 + (shape.defense + shape.magicResist) / 100);
  const offenseMultiplier = shape.accuracy / 100 * (1 + shape.agility / (shape.agility + 100)) * (1 + .25 * shape.mp / (shape.mp + 100));
  const attack = Math.max(1, Math.round(power ** 2 / durability / offenseMultiplier - shape.intelligence * .25));
  return { ...shape, attack };
}
