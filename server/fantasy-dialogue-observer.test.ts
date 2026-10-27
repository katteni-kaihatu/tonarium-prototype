import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FantasyDiagnostics } from './fantasy-diagnostics.ts';
import { FantasyDialogueObserver } from './fantasy-dialogue-observer.ts';
import { newFantasyProfile,applyFantasyAction } from '../shared/fantasy-engine.ts';

async function fixture(t: import('node:test').TestContext,options: {maxPending?:number}={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'tonarium-dialogue-observer-'));t.after(async()=>{assert.equal(path.dirname(directory),os.tmpdir());assert.ok(path.basename(directory).startsWith('tonarium-dialogue-observer-'));await fs.rm(directory,{recursive:true,force:true});});
 let now=100;const sink=new FantasyDiagnostics({directory,captureMode:'all',now:()=>now,maxTextChars:4000});const observer=new FantasyDialogueObserver(sink,{now:()=>now,...options});
 const rows=async()=>{await sink.flush();const files=(await fs.readdir(directory)).filter(file=>file.endsWith('.jsonl'));return (await Promise.all(files.map(file=>fs.readFile(path.join(directory,file),'utf8')))).join('').split('\n').filter(Boolean).map(line=>JSON.parse(line));};
 t.after(()=>sink.close());return{observer,rows,clock:(value:number)=>{now=value;}};
}
const request={actorId:'fantasy:private-owner',sessionId:'private-session',kind:'npc' as const,requestId:'req-1',locale:'ko' as const,npcId:'rin',query:'객실을 알려줘',generation:2,location:'hearth'};

test('all completed dialogue routes persist the actual request/reply with hashed identity and duration',async t=>{
 const f=await fixture(t),connection={},token=f.observer.begin(connection,request);f.clock(135);f.observer.reply(connection,{kind:'npc',requestId:'req-1',text:'공동 객실은 8G야.',route:'canon',currentActorId:request.actorId,token});
 const rows=await f.rows(),reply=rows.find(row=>row.type==='ai.reply');assert.equal(reply.dialogue.query,request.query);assert.equal(reply.dialogue.reply,'공동 객실은 8G야.');assert.equal(reply.durationMs,35);assert.equal(reply.locale,'ko');assert.equal(reply.npcId,'rin');assert.equal(reply.route,'canon');assert.match(reply.actor,/^[a-f0-9]{24}$/u);assert.ok(!JSON.stringify(rows).includes('private-owner'));
});
test('revoked owner replies are cancelled without persisting another owner response',async t=>{
 const f=await fixture(t),connection={},token=f.observer.begin(connection,request);f.observer.reply(connection,{kind:'npc',requestId:'req-1',text:'OTHER_OWNER_PRIVATE_REPLY',route:'local',currentActorId:'different-owner',token});
 const rows=await f.rows(),reply=rows.find(row=>row.type==='ai.reply');assert.equal(reply.status,'cancelled');assert.equal(reply.dialogue.query,request.query);assert.ok(!JSON.stringify(rows).includes('OTHER_OWNER_PRIVATE_REPLY'));
});
test('known generated age/weather errors are flagged while canonical long lists are not misclassified',async t=>{
 const f=await fixture(t),connection={},profile=applyFantasyAction(newFantasyProfile(),{type:'create',name:'Synthetic',source:'human',gender:'female'},()=>.5).profile;
 const token=f.observer.begin(connection,{...request,query:'네 나이가 여관 운영에 어떤 영향을 줘?',profile,dynamicFacts:{hour:480,location:'hearth',shops:[],rumors:[]}});
 f.observer.reply(connection,{kind:'npc',requestId:'req-1',text:'오늘은 더운 날씨야.',route:'local',currentActorId:request.actorId,token});
 const nextToken=f.observer.begin(connection,{...request,requestId:'req-2'});f.observer.reply(connection,{kind:'npc',requestId:'req-2',text:'첫 방이다. 둘째 방이다. 셋째 방이다.',route:'canon',currentActorId:request.actorId,token:nextToken});
 const rows=await f.rows(),replies=rows.filter(row=>row.type==='ai.reply');assert.equal(replies[0].issue,true);assert.match(replies[0].quality,/npc_age_topic_missing/);assert.ok(rows.some(row=>row.type==='ai.quality'&&row.reason==='weather_conflict'));assert.equal(replies[1].issue,false);
 assert.ok(rows.filter(row=>row.type==='ai.quality').every(row=>row.durationMs===undefined&&row.route===undefined));
});
test('pending conversations stay bounded and disconnects persist cancellation without replay duplicates',async t=>{
 const f=await fixture(t,{maxPending:2}),connection={};for(let i=1;i<=3;i++)f.observer.begin(connection,{...request,requestId:`req-${i}`,query:`question-${i}`});f.observer.cancel(connection,'disconnect');f.observer.cancel(connection,'disconnect');
 const replies=(await f.rows()).filter(row=>row.type==='ai.reply');assert.equal(replies.length,3);assert.ok(replies.every(row=>row.status==='cancelled'));assert.equal(new Set(replies.map(row=>row.dialogue.query)).size,3);
});

test('late replies cannot finish reused requests after supersession or account switching',async t=>{
 const f=await fixture(t),connection={};
 const old=f.observer.begin(connection,{...request,query:'old owner question'});
 f.observer.cancel(connection,'identity-changed');
 const fresh=f.observer.begin(connection,{...request,actorId:'new-owner',query:'new owner question'});
 f.observer.reply(connection,{kind:'npc',requestId:request.requestId,text:'OLD_OWNER_RESPONSE',route:'local',currentActorId:'new-owner',token:old});
 f.observer.reply(connection,{kind:'npc',requestId:request.requestId,text:'correct new reply',route:'local',currentActorId:'new-owner',token:fresh});
 const older=f.observer.begin(connection,{...request,query:'superseded question'});
 const newest=f.observer.begin(connection,{...request,query:'latest question'});
 f.observer.reply(connection,{kind:'npc',requestId:request.requestId,text:'OLD_SUPERSEDED_RESPONSE',route:'local',currentActorId:request.actorId,token:older});
 f.observer.reply(connection,{kind:'npc',requestId:request.requestId,text:'correct latest reply',route:'local',currentActorId:request.actorId,token:newest});
 const rows=await f.rows(),replies=rows.filter(row=>row.type==='ai.reply');
 assert.ok(!JSON.stringify(rows).includes('OLD_OWNER_RESPONSE'));assert.ok(!JSON.stringify(rows).includes('OLD_SUPERSEDED_RESPONSE'));
 assert.equal(replies.find(row=>row.dialogue.query==='new owner question')?.dialogue.reply,'correct new reply');
 assert.equal(replies.find(row=>row.dialogue.query==='latest question')?.dialogue.reply,'correct latest reply');
});
