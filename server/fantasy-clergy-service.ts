import type { FantasyProfile } from '../shared/fantasy.ts';
import { validFantasyCombatState, type FantasyCombatState } from '../shared/fantasy-combat.ts';
import { fantasyCombatContributionTotals } from '../shared/fantasy-combat-contribution.ts';
import { FANTASY_PRIEST_COMBAT_SERVICE_LIMIT, FANTASY_PRIEST_COMBAT_FAITH_LIMIT, FANTASY_PRIEST_COMBAT_DAILY_LIMIT, syncFantasyPriestGrowth, validFantasyPriestGrowth } from '../shared/fantasy-priest-growth.ts';

export function recordFantasyClergyCombatService(profile:FantasyProfile,state:FantasyCombatState,user:string):boolean {
  const c=profile.character;
  if(!c||profile.death||c.job!=='priest'||state.status!=='victory'||!validFantasyCombatState(state)||!validFantasyPriestGrowth(c))return false;
  const fighter=state.fighters.find(f=>f.side==='players'&&f.userId===user&&f.generation===(profile.generation??1));
  if(!fighter||fighter.fled||fighter.vocation?.job!=='priest'||new Set(state.fighters.filter(f=>f.side==='players'&&f.userId).map(f=>f.userId)).size<2)return false;
  const proof=`service:${state.id}`;
  if(Object.hasOwn(c.combatVictories??{},proof)||c.priestGrowth?.support?.some(entry=>entry.battle===state.id))return false;
  const totals=fantasyCombatContributionTotals(state,user,fighter.generation!);
  if(totals.allyHealing+totals.allyProtection+totals.allyRescue<=0)return false;
  const entries=c.priestGrowth?.support??[],hour=Math.max(c.hour,state.hour),day=Math.floor(hour/24);
  const lifetime=entries.reduce((sum,entry)=>sum+entry.points,0),daily=entries.filter(entry=>entry.day===day).reduce((sum,entry)=>sum+entry.points,0);
  if(entries.length>=FANTASY_PRIEST_COMBAT_SERVICE_LIMIT)return false;
  const desired=totals.allyRescue>0||totals.allyHealing+totals.allyProtection>=50?2:1;
  const points=Math.min(desired,FANTASY_PRIEST_COMBAT_FAITH_LIMIT-lifetime,FANTASY_PRIEST_COMBAT_DAILY_LIMIT-daily);
  if(points<1)return false;
  c.hour=hour;syncFantasyPriestGrowth(c);
  (c.priestGrowth!.support??=[]).push({battle:state.id,day,points:points as 1|2,hour});
  (c.combatVictories??={})[proof]=hour;
  return true;
}
