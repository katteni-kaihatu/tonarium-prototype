export interface FantasyCombatSoundInput {
 visual:string; tier:number; event:{kind:string;skill?:string}; missed?:boolean; skill?:{kind:string}; ultimate?:{job:string};
}
export interface FantasyCombatSoundVoice {wave:'sine'|'triangle'|'noise';hz:number;to:number;at:number;duration:number;gain:number}
export function fantasyCombatSoundRecipe(beat:FantasyCombatSoundInput):FantasyCombatSoundVoice[]{
 if(beat.event.kind==='move')return [];
 let hash=0;for(const c of beat.event.skill??beat.visual)hash=(Math.imul(hash,31)+c.charCodeAt(0))>>>0;
 const pitch=.97+(hash%9)*.008,level=.72+Math.max(1,Math.min(6,beat.tier))*.045;
 const tone=(hz:number,to:number,duration:number,at=0,gain=.027,wave:FantasyCombatSoundVoice['wave']='sine'):FantasyCombatSoundVoice=>({wave,hz:hz*pitch,to:to*pitch,duration,at,gain:gain*level});
 if(beat.missed)return [tone(1400,400,.14,0,.018,'noise')];
 if(beat.event.skill==='miracle-last-dawn-awakening')return [tone(660,660,.3),tone(990,990,.38,.1,.018)];
 const support=beat.skill&&['heal','mana','cleanse','blessing','boon','guard','focus'].includes(beat.skill.kind);
 const kind=support?'miracle':beat.visual==='ultimate'?({warrior:'slash',knight:'impact',shieldbearer:'impact',lancer:'thrust',archer:'projectile',ranger:'wind',scout:'wind',rogue:'slash',assassin:'slash',mage:'star',summoner:'star',bard:'miracle'} as Record<string,string>)[beat.ultimate?.job??'']??'impact':beat.visual;
 switch(kind){
 case 'slash':return [tone(1600,600,.16,0,.024,'noise'),tone(350,160,.1,.06,.016,'triangle')];
 case 'thrust':return [tone(1900,500,.14,0,.022,'noise'),tone(680,230,.09,.07,.015,'triangle')];
 case 'projectile':return [tone(1700,650,.16,0,.02,'noise'),tone(420,180,.08,.12,.015,'triangle')];
 case 'impact':case 'earth':return [tone(110,42,.23,0,.04),tone(600,150,.17,.03,.02,'noise')];
 case 'fire':return [tone(900,250,.32,0,.03,'noise'),tone(170,75,.19,.08,.018)];
 case 'frost':return [tone(1600,1250,.21,0,.023),tone(2100,1900,.18,.07,.015)];
 case 'storm':return [tone(2400,700,.09,0,.025,'noise'),tone(2100,500,.1,.09,.02,'noise')];
 case 'poison':return [tone(240,120,.18,0,.028),tone(380,190,.18,.1,.02)];
 case 'alchemy':return [tone(1900,1600,.08,0,.02),tone(320,110,.2,.08,.025),tone(900,400,.14,.13,.014,'noise')];
 case 'water':return [tone(1200,420,.27,0,.021,'noise'),tone(460,160,.21,.05,.02)];
 case 'wind':return [tone(1700,900,.32,0,.026,'noise'),tone(720,500,.16,.08,.012)];
 case 'star':return [tone(784,784,.32),tone(1175,1175,.34,.08,.02),tone(1568,1568,.36,.16,.013)];
 case 'last-dawn':return [tone(392,392,.85,0,.018),tone(587,587,.8,.12,.017),tone(784,784,.9,.25,.016),tone(1175,1175,.65,.42,.012)];
 case 'miracle':{
  const steps:Record<string,number[]>={'miracle-soul-anchor':[523,784],'miracle-sacred-severance':[1175,784],'miracle-return-lantern':[440,660,880],'miracle-divide-calamity':[392,523,784],'miracle-burden-wounds':[659,392],'miracle-unfailing-cup':[587,880,1175],'miracle-rekindle':[523,659,1046]};
  return (steps[beat.event.skill??'']??[660,990]).map((hz,i)=>tone(hz,hz,.35+i*.04,i*.09,.024-i*.004));
 }
 default:return [tone(440,220,.15,0,.02,'triangle')];
 }
}
