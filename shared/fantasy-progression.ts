import { fantasyLifeJob, fantasyHasJob, fantasyIsLifeJob } from './fantasy-careers.ts';
import type { FantasyCharacter, FantasyProfile, FantasySkill } from './fantasy.ts';
import { fantasyRankBookLearned } from './fantasy-rank-book-catalog.ts';
import { FANTASY_JOBS, FANTASY_LOCATIONS, FANTASY_QUESTS, FANTASY_RACES } from './fantasy-data.ts';
import { FANTASY_READABLE_LIBRARY_BOOKS } from './fantasy-library.ts';
import { FANTASY_MENTOR_SKILLS } from './fantasy-apprenticeship.ts';
import { validFantasyReputation } from './fantasy-reputation.ts';
import { FANTASY_PRIEST_PATH_SKILLS } from './fantasy-priest-growth.ts';
import { fantasyIsJobPathSkill } from './fantasy-job-paths.ts';

export const FANTASY_PROFESSION_THRESHOLDS = [0, 30, 100, 250, 600] as const;
const cap = 1_000_000;
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= cap;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const unique = (value: unknown): value is string[] => Array.isArray(value) && value.every(id => typeof id === 'string') && new Set(value).size === value.length;

export function fantasyProfessionGrade(character: Pick<FantasyCharacter, 'job' | 'jobXp'>, job = character.job): number {
  const xp = character.jobXp[job] ?? 0;
  return FANTASY_PROFESSION_THRESHOLDS.reduce<number>((grade, threshold, index) => xp >= threshold ? index : grade, 0);
}
export function fantasyProficiencyBonus(character: FantasyCharacter, key = character.job): number {
  return FANTASY_PROFESSION_THRESHOLDS.reduce<number>((grade, threshold, index) => (character.jobXp[key] ?? character.skillXp?.[key] ?? 0) >= threshold ? index : grade, 0);
}
export function fantasyPracticeMultiplier(character: FantasyCharacter, key: string): number {
  const prior = character.proficiencyUse;
  const repeats = prior?.key === key && character.hour - prior.hour < 6 ? prior.repeats : 0;
  return Math.max(0.125, 1 / 2 ** Math.min(3, repeats));
}

/** 技能の加点では反復履歴を上書きせず、行動完了の加点で一度だけ更新する。 */
export function grantFantasyPractice(character: FantasyCharacter, options: { key: string; amount: number; success: boolean; skill?: string; practice?: keyof NonNullable<FantasyCharacter['practice']>; job?: string }): number {
  const amount = Math.max(1, Math.floor(Math.max(0, options.amount) * fantasyPracticeMultiplier(character, options.key) * (options.success ? 1 : 1 / 3)));
  if (options.skill) {
    character.skillXp ??= {};
    character.skillXp[options.skill] = Math.min(cap, (character.skillXp[options.skill] ?? 0) + amount);
  } else {
    const job = options.job ?? (['craft','gather','fish'].includes(options.practice ?? '') ? fantasyLifeJob(character) ?? 'unassigned' : character.job);
    character.jobXp[job] = Math.min(cap, (character.jobXp[job] ?? 0) + amount);
    const prior = character.proficiencyUse;
    const repeats = prior?.key === options.key && character.hour - prior.hour < 6 ? prior.repeats + 1 : 1;
    character.proficiencyUse = { key: options.key, hour: character.hour, repeats };
    if (options.practice) {
      character.practice ??= {};
      character.practice[options.practice] = Math.min(cap, (character.practice[options.practice] ?? 0) + 1);
    }
  }
  return amount;
}

export function fantasySkillUnlocked(character: FantasyCharacter, skill: FantasySkill): boolean {
  if (skill.retired) return false;
  const owner=FANTASY_JOBS.find(job=>job.skills.some(known=>known.id===skill.id));
  if(owner&&!fantasyHasJob(character,owner.id))return false;
  if(owner&&owner.id!==character.job)return fantasySkillUnlocked({...character,job:owner.id},skill);
  if (fantasyRankBookLearned(character, skill.id) && FANTASY_JOBS.find(job => job.id === character.job)?.skills.some(known => known.id === skill.id)) return true;
  const unlock = skill.unlock;
  if (!unlock) return true;
  if (unlock.kind === 'job') return (character.jobXp[character.job] ?? 0) >= unlock.xp;
  if (unlock.kind === 'skill') return (character.skillXp?.[unlock.skill] ?? 0) >= unlock.xp;
  if (unlock.kind === 'book') return !!character.readBooks?.includes(unlock.book) && (character.jobXp[character.job] ?? 0) >= (unlock.jobXp ?? 0);
  if (unlock.kind === 'mentor') return !!character.unlockedSkills?.includes(skill.id) && (character.jobXp[character.job] ?? 0) >= (unlock.jobXp ?? 0);
  return (character.practice?.[unlock.condition] ?? 0) >= unlock.count;
}
export function fantasyAvailableJobSkills(character: FantasyCharacter): FantasySkill[] {
  const jobs=[character.job,...(fantasyLifeJob(character)&&fantasyLifeJob(character)!==character.job?[fantasyLifeJob(character)!]:[])];
  return jobs.flatMap(job=>(FANTASY_JOBS.find(entry=>entry.id===job)?.skills??[]).filter(skill=>fantasySkillUnlocked({...character,job},skill)));
}
export function fantasySkilledPower(character: FantasyCharacter, skill: FantasySkill): number {
  return skill.power + Math.min(skill.kind === 'active' ? 3 : 2, Math.floor((character.skillXp?.[skill.id] ?? 0) / (skill.kind === 'active' ? 50 : 100)));
}

