import test from 'node:test';
import assert from 'node:assert/strict';
import type { User } from '../../../shared/protocol.ts';
import { deriveSession } from '../sessionView.ts';
import { fantasyAccountDisconnected, fantasyAccountIdentityUpdate, fantasyPrivateMessagesAllowed, fantasyReconnectIdentity } from './fantasy-account-state.ts';
import { appendFantasyGmMessages, appendFantasyGmResponse, clearFantasyGmLife, fantasyGmHistory, registerFantasyGmRequest } from './fantasy-gm-history.ts';
import { clearNpcRequests, consumeNpcRequest, registerNpcRequest } from './npc-request-tracker.ts';

const accountA={id:'account-A',principal:'fantasy:privacy-A',username:'traveler_a'},accountB={id:'account-B',principal:'fantasy:privacy-B',username:'traveler_b'};
const user=(id:string,session:string|null='fantasy-room'):User=>({id,name:id,session,mode:'2d',sharing:false,icon:null,avatar:null,bio:'',status:'online',statusText:'',guest:false,username:null});
const identity=()=>({selfId:accountA.principal,fantasyHomeId:'browser-home',fantasyAccount:accountA,users:[user(accountA.principal),user('public-bystander')]});

test('account ownership change clears private RPG records, proposals and both owners’ queued dialogue',()=>{
  const outsider='fantasy:privacy-outsider';
  for(const owner of [accountA.principal,accountB.principal,outsider]){
    appendFantasyGmMessages(owner,'ko',{id:`history-${owner}`,who:'you',reply:{text:`private-${owner}`,suggestions:[]}});
    registerFantasyGmRequest(`gm-${owner}`,owner,'ko');registerNpcRequest(`npc-${owner}`,owner,'rin','ko');
  }
  const clock={hour:49,rate:30},before={...identity(),fantasyClock:clock,fantasyProfile:{private:'A'},fantasyLegacies:[{private:'A'}],gmReply:{private:'A'},npcMessages:[{private:'A'}],fantasyParty:{private:'A'},fantasyRealm:{private:'A'},fantasyProperties:{private:'A'},fantasyCombat:{private:'A'},fantasyPending:true,gmPending:true,npcPending:true,dialogueProgress:{request:{text:'A'}},communityState:{private:'A'},selfName:'Tonarium name'};
  const result=fantasyAccountIdentityUpdate(before,{account:accountB,activeId:accountB.principal,homeId:'browser-home',user:user(accountB.principal)}),after={...before,...result.patch};
  assert.equal(result.changed,true);assert.equal(after.selfId,accountB.principal);assert.equal(after.fantasyHomeId,'browser-home');
  for(const key of ['fantasyProfile','gmReply','fantasyParty','fantasyRealm','fantasyProperties','fantasyCombat','communityState'] as const)assert.equal(after[key],null,key);
  assert.deepEqual(after.npcMessages,[]);assert.deepEqual(after.fantasyLegacies,[]);assert.deepEqual(after.dialogueProgress,{});
  assert.equal(after.fantasyPending,false);assert.equal(after.gmPending,false);assert.equal(after.npcPending,false);
  assert.equal(after.fantasyClock,clock);assert.equal(after.selfName,'Tonarium name');
  for(const owner of [accountA.principal,accountB.principal]){
    assert.deepEqual(fantasyGmHistory(owner,'ko'),[]);
    assert.equal(appendFantasyGmResponse({requestId:`gm-${owner}`,locale:'ko',source:'rules',reply:{text:'old private reply',suggestions:[]}}),false);
    assert.equal(consumeNpcRequest({requestId:`npc-${owner}`,npcId:'rin',locale:'ko',text:'old reply',model:'',relationship:'stranger'}),undefined);
  }
  assert.equal(fantasyGmHistory(outsider,'ko').length,1);assert.equal(consumeNpcRequest({requestId:`npc-${outsider}`,npcId:'rin',locale:'ko',text:'other reply',model:'',relationship:'stranger'})?.user,outsider);
  clearFantasyGmLife(outsider);clearNpcRequests(outsider);
});

test('disconnect forgets private ownership but retains the home identity for a safe reconnect',()=>{
  const before={...identity(),fantasyAccountReady:true,fantasyProfile:{private:'A'},fantasyClock:{hour:40}};
  const after={...before,...fantasyAccountDisconnected(before)};
  assert.equal(after.fantasyAccount,null);assert.equal(after.fantasyAccountReady,false);assert.equal(after.fantasyProfile,null);
  assert.equal(after.selfId,accountA.principal);assert.equal(after.fantasyHomeId,'browser-home');assert.equal(fantasyReconnectIdentity(after),'browser-home');assert.equal(after.fantasyClock,before.fantasyClock);
  const guest={...after,...fantasyAccountIdentityUpdate(after,{account:null,activeId:'browser-home',homeId:'browser-home'}).patch};
  assert.equal(guest.selfId,'browser-home');assert.equal(guest.fantasyHomeId,null);assert.equal(fantasyReconnectIdentity(guest),'browser-home');
  assert.equal(fantasyPrivateMessagesAllowed(guest),false);
});

test('authoritative account public user is merged atomically so the current room survives ownership swaps',()=>{
  const before={...identity(),session:'fantasy-room',presence:{},avatarsBy:{},itemsBy:{}};
  const message={account:accountB,activeId:accountB.principal,homeId:'browser-home',user:user(accountB.principal)};
  const after={...before,...fantasyAccountIdentityUpdate(before,message).patch};
  const view=deriveSession({participants:[],avatars:{},avatarIds:[]},after);
  assert.equal(after.session,'fantasy-room');assert.ok(view.participants.some(person=>person.id===accountB.principal&&person.session==='fantasy-room'));
  assert.ok(after.users.some(person=>person.id==='public-bystander'));
  assert.equal(after.users.filter(person=>person.id===accountB.principal).length,1);
});

test('credential refresh preserves the same owner’s private state and only a ready matching owner accepts RPG data',()=>{
  const before={...identity(),fantasyAccountReady:false,fantasyProfile:{private:'A'}};
  const result=fantasyAccountIdentityUpdate(before,{account:accountA,activeId:accountA.principal,homeId:'browser-home',user:user(accountA.principal)});
  assert.equal(result.changed,false);assert.ok(!('fantasyProfile' in result.patch));
  const ready={...before,...result.patch};assert.equal(ready.fantasyProfile,before.fantasyProfile);assert.equal(fantasyPrivateMessagesAllowed(ready),true);
  assert.equal(fantasyPrivateMessagesAllowed({...ready,fantasyAccountReady:false}),false);
  assert.equal(fantasyPrivateMessagesAllowed({...ready,fantasyAccount:null}),false);
  assert.equal(fantasyPrivateMessagesAllowed({...ready,selfId:'browser-home'}),false);
});
