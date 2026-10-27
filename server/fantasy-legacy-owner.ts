import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { FantasyBackups, fantasyBackupFiles } from './fantasy-backups.ts';
import { FantasyStore } from './fantasy-store.ts';
import { FantasyCommunity } from './fantasy-community.ts';
import { FantasyContracts } from './fantasy-contracts.ts';

export interface FantasyLegacyOwnerMigrationOptions { dataDirectory:string; legacyOwner:string; newOwner:string; apply?:boolean }
export interface FantasyLegacyOwnerMigrationResult { legacyOwner:string; newOwner:string; applied:boolean; files:{key:string;changedReferences:number}[];backupId?:string }
const UUID='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const LEGACY=new RegExp(`^${UUID}(?:-[a-zA-Z0-9_-]{1,72})?(?![\\s\\S])`,'u'),PRINCIPAL=new RegExp(`^fantasy:${UUID}(?![\\s\\S])`,'u');
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const OWNER_FIELDS=new Set(['user','userId','ownerId','owner','actor','donor','leader','orderedBy','wardOwner']);
const OWNER_ARRAYS=new Set(['users','participantIds']);
const OWNER_MAPS=new Set(['profiles','players','claims','orders','consents']);
const TOKEN_MAPS=new Set(['receipts','cooldowns']);
const TEXT_FIELDS=new Set(['name','names','text','description','descriptions','bio','label','message']);

function references(value:unknown,owner:string):boolean {
  if(value===owner)return true;if(Array.isArray(value))return value.some(entry=>references(entry,owner));
  return object(value)&&Object.entries(value).some(([key,entry])=>key===owner||references(entry,owner));
}
function rewrite(value:unknown,legacy:string,replacement:string):{value:unknown;count:number} {
  let count=0;
  const identity=(source:unknown)=>{if(source!==legacy)return source;count++;return replacement;};
  const token=(source:string)=>{
    if(source.startsWith('[')){try{const tuple:unknown=JSON.parse(source);if(Array.isArray(tuple)&&tuple[0]===legacy){tuple[0]=identity(tuple[0]);return JSON.stringify(tuple);}}catch{}}
    return source;
  };
  const walk=(source:unknown,field=''):unknown=>{
    if(TEXT_FIELDS.has(field))return source;
    if(typeof source==='string'){
      if(OWNER_FIELDS.has(field))return identity(source);if(field==='approved')return token(source);
      if(field==='hunts'&&source.startsWith(legacy+':')){count++;return replacement+source.slice(legacy.length);}
      return source;
    }
    if(Array.isArray(source))return source.map(entry=>OWNER_ARRAYS.has(field)?identity(entry):walk(entry,field));
    if(!object(source))return source;
    const result:Record<string,unknown>={};
    for(const[key,entry]of Object.entries(source)){
      const mapped=OWNER_MAPS.has(field)?identity(key) as string:TOKEN_MAPS.has(field)?token(key):key;
      if(Object.hasOwn(result,mapped))throw new Error('Owner migration would collide with an existing reference');
      Object.defineProperty(result,mapped,{value:walk(entry,key),enumerable:true,writable:true,configurable:true});
    }
    return result;
  };
  const transformed=walk(value);
  return{value:transformed,count};
}

function combatIds(world:Record<string,unknown>,legacy:string,replacement:string):number {
  let changes=0;if(!object(world.combats))return 0;
  for(const record of Object.values(world.combats)){
    if(!object(record)||!object(record.state)||!Array.isArray(record.state.fighters))continue;
    const state=record.state,ids=new Map<string,string>();
    for(const fighter of state.fighters as unknown[]){
      if(!object(fighter)||fighter.userId!==legacy||typeof fighter.id!=='string')continue;
      for(const prefix of ['','player:','fighter:','player-','fighter-'])if(fighter.id===prefix+legacy)ids.set(fighter.id,prefix+replacement);
    }
    for(const unit of Array.isArray(state.units)?state.units:[]){
      if(!object(unit)||!object(unit.companion)||unit.companion.ownerId!==legacy||typeof unit.id!=='string')continue;
      for(const[oldId,newId]of ids)if(unit.id.startsWith(oldId+'-unit-'))ids.set(unit.id,newId+unit.id.slice(oldId.length));
    }
    if(!ids.size)continue;
    const rewriteIds=(source:unknown,field=''):unknown=>{
      if(TEXT_FIELDS.has(field))return source;
      if(typeof source==='string'&&['id','target','unit','wardUnit'].includes(field)&&ids.has(source)){changes++;return ids.get(source)!;}
      if(Array.isArray(source))return source.map(entry=>rewriteIds(entry,field));
      if(!object(source))return source;
      const output:Record<string,unknown>={};
      for(const[key,entry]of Object.entries(source)){const mapped=field==='unitOrders'&&ids.has(key)?ids.get(key)!:key;if(mapped!==key)changes++;if(Object.hasOwn(output,mapped))throw new Error('Migrated combat actor IDs collide');Object.defineProperty(output,mapped,{value:rewriteIds(entry,key),enumerable:true,writable:true,configurable:true});}
      return output;
    };
    record.state=rewriteIds(state);
  }
  return changes;
}

