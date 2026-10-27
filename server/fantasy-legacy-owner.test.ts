import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { migrateFantasyLegacyOwner } from './fantasy-legacy-owner.ts';
import { FantasyBackups, fantasyBackupFiles } from './fantasy-backups.ts';
import { FantasyStore } from './fantasy-store.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { newFantasyPropertyLedger } from '../shared/fantasy-property.ts';
import { newFantasyPropertyExtension } from '../shared/fantasy-property-extensions.ts';
import { newFantasyEconomyLedger } from '../shared/fantasy-economy.ts';
import { newFantasyCivicLedger } from '../shared/fantasy-civics.ts';
import { createFantasyCombat } from '../shared/fantasy-combat.ts';
import { fantasyCombatPlayer } from './fantasy-combat-adapter.ts';
import { FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { fantasyContractIssuer, fantasyContractMode, fantasyPersonalQuest } from '../shared/fantasy-contracts.ts';
import { fantasyQuestEligible } from '../shared/fantasy-access.ts';

const OLD='a1234567-1234-4234-8234-123456789abc',OTHER=OLD+'-alt',NEW='fantasy:b1234567-1234-4234-8234-123456789abc';
const sha=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
function fixture(t:{after:(fn:()=>void)=>void},combat=false){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tonarium-legacy-owner-'));
  t.after(()=>{assert.equal(path.dirname(directory),os.tmpdir());assert.ok(path.basename(directory).startsWith('tonarium-legacy-owner-'));fs.rmSync(directory,{recursive:true,force:true});});
  const files=fantasyBackupFiles(directory),p=applyFantasyAction(newFantasyProfile(),{type:'create',name:'Legacy',source:'human',gender:'female'},()=>.5).profile,q=structuredClone(p);
  q.character!.name='Other';p.generation=1;q.generation=1;
  const properties=newFantasyPropertyLedger(),plot=properties.plots['hearth-residence'];plot.owner={user:OLD,generation:1,name:'Legacy',acquiredAt:8};plot.listing=null;
  plot.extension=newFantasyPropertyExtension(8);plot.extension.sale={price:300,approved:[JSON.stringify([OLD,1])]};plot.extension.lease={user:OLD,generation:1,name:'Legacy',rent:1,days:1,state:'offered',expiresAt:20,startsAt:8,endsAt:32};
  plot.extension.auction={minimum:1,startedAt:8,endsAt:20,highest:{user:OLD,generation:1,name:'Legacy',amount:2}};
  const unsold=properties.plots['hearth-commercial'];unsold.extension=newFantasyPropertyExtension(8);unsold.extension.bargain={user:OLD,generation:1,name:'Legacy',price:unsold.listing!.price,expiresAt:10,nextAt:12,roll:1,target:50};
  plot.extension.credits=[{user:OLD,generation:1,name:'Legacy',amount:3}];
  p.character!.propertyTitles=['hearth-residence'];
  properties.receipts[JSON.stringify([OLD,1,'req1'])]={actor:OLD,generation:1,requestId:'req1',plot:'hearth-residence',operation:'buy',hour:8};
  const civics=newFantasyCivicLedger();civics.consents[OLD]={generation:1,session:'same',location:'hearth',until:24};
  civics.cooldowns[JSON.stringify([OLD,1,'crime'])]=24;civics.receipts[JSON.stringify([OLD,1,'req1'])]={user:OLD,generation:1,request:'req1',hour:8};
  civics.towns.hearth.steward={user:OLD,generation:1,name:'Legacy'};
  const economy=newFantasyEconomyLedger();economy.trades['trade-check']={id:'trade-check',revision:0,users:[OLD,OTHER],generations:[1,1],names:['Legacy','Other'],location:'hearth',expiresAt:24,status:'open',offers:[{gold:0,goods:[],confirmed:false},{gold:0,goods:[],confirmed:false}]};
  const vaults={party:{revision:0,lots:[{id:'vault-lot',item:'wood',count:1,donor:OLD,generation:1,name:'Legacy'}],requests:[{id:'request',user:OLD,generation:1,name:'Legacy',lot:'vault-lot',count:1}]}};
  const combats:Record<string,unknown>={};
  if(combat){
    const player=fantasyCombatPlayer(p,OLD);player.id='fighter-'+OLD;
    const battle=createFantasyCombat({id:'combat-check',location:'hearth',source:'test',players:[player],enemies:[{id:'enemy',template:'monster-meadow-slime'}],seed:1,hour:p.character!.hour});
    battle.orders[OLD]={type:'guard'};combats[battle.id]={state:battle,session:'same'};p.combatId=battle.id;
  }
  p.log.push({id:999,hour:8,kind:'system',text:'Preserve this display text '+OLD});
  const world={version:2,profiles:{[OLD]:p,[OTHER]:q},combats,properties,vaults,economy,civics};
  const quest=FANTASY_QUESTS.find(quest=>quest.giver==='hearth'&&!fantasyPersonalQuest(quest)&&fantasyContractIssuer(quest)&&fantasyQuestEligible(p.character!,quest))!;
  const grant={offerId:'offer-owner-test',issuer:fantasyContractIssuer(quest)!,boardLocation:'hearth',acceptedAt:8,expiresAt:36,progress:0,gold:quest.gold};
  p.character!.quests.push(quest.id);p.character!.contracts={[quest.id]:grant};
  fs.writeFileSync(files.world,JSON.stringify(world));fs.writeFileSync(files.clock,JSON.stringify({version:1,hour:8,wallTime:Date.now()}));
  fs.writeFileSync(files.community,JSON.stringify({version:1,revision:0,projects:{},players:{[OLD]:{lastAt:{},requests:[]},[OTHER]:{lastAt:{},requests:[]}},notices:[]}));
  fs.writeFileSync(files.contracts,JSON.stringify({version:1,revision:0,generated:{},offers:[{id:grant.offerId,quest:quest.id,boardLocation:'hearth',issuer:grant.issuer,createdAt:0,expiresAt:12,deadline:36,mode:fantasyContractMode(quest),gold:quest.gold,claims:{[OLD]:{phase:'accepted',grant}}}],pressure:{},hunts:[`${OLD}:1:8:monster-slime`,`${OTHER}:1:8:monster-slime`]}));
  fs.writeFileSync(files.accounts,JSON.stringify({version:1,accounts:[],sessions:[],claims:[]}));
  return{directory,files,world};
}

test('legacy migration preview is read-only and reserved owner migration preserves all saved ownership',t=>{
  const f=fixture(t),before=Object.fromEntries(Object.entries(f.files).map(([key,file])=>[key,sha(fs.readFileSync(file))]));
  const preview=migrateFantasyLegacyOwner({dataDirectory:f.directory,legacyOwner:OLD,newOwner:NEW});
  assert.equal(preview.applied,false);assert.ok(preview.files.some(file=>file.key==='world'));assert.equal(fs.existsSync(path.join(f.directory,'fantasy-backups')),false);
  for(const[key,file]of Object.entries(f.files))assert.equal(sha(fs.readFileSync(file)),before[key]);
  const result=migrateFantasyLegacyOwner({dataDirectory:f.directory,legacyOwner:OLD,newOwner:NEW,apply:true});assert.ok(result.applied&&result.backupId);
  const saved=JSON.parse(fs.readFileSync(f.files.world,'utf8'));
  assert.equal(saved.profiles[OLD],undefined);assert.ok(saved.profiles[NEW]);assert.deepEqual(saved.profiles[OTHER],f.world.profiles[OTHER]);
  assert.equal(saved.properties.plots['hearth-residence'].owner.user,NEW);assert.equal(saved.properties.plots['hearth-residence'].extension.lease.user,NEW);
  assert.equal(saved.properties.plots['hearth-residence'].extension.auction.highest.user,NEW);assert.equal(saved.properties.plots['hearth-commercial'].extension.bargain.user,NEW);assert.equal(saved.properties.plots['hearth-residence'].extension.credits[0].user,NEW);
  assert.equal(saved.properties.plots['hearth-residence'].extension.sale.approved[0],JSON.stringify([NEW,1]));
  assert.equal(saved.properties.receipts[JSON.stringify([NEW,1,'req1'])].actor,NEW);
  assert.equal(saved.vaults.party.lots[0].donor,NEW);assert.equal(saved.vaults.party.requests[0].user,NEW);
  assert.deepEqual(saved.economy.trades['trade-check'].users,[NEW,OTHER]);assert.ok(saved.civics.consents[NEW]);assert.equal(saved.civics.towns.hearth.steward.user,NEW);
  assert.equal(saved.civics.receipts[JSON.stringify([NEW,1,'req1'])].user,NEW);assert.equal(saved.civics.cooldowns[JSON.stringify([NEW,1,'crime'])],24);
  assert.ok(saved.profiles[NEW].log.some((row:{text:string})=>row.text.includes(OLD)));
  const community=JSON.parse(fs.readFileSync(f.files.community,'utf8'));assert.ok(community.players[NEW]&&community.players[OTHER]);assert.equal(community.players[OLD],undefined);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.files.contracts,'utf8')).hunts,[`${NEW}:1:8:monster-slime`,`${OTHER}:1:8:monster-slime`]);
  assert.ok(JSON.parse(fs.readFileSync(f.files.contracts,'utf8')).offers[0].claims[NEW]);assert.equal(JSON.parse(fs.readFileSync(f.files.contracts,'utf8')).offers[0].claims[OLD],undefined);
  assert.equal(sha(fs.readFileSync(f.files.accounts)),before.accounts);
  assert.equal(new FantasyStore(f.files.world,{combatEnabled:true,onError:()=>{}}).loadError,undefined);
});

