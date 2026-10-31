import type { FantasyCombatError, FantasyCombatFighter, FantasyCombatState, FantasyCombatText } from './fantasy-combat.ts';
import { fantasyCombatActors, fantasyCombatDistance, fantasyCombatLineOfSight, fantasyCombatTileKey, fantasyCombatValidTile, type FantasyCombatTile } from './fantasy-combat-tactics.ts';

export const fantasyCombatIsCarrying = (actor: FantasyCombatFighter) => !!actor.carrying || !!actor.externalCarrying;
export const fantasyCombatPatient = (state: FantasyCombatState, actor: FantasyCombatFighter) => actor.carrying ? fantasyCombatActors(state).find(f => f.id === actor.carrying) : undefined;
const patientKind = (f: FantasyCombatFighter) => !!f.userId || !!f.companion && f.companion.kind !== 'summons';
const same = (a: FantasyCombatTile, b: FantasyCombatTile) => fantasyCombatTileKey(a) === fantasyCombatTileKey(b);

function freeDropTile(state: FantasyCombatState, actor: FantasyCombatFighter, patient: FantasyCombatFighter, tile: FantasyCombatTile): boolean {
  const field = state.battlefield;
  return !!field && !!actor.tile && fantasyCombatValidTile(field, tile) && fantasyCombatDistance(actor.tile, tile) === 1
    && fantasyCombatLineOfSight(state, actor.tile, tile)
    && !(field.water ?? []).some(water => same(water, tile)) && !field.blocked.some(blocked => same(blocked, tile)) && !(field.obstacles ?? []).some(obstacle => same(obstacle.tile, tile))
    && !fantasyCombatActors(state).some(f => f.id !== patient.id && !f.fled && f.tile && same(f.tile, tile));
}
export function fantasyCombatDropTile(state: FantasyCombatState, actor: FantasyCombatFighter, preferred?: FantasyCombatTile): FantasyCombatTile | undefined {
  const patient = fantasyCombatPatient(state, actor), from = actor.tile;
  if (!patient || !from) return;
  if (preferred) return freeDropTile(state, actor, patient, preferred) ? { ...preferred } : undefined;
  const choices = [{x:from.x-1,y:from.y},{x:from.x,y:from.y-1},{x:from.x,y:from.y+1},{x:from.x+1,y:from.y}];
  return choices.filter(tile => freeDropTile(state, actor, patient, tile)).sort((a,b) => Number(state.fields?.some(field=>same(field.tile,a))??false)-Number(state.fields?.some(field=>same(field.tile,b))??false))[0];
}
export function fantasyCombatCarryOrderError(state: FantasyCombatState, actor: FantasyCombatFighter, order: {type:'carry';target:string}|{type:'putDown';tile?:FantasyCombatTile}): FantasyCombatError | undefined {
  if (!actor.userId || actor.side !== 'players' || actor.hp <= 0 || actor.fled) return 'not-owner';
  if (order.type === 'putDown') {
    if (!fantasyCombatIsCarrying(actor)) return 'unnecessary';
    if (actor.externalCarrying) return order.tile === undefined ? undefined : 'target';
    return fantasyCombatDropTile(state,actor,order.tile) ? undefined : 'blocked';
  }
  if (fantasyCombatIsCarrying(actor)) return 'carrying';
  const patient = fantasyCombatActors(state).find(f=>f.id===order.target);
  if (!patient || !patientKind(patient) || patient.side !== actor.side || patient.hp !== 0 || patient.fled || patient.id === actor.id) return 'target';
  if (fantasyCombatActors(state).some(f=>f.carrying===patient.id)) return 'carrying';
  if (!state.battlefield || !actor.tile || !patient.tile) return 'blocked';
  if (fantasyCombatDistance(actor.tile,patient.tile)>1 || !fantasyCombatLineOfSight(state,actor.tile,patient.tile)) return 'range';
  if (state.battlefield.blocked.some(tile=>same(tile,patient.tile!)) || state.battlefield.obstacles?.some(entry=>same(entry.tile,patient.tile!))) return 'blocked';
}
export function pickupFantasyCombatPatient(state: FantasyCombatState, actor: FantasyCombatFighter, target: string): FantasyCombatFighter | undefined {
  if (fantasyCombatCarryOrderError(state,actor,{type:'carry',target})) return;
  const patient = fantasyCombatActors(state).find(f=>f.id===target)!;
  actor.carrying=patient.id; patient.tile={...actor.tile!}; patient.position=actor.position;
  return patient;
}
export function putDownFantasyCombatPatient(state: FantasyCombatState, actor: FantasyCombatFighter, preferred?: FantasyCombatTile): FantasyCombatFighter | undefined {
  if (fantasyCombatCarryOrderError(state,actor,{type:'putDown',...(preferred?{tile:preferred}:{})})) return;
  if (actor.externalCarrying) { delete actor.externalCarrying; return; }
  const patient=fantasyCombatPatient(state,actor)!,tile=fantasyCombatDropTile(state,actor,preferred)!;
  patient.tile={...tile}; patient.position=tile.x>=4?'front':'rear'; delete actor.carrying; return patient;
}
export function syncFantasyCombatPatient(state:FantasyCombatState,actor:FantasyCombatFighter):void{
  const patient=fantasyCombatPatient(state,actor);if(!patient||patient.hp>0||!actor.tile)return;
  patient.tile={...actor.tile};patient.position=actor.position;
}
export function releaseInvalidFantasyCombatCarries(state:FantasyCombatState):void{
  for(const actor of fantasyCombatActors(state)){
    const patient=fantasyCombatPatient(state,actor);
    if(actor.externalCarrying&&(actor.hp<=0||!actor.userId))delete actor.externalCarrying;
    if(!actor.carrying)continue;
    if(!patient||patient.hp>0||actor.hp<=0||patient.fled!==actor.fled||!patientKind(patient)){delete actor.carrying;continue;}
    syncFantasyCombatPatient(state,actor);
  }
}
export function validFantasyCombatCarries(state:FantasyCombatState):boolean{
  const actors=fantasyCombatActors(state),patients=new Set<string>();
  for(const actor of actors){
    if(actor.externalCarrying!==undefined){const e=actor.externalCarrying;if(!e||!actor.userId||actor.hp<=0||actor.carrying||typeof e!=='object'||Array.isArray(e)||Object.keys(e).length!==2||typeof e.user!=='string'||!e.user||e.user.length>200||/[\u0000-\u001f\u007f]/u.test(e.user)||e.user===actor.userId||!Number.isSafeInteger(e.generation)||e.generation<1)return false;}
    if(actor.carrying===undefined)continue;
    const patient=actors.find(f=>f.id===actor.carrying);
    if(!actor.userId||actor.side!=='players'||actor.hp<=0||typeof actor.carrying!=='string'||!patient||patient.id===actor.id||patient.side!==actor.side||patient.hp!==0||patient.fled!==actor.fled||!patientKind(patient)||patient.carrying||patient.externalCarrying||patients.has(patient.id)||!actor.tile||!patient.tile||!same(actor.tile,patient.tile))return false;
    patients.add(patient.id);
  }
  return true;
}
export function fantasyCombatCarryLog(actor:FantasyCombatFighter,patient:FantasyCombatFighter|undefined,putDown=false):FantasyCombatText{
  return putDown?{ko:`${actor.names.ko}: ${patient?.names.ko??'부축하던 동료'} 내려놓음.`,en:`${actor.names.en} puts down ${patient?.names.en??'the carried companion'}.`,ja:`${actor.names.ja}が${patient?.names.ja??'運んでいた仲間'}を降ろした。`}:{ko:`${actor.names.ko}: ${patient!.names.ko} 부축 시작. 이동 거리가 줄어든다.`,en:`${actor.names.en} carries ${patient!.names.en}. Movement is reduced.`,ja:`${actor.names.ja}が${patient!.names.ja}を担いだ。移動距離が短くなる。`};
}
