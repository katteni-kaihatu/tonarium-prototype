import fs from 'node:fs';
import path from 'node:path';
import { FantasyBackups, fantasyBackupFiles } from '../server/fantasy-backups.ts';

const args=process.argv.slice(2),allowed=new Set(['--data-dir','--snapshot','--apply']);
const command=args.shift()??'list';
if(!['list','backup','restore','recover'].includes(command))throw new Error('Use list, backup, restore or recover');
const values=new Map<string,string>();let apply=false;
while(args.length){const option=args.shift()!;if(!allowed.has(option)||values.has(option)||option==='--apply'&&apply)throw new Error('Unknown or duplicate option');if(option==='--apply'){apply=true;continue;}const value=args.shift();if(!value||value.startsWith('--'))throw new Error(`Missing ${option} value`);values.set(option,value);}
const requested=values.get('--data-dir');
if(!requested||!path.isAbsolute(requested))throw new Error('An explicit absolute --data-dir is required');
const directory=path.resolve(requested);
if(!fs.existsSync(directory)||!fs.statSync(directory).isDirectory())throw new Error('The data directory does not exist');
const backups=new FantasyBackups({dataDirectory:directory,files:fantasyBackupFiles(directory),required:['world','clock']});
if(command==='list'){
  if(apply||values.has('--snapshot'))throw new Error('list does not accept --apply or --snapshot');
  console.log(JSON.stringify({dataDirectory:directory,status:backups.status(),snapshots:backups.list()},null,2));
}else if(command==='backup'){
  if(values.has('--snapshot'))throw new Error('backup does not accept --snapshot');
  console.log(JSON.stringify(apply?{created:backups.checkpoint('manual',true)}:{preview:true,dataDirectory:directory,files:Object.keys(fantasyBackupFiles(directory)),message:'Add --apply to create a snapshot while the RPG server is stopped.'},null,2));
}else if(command==='restore'){
  const snapshot=values.get('--snapshot');if(!snapshot)throw new Error('restore requires --snapshot');
  const plan=backups.previewRestore(snapshot);
  console.log(JSON.stringify(apply?{restored:backups.restore(snapshot,{apply:true,expectedCurrentHashes:Object.fromEntries(plan.changes.map(entry=>[entry.key,entry.currentHash]))})}:{preview:true,plan,message:'Stop the RPG server, then add --apply. Current files are preserved before restoration.'},null,2));
}else{
  if(values.has('--snapshot'))throw new Error('recover does not accept --snapshot');
  console.log(JSON.stringify(apply?{recovered:backups.recoverInterruptedRestore({apply:true})}:{preview:true,status:backups.status(),message:'Add --apply to roll back an interrupted restoration to its preserved previous files.'},null,2));
}
