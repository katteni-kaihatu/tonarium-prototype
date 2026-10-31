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
import { readFantasySavedProfiles } from './fantasy-test-saved-profiles.ts';
import { testServerEnv } from './test-db.ts';
import { devLogin } from './test-auth.ts';

interface Message {t:string;profile?:FantasyProfile;user?:{id:string;name:string};error?:string;[key:string]:unknown}
const privateTypes=new Set(['fantasyProfile','fantasyRealmState','fantasyContractBoard','fantasyPartyState','fantasyPropertyState','fantasyCombatState','fantasyLegacies','fantasyGmReply','fantasyDialogueChunk','communityState','npcReply']);

async function isolated(t:TestContext){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tonarium-account-ws-')),file=path.join(directory,'fantasy.json');
  const legacy=applyFantasyAction(newFantasyProfile(),{type:'create',name:'PRIVATE_LEGACY_HERO',source:'human',gender:'female'},()=>.5).profile;
  legacy.character!.gold=98765;fs.writeFileSync(file,JSON.stringify({'legacy-browser-id':legacy}));
  fs.writeFileSync(path.join(directory,'fantasy-clock.json'),JSON.stringify({version:1,hour:legacy.character!.hour,wallTime:Date.now()+3600_000}));
  const sessions=path.join(directory,'sessions.json');fs.writeFileSync(sessions,JSON.stringify({name:'Account fixture',sessions:[{id:'account-world',name:'Private fixture world',world:'fantasy'}]}));
  const probe=net.createServer();await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=(probe.address() as net.AddressInfo).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
  const databaseEnv=await testServerEnv(t);
  const child=spawn(process.execPath,['--import','tsx','server/index.ts','--dev'],{env:{...process.env, ...databaseEnv, TONARIUM_TEST_HELLO_ID: '0',AUTH_DEV_LOGIN:'1',NODE_ENV:'test',SERVER_PORT:String(port),DATA_DIR:directory,SESSIONS_FILE:sessions,LIVEKIT_URL:'',LIVEKIT_API_KEY:'',LIVEKIT_API_SECRET:'',KOKOAAI_APIKEY: ''},stdio:['ignore','pipe','pipe']});
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
    return{status:response.status,body:await response.json() as {error?:string},cookie:response.headers.get('set-cookie')?.split(';')[0]??''};
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
  return{http,peer,profile,legacy,origin,databaseUrl:databaseEnv.DATABASE_URL};
}


test('platform login owns RPG data and hello IDs or obsolete world tickets cannot select an owner',{timeout:30000},async t=>{
  const f=await isolated(t), alice=await devLogin(f.origin,'Platform Alice'),bob=await devLogin(f.origin,'Platform Bob');
  const owner=await f.peer('FORGED_BROWSER_ID',{cookie:alice.headers.Cookie,name:'Forged name'});
  assert.ok(JSON.stringify(owner.messages).includes(alice.id));
  assert.ok(!JSON.stringify(owner.messages).includes('PRIVATE_LEGACY_HERO'));
  assert.deepEqual(owner.messages.filter(message=>privateTypes.has(message.t)),[]);
  owner.send({t:'join',sid:'account-world'});
  const initial=(await owner.wait(message=>message.t==='fantasyProfile')).profile!;
  const from=owner.messages.length;
  owner.send({t:'fantasyAction',revision:initial.revision,action:{type:'create',name:'PRIVATE_ALICE_HERO',source:'human',gender:'female'}});
  await owner.wait(message=>message.t==='fantasyProfile'&&message.profile?.character?.name==='PRIVATE_ALICE_HERO',from);
  const other=await f.peer(alice.id,{cookie:bob.headers.Cookie});
  other.send({t:'join',sid:'account-world'});
  const own=(await other.wait(message=>message.t==='fantasyProfile')).profile!;
  assert.equal(own.character,null);
  const attempted=other.messages.length;
  other.send({t:'fantasyAccountBind',ticket:'x'.repeat(43)});
  other.send({t:'fantasyAccountUnbind'});
  other.send({t:'hello',compat:COMPAT_VERSION,id:alice.id,name:'Impersonated Alice'});
  await other.barrier();
  assert.ok(!JSON.stringify(other.messages).includes('PRIVATE_ALICE_HERO'));
  assert.ok(!other.messages.slice(attempted).some(message=>message.t==='fantasyAccountState'));
  other.send({t:'fantasyAction',revision:own.revision,action:{type:'sync'}});await other.barrier();
  assert.ok(!JSON.stringify(other.messages).includes('PRIVATE_ALICE_HERO'));
  assert.equal(f.profile(alice.id).character!.name,'PRIVATE_ALICE_HERO');
  assert.equal(f.profile('FORGED_BROWSER_ID'),undefined);
  assert.equal(f.profile('legacy-browser-id'),undefined);
});

