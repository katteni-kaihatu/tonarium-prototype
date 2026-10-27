import type { NpcPublicProfile } from '../shared/npc.ts';
import type { NpcPortraitDesign } from '../shared/npc-portraits.ts';
import { npcWardrobe } from '../shared/npc-wardrobe.ts';

export function sdBody(npc: NpcPublicProfile, design: NpcPortraitDesign, coat: string, trim: string, skin: string): string {
  const wardrobe=npcWardrobe(npc), dark='#4e5260', outline='#4b50554a';
  const rounded= `stroke="${outline}" stroke-width="3" stroke-linejoin="round"`;
  const sleeves=wardrobe.climate==='hot'
    ? `<path d="M120 250Q95 250 96 282l27 8 13-28m84-12q25 0 24 32l-27 8-13-28" fill="${coat}" ${rounded}/><path d="m106 280 18 35m110-35-18 35" stroke="${skin}" stroke-width="15" stroke-linecap="round"/>`
    : `<path d="M123 246Q93 244 92 292l25 23 24-47m76-22q30-2 31 46l-25 23-24-47" fill="${coat}" ${rounded}/>`;
  const forearms=wardrobe.climate==='hot'
    ? `<path d="M120 307Q125 315 133 313M220 307Q215 315 207 313" fill="none" stroke="${skin}" stroke-width="15" stroke-linecap="round"/>`
    : `<path d="M111 302Q123 311 133 313M229 302Q217 311 207 313" fill="none" stroke="${skin}" stroke-width="14" stroke-linecap="round"/><path d="m103 297 11 8m123-8-11 8" fill="none" stroke="${wardrobe.climate==='cold'?'#e5dfd2':trim}" stroke-width="${wardrobe.climate==='cold'?12:9}" stroke-linecap="round"/>`;
  let clothes='';
  if(wardrobe.culture==='western') clothes=`<path d="M129 242Q170 228 211 242l16 108q-57 26-114 0Z" fill="${coat}" ${rounded}/><path d="m146 239 24 21 24-21-6 49h-37Z" fill="${trim}"/><path d="M170 260v96m-25-72 50 0" stroke="#dbc796" stroke-width="4"/><path d="M127 330h86" stroke="#755c50" stroke-width="10"/><circle cx="170" cy="330" r="6" fill="#e3cc7a"/>`;
  if(wardrobe.culture==='moon-wrap') clothes=`<path d="M127 241Q170 226 213 241l23 111q-66 25-132 0Z" fill="${coat}" ${rounded}/><path d="m137 240 42 53 29-53-37 68-43-61" fill="${trim}"/><path d="m140 246 34 46 27-44" fill="none" stroke="#d0bb92" stroke-width="5"/><path d="M122 300h96v23h-96Z" fill="${trim}"/><path d="m182 308 17 42-20-9-8 15-3-43" fill="${trim}" stroke="#69646b" stroke-width="2"/>`;
  if(wardrobe.culture==='rain-hanbok') clothes=`<path d="M128 249Q170 236 212 249l29 105q-71 26-142 0Z" fill="${trim}" ${rounded}/><path d="M128 239q42-16 84 0l10 55q-52 15-104 0Z" fill="${coat}" ${rounded}/><path d="m146 237 29 27 20-27-20 38Z" fill="#f5eedb"/><path d="M178 269q21-23 32-9-10 15-32 9m1 0q-7 20-21 17 0-14 21-17m0 0 6 38m-4-38 24 28" fill="none" stroke="#d9a6a0" stroke-width="7" stroke-linecap="round"/>`;
  if(wardrobe.culture==='caravan') clothes=`<path d="M127 241Q170 226 213 241l26 113q-69 20-138 0Z" fill="${trim}" ${rounded}/><path d="m128 241 29 21-14 77-31 17m100-115-29 21 14 77 31 17" fill="${coat}" ${rounded}/><path d="M121 298h98v20h-98Z" fill="${coat}"/><path d="m193 303 10 49-15-12-10 9 2-43" fill="${coat}"/><path d="M145 332h50m-49 10h48" stroke="#d2b37b" stroke-width="4"/>`;
  if(wardrobe.culture==='island-linen') clothes=`<path d="M128 241Q170 228 212 241l17 110q-59 23-118 0Z" fill="${trim}" ${rounded}/><path d="m135 241 35 27 35-27 9 26-44 28-44-28Z" fill="${coat}"/><path d="m169 270-8 48 14-10 9 8-11-45" fill="${coat}"/><path d="M124 337h92" stroke="${coat}" stroke-width="9"/>`;
  const legs=`<path d="M132 347h31v30h-31Zm45 0h31v30h-31Z" fill="${wardrobe.climate==='hot'?'#d2bd9c':dark}"/><path d="M130 371q-17 2-17 15 0 9 25 8l25-1v-23m45 1q17 2 17 15 0 9-25 8l-25-1v-23" fill="#6c5753" ${rounded}/>`;
  let role='';
  if(design.clothes==='apron')role=`<path d="m145 266 25 11 25-11 12 80q-37 15-74 0Z" fill="${trim}" stroke="#b3a58a" stroke-width="3"/><path d="M151 308h38v24h-38Z" fill="${coat}" opacity=".5"/>`;
  if(design.clothes==='armor')role=`<path d="M137 256q33-13 66 0l-4 63-29 17-29-17Z" fill="#b7c3c8" ${rounded}/><path d="m170 252-10 62 10 10 10-10Z" fill="#e3e8db"/><path d="m115 248-24 13 24 19 19-25m91-7 24 13-24 19-19-25" fill="#a9b6bd" ${rounded}/>`;
  if(design.clothes==='priest')role=`<path d="M143 243h12l-7 105h-16Zm54 0h-12l7 105h16Z" fill="#d6bd74"/><circle cx="170" cy="285" r="14" fill="#f3e5af" stroke="#bda25f" stroke-width="3"/><path d="m170 273 5 9 9 3-9 4-5 10-4-10-10-4 10-3Z" fill="#d0b366"/>`;
  if(design.clothes==='scholar'||design.clothes==='robe')role+=`<path d="m130 243 11 55m69-55-11 55" stroke="#d0bb83" stroke-width="4"/><circle cx="199" cy="277" r="5" fill="#d2c284"/>`;
  if(design.clothes==='hood')role+=`<path d="M126 245q44 38 88 0l-17 50-27-16-27 16Z" fill="${coat}" stroke="#dad0b1" stroke-width="3"/>`;
  const climate=wardrobe.climate==='cold'
    ? `<path d="M125 237q45 22 90 0l11 20-28 9-28-15-28 15-28-9Z" fill="#e4ddd0" stroke="#c1b7ad" stroke-width="4"/><path d="m123 270-9 38m103-38 9 38" stroke="#e5dfd2" stroke-width="8" stroke-linecap="round"/><path d="M154 245h32v17h-32Z" fill="${trim}"/>`
    : wardrobe.climate==='hot' ? `<path d="m132 247 11-9m55 9-11-9M119 342l5-23m97 23-5-23" stroke="#fff6dc" stroke-width="4"/>`
      : wardrobe.climate==='humid'?`<path d="M116 239q54-23 108 0l-4 19q-50-17-100 0Z" fill="${coat}" stroke="#e0d4a8" stroke-width="3"/>`:'';
  return `<g data-part="body" data-culture="${wardrobe.culture}" data-climate="${wardrobe.climate}" data-fabric="${wardrobe.fabric}"><g data-layer="legs">${legs}</g><g data-layer="sleeves">${sleeves}</g><g data-layer="wardrobe">${clothes}</g><g data-layer="occupation">${role}</g><g data-layer="climate">${climate}</g><g data-part="forearms">${forearms}</g></g>`;
}
