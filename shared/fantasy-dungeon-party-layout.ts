import type {FantasyCharacter} from './fantasy.ts';
import {fantasyDungeonSiteFor,newFantasyDungeonProgress,validFantasyDungeon,rememberFantasyDungeonMemory} from './fantasy-dungeon.ts';

export function alignFantasyDungeonLayout(c:FantasyCharacter,site:string,seed:number|undefined):boolean {
  if(!validFantasyDungeon(c))return false;
  if(seed!==undefined&&(!Number.isSafeInteger(seed)||seed<1||seed>0xffffffff))return false;
  const dungeon=structuredClone(c.dungeon??{sites:{}}),previous=dungeon.sites[site];
  rememberFantasyDungeonMemory({dungeon},site);
  const progress=previous?structuredClone(previous):newFantasyDungeonProgress(seed);
  if(seed===undefined)delete progress.layoutSeed;else progress.layoutSeed=seed;
  dungeon.sites[site]=progress;
  const candidate={...c,dungeon},layout=fantasyDungeonSiteFor(candidate,site);
  if(!layout)return false;
  const rooms=new Map(layout.rooms.map(room=>[room.id,room]));
  if(previous&&previous.layoutSeed!==seed){progress.visited=[];progress.surveyed=[];}
  else {if(progress.visited)progress.visited=progress.visited.filter(id=>rooms.has(id));if(progress.surveyed)progress.surveyed=progress.surveyed.filter(id=>rooms.has(id));}
  progress.revealed=progress.revealed.filter(id=>rooms.has(id));
  progress.inspected=progress.inspected.filter(id=>progress.revealed.includes(id));
  progress.findings=progress.findings.filter(id=>progress.inspected.includes(id));
  progress.detected=progress.detected.filter(id=>progress.revealed.includes(id)&&rooms.get(id)?.trap);
  progress.disarmed=progress.disarmed.filter(id=>progress.detected.includes(id));
  progress.sprung=progress.sprung.filter(id=>progress.revealed.includes(id)&&rooms.get(id)?.trap);
  progress.cleared=progress.cleared.filter(id=>progress.revealed.includes(id)&&rooms.get(id)?.enemy);
  progress.claimed=progress.claimed.filter(id=>{const room=rooms.get(id);return progress.revealed.includes(id)&&!!(room?.reward||room?.discovery||room?.special);});
  progress.inspectionDays=Object.fromEntries(Object.entries(progress.inspectionDays).filter(([id])=>progress.inspected.includes(id)));
  if(!validFantasyDungeon(candidate))return false;
  c.dungeon=dungeon;return true;
}
