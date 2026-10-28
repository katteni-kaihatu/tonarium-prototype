import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { COMPAT_VERSION, dmKey } from '../shared/protocol.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import type { FantasyProfile } from '../shared/fantasy.ts';
import type { FantasyAccountResponse } from '../shared/fantasy-account.ts';
import { readFantasySavedProfiles } from './fantasy-test-saved-profiles.ts';
import { testServerEnv } from './test-db.ts';
import { devLogin } from './test-auth.ts';

interface Message {t:string;profile?:FantasyProfile;account?:FantasyAccountResponse['account'];activeId?:string;homeId?:string;user?:{id:string;name:string};error?:string;[key:string]:unknown}
const privateTypes=new Set(['fantasyProfile','fantasyRealmState','fantasyContractBoard','fantasyPartyState','fantasyPropertyState','fantasyCombatState','fantasyLegacies','fantasyGmReply','fantasyDialogueChunk','communityState','npcReply']);
const password='A world only password 123',newPassword='A rotated world password 456';

async function isolated(t:TestContext){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tonarium-account-ws-')),file=path.join(directory,'fantasy.json');
  const legacy=applyFantasyAction(newFantasyProfile(),{type:'create',name:'PRIVATE_LEGACY_HERO',source:'human',gender:'female'},()=>.5).profile;
  legacy.character!.gold=98765;fs.writeFileSync(file,JSON.stringify({'legacy-browser-id':legacy}));
  fs.writeFileSync(path.join(directory,'fantasy-clock.json'),JSON.stringify({version:1,hour:legacy.character!.hour,wallTime:Date.now()+3600_000}));
  const sessions=path.join(directory,'sessions.json');fs.writeFileSync(sessions,JSON.stringify({name:'Account fixture',sessions:[{id:'account-world',name:'Private fixture world',world:'fantasy'}]}));
  const probe=net.createServer();await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=(probe.address() as net.AddressInfo).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
  const child=spawn(process.execPath,['--import','tsx','server/index.ts','--dev'],{env:{...process.env, ...(await testServerEnv(t)), TONARIUM_TEST_HELLO_ID: '1',AUTH_DEV_LOGIN:'1',NODE_ENV:'test',FANTASY_ACCOUNT_TEST_BYPASS:'0',SERVER_PORT:String(port),DATA_DIR:directory,SESSIONS_FILE:sessions,LIVEKIT_URL:'',LIVEKIT_API_KEY:'',LIVEKIT_API_SECRET:'',KOKOAAI_APIKEY: ''},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',data=>{logs+=String(data);});child.stderr.on('data',data=>{logs+=String(data);});
  const sockets:WebSocket[]=[];
  t.after(async()=>{
    for(const socket of sockets)socket.terminate();
    if(child.exitCode===null&&!child.signalCode){child.kill();await new Promise<void>(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},4000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}
    const root=path.resolve(os.tmpdir()),target=path.resolve(directory),relative=path.relative(root,target);
    assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&path.basename(target).startsWith('tonarium-account-ws-'));
    fs.rmSync(target,{recursive:true,force:true});
  });
  await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error(`Account fixture startup timed out: ${logs}`)),20000);
    const inspect=()=>{if(logs.includes('server on')){clearTimeout(timer);child.stdout.off('data',inspect);resolve();}};
    child.stdout.on('data',inspect);child.once('exit',()=>{clearTimeout(timer);reject(Error(`Account fixture exited: ${logs}`));});inspect();
  });
  const origin=`http://127.0.0.1:${port}`;
  async function http(action:string,body?:unknown,cookie=''){
    const response=await fetch(`${origin}/api/fantasy/account/${action}`,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return{status:response.status,body:await response.json() as FantasyAccountResponse,cookie:response.headers.get('set-cookie')?.split(';')[0]??''};
  }
  async function peer(id:string,options:{cookie?:string;origin?:string;hello?:boolean;name?:string}={}){
    const socket=new WebSocket(`ws://127.0.0.1:${port}/ws`,{headers:{Origin:options.origin??origin,...(options.cookie?{Cookie:options.cookie}:{})}});sockets.push(socket);
    const messages:Message[]=[];socket.on('message',raw=>messages.push(JSON.parse(String(raw)) as Message));
    await new Promise<void>((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
    const send=(message:unknown)=>socket.send(JSON.stringify(message));
    const wait=(predicate:(message:Message)=>boolean,from=0,timeout=8000)=>new Promise<Message>((resolve,reject)=>{
      const current=messages.slice(from).find(predicate);if(current){resolve(current);return;}
      const timer=setTimeout(()=>{socket.off('message',inspect);reject(Error(`Account fixture message timed out; observed ${messages.slice(from).map(message=>message.t).join(',')}; ${logs}`));},timeout);
      const inspect=()=>{const found=messages.slice(from).find(predicate);if(found){clearTimeout(timer);socket.off('message',inspect);resolve(found);}};socket.on('message',inspect);inspect();
    });
    const barrier=()=>new Promise<void>((resolve,reject)=>{
      const marker=Buffer.from(crypto.randomUUID()),timer=setTimeout(()=>{socket.off('pong',done);reject(Error('WebSocket barrier timed out'));},5000);
      const done=(data:Buffer)=>{if(data.equals(marker)){clearTimeout(timer);socket.off('pong',done);resolve();}};socket.on('pong',done);socket.ping(marker);
    });
    if(options.hello!==false){send({t:'hello',compat: COMPAT_VERSION,id,name:options.name??`Guest ${id}`});await wait(message=>message.t==='snapshot');}
    return{socket,messages,send,wait,barrier,id};
  }
  const profile=(id:string)=>readFantasySavedProfiles(file)[id];
  return{http,peer,profile,legacy,origin};
}

test('world accounts deny anonymous legacy IDs, forged reserved identities, wrong tickets and cookie-only cross-origin sockets',{timeout:30000},async t=>{
  const fixture=await isolated(t),anonymous=await fixture.peer('legacy-browser-id');
  anonymous.send({t:'join',sid:'account-world'});anonymous.send({t:'fantasyAction',revision:fixture.legacy.revision,action:{type:'sync'}});anonymous.send({t:'fantasyRealmRequest',domain:'economy',command:{type:'sync'}});anonymous.send({t:'fantasyContracts'});await anonymous.barrier();
  assert.deepEqual(anonymous.messages.filter(message=>privateTypes.has(message.t)),[]);assert.ok(!JSON.stringify(anonymous.messages).includes('PRIVATE_LEGACY_HERO'));
  const registered=await fixture.http('register',{username:'world_owner',password});assert.equal(registered.status,200);assert.ok(registered.body.account);
  const forged=await fixture.peer(registered.body.account.principal,{hello:false});forged.send({t:'hello',compat: COMPAT_VERSION,id:registered.body.account.principal,name:'Forged owner'});forged.send({t:'join',sid:'account-world'});forged.send({t:'fantasyAction',revision:0,action:{type:'sync'}});await forged.barrier();assert.deepEqual(forged.messages.filter(message=>privateTypes.has(message.t)),[]);
  const cross=await fixture.peer('other-browser',{cookie:registered.cookie,origin:'https://other-origin.invalid'});cross.send({t:'join',sid:'account-world'});await cross.barrier();
  assert.ok(cross.messages.some(message=>message.t==='fantasyAccountState'&&message.account===null));assert.deepEqual(cross.messages.filter(message=>privateTypes.has(message.t)),[]);
  const start=cross.messages.length;cross.send({t:'fantasyAccountBind',ticket:'x'.repeat(43)});await cross.barrier();assert.ok(cross.messages.slice(start).some(message=>message.t==='fantasyAccountState'&&message.error==='unauthenticated'));assert.deepEqual(cross.messages.filter(message=>privateTypes.has(message.t)),[]);
  assert.equal(fixture.profile('legacy-browser-id').character!.gold,98765);assert.equal(fixture.profile('legacy-browser-id').character!.name,'PRIVATE_LEGACY_HERO');
});

test('world accounts preserve separate Tonarium friends, DMs, groups, profiles and online identities for same-cookie tabs',{timeout:30000},async t=>{
  // ホームの本人はログインで決まる。2 人が同じ fantasy のアカウントで遊んでも、フォロー・DM・グループ・プロフィールはそれぞれのアカウントに残る
  const alice='Common Alice',bob='Common Bob',friend='Common Friend',newFriend='New Friend';
  const fixture=await isolated(t);
  const [aliceLogin,bobLogin,friendLogin,newLogin]=await Promise.all([alice,bob,friend,newFriend].map(name=>devLogin(fixture.origin,name)));
  const aliceId=aliceLogin.id,bobId=bobLogin.id,friendId=friendLogin.id,newId=newLogin.id;
  const observer=await fixture.peer(friendId,{cookie:friendLogin.headers.Cookie});
  const first=await fixture.peer(aliceId,{cookie:aliceLogin.headers.Cookie});
  const second=await fixture.peer(bobId,{cookie:bobLogin.headers.Cookie});
  for(const [from,to] of [[observer,aliceId],[observer,bobId],[first,friendId],[second,friendId]] as const)from.send({t:'followUser',to,on:true});
  await observer.wait(message=>message.t==='friends'&&Array.isArray(message.ids)&&message.ids.includes(aliceId)&&message.ids.includes(bobId));
  first.send({t:'join',sid:'account-world'});await first.barrier();
  const registered=await fixture.http('register',{username:'common_scope',password}),principal=registered.body.account!.principal;
  first.send({t:'fantasyAccountBind',ticket:registered.body.ticket});await first.wait(message=>message.t==='fantasyAccountState'&&message.activeId===principal);
  const status=await fixture.http('status',undefined,registered.cookie);
  second.send({t:'join',sid:'account-world'});await second.barrier();second.send({t:'fantasyAccountBind',ticket:status.body.ticket});await second.wait(message=>message.t==='fantasyAccountState'&&message.activeId===principal);await second.barrier();
  const peopleAt=observer.messages.length;second.send({t:'setStatus',status:'busy',text:'Bob only status'});
  const people=await observer.wait(message=>message.t==='people'&&Array.isArray(message.list)&&(message.list as {id:string;status:string}[]).some(person=>person.id===bobId&&person.status==='busy'),peopleAt);
  for(const id of [aliceId,bobId])assert.equal((people.list as {id:string;lastSeen:number|null}[]).find(person=>person.id===id)?.lastSeen,null);
  assert.notEqual((people.list as {id:string;status:string}[]).find(person=>person.id===aliceId)?.status,'busy');
  const groupAt=observer.messages.length;first.send({t:'groupCreate',name:'Alice own group',color:'#abcdef'});
  await observer.wait(message=>message.t==='groups'&&Array.isArray(message.list)&&(message.list as {name:string;owner:string}[]).some(group=>group.name==='Alice own group'&&group.owner===aliceId),groupAt);
  second.send({t:'groupCreate',name:'Bob own group',color:'#abcdef'});
  await observer.wait(message=>message.t==='groups'&&Array.isArray(message.list)&&(message.list as {name:string;owner:string}[]).some(group=>group.name==='Bob own group'&&group.owner===bobId),groupAt);
  const newcomer=await fixture.peer(newId,{cookie:newLogin.headers.Cookie});const friendAt=newcomer.messages.length;
  first.send({t:'followUser',to:newId,on:true});
  const invitation=await newcomer.wait(message=>message.t==='followed',friendAt);assert.equal(invitation.from,aliceId);assert.equal(invitation.fromName,alice);
  const aliceFriendsAt=first.messages.length,bobPrivateAt=second.messages.length;newcomer.send({t:'followUser',to:aliceId,on:true});
  const followed=await first.wait(message=>message.t==='followed'&&message.from===newId,aliceFriendsAt);assert.equal(followed.fromName,newFriend);
  await first.wait(message=>message.t==='friends'&&Array.isArray(message.ids)&&message.ids.includes(newId),aliceFriendsAt);
  await first.wait(message=>message.t==='follows'&&Array.isArray(message.following)&&message.following.includes(newId)&&Array.isArray(message.followers)&&message.followers.includes(newId),aliceFriendsAt);await second.barrier();
  assert.ok(!second.messages.slice(bobPrivateAt).some(message=>message.t==='friends'&&Array.isArray(message.ids)&&message.ids.includes(newId)));
  assert.ok(!second.messages.slice(bobPrivateAt).some(message=>message.t==='followed'&&message.from===newId));
  for(const message of second.messages.slice(bobPrivateAt).filter(message=>message.t==='follows')) {
    assert.ok(Array.isArray(message.following)&&!message.following.includes(newId));
    assert.ok(Array.isArray(message.followers)&&!message.followers.includes(newId));
  }
  const conv=dmKey(aliceId,newId),incoming='ALICE_ONLY_PRIVATE_MESSAGE',outgoing='ALICE_ONLY_PRIVATE_REPLY';
  const aliceDmAt=first.messages.length,newcomerDmAt=newcomer.messages.length;newcomer.send({t:'msg',conv,text:incoming});
  await first.wait(message=>message.t==='msg'&&(message.m as {text?:string})?.text===incoming,aliceDmAt);first.send({t:'msg',conv,text:outgoing});
  const answer=await newcomer.wait(message=>message.t==='msg'&&(message.m as {text?:string})?.text===outgoing,newcomerDmAt);assert.equal((answer.m as {from:string}).from,aliceId);await second.barrier();
  assert.ok(!JSON.stringify(second.messages.slice(bobPrivateAt)).includes(incoming));assert.ok(!JSON.stringify(second.messages.slice(bobPrivateAt)).includes(outgoing));
  assert.equal(first.messages.slice(aliceDmAt).filter(message=>message.t==='msg'&&(message.m as {text?:string})?.text===incoming).length,1);
  const profileResponse=await fetch(`${fixture.origin}/profile`,{method:'POST',headers:{'Content-Type':'application/json',...aliceLogin.headers},body:JSON.stringify({bio:'Alice original profile'})});assert.equal(profileResponse.ok,true);
  const updatedAt=first.messages.length;first.send({t:'profileUpdated'});await first.wait(message=>message.t==='users'&&Array.isArray(message.list)&&(message.list as {id:string;bio:string}[]).some(user=>user.id===principal&&user.bio==='Alice original profile'),updatedAt);
  const firstLeaveAt=first.messages.length,secondLeaveAt=second.messages.length;first.send({t:'leave'});
  const restoredAlice=await first.wait(message=>message.t==='fantasyAccountState'&&message.activeId===aliceId,firstLeaveAt),restoredBob=await second.wait(message=>message.t==='fantasyAccountState'&&message.activeId===bobId,secondLeaveAt);
  assert.equal(restoredAlice.user?.name,alice);assert.equal((restoredAlice.user as {bio?:string})?.bio,'Alice original profile');assert.equal(restoredBob.user?.name,bob);assert.equal((restoredBob.user as {status?:string})?.status,'busy');assert.notEqual((restoredBob.user as {bio?:string})?.bio,'Alice original profile');
});

test('authenticated world ownership survives device changes and leaving restores home identity while revoked bindings receive no private state',{timeout:30000},async t=>{
  const fixture=await isolated(t),first=await fixture.peer('home-device-one');first.send({t:'join',sid:'account-world'});await first.barrier();
  const registered=await fixture.http('register',{username:'stable_owner',password});assert.equal(registered.status,200);const principal=registered.body.account!.principal;
  first.send({t:'fantasyAccountBind',ticket:registered.body.ticket});await first.wait(message=>message.t==='fantasyAccountState'&&message.activeId===principal&&message.account?.id===registered.body.account!.id);const empty=(await first.wait(message=>message.t==='fantasyProfile')).profile!;
  const createdAt=first.messages.length;first.send({t:'fantasyAction',revision:empty.revision,action:{type:'create',name:'Stable world hero',source:'human',gender:'female'}});
  const created=(await first.wait(message=>message.t==='fantasyProfile'&&message.profile?.character?.name==='Stable world hero',createdAt)).profile!;assert.ok(fixture.profile(principal).character);
  const leaving=first.messages.length;first.send({t:'leave'});const firstHome=await first.wait(message=>message.t==='fantasyAccountState'&&message.activeId==='home-device-one',leaving);
  assert.equal(firstHome.homeId,'home-device-one');assert.equal(firstHome.user?.name,'Guest home-device-one');
  first.send({t:'join',sid:'account-world'});await first.wait(message=>message.t==='fantasyAccountState'&&message.activeId===principal,leaving);await first.barrier();
  const login=await fixture.http('login',{username:'stable_owner',password});assert.equal(login.status,200);assert.equal(login.body.account!.principal,principal);
  await first.barrier();const revokedStart=first.messages.length;
  const second=await fixture.peer('home-device-two');second.send({t:'join',sid:'account-world'});await second.barrier();second.send({t:'fantasyAccountBind',ticket:login.body.ticket});
  const deviceIdentity=await second.wait(message=>message.t==='fantasyAccountState'&&message.activeId===principal&&!!message.account);assert.equal(deviceIdentity.user?.name,'Guest home-device-two');
  const resumed=(await second.wait(message=>message.t==='fantasyProfile'&&message.profile?.character?.name==='Stable world hero')).profile!;assert.equal(resumed.character!.lifeStartedAt,created.character!.lifeStartedAt);assert.equal(resumed.character!.race,created.character!.race);
  const restAt=second.messages.length;second.send({t:'fantasyAction',revision:resumed.revision,action:{type:'rest'}});await second.wait(message=>message.t==='fantasyProfile'&&!!message.profile?.activity,restAt);await first.barrier();assert.deepEqual(first.messages.slice(revokedStart).filter(message=>privateTypes.has(message.t)),[]);
  first.send({t:'fantasyAction',revision:created.revision,action:{type:'sync'}});await first.barrier();assert.deepEqual(first.messages.slice(revokedStart).filter(message=>privateTypes.has(message.t)),[]);
  const rotated=await fixture.http('password',{password,newPassword},login.cookie);assert.equal(rotated.status,200);
  const beforeDenied=second.messages.length;second.send({t:'fantasyAction',revision:resumed.revision,action:{type:'sync'}});await second.barrier();assert.deepEqual(second.messages.slice(beforeDenied).filter(message=>privateTypes.has(message.t)),[]);
  const rebindAt=second.messages.length;second.send({t:'fantasyAccountBind',ticket:rotated.body.ticket});await second.wait(message=>message.t==='fantasyAccountState'&&message.activeId===principal,rebindAt);await second.wait(message=>message.t==='fantasyProfile'&&message.profile?.character?.name==='Stable world hero',rebindAt);
  const secondLeaveAt=second.messages.length;second.send({t:'leave'});
  const secondHome=await second.wait(message=>message.t==='fantasyAccountState'&&message.activeId==='home-device-two',secondLeaveAt);
  assert.equal(secondHome.homeId,'home-device-two');assert.equal(secondHome.user?.id,'home-device-two');assert.equal(secondHome.user?.name,'Guest home-device-two');assert.notEqual(secondHome.user?.name,firstHome.user?.name);
  const secondReturnAt=second.messages.length;second.send({t:'join',sid:'account-world'});await second.wait(message=>message.t==='fantasyAccountState'&&message.activeId===principal,secondReturnAt);await second.wait(message=>message.t==='fantasyProfile'&&message.profile?.character?.name==='Stable world hero',secondReturnAt);await second.barrier();
  assert.equal((await fixture.http('logout',{},rotated.cookie)).status,200);
  const logoutAt=second.messages.length;second.send({t:'fantasyAction',revision:resumed.revision,action:{type:'sync'}});await second.barrier();assert.deepEqual(second.messages.slice(logoutAt).filter(message=>privateTypes.has(message.t)),[]);
  assert.equal((await fixture.http('status',undefined,rotated.cookie)).body.account,null);assert.equal(fixture.profile(principal).character!.name,'Stable world hero');
});
