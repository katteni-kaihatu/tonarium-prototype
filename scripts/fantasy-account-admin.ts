import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FantasyAccounts, saveFantasyAccountsAtomic } from '../server/fantasy-accounts.ts';
import { FantasyBackups, createFantasyBackupSave, fantasyBackupFiles } from '../server/fantasy-backups.ts';
import { migrateFantasyLegacyOwner } from '../server/fantasy-legacy-owner.ts';

const args=process.argv.slice(2);
const read=(flag:string)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:undefined;};
const principal=read('--principal'),directory=path.resolve(read('--data-dir')??process.env.DATA_DIR??'data');
const validFlags=new Set(['--principal','--data-dir','--apply','--server-stopped']);
for(let index=0;index<args.length;index++){
  if(!validFlags.has(args[index]))throw Error('Use --principal ID [--data-dir PATH] [--apply --server-stopped].');
  if(args[index]==='--principal'||args[index]==='--data-dir'){if(!args[index+1]||args[index+1].startsWith('--'))throw Error('A flag value is missing.');index++;}
}
if(!principal||!/^[A-Za-z0-9:_-]{1,128}(?![\s\S])/u.test(principal))throw Error('A legacy or unclaimed reserved principal is required.');
const reserved=/^fantasy:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?![\s\S])/u;
if(principal.startsWith('fantasy:')&&!reserved.test(principal))throw Error('Invalid reserved principal.');
const worldFile=path.join(directory,'fantasy.json'),saved:unknown=JSON.parse(fs.readFileSync(worldFile,'utf8'));
if(!saved||typeof saved!=='object'||Array.isArray(saved))throw Error('Invalid world storage.');
const envelope=saved as Record<string,unknown>,profiles=envelope.version===2?envelope.profiles:envelope;
if(!profiles||typeof profiles!=='object'||Array.isArray(profiles)||!Object.hasOwn(profiles,principal))throw Error('The legacy profile does not exist.');
const profile=(profiles as Record<string,unknown>)[principal];
if(!profile||typeof profile!=='object'||Array.isArray(profile))throw Error('The legacy profile is invalid.');
const backups=new FantasyBackups({dataDirectory:directory,files:fantasyBackupFiles(directory),required:['world']});
const accounts=new FantasyAccounts({file:path.join(directory,'fantasy-accounts.json'),save:createFantasyBackupSave(backups,saveFantasyAccountsAtomic)});
if(accounts.loadError||accounts.accountForPrincipal(principal))throw Error('The account storage is unavailable or this profile is already owned.');
const newOwner=reserved.test(principal)?principal:`fantasy:${randomUUID()}`;
if(!args.includes('--apply')){
  if(principal!==newOwner){const plan=migrateFantasyLegacyOwner({dataDirectory:directory,legacyOwner:principal,newOwner});process.stdout.write(JSON.stringify(plan,null,2)+'\n');}
  process.stdout.write('Dry run only. The legacy profile exists and can be offered for account adoption. No files were changed.\nStop the game server, then add --apply --server-stopped to issue a one-time claim code.\n');
}else{
  if(!args.includes('--server-stopped'))throw Error('Stop the game server and explicitly pass --server-stopped before issuing a code.');
  const state=backups.status();
  if(state.runtimeActive||state.recoveryRequired)throw Error('The RPG server is running or restoration recovery is pending. Resolve it before issuing a code.');
  if(principal!==newOwner){
    const migrated=migrateFantasyLegacyOwner({dataDirectory:directory,legacyOwner:principal,newOwner,apply:true});
    process.stdout.write(`Legacy world owner migrated to ${newOwner}. Backup: ${migrated.backupId??'recorded by migration'}.\n`);
  }
  backups.acquireRuntime();
  try{
    const current=new FantasyAccounts({file:path.join(directory,'fantasy-accounts.json'),save:createFantasyBackupSave(backups,saveFantasyAccountsAtomic)});
    const code=current.issueLegacyClaim(newOwner);
    process.stdout.write(`One-time legacy claim code (valid for 24 hours; share only with the verified owner):\n${code}\nReserved owner: ${newOwner}\nRestart the game server before the owner redeems it.\n`);
  }finally{backups.releaseRuntime();}
}
