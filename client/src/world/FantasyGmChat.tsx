import { ReasonButton } from './FantasyActionButton.tsx';
import { useEffect, useRef, useState } from 'react';
import type { FantasyAction, FantasyProfile } from '../../../shared/fantasy.ts';
import { fantasyGmCanAnswer, type FantasyGmReply } from '../../../shared/fantasy-gm.ts';
import { get, set, useStore } from '../store.ts';
import { send } from '../net/ws.ts';
import { useLocale } from '../locale.ts';
import { appendFantasyGmMessages, registerFantasyGmRequest, useFantasyGmHistory } from './fantasy-gm-history.ts';
import { scrollChatAnchor } from './chat-scroll.ts';
import { matchPrewrittenTopic } from '../../../shared/fantasy-dialogue-topics.ts';

type GmTab=NonNullable<FantasyGmReply['suggestions'][number]['tab']>;
export function FantasyGmChat({profile}:{profile:FantasyProfile;onAction:(action:FantasyAction)=>void;onSelect:(id:string)=>void;onTab:(tab:GmTab)=>void;blocked:boolean}) {
  const [locale]=useLocale();const user=useStore(s=>s.selfId);
  const connected=useStore(s=>s.wsConnected),pending=useStore(s=>s.gmPending);
  const error=useStore(s=>!s.gmErrorLocale||s.gmErrorLocale===locale?s.gmError:null);
  const response=useStore(s=>s.gmReply),messages=useFantasyGmHistory(user,locale);
  const partial=useStore(s=>s.gmRequestId?s.dialogueProgress[s.gmRequestId]:undefined);
  const [input,setInput]=useState('');const end=useRef<HTMLDivElement>(null);
  const t={ko:{title:'여정의 안내자',welcome:'무엇이 궁금한가요?',ask:'묻기',thinking:'답변을 준비하고 있습니다…',placeholder:'궁금한 점이나 하고 싶은 일을 말해보세요.',failed:'답변을 받지 못했습니다. 잠시 후 다시 물어봐 주세요.'},en:{title:'Game master',welcome:'What would you like to know?',ask:'Ask',thinking:'Preparing a reply…',placeholder:'Ask a question or say what you want to do.',failed:'No reply was received. Please try again shortly.'},ja:{title:'旅路の案内人',welcome:'何が知りたいですか？',ask:'聞く',thinking:'返答を準備しています…',placeholder:'知りたいことや、したいことを話してください。',failed:'返答を受信できませんでした。少し待って再度お尋ねください。'}}[locale];
  useEffect(()=>{scrollChatAnchor(end.current);},[messages,pending,partial?.text]);
  const ask=(text:string)=>{
    const s=get(),quick=!!matchPrewrittenTopic(text)||fantasyGmCanAnswer(s.fantasyProfile??profile,text);
    if(!text.trim()||!s.wsConnected||s.gmPending&&!quick)return;
    const requestId=crypto.randomUUID();registerFantasyGmRequest(requestId,s.selfId,locale);
    appendFantasyGmMessages(s.selfId,locale,{id:`${requestId}:user`,who:'you',reply:{text:text.trim(),suggestions:[]}});
    set({gmError:null,gmErrorLocale:null,...(!s.gmPending?{gmPending:true,gmRequestId:requestId}:{})});setInput('');
    send({t:'fantasyGmChat',requestId,text:text.trim(),locale});
    setTimeout(()=>{if(get().gmPending&&get().gmRequestId===requestId)set({gmPending:false,gmRequestId:null,gmError:'timeout',gmErrorLocale:locale});},55000);
  };
  return <div className="fr-gm"><h2>{t.title}</h2><div className="fr-chat-history" role="log" aria-label="GM">{!messages.length&&<p>{t.welcome}</p>}{messages.map(message=><article className={message.who} key={message.id}><b>{message.who==='gm'?'✦ GM':profile.character?.name}</b><p>{message.reply.text}</p></article>)}{pending&&partial?.locale===locale&&partial.text&&<article className="gm" aria-live="polite"><b>✦ GM</b><p>{partial.text}</p></article>}{pending&&!partial?.text&&<p role="status">{t.thinking}</p>}{error&&<p role="alert">{response?.error&&response.locale===locale&&response.error===error?response.reply.text:t.failed}</p>}<div ref={end}/></div><form className="fr-chat-form" onSubmit={event=>{event.preventDefault();ask(input);}}><input aria-label={t.placeholder} value={input} maxLength={500} onChange={event=>setInput(event.target.value)} placeholder={t.placeholder}/><ReasonButton className="fr-btn primary" type="submit" reason={!input.trim()?({ko:'궁금한 내용을 입력하세요.',en:'Enter your question.',ja:'質問を入力してください。'})[locale]:pending?t.thinking:undefined} disabled={!input.trim()||pending&&!matchPrewrittenTopic(input)&&!fantasyGmCanAnswer(profile,input)||!connected}>{t.ask}</ReasonButton></form></div>;
}
