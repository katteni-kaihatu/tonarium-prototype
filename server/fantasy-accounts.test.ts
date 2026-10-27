import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { FantasyAccounts } from './fantasy-accounts.ts';
import type { FantasyAccountResponse } from '../shared/fantasy-account.ts';

const password='a secure test password', replacement='a different test password';
const legacyTarget='fantasy:12345678-1234-4234-8234-123456789abc';
const removeTemporary=(directory:string)=>{const root=path.resolve(os.tmpdir()),target=path.resolve(directory),relative=path.relative(root,target);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&path.basename(target).startsWith('tonarium-accounts-'));fs.rmSync(target,{recursive:true,force:true});};
interface Reply {status:number;body:FantasyAccountResponse;headers:Record<string,string>}
function temporary(options:Partial<ConstructorParameters<typeof FantasyAccounts>[0]>={}){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tonarium-accounts-'));
  return{directory,file:path.join(directory,'fantasy-accounts.json'),store:new FantasyAccounts({file:path.join(directory,'fantasy-accounts.json'),...options})};
}
async function request(store:FantasyAccounts,action:string,body:unknown={},cookie='',extra:{method?:string;origin?:string;host?:string;address?:string;secure?:boolean;type?:string;forwarded?:string;proto?:string}={}):Promise<Reply>{
  const stream=new PassThrough(),headers:Record<string,string>={};let status=0,output='',ended=false;
  const req=Object.assign(stream,{url:`/api/fantasy/account/${action}`,method:extra.method??(action==='status'?'GET':'POST'),headers:{host:extra.host??'localhost:3011',origin:extra.origin??'http://localhost:3011','content-type':extra.type??'application/json',...(cookie?{cookie}:{}),...(extra.forwarded?{'x-forwarded-for':extra.forwarded}:{}),...(extra.proto?{'x-forwarded-proto':extra.proto}:{})},socket:{remoteAddress:extra.address??'127.0.0.1',encrypted:extra.secure}}) as unknown as IncomingMessage;
  const res={destroyed:false,get writableEnded(){return ended;},setHeader:(key:string,value:string)=>{headers[key.toLowerCase()]=value;},writeHead:(value:number,values:Record<string,string>)=>{status=value;for(const[key,item]of Object.entries(values))headers[key.toLowerCase()]=item;},end:(value:string)=>{output=value;ended=true;}} as unknown as ServerResponse;
  const pending=store.handleHttp(req,res);stream.end(JSON.stringify(body));assert.equal(await pending,true);
  return{status,body:JSON.parse(output) as FantasyAccountResponse,headers};
}
const cookie=(reply:Reply)=>reply.headers['set-cookie']?.split(';')[0]??'';
const bindingReq=(value:string)=>({headers:{host:'localhost:3011',cookie:value},socket:{remoteAddress:'127.0.0.1'}} as IncomingMessage);