test('active combat owner, fighter IDs, orders and participant IDs migrate together',t=>{
  const f=fixture(t,true);migrateFantasyLegacyOwner({dataDirectory:f.directory,legacyOwner:OLD,newOwner:NEW,apply:true});
  const saved=JSON.parse(fs.readFileSync(f.files.world,'utf8')),battle=saved.combats['combat-check'].state;
  assert.equal(battle.fighters[0].userId,NEW);assert.equal(battle.fighters[0].id,'fighter-'+NEW);assert.ok(battle.orders[NEW]);assert.equal(battle.orders[OLD],undefined);assert.deepEqual(battle.scaling.participantIds,[NEW]);
  assert.equal(new FantasyStore(f.files.world,{combatEnabled:true,onError:()=>{}}).loadError,undefined);
});

test('migration refuses live servers, existing targets and invalid saves without altering sources',t=>{
  const f=fixture(t),backups=new FantasyBackups({dataDirectory:f.directory,files:f.files});backups.acquireRuntime();
  assert.throws(()=>migrateFantasyLegacyOwner({dataDirectory:f.directory,legacyOwner:OLD,newOwner:NEW,apply:true}),/Stop the RPG server/u);backups.releaseRuntime();
  fs.writeFileSync(f.files.accounts,JSON.stringify({version:1,accounts:[{principal:NEW}],sessions:[],claims:[]}));
  assert.throws(()=>migrateFantasyLegacyOwner({dataDirectory:f.directory,legacyOwner:OLD,newOwner:NEW}),/already present/u);
  fs.writeFileSync(f.files.accounts,JSON.stringify({version:1,accounts:[],sessions:[],claims:[]}));
  const invalid=JSON.parse(fs.readFileSync(f.files.world,'utf8'));invalid.profiles[OLD].character.race='made-up';fs.writeFileSync(f.files.world,JSON.stringify(invalid));const before=fs.readFileSync(f.files.world);
  assert.throws(()=>migrateFantasyLegacyOwner({dataDirectory:f.directory,legacyOwner:OLD,newOwner:NEW,apply:true}),/domain validation/u);assert.deepEqual(fs.readFileSync(f.files.world),before);
  assert.throws(()=>migrateFantasyLegacyOwner({dataDirectory:f.directory,legacyOwner:'not-an-owner',newOwner:NEW}),/legacy browser UUID/u);
  assert.throws(()=>migrateFantasyLegacyOwner({dataDirectory:f.directory,legacyOwner:OLD+'\n',newOwner:NEW}),/legacy browser UUID/u);
  assert.throws(()=>migrateFantasyLegacyOwner({dataDirectory:f.directory,legacyOwner:OLD,newOwner:NEW+'\n'}),/legacy browser UUID/u);
});

