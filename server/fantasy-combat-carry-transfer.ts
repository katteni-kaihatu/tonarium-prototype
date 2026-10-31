import type { FantasyProfile } from '../shared/fantasy.ts';
import type { FantasyCombatState } from '../shared/fantasy-combat.ts';
import type { FantasyCarryReturnContext } from './fantasy-carry-and-return.ts';

export function transferFantasyCombatCarry(state:FantasyCombatState,profiles:Map<string,FantasyProfile>,contextForUser:(user:string)=>FantasyCarryReturnContext|undefined):string[]{
  const changed:string[]=[];
  for(const carrier of state.fighters){
    if(!carrier.userId||!carrier.carrying||carrier.hp<=0||!carrier.fled&&state.status==='active')continue;
    const patient=state.fighters.find(f=>f.id===carrier.carrying),saved=profiles.get(carrier.userId),target=patient?.userId?profiles.get(patient.userId):undefined;
    const c=saved?.character,d=target?.character,context=contextForUser(carrier.userId);
    if(!c||!d||!patient?.userId||!d.downed||d.hp!==0||saved!.death||target!.death||saved!.combatId||target!.combatId||(saved!.generation??1)!==carrier.generation||(target!.generation??1)!==patient.generation||!context?.allies.includes(carrier.userId)||!context.allies.includes(patient.userId)||c.location!==d.location||c.dungeon?.active?.site!==d.dungeon?.active?.site||c.dungeon?.active?.room!==d.dungeon?.active?.room)continue;
    if([...profiles.entries()].some(([user,p])=>user!==carrier.userId&&p.character?.carrying?.target===patient.userId))continue;
    const next=structuredClone(saved!),character=next.character!,room=character.dungeon?.active;
    character.carrying={target:patient.userId,targetGeneration:patient.generation!,generation:carrier.generation!,party:context.party,location:character.location,...(room?{site:room.site,room:room.room}:{})};
    next.revision++;profiles.set(carrier.userId,next);changed.push(carrier.userId);
  }
  return changed;
}
