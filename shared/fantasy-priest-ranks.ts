import { FANTASY_GUILD_PROMOTION_QUESTS } from './fantasy-guild-progression.ts';
import type { FantasyAdventurerGrade } from './fantasy-adventurer.ts';
import type { NpcLocale } from './npc.ts';

export type FantasyPriestGrade = 1 | 2 | 3 | 4 | 5;
export interface FantasyPriestRank {
  grade: FantasyPriestGrade;
  faith: number;
  adventurerGrade: FantasyAdventurerGrade;
  names: Record<NpcLocale, string>;
}

export const FANTASY_PRIEST_SERVICE_FAITH = 4;
export const FANTASY_PRIEST_VOW_FAITH = 5;
const faithAtAdventurerGrade = (grade: FantasyAdventurerGrade) => (grade - 1) * FANTASY_GUILD_PROMOTION_QUESTS * (FANTASY_PRIEST_SERVICE_FAITH + FANTASY_PRIEST_VOW_FAITH);

export const FANTASY_PRIEST_RANKS: readonly FantasyPriestRank[] = [
  { grade: 1, faith: faithAtAdventurerGrade(1), adventurerGrade: 1, names: { ko: '수련 사제', en: 'Novice Priest', ja: '修練司祭' } },
  { grade: 2, faith: faithAtAdventurerGrade(2), adventurerGrade: 2, names: { ko: '서원 사제', en: 'Vowed Priest', ja: '誓願司祭' } },
  { grade: 3, faith: faithAtAdventurerGrade(4), adventurerGrade: 4, names: { ko: '정식 사제', en: 'Ordained Priest', ja: '正司祭' } },
  { grade: 4, faith: faithAtAdventurerGrade(6), adventurerGrade: 6, names: { ko: '고위 사제', en: 'High Priest', ja: '高位司祭' } },
  { grade: 5, faith: faithAtAdventurerGrade(8), adventurerGrade: 8, names: { ko: '대사제', en: 'Archpriest', ja: '大司祭' } },
];

/** 職業の専門分野や寺院の役職とは別の、信仰による称号。 */
export function fantasyPriestFaithRank(faith: number): FantasyPriestRank {
  const value = Number.isFinite(faith) ? Math.max(0, faith) : 0;
  return FANTASY_PRIEST_RANKS.reduce((current, entry) => value >= entry.faith ? entry : current, FANTASY_PRIEST_RANKS[0]);
}

export function fantasyPriestRankName(grade: FantasyPriestGrade, locale: NpcLocale): string {
  const rank = FANTASY_PRIEST_RANKS.find(entry => entry.grade === grade) ?? FANTASY_PRIEST_RANKS[0];
  return `${rank.names[locale]} (${rank.grade})`;
}