function validateBundle(contents:ReadonlyMap<string,string>,files:Readonly<Record<string,string>>):void {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tonarium-owner-schema-'));
  try {
    for(const[key,text]of contents)fs.writeFileSync(path.join(directory,path.basename(files[key])),text,{mode:0o600});
    const errors:unknown[]=[];
    const store=new FantasyStore(path.join(directory,'fantasy.json'),{save:()=>{},combatEnabled:true,onError:error=>errors.push(error)});
    if(store.loadError||errors.length)throw new Error('Migrated world save failed domain validation',{cause:errors[0]});
    if(contents.has('community'))new FantasyCommunity(path.join(directory,'fantasy-community.json'),{save:()=>{},onError:error=>errors.push(error)});
    if(contents.has('contracts'))new FantasyContracts(path.join(directory,'fantasy-contracts.json'),{save:()=>{},lookup:user=>store.profile(user),onError:error=>errors.push(error)});
    if(errors.length)throw new Error('Migrated community or contract save failed domain validation');
  }finally{
    if(path.dirname(directory)!==os.tmpdir()||!path.basename(directory).startsWith('tonarium-owner-schema-'))throw new Error('Invalid schema workspace');
    fs.rmSync(directory,{recursive:true,force:true});
  }
}

export function migrateFantasyLegacyOwner(options:FantasyLegacyOwnerMigrationOptions):FantasyLegacyOwnerMigrationResult {
  if(!path.isAbsolute(options.dataDirectory)||!LEGACY.test(options.legacyOwner)||!PRINCIPAL.test(options.newOwner)||options.legacyOwner===options.newOwner)throw new Error('Expected an absolute data directory, legacy browser UUID and reserved fantasy principal');
  const directory=path.resolve(options.dataDirectory),files=fantasyBackupFiles(directory),backups=new FantasyBackups({dataDirectory:directory,files,required:['world','clock']});
  if(backups.status().runtimeActive)throw new Error('Stop the RPG server before legacy owner migration');
  if(backups.status().recoveryRequired)throw new Error('Recover the interrupted restoration before owner migration');
  const originals=new Map<string,string>(),hashes:Record<string,string|null>={};
  for(const[key,file]of Object.entries(files)){
    try {const stat=fs.lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>128*1024*1024)throw new Error('Invalid migration source file');const bytes=fs.readFileSync(file);originals.set(key,bytes.toString('utf8'));hashes[key]=sha(bytes);}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;hashes[key]=null;}
  }
  const source=originals.get('world');if(!source)throw new Error('The legacy world save does not exist');
  const world:unknown=JSON.parse(source);if(!object(world))throw new Error('Invalid world save');
  const envelope=world.version===2&&object(world.profiles),profiles=envelope?world.profiles as Record<string,unknown>:world;
  if(!Object.hasOwn(profiles,options.legacyOwner))throw new Error('The requested legacy owner has no saved profile');
  if(references(world,options.newOwner)||originals.has('accounts')&&references(JSON.parse(originals.get('accounts')!),options.newOwner))throw new Error('The reserved target principal is already present');
  const normalized=envelope?world:{version:2,profiles:world,combats:{}};
  const actorIdChanges=combatIds(normalized,options.legacyOwner,options.newOwner);
  const changes:FantasyLegacyOwnerMigrationResult['files']=[],next=new Map(originals);
  for(const key of ['world','community','contracts']){
    const raw=key==='world'?normalized:originals.has(key)?JSON.parse(originals.get(key)!):undefined;
    if(raw===undefined)continue;
    const changed=rewrite(raw,options.legacyOwner,options.newOwner);
    if(changed.count||key==='world'&&actorIdChanges){next.set(key,JSON.stringify(changed.value));changes.push({key,changedReferences:changed.count+(key==='world'?actorIdChanges:0)});}
  }
  const updatedWorld=JSON.parse(next.get('world')!) as {profiles:Record<string,unknown>};
  if(Object.hasOwn(updatedWorld.profiles,options.legacyOwner)||!Object.hasOwn(updatedWorld.profiles,options.newOwner))throw new Error('Legacy profile was not migrated');
  validateBundle(next,files);
  const result:FantasyLegacyOwnerMigrationResult={legacyOwner:options.legacyOwner,newOwner:options.newOwner,applied:false,files:changes};
  if(!options.apply)return result;
  const committed=backups.replaceFiles(Object.fromEntries(changes.map(change=>[change.key,next.get(change.key)!])),{reason:'before-owner-migration',expectedCurrentHashes:hashes});
  return{...result,applied:true,backupId:committed.backupId};
}
