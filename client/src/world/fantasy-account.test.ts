import test from 'node:test';
import assert from 'node:assert/strict';
import { fantasyAccountStatusNeedsBinding, requestFantasyAccount, validFantasyPassword, validFantasyUsername } from './fantasy-account.ts';

const account={id:'account-test',principal:'fantasy:account-test',username:'traveler_1'};
test('status checks do not rebind an already confirmed owner but detect changed ownership',()=>{
  const response={account,ticket:'unused-status-ticket'};
  assert.equal(fantasyAccountStatusNeedsBinding(account,true,response),false);
  assert.equal(fantasyAccountStatusNeedsBinding(account,false,response),true);
  assert.equal(fantasyAccountStatusNeedsBinding(null,false,response),true);
  assert.equal(fantasyAccountStatusNeedsBinding({...account,principal:'fantasy:old-owner'},true,response),true);
  assert.equal(fantasyAccountStatusNeedsBinding(account,true,{account:null}),false);
  assert.equal(fantasyAccountStatusNeedsBinding(account,true,{account:null,error:'unauthenticated'}),false);
});
test('world account inputs enforce bounded ASCII IDs and password length without trimming secrets',()=>{
  for(const value of ['abc','Traveler_1','a'.repeat(24)])assert.equal(validFantasyUsername(value),true,value);
  for(const value of ['ab','a'.repeat(25),'한글아이디','name-space','user.name','name\n',' name','name ','name\0'])assert.equal(validFantasyUsername(value),false,value);
  for(const value of ['x'.repeat(10),' x'.repeat(5),'x'.repeat(128)])assert.equal(validFantasyPassword(value),true);
  for(const value of ['','x'.repeat(9),'x'.repeat(129)])assert.equal(validFantasyPassword(value),false);
});

test('world account requests use only same-origin cookies and keep passwords out of URLs',async()=>{
  const calls:{url:string;init:RequestInit}[]=[];
  const fetcher=(async(url,init)=>{calls.push({url:String(url),init:init??{}});return new Response(JSON.stringify({account,ticket:'temporary-binding-ticket',recoveryCode:'keep-this-code'}),{status:200,headers:{'Content-Type':'application/json'}});}) as typeof fetch;
  const status=await requestFantasyAccount('status',undefined,{fetch:fetcher});assert.equal(status.account?.username,account.username);
  assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.body,undefined);
  const response=await requestFantasyAccount('register',{username:'traveler_1',password:'different private password'},{fetch:fetcher});
  assert.equal(response.ticket,'temporary-binding-ticket');assert.equal(response.recoveryCode,'keep-this-code');
  assert.equal(calls[1].url,'/api/fantasy/account/register');assert.equal(calls[1].init.method,'POST');
  assert.deepEqual(JSON.parse(String(calls[1].init.body)),{username:'traveler_1',password:'different private password'});
  for(const {url,init}of calls){assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');assert.ok(!url.includes('password'));}
});

test('malformed and failed account responses cannot authorize the UI; cancellation remains cancellation',async()=>{
  for(const body of [{account:{...account,username:'<script>'}},{account:{...account,principal:42}},{ticket:'token-without-account'},{account,ticket:{bad:true}},{account,recoveryCode:'x'.repeat(257)}]){
    const reply=await requestFantasyAccount('login',{username:'traveler_1',password:'password-here'},{fetch:(async()=>new Response(JSON.stringify(body))) as typeof fetch});
    assert.deepEqual(reply,{account:null,error:'unavailable'});
  }
  assert.deepEqual(await requestFantasyAccount('login',{}, {fetch:(async()=>new Response(JSON.stringify({account:null,error:'invalid-credentials'}),{status:401})) as typeof fetch}),{account:null,error:'invalid-credentials'});
  assert.deepEqual(await requestFantasyAccount('status',undefined,{fetch:(async()=>{throw Error('network');}) as typeof fetch}),{account:null,error:'unavailable'});
  const controller=new AbortController();controller.abort();const failure=new Error('aborted');
  await assert.rejects(requestFantasyAccount('status',undefined,{signal:controller.signal,fetch:(async()=>{throw failure;}) as typeof fetch}),error=>error===failure);
});
