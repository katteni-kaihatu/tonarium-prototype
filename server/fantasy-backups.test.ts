import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { FantasyBackups, createFantasyBackupSave, fantasyBackupFiles } from './fantasy-backups.ts';
import { markFantasyPlatformDataCurrent, resetFantasyPlatformData, FANTASY_PLATFORM_RESET_MARKER } from './fantasy-platform-reset.ts';

const sha=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
function fixture(t:{after:(fn:()=>void)=>void},extra:Partial<ConstructorParameters<typeof FantasyBackups>[0]>={}){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tonarium-backup-'));
  t.after(()=>{assert.equal(path.dirname(directory),os.tmpdir());assert.ok(path.basename(directory).startsWith('tonarium-backup-'));fs.rmSync(directory,{recursive:true,force:true});});
  const files=fantasyBackupFiles(directory);let now=Date.UTC(2026,9,27,12);
  for(const[key,file]of Object.entries(files))if(key!=='platform-reset')fs.writeFileSync(file,JSON.stringify({kind:key,revision:1}));
  markFantasyPlatformDataCurrent(directory);
  const options={dataDirectory:directory,files,required:['world','clock'],now:()=>now,...extra};
  return{directory,files,options,backups:new FantasyBackups(options),now:()=>now,advance:(ms:number)=>{now+=ms;}};
}

test('checkpoint verifies all world files, throttles unchanged work and preserves atomic manifest hashes',t=>{
  const f=fixture(t),first=f.backups.checkpoint('startup',true)!;
  assert.ok(first);assert.equal(f.backups.list().length,1);assert.equal(f.backups.list()[0].restorable,true);
  for(const[key,file]of Object.entries(f.files)){const entry=first.files[key]!;assert.equal(entry.sha256,sha(fs.readFileSync(file)));assert.equal(entry.bytes,fs.statSync(file).size);}
  assert.equal(f.backups.checkpoint(),undefined);f.advance(300_000);assert.equal(f.backups.checkpoint(),undefined);
  fs.writeFileSync(f.files.world,JSON.stringify({kind:'world',revision:2}));f.advance(300_000);
  const next=f.backups.checkpoint()!;assert.ok(next&&next.id!==first.id);assert.equal(f.backups.list().length,2);
  assert.deepEqual(fs.readdirSync(f.backups.directory).filter(name=>name.startsWith('.pending-')),[]);
});

test('corrupt current JSON is preserved and tampered snapshots cannot restore',t=>{
  const f=fixture(t),snapshot=f.backups.checkpoint('manual',true)!;
  fs.writeFileSync(f.files.world,'{"broken":');f.advance(300_000);
  assert.throws(()=>f.backups.checkpoint(),/invalid save/u);assert.equal(fs.readFileSync(f.files.world,'utf8'),'{"broken":');
  fs.writeFileSync(path.join(f.backups.directory,snapshot.id,'world.json'),'{}');
  assert.throws(()=>f.backups.previewRestore(snapshot.id),/checksum/u);assert.equal(f.backups.list()[0].verified,false);
});

test('restoration has a read-only preview, checks current hashes and preserves corrupt previous files',t=>{
  const f=fixture(t),snapshot=f.backups.checkpoint('manual',true)!;
  fs.writeFileSync(f.files.world,'corrupt-current');
  const before=fs.readFileSync(f.files.world),plan=f.backups.previewRestore(snapshot.id);
  assert.equal(plan.changes.find(row=>row.key==='world')!.currentHash,sha(before));assert.deepEqual(fs.readFileSync(f.files.world),before);
  assert.throws(()=>f.backups.restore(snapshot.id,{apply:true,expectedCurrentHashes:{world:'wrong'}}),/changed since/u);
  f.backups.restore(snapshot.id,{apply:true,expectedCurrentHashes:Object.fromEntries(plan.changes.map(row=>[row.key,row.currentHash]))});
  assert.equal(JSON.parse(fs.readFileSync(f.files.world,'utf8')).revision,1);
  const previous=f.backups.list().find(entry=>entry.reason==='before-restore')!;assert.ok(previous.verified&&!previous.restorable);
  assert.equal(fs.readFileSync(path.join(f.backups.directory,previous.id,'world.json'),'utf8'),'corrupt-current');
  assert.equal(f.backups.status().recoveryRequired,false);
});

