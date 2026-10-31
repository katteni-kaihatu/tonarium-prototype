import type { FantasyCharacter, FantasyItem, FantasyJob, FantasySkill } from './fantasy.ts';
import { fantasySkillName } from './fantasy-skill-names.ts';

export type FantasyRankBookSource = 'adventurer' | 'priest';
export interface FantasyRankBookReward { skill: string; book: string; hour: number; readAt?: number }
export type FantasyRankBookRewards = Partial<Record<FantasyRankBookSource, FantasyRankBookReward>>;
export const FANTASY_RANK_BOOK_SOURCES = ['adventurer', 'priest'] as const;
export const fantasyRankBookId = (skill: string) => `rank-manual-${skill}`;

// 職業一覧の通常技能だけを教本にする。
export function fantasyRankBookOrdinarySkill(skill: FantasySkill): boolean {
  return !skill.retired && !/^(ultimate-|job-path-|priest-path-|miracle-|saint-|last-dawn)/.test(skill.id);
}
export function fantasyRankBookItems(jobs: readonly FantasyJob[]): FantasyItem[] {
  const skills = [...new Map(jobs.flatMap(job => job.skills).filter(fantasyRankBookOrdinarySkill).map(skill => [skill.id, skill])).values()];
  return skills.map(skill => {
    const names = { ko: `${fantasySkillName(skill, 'ko')} 교본`, en: `${fantasySkillName(skill, 'en')} manual`, ja: `${fantasySkillName(skill, 'ja')}の教本` };
    const descriptions = {
      ko: `${fantasySkillName(skill, 'ko')}을 익히는 승급 보상 교본. 해당 직업으로 읽으면 교본 1권을 소비하고 기술을 습득합니다.`,
      en: `A rank reward manual teaching ${fantasySkillName(skill, 'en')}. Read while following its profession to consume one copy and learn the skill.`,
      ja: `${fantasySkillName(skill, 'ja')}を学ぶ昇格報酬の教本。対応する職業で読むと1冊を消費して技能を習得する。`,
    };
    return { id: fantasyRankBookId(skill.id), name: names.ja, names, description: descriptions.ja, descriptions, price: 0, category: 'rank-skill-book', craftOnly: true };
  });
}
export function fantasyRankBookLearned(c: Pick<FantasyCharacter, 'rankBookRewards'>, skill: string): boolean {
  return FANTASY_RANK_BOOK_SOURCES.some(source => c.rankBookRewards?.[source]?.skill === skill && c.rankBookRewards[source]!.readAt !== undefined);
}
