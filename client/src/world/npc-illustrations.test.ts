import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NPC_PUBLIC } from '../../../shared/npc.ts';
import { NPC_ILLUSTRATION_IDS, NPC_PORTRAIT_ILLUSTRATIONS, npcIllustrationUrl } from '../../../shared/npc-portrait-illustrations.ts';

const publicRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../public');
const illustrationRoot=path.join(publicRoot,'fantasy/npc-illustrations');
const files=()=>fs.existsSync(illustrationRoot)?fs.readdirSync(illustrationRoot).filter(file=>file.endsWith('.webp')):[];

function webpInfo(buffer:Buffer){
  assert.equal(buffer.toString('ascii',0,4),'RIFF');assert.equal(buffer.toString('ascii',8,12),'WEBP');assert.equal(buffer.readUInt32LE(4)+8,buffer.length);
  let width=0,height=0,alpha=false;
  for(let offset=12;offset+8<=buffer.length;){
    const type=buffer.toString('ascii',offset,offset+4),size=buffer.readUInt32LE(offset+4),start=offset+8;
    assert.ok(start+size<=buffer.length,'Image chunk is complete');
    if(type==='VP8X'){assert.ok(size>=10);width=1+buffer.readUIntLE(start+4,3);height=1+buffer.readUIntLE(start+7,3);alpha=!!(buffer[start]&0x10);}
    if(type==='ALPH')alpha=true;
    offset=start+size+(size%2);
  }
  return {width,height,alpha};
}

test('every public NPC has a registered individual raster portrait without SVG fallback',()=>{
  const ids:string[]=[...NPC_ILLUSTRATION_IDS].sort();
  assert.deepEqual(ids,NPC_PUBLIC.map(npc=>npc.id).sort());assert.deepEqual(Object.keys(NPC_PORTRAIT_ILLUSTRATIONS).sort(),ids);
  assert.equal(new Set(Object.values(NPC_PORTRAIT_ILLUSTRATIONS)).size,ids.length);
  assert.deepEqual(files().map(file=>file.slice(0,-5)).sort(),ids);
  for(const id of ids){assert.equal(NPC_PORTRAIT_ILLUSTRATIONS[id],`/fantasy/npc-illustrations/${id}.webp`);assert.ok(fs.existsSync(path.join(publicRoot,npcIllustrationUrl(id)!)));}
  for(const unknown of ['missing-npc','../rin','rin.webp','constructor','toString']){assert.equal(npcIllustrationUrl(unknown),undefined);}
});

test('illustrations are independent transparent upper-body portraits',()=>{
  const fingerprints=new Set<string>();
  for(const file of files()){
    const id=file.slice(0,-5);assert.ok(Object.hasOwn(NPC_PORTRAIT_ILLUSTRATIONS,id),`${file}: registered identity`);
    const bytes=fs.readFileSync(path.join(illustrationRoot,file)),info=webpInfo(bytes);
    assert.ok(info.width>=500&&info.height>=700,`${id}: sufficient image dimensions`);assert.ok(info.alpha,`${id}: transparent image channel`);
    const hash=crypto.createHash('sha256').update(bytes).digest('hex');assert.ok(!fingerprints.has(hash),`${id}: do not reuse another NPC's image`);fingerprints.add(hash);
  }
});
