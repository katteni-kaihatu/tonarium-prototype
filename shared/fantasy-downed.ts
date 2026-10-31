import type {FantasyProfile} from './fantasy.ts';
import {fantasyRescueTown,recordFantasyDeath} from './fantasy-mortality.ts';
export interface FantasyDownedState {since:number;expiresAt:number;treatedAt?:number;wakesAt?:number;kind?:'damage'|'sacrifice';severity?:1|2|3;careHours?:number;lastCareAt?:number;dawnDebt?:boolean}
const log=(p:FantasyProfile,text:string)=>{p.log.push({id:(p.log.at(-1)?.id??0)+1,hour:p.character!.hour,text,kind:'system'});p.log=p.log.slice(-100);};
export function beginFantasyDowned(p:FantasyProfile,hour:number,kind:'damage'|'sacrifice'='damage',severity:1|2|3=1,dawnDebt=false){
  const c=p.character;if(!c||p.death||c.hp>0||c.downed)return;
  c.downed={since:hour,expiresAt:hour+(kind==='sacrifice'?48:severity===3?2:severity===2?4:6),kind,severity,...(dawnDebt?{dawnDebt:true}:{})};delete p.activity;p.event=null;log(p,kind==='sacrifice'?'downed:sacrifice':'downed:damage');
}
export function stabilizeFantasyDowned(p:FantasyProfile,hour:number):boolean{
  const d=p.character?.downed;if(!d||d.kind==='sacrifice'||d.dawnDebt||p.death||p.combatId||d.treatedAt!==undefined||hour>=d.expiresAt||hour<d.since)return false;
  d.treatedAt=hour;d.wakesAt=hour+2;d.expiresAt=Math.max(d.expiresAt,d.wakesAt);log(p,'応急手当てで容体が安定した。目覚めるまで2時間。');return true;
}
export function wakeFantasyDowned(p:FantasyProfile,hp:number):boolean{
  const c=p.character;if(!c?.downed||c.downed.dawnDebt||c.lastDawnPledge||p.death)return false;
  c.hp=Math.max(1,Math.floor(hp));delete c.downed;log(p,'手当てを受け、意識を取り戻した。');return true;
}
export function advanceFantasyDowned(p:FantasyProfile,hour:number):boolean{
  const c=p.character,d=c?.downed;if(!c||!d||p.death||p.combatId)return false;
  c.hour=Math.max(c.hour,hour);
  if(d.kind==='sacrifice'&&!d.dawnDebt)return wakeFantasyDowned(p,20);
  if(d.wakesAt!==undefined&&hour>=d.wakesAt)return wakeFantasyDowned(p,20);
  if(hour<d.expiresAt)return false;
  const town=fantasyRescueTown(c);
  if(town){c.location=town;delete c.travelPosition;if(c.dungeon)delete c.dungeon.active;c.gold-=Math.floor(c.gold*.1);if(!c.visited.includes(town))c.visited.push(town);return wakeFantasyDowned(p,20);}
  delete c.downed;if(c.dungeon)delete c.dungeon.active;recordFantasyDeath(p,'倒れたまま手当てが届かず、命の灯が消えた');return true;
}
export function validFantasyDowned(p:Pick<FantasyProfile,'character'|'death'|'activity'>):boolean{
  const c=p.character,d=c?.downed;if(d===undefined)return !c||!!p.death||c.hp>0;
  const finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
  return !p.death&&!p.activity&&c!.hp===0&&!!d&&typeof d==='object'&&!Array.isArray(d)&&Object.keys(d).every(k=>['since','expiresAt','treatedAt','wakesAt','kind','severity','careHours','lastCareAt','dawnDebt'].includes(k))&&finite(d.since)&&finite(d.expiresAt)&&d.since<=c!.hour&&d.expiresAt>d.since
    &&(d.kind===undefined||['damage','sacrifice'].includes(d.kind))&&(d.severity===undefined||[1,2,3].includes(d.severity))&&(d.careHours===undefined||finite(d.careHours)&&d.careHours<=12)&&(d.lastCareAt===undefined||finite(d.lastCareAt)&&d.lastCareAt>=d.since&&d.lastCareAt<=c!.hour)&&(d.dawnDebt===undefined||typeof d.dawnDebt==='boolean')
    &&(d.treatedAt===undefined?d.wakesAt===undefined:finite(d.treatedAt)&&d.treatedAt>=d.since&&d.treatedAt<=c!.hour&&finite(d.wakesAt)&&d.wakesAt===d.treatedAt+2&&d.wakesAt<=d.expiresAt);
}

export function fantasyDownedText(source:string,locale:'ko'|'en'|'ja'):string|undefined{
  if(source==='downed:sacrifice')return {ko:'강한 힘의 대가로 빈사(실신)에 빠졌다. 전투가 끝나면 스스로 의식을 회복한다.',en:'The cost of great power caused a sacrificial collapse. Consciousness returns after combat.',ja:'強い力の代償で瀕死（失神）となった。戦闘後に自ら意識を取り戻す。'}[locale];
  if(source==='downed:damage')return {ko:'치명상을 입고 쓰러졌다. 동료의 기적이나 치료가 필요하다.',en:'A grievous wound has left you down. A companion’s miracle or treatment is needed.',ja:'致命傷で倒れた。仲間の奇跡や治療が必要だ。'}[locale];
  if(source==='miracle:last-dawn-death')return {ko:'마지막 새벽의 빛을 남기고, 약속한 생명을 다했다.',en:'Leaving the light of the last dawn, you fulfilled the pledge of your life.',ja:'最後の夜明けの光を残し、約束した命を捧げた。'}[locale];
}