test('world accounts store only salted credentials and opaque session/recovery hashes',async()=>{
  const state=temporary();try{
    const result=await request(state.store,'register',{username:'World_User',password});
    assert.equal(result.status,200);assert.equal(result.body.account?.username,'world_user');assert.ok(result.body.account?.principal.startsWith('fantasy:'));
    assert.ok(result.body.recoveryCode);assert.ok(result.body.ticket);assert.match(result.headers['set-cookie'],/HttpOnly; SameSite=Strict/);assert.match(result.headers['set-cookie'],/Path=\//);
    const serialized=fs.readFileSync(state.file,'utf8');assert.ok(!serialized.includes(password));assert.ok(!serialized.includes(result.body.recoveryCode!));assert.ok(!serialized.includes(cookie(result).split('=')[1]));
    const binding=state.store.consumeTicket(result.body.ticket!);assert.ok(binding);assert.equal(state.store.consumeTicket(result.body.ticket!),undefined);assert.equal(state.store.bindingCurrent(binding),true);
    const resumed=await request(state.store,'status',{},cookie(result));assert.equal(resumed.body.account?.id,result.body.account?.id);assert.ok(resumed.body.ticket);
    const restarted=new FantasyAccounts({file:state.file});assert.equal(restarted.readSession(bindingReq(cookie(result)))?.id,result.body.account?.id);
    assert.equal((await request(state.store,'login',{username:'WORLD_USER',password:'wrong password'})).body.error,'invalid-credentials');
  }finally{removeTemporary(state.directory);}
});

test('new login, password rotation, logout and recovery invalidate existing world socket bindings',async()=>{
  const state=temporary();try{
    const registered=await request(state.store,'register',{username:'owner',password}),first=state.store.consumeTicket(registered.body.ticket!)!;
    const login=await request(state.store,'login',{username:'owner',password}),second=state.store.consumeTicket(login.body.ticket!)!;
    assert.equal(state.store.bindingCurrent(first),false);assert.equal(state.store.bindingCurrent(second),true);
    const changed=await request(state.store,'password',{password,newPassword:replacement},cookie(login)),third=state.store.consumeTicket(changed.body.ticket!)!;
    assert.equal(changed.status,200);assert.equal(state.store.bindingCurrent(second),false);assert.equal(state.store.bindingCurrent(third),true);
    const recovered=await request(state.store,'recover',{username:'owner',recoveryCode:registered.body.recoveryCode,password});
    assert.equal(recovered.status,200);assert.equal(state.store.bindingCurrent(third),false);assert.notEqual(recovered.body.recoveryCode,registered.body.recoveryCode);
    const fourth=state.store.consumeTicket(recovered.body.ticket!)!;
    assert.equal((await request(state.store,'recover',{username:'owner',recoveryCode:registered.body.recoveryCode,password:replacement})).body.error,'invalid-credentials');
    const rotated=await request(state.store,'recovery',{password},cookie(recovered));assert.equal(rotated.status,200);assert.equal(state.store.bindingCurrent(fourth),false);
    const fifth=state.store.consumeTicket(rotated.body.ticket!)!;
    const loggedOut=await request(state.store,'logout',{},cookie(rotated));assert.equal(loggedOut.status,200);assert.equal(state.store.bindingCurrent(fifth),false);assert.match(loggedOut.headers['set-cookie'],/Max-Age=0/);
  }finally{removeTemporary(state.directory);}
});

test('one-time claims require a trusted operator code and adopt only a reserved migrated principal',async()=>{
  const state=temporary({canClaimLegacy:(account,legacy)=>account.principal.startsWith('fantasy:')&&legacy===legacyTarget});try{
    const registered=await request(state.store,'register',{username:'legacy_owner',password}),oldBinding=state.store.consumeTicket(registered.body.ticket!)!;
    assert.equal((await request(state.store,'claim',{code:'legacy-browser-id'},cookie(registered))).body.error,'invalid-claim');
    assert.throws(()=>state.store.issueLegacyClaim('legacy-browser-id'));
    const code=state.store.issueLegacyClaim(legacyTarget);assert.ok(!fs.readFileSync(state.file,'utf8').includes(code));
    const result=await request(state.store,'claim',{code},cookie(registered));assert.equal(result.status,200);assert.equal(result.body.account?.principal,legacyTarget);assert.equal(state.store.bindingCurrent(oldBinding),false);
    assert.equal(state.store.isPrincipal(legacyTarget),true);assert.ok(state.store.consumeTicket(result.body.ticket!));
    assert.equal((await request(state.store,'claim',{code},cookie(result))).body.error,'invalid-claim');assert.throws(()=>state.store.issueLegacyClaim(legacyTarget));
  }finally{removeTemporary(state.directory);}
});

test('origin, transport, JSON and bounded request validation reject account changes before persistence',async()=>{
  const state=temporary();try{
    assert.equal((await request(state.store,'register',{username:'owner',password},'',{origin:'https://attacker.invalid'})).body.error,'origin-denied');
    assert.equal((await request(state.store,'register',{username:'owner',password},'',{host:'game.example',origin:'http://game.example',address:'198.51.100.7'})).body.error,'secure-connection-required');
    assert.equal((await request(state.store,'register',{username:'owner',password},'',{type:'text/plain'})).status,415);
    assert.equal((await request(state.store,'register',{username:'owner',password:'x'.repeat(3000)})).body.error,'payload-too-large');
    assert.equal((await request(state.store,'register',{username:'ow',password})).body.error,'invalid');
    assert.equal((await request(state.store,'register',{username:'owner\n',password})).body.error,'invalid');
    assert.equal(fs.existsSync(state.file),false);
    const secure=await request(state.store,'register',{username:'secure_owner',password},'',{host:'game.example',origin:'https://game.example',address:'198.51.100.7',secure:true});
    assert.equal(secure.status,200);assert.match(secure.headers['set-cookie'],/^__Host-/);assert.match(secure.headers['set-cookie'],/; Secure$/);
  }finally{removeTemporary(state.directory);}
});

test('sessions and tickets expire and duplicate usernames cannot race registration',async()=>{
  let now=1000;const state=temporary({now:()=>now});try{
    const results=await Promise.all([request(state.store,'register',{username:'owner',password}),request(state.store,'register',{username:'OWNER',password})]);
    assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);const registered=results.find(result=>result.status===200)!;
    now+=60_001;assert.equal(state.store.consumeTicket(registered.body.ticket!),undefined);
    const status=await request(state.store,'status',{},cookie(registered));assert.ok(status.body.ticket);
    now+=30*86400_000;assert.equal(state.store.readSession(bindingReq(cookie(registered))),undefined);assert.equal(state.store.consumeTicket(status.body.ticket!),undefined);
  }finally{removeTemporary(state.directory);}
});

