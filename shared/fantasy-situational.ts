import { fantasyLifeJob } from './fantasy-careers.ts';
import type {FantasyCharacter,FantasyStat} from './fantasy.ts';
const environments:Record<string,string[]>={adventurer:['ruin','cave'],hunter:['forest'],ranger:['forest','swamp'],merchant:['city','coast'],blacksmith:['mountain','volcano'],cook:['forest','coast'],alchemist:['swamp','ruin'],bard:['city','island'],mage:['tower','ruin'],priest:['ruin','snow'],leader:['city','mountain'],warrior:['mountain'],knight:['city','snow'],spearfighter:['mountain','forest'],archer:['forest'],scout:['forest','coast'],pugilist:['mountain'],spellblade:['ruin','tower'],shieldbearer:['mountain','cave'],summoner:['forest','ruin'],carpenter:['forest'],tailor:['city'],weaver:['city'],leatherworker:['forest','mountain'],gemcutter:['cave','mountain'],herbalist:['forest','swamp'],farmer:['forest'],fisher:['coast','island','swamp'],baker:['city'],potter:['mountain','coast'],shipwright:['coast','island'],scribe:['ruin','tower'],thief:['ruin','city'],smuggler:['coast','island'],assassin:['forest','city'],bandit:['forest','mountain'],spy:['city','tower'],crimeboss:['city']};
export const FANTASY_JOB_SITUATIONS=environments;
const activities:Record<string,string[]>={merchant:['haggle','work'],blacksmith:['craft','gather'],cook:['craft','gather'],alchemist:['alchemy','alchemyCompose','gather'],carpenter:['craft','gather'],tailor:['craft','work'],weaver:['craft','work'],leatherworker:['craft','skin'],gemcutter:['craft','gather'],herbalist:['gather'],farmer:['work','gather'],fisher:['fish'],baker:['craft'],potter:['craft','gather'],shipwright:['craft','fish'],scribe:['investigate','dungeon','explore'],bard:['event','work'],leader:['command','investigate'],crimeboss:['command','event'],priest:['investigate','dungeon'],mage:['investigate','dungeon']};
export function fantasyWorldSituationalBonus(c:Pick<FantasyCharacter,'job'|'jobPaths'|'lifeJob'>,kind:string,activity:string,stat:FantasyStat):number{
  const life=fantasyLifeJob(c);
  if(life&&life!==c.job&&activities[life]?.includes(activity))return Math.max(fantasyWorldSituationalBonus({...c,lifeJob:undefined},kind,activity,stat),fantasyWorldSituationalBonus({...c,job:life},kind,activity,stat));
  if(c.job==='mage'&&c.jobPaths?.mage?.path==='mage-flame'&&kind==='snow'&&['terrain','explore','dungeon'].includes(activity))return 2;
  if(!Object.hasOwn(environments,c.job)||!environments[c.job].includes(kind))return 0;
  const use=(activities[c.job]??['hunt','explore','terrain','dungeon','event']).includes(activity);if(!use)return 0;
  if(['merchant','bard','leader','crimeboss'].includes(c.job)&&!['charisma','intelligence','luck'].includes(stat))return 0;
  return ['ranger','herbalist','fisher','scribe'].includes(c.job)?2:1;
}
export function fantasyCombatSituationalBonus(vocation:{job?:string;path?:string}|undefined,target:{id?:string;kind?:string},obstacle?:string):{power:number;accuracy:number;label:string[]}{
  const result={power:0,accuracy:0,label:[] as string[]};if(!vocation?.job)return result;
  const path=vocation.path?.startsWith(`${vocation.job}-`)?vocation.path:undefined,id=target.id??'';
  const hit=(name:string,power:number,accuracy:number)=>{result.power=Math.min(6,result.power+power);result.accuracy=Math.min(4,result.accuracy+accuracy);result.label.push(name);};
  if(path==='spearfighter-dragon'&&/dragon|drake|wyvern/.test(id))hit('dragon-lancer',5,3);
  if(path==='mage-flame'&&obstacle&&/ice/.test(obstacle))hit('flame-against-ice',6,3);
  if(path==='mage-ice'&&/flame|fire|ember/.test(id))hit('frost-against-flame',4,2);
  if(path==='mage-wind'&&/wyvern|harpy|bat|hawk|flying/.test(id))hit('wind-against-flying',3,3);
  if(path==='mage-earth'&&/golem|armored|stone/.test(id))hit('earth-against-stone',4,1);
  if(vocation.job==='priest'&&/skeleton|wight|undead|revenant|lich/.test(id))hit('sacred-against-undead',3,2);
  if(['hunter','ranger'].includes(vocation.job)&&/wolf|bear|boar|beast|spider/.test(id))hit('beast-tracking',2,2);
  if(vocation.job==='knight'&&/bandit|raider|brigand/.test(id))hit('keep-the-peace',2,2);
  if(vocation.job==='assassin'&&target.kind==='human')hit('human-anatomy',2,2);
  return result;
}
