import type { FantasyCombatFighter, FantasyCombatState } from './fantasy-combat.ts';
export const FANTASY_COMBAT_RECEIPTS = ['damage', 'healing', 'mana', 'protection', 'control', 'assistance', 'rescue', 'allyHealing', 'allyProtection', 'allyRescue'] as const;
export type FantasyCombatReceipt = typeof FANTASY_COMBAT_RECEIPTS[number];
export type FantasyCombatContributionTotals = Record<FantasyCombatReceipt, number>;
export type FantasyCombatReceipts = Partial<FantasyCombatContributionTotals>;
export function emptyFantasyCombatContribution(): FantasyCombatContributionTotals {
  return {damage:0,healing:0,mana:0,protection:0,control:0,assistance:0,rescue:0,allyHealing:0,allyProtection:0,allyRescue:0};
}
export function validFantasyCombatReceipts(value:unknown):boolean {
  return value===undefined || !!value && typeof value==='object' && !Array.isArray(value)
    && Object.entries(value).every(([key,n])=>(FANTASY_COMBAT_RECEIPTS as readonly string[]).includes(key)&&Number.isSafeInteger(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER)
    && ['Healing','Protection','Rescue'].every(key=>((value as Record<string,number>)[`ally${key}`]??0)<=((value as Record<string,number>)[key.toLowerCase()]??0));
}
export function recordFantasyCombatContribution(actor:FantasyCombatFighter|undefined,kind:FantasyCombatReceipt,amount:number):void {
  if(!actor || actor.side!=='players' || !Number.isSafeInteger(amount) || amount<=0)return;
  const receipts=actor.contribution.receipts??={};
  receipts[kind]=Math.min(Number.MAX_SAFE_INTEGER,(receipts[kind]??0)+amount);
}
export function fantasyCombatContributionSource(state:FantasyCombatState,owner:string,generation:number,unit?:string):FantasyCombatFighter|undefined {
  const player=state.fighters.find(f=>f.userId===owner&&f.generation===generation);
  return !player?undefined:unit?state.units?.find(f=>f.id===unit&&f.companion?.ownerId===owner&&f.companion.generation===generation):player;
}
export function fantasyCombatContributionTotals(state:FantasyCombatState,userId:string,generation:number):FantasyCombatContributionTotals {
  const total=emptyFantasyCombatContribution(),player=fantasyCombatContributionSource(state,userId,generation);
  if(!player)return total;
  const owned=[player,...(state.units??[]).filter(f=>f.companion?.ownerId===userId&&f.companion.generation===generation)];
  for(const actor of owned)for(const kind of FANTASY_COMBAT_RECEIPTS)total[kind]=Math.min(Number.MAX_SAFE_INTEGER,total[kind]+(actor.contribution.receipts?.[kind]??0));
  return total;
}

export function recordFantasyCombatAid(actor:FantasyCombatFighter|undefined,target:FantasyCombatFighter,kind:'healing'|'protection'|'rescue',amount:number):void {
  recordFantasyCombatContribution(actor,kind,amount);
  const owner=actor?.userId??actor?.companion?.ownerId,recipient=target.userId??target.companion?.ownerId;
  if(owner&&recipient&&owner!==recipient&&target.side==='players')recordFantasyCombatContribution(actor,({healing:'allyHealing',protection:'allyProtection',rescue:'allyRescue'} as const)[kind],amount);
}
