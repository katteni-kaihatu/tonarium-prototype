import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NPC_PUBLIC } from '../../../shared/npc.ts';
import { NPC_PORTRAIT_DESIGNS, npcSvgPortraitUrl } from '../../../shared/npc-portraits.ts';
import { renderNpcPortrait } from '../../../scripts/generate-npc-portraits.ts';
import { npcWardrobe } from '../../../shared/npc-wardrobe.ts';
import { FANTASY_LOCATIONS } from '../../../shared/fantasy-data.ts';

const publicRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../public');
const text=(id:string)=>fs.readFileSync(path.join(publicRoot,npcSvgPortraitUrl(id)!), 'utf8');
const geometry=(svg:string)=>[...svg.matchAll(/<(?:path|ellipse|circle|g)\b[^>]*>/g)].map(([tag])=>tag.replace(/(?:fill|fill-opacity|stroke|stroke-opacity|opacity|data-prop)="[^"]*"/g,'')).join('');
const metadata=(svg:string)=>JSON.parse(svg.match(/<metadata>(.*?)<\/metadata>/)![1].replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'));
type Bounds={left:number;top:number;right:number;bottom:number};
function pathHull(d:string):Bounds {
  const tokens=d.match(/[a-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)!;
  const size:Record<string,number>={M:2,L:2,H:1,V:1,Q:4,C:6,S:4,T:2};
  const points:number[][]=[];let x=0,y=0,startX=0,startY=0,command='',index=0;
  while(index<tokens.length){
    if(/^[a-z]$/i.test(tokens[index]))command=tokens[index++];
    const upper=command.toUpperCase(),relative=command!==upper;
    if(upper==='Z'){x=startX;y=startY;command='';continue;}
    const count=size[upper];assert.ok(count,`Supported body geometry command: ${command}`);
    const values=tokens.slice(index,index+count).map(Number);assert.equal(values.length,count);assert.ok(values.every(Number.isFinite));index+=count;
    if(upper==='H'){x=(relative?x:0)+values[0];points.push([x,y]);continue;}
    if(upper==='V'){y=(relative?y:0)+values[0];points.push([x,y]);continue;}
    for(let pair=0;pair<count;pair+=2)points.push([values[pair]+(relative?x:0),values[pair+1]+(relative?y:0)]);
    x=points.at(-1)![0];y=points.at(-1)![1];
    if(upper==='M'){startX=x;startY=y;command=relative?'l':'L';}
  }
  assert.ok(points.length);return {left:Math.min(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),right:Math.max(...points.map(p=>p[0])),bottom:Math.max(...points.map(p=>p[1]))};
}
function pathsHull(fragment:string):Bounds {
  const parts=[...fragment.matchAll(/\bd="([^"]+)"/g)].map(match=>pathHull(match[1]));assert.ok(parts.length);
  return {left:Math.min(...parts.map(p=>p.left)),top:Math.min(...parts.map(p=>p.top)),right:Math.max(...parts.map(p=>p.right)),bottom:Math.max(...parts.map(p=>p.bottom))};
}
const touches=(a:Bounds,b:Bounds,margin=0)=>a.left<=b.right+margin&&a.right+margin>=b.left&&a.top<=b.bottom+margin&&a.bottom+margin>=b.top;

test('every registered NPC owns an independent portrait asset and explicit character design',()=>{
  assert.equal(NPC_PUBLIC.length,137);
  assert.deepEqual(Object.keys(NPC_PORTRAIT_DESIGNS).sort(),NPC_PUBLIC.map(npc=>npc.id).sort());
  const urls=NPC_PUBLIC.map(npc=>npcSvgPortraitUrl(npc.id));assert.equal(new Set(urls).size,NPC_PUBLIC.length);
  for(const npc of NPC_PUBLIC){
    const design=NPC_PORTRAIT_DESIGNS[npc.id],svg=text(npc.id);
    assert.equal(svg,renderNpcPortrait(npc,design),`${npc.id}: regenerate its own asset after a design change`);
    assert.match(svg,/<svg[^>]+viewBox="0 0 340 400"/);
    assert.ok(svg.includes(`data-prop="${design.prop}"`),`${npc.id}: its individual occupation prop is rendered`);
    assert.ok(!/<script\b|<foreignObject\b|href=|url\(https?:/i.test(svg));
  }
});

test('portraits differ in actual shape and pose, beyond recoloring one reusable face',()=>{
  const shapes=NPC_PUBLIC.map(npc=>geometry(text(npc.id)));
  assert.equal(new Set(shapes).size,NPC_PUBLIC.length);
  assert.notEqual(NPC_PORTRAIT_DESIGNS.rin.face,NPC_PORTRAIT_DESIGNS.borin.face);
  assert.notEqual(NPC_PORTRAIT_DESIGNS.rin.hair,NPC_PORTRAIT_DESIGNS.eris.hair);
  assert.equal(NPC_PORTRAIT_DESIGNS.borin.beard,true);
  assert.equal(NPC_PORTRAIT_DESIGNS.eris.glasses,true);
  assert.ok(NPC_PUBLIC.filter(npc=>npc.race==='tideborn').every(npc=>text(npc.id).includes('stroke="#668c7f"')));
  assert.ok(NPC_PUBLIC.filter(npc=>npc.race==='devilkin').every(npc=>text(npc.id).includes('Q88 92 105 49')));
  assert.ok(NPC_PUBLIC.filter(npc=>npc.race==='celestial').every(npc=>text(npc.id).includes('cx="170" cy="35" rx="48"')));
});

test('all SD bodies connect the head, neck, dressed torso, arms, two hands and feet',()=>{
  for(const npc of NPC_PUBLIC){
    const svg=text(npc.id),label=npc.id;
    assert.doesNotMatch(svg,/\b(?:NaN|Infinity|undefined|null)\b/,label);
    const layers=Object.fromEntries([...svg.matchAll(/<g data-layer="([^"]+)">(.*?)<\/g>/g)].map(match=>[match[1],match[2]]));
    for(const layer of ['legs','sleeves','wardrobe','occupation','climate'])assert.ok(Object.hasOwn(layers,layer),`${label}: ${layer} layer`);
    const face=pathHull(svg.match(/<path data-part="face" d="([^"]+)"/)![1]);
    const transformedFace={left:face.left*1.05-8.5,right:face.right*1.05-8.5,top:face.top*1.05-8,bottom:face.bottom*1.05-8};
    const neck=pathHull(svg.match(/<path data-part="neck" d="([^"]+)"/)![1]);
    const torso=pathsHull(layers.wardrobe),legs=pathsHull(layers.legs),arms=pathsHull(layers.sleeves);
    assert.ok(touches(transformedFace,neck),`${label}: head joins the neck`);
    assert.ok(touches(neck,torso),`${label}: neck joins the clothing`);
    assert.ok(touches(torso,arms)&&touches(torso,legs),`${label}: sleeves and legs attach to the dressed body`);
    const hands=svg.match(/<g data-part="hands"[^>]*>(.*?)<\/g>/)![1];
    const ellipses=[...hands.matchAll(/<ellipse cx="([\d.]+)" cy="([\d.]+)" rx="([\d.]+)" ry="([\d.]+)"/g)];
    assert.equal(ellipses.length,2,`${label}: exactly two visible hands`);
    for(const hand of ellipses){const [,cx,cy,rx,ry]=hand.map(Number);assert.ok(touches({left:cx-rx,right:cx+rx,top:cy-ry,bottom:cy+ry},arms,8),`${label}: hand touches its sleeve or arm`);}
    const eye=pathsHull(svg.match(/<g data-part="eyes">(.*?)<\/g>/)![1].replace(/<ellipse cx="([\d.]+)" cy="([\d.]+)"[^>]*>/g,'<path d="M$1 $2l0 0"/>'));
    assert.ok(eye.left>face.left+12&&eye.right<face.right-12&&eye.top>face.top+40&&eye.bottom<face.bottom-30,`${label}: eyes stay within the face`);
    assert.ok(transformedFace.right-transformedFace.left>(torso.right-torso.left)*.8,`${label}: round SD head/body proportions`);
    assert.ok(legs.bottom<=400&&transformedFace.top>=0,`${label}: head and feet stay inside the portrait`);
    for(const attribute of svg.matchAll(/\b(?:d|transform|cx|cy|r|rx|ry|x|y|width|height)="([^"]+)"/g))assert.doesNotMatch(attribute[1],/[^\d\s.,()+eE\-MmLlHhVvCcSsQqTtAaZzrotateanslf]/,`${label}: malformed geometry`);
  }
});

test('regional garments preserve each home culture and match local climate',()=>{
  const cultures={aurelia:'western',noctis:'moon-wrap',sylvara:'rain-hanbok',kazaran:'caravan',islands:'island-linen'} as const;
  const renderedCultures=new Set<string>(),renderedClimates=new Set<string>();
  for(const npc of NPC_PUBLIC){
    const wardrobe=npcWardrobe(npc),svg=text(npc.id),place=FANTASY_LOCATIONS.find(place=>place.id===npc.homeLocation)!;
    assert.ok(place,`${npc.id}: known home`);assert.equal(wardrobe.culture,cultures[place.land]);
    assert.deepEqual(metadata(svg).wardrobe,wardrobe);assert.equal(metadata(svg).style,'rounded-sd');
    assert.ok(svg.includes(`data-culture="${wardrobe.culture}" data-climate="${wardrobe.climate}" data-fabric="${wardrobe.fabric}"`));
    const climateLayer=svg.match(/<g data-layer="climate">(.*?)<\/g>/)![1];
    if(wardrobe.climate==='cold'){assert.equal(wardrobe.fabric,'lined-wool');assert.match(climateLayer,/#e4ddd0/);}
    if(wardrobe.climate==='hot'){assert.equal(wardrobe.fabric,'light-linen');assert.match(svg,/<path d="m106 280 18 35m110-35-18 35"/);}
    if(wardrobe.climate==='humid'){assert.equal(wardrobe.fabric,'rain-weave');assert.ok(climateLayer.length>0);}
    renderedCultures.add(wardrobe.culture);renderedClimates.add(wardrobe.climate);
  }
  assert.equal(renderedCultures.size,5);assert.equal(renderedClimates.size,4);
  assert.equal(npcWardrobe({homeLocation:'mooncity'}).climate,'cold');
  assert.equal(npcWardrobe({homeLocation:'saffron-port'}).climate,'hot');
  assert.equal(npcWardrobe({homeLocation:'missing'}).culture,'western');
});

test('a held staff is angled beside the face without obscuring either eye',()=>{
  for(const npc of NPC_PUBLIC.filter(npc=>NPC_PORTRAIT_DESIGNS[npc.id].prop==='staff')){
    const svg=text(npc.id),rotation=Number(svg.match(/data-part="held-prop".*?<g transform="rotate\(([-\d.]+) 243 380\)"/)![1]);
    const tipX=64.6+.62*(243+202*Math.sin(rotation*Math.PI/180));
    const tipY=77+.62*(380-202*Math.cos(rotation*Math.PI/180));
    for(const eyeX of [141,199])assert.ok(Math.hypot(tipX-(eyeX*1.05-8.5),tipY-(170*1.05-8))>29,`${npc.id}: staff ornament clears the eye`);
    assert.ok(tipX+15<340&&tipY-15>0,`${npc.id}: angled staff remains inside the image`);
  }
});

test('character age, gender and ancestry stay attached to the matching asset without an unrelated fallback face',()=>{
  for(const npc of NPC_PUBLIC){
    const data=metadata(text(npc.id));
    assert.equal(data.id,npc.id);assert.equal(data.age,npc.age);assert.equal(data.gender,npc.gender);assert.equal(data.race,npc.race);assert.equal(data.building,npc.building);
  }
  for(const unknown of ['missing-npc','../rin','rin.svg','constructor','toString'])assert.equal(npcSvgPortraitUrl(unknown),undefined);
  assert.throws(()=>renderNpcPortrait(NPC_PUBLIC[0],NPC_PORTRAIT_DESIGNS.borin),/identity/);
});
