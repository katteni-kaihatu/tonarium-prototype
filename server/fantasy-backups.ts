import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export interface FantasyBackupOptions {
  dataDirectory: string;
  files: Readonly<Record<string,string>>;
  required?: readonly string[];
  now?: () => number;
  intervalMs?: number;
  retainRecent?: number;
  retainDaily?: number;
  validate?: Readonly<Record<string,(value:unknown)=>boolean>>;
}
interface BackupFile { name:string; sha256:string; bytes:number; validJson:boolean }
export interface FantasyBackupManifest {
  version:1; id:string; createdAt:number; reason:string; files:Record<string,BackupFile|null>;
}
export interface FantasyBackupSummary { id:string; createdAt:number; reason:string; bytes:number; verified:boolean; restorable:boolean; error?:string }
export interface FantasyRestorePlan {
  id:string; createdAt:number; reason:string; changes:{key:string; target:string; currentHash:string|null; restoredHash:string}[];
}
interface Lease { version:1; pid:number; nonce:string; at:number }
interface RestoreJournal { version:1; snapshot:string; rollback:string; keys:string[] }
const MAX_FILE_BYTES=128*1024*1024,MAX_TOTAL_BYTES=256*1024*1024;
const ID=/^\d{17}-[a-f0-9-]{36}$/u,KEY=/^[a-z][a-z0-9-]{0,31}$/u;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const hash=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
const missing=(error:unknown)=>(error as NodeJS.ErrnoException).code==='ENOENT';
const inside=(root:string,target:string)=>{const relative=path.relative(root,target);return !!relative&&!relative.startsWith('..')&&!path.isAbsolute(relative);};
function noLink(target:string):void {
  try { if(fs.lstatSync(target).isSymbolicLink())throw new Error(`Backup path cannot be a symbolic link: ${target}`); }
  catch(error){if(!missing(error))throw error;}
}
function readBytes(file:string):Buffer|null {
  noLink(file);
  try {const stat=fs.statSync(file);if(!stat.isFile()||stat.size>MAX_FILE_BYTES)throw new Error('Invalid backup file size/type');return fs.readFileSync(file);}
  catch(error){if(missing(error))return null;throw error;}
}
function jsonObject(bytes:Buffer):unknown {
  const value:unknown=JSON.parse(bytes.toString('utf8'));
  if(!object(value))throw new Error('Expected a JSON object');
  return value;
}
function atomic(file:string,bytes:Uint8Array):void {
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});noLink(path.dirname(file));noLink(file);
  const temporary=`${file}.${randomUUID()}.tmp`;
  try {
    const fd=fs.openSync(temporary,'wx',0o600);
    try {fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(temporary,file);
  }finally{try{fs.unlinkSync(temporary);}catch(error){if(!missing(error))throw error;}}
}
function living(pid:number):boolean {try{process.kill(pid,0);return true;}catch(error){return (error as NodeJS.ErrnoException).code!=='ESRCH';}}