test('unauthenticated, stale platform cookies and cross-origin sockets receive no private RPG data',{timeout:30000},async t=>{
  const f=await isolated(t), login=await devLogin(f.origin,'Protected Alice');
  for(const cookie of ['', 'tonarium_fantasy_session=obsolete', 'tonarium_session=forged']){
    const peer=await f.peer(login.id,{cookie,hello:false});
    const closed=new Promise<number>(resolve=>peer.socket.once('close',code=>resolve(code)));
    peer.send({t:'hello',compat:COMPAT_VERSION,id:login.id,name:'Forged'});
    peer.send({t:'fantasyAccountBind',ticket:'x'.repeat(43)});
    assert.equal(await closed,4401);
    assert.deepEqual(peer.messages.filter(message=>privateTypes.has(message.t)),[]);
  }
  await assert.rejects(f.peer(login.id,{cookie:login.headers.Cookie,origin:'https://untrusted.invalid',hello:false}));
  const logout=await fetch(`${f.origin}/auth/logout`,{method:'POST',headers:{Origin:f.origin,Cookie:login.headers.Cookie}});
  assert.equal(logout.status,200);
  const stale=await f.peer(login.id,{cookie:login.headers.Cookie,hello:false});
  const closed=new Promise<number>(resolve=>stale.socket.once('close',code=>resolve(code)));
  stale.send({t:'hello',compat:COMPAT_VERSION,id:login.id,name:'Stale'});
  assert.equal(await closed,4401);
  assert.deepEqual(stale.messages.filter(message=>privateTypes.has(message.t)),[]);
  for(const action of ['status','register','login','logout','recover','password','recovery','claim'])
    assert.equal((await f.http(action,action==='status'?undefined:{})).status,410);
});

test('Tonarium friends, DMs and original identity remain account bound inside and outside RPG',{timeout:30000},async t=>{
  const f=await isolated(t),[alice,bob]=await Promise.all(['Social Alice','Social Bob'].map(name=>devLogin(f.origin,name)));
  const a=await f.peer('forged-a',{cookie:alice.headers.Cookie}),b=await f.peer('forged-b',{cookie:bob.headers.Cookie});
  a.send({t:'followUser',to:bob.id,on:true});b.send({t:'followUser',to:alice.id,on:true});
  await a.wait(message=>message.t==='friends'&&Array.isArray(message.ids)&&message.ids.includes(bob.id));
  a.send({t:'join',sid:'account-world'});await a.wait(message=>message.t==='fantasyProfile');
  const from=b.messages.length;
  a.send({t:'msg',conv:dmKey(alice.id,bob.id),text:'PLATFORM_PRIVATE_DM'});
  const dm=await b.wait(message=>message.t==='msg'&&JSON.stringify(message).includes('PLATFORM_PRIVATE_DM'),from);
  assert.ok(JSON.stringify(dm).includes(alice.id));
  assert.ok(!JSON.stringify(dm).includes('fantasy:'));
  const left=a.messages.length;a.send({t:'leave',requestId:'left'});
  await a.wait(message=>message.t==='sessionResult'&&message.requestId==='left',left);
  const denied=a.messages.length;a.send({t:'fantasyAction',revision:0,action:{type:'sync'}});await a.barrier();
  assert.deepEqual(a.messages.slice(denied).filter(message=>privateTypes.has(message.t)),[]);
  const after=b.messages.length;a.send({t:'msg',conv:dmKey(alice.id,bob.id),text:'HOME_PRIVATE_DM'});
  await b.wait(message=>message.t==='msg'&&JSON.stringify(message).includes('HOME_PRIVATE_DM'),after);
  assert.equal(dmKey(alice.id,bob.id),dmKey(bob.id,alice.id));
});

test('same Tonarium account resumes its character in another tab and guest accounts can play',{timeout:30000},async t=>{
  const f=await isolated(t),login=await devLogin(f.origin,'Resuming Owner');
  const first=await f.peer('device-one',{cookie:login.headers.Cookie});first.send({t:'join',sid:'account-world'});
  const initial=(await first.wait(message=>message.t==='fantasyProfile')).profile!;
  first.send({t:'fantasyAction',revision:initial.revision,action:{type:'create',name:'RESUMED_PLATFORM_HERO',source:'human',gender:'female'}});
  await first.wait(message=>message.t==='fantasyProfile'&&message.profile?.character?.name==='RESUMED_PLATFORM_HERO');
  const second=await f.peer('device-two',{cookie:login.headers.Cookie});
  await second.wait(message=>message.t==='fantasyProfile'&&message.profile?.character?.name==='RESUMED_PLATFORM_HERO');
  const response=await fetch(`${f.origin}/auth/guest`,{method:'POST',headers:{Origin:f.origin,'Content-Type':'application/json'},body:JSON.stringify({name:'Platform Guest'})});
  assert.equal(response.status,200);
  const cookie=response.headers.getSetCookie().find(value=>value.startsWith('tonarium_session='))!.split(';')[0];
  const guest=await f.peer(login.id,{cookie});guest.send({t:'join',sid:'account-world'});
  const profile=(await guest.wait(message=>message.t==='fantasyProfile')).profile!;
  assert.equal(profile.character,null);assert.ok(!JSON.stringify(guest.messages).includes('RESUMED_PLATFORM_HERO'));
});


