import type { FantasyCharacter, FantasySkill } from './fantasy.ts';
import { NPC_PUBLIC, type NpcLocale } from './npc.ts';
import { fantasyBuildings } from './fantasy-town.ts';
import { FANTASY_JOBS } from './fantasy-data.ts';

export const FANTASY_MENTOR_SKILLS: (FantasySkill & { names: Record<NpcLocale, string> })[] = [
  { id: 'mentor-parry', name: '基礎の受け流し', names: { ko: '기초 흘려내기', en: 'Basic parry', ja: '基礎の受け流し' }, kind: 'active', description: '次の危険の被害を軽減する。', mp: 4, effect: 'guard', power: 5 },
  { id: 'mentor-steady-hand', name: '落ち着いた手仕事', names: { ko: '차분한 손길', en: 'Steady hands', ja: '落ち着いた手仕事' }, kind: 'active', description: '次の手先の判定を助ける。', mp: 4, effect: 'check', stat: 'dexterity', power: 2 },
  { id: 'mentor-focus', name: '基礎の集中', names: { ko: '기초 집중', en: 'Basic focus', ja: '基礎の集中' }, kind: 'active', description: '次の知力の判定を助ける。', mp: 4, effect: 'check', stat: 'intelligence', power: 2 },
];

export function fantasyLearnedSkills(character: Pick<FantasyCharacter, 'learnedSkills'>): FantasySkill[] {
  return FANTASY_MENTOR_SKILLS.filter(skill => character.learnedSkills?.includes(skill.id));
}

export function fantasyNpcMentorSkills(npcId: string, character?: FantasyCharacter): typeof FANTASY_MENTOR_SKILLS {
  const npc = NPC_PUBLIC.find(entry => entry.id === npcId);
  const ordinary = FANTASY_MENTOR_SKILLS.filter(skill => npc?.trainableSkills?.includes(skill.id));
  const specialized = character && npc?.trainableJobs?.includes(character.job) ? (FANTASY_JOBS.find(job => job.id === character.job)?.skills ?? []).filter(skill => skill.unlock?.kind === 'mentor').map(skill => ({ ...skill, names: skill.names ?? { ko: skill.name, en: skill.name, ja: skill.name } })) : [];
  return [...ordinary, ...specialized];
}

export function fantasyApprenticeshipError(character: FantasyCharacter, npcId: string, skillId: string): string | undefined {
  const npc = NPC_PUBLIC.find(entry => entry.id === npcId);
  const skill = fantasyNpcMentorSkills(npcId, character).find(skill => skill.id === skillId);
  if (!npc || npc.homeLocation !== character.location || !skill
    || npc.building !== 'residence' && !fantasyBuildings(character).some(building => building.id === npc.building && building.npcIds.includes(npcId))) return 'この場所でその技能を教える師はいません。';
  if ((skill.unlock?.kind === 'mentor' ? character.unlockedSkills : character.learnedSkills)?.includes(skillId)) return 'その技能はすでに習得しています。';
  if (skill.unlock?.kind === 'mentor' && (character.jobXp[character.job] ?? 0) < (skill.unlock.jobXp ?? 0)) return 'この職業の熟練度が指導の条件に足りません。';
  if (character.gold < 5) return '指導料5Gが足りません。';
  return undefined;
}

export function validFantasyApprenticeship(character: Pick<FantasyCharacter, 'learnedSkills'>): boolean {
  return character.learnedSkills === undefined || Array.isArray(character.learnedSkills) && new Set(character.learnedSkills).size === character.learnedSkills.length
    && character.learnedSkills.length <= FANTASY_MENTOR_SKILLS.length && character.learnedSkills.every(id => FANTASY_MENTOR_SKILLS.some(skill => skill.id === id));
}
