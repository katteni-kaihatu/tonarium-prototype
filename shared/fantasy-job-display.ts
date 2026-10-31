import type { FantasyCharacter, FantasyGender } from './fantasy.ts';
import { FANTASY_JOBS } from './fantasy-data.ts';
import { FANTASY_JOB_PATHS } from './fantasy-job-paths.ts';
import { FANTASY_PRIEST_BRANCHES, type FantasyPriestBranch } from './fantasy-priest-growth.ts';
import type { NpcLocale } from './npc.ts';

type Names=Record<NpcLocale,string>;
type Character=Pick<FantasyCharacter,'job'|'gender'> & Partial<Pick<FantasyCharacter,'jobPaths'|'priestGrowth'>>;
export function fantasyPriestTitle(branch:FantasyPriestBranch,gender:FantasyGender):Names {
  if(branch==='saint')return {ko:gender==='female'?'성녀':gender==='male'?'성자':'성인',en:gender==='female'?'Saintess':'Saint',ja:gender==='female'?'聖女':gender==='male'?'聖者':'聖人'};
  return {...FANTASY_PRIEST_BRANCHES.find(value=>value.id===branch)!.names};
}
export function fantasyCharacterCareerNames(c:Character):Names|undefined {
  if(c.job==='priest'&&c.priestGrowth?.branch)return fantasyPriestTitle(c.priestGrowth.branch,c.gender);
  const path=FANTASY_JOB_PATHS.find(value=>value.id===c.jobPaths?.[c.job]?.path);
  return path?{...path.names}:undefined;
}
export function fantasyCharacterJobNames(c:Character):Names {
  return fantasyCharacterCareerNames(c)??{...(FANTASY_JOBS.find(value=>value.id===c.job)?.names??{ko:'무직',en:'Unemployed',ja:'無職'})};
}