export function validFantasyProgression(character: FantasyCharacter): boolean {
  if(character.lifeJob!==undefined&&(!fantasyIsLifeJob(character.lifeJob)||!Object.hasOwn(character.jobXp,character.lifeJob)))return false;
  const skills = [...FANTASY_JOBS.flatMap(job => job.skills), ...FANTASY_RACES.flatMap(race => race.skills), ...FANTASY_MENTOR_SKILLS, ...FANTASY_PRIEST_PATH_SKILLS];
  const knownSkill = (id: string) => skills.some(skill => skill.id === id) || FANTASY_BODY_ATTACK_IDS.has(id) || fantasyIsJobPathSkill(id) || ['mana-body-strength', 'mana-body-agility', 'mana-body-vitality', 'mana-focus', 'mana-ward'].includes(id);
  if (character.skillXp !== undefined && (!record(character.skillXp) || Object.entries(character.skillXp).some(([id, xp]) => !knownSkill(id) || !count(xp)))) return false;
  if (character.practice !== undefined && (!record(character.practice) || Object.entries(character.practice).some(([key, value]) => !['explore', 'craft', 'gather', 'hunt', 'fish', 'command'].includes(key) || !count(value)))) return false;
  if (character.readBooks !== undefined && (!unique(character.readBooks) || character.readBooks.some(id => !FANTASY_READABLE_LIBRARY_BOOKS.some(book => book.id === id)))) return false;
  if (character.unlockedSkills !== undefined && (!unique(character.unlockedSkills) || character.unlockedSkills.some(id => !skills.some(skill => skill.id === id && skill.unlock?.kind === 'mentor')))) return false;
  const use = character.proficiencyUse;
  if (use !== undefined && (!record(use) || Object.keys(use).length !== 3 || typeof use.key !== 'string' || !/^[a-z0-9][a-z0-9:.-]{0,119}$/.test(use.key) || !count(use.repeats) || use.repeats < 1 || !Number.isFinite(use.hour) || use.hour < 0 || use.hour > character.hour)) return false;
  return character.lifeStartedAt === undefined || Number.isFinite(character.lifeStartedAt) && character.lifeStartedAt >= 0 && character.lifeStartedAt <= character.hour;
}

export function validFantasyLifeProfile(profile: FantasyProfile): boolean {
  const generation = profile.generation ?? 1;
  if (!Number.isSafeInteger(generation) || generation < 1 || generation > cap) return false;
  const lives = profile.pastLives ?? [];
  if (!Array.isArray(lives) || new Set(lives.map(life => life?.generation)).size !== lives.length) return false;
  for (const life of lives) {
    if (!record(life) || Object.keys(life).some(key => !['generation', 'name', 'race', 'job', 'level', 'hour', 'location', 'cause', 'visited', 'completed', 'jobXp', 'reputation', 'ageHours'].includes(key))
      || !count(life.generation) || life.generation < 1 || life.generation > generation || typeof life.name !== 'string' || !life.name.trim() || Array.from(life.name).length > 24 || /[\u0000-\u001f\u007f]/.test(life.name)
      || !FANTASY_RACES.some(race => race.id === life.race) || !FANTASY_JOBS.some(job => job.id === life.job) || !count(life.level) || life.level < 1
      || !Number.isFinite(life.hour) || life.hour < 0 || life.location !== 'sea' && !FANTASY_LOCATIONS.some(location => location.id === life.location) || typeof life.cause !== 'string' || life.cause.length > 160
      || !unique(life.visited) || life.visited.some(id => !FANTASY_LOCATIONS.some(location => location.id === id))
      || !unique(life.completed) || life.completed.some(id => !FANTASY_QUESTS.some(quest => quest.id === id))
      || !record(life.jobXp) || Object.entries(life.jobXp).some(([id, xp]) => !FANTASY_JOBS.some(job => job.id === id) || !count(xp))
      || life.ageHours !== undefined && (!Number.isFinite(life.ageHours) || life.ageHours < 0 || life.ageHours > life.hour)
      || !validFantasyReputation({ reputation: life.reputation } as FantasyCharacter)) return false;
  }
  if (!profile.death) return !profile.character || profile.character.hp > 0 || profile.character.hp===0&&!!profile.character.downed&&!profile.activity;
  return !!profile.character && record(profile.death) && Object.keys(profile.death).length === 3 && profile.character.hp === 0 && !profile.activity && profile.event === null
    && (profile.death.location === 'sea' || profile.death.location === profile.character.location) && Number.isFinite(profile.death.hour) && profile.death.hour >= 0 && profile.death.hour <= profile.character.hour
    && typeof profile.death.cause === 'string' && profile.death.cause.length <= 160 && lives.some(life => life.generation === generation && life.hour === profile.death!.hour);
}
import { FANTASY_BODY_ATTACK_IDS } from './fantasy-body-combat-catalog.ts';