test('invalid and failed account storage remains intact and fails closed',async()=>{
  const state=temporary();try{
    fs.writeFileSync(state.file,'{"version":999}');const before=fs.readFileSync(state.file,'utf8');
    const broken=new FantasyAccounts({file:state.file});assert.equal(broken.loadError,'unavailable');assert.equal((await request(broken,'register',{username:'owner',password})).status,503);assert.equal(fs.readFileSync(state.file,'utf8'),before);
    const failed=temporary({save:()=>{throw Error('disk unavailable');}});try{assert.equal((await request(failed.store,'register',{username:'owner',password})).status,503);assert.equal(fs.existsSync(failed.file),false);}finally{removeTemporary(failed.directory);}
  }finally{removeTemporary(state.directory);}
});

test('trusted loopback proxies separate real clients while public forwarded headers cannot bypass rate limits',async()=>{
  const proxied=temporary({trustProxy:true}),direct=temporary({trustProxy:true});
  try{
    for(let index=0;index<10;index++)assert.equal((await request(proxied.store,'register',{username:`x${index}`,password},'',{host:'game.example',origin:'https://game.example',proto:'https',forwarded:'192.0.2.1, 198.51.100.1'})).status,400);
    assert.equal((await request(proxied.store,'register',{username:'xx',password},'',{host:'game.example',origin:'https://game.example',proto:'https',forwarded:'198.51.100.1'})).status,429);
    assert.equal((await request(proxied.store,'register',{username:'xy',password},'',{host:'game.example',origin:'https://game.example',proto:'https',forwarded:'198.51.100.2'})).status,400);
    for(let index=0;index<10;index++)assert.equal((await request(direct.store,'register',{username:`x${index}`,password},'',{host:'game.example',origin:'https://game.example',secure:true,address:'198.51.100.4',forwarded:`203.0.113.${index+1}`})).status,400);
    assert.equal((await request(direct.store,'register',{username:'xy',password},'',{host:'game.example',origin:'https://game.example',secure:true,address:'198.51.100.4',forwarded:'203.0.113.200'})).status,429);
  }finally{removeTemporary(proxied.directory);removeTemporary(direct.directory);}
});

test('explicit bridge proxy IPs support HTTPS cookies and normalize IPv4-mapped and IPv6 addresses',async()=>{
  const addresses=[
    {configured:'172.18.0.2',remote:'::ffff:172.18.0.2'},
    {configured:'::FFFF:ac12:0002',remote:'172.18.0.2'},
    {configured:'2001:0db8:0000:0000:0000:0000:0000:0002',remote:'2001:db8::2'},
  ];
  for(const{configured,remote}of addresses){
    const state=temporary({trustedProxyAddresses:[configured]});try{
      const extra={host:'game.example',origin:'https://game.example',address:remote,proto:'https',forwarded:'198.51.100.8'};
      const registered=await request(state.store,'register',{username:'bridge_owner',password},'',extra);
      assert.equal(registered.status,200);assert.match(registered.headers['set-cookie'],/^__Host-/);assert.match(registered.headers['set-cookie'],/; Secure$/);
      const resumed=await request(state.store,'status',{},cookie(registered),extra);assert.equal(resumed.body.account?.id,registered.body.account?.id);
      assert.equal((await request(state.store,'login',{username:'bridge_owner',password},'',{...extra,origin:'https://attacker.invalid'})).body.error,'origin-denied');
    }finally{removeTemporary(state.directory);}
  }
});

test('configured proxy CIDR ranges trust only bridge clients inside the range',async()=>{
  const state=temporary({trustedProxyAddresses:['172.18.0.0/16']});try{
    const inside={host:'game.example',origin:'https://game.example',address:'172.18.0.2',proto:'https',forwarded:'198.51.100.8'};
    const registered=await request(state.store,'register',{username:'bridge_owner',password},'',inside);
    assert.equal(registered.status,200);assert.match(registered.headers['set-cookie'],/^__Host-/);assert.match(registered.headers['set-cookie'],/; Secure$/);
    const resumed=await request(state.store,'status',{},cookie(registered),{...inside,address:'::ffff:172.18.0.2'});assert.equal(resumed.body.account?.id,registered.body.account?.id);
    const outside=await request(state.store,'register',{username:'bridge_owner2',password},'',{...inside,address:'172.19.0.2'});
    assert.equal(outside.status,403);assert.equal(outside.body.error,'secure-connection-required');assert.equal(outside.headers['set-cookie'],undefined);
    const plain=await request(state.store,'register',{username:'bridge_owner3',password},'',{...inside,proto:'http'});
    assert.equal(plain.status,403);assert.equal(plain.body.error,'secure-connection-required');
  }finally{removeTemporary(state.directory);}
});

