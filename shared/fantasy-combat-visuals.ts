import type { FantasySkill } from './fantasy.ts';

export type FantasyCombatVisualTier = 1|2|3|4|5|6;
export function fantasySkillVisualTier(skill:FantasySkill,mastery=0):FantasyCombatVisualTier{
  if(skill.id==='miracle-last-dawn')return 6;
  if(skill.id.startsWith('miracle-'))return 5;
  if(skill.id.startsWith('ultimate-')||skill.id==='priest-saint-holy-strike')return 4;
  const unlock=skill.unlock,required=unlock?.kind==='job'?unlock.xp:unlock&&'jobXp' in unlock&&typeof unlock.jobXp==='number'?unlock.jobXp:0;
  const base=required>=200||skill.id.startsWith('priest-')?3:required>=40||unlock?.kind==='book'||unlock?.kind==='mentor'?2:1;
  return Math.min(3,base+(mastery>=200?1:0)) as FantasyCombatVisualTier;
}
export function fantasyCombatVisualDuration(tier:number):number{
  return tier>=6?4400:tier>=5?2400:tier>=4?2100:tier>=3?1350:tier>=2?1000:700;
}
