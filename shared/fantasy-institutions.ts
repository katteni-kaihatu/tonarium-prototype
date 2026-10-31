import type { FantasyCharacter, FantasyQuest } from './fantasy.ts';
import { FANTASY_JOBS } from './fantasy-data.ts';
import { NPC_PUBLIC } from './npc.ts';
import { fantasyBuildings } from './fantasy-town.ts';
import { fantasyFacilityOpen } from './fantasy-facility-hours.ts';
import { fantasyCanRegisterGuild } from './fantasy-guild-progression.ts';
import type { NpcLocale } from './npc.ts';

export type FantasyInstitution = 'guild' | 'temple' | 'underworld' | 'personal';
export const FANTASY_INSTITUTIONS: readonly FantasyInstitution[] = ['guild','temple','underworld','personal'];
export const fantasyCriminalJob = (id:string) => FANTASY_JOBS.some(job=>job.id===id&&job.category==='crime');
export function fantasyCriminalContact(npcId:string): boolean {
 return NPC_PUBLIC.some(npc=>npc.id===npcId&&(npc.trainableJobs??[]).some(fantasyCriminalJob));
}
export function fantasyQuestInstitution(q:FantasyQuest):FantasyInstitution {
 if(q.institution&&FANTASY_INSTITUTIONS.includes(q.institution))return q.institution;
 if(q.chapter||q.id.startsWith('main-'))return 'personal';
 if(q.jobs?.length&&q.jobs.every(fantasyCriminalJob)||q.issuer&&fantasyCriminalContact(q.issuer))return 'underworld';
 if(q.building==='temple'||q.jobs?.length===1&&q.jobs[0]==='priest'||q.issuer&&NPC_PUBLIC.some(npc=>npc.id===q.issuer&&npc.building==='temple'))return 'temple';
 if(q.id.startsWith('guild-hunt-')||q.objective?.type==='hunt'||q.issuer&&NPC_PUBLIC.some(npc=>npc.id===q.issuer&&npc.building==='guild'))return 'guild';
 return 'personal';
}
export function fantasyInstitutionEligible(c:FantasyCharacter,source:FantasyInstitution):boolean {
 return source==='guild'?fantasyCanRegisterGuild(c)&&!!c.guildProgress:source==='temple'?c.job==='priest':source==='underworld'?fantasyCriminalJob(c.job):true;
}
export function fantasyInstitutionPresent(c:FantasyCharacter,source:FantasyInstitution):boolean {
 if(c.hp<=0||c.dungeon?.active||c.travelPosition&&c.travelPosition.fraction>0&&c.travelPosition.fraction<1)return false;
 if(source==='underworld')return NPC_PUBLIC.some(npc=>npc.homeLocation===c.location&&fantasyCriminalContact(npc.id));
 if(source==='personal')return NPC_PUBLIC.some(npc=>npc.homeLocation===c.location&&!npc.travelOnly);
 return fantasyBuildings(c).some(building=>building.id===source)&&fantasyFacilityOpen(source,c.hour);
}
export function fantasyInstitutionName(source:FantasyInstitution,locale:NpcLocale):string {
 return {guild:{ko:'길드 의뢰',en:'Guild contracts',ja:'ギルド依頼'},temple:{ko:'신전 의뢰',en:'Temple commissions',ja:'神殿依頼'},underworld:{ko:'뒷골목 의뢰',en:'Underworld contracts',ja:'裏社会の依頼'},personal:{ko:'주민의 부탁',en:'Resident requests',ja:'住民の頼み'}}[source][locale];
}
export function fantasyInstitutionText(text:string,locale:NpcLocale):string|undefined {
 const paid=text.match(/^party-contract:paid:(\d+):([1-6])$/);if(!paid)return;
 return {ko:`의뢰 보수를 ${paid[2]}명이 나눠 받았습니다. 내 몫 ${paid[1]}G.`,en:`The contract payment was shared among ${paid[2]} members. Your share: ${paid[1]}G.`,ja:`依頼報酬を${paid[2]}人で分配した。自分の取り分は${paid[1]}G。`}[locale];
}