test('new backups exclude old credentials and restore the current platform marker with progress',t=>{
  const f=fixture(t);
  fs.writeFileSync(path.join(f.directory,'fantasy-accounts.json'),'legacy-credentials-that-must-not-be-backed-up');
  const snapshot=f.backups.checkpoint('manual',true)!;
  assert.equal('accounts' in snapshot.files,false);
  assert.equal(fs.existsSync(path.join(f.backups.directory,snapshot.id,'accounts.json')),false);
  assert.equal(f.files['platform-reset'],path.join(f.directory,FANTASY_PLATFORM_RESET_MARKER));
  assert.ok(snapshot.files['platform-reset']);
  const marker=fs.readFileSync(f.files['platform-reset']);
  fs.writeFileSync(f.files.world,JSON.stringify({kind:'world',revision:2}));
  fs.unlinkSync(f.files['platform-reset']);
  f.backups.restore(snapshot.id,{apply:true});
  assert.deepEqual(fs.readFileSync(f.files['platform-reset']),marker);
  resetFantasyPlatformData(f.directory);
  assert.equal(JSON.parse(fs.readFileSync(f.files.world,'utf8')).revision,1);
});

test('restore refuses snapshots without a valid completion marker before changing any saves',t=>{
  for(const marker of [undefined,'{}']){
    const f=fixture(t),file=f.files['platform-reset'];
    if(marker===undefined)fs.unlinkSync(file);else fs.writeFileSync(file,marker);
    const snapshot=f.backups.checkpoint('manual',true)!;
    fs.writeFileSync(f.files.world,JSON.stringify({revision:2}));
    const before=fs.readFileSync(f.files.world);
    assert.throws(()=>f.backups.restore(snapshot.id,{apply:true}),/valid completed platform reset marker/u);
    assert.deepEqual(fs.readFileSync(f.files.world),before);
    assert.equal(f.backups.list()[0].restorable,false);
  }
});

test('live runtime lease prevents concurrent world starts, manual snapshots and restoration',t=>{
  const f=fixture(t),snapshot=f.backups.checkpoint('startup',true)!;f.backups.acquireRuntime();
  const other=new FantasyBackups(f.options);
  assert.throws(()=>other.acquireRuntime(),/server is running/u);
  assert.throws(()=>other.checkpoint('manual',true),/running RPG server/u);
  assert.throws(()=>other.restore(snapshot.id,{apply:true}),/server is running/u);
  f.advance(300_000);assert.doesNotThrow(()=>f.backups.checkpoint());f.backups.releaseRuntime();
  assert.doesNotThrow(()=>other.acquireRuntime());other.releaseRuntime();
});

test('retention keeps bounded recent snapshots and the latest snapshot on distinct UTC days',t=>{
  const f=fixture(t,{retainRecent:2,retainDaily:2}),days=new Map<string,string>();
  for(let day=0;day<4;day++){
    for(let version=0;version<2;version++){fs.writeFileSync(f.files.world,JSON.stringify({day,version}));const entry=f.backups.checkpoint('manual',true)!;days.set(new Date(entry.createdAt).toISOString().slice(0,10),entry.id);f.advance(300_000);}
    f.advance(86_400_000);
  }
  const list=f.backups.list();assert.ok(list.length<=4);assert.equal(new Set(list.map(entry=>new Date(entry.createdAt).toISOString().slice(0,10))).size,2);
  for(const id of [...days.values()].slice(-2))assert.ok(list.some(entry=>entry.id===id));
});

test('missing snapshot files never remove newly created world data',t=>{
  const f=fixture(t);fs.unlinkSync(f.files.community);const snapshot=f.backups.checkpoint('startup',true)!;
  fs.writeFileSync(f.files.community,JSON.stringify({owner:{}}));
  assert.throws(()=>f.backups.previewRestore(snapshot.id),/lacks existing save community/u);
  assert.ok(fs.readFileSync(f.files.community,'utf8').includes('owner'));
});

