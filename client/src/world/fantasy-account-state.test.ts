import test from 'node:test';
import assert from 'node:assert/strict';
import { clearFantasyAccountPrivateState, fantasyAccountDisconnected, fantasyPrivateMessagesAllowed } from './fantasy-account-state.ts';
import { appendFantasyGmMessages, appendFantasyGmResponse, clearFantasyGmLife, fantasyGmHistory, registerFantasyGmRequest } from './fantasy-gm-history.ts';
import { clearNpcRequests, consumeNpcRequest, registerNpcRequest } from './npc-request-tracker.ts';

const ownerA='tonarium-account-A',ownerB='tonarium-account-B';

test('only a ready authenticated platform connection accepts private RPG messages',()=>{
  const ready={selfId:ownerA,joined:true,wsConnected:true,wsReady:true};
  assert.equal(fantasyPrivateMessagesAllowed(ready),true);
  for(const patch of [{joined:false},{wsConnected:false},{wsReady:false},{selfId:''}])assert.equal(fantasyPrivateMessagesAllowed({...ready,...patch}),false);
});

test('host account change clears private RPG records and both owners’ queued dialogue',()=>{
  const outsider='tonarium-account-outsider';
  for(const owner of [ownerA,ownerB,outsider]){
    appendFantasyGmMessages(owner,'ko',{id:`history-${owner}`,who:'you',reply:{text:`private-${owner}`,suggestions:[]}});
    registerFantasyGmRequest(`gm-${owner}`,owner,'ko');registerNpcRequest(`npc-${owner}`,owner,'rin','ko');
  }
  const clock={hour:49,rate:30},before={selfId:ownerA,fantasyClock:clock,fantasyProfile:{private:'A'},fantasyLegacies:[{private:'A'}],gmReply:{private:'A'},npcMessages:[{private:'A'}],fantasyParty:{private:'A'},fantasyRealm:{private:'A'},fantasyProperties:{private:'A'},fantasyCombat:{private:'A'},fantasyPending:true,gmPending:true,npcPending:true,dialogueProgress:{request:{text:'A'}},communityState:{private:'A'}};
  const after={...before,...clearFantasyAccountPrivateState([ownerA,ownerB]),selfId:ownerB};
  for(const key of ['fantasyProfile','gmReply','fantasyParty','fantasyRealm','fantasyProperties','fantasyCombat','communityState'] as const)assert.equal(after[key],null,key);
  assert.deepEqual(after.npcMessages,[]);assert.deepEqual(after.fantasyLegacies,[]);assert.deepEqual(after.dialogueProgress,{});
  assert.equal(after.fantasyPending,false);assert.equal(after.gmPending,false);assert.equal(after.npcPending,false);
  assert.equal(after.fantasyClock,clock);assert.equal(after.selfId,ownerB);
  for(const owner of [ownerA,ownerB]){
    assert.deepEqual(fantasyGmHistory(owner,'ko'),[]);
    assert.equal(appendFantasyGmResponse({requestId:`gm-${owner}`,locale:'ko',source:'rules',reply:{text:'old private reply',suggestions:[]}}),false);
    assert.equal(consumeNpcRequest({requestId:`npc-${owner}`,npcId:'rin',locale:'ko',text:'old reply',model:'',relationship:'stranger'}),undefined);
  }
  assert.equal(fantasyGmHistory(outsider,'ko').length,1);assert.equal(consumeNpcRequest({requestId:`npc-${outsider}`,npcId:'rin',locale:'ko',text:'other reply',model:'',relationship:'stranger'})?.user,outsider);
  clearFantasyGmLife(outsider);clearNpcRequests(outsider);
});

test('disconnect clears private state without replacing the Tonarium identity',()=>{
  const before={selfId:ownerA,fantasyProfile:{private:'A'},fantasyTownPresence:{location:'hearth',players:[{id:'secret',name:'Secret'}]},fantasyClock:{hour:40}};
  const after={...before,...fantasyAccountDisconnected(before)};
  assert.equal(after.fantasyProfile,null);assert.equal(after.fantasyTownPresence,null);
  assert.equal(after.selfId,ownerA);assert.equal(after.fantasyClock,before.fantasyClock);
});
