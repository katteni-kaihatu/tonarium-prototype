import type { FantasyCharacter } from './fantasy.ts';
import type { FantasyAdventurerGrade } from './fantasy-adventurer.ts';
import { FANTASY_JOBS } from './fantasy-data.ts';

export const FANTASY_GUILD_PROMOTION_QUESTS = 5;
export interface FantasyGuildProgress {
  version: 1;
  grade: FantasyAdventurerGrade;
  completedAtGrade: number;
  creditedQuests: string[];
}

export function fantasyCanRegisterGuild(character: { job?: string }): boolean {
  return character.job !== 'priest' && FANTASY_JOBS.find(job => job.id === character.job)?.category !== 'crime';
}
/** 過去の登録を消さず、登録対象外の職業で活動する間だけ等級の適用を止める。 */
export function fantasyRegisteredGuildGrade(character: Pick<FantasyCharacter, 'guildProgress'> & { job?: string }): FantasyAdventurerGrade | 0 {
  return fantasyCanRegisterGuild(character) ? character.guildProgress?.grade ?? 1 : 0;
}

/** 旧戦力審査は登録実績に変換しない。過去の達成は再加算しない。 */
export function fantasyGuildProgress(character: Pick<FantasyCharacter, 'guildProgress' | 'completed'>): FantasyGuildProgress {
  return character.guildProgress ? structuredClone(character.guildProgress)
    : { version: 1, grade: 1, completedAtGrade: 0, creditedQuests: [...new Set(character.completed)] };
}

export function validFantasyGuildProgress(value: unknown): value is FantasyGuildProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const progress = value as Record<string, unknown>;
  return Object.keys(progress).length === 4 && progress.version === 1 && Number.isInteger(progress.grade)
    && Number(progress.grade) >= 1 && Number(progress.grade) <= 8
    && Number.isInteger(progress.completedAtGrade) && Number(progress.completedAtGrade) >= 0 && Number(progress.completedAtGrade) <= FANTASY_GUILD_PROMOTION_QUESTS
    && Array.isArray(progress.creditedQuests) && progress.creditedQuests.length <= 8192
    && progress.creditedQuests.every(id => typeof id === 'string' && /^[a-zA-Z0-9:._-]{1,160}$/.test(id))
    && new Set(progress.creditedQuests).size === progress.creditedQuests.length;
}
