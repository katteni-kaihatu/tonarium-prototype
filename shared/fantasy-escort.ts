import type { FantasyCharacter } from './fantasy.ts';
import { FANTASY_LOCATIONS, FANTASY_ROUTES } from './fantasy-data.ts';
import { FANTASY_SETTLEMENTS, fantasyBuildings, fantasyFrontierLocations, fantasyKnownLocations } from './fantasy-town.ts';

export const FANTASY_ESCORT_JOBS = Object.freeze(['adventurer','warrior','knight','spearfighter','archer','scout','pugilist','spellblade','shieldbearer','mage','hunter','priest','summoner'] as const);
export const FANTASY_ESCORT_COOLDOWN_HOURS = 12;
export interface FantasyEscortOffer { from: string; destination: string; hours: number; reward: number; path: string[]; available: boolean; reason?: string }
export const fantasyEscortPair = (a: string, b: string) => [a,b].sort().join('~');
const settlement = (id: string) => FANTASY_SETTLEMENTS[id] && FANTASY_SETTLEMENTS[id].kind !== 'tower';
const jobAllowed = (job: string) => FANTASY_ESCORT_JOBS.some(id => id === job);
const guild = (location: string) => fantasyBuildings({location}).some(building => building.id === 'guild');

export function fantasyEscortTerms(from: string, destination: string): Omit<FantasyEscortOffer,'available'|'reason'> | undefined {
  if (from === destination || !settlement(from) || !settlement(destination) || !guild(from)) return undefined;
  const distances = new Map([[from,0]]), paths = new Map([[from,[from]]]);
  const remaining = new Set(FANTASY_LOCATIONS.map(place=>place.id));
  while(remaining.size){
    const current = [...remaining].sort((a,b)=>(distances.get(a)??Infinity)-(distances.get(b)??Infinity))[0];
    const hours=distances.get(current)??Infinity;
    if(hours>12)return undefined;
    if(current===destination){
      const path=paths.get(current)!;
      const danger=Math.max(...FANTASY_LOCATIONS.filter(place=>path.includes(place.id)).map(place=>place.danger));
      return {from,destination,hours:Math.ceil(hours*1.25*4)/4,reward:Math.min(40,Math.max(3,Math.floor(hours*2.5)+danger)),path};
    }
    remaining.delete(current);
    for(const route of FANTASY_ROUTES.filter(route=>route.mode==='land')){
      const next=route.from===current?route.to:route.to===current?route.from:undefined;
      if(!next||!remaining.has(next)||hours+route.hours>=(distances.get(next)??Infinity))continue;
      distances.set(next,hours+route.hours);paths.set(next,[...paths.get(current)!,next]);
    }
  }
  return undefined;
}
export function fantasyEscortEligibilityError(character: FantasyCharacter): string | undefined {
  if (!jobAllowed(character.job)) return '護衛依頼は戦闘職で受注してください。';
  if (!guild(character.location)) return '出発地のギルドで護衛依頼を受けてください。';
  return undefined;
}
export function fantasyEscortOffers(character: FantasyCharacter): FantasyEscortOffer[] {
  if (fantasyEscortEligibilityError(character)) return [];
  const visible = new Set([...fantasyKnownLocations(character),...fantasyFrontierLocations(character)]);
  return FANTASY_LOCATIONS.filter(place => visible.has(place.id)).flatMap(place => {
    const offer = fantasyEscortTerms(character.location,place.id);
    if (!offer || offer.path.some(id=>!visible.has(id))) return [];
    const at = character.escortHistory?.[fantasyEscortPair(offer.from,offer.destination)];
    const reason = character.escort ? '受注済みの護衛を完了するか辞退してください。' : at !== undefined && character.hour < at+FANTASY_ESCORT_COOLDOWN_HOURS ? 'この区間の次の護衛便はまだ準備中です。' : undefined;
    return [{...offer,available:!reason,...(reason?{reason}:{})}];
  });
}
export function fantasyEscortAcceptError(character: FantasyCharacter, destination: string): string | undefined {
  return fantasyEscortEligibilityError(character) ?? (fantasyEscortOffers(character).find(offer=>offer.destination===destination)?.available ? undefined : '今はその行き先の護衛依頼を受注できません。');
}
export function fantasyEscortAccept(character: FantasyCharacter, destination: string): boolean {
  const offer=fantasyEscortOffers(character).find(offer=>offer.destination===destination&&offer.available);
  if(!offer)return false;
  character.escort={id:`escort-${offer.from}-${destination}-${Math.floor(character.hour*4)}`,from:offer.from,destination,hours:offer.hours,reward:offer.reward,acceptedAt:character.hour,...(character.combatStoryVersion===1?{defense:'pending' as const}:{})};
  return true;
}
export function fantasyEscortTransportError(character: FantasyCharacter, destination: string): string | undefined {
  const contract=character.escort;
  if(!contract)return '先に出発地のギルドで護衛依頼を受注してください。';
  if(!jobAllowed(character.job))return '護衛を続けるには戦闘職が必要です。';
  if(!validFantasyEscort(character))return '護衛依頼の記録を確認できません。';
  if(contract.defense==='pending')return '先に護衛隊を守り、出発路を確保してください。';
  if(contract.from!==character.location||contract.destination!==destination)return '受注した出発地と目的地の区間で護衛してください。';
  return undefined;
}
export function fantasyEscortComplete(character: FantasyCharacter, from: string, destination: string): number {
  const contract=character.escort;
  if(!contract||contract.defense==='pending'||contract.from!==from||contract.destination!==destination||character.location!==destination)return 0;
  const offer=fantasyEscortTerms(from,destination);
  if(!offer||offer.reward!==contract.reward||offer.hours!==contract.hours)return 0;
  character.gold+=offer.reward;
  character.escortHistory??={};character.escortHistory[fantasyEscortPair(from,destination)]=character.hour;
  delete character.escort;
  return offer.reward;
}
export function validFantasyEscort(character: Pick<FantasyCharacter,'escort'|'escortHistory'|'hour'|'lifeStartedAt'>): boolean {
  const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const hour=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=(character.lifeStartedAt??0)&&value<=character.hour;
  if(character.escortHistory!==undefined&&(!object(character.escortHistory)||Object.entries(character.escortHistory).some(([key,value])=>{
    const [from,to,...extra]=key.split('~');
    return !!extra.length||!from||!to||key!==fantasyEscortPair(from,to)||!hour(value)||!(fantasyEscortTerms(from,to)||fantasyEscortTerms(to,from));
  })))return false;
  if(character.escort===undefined)return true;
  const c=character.escort;
  if(!object(c)||![6,7].includes(Object.keys(c).length)||!Object.keys(c).every(key=>['id','from','destination','hours','reward','acceptedAt','defense'].includes(key))||typeof c.from!=='string'||typeof c.destination!=='string'||!hour(c.acceptedAt)||c.defense!==undefined&&!['pending','cleared'].includes(String(c.defense)))return false;
  const offer=fantasyEscortTerms(c.from,c.destination);
  const prior=character.escortHistory?.[fantasyEscortPair(c.from,c.destination)];
  return !!offer&&c.id===`escort-${c.from}-${c.destination}-${Math.floor(c.acceptedAt*4)}`&&c.hours===offer.hours&&c.reward===offer.reward&&(prior===undefined||c.acceptedAt>=prior+FANTASY_ESCORT_COOLDOWN_HOURS);
}