export class FantasyBackups {
  readonly directory:string;
  private root:string;
  private files:Map<string,string>;
  private now:()=>number;
  private lastAt=-Infinity;
  private lastFingerprint='';
  private lease?:Lease;
  constructor(private options:FantasyBackupOptions) {
    this.root=path.resolve(options.dataDirectory);noLink(this.root);
    this.directory=path.join(this.root,'fantasy-backups');noLink(this.directory);
    this.files=new Map(Object.entries(options.files).map(([key,file])=>{
      const target=path.resolve(file);
      if(!KEY.test(key)||['constructor','prototype'].includes(key)||path.dirname(target)!==this.root)throw new Error('Backup targets must be named files directly inside the data directory');
      noLink(target);return[key,target];
    }));
    if(!this.files.size||new Set(this.files.values()).size!==this.files.size||(options.required??[]).some(key=>!this.files.has(key)))throw new Error('Invalid backup file configuration');
    this.now=options.now??Date.now;
    for(const value of [options.intervalMs??300_000,options.retainRecent??24,options.retainDaily??14])if(!Number.isSafeInteger(value)||value<1)throw new Error('Invalid backup retention/interval');
  }
  private file(name:string):string {const target=path.join(this.directory,name);if(!inside(this.directory,target))throw new Error('Invalid backup path');noLink(target);return target;}
  private ensure():void {noLink(this.root);noLink(this.directory);fs.mkdirSync(this.directory,{recursive:true,mode:0o700});}
  private readLease(name:string):Lease|undefined {
    const bytes=readBytes(this.file(name));if(!bytes)return undefined;
    const value=JSON.parse(bytes.toString('utf8')) as Partial<Lease>;
    if(value.version!==1||typeof value.pid!=='number'||!Number.isSafeInteger(value.pid)||value.pid<1||typeof value.nonce!=='string'||typeof value.at!=='number')throw new Error(`Invalid backup lock at ${this.file(name)}; administrator intervention is required. Follow docs/fantasy-backups.md and do not remove restore-pending.json.`);
    return value as Lease;
  }
  private clearStale(name:string):void {
    const lease=this.readLease(name);if(!lease)return;
    if(living(lease.pid))throw new Error((name==='runtime.lock'?'The RPG server is running or its saved PID was reused':'Another backup restoration is running or its saved PID was reused')+`; lock: ${this.file(name)}. Stop all writers to this data directory and follow docs/fantasy-backups.md before quarantining the lock. Never remove restore-pending.json.`);
    fs.unlinkSync(this.file(name));
  }
  private lock(name:string):Lease {
    this.ensure();this.clearStale(name);
    const lease:Lease={version:1,pid:process.pid,nonce:randomUUID(),at:this.now()};
    fs.writeFileSync(this.file(name),JSON.stringify(lease),{flag:'wx',mode:0o600});return lease;
  }
  private unlock(name:string,lease:Lease):void {const current=this.readLease(name);if(current?.nonce===lease.nonce)fs.unlinkSync(this.file(name));}
  acquireRuntime():void {
    if(this.lease)return;
    if(readBytes(this.file('restore-pending.json')))throw new Error('An interrupted restoration needs administrator recovery');
    this.clearStale('restore.lock');
    const lease=this.lock('runtime.lock');
    try {this.clearStale('restore.lock');if(readBytes(this.file('restore-pending.json')))throw new Error('Restoration recovery is pending');this.lease=lease;}
    catch(error){this.unlock('runtime.lock',lease);throw error;}
  }
  releaseRuntime():void {if(this.lease){this.unlock('runtime.lock',this.lease);this.lease=undefined;}}
  private capture(reason:string,force:boolean,allowInvalid=false):FantasyBackupManifest|undefined {
    if(!/^[a-z][a-z0-9-]{0,47}$/u.test(reason))throw new Error('Invalid backup reason');
    this.ensure();
    const runtime=this.readLease('runtime.lock');
    if(runtime&&living(runtime.pid)&&runtime.nonce!==this.lease?.nonce)throw new Error('Only the running RPG server may create its live backup');
    if(!allowInvalid&&readBytes(this.file('restore-pending.json')))throw new Error('Restoration recovery is pending');
    const now=this.now();if(!force&&now-this.lastAt<(this.options.intervalMs??300_000))return undefined;
    const payload=new Map<string,Buffer|null>(),entries:Record<string,BackupFile|null>={};let total=0;
    for(const[key,file]of this.files){
      const bytes=readBytes(file);payload.set(key,bytes);
      if(!bytes){entries[key]=null;continue;}
      let validJson=true;try {const value=jsonObject(bytes);if(this.options.validate?.[key]&&!this.options.validate[key](value))throw new Error('Save schema rejected');}catch(error){validJson=false;if(!allowInvalid)throw new Error(`Cannot back up invalid save ${key}`,{cause:error});}
      total+=bytes.length;if(total>MAX_TOTAL_BYTES)throw new Error('Backup exceeds maximum total size');
      entries[key]={name:`${key}.json`,sha256:hash(bytes),bytes:bytes.length,validJson};
    }
    if(!total&&!allowInvalid)return undefined;
    const fingerprint=hash(Buffer.from(JSON.stringify(entries)));
    if(!force&&fingerprint===this.lastFingerprint){this.lastAt=now;return undefined;}
    const id=new Date(now).toISOString().replace(/[-:TZ.]/gu,'')+'-'+randomUUID();
    const manifest:FantasyBackupManifest={version:1,id,createdAt:now,reason,files:entries};
    const temporary=this.file('.pending-'+randomUUID());fs.mkdirSync(temporary,{mode:0o700});
    try {
      for(const[key,bytes]of payload)if(bytes)atomic(path.join(temporary,`${key}.json`),bytes);
      atomic(path.join(temporary,'manifest.json'),Buffer.from(JSON.stringify(manifest)));
      fs.renameSync(temporary,this.file(id));
    }finally{if(fs.existsSync(temporary)){if(!inside(this.directory,temporary)||!path.basename(temporary).startsWith('.pending-'))throw new Error('Invalid temporary directory');noLink(temporary);fs.rmSync(temporary,{recursive:true});}}
    this.lastAt=now;this.lastFingerprint=fingerprint;this.prune();return manifest;
  }
  checkpoint(reason='periodic',force=false):FantasyBackupManifest|undefined {return this.capture(reason,force);}
  write(file:string,text:string,write?:(file:string,text:string)=>void):void {
    const target=path.resolve(file),key=[...this.files].find(([,value])=>value===target)?.[0];
    if(!key)throw new Error('Unregistered RPG backup save target');
    const value=jsonObject(Buffer.from(text));
    if(this.options.validate?.[key]&&!this.options.validate[key](value))throw new Error('Incoming save schema rejected');
    this.checkpoint('before-write');(write??((name,data)=>atomic(name,Buffer.from(data))))(target,text);
  }
  private manifest(id:string):FantasyBackupManifest {
    if(!ID.test(id))throw new Error('Invalid snapshot id');const folder=this.file(id);noLink(folder);
    const raw=readBytes(path.join(folder,'manifest.json'));if(!raw)throw new Error('Snapshot manifest is missing');
    const value=jsonObject(raw) as unknown as FantasyBackupManifest;
    if(value.version!==1||value.id!==id||!Number.isSafeInteger(value.createdAt)||value.createdAt<0||typeof value.reason!=='string'||!/^[a-z][a-z0-9-]{0,47}$/u.test(value.reason)||!object(value.files)||Object.keys(value.files).sort().join()!==[...this.files.keys()].sort().join())throw new Error('Snapshot manifest does not match this world');
    for(const[key]of this.files){const entry=value.files[key];if(entry!==null&&(!object(entry)||entry.name!==`${key}.json`||typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/u.test(entry.sha256)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||entry.bytes>MAX_FILE_BYTES||typeof entry.validJson!=='boolean'))throw new Error('Invalid snapshot entry');}
    return value;
  }
  private load(id:string,allowInvalid=false):{manifest:FantasyBackupManifest;payload:Map<string,Buffer|null>} {
    const value=this.manifest(id),folder=this.file(id);
    let total=0;const payload=new Map<string,Buffer|null>();
    for(const[key]of this.files){
      const entry=value.files[key];if(entry===null){payload.set(key,null);continue;}
      if(!object(entry)||entry.name!==`${key}.json`||typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/u.test(entry.sha256)||!Number.isSafeInteger(entry.bytes)||typeof entry.validJson!=='boolean')throw new Error('Invalid snapshot entry');
      const bytes=readBytes(path.join(folder,entry.name));if(!bytes||bytes.length!==entry.bytes||hash(bytes)!==entry.sha256)throw new Error('Snapshot checksum mismatch');
      total+=bytes.length;if(total>MAX_TOTAL_BYTES)throw new Error('Snapshot exceeds maximum total size');
      if(!allowInvalid){if(!entry.validJson)throw new Error('Snapshot contains a quarantined invalid save');const parsed=jsonObject(bytes);if(this.options.validate?.[key]&&!this.options.validate[key](parsed))throw new Error('Snapshot schema rejected');}
      payload.set(key,bytes);
    }
    return{manifest:value,payload};
  }
  private restorePayload(id:string):ReturnType<FantasyBackups['load']> {
    const loaded=this.load(id),accounts=loaded.payload.get('accounts');
    if(accounts){
      const ledger=jsonObject(accounts) as Record<string,unknown>;
      if(ledger.version!==1||!Array.isArray(ledger.accounts)||!Array.isArray(ledger.sessions)||!Array.isArray(ledger.claims))throw new Error('Unsupported account backup schema; administrator migration is required');
      loaded.payload.set('accounts',Buffer.from(JSON.stringify({...ledger,sessions:[],claims:[]})));
    }
    return loaded;
  }
  list():FantasyBackupSummary[] {
    noLink(this.directory);if(!fs.existsSync(this.directory))return[];
    return fs.readdirSync(this.directory).filter(id=>ID.test(id)).map(id=>{
      try {const {manifest,payload}=this.load(id,true);let error:string|undefined;try{this.restorePayload(id);}catch(cause){error=(cause as Error).message;}
        const restorable=!error&&(this.options.required??[]).every(key=>!!payload.get(key));return{id,createdAt:manifest.createdAt,reason:manifest.reason,bytes:[...payload.values()].reduce((n,value)=>n+(value?.length??0),0),verified:true,restorable,...(error?{error}:{})};}
      catch(error){return{id,createdAt:0,reason:'unverified',bytes:0,verified:false,restorable:false,error:(error as Error).message};}
    }).sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id));
  }
  private prune():void {
    const snapshots=fs.readdirSync(this.directory).filter(id=>ID.test(id)).flatMap(id=>{try{return[this.manifest(id)];}catch{return[];}}).sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id));
    const keep=new Set(snapshots.slice(0,this.options.retainRecent??24).map(entry=>entry.id)),days=new Set<string>();
    for(const entry of snapshots){const day=new Date(entry.createdAt).toISOString().slice(0,10);if(!days.has(day)&&days.size<(this.options.retainDaily??14)){days.add(day);keep.add(entry.id);}}
    for(const entry of snapshots)if(!keep.has(entry.id)){const target=this.file(entry.id);if(!inside(this.directory,target)||!ID.test(path.basename(target)))throw new Error('Invalid retention target');noLink(target);
      const expected=new Set(['manifest.json',...[...this.files.keys()].map(key=>`${key}.json`)]);
      if(fs.readdirSync(target,{withFileTypes:true}).some(child=>!expected.has(child.name)||!child.isFile()||child.isSymbolicLink()))continue;
      fs.rmSync(target,{recursive:true});}
  }
  previewRestore(id:string):FantasyRestorePlan {
    const {manifest,payload}=this.restorePayload(id);
    for(const key of this.options.required??[])if(!payload.get(key))throw new Error(`Required save ${key} is missing from the snapshot`);
    const changes=[];
    for(const[key,file]of this.files){const current=readBytes(file),restored=payload.get(key);if(!restored){if(current)throw new Error(`Snapshot lacks existing save ${key}; refusing to remove it`);continue;}changes.push({key,target:file,currentHash:current?hash(current):null,restoredHash:hash(restored)});}
    return{id,createdAt:manifest.createdAt,reason:manifest.reason,changes};
  }
  restore(id:string,options:{apply:true;expectedCurrentHashes?:Readonly<Record<string,string|null>>}):FantasyRestorePlan {
    if(options.apply!==true)throw new Error('Explicit apply is required');
    const lock=this.lock('restore.lock');
    try {
      this.clearStale('runtime.lock');if(readBytes(this.file('restore-pending.json')))throw new Error('An earlier restoration needs recovery');
      const plan=this.previewRestore(id),{payload}=this.restorePayload(id);
      for(const entry of plan.changes)if(options.expectedCurrentHashes&&options.expectedCurrentHashes[entry.key]!==entry.currentHash)throw new Error('Current save changed since restore preview');
      const rollback=this.capture('before-restore',true,true);if(!rollback)throw new Error('Cannot preserve current state before restoration');
      const journal:RestoreJournal={version:1,snapshot:id,rollback:rollback.id,keys:plan.changes.map(entry=>entry.key)};
      atomic(this.file('restore-pending.json'),Buffer.from(JSON.stringify(journal)));
      try {
        for(const entry of plan.changes){const current=readBytes(entry.target);if((current?hash(current):null)!==entry.currentHash)throw new Error('Save changed during restoration');atomic(entry.target,payload.get(entry.key)!);}
        fs.unlinkSync(this.file('restore-pending.json'));return plan;
      }catch(error){this.rollback(journal);throw new Error('Restoration failed; the previous files were restored',{cause:error});}
    }finally{this.unlock('restore.lock',lock);}
  }
  replaceFiles(replacements:Readonly<Record<string,string>>,options:{reason:string;expectedCurrentHashes:Readonly<Record<string,string|null>>}):{backupId:string} {
    const keys=Object.keys(replacements);if(!keys.length||keys.some(key=>!this.files.has(key)))throw new Error('Invalid replacement keys');
    for(const key of keys){const parsed=jsonObject(Buffer.from(replacements[key]));if(this.options.validate?.[key]&&!this.options.validate[key](parsed))throw new Error('Replacement schema rejected');}
    const lock=this.lock('restore.lock');
    try {
      this.clearStale('runtime.lock');if(readBytes(this.file('restore-pending.json')))throw new Error('An earlier restoration needs recovery');
      for(const[key,target]of this.files){const bytes=readBytes(target);if((bytes?hash(bytes):null)!==options.expectedCurrentHashes[key])throw new Error('Current save changed since migration preview');}
      const rollback=this.capture(options.reason,true);if(!rollback)throw new Error('Cannot preserve current state before migration');
      const journal:RestoreJournal={version:1,snapshot:rollback.id,rollback:rollback.id,keys};
      atomic(this.file('restore-pending.json'),Buffer.from(JSON.stringify(journal)));
      try {for(const key of keys)atomic(this.files.get(key)!,Buffer.from(replacements[key]));fs.unlinkSync(this.file('restore-pending.json'));return{backupId:rollback.id};}
      catch(error){this.rollback(journal);throw new Error('Migration failed; the previous files were restored',{cause:error});}
    }finally{this.unlock('restore.lock',lock);}
  }
  private rollback(journal:RestoreJournal):void {
    const {payload}=this.load(journal.rollback,true);
    for(const key of journal.keys){const target=this.files.get(key);if(!target)throw new Error('Invalid recovery key');const bytes=payload.get(key);if(bytes)atomic(target,bytes);else{noLink(target);try{fs.unlinkSync(target);}catch(error){if(!missing(error))throw error;}}}
    fs.unlinkSync(this.file('restore-pending.json'));
  }
  recoverInterruptedRestore(options:{apply:true}):boolean {
    if(options.apply!==true)throw new Error('Explicit apply is required');const lock=this.lock('restore.lock');
    try {this.clearStale('runtime.lock');const bytes=readBytes(this.file('restore-pending.json'));if(!bytes)return false;
      const journal=JSON.parse(bytes.toString('utf8')) as RestoreJournal;
      if(journal.version!==1||!ID.test(journal.snapshot)||!ID.test(journal.rollback)||!Array.isArray(journal.keys)||!journal.keys.every(key=>this.files.has(key)))throw new Error('Invalid restoration recovery journal');
      this.rollback(journal);return true;
    }finally{this.unlock('restore.lock',lock);}
  }
  status():{runtimeActive:boolean;recoveryRequired:boolean} {
    const runtime=this.readLease('runtime.lock');
    return{runtimeActive:!!runtime&&living(runtime.pid),recoveryRequired:!!readBytes(this.file('restore-pending.json'))};
  }
}

export function fantasyBackupFiles(dataDirectory:string):Record<string,string> {
  return Object.fromEntries([['world','fantasy.json'],['clock','fantasy-clock.json'],['community','fantasy-community.json'],['contracts','fantasy-contracts.json'],['accounts','fantasy-accounts.json']].map(([key,name])=>[key,path.join(dataDirectory,name)]));
}

export function createFantasyBackupSave(backups:FantasyBackups,write?:(file:string,text:string)=>void):(file:string,text:string)=>void {
  return(file,text)=>backups.write(file,text,write);
}
