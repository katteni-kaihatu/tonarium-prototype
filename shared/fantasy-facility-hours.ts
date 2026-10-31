import { fantasyLifeJob } from './fantasy-careers.ts';
import { FANTASY_RECIPES } from './fantasy-data.ts';
import { fantasyRankBenefitPrice } from './fantasy-rank-benefits.ts';
import type { FantasyAction, FantasyCharacter } from './fantasy.ts';
import { fantasyBuildings, fantasyCraftFacility } from './fantasy-town.ts';
import { NPC_PUBLIC, type NpcLocale } from './npc.ts';

export const FANTASY_FACILITY_OPEN_HOUR=6;
export const FANTASY_FACILITY_CLOSE_HOUR=18;
export function fantasyFacilityOpen(building:string,hour:number):boolean {
  const time=((hour%24)+24)%24;
  return building==='inn'||building==='guild'||time>=FANTASY_FACILITY_OPEN_HOUR&&time<FANTASY_FACILITY_CLOSE_HOUR;
}
export function fantasyFacilityClosedText(locale:NpcLocale):string {
  return {ko:'영업시간이 아닙니다. 오전 6시에 다시 문을 엽니다.',en:'Closed for the night. Reopens at 06:00.',ja:'夜間は営業していません。午前6時に再開します。'}[locale];
}
export function fantasyFacilityActionError(c:FantasyCharacter,action:FantasyAction):string|undefined {
  if ((action.type === 'craft' || action.type === 'cookMix' && action.station === 'kitchen') && action.workshop === `${c.location}-commercial`) return;
  let building:string|undefined;
  if(action.type==='read')building='library';
  else if(['pray','priestBranch','priestVow','priestReleaseVow'].includes(action.type))building='temple';
  else if(action.type==='lodge')building='inn';
  else if(action.type==='eat')building=fantasyBuildings(c).some(place=>place.id==='inn')?'inn':'restaurant';
  else if(action.type==='craft')building=fantasyCraftFacility(FANTASY_RECIPES.find(recipe=>recipe.id===action.recipe)?.job ?? fantasyLifeJob(c) ?? c.job);
  else if(action.type==='cookMix'&&action.station==='kitchen')building='restaurant';
  else if(action.type==='alchemy')building='tower';
  else if(action.type==='boat')building='shipyard';
  else if(action.type==='buy'||action.type==='sell')building='market';
  else if(action.type==='haggle')building=action.service==='goods'?'market':action.service==='room'?'inn':fantasyBuildings(c).some(place=>place.id==='inn')?'inn':'restaurant';
  else if(action.type==='command'&&['hire','recontract','recover'].includes(action.operation)){
    const choices=action.operation==='recover'?['inn','temple']:action.kind==='troop'?['guild']:action.kind==='summons'?['tower','library']:['market','guild'];
    const available=fantasyBuildings(c).filter(place=>choices.includes(place.id));
    building=(available.find(place=>fantasyFacilityOpen(place.id,c.hour))??available[0])?.id;
  }
  else if(action.type==='learn'||action.type==='job'&&action.via==='npc') {
    const npc=NPC_PUBLIC.find(npc=>npc.id===action.npcId);building=npc?.building==='residence'?undefined:npc?.building;
  } else if(action.type==='job')building=action.job==='priest'?'temple':'guild';
  return building&&!fantasyFacilityOpen(building,c.hour)?fantasyFacilityClosedText('ja'):undefined;
}
export function fantasyTempleTreatment(c:FantasyCharacter,maxHp:number) {
  const illnesses=['poison','burn','frost','weakness'];
  const patient=c.hp>0&&(c.hp<maxHp||!!c.effects?.some(effect=>effect.expiresAt>c.hour&&illnesses.includes(effect.id)));
  const cost=fantasyRankBenefitPrice(c,Math.max(5,Math.ceil(Math.max(0,maxHp-c.hp)/4)+5),'temple');
  return {eligible:patient&&c.gold>=cost&&fantasyBuildings(c).some(building=>building.id==='temple'),patient,cost,hours:.25,hp:Math.max(0,maxHp-c.hp),cures:illnesses};
}