test('logout closes only the revoked platform session and an open socket cannot continue RPG commands',{timeout:30000},async t=>{
  const f=await isolated(t),first=await devLogin(f.origin,'Revoked Owner'),second=await devLogin(f.origin,'Revoked Owner');
  const revoked=await f.peer(first.id,{cookie:first.headers.Cookie}),active=await f.peer(second.id,{cookie:second.headers.Cookie});
  revoked.send({t:'join',sid:'account-world'});const profile=(await revoked.wait(message=>message.t==='fantasyProfile')).profile!;
  const closed=new Promise<number>(resolve=>revoked.socket.once('close',code=>resolve(code)));
  const response=await fetch(`${f.origin}/auth/logout`,{method:'POST',headers:{Origin:f.origin,...first.headers}});
  assert.equal(response.status,200);
  if(revoked.socket.readyState===WebSocket.OPEN)revoked.send({t:'fantasyAction',revision:profile.revision,action:{type:'create',name:'REVOKED_SOCKET_HERO',source:'human',gender:'female'}});
  assert.equal(await Promise.race([closed,new Promise(resolve=>setTimeout(()=>resolve('still-open'),1000))]),4401);
  assert.equal(f.profile(first.id)?.character??null,null);
  const from=active.messages.length;active.send({t:'fantasyAction',revision:profile.revision,action:{type:'create',name:'VALID_SESSION_HERO',source:'human',gender:'female'}});
  await active.wait(message=>message.t==='fantasyProfile'&&message.profile?.character?.name==='VALID_SESSION_HERO',from);
});

test('external session revocation and expiration invalidate already-open platform sockets',{timeout:30000},async t=>{
  const f=await isolated(t);
  const {default:postgres}=await import('postgres');
  const sql=postgres(f.databaseUrl,{max:1,onnotice:()=>{}});t.after(()=>sql.end());
  const {createHash}=await import('node:crypto');
  for(const expired of [false,true]){
    const login=await devLogin(f.origin,expired?'Expired Owner':'Deleted Owner');
    const peer=await f.peer(login.id,{cookie:login.headers.Cookie});peer.send({t:'join',sid:'account-world'});
    const profile=(await peer.wait(message=>message.t==='fantasyProfile')).profile!;
    const hash=createHash('sha256').update(login.headers.Cookie.split('=')[1]).digest('hex');
    if(expired)await sql`update auth_sessions set expires_at = now() - interval '1 second' where token_hash = ${hash}`;
    else await sql`delete from auth_sessions where token_hash = ${hash}`;
    const closed=new Promise<number>(resolve=>peer.socket.once('close',code=>resolve(code)));
    peer.send({t:'fantasyAction',revision:profile.revision,action:{type:'create',name:'REVOKED_SOCKET_HERO',source:'human',gender:'female'}});
    assert.equal(await Promise.race([closed,new Promise(resolve=>setTimeout(()=>resolve('still-open'),1000))]),4401);
    assert.equal(f.profile(login.id)?.character??null,null);
  }
});


test('private updates revalidate a passive socket after its database session is revoked',{timeout:30000},async t=>{
  const f=await isolated(t),revokedLogin=await devLogin(f.origin,'Passive Owner'),activeLogin=await devLogin(f.origin,'Passive Owner');
  const revoked=await f.peer(revokedLogin.id,{cookie:revokedLogin.headers.Cookie}),active=await f.peer(activeLogin.id,{cookie:activeLogin.headers.Cookie});
  revoked.send({t:'join',sid:'account-world'});const profile=(await revoked.wait(message=>message.t==='fantasyProfile')).profile!;
  await revoked.barrier();const from=revoked.messages.length;
  const {default:postgres}=await import('postgres'),{createHash}=await import('node:crypto');
  const sql=postgres(f.databaseUrl,{max:1,onnotice:()=>{}});t.after(()=>sql.end());
  const hash=createHash('sha256').update(revokedLogin.headers.Cookie.split('=')[1]).digest('hex');
  await sql`delete from auth_sessions where token_hash = ${hash}`;
  const closed=new Promise<number>(resolve=>revoked.socket.once('close',code=>resolve(code)));
  active.send({t:'fantasyAction',revision:profile.revision,action:{type:'create',name:'VALID_PRIVATE_UPDATE',source:'human',gender:'female'}});
  await active.wait(message=>message.t==='fantasyProfile'&&message.profile?.character?.name==='VALID_PRIVATE_UPDATE');
  assert.equal(await Promise.race([closed,new Promise(resolve=>setTimeout(()=>resolve('still-open'),1000))]),4401);
  assert.ok(!JSON.stringify(revoked.messages.slice(from)).includes('VALID_PRIVATE_UPDATE'));
});
