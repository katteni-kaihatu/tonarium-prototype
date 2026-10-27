import type { NpcPublicProfile } from '../shared/npc.ts';
import type { NpcPortraitDesign } from '../shared/npc-portraits.ts';
import { npcWardrobe } from '../shared/npc-wardrobe.ts';
import { sdBody } from './npc-sd-body.ts';

interface ArtParts {
  ears(race:string,width:number,skin:string,hair:string):string;
  rearHair(d:NpcPortraitDesign,hair:string):string;
  fringe(d:NpcPortraitDesign,hair:string,seed:number):string;
  prop(d:NpcPortraitDesign,trim:string):string;
  palettes:string[][]; skins:string[];
}
const xml=(value:string)=>value.replace(/[&<>"']/g,value=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[value]!));
const hash=(value:string)=>[...value].reduce((sum,char)=>(Math.imul(sum,31)+char.charCodeAt(0))>>>0,5381);

function fitHair(d:NpcPortraitDesign,width:number,hair:string,seed:number,art:ArtParts) {
  const volume=d.hair==='curls'?80:['spikes','feathers','mohawk'].includes(d.hair)?72:64;
  const scale=(width+12)/volume;
  const transform=`translate(170 140) scale(${scale.toFixed(4)} 1.06) translate(-170 -140)`;
  const outer=width+11,left=170-outer,right=170+outer;
  const cap=d.hair==='bald'?'':`<path data-part="hair-cap" d="M${left} 183Q${left-15} 135 ${left+5} 95Q${left+27} 54 170 57Q${right-27} 54 ${right-5} 95Q${right+15} 135 ${right} 183L${right-17} 164Q${right-10} 109 170 99Q${left+10} 109 ${left+17} 164Z" fill="${hair}" stroke="#302a2b55" stroke-width="2.5"/>`;
  const front=d.hair==='bald'
    ? `<path d="M${171-width} 139q-12 12-7 39l10 5 7-41m${2*width-15}-3q12 12 7 39l-10 5-7-41" fill="${hair}" stroke="#302a2b55" stroke-width="2.5"/>`
    : `<g data-part="front-hair" transform="${transform}">${art.fringe(d,hair,seed)}</g>`;
  return {back:`<g data-part="back-hair" transform="${transform}">${art.rearHair(d,hair)}</g>${cap}`,front};
}

export function renderSDPortrait(npc:NpcPublicProfile,d:NpcPortraitDesign,art:ArtParts):string {
  if(npc.id!==d.id||!/^[a-z0-9-]+$/.test(npc.id))throw Error('Portrait identity does not match the character');
  const seed=hash(d.id),[coat,trim,naturalHair]=art.palettes[d.palette%art.palettes.length],wardrobe=npcWardrobe(npc);
  const hair=npc.age>=58?'#bdb8b1':naturalHair;
  const skin=npc.race==='orc'?'#9bbb8c':npc.race==='tideborn'?'#a4c8c1':npc.race==='moonshadow'?'#b7abc9':npc.race==='devilkin'?'#ceaaa9':npc.race==='lizardkin'?'#a0c79a':art.skins[seed%art.skins.length];
  const widths={round:75,square:76,oval:70,angular:72,broad:81,long:69,heart:73};
  const width=widths[d.face]+(npc.race==='dwarf'?4:0),chin=d.face==='long'?231:d.face==='round'?222:227;
  const fittedHair=fitHair(d,width,hair,seed,art);
  const ears=art.ears(npc.race,width,skin,hair);
  const exposedEars=['elf','moonshadow','tideborn','lizardkin'].includes(npc.race);
  const face=`M${170-width} 135Q${168-width} 84 170 82Q${172+width} 84 ${170+width} 135L${166+width} 182Q${161+width} ${chin-5} 170 ${chin}Q${179-width} ${chin-5} ${174-width} 182Z`;
  const eyeY=170+(seed%3-1),gap=d.face==='broad'?32:29;
  const eyes=d.expression==='warm'
    ? `<path d="M${170-gap-9} ${eyeY}q9-13 18 0m${gap*2-18} 0q9-13 18 0" fill="none" stroke="#514641" stroke-width="4" stroke-linecap="round"/>`
    : [170-gap,170+gap].map(x=>`<ellipse cx="${x}" cy="${eyeY}" rx="12" ry="14" fill="#fff8eb"/><ellipse cx="${x}" cy="${eyeY+1}" rx="7.4" ry="10.5" fill="${d.expression==='focused'?'#55665c':'#665447'}"/><circle cx="${x-2}" cy="${eyeY-3}" r="3" fill="#fff"/><path d="M${x-12} ${eyeY-7}q12-9 24 0" fill="none" stroke="#584b44" stroke-width="2.6" stroke-linecap="round"/>`).join('');
  const mouth=d.expression==='stern'?'M159 208q11-5 22 0':d.expression==='curious'?'M164 205q6 10 12 0':d.expression==='wry'?'M158 204q12 11 25-3':'M158 204q12 13 24 0';
  const eyebrows=d.expression==='stern'||d.expression==='focused'?'M130 147l22 6m36 0 22-6':'M131 148q10-5 20 0m38 0q10-5 20 0';
  const horns=npc.race==='devilkin'?'<path d="M119 111Q88 92 105 49q3 30 29 41m88 21q31-19 14-62-3 30-29 41" fill="#af9b8d" stroke="#77655f" stroke-width="3"/>':'';
  const halo=npc.race==='celestial'?'<ellipse cx="170" cy="35" rx="48" ry="9" fill="none" stroke="#e2c97d" stroke-width="5"/>':'';
  let marks='';
  if(d.beard)marks+=`<path d="M118 189q9 14 26 7l26 10 26-10q17 7 26-7l-9 31-24 17-19 7-19-7-24-17Z" fill="${hair}" stroke="#786a5d" stroke-width="2"/>`;
  if(d.glasses)marks+='<g fill="none" stroke="#9e916f" stroke-width="3"><circle cx="141" cy="171" r="21"/><circle cx="199" cy="171" r="21"/><path d="M162 168h16"/></g>';
  if(['orc','vampire-night','vampire-moon','vampire-crimson'].includes(npc.race))marks+='<path d="m154 204 5 10 4-9m13 0 5 9 4-10" fill="#fff9e4"/>';
  if(npc.race==='birdkin')marks+='<path d="m166 185 8 0-4 8Z" fill="#d6b57c"/>';
  if(npc.race==='tideborn'||npc.race==='lizardkin')marks+='<path d="m119 185 7 5-7 6m94-11 7 5-7 6" fill="none" stroke="#668c7f" stroke-width="2"/>';
  if(npc.age>=58)marks+='<path d="m118 181 9 3m86-3-9 3m-57 10-3 5m52-5 3 5" stroke="#8c7662" stroke-width="1.6" opacity=".5"/>';
  if(wardrobe.culture==='rain-hanbok')marks+='<path d="m215 113 30-17" stroke="#b59e74" stroke-width="4"/><circle cx="241" cy="98" r="7" fill="#d6aaa9"/>';
  const wings=npc.race==='celestial'?'<path d="M121 270 79 241l-1 30-22-9 20 51m143-43 42-29 1 30 22-9-20 51" fill="#e3e4d0" stroke="#bec9bf" stroke-width="3"/>':'';
  const heldProp=d.prop==='staff'?`<g transform="rotate(25 243 380)">${art.prop(d,trim)}</g>`:art.prop(d,trim);
  const identity={id:npc.id,age:npc.age,gender:npc.gender,race:npc.race,building:npc.building,design:d,style:'rounded-sd',wardrobe};
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 400" role="img" aria-labelledby="portrait-title"><title id="portrait-title">${xml(npc.name.en)} — ${xml(npc.role.en)}</title><metadata>${xml(JSON.stringify(identity))}</metadata><ellipse cx="170" cy="391" rx="78" ry="6" fill="#496453" opacity=".12"/>${wings}${sdBody(npc,d,coat,trim,skin)}<path data-part="neck" d="M158 217v27q12 12 24 0v-27Z" fill="${skin}"/><g data-part="head" transform="translate(-8.5 -8) scale(1.05)">${fittedHair.back}${horns}${exposedEars?'':ears}<path data-part="face" d="${face}" fill="${skin}" stroke="#87685155" stroke-width="2.8"/><path d="${eyebrows}" fill="none" stroke="${hair}" stroke-width="3.4" stroke-linecap="round"/><g data-part="eyes">${eyes}</g><ellipse cx="130" cy="190" rx="15" ry="8" fill="#dc9291" opacity=".3"/><ellipse cx="210" cy="190" rx="15" ry="8" fill="#dc9291" opacity=".3"/><path d="m170 182-2 6h4" fill="none" stroke="#b27f6d" stroke-width="2" stroke-linecap="round"/><path d="${mouth}" fill="none" stroke="#a57365" stroke-width="2.8" stroke-linecap="round"/>${fittedHair.front}${exposedEars?`<g data-part="exposed-ears">${ears}</g>`:''}${marks}${halo}</g><g data-part="held-prop" transform="translate(64.6 77) scale(.62)">${heldProp}</g><g data-part="hands" fill="${skin}" stroke="#94745d44" stroke-width="2"><ellipse cx="133" cy="313" rx="9" ry="8"/><ellipse cx="207" cy="313" rx="9" ry="8"/></g></svg>\n`;
}
