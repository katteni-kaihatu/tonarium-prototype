import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NPC_PUBLIC, type NpcPublicProfile } from '../shared/npc.ts';
import { NPC_PORTRAIT_DESIGNS, type NpcPortraitDesign } from '../shared/npc-portraits.ts';
import { renderSDPortrait } from './npc-sd-render.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'client/public/fantasy/npc-portraits');
const xml = (value: string) => value.replace(/[&<>"']/g, value => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[value]!));
const hash = (value: string) => [...value].reduce((sum,char) => ((sum * 31 + char.charCodeAt(0)) >>> 0), 5381);
const palettes = [
  ['#537769','#e7d7b2','#bc8b54'],['#8b5640','#dbc695','#77706b'],['#69638c','#ddd3bb','#343341'],
  ['#85586d','#efcf9d','#513e36'],['#7b834f','#e8d8b3','#71533b'],['#586e86','#b9c3ba','#3f3835'],
  ['#4b776e','#d9d3ac','#c7a66c'],['#926b49','#efddaa','#564537'],['#56646b','#d5c2ab','#3b3541'],
  ['#77614b','#dac2a5','#a79a85'],['#766b87','#e7cda7','#653e33'],['#786b4c','#d9ddbe','#533b2e'],
];
const skins = ['#deb18d','#c79370','#ecc6a1','#bd896a','#d6a483','#a97859','#e3bda5','#b7846c'];
const faceWidths = { round:58,square:60,oval:51,angular:55,broad:67,long:48,heart:54 };
const faceHeights = { round:69,square:72,oval:75,angular:78,broad:66,long:84,heart:74 };

function ears(race: string, width: number, skin: string, accent: string): string {
  const x=170-width, right=170+width;
  if (race==='elf'||race==='moonshadow') return `<g fill="${skin}" stroke="#795e55" stroke-width="2"><path d="M${x+5} 158 ${x-28} 124Q${x-22} 177 ${x+3} 187Z"/><path d="M${right-5} 158 ${right+28} 124Q${right+22} 177 ${right-3} 187Z"/></g>`;
  if (['foxkin','catkin','wolfkin'].includes(race)) {
    const tall=race==='foxkin'?12:race==='wolfkin'?20:0;
    return `<g fill="${accent}" stroke="#4b443f" stroke-width="3"><path d="m110 121-4-${68+tall}q35 8 52 48Z"/><path d="m230 121 4-${68+tall}q-35 8-52 48Z"/></g><g fill="#c89d8c"><path d="m118 100-2-${32+tall} 27 28Z"/><path d="m222 100 2-${32+tall}-27 28Z"/></g>`;
  }
  if (race==='tideborn') return `<g fill="${skin}" stroke="${accent}" stroke-width="3"><path d="M${x+4} 157l-28-9 11 17-16 9 20 7-5 17 21-15Z"/><path d="M${right-4} 157l28-9-11 17 16 9-20 7 5 17-21-15Z"/></g>`;
  if (race==='lizardkin') return `<g fill="${skin}" stroke="#486459" stroke-width="2"><path d="M102 148 79 132l7 28-13 12 31 14Z"/><path d="m238 148 23-16-7 28 13 12-31 14Z"/></g>`;
  return `<g fill="${skin}"><ellipse cx="${x+2}" cy="174" rx="11" ry="20"/><ellipse cx="${right-2}" cy="174" rx="11" ry="20"/></g>`;
}

function rearHair(d: NpcPortraitDesign, hair: string): string {
  const back: Partial<Record<NpcPortraitDesign['hair'],string>> = {
    waves:'M108 126Q72 200 93 287L132 272V158h77l8 118 32 4q25-91-19-160Z',
    braids:'M109 126 96 267q-6 17 14 21 20-5 15-22l9-118m85-22 26 141q5 18-13 21-18-4-16-23l-13-117',
    bob:'M111 121Q79 164 98 229l39 8v-87h68v84l41-12q15-73-18-103Z',
    locks:'M102 119q-22 63-13 139l27 20 11-127h84l10 130 27-22q7-89-17-141Z',
    tail:'M222 112q67 36 31 158l-24-23q33-67-22-98Z',
    bun:'M202 107q36-8 38-35-1-29-32-27-29 6-23 36Z',
  };
  return back[d.hair] ? `<path d="${back[d.hair]}" fill="${hair}" stroke="#332d302a" stroke-width="3"/>` : '';
}

function fringe(d: NpcPortraitDesign, hair: string, seed: number): string {
  const parts: Record<NpcPortraitDesign['hair'],string> = {
    bun:'M111 160Q87 91 140 77q62-32 92 28l3 63-23-47q-60 20-79-11Z',
    braids:'M108 153Q93 99 131 79q45-26 84 5 28 21 19 68l-27-39-37-21-36 22Z',
    crop:'M107 143q-8-68 59-72 70-1 69 70l-22-30-20 7-24-12-25 12-18-5Z',
    waves:'M105 157Q76 100 120 83q31-32 62-11 67-7 55 84l-17-24q-34 4-62-34-17 43-53 59Z',
    bob:'M109 169q-27-87 42-96 78-10 82 88l-19-43-36-14-29 34-14-11Z',
    sweep:'M106 145q2-61 62-70 70-1 70 74l-27-39q-43 26-82 12Z',
    bald:'M110 132q-10 8-6 42l9 3 6-39m108-6q12 10 10 42l-9 3-7-39',
    locks:'M104 153Q84 84 151 73q54-16 81 37l3 43-16-17-5-27-13 33-12-44-17 42-12-41-18 39-7-27-12 45Z',
    tail:'M107 160Q84 95 142 77q64-28 92 46l-9 43-23-54q-44 26-70 2Z',
    mohawk:'M110 144 128 105 136 64l23 13 11-36 15 34 25-6 6 43 17 35-24-23-34-13-38 10Z',
    spikes:'M104 151 101 110l19 1-3-37 27 11 16-27 20 21 29-18-2 30 33 5-13 27 10 31-31-23-23 8-22-20-25 20Z',
    curls:'M108 159q-27-10-17-34-17-20 5-36-3-29 28-28 17-26 42-9 29-14 43 10 30-1 26 28 22 14 5 36 9 25-12 32l-12-34q-23 11-43-4-23 16-43 4Z',
    shaved:'M107 151q-11-59 45-75 64-12 80 42l-54-7-39 25-20 31Z',
    feathers:'M109 154 91 113l26 5-12-38 36 12-2-39 31 26 24-34 7 47 34-6-18 30 29 8-22 36-26-34-29 9-28-16Z',
  };
  let result=`<path d="${parts[d.hair]}" fill="${hair}" stroke="#302a2b55" stroke-width="2.5" stroke-linejoin="round"/>`;
  if(d.hair==='braids')for(const x of [110,230])for(let y=189;y<275;y+=15)result+=`<path d="m${x-7} ${y} 14 8-14 8" fill="none" stroke="#f7e1b245" stroke-width="3"/>`;
  if(d.hair==='locks')for(let x=110;x<232;x+=17)result+=`<path d="M${x} 115q-9 29-6 ${seed%3+17}" fill="none" stroke="#f4d3a32b" stroke-width="4"/>`;
  return result;
}

function prop(d: NpcPortraitDesign, trim: string): string {
  const art: Record<NpcPortraitDesign['prop'],string> = {
    ledger:'<path d="M105 333h91v60h-91Z" fill="#895a3d" stroke="#c6a66b" stroke-width="4"/><path d="M119 337v53m18-36h43m-43 12h29" stroke="#d6c398" stroke-width="3"/>',
    loaf:'<path d="M114 373q-13-45 35-46 55-4 61 46Z" fill="#cba166" stroke="#8d683e" stroke-width="3"/><path d="m137 342 11 20m14-25 11 21m12-19 8 18" stroke="#f2d5a0" stroke-width="5"/>',
    hammer:'<path d="m234 285-24 109" stroke="#846040" stroke-width="13"/><path d="m205 281 14-30 51 18-9 31Z" fill="#a6b0a7" stroke="#495a5c" stroke-width="4"/><path d="m225 260 28 9" stroke="#d6dbcb" stroke-width="5"/>',
    flask:'<path d="M150 319h31v32q38 38 11 47h-51q-28-9 9-47Z" fill="#90b6ad" fill-opacity=".72" stroke="#d4d9bd" stroke-width="3"/><path d="M140 374q26 12 54 0l2 19h-57Z" fill="#74a492"/><path d="M150 313h31v10h-31Z" fill="#8c6a48"/>',
    sword:'<path d="m238 310-23-43-25 103 11 2Z" fill="#bec7bf" stroke="#6d7e7a" stroke-width="3"/><path d="m189 368 43 9m-21-2-6 28" stroke="#bfa36b" stroke-width="9"/>',
    book:'<path d="m104 340 66-9 65 11-5 56-60-10-60 10Z" fill="#e5dbb4" stroke="#9c8560" stroke-width="3"/><path d="M170 334v53m-48-32 30-5m-28 16 27-5m34-10 28 4m-28 7 29 5" stroke="#8e876c" stroke-width="2"/>',
    staff:'<path d="M243 194v207" stroke="#967346" stroke-width="10"/><circle cx="243" cy="178" r="20" fill="#a4beb2" stroke="#c2ad73" stroke-width="7"/><path d="m243 162 7 14-7 17-6-17Z" fill="#e6e0bd"/>',
    rope:'<g fill="none" stroke="#b8a175" stroke-width="8"><ellipse cx="202" cy="353" rx="34" ry="25"/><ellipse cx="202" cy="353" rx="24" ry="17"/><path d="m175 370-16 26m49-18 17 21"/></g>',
    gem:'<path d="m164 328 31 17-11 44h-40l-11-44Z" fill="#6eaca7" stroke="#cdd6bb" stroke-width="3"/><path d="m164 328-10 23 10 38 13-38Z" fill="#b5d3c0"/><path d="M133 345h62m-41 6h23" fill="none" stroke="#466f78" stroke-width="2"/>',
    leaf:'<path d="M162 399q-7-58 29-89" stroke="#72805b" stroke-width="5" fill="none"/><path d="M168 375q-38-3-40-30 37-2 40 30m4-20q-4-35 25-40 5 33-25 40m-10 39q28-37 51-25-13 31-51 25" fill="#8d9f67" stroke="#526d4e" stroke-width="2"/>',
    quill:'<path d="m204 300-53 100" stroke="#b8a475" stroke-width="4"/><path d="m165 371q-18-48 52-80-1 61-52 80Z" fill="#d8dbc5" stroke="#8f9e8c" stroke-width="2"/><path d="m200 317-28 43m18-26-22 5m15 8 8 3" stroke="#8f9e8c" stroke-width="2"/>',
    lantern:'<path d="M143 337q0-24 24-24 24 0 24 24" fill="none" stroke="#b8a16b" stroke-width="5"/><path d="M140 338h54l-6 61h-41Z" fill="#dbc385" stroke="#806b41" stroke-width="5"/><path d="M157 343v51m21-51v51" stroke="#8e794b" stroke-width="4"/><path d="m166 352-5 28 13-5Z" fill="#fff0b5"/>',
    map:'<path d="m106 338 40-9 40 12 38-8-3 64-39 3-38-10-36 8Z" fill="#dbd0a6" stroke="#a39267" stroke-width="3"/><path d="m146 330-2 59m42-48-4 58m-63-29q20-24 37-9 21 24 49-7" fill="none" stroke="#8f9f7c" stroke-width="3"/><path d="m194 365 7 8-9 2" fill="none" stroke="#966c51" stroke-width="3"/>',
    lyre:'<path d="M124 321q-19 40 4 66 31 22 59 0 23-26 5-66l-11 12q15 42-24 46-38-4-24-46Z" fill="#b58b51" stroke="#71593b" stroke-width="3"/><path d="M129 324h58m-44 1v54m13-54v57m13-57v54" stroke="#e5d19b" stroke-width="2"/>',
    orb:'<circle cx="173" cy="351" r="31" fill="#adbad0" fill-opacity=".84" stroke="#c9c9bd" stroke-width="3"/><path d="m173 328 9 16 17 7-17 5-9 19-7-19-20-5 20-7Z" fill="#e7dfb2"/><ellipse cx="173" cy="381" rx="24" ry="7" fill="#8b7652"/>',
    scroll:'<path d="M120 334h87v55h-87Z" fill="#e5d4a2" stroke="#a88d5c" stroke-width="3"/><ellipse cx="119" cy="340" rx="9" ry="12" fill="#d1bd8c"/><ellipse cx="207" cy="383" rx="9" ry="12" fill="#e2d1a0"/><path d="M140 350h48m-48 11h39m-39 11h45" stroke="#a49776" stroke-width="3"/>',
    shears:'<g fill="none" stroke="#9ba7a0" stroke-width="6"><path d="m181 359 30-45m-43 49-13-53"/><circle cx="180" cy="375" r="13"/><circle cx="155" cy="378" r="13"/></g><circle cx="172" cy="359" r="5" fill="#bfa26b"/>',
    basket:'<path d="M120 355q0-37 47-39 48 2 48 39" fill="none" stroke="#a58b5c" stroke-width="7"/><path d="m111 355 13 44h84l15-44Z" fill="#b49c68" stroke="#796a45" stroke-width="3"/><path d="M119 369h96m-90 15h86m-72-27 5 39m19-39v39m20-39-4 39m19-39-7 39" stroke="#ddc894" stroke-width="3"/>',
  };
  return `<g data-prop="${d.prop}">${art[d.prop]}</g>`;
}

export function renderNpcPortrait(npc: NpcPublicProfile, d: NpcPortraitDesign): string {
  return renderSDPortrait(npc,d,{ears,rearHair,fringe,prop,palettes,skins});
}

export function generateNpcPortraits() {
  fs.mkdirSync(OUT,{recursive:true});
  const ids=new Set(NPC_PUBLIC.map(npc=>npc.id));
  if(Object.keys(NPC_PORTRAIT_DESIGNS).length!==ids.size)throw Error('Portrait designs and NPC catalog differ');
  for(const npc of NPC_PUBLIC){
    const design=NPC_PORTRAIT_DESIGNS[npc.id];
    if(!design)throw Error(`No individual portrait design for ${npc.id}`);
    fs.writeFileSync(path.join(OUT,`${npc.id}.svg`),renderNpcPortrait(npc,design));
  }
  return ids.size;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)console.log(`Saved ${generateNpcPortraits()} individual NPC portraits in ${OUT}`);