test('interrupted restoration blocks startup until explicit rollback restores the preserved originals',t=>{
  const f=fixture(t),original=Object.fromEntries(Object.entries(f.files).map(([key,file])=>[key,fs.readFileSync(file)]));
  const rollback=f.backups.checkpoint('before-restore',true)!;
  fs.writeFileSync(f.files.world,'{"partly":"restored"}');
  fs.writeFileSync(path.join(f.backups.directory,'restore-pending.json'),JSON.stringify({version:1,snapshot:rollback.id,rollback:rollback.id,keys:Object.keys(f.files)}));
  assert.throws(()=>f.backups.acquireRuntime(),/interrupted restoration/u);
  assert.equal(f.backups.recoverInterruptedRestore({apply:true}),true);
  for(const[key,file]of Object.entries(f.files))assert.deepEqual(fs.readFileSync(file),original[key]);
  assert.equal(f.backups.status().recoveryRequired,false);
});

test('a failure after one restored file rolls every target back before returning an error',t=>{
  const f=fixture(t),snapshot=f.backups.checkpoint('manual',true)!;
  for(const[key,file]of Object.entries(f.files))fs.writeFileSync(file,JSON.stringify({kind:key,revision:2}));
  const before=Object.fromEntries(Object.entries(f.files).map(([key,file])=>[key,fs.readFileSync(file)]));
  const rename=fs.renameSync;let failed=false;
  fs.renameSync=((from:fs.PathLike,to:fs.PathLike)=>{if(String(to)===f.files.clock&&!failed){failed=true;throw Object.assign(new Error('Injected write failure'),{code:'EIO'});}return rename(from,to);}) as typeof fs.renameSync;
  try {assert.throws(()=>f.backups.restore(snapshot.id,{apply:true}),/previous files were restored/u);}finally{fs.renameSync=rename;}
  assert.equal(failed,true);for(const[key,file]of Object.entries(f.files))assert.deepEqual(fs.readFileSync(file),before[key]);
  assert.equal(f.backups.status().recoveryRequired,false);
});

test('write wrapper preserves the pre-write state and refuses malformed incoming payloads',t=>{
  const f=fixture(t),write=createFantasyBackupSave(f.backups),before=fs.readFileSync(f.files.world);
  write(f.files.world,JSON.stringify({revision:2}));const snapshot=f.backups.list()[0];
  assert.deepEqual(fs.readFileSync(path.join(f.backups.directory,snapshot.id,'world.json')),before);
  assert.throws(()=>write(f.files.world,'bad JSON'));assert.equal(JSON.parse(fs.readFileSync(f.files.world,'utf8')).revision,2);
  assert.throws(()=>write(path.join(f.directory,'home.json'),'{}'),/Unregistered/u);assert.equal(fs.existsSync(path.join(f.directory,'home.json')),false);
});

test('paths and snapshot IDs cannot escape the registered data directory',t=>{
  const f=fixture(t);
  assert.throws(()=>new FantasyBackups({...f.options,files:{world:path.join(f.directory,'..','outside.json')}}),/directly inside/u);
  assert.throws(()=>new FantasyBackups({...f.options,files:{'../escape':f.files.world}}),/directly inside/u);
  assert.throws(()=>f.backups.previewRestore('../fantasy.json'),/Invalid snapshot/u);
});

test('operator CLI list and restore preview are read-only without apply',t=>{
  const f=fixture(t),snapshot=f.backups.checkpoint('manual',true)!,before=Object.fromEntries(Object.entries(f.files).map(([key,file])=>[key,sha(fs.readFileSync(file))]));
  for(const args of [['list','--data-dir',f.directory],['restore','--data-dir',f.directory,'--snapshot',snapshot.id]]){
    const result=spawnSync(process.execPath,['--experimental-transform-types','scripts/fantasy-backup.ts',...args],{cwd:process.cwd(),encoding:'utf8',windowsHide:true});
    assert.equal(result.status,0,result.stderr);assert.ok(result.stdout.trim());
  }
  for(const[key,file]of Object.entries(f.files))assert.equal(sha(fs.readFileSync(file)),before[key]);
  assert.equal(f.backups.list().length,1);
});
