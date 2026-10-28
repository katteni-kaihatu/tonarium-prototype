import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { COMPAT_VERSION } from '../shared/protocol.ts';
import { FantasyParty, type FantasyPartyActor } from './fantasy-party.ts';
import { FantasyStore, type FantasyGroupInvestigationPlan } from './fantasy-store.ts';
import { applyFantasyAction, fantasyStats, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { FANTASY_PARTY_MAX_MEMBERS, FANTASY_PARTY_TTL_MS, fantasyPartyErrorText, isFantasyPartyCommand, type FantasyPartyState } from '../shared/fantasy-party.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';

const quest = 'main-night-01';
function player(name: string, weak = false): FantasyProfile {
  let p=applyFantasyAction(newFantasyProfile(),{type:'create',source:'human',name,gender:'female'},()=>.5).profile;
  p=applyFantasyAction(p,{type:'accept',quest},()=>.5).profile;
  const c=p.character!;c.location='oldwatch';c.visited.push('oldwatch');c.inventory.lantern=1;c.inventory.relic=10;
  if(weak){c.race='orc';c.birthBonuses={hp:0,mp:0,strength:0,agility:0,intelligence:-1,luck:0,vitality:0};c.hunger=90;c.fatigue=90;}
  else c.buff={effect:'check',power:40};
  c.hp=fantasyStats(c).hp;c.mp=fantasyStats(c).mp;return p;
}
function temp(t: TestContext){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fantasy-party-'));t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('fantasy-party-'));fs.rmSync(dir,{recursive:true,force:true});});return dir;}
function fixture(t: TestContext,count=2,prepare?:(p:FantasyProfile,index:number)=>FantasyProfile){
  const dir=temp(t),file=path.join(dir,'fantasy.json'), profiles=Object.fromEntries(Array.from({length:count},(_,i)=>{const p=player(`SecretCharacter${i}`,i===1);return[`p${i}`,prepare?prepare(p,i):p];}));
  fs.writeFileSync(file,JSON.stringify(profiles));let hour=8,wall=1000,failSave=false,writes=0,seeds=0;
  const store=new FantasyStore(file,{worldHour:()=>hour,now:()=>wall,onError:()=>{},save:(file,text)=>{writes++;if(failSave)throw Error('disk full');fs.writeFileSync(file,text);}});assert.equal(store.loadError,undefined);
  const actors=new Map<string,{session:string|null;world:string;override?:FantasyProfile}>(Object.keys(profiles).map(id=>[id,{session:'same',world:'fantasy'}]));
  const lookup=(id:string):FantasyPartyActor|undefined=>{const actor=actors.get(id);return actor?{id,name:`Public ${id}`,session:actor.session,world:actor.world,profile:actor.override??store.profile(id)}:undefined;};
  const party=new FantasyParty({lookup,start:plans=>store.startGroupInvestigation(plans,()=>++seeds*.37%1),now:()=>wall});
  const request=(id:string,command:unknown)=>party.request(id,command);
  const join=(id:string)=>{assert.equal(request('p0',{type:'invite',target:id}).error,undefined);const invitation=party.state(id).invitations[0];assert.ok(invitation);assert.equal(request(id,{type:'respond',invite:invitation.id,accept:true}).error,undefined);};
  const create=()=>{assert.equal(request('p0',{type:'create'}).error,undefined);};
  const ready=(id:string)=>{assert.equal(request(id,{type:'ready',quest,approach:'analyze'}).error,undefined);};
  return{dir,file,store,actors,party,request,join,create,ready,setHour:(value:number)=>{hour=value;},setWall:(value:number)=>{wall=value;},fail:(value:boolean)=>{failSave=value;},writes:()=>writes,seeds:()=>seeds};
}

test('strict party commands expose six-member capacity and all error messages in three languages',()=>{
  assert.equal(FANTASY_PARTY_MAX_MEMBERS,6);assert.equal(FANTASY_PARTY_TTL_MS,120000);
  for(const command of [{type:'create'},{type:'invite',target:'bob'},{type:'respond',invite:'opaque',accept:true},{type:'ready',quest,approach:'observe'},{type:'start'}])assert.equal(isFantasyPartyCommand(command),true);
  for(const command of [null,[],{type:'ready',quest,approach:'observe',target:'other'},{type:'start',members:['other']},{type:'ready',quest,approach:'forged'},{type:'respond',invite:'x',accept:'yes'}])assert.equal(isFantasyPartyCommand(command),false);
  for(const locale of ['ko','en','ja'] as const)for(const code of ['invalid','party-full','not-ready','save-failed'] as const)assert.ok(fantasyPartyErrorText(code,locale).length>4);
});

test('invitations require actual living same-session users and only the invited user can accept or decline',t=>{
  const f=fixture(t,4);f.create();
  assert.equal(f.request('p0',{type:'invite',target:'missing'}).error,'not-found');assert.equal(f.request('p0',{type:'invite',target:'p0'}).error,'self-invite');
  f.actors.get('p2')!.session='elsewhere';assert.equal(f.request('p0',{type:'invite',target:'p2'}).error,'not-found');
  const dead=f.store.profile('p3');dead.death={hour:8,location:'oldwatch',cause:'fixture'};dead.character!.hp=0;f.actors.get('p3')!.override=dead;assert.equal(f.request('p0',{type:'invite',target:'p3'}).error,'not-found');
  assert.equal(f.request('p0',{type:'invite',target:'p1'}).error,undefined);const invite=f.party.state('p1').invitations[0].id;
  assert.equal(f.request('p2',{type:'respond',invite,accept:true}).error,'invite-expired');assert.equal(f.party.state('p0').members.length,1);
  assert.equal(f.request('p1',{type:'respond',invite,accept:false}).error,undefined);assert.equal(f.party.state('p1').id,null);
  f.join('p1');assert.equal(f.party.state('p0').members.length,2);
});

test('six members fit but a seventh cannot join, and joining never copies profiles or clues',t=>{
  const f=fixture(t,7),before=Object.fromEntries([...f.actors.keys()].map(id=>[id,f.store.profile(id)]));f.create();for(let i=1;i<6;i++)f.join(`p${i}`);
  assert.equal(f.party.state('p0').members.length,6);assert.equal(f.request('p0',{type:'invite',target:'p6'}).error,'party-full');
  assert.equal(f.writes(),0);for(const id of f.actors.keys())assert.deepEqual(f.store.profile(id),before[id]);
  const state=f.party.state('p0');for(const member of state.members)assert.deepEqual(Object.keys(member).sort(),['compatible','here','id','isLeader','name','ready']);
  const publicText=JSON.stringify(state);for(const hidden of ['SecretCharacter','oldwatch','main-night','inventory','relic','proofs','intelligence'])assert.ok(!publicText.includes(hidden));
});

test('every member chooses their own approach and the leader cannot start or ready on somebody else behalf',t=>{
  const f=fixture(t);f.create();f.join('p1');f.ready('p0');
  assert.equal(f.request('p0',{type:'start'}).error,'not-ready');assert.equal(f.request('p0',{type:'ready',quest,approach:'analyze',target:'p1'}).error,'invalid');
  assert.equal(f.request('p1',{type:'start'}).error,'leader-only');assert.equal(f.party.state('p0').canStart,false);f.ready('p1');
  assert.equal(f.party.state('p0').canStart,true);assert.equal(f.party.state('p1').canStart,false);assert.equal(f.writes(),0);
});

test('passive clock revisions preserve consent and one atomic save starts independent same-duration personal investigations',t=>{
  const f=fixture(t);f.create();f.join('p1');f.ready('p0');f.ready('p1');const before=f.store.profile('p0').revision;
  f.setHour(8.1);f.store.tick(new Set(['p0','p1']));assert.equal(f.store.profile('p0').character!.hour,8.1);
  const clockView=f.store.profile('p0');clockView.revision=before+3;f.actors.get('p0')!.override=clockView;assert.equal(f.party.state('p0').canStart,true);f.actors.get('p0')!.override=undefined;
  const writes=f.writes(),result=f.request('p0',{type:'start'});assert.equal(result.error,undefined);assert.equal(result.updates!.length,2);assert.equal(f.writes(),writes+1);
  assert.equal(f.seeds(),2);assert.notEqual(result.updates![0].profile.activity!.seed,result.updates![1].profile.activity!.seed);
  for(const update of result.updates!){assert.equal(update.profile.activity!.startedAt,8.1);assert.equal(update.profile.activity!.endsAt,8.6);assert.equal(update.profile.character!.mainTrials![quest].proofs.length,0);}
  assert.equal(f.party.state('p0').members.some(member=>member.ready),false);
  f.setHour(8.6);f.store.tick(new Set(['p0','p1']));
  const a=f.store.profile('p0'),b=f.store.profile('p1');assert.equal(a.character!.mainTrials![quest].proofs.length,1);assert.equal(b.character!.mainTrials![quest].proofs.length,0);
  assert.ok(a.character!.xp>0);assert.equal(b.character!.xp,0);assert.equal(a.character!.gold,b.character!.gold);assert.ok(!b.log.some(log=>log.text.endsWith(':success］。')));
  const settled=JSON.stringify({a,b});f.store.tick(new Set(['p0','p1']));assert.equal(JSON.stringify({a:f.store.profile('p0'),b:f.store.profile('p1')}),settled);
});

test('a failed atomic save starts nobody and a retry preserves every character and private inventory',t=>{
  const f=fixture(t);f.create();f.join('p1');f.ready('p0');f.ready('p1');const a=f.store.profile('p0'),b=f.store.profile('p1'),bytes=fs.readFileSync(f.file,'utf8');
  f.fail(true);assert.equal(f.request('p0',{type:'start'}).error,'save-failed');assert.deepEqual(f.store.profile('p0'),a);assert.deepEqual(f.store.profile('p1'),b);assert.equal(fs.readFileSync(f.file,'utf8'),bytes);
  f.fail(false);assert.equal(f.request('p0',{type:'start'}).error,undefined);assert.deepEqual(f.store.profile('p0').character!.inventory,a.character!.inventory);assert.deepEqual(f.store.profile('p1').character!.inventory,b.character!.inventory);
});

test('completion-save failure publishes no partial clue or XP and deterministic personal results settle once after retry',t=>{
  const f=fixture(t);f.create();f.join('p1');f.ready('p0');f.ready('p1');assert.equal(f.request('p0',{type:'start'}).error,undefined);
  const before={a:f.store.profile('p0'),b:f.store.profile('p1')},bytes=fs.readFileSync(f.file,'utf8');f.setHour(8.5);f.fail(true);
  const failed=f.store.tick(new Set(['p0','p1']));assert.ok(failed.every(update=>!!update.error));assert.deepEqual({a:f.store.profile('p0'),b:f.store.profile('p1')},before);assert.equal(fs.readFileSync(f.file,'utf8'),bytes);
  f.fail(false);f.store.tick(new Set(['p0','p1']));const a=f.store.profile('p0'),b=f.store.profile('p1');assert.equal(a.character!.mainTrials![quest].proofs.length,1);assert.equal(b.character!.mainTrials![quest].proofs.length,0);
  const reloaded=new FantasyStore(f.file,{worldHour:()=>8.5});assert.deepEqual(reloaded.profile('p0'),a);assert.deepEqual(reloaded.profile('p1'),b);assert.equal(reloaded.tick(new Set()).length,0);
});

test('consent expires, individual activity or changed life/stage/location invalidates it and member changes clear everyone readiness',t=>{
  const f=fixture(t,3);f.create();f.join('p1');f.ready('p0');f.ready('p1');f.party.invalidate('p1');assert.equal(f.party.state('p0').canStart,false);f.ready('p1');
  for(const change of [(p:FantasyProfile)=>{p.generation=2;},(p:FantasyProfile)=>{p.activity={action:{type:'rest'},startedAt:8,endsAt:16,seed:1};},(p:FantasyProfile)=>{p.character!.buff={effect:'check',power:40};const progressed=applyFantasyAction(p,{type:'investigate',quest,approach:'observe'},()=>.999).profile;Object.assign(p,progressed);}]){
    const changed=f.store.profile('p1');change(changed);f.actors.get('p1')!.override=changed;assert.equal(f.party.state('p0').members.find(member=>member.id==='p1')!.ready,false);f.actors.get('p1')!.override=undefined;f.ready('p1');
  }
  f.setWall(121001);assert.equal(f.party.state('p0').members.some(member=>member.ready),false);f.ready('p0');f.ready('p1');
  const moved=f.store.profile('p1');moved.character!.location='hearth';f.actors.get('p1')!.override=moved;assert.equal(f.party.state('p0').members.find(member=>member.id==='p1')!.ready,false);
  f.actors.get('p1')!.override=undefined;f.ready('p1');f.join('p2');assert.equal(f.party.state('p0').members.some(member=>member.ready),false);
  f.ready('p0');f.ready('p1');f.actors.get('p1')!.session='elsewhere';assert.equal(f.party.state('p0').members.length,2);assert.equal(f.party.state('p0').members.some(member=>member.ready),false);
});

test('expired invitations cannot join and leader departure promotes a remaining member without executing any action',t=>{
  const f=fixture(t,3);f.create();assert.equal(f.request('p0',{type:'invite',target:'p2'}).error,undefined);const id=f.party.state('p2').invitations[0].id;f.setWall(121001);
  assert.equal(f.request('p2',{type:'respond',invite:id,accept:true}).error,'invite-expired');f.join('p1');f.ready('p0');f.ready('p1');f.party.leave('p0');
  const state=f.party.state('p1');assert.equal(state.members.length,1);assert.equal(state.members[0].isLeader,true);assert.equal(state.members[0].ready,false);assert.equal(f.request('p1',{type:'start'}).error,'too-small');assert.equal(f.writes(),0);
});

test('batch store rejects forged, duplicate, stale-stage and busy targets without partial writes',t=>{
  const f=fixture(t),plan=(user:string):FantasyGroupInvestigationPlan=>({user,quest,approach:'analyze',generation:1,location:'oldwatch',stage:'field'});
  for(const plans of [[plan('p0')],[plan('p0'),plan('p0')],[plan('p0'),{...plan('p1'),stage:'compare' as const}],[plan('p0'),{...plan('p1'),generation:2}],[plan('p0'),{...plan('p1'),reward:999}],[plan('p0'),null]]){
    const before=fs.readFileSync(f.file,'utf8');assert.ok(f.store.startGroupInvestigation(plans as FantasyGroupInvestigationPlan[]).error);assert.equal(fs.readFileSync(f.file,'utf8'),before);
  }
  assert.equal(f.writes(),0);
});

test('server restart drops only the roster while each saved investigation completes once normally',t=>{
  const f=fixture(t);f.create();f.join('p1');f.ready('p0');f.ready('p1');assert.equal(f.request('p0',{type:'start'}).error,undefined);
  const restarted=new FantasyStore(f.file,{worldHour:()=>8.5,onError:error=>{throw error;}}),empty=new FantasyParty({lookup:id=>({id,name:id,session:'same',world:'fantasy',profile:restarted.profile(id)}),start:plans=>restarted.startGroupInvestigation(plans)});
  assert.equal(empty.state('p0').id,null);assert.ok(restarted.profile('p0').activity);restarted.tick(new Set());assert.equal(restarted.profile('p0').activity,undefined);assert.equal(restarted.profile('p0').character!.mainTrials![quest].proofs.length,1);
});

test('different personal voyage decisions survive the group reservation and are never copied or included in party state',t=>{
  const f=fixture(t,2,(p,index)=>{
    p.character!.buff={effect:'check',power:40};p=applyFantasyAction(p,{type:'investigate',quest,approach:'observe'},()=>.999).profile;p.character!.location='hearth';
    const chosen=applyFantasyAction(p,{type:'voyageDecision',decision:'letter-promise',choice:index?'verify':'promise'},()=>.999);assert.equal(chosen.error,undefined);return chosen.profile;
  });f.setHour(8.5);f.create();f.join('p1');const a=structuredClone(f.store.profile('p0').character!.voyageDecisions),b=structuredClone(f.store.profile('p1').character!.voyageDecisions);assert.notDeepEqual(a,b);
  f.ready('p0');f.ready('p1');assert.equal(f.request('p0',{type:'start'}).error,undefined);
  assert.deepEqual(f.store.profile('p0').character!.voyageDecisions,a);assert.deepEqual(f.store.profile('p1').character!.voyageDecisions,b);
  assert.ok(!JSON.stringify(f.party.state('p0')).includes('letter-promise'));assert.ok(!JSON.stringify(f.party.state('p1')).includes('voyageDecisions'));
});

test('real WebSocket party requests enforce session boundaries, individual consent and recipient-only profile updates',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'fantasy-party-ws-')),profiles=Object.fromEntries(['alice','bob','carol'].map(id=>{const p=player(`Secret-${id}`);p.character!.inventory.potion=1;p.character!.hp=50;p.character!.combatVictories={'story:main-night-01:field':8};return[id,p];}));
  fs.writeFileSync(path.join(directory,'fantasy.json'),JSON.stringify(profiles));fs.writeFileSync(path.join(directory,'fantasy-clock.json'),JSON.stringify({version:1,hour:8,wallTime:Date.now()+3600000}));
  const sessions=path.join(directory,'sessions.json');fs.writeFileSync(sessions,JSON.stringify({name:'Party integration',sessions:[{id:'one',name:'One',world:'fantasy'},{id:'two',name:'Two',world:'fantasy'}]}));
  const listener=net.createServer();await new Promise<void>(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=(listener.address() as net.AddressInfo).port;await new Promise<void>(resolve=>listener.close(()=>resolve()));
  const child=spawn(process.execPath,['--import','tsx','server/index.ts','--dev'],{env:{...process.env,NODE_ENV:'test',FANTASY_ACCOUNT_TEST_BYPASS:'1',SERVER_PORT:String(port),DATA_DIR:directory,SESSIONS_FILE:sessions,LIVEKIT_URL:'',LIVEKIT_API_KEY:'',LIVEKIT_API_SECRET:'',KOKOAAI_APIKEY: ''},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',data=>{output+=String(data);});child.stderr.on('data',data=>{output+=String(data);});const sockets:WebSocket[]=[];
  t.after(async()=>{for(const socket of sockets)socket.terminate();child.kill();if(child.exitCode===null&&!child.signalCode)await new Promise<void>(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},3000);child.once('exit',()=>{clearTimeout(timer);resolve();});});assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('fantasy-party-ws-'));fs.rmSync(directory,{recursive:true,force:true});});
  async function until<T>(read:()=>T|undefined):Promise<T>{const deadline=Date.now()+12000;while(Date.now()<deadline){const value=read();if(value!==undefined)return value;if(child.exitCode!==null)throw Error(output);await new Promise(resolve=>setTimeout(resolve,15));}throw Error(`Party WS timeout: ${output}`);}
  async function client(id:string,session:string){
    let ws:WebSocket|undefined;const deadline=Date.now()+12000;
    while(!ws&&Date.now()<deadline){const attempt=new WebSocket(`ws://127.0.0.1:${port}/ws`);const opened=await new Promise<boolean>(resolve=>{attempt.once('open',()=>resolve(true));attempt.once('error',()=>resolve(false));});if(opened)ws=attempt;else{attempt.terminate();await new Promise(resolve=>setTimeout(resolve,25));}}
    assert.ok(ws,output);sockets.push(ws);ws.on('error',()=>{});
    const messages:({t:string;state?:FantasyPartyState;profile?:FantasyProfile;error?:string})[]=[];ws.on('message',raw=>{messages.push(JSON.parse(String(raw)));});
    const send=(message:unknown)=>ws!.send(JSON.stringify(message));send({t:'hello',compat: COMPAT_VERSION,id,name:`Public-${id}`});await until(()=>messages.find(message=>message.t==='fantasyPartyState'));const joinedAt=messages.length;send({t:'join',sid:session});send({t:'fantasyPartyRequest',command:{type:'sync'}});await until(()=>messages.slice(joinedAt).find(message=>message.t==='fantasyPartyState'&&!message.error));
    return{messages,send,state:(predicate:(state:FantasyPartyState)=>boolean)=>until(()=>[...messages].reverse().find(message=>message.t==='fantasyPartyState'&&message.state&&predicate(message.state))?.state),error:(error:string,start=0)=>until(()=>messages.slice(start).find(message=>message.t==='fantasyPartyState'&&message.error===error))};
  }
  const a=await client('alice','one'),b=await client('bob','one'),c=await client('carol','two');
  a.send({t:'fantasyPartyRequest',command:{type:'create'}});await a.state(state=>!!state.id);
  a.send({t:'fantasyPartyRequest',command:{type:'invite',target:'carol'}});await a.error('not-found');
  a.send({t:'fantasyPartyRequest',command:{type:'invite',target:'bob'}});const invitation=(await b.state(state=>state.invitations.length===1))!.invitations[0];
  b.send({t:'fantasyPartyRequest',command:{type:'respond',invite:invitation.id,accept:true}});await a.state(state=>state.members.length===2);
  a.send({t:'fantasyPartyRequest',command:{type:'ready',quest,approach:'observe'}});await a.state(state=>state.members.find(member=>member.id==='alice')?.ready===true);
  a.send({t:'fantasyPartyRequest',command:{type:'start'}});await a.error('not-ready');
  const deniedAt=a.messages.length;a.send({t:'fantasyPartyRequest',command:{type:'ready',quest,approach:'observe',target:'bob'}});await a.error('invalid',deniedAt);
  b.send({t:'fantasyPartyRequest',command:{type:'ready',quest,approach:'analyze'}});await a.state(state=>state.canStart);
  a.send({t:'fantasyAction',revision:profiles.alice.revision,action:{type:'use',item:'potion'}});await until(()=>a.messages.find(message=>message.profile?.character?.inventory.potion===0));
  await a.state(state=>state.members.find(member=>member.id==='alice')?.ready===false&&state.members.find(member=>member.id==='bob')?.ready===true);
  const readyAgainAt=a.messages.length;a.send({t:'fantasyPartyRequest',command:{type:'ready',quest,approach:'observe'}});await until(()=>a.messages.slice(readyAgainAt).find(message=>message.state?.canStart));
  a.send({t:'fantasyPartyRequest',command:{type:'start'}});
  const ownA=await until(()=>a.messages.find(message=>message.profile?.activity?.action.type==='investigate')?.profile),ownB=await until(()=>b.messages.find(message=>message.profile?.activity?.action.type==='investigate')?.profile);
  assert.equal(ownA.character!.name,'Secret-alice');assert.equal(ownB.character!.name,'Secret-bob');assert.equal(ownA.activity!.endsAt,ownB.activity!.endsAt);
  for(const [client,id] of [[a,'alice'],[b,'bob'],[c,'carol']] as const){
    for(const message of client.messages.filter(message=>message.t==='fantasyProfile'))assert.equal(message.profile!.character!.name,`Secret-${id}`);
    for(const message of client.messages.filter(message=>message.t==='fantasyPartyState'))for(const secret of ['Secret-','main-night','oldwatch','inventory','voyageDecisions'])assert.ok(!JSON.stringify(message.state).includes(secret));
  }
  const leftAt=a.messages.length;b.send({t:'leave'});await until(()=>a.messages.slice(leftAt).find(message=>message.state?.members.length===1));
});