test('configured IPv6 proxy CIDR ranges and forwarded rate limits follow the same trust',async()=>{
  const v6=temporary({trustedProxyAddresses:['2001:db8::/32']});try{
    const inside={host:'game.example',origin:'https://game.example',address:'2001:db8::2',proto:'https',forwarded:'198.51.100.8'};
    const registered=await request(v6.store,'register',{username:'bridge_owner',password},'',inside);
    assert.equal(registered.status,200);assert.match(registered.headers['set-cookie'],/; Secure$/);
    const outside=await request(v6.store,'register',{username:'bridge_owner2',password},'',{...inside,address:'2001:db9::2'});
    assert.equal(outside.status,403);assert.equal(outside.body.error,'secure-connection-required');
  }finally{removeTemporary(v6.directory);}
  const proxied=temporary({trustedProxyAddresses:['172.18.0.0/16']});try{
    const extra={host:'game.example',origin:'https://game.example',proto:'https',address:'172.18.0.9'};
    for(let index=0;index<10;index++)assert.equal((await request(proxied.store,'register',{username:`x${index}`,password},'',{...extra,forwarded:'198.51.100.1'})).status,400);
    assert.equal((await request(proxied.store,'register',{username:'xx',password},'',{...extra,forwarded:'198.51.100.1'})).status,429);
    assert.equal((await request(proxied.store,'register',{username:'xy',password},'',{...extra,forwarded:'198.51.100.2'})).status,400);
  }finally{removeTemporary(proxied.directory);}
});

test('unconfigured bridge clients and invalid proxy specifications cannot spoof forwarded HTTPS',async()=>{
  const configurations=[{}, {trustProxy:true}, {trustedProxyAddresses:['172.18.0.3']},
    {trustedProxyAddresses:['172.18.0.0/0','0.0.0.0/0','172.18.0.0/33','172.18.0.0/','172.18.*','proxy.internal','*','172.18.0.2\n']}];
  for(const options of configurations){
    const state=temporary(options);try{
      const denied=await request(state.store,'register',{username:'bridge_owner',password},'',{host:'game.example',origin:'https://game.example',address:'172.18.0.2',proto:'https',forwarded:'127.0.0.1'});
      assert.equal(denied.status,403);assert.equal(denied.body.error,'secure-connection-required');assert.equal(denied.headers['set-cookie'],undefined);assert.equal(fs.existsSync(state.file),false);
    }finally{removeTemporary(state.directory);}
  }
  const trusted=temporary({trustedProxyAddresses:['172.18.0.2']});try{
    assert.equal((await request(trusted.store,'register',{username:'bridge_owner',password},'',{host:'game.example',origin:'https://game.example',address:'172.18.0.2',proto:'https, http'})).body.error,'secure-connection-required');
  }finally{removeTemporary(trusted.directory);}
});

test('vetted bridge proxies separate rate limits by the last forwarded IP while untrusted clients cannot rotate headers',async()=>{
  const proxied=temporary({trustedProxyAddresses:['172.18.0.2']}),direct=temporary({trustedProxyAddresses:['172.18.0.2']});
  try{
    const extra={host:'game.example',origin:'https://game.example',proto:'https',address:'172.18.0.2'};
    for(let index=0;index<10;index++)assert.equal((await request(proxied.store,'register',{username:`x${index}`,password},'',{...extra,forwarded:`203.0.113.${index+1}, 198.51.100.1`})).status,400);
    assert.equal((await request(proxied.store,'register',{username:'xx',password},'',{...extra,forwarded:'203.0.113.200, ::ffff:198.51.100.1'})).status,429);
    assert.equal((await request(proxied.store,'register',{username:'xy',password},'',{...extra,forwarded:'198.51.100.2'})).status,400);
    for(let index=0;index<10;index++)assert.equal((await request(direct.store,'register',{username:`x${index}`,password},'',{...extra,secure:true,address:'172.18.0.3',forwarded:`198.51.100.${index+1}`})).status,400);
    assert.equal((await request(direct.store,'register',{username:'xy',password},'',{...extra,secure:true,address:'172.18.0.3',forwarded:'198.51.100.200'})).status,429);
  }finally{removeTemporary(proxied.directory);removeTemporary(direct.directory);}
});