test('migration write failure restores every changed ledger and leaves no partially reassigned owner',t=>{
  const f=fixture(t),before=Object.fromEntries(Object.entries(f.files).map(([key,file])=>[key,fs.readFileSync(file)])),rename=fs.renameSync;let failed=false;
  fs.renameSync=((from:fs.PathLike,to:fs.PathLike)=>{if(String(to)===f.files.community&&!failed){failed=true;throw Object.assign(new Error('Injected migration write failure'),{code:'EIO'});}return rename(from,to);}) as typeof fs.renameSync;
  try {assert.throws(()=>migrateFantasyLegacyOwner({dataDirectory:f.directory,legacyOwner:OLD,newOwner:NEW,apply:true}),/previous files were restored/u);}finally{fs.renameSync=rename;}
  assert.ok(failed);for(const[key,file]of Object.entries(f.files))assert.deepEqual(fs.readFileSync(file),before[key]);
  assert.equal(new FantasyBackups({dataDirectory:f.directory,files:f.files}).status().recoveryRequired,false);
});

test('original flat profile saves migrate without inventing or changing character data',t=>{
  const f=fixture(t),p=applyFantasyAction(newFantasyProfile(),{type:'create',name:'Old character',source:'human',gender:'male'},()=>.5).profile;
  fs.writeFileSync(f.files.world,JSON.stringify({[OLD]:p,[OTHER]:structuredClone(p)}));
  fs.unlinkSync(f.files.community);fs.unlinkSync(f.files.contracts);
  migrateFantasyLegacyOwner({dataDirectory:f.directory,legacyOwner:OLD,newOwner:NEW,apply:true});
  const saved=JSON.parse(fs.readFileSync(f.files.world,'utf8'));assert.deepEqual(saved.profiles[NEW],p);assert.deepEqual(saved.profiles[OTHER],p);assert.equal(saved.profiles[OLD],undefined);
});
