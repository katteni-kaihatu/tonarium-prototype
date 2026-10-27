import type { FantasyCharacter, FantasyStats } from './fantasy.ts';

export const FANTASY_BIRTH_RANGES = { hp: 5, mp: 3, strength: 1, agility: 1, intelligence: 1, luck: 1, vitality: 1 } as const;

/** 誕生時だけ抽選し、その後は保存された個体差を使う。性別や種族で抽選を変えない。 */
export function fantasyBirthBonuses(rng: () => number = Math.random): Partial<FantasyStats> {
  const bonuses: Partial<FantasyStats> = {};
  for (const [key, range] of Object.entries(FANTASY_BIRTH_RANGES)) {
    const roll = Math.max(0, Math.min(1 - Number.EPSILON, Number(rng()) || 0));
    bonuses[key as keyof typeof FANTASY_BIRTH_RANGES] = Math.floor(roll * (range * 2 + 1)) - range;
  }
  return bonuses;
}

export function validFantasyBirth(character: Pick<FantasyCharacter, 'birthBonuses'>): boolean {
  const bonuses = character.birthBonuses;
  return bonuses === undefined || !!bonuses && typeof bonuses === 'object' && !Array.isArray(bonuses)
    && Object.entries(bonuses).every(([key, value]) => Object.hasOwn(FANTASY_BIRTH_RANGES, key) && Number.isInteger(value) && Math.abs(value!) <= FANTASY_BIRTH_RANGES[key as keyof typeof FANTASY_BIRTH_RANGES]);
}
