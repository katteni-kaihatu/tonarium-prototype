import type { FantasyProfile } from '../shared/fantasy.ts';
import type { NpcLocale } from '../shared/npc.ts';
import type { FantasyDiagnostics } from './fantasy-diagnostics.ts';
import type { DialogueDynamicContext } from './dialogue-dynamic.ts';
import { assessDialogueQuality } from './dialogue-quality.ts';

interface Request {
 actorId:string;sessionId:string|null;kind:'npc'|'gm';requestId:string;locale:NpcLocale;query:string;
 npcId?:string;generation?:number;location?:string;profile?:FantasyProfile;dynamicFacts?:DialogueDynamicContext;
}
interface Reply {kind:'npc'|'gm';requestId:string;text:string;route?:string;model?:string;errorCode?:string;currentActorId?:string|null;token?:object}
interface Pending extends Request {startedAt:number;token:object}

export class FantasyDialogueObserver {
 readonly #pending=new WeakMap<object,Map<string,Pending>>();
 readonly #now:()=>number;
 readonly #maxPending:number;
 constructor(private readonly sink:Pick<FantasyDiagnostics,'record'|'recordDialogue'>,options:{now?:()=>number;maxPending?:number}={}){
  this.#now=options.now??Date.now;this.#maxPending=Math.min(32,Math.max(1,Math.floor(options.maxPending??8)));
 }
 begin(connection:object,request:Request):object|undefined {
  try{
   const pending=this.#pending.get(connection)??new Map<string,Pending>();this.#pending.set(connection,pending);
   for(const[key,value]of pending)if(this.#now()-value.startedAt>120_000)this.#finish(pending,key,value,undefined,'observer-timeout');
   const key=`${request.kind}:${request.requestId}`,old=pending.get(key);if(old)this.#finish(pending,key,old,undefined,'superseded');
   while(pending.size>=this.#maxPending){const[first,value]=pending.entries().next().value!;this.#finish(pending,first,value,undefined,'pending-limit');}
   const token={};pending.set(key,{...request,query:request.query.slice(0,800),startedAt:this.#now(),token});
   this.sink.recordDialogue({type:'ai.request',actorId:request.actorId,sessionId:request.sessionId??undefined,requestId:request.requestId,npcId:request.npcId??'gm',locale:request.locale,location:request.location,generation:request.generation,status:'started',queryChars:request.query.length},{query:request.query});
   return token;
  }catch{/* 診断が会話の可否を変えない。 */}
 }
 reply(connection:object,reply:Reply):void {
  try{const pending=this.#pending.get(connection),key=`${reply.kind}:${reply.requestId}`,request=pending?.get(key);if(!pending||!request||request.token!==reply.token)return;
   this.#finish(pending,key,request,reply,reply.currentActorId!==request.actorId?'identity-changed':undefined);
  }catch{/* 診断が返答を止めない。 */}
 }
 cancel(connection:object,reason:string):void {
  try{const pending=this.#pending.get(connection);if(!pending)return;for(const[key,request]of pending)this.#finish(pending,key,request,undefined,reason);this.#pending.delete(connection);}catch{/* 接続終了を優先する。 */}
 }
 #finish(pending:Map<string,Pending>,key:string,request:Pending,reply?:Reply,cancelReason?:string):void {
  pending.delete(key);
  const flags=!cancelReason&&!reply?.errorCode&&reply&&['local','browser'].includes(reply.route??'')?assessDialogueQuality({kind:request.kind,locale:request.locale,query:request.query,reply:reply.text,npcId:request.npcId,profile:request.profile,dynamicFacts:request.dynamicFacts}).flags:[];
  const event={type:'ai.reply',actorId:request.actorId,sessionId:request.sessionId??undefined,requestId:request.requestId,npcId:request.npcId??'gm',locale:request.locale,generation:request.generation,location:request.location,
   status:cancelReason?'cancelled':reply?.errorCode?'error':'ok',reason:cancelReason,errorCode:reply?.errorCode,route:reply?.route??'none',model:reply?.model,
   durationMs:Math.max(0,this.#now()-request.startedAt),cancelled:!!cancelReason,issue:!!cancelReason||!!reply?.errorCode||flags.length>0,quality:flags.length?flags.slice(0,3).join(','):reply&&['local','browser'].includes(reply.route??'')?'no-flags':'not-assessed'};
  this.sink.recordDialogue(event,{query:request.query,reply:cancelReason?'':reply?.text??''});
  for(const flag of flags)this.sink.record({type:'ai.quality',actorId:request.actorId,sessionId:request.sessionId??undefined,requestId:request.requestId,npcId:request.npcId??'gm',locale:request.locale,reason:flag,issue:true});
 }
}
