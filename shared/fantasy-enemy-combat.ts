import type { FantasyCombatFighter, FantasyCombatLog, FantasyCombatSkill, FantasyCombatState, FantasyCombatText } from './fantasy-combat.ts';
import { fantasyCombatEnemy } from './fantasy-combat-catalog.ts';
import { fantasyEnemyAttackById, fantasyEnemyAttackForRound, fantasyEnemyAttacks, fantasyEnemyChargeTiles, type FantasyEnemyAttack, type FantasyEnemyCharge } from './fantasy-enemy-attacks.ts';
import { fantasyCombatAttackTiles } from './fantasy-attack-shapes.ts';
import { fantasyCombatLineOfSight, fantasyCombatMoveRange, fantasyCombatPath, fantasyCombatTileKey, fantasyCombatValidTile, type FantasyCombatTile } from './fantasy-combat-tactics.ts';

const words=(ko:string,en:string,ja:string):FantasyCombatText=>({ko,en,ja});
const alive=(actor:FantasyCombatFighter)=>actor.hp>0&&!actor.fled;
const sameMetadata=(a:unknown,b:unknown):boolean=>{
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 const left=a as Record<string,unknown>,right=b as Record<string,unknown>;
 return [...new Set([...Object.keys(left),...Object.keys(right)])].every(key=>sameMetadata(left[key],right[key]));
};
export const fantasyEnemyBasicAttack=():FantasyEnemyAttack=>({id:'enemy-basic-attack',names:words('기본 타격','Basic strike','基本打撃'),kind:'attack',power:0,mp:0,range:'melee',reach:1,shape:'single',magic:false,damageType:'blunt',visualTier:1,prepare:false,interval:1,damageScale:1,aim:'target'});
export function fantasyEnemyCombatSkills(template:NonNullable<ReturnType<typeof fantasyCombatEnemy>>):FantasyCombatSkill[]{
 return [...fantasyEnemyAttacks(template),fantasyEnemyBasicAttack()].map(({prepare,interval,damageScale,aim,...skill})=>skill);
}
export function validFantasyEnemyCharge(value:unknown,actor:FantasyCombatFighter,state:FantasyCombatState):value is FantasyEnemyCharge{
 if(!value||typeof value!=='object'||Array.isArray(value)||actor.side!=='enemies'||!actor.template||!alive(actor)||state.status!=='active'||!state.battlefield)return false;
 const charge=value as FantasyEnemyCharge;
 if(Object.keys(charge).length!==6||Object.keys(charge).some(key=>!['skill','preparedRound','resolvesRound','origin','target','tiles'].includes(key)))return false;
 const definition=fantasyEnemyAttackById(fantasyCombatEnemy(actor.template)!,charge.skill),skill=actor.skills.find(skill=>skill.id===charge.skill);
 if(!definition?.prepare||!skill||!Number.isSafeInteger(charge.preparedRound)||charge.preparedRound<1||charge.resolvesRound!==charge.preparedRound+1||charge.resolvesRound!==state.round
  ||!fantasyCombatValidTile(state.battlefield,charge.origin)||!fantasyCombatValidTile(state.battlefield,charge.target)||!Array.isArray(charge.tiles)||!charge.tiles.length||charge.tiles.length>80
  ||!charge.tiles.every(tile=>fantasyCombatValidTile(state.battlefield!,tile))||new Set(charge.tiles.map(fantasyCombatTileKey)).size!==charge.tiles.length)return false;
 const {prepare,interval,damageScale,aim,...canonical}=definition;
 if(!sameMetadata(skill,canonical))return false;
 if(definition.aim==='self'&&fantasyCombatTileKey(charge.origin)!==fantasyCombatTileKey(charge.target))return false;
 // 準備後に壁が変わっても記録済みの範囲を広げない。検証では形状の外への偽造だけを拒否する。
 const open={...state,battlefield:{...state.battlefield,blocked:[],cover:[],obstacles:[]}},origin={...actor,tile:charge.origin};
 const shape=new Set(fantasyCombatAttackTiles(open,origin,charge.target,definition).map(fantasyCombatTileKey));
 return charge.tiles.every(tile=>shape.has(fantasyCombatTileKey(tile)));
}
export function fantasyEnemyAttackChoice(state:FantasyCombatState,actor:FantasyCombatFighter,candidates:FantasyCombatFighter[]):{skill:FantasyEnemyAttack;reachable:FantasyCombatFighter[]}|undefined{
 const template=actor.template?fantasyCombatEnemy(actor.template):undefined;
 if(!template||!state.battlefield||!actor.tile||!actor.skills.some(skill=>skill.id.startsWith('enemy-')))return undefined;
 const silence=actor.conditions?.some(condition=>condition.id==='silence');
 const available=[...fantasyEnemyAttacks(template),...actor.skills.filter(skill=>skill.id==='enemy-barricade-shot').map(skill=>({...skill,kind:'attack' as const,prepare:false,interval:1,damageScale:1,aim:'target' as const}))];
 let skill=fantasyEnemyAttackForRound(template,state.round);
 const usable=(candidate:FantasyEnemyAttack)=>candidate.mp<=actor.mp&&!(candidate.magic&&silence);
 if(!usable(skill)){skill=available.find(attack=>!attack.prepare&&usable(attack))??fantasyEnemyBasicAttack();}
 const areaFor=(attack:FantasyEnemyAttack,target:FantasyCombatFighter)=>target.tile?fantasyEnemyChargeTiles(state,actor,attack,target.tile):[];
 const choices=(attack:FantasyEnemyAttack)=>candidates.filter(target=>alive(target)&&target.tile&&areaFor(attack,target).some(tile=>fantasyCombatTileKey(tile)===fantasyCombatTileKey(target.tile!)));
 let reachable=choices(skill);
 if(!reachable.length){
  const alternative=available.find(attack=>!attack.prepare&&usable(attack)&&choices(attack).length);
  if(alternative){skill=alternative;reachable=choices(skill);}
 }
 return {skill,reachable};
}
interface EnemyCallbacks{
 random:()=>number;
 damage:(target:FantasyCombatFighter,power:number,magic:boolean,scale:number,skill:FantasyCombatSkill,area:boolean)=>boolean;
 log:(text:FantasyCombatText,presentation?:NonNullable<FantasyCombatLog['presentation']>)=>void;
 move:(path:FantasyCombatTile[])=>void;
 inflict:(target:FantasyCombatFighter,id:'poison'|'burn'|'frost',power:number)=>void;
 utility:(target:FantasyCombatFighter,skill:FantasyCombatSkill)=>void;
 creditSilence:()=>void;
 creditRoot:()=>void;
}
export function resolveFantasyEnemyAction(state:FantasyCombatState,actor:FantasyCombatFighter,candidates:FantasyCombatFighter[],callbacks:EnemyCallbacks):boolean{
 const template=actor.template?fantasyCombatEnemy(actor.template):undefined;
 if(!template||!state.battlefield||!actor.tile||!actor.skills.some(skill=>skill.id.startsWith('enemy-')))return false;
 const regenerate=()=>{if(template.pattern==='regen'&&alive(actor))actor.hp=Math.min(actor.stats.hp,actor.hp+Math.max(1,Math.floor(actor.stats.hp*.025)));};
 const strike=(skill:FantasyEnemyAttack,tiles:FantasyCombatTile[],origin:FantasyCombatTile,center:FantasyCombatTile,charged:boolean)=>{
  const area=skill.shape!=='single',marked=new Set(tiles.map(fantasyCombatTileKey));
  callbacks.log(words(`${actor.names.ko}의 ${skill.names.ko}!`,`${actor.names.en} uses ${skill.names.en}!`,`${actor.names.ja}の${skill.names.ja}！`),{kind:'attack',actor:actor.id,skill:skill.id,from:{...origin},to:{...center},tiles:tiles.map(tile=>({...tile})),...(skill.visualElement?{element:skill.visualElement}:{})});
  for(const target of candidates.filter(target=>alive(target)&&target.tile&&marked.has(fantasyCombatTileKey(target.tile))&&fantasyCombatLineOfSight(state,origin,target.tile))){
   if(!alive(actor))break;
   const before=target.hp, hit=callbacks.damage(target,skill.power,!!skill.magic,skill.damageScale,skill,charged||area), damagingHit=hit&&target.hp<before;
   if(damagingHit&&alive(target)&&!target.guarding){
    if(skill.onHit&&callbacks.random()<skill.onHit.chance)callbacks.inflict(target,skill.onHit.id,skill.onHit.power);
    if(skill.hitUtility&&callbacks.random()<skill.hitUtility.chance)callbacks.utility(target,{...skill,kind:'hex',utility:skill.hitUtility.id,power:skill.hitUtility.power});
   }
   if(damagingHit&&alive(actor)&&template.pattern==='drain')actor.hp=Math.min(actor.stats.hp,actor.hp+Math.max(1,Math.floor(actor.stats.attack*.2)));
   if(damagingHit&&alive(target)&&template.tier>=5&&['arcane','drain'].includes(template.pattern)&&state.round%3===0){const affliction=template.pattern==='drain'?'soul-binding' as const:state.round%2?'curse' as const:'possession' as const;target.miracles??={};target.miracles.afflictions=[...new Set([...(target.miracles.afflictions??[]),affliction])];callbacks.log(words(`${target.names.ko}에게 강한 영혼의 속박이 남았다.`,`${target.names.en} suffers a profound soul affliction.`,`${target.names.ja}に強い魂の束縛が残った。`));}
  }
  if(skill.effects?.guard&&alive(actor))actor.ward=Math.max(actor.ward,skill.effects.guard);
  regenerate();
 };
 if(actor.enemyCharge){
  const pending=actor.enemyCharge,definition=fantasyEnemyAttackById(template,pending.skill);delete actor.enemyCharge;
  const silence=actor.conditions?.some(condition=>condition.id==='silence');
  if(!definition||fantasyCombatTileKey(actor.tile)!==fantasyCombatTileKey(pending.origin)||definition.magic&&silence){
   if(definition?.magic&&silence)callbacks.creditSilence();
   callbacks.log(words(`${actor.names.ko}의 준비가 흐트러졌다.`,`${actor.names.en}'s prepared attack is interrupted.`,`${actor.names.ja}の準備が崩れた。`));regenerate();return true;
  }
  strike(definition,pending.tiles,pending.origin,pending.target,true);return true;
 }
 const scheduled=fantasyEnemyAttackForRound(template,state.round);
 if(scheduled.magic&&scheduled.mp<=actor.mp&&actor.conditions?.some(condition=>condition.id==='silence'))callbacks.creditSilence();
 const {skill,reachable}=fantasyEnemyAttackChoice(state,actor,candidates)!;
 const areaFor=(attack:FantasyEnemyAttack,target:FantasyCombatFighter)=>target.tile?fantasyEnemyChargeTiles(state,actor,attack,target.tile):[];
 if(!reachable.length){
  if(actor.conditions?.some(condition=>condition.id==='root')){callbacks.creditRoot();return true;}
  const paths=candidates.filter(target=>alive(target)&&target.tile).flatMap(target=>[{x:target.tile!.x-1,y:target.tile!.y},{x:target.tile!.x+1,y:target.tile!.y},{x:target.tile!.x,y:target.tile!.y-1},{x:target.tile!.x,y:target.tile!.y+1}].flatMap(tile=>{const path=fantasyCombatPath(state,actor,tile,true);return path?[path]:[];}));
  const cost=(path:FantasyCombatTile[])=>path.length+path.slice(1).reduce((n,tile)=>n+(state.fields?.some(field=>fantasyCombatTileKey(field.tile)===fantasyCombatTileKey(tile))?8:0),0);
  paths.sort((a,b)=>cost(a)-cost(b));if(paths[0]?.length>1)callbacks.move(paths[0].slice(0,fantasyCombatMoveRange(actor)+1));return true;
 }
 const fronts=reachable.filter(target=>target.position==='front'),pool=skill.range==='melee'&&fronts.length?fronts:reachable;
 const target=state.escort&&state.round%2===0?pool.find(target=>target.id===state.escort!.wagon.id)??pool[Math.floor(callbacks.random()*pool.length)]:pool[Math.floor(callbacks.random()*pool.length)];
 const center=skill.aim==='self'?{...actor.tile}:{...target.tile!},tiles=areaFor(skill,target);actor.mp-=skill.mp;
 if(skill.prepare){
  actor.enemyCharge={skill:skill.id,preparedRound:state.round,resolvesRound:state.round+1,origin:{...actor.tile},target:center,tiles:tiles.map(tile=>({...tile}))};
  callbacks.log(words(`${actor.names.ko}이 ${skill.names.ko}을 준비한다. 다음 턴에 표시된 구역을 공격한다.`,`${actor.names.en} prepares ${skill.names.en}. The marked area will be struck next turn.`,`${actor.names.ja}が${skill.names.ja}を準備する。次のターンに表示範囲を攻撃する。`),{kind:'prepare',actor:actor.id,skill:skill.id,from:{...actor.tile},to:center,tiles:tiles.map(tile=>({...tile})),...(skill.visualElement?{element:skill.visualElement}:{})});regenerate();
 }else strike(skill,tiles,actor.tile,center,false);
 return true;
}
