import type { FantasyAction, FantasyCharacter } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_JOBS } from './fantasy-data.ts';
import { fantasySkillUnlocked } from './fantasy-progression.ts';
import { fantasyRegisteredGuildGrade } from './fantasy-guild-progression.ts';
import { fantasyPriestGrowthStatus } from './fantasy-priest-growth.ts';
import { fantasyBuildings } from './fantasy-town.ts';
import { fantasyFacilityOpen } from './fantasy-facility-hours.ts';
import { fantasyOnRoad } from './fantasy-travel.ts';
import { fantasyBagState } from './fantasy-bags.ts';
import { fantasySkillName } from './fantasy-skill-names.ts';
import { FANTASY_RANK_BOOK_SOURCES, fantasyRankBookId, fantasyRankBookOrdinarySkill, type FantasyRankBookSource } from './fantasy-rank-book-catalog.ts';
export type { FantasyRankBookRewards, FantasyRankBookSource } from './fantasy-rank-book-catalog.ts';

const errors = {
  invalid: { ko: '현재 보상 목록에서 교본을 선택해 주세요.', en: 'Choose a manual from the current reward list.', ja: '現在の報酬一覧から教本を選んでください。' },
  claimed: { ko: '이 승급 보상은 이번 삶에서 이미 받았습니다.', en: 'You already claimed this rank reward in this life.', ja: 'この昇格報酬は今の人生ですでに受け取っています。' },
  adventurer: { ko: '등록된 모험가 등급 6부터 받을 수 있습니다.', en: 'Registered adventurer rank 6 is required.', ja: '登録済みの冒険者等級6から受け取れます。' },
  priest: { ko: '성직 등급 4에 도달한 사제로 받을 수 있습니다.', en: 'Claim as a priest after reaching clergy rank 4.', ja: '聖職等級4に達した司祭として受け取れます。' },
  guild: { ko: '현재 지역의 열린 길드에서 교본을 받으세요.', en: 'Collect the manual at an open local guild.', ja: '現地の開いているギルドで教本を受け取ってください。' },
  temple: { ko: '현재 지역의 열린 신전에서 교본을 받으세요.', en: 'Collect the manual at an open local temple.', ja: '現地の開いている神殿で教本を受け取ってください。' },
  bag: { ko: '교본을 넣을 가방의 무게와 공간을 확보해 주세요.', en: 'Make room for the manual within the bag’s weight and slot limits.', ja: '教本が入るよう鞄の重量と空きを確保してください。' },
  owned: { ko: '아직 읽지 않은 보상 교본을 소지해야 합니다.', en: 'You must carry an unread reward manual.', ja: '未読の報酬教本を所持する必要があります。' },
  job: { ko: '이 교본에 해당하는 직업으로 읽어 주세요.', en: 'Read this manual while following its profession.', ja: 'この教本に対応する職業で読んでください。' },
  learned: { ko: '이미 습득한 기술입니다. 교본은 소비하지 않았습니다.', en: 'You already know this skill. The manual was preserved.', ja: 'すでに習得している技能です。教本は消費していません。' },
};
type ErrorKey = keyof typeof errors;
const error = (key: ErrorKey, locale: NpcLocale) => errors[key][locale];
export function fantasyRankBookEligible(c: FantasyCharacter, source: FantasyRankBookSource): boolean {
  return source === 'adventurer' ? fantasyRegisteredGuildGrade(c) >= 6 : fantasyPriestGrowthStatus({ ...c, job: 'priest' }).clergyGrade >= 4;
}
export function fantasyRankBookChoices(c: FantasyCharacter) {
  const reserved = FANTASY_RANK_BOOK_SOURCES.map(source => c.rankBookRewards?.[source]?.skill);
  return (FANTASY_JOBS.find(job => job.id === c.job)?.skills ?? []).filter(skill => fantasyRankBookOrdinarySkill(skill) && !fantasySkillUnlocked(c, skill) && !reserved.includes(skill.id));
}
export function fantasyRankBookClaimError(c: FantasyCharacter, source: FantasyRankBookSource, skill?: string, locale: NpcLocale = 'ja'): string | undefined {
  if (c.rankBookRewards?.[source]) return error('claimed', locale);
  if (!fantasyRankBookEligible(c, source) || source === 'priest' && c.job !== 'priest') return error(source, locale);
  const building = source === 'adventurer' ? 'guild' : 'temple';
  if (fantasyOnRoad(c) || c.dungeon?.active || !fantasyBuildings(c).some(place => place.id === building) || !fantasyFacilityOpen(building, c.hour)) return error(building, locale);
  if (skill !== undefined && !fantasyRankBookChoices(c).some(choice => choice.id === skill)) return error('invalid', locale);
  if (skill !== undefined && fantasyBagState({ ...c, inventory: { ...c.inventory, [fantasyRankBookId(skill)]: (c.inventory[fantasyRankBookId(skill)] ?? 0) + 1 } }).overloaded) return error('bag', locale);
}
export function fantasyRankBookActionValid(value: unknown): value is Extract<FantasyAction, { type: 'rankBookClaim' }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === 3 && v.type === 'rankBookClaim' && FANTASY_RANK_BOOK_SOURCES.includes(v.source as FantasyRankBookSource)
    && typeof v.skill === 'string' && FANTASY_JOBS.some(job => job.skills.some(skill => skill.id === v.skill && fantasyRankBookOrdinarySkill(skill)));
}
export function claimFantasyRankBook(c: FantasyCharacter, action: Extract<FantasyAction, { type: 'rankBookClaim' }>): string | undefined {
  if (!fantasyRankBookActionValid(action)) return error('invalid', 'ja');
  const reason = fantasyRankBookClaimError(c, action.source, action.skill); if (reason) return reason;
  const book = fantasyRankBookId(action.skill);
  c.inventory[book] = (c.inventory[book] ?? 0) + 1;
  c.rankBookRewards ??= {};
  c.rankBookRewards[action.source] = { skill: action.skill, book, hour: c.hour };
}
export function fantasyRankBookReadError(c: FantasyCharacter, book: string, locale: NpcLocale = 'ja'): string | undefined {
  const reward = FANTASY_RANK_BOOK_SOURCES.map(source => c.rankBookRewards?.[source]).find(reward => reward?.book === book && reward.readAt === undefined);
  if (!reward || (c.inventory[book] ?? 0) < 1) return error('owned', locale);
  const skill = FANTASY_JOBS.find(job => job.id === c.job)?.skills.find(skill => skill.id === reward.skill && fantasyRankBookOrdinarySkill(skill));
  if (!skill) return error('job', locale);
  if (fantasySkillUnlocked(c, skill)) return error('learned', locale);
}
export function readFantasyRankBook(c: FantasyCharacter, book: string): string | undefined {
  const reason = fantasyRankBookReadError(c, book); if (reason) return reason;
  const reward = FANTASY_RANK_BOOK_SOURCES.map(source => c.rankBookRewards?.[source]).find(reward => reward?.book === book && reward.readAt === undefined)!;
  c.inventory[book]--; reward.readAt = c.hour;
}
export function validFantasyRankBookRewards(c: FantasyCharacter): boolean {
  const rewards = c.rankBookRewards;
  if (rewards === undefined) return true;
  if (!rewards || typeof rewards !== 'object' || Array.isArray(rewards) || Object.keys(rewards).some(key => !FANTASY_RANK_BOOK_SOURCES.includes(key as FantasyRankBookSource))) return false;
  const skills = new Set<string>();
  for (const source of FANTASY_RANK_BOOK_SOURCES) {
    const reward = rewards[source]; if (reward === undefined) continue;
    if (!reward || typeof reward !== 'object' || Array.isArray(reward) || ![3, 4].includes(Object.keys(reward).length) || Object.keys(reward).some(key => !['skill', 'book', 'hour', 'readAt'].includes(key))
      || typeof reward.skill !== 'string' || !FANTASY_JOBS.some(job => job.skills.some(skill => skill.id === reward.skill && fantasyRankBookOrdinarySkill(skill)))
      || reward.book !== fantasyRankBookId(reward.skill) || skills.has(reward.skill) || !Number.isFinite(reward.hour) || reward.hour < (c.lifeStartedAt ?? 0) || reward.hour > c.hour
      || reward.readAt !== undefined && (!Number.isFinite(reward.readAt) || reward.readAt < reward.hour || reward.readAt > c.hour) || !fantasyRankBookEligible(c, source)) return false;
    skills.add(reward.skill);
  }
  return true;
}
export function fantasyRankBookText(source: string, locale: NpcLocale): string | undefined {
  const entry = Object.values(errors).find(value => value.ja === source); if (entry) return entry[locale];
  const match = /^rank-book:(claimed|read):([a-z0-9-]+)$/.exec(source); if (!match) return;
  const skill = FANTASY_JOBS.flatMap(job => job.skills).find(skill => skill.id === match[2]); if (!skill) return;
  const name = fantasySkillName(skill, locale);
  return match[1] === 'claimed'
    ? { ko: `${name} 교본을 받았습니다. 소지품에서 읽으면 기술을 습득합니다.`, en: `Received the ${name} manual. Read it from inventory to learn the skill.`, ja: `${name}の教本を受け取った。持ち物から読むと技能を習得する。` }[locale]
    : { ko: `교본 1권을 읽고 ${name}을 습득했습니다.`, en: `Read and consumed one manual to learn ${name}.`, ja: `教本を1冊読み、${name}を習得した。` }[locale];
}
