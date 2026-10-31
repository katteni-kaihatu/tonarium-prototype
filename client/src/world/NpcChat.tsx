import { useEffect, useMemo, useRef, useState } from 'react';
import { NPC_PUBLIC, type NpcId, type NpcLocale } from '../../../shared/npc.ts';
import { get, set, useStore } from '../store.ts';
import { send } from '../net/ws.ts';
import './npc.css';
import { scrollChatBottom } from './chat-scroll.ts';
import { useLocale } from '../locale.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { FANTASY_TERMS } from '../../../shared/fantasy-lore.ts';
import { NpcPortrait as Portrait } from './NpcPortrait.tsx';

const COPY = {
  ko: {
    title:'여행의 끝에서, 새로운 이야기.', subtitle:'TONARIUM · AI 대화 프로토타입',
    name:'린', role:'길목 여관의 주인', place:'하스 · 별빛 여관', badge:'서버 AI 대화',
    description:'과거에는 대상단과 대륙을 여행했습니다. 지금은 작은 여관을 지키며, 지나가는 이들의 이야기를 듣습니다.',
    welcome:'린에게 말을 걸어보세요.', hint:'여행 이야기, 엉뚱한 질문, 일상의 고민까지. 정해진 선택지 없이 대화해보세요.',
    placeholder:'하고 싶은 말을 자유롭게 적어주세요…', send:'말 걸기', clear:'새 대화', back:'Tonarium으로',
    thinking:'린이 대답을 생각하고 있어요…', connecting:'Tonarium 서버에 연결 중…', ready:'대화할 준비가 됐어요',
    examples:['안녕, 네 이야기를 들려줄래?','이 근처에서 가장 신기한 곳은 어디야?','여관을 차리기 전에는 무슨 일을 했어?'],
    note:'이 화면은 대화 시험용입니다. NPC의 말로 아이템·보상·게임 상태가 바뀌지는 않습니다.',
    model:'대화 모델', response:'응답', seconds:'초', language:'대화 언어',
    unavailable:'대화 AI에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.',
    busy:'지금 다른 대화에 응답 중입니다. 잠시 후 다시 시도해주세요.',
    invalid:'메시지를 확인해주세요. 최대 800자까지 입력할 수 있어요.',
    timeout:'응답 시간이 초과됐습니다. 잠시 후 다시 시도해주세요.',
    disconnected:'연결이 끊어졌습니다. 다시 연결되면 말을 걸어주세요.', retry:'다시 보내기',
  },
  en: {
    title:'Every journey begins with a story.', subtitle:'TONARIUM · AI CONVERSATION PROTOTYPE',
    name:'Rin', role:'Keeper of the Wayside Inn', place:'HEARTH · THE STARLIT INN', badge:'Server AI conversation',
    description:'Once a traveler with a merchant caravan, now the keeper of a little inn. There is always room for another story.',
    welcome:'Pull up a chair. Talk to Rin.', hint:'Ask about the world, share a worry, or follow your curiosity. No preset choices required.',
    placeholder:'Say whatever is on your mind…', send:'Send', clear:'New conversation', back:'Back to Tonarium',
    thinking:'Rin is thinking of a reply…', connecting:'Connecting to Tonarium…', ready:'Ready for a conversation',
    examples:['Hello! Will you tell me your story?','What is the strangest place around here?','What did you do before opening this inn?'],
    note:'This is a conversation prototype. NPC dialogue cannot grant items, rewards, or change game state.',
    model:'Dialogue model', response:'Response', seconds:'s', language:'Conversation language',
    unavailable:'The dialogue AI is unavailable. Please try again shortly.', busy:'The server is answering another conversation. Please try again shortly.',
    invalid:'Please check your message. The limit is 800 characters.', timeout:'The reply timed out. Please try again.',
    disconnected:'Connection lost. Please wait for reconnection.', retry:'Try again',
  },
  ja: {
    title:'旅の終わりに、新しい物語を。', subtitle:'TONARIUM · AI会話プロトタイプ',
    name:'リン', role:'街道の宿の主人', place:'ハース · 星あかりの宿', badge:'サーバーAIの会話',
    description:'かつては隊商と大陸を渡り歩いていた旅人。今は小さな宿を守り、訪れる人の話に耳を傾けています。',
    welcome:'椅子にかけて、リンと話そう。', hint:'旅の噂、ふとした疑問、今日の悩み。決まった選択肢のない会話をどうぞ。',
    placeholder:'自由に話しかけてください…', send:'話しかける', clear:'新しい会話', back:'Tonariumへ戻る',
    thinking:'リンが返事を考えています…', connecting:'Tonariumに接続中…', ready:'お話しできます',
    examples:['こんにちは。あなたの話を聞かせて。','この近くで一番不思議な場所は？','宿を始める前は何をしていたの？'],
    note:'会話の試験用画面です。NPCの発言でアイテム・報酬・ゲーム状態は変わりません。',
    model:'会話モデル', response:'応答', seconds:'秒', language:'会話の言語',
    unavailable:'会話AIに接続できません。少し待ってからお試しください。', busy:'ほかの会話に応答中です。少し待ってからお試しください。',
    invalid:'800文字以内でメッセージを入力してください。', timeout:'応答が時間切れになりました。もう一度お試しください。',
    disconnected:'接続が切れました。再接続をお待ちください。', retry:'再送する',
  },
};

export function NpcChat({compact=false,messenger=false,npcIds,initialNpcId}:{compact?:boolean;messenger?:boolean;npcIds?:NpcId[];initialNpcId?:NpcId}){
  const [locale,setLocale]=useLocale();
  const [npcId,setNpcId]=useState<NpcId>(initialNpcId??npcIds?.[0]??'rin');
  const choices=NPC_PUBLIC.filter((n)=>!npcIds||npcIds.includes(n.id));
  const npc=NPC_PUBLIC.find((n)=>n.id===npcId)!;
  const [draft,setDraft]=useState('');
  const [elapsed,setElapsed]=useState<number|null>(null);
  const [lastText,setLastText]=useState('');
  const started=useRef(0);
  const connected=useStore((s)=>s.wsConnected);
  const modelPending=useStore((s)=>s.npcPending);
  const pending=useStore((s)=>s.npcPending&&npcRequestOwner(s.npcRequestId)?.npcId===npcId&&npcRequestOwner(s.npcRequestId)?.locale===locale);
  const partial=useStore(s=>s.npcRequestId?s.dialogueProgress[s.npcRequestId]:undefined);
  const allMessages=useStore((s)=>s.npcMessages);
  const messages=useMemo(()=>allMessages.filter((m)=>m.npcId===npcId&&m.locale===locale),[allMessages,npcId,locale]);
  const error=useStore((s)=>!s.npcErrorContext||s.npcErrorContext.npcId===npcId&&s.npcErrorContext.locale===locale?s.npcError:null);
  const model=useStore((s)=>s.npcModel);
  const fantasyPending=useStore((s)=>s.fantasyPending||(!!s.fantasyProfile?.activity||!!s.fantasyProfile?.combatId));
  const activityBlocked=(compact||messenger)&&fantasyPending;
  const activityReason={ko:'현재 활동을 마친 뒤 대화할 수 있습니다.',en:'Finish your current activity before talking.',ja:'現在の活動を終えてから会話できます。'}[locale];
  const scroll=useRef<HTMLDivElement>(null);
  const t={...COPY[locale],name:npc.name[locale],role:npc.role[locale],place:npc.travelOnly?{ko:'여행길',en:'On the road',ja:'旅路'}[locale]:FANTASY_TERMS.find((term)=>term.category==='place'&&term.id===npc.homeLocation)?.names[locale]??npc.homeLocation,thinking:{ko:`${npc.name[locale]}이(가) 대답을 생각하고 있어요…`,en:`${npc.name[locale]} is thinking of a reply…`,ja:`${npc.name[locale]}が返事を考えています…`}[locale],welcome:{ko:`${npc.name[locale]}에게 말을 걸어보세요.`,en:`Take a seat. Talk to ${npc.name[locale]}.`,ja:`${npc.name[locale]}と話してみましょう。`}[locale]};
  const labels={ko:{select:'대화할 NPC',age:'세',female:'여성',male:'남성',profile:'인물 정보'},en:{select:'Choose an NPC',age:' years',female:'Female',male:'Male',profile:'Character profile'},ja:{select:'話す相手',age:'歳',female:'女性',male:'男性',profile:'人物の情報'}}[locale];
  useEffect(()=>{scrollChatBottom(scroll.current);},[messages,pending,error,partial?.text]);
  useEffect(()=>{if(!pending&&started.current){if(!error)setElapsed((performance.now()-started.current)/1000);started.current=0;}},[pending,error]);
  const request=(text:string,reset=false,nextLocale=locale)=>{
    const s=get();const quick=quickNpcQuestion(text,npcId);if(!s.wsConnected||(compact||messenger)&&(s.fantasyPending||(!!s.fantasyProfile?.activity||!!s.fantasyProfile?.combatId))||s.npcPending&&!quick||(!reset&&!text.trim()))return;
    const requestId=crypto.randomUUID();
    registerNpcRequest(requestId,s.selfId,npcId,nextLocale);
    set({npcError:null,npcErrorContext:null,...(!s.npcPending?{npcPending:true,npcRequestId:requestId}:{}),npcMessages:reset?s.npcMessages.filter((m)=>m.npcId!==npcId):[...s.npcMessages,{id:`${requestId}-user`,role:'user',text:text.trim(),npcId,locale:nextLocale}]});
    started.current=performance.now();setElapsed(null);if(text.trim())setLastText(text.trim());
    send({t:'npcChat',requestId,text:text.trim(),locale:nextLocale,npcId,...(reset?{reset:true}:{})});
    setTimeout(()=>{if(get().npcPending&&get().npcRequestId===requestId)set({npcPending:false,npcRequestId:null,npcError:'timeout',npcErrorContext:{npcId,locale:nextLocale}});},55000);
    setDraft('');
  };
  const changeLocale=(next:NpcLocale)=>{setLocale(next);setLastText('');setElapsed(null);};
  return <div className={`npc-experience ${compact?'compact':''}`} lang={locale}>
    <header className="npc-top"><a href="/" className="npc-brand"><img src="/brand/mark.png" alt="Tonarium"/><span>Tonarium<small>WORLDS / NPC LAB</small></span></a><div className="npc-language" role="group" aria-label={t.language}>{(['ko','en','ja'] as const).map((l)=><ReasonButton key={l} lang={l} disabled={pending||activityBlocked} reason={activityBlocked?activityReason:pending?t.thinking:undefined} aria-pressed={locale===l} className={locale===l?'active':''} onClick={()=>changeLocale(l)}>{{ko:'한국어',en:'English',ja:'日本語'}[l]}</ReasonButton>)}</div>{!compact&&!messenger&&<a href="/" className="npc-back">{t.back} ↗</a>}</header>
    <div className="npc-select-strip" role="group" aria-label={labels.select}>{choices.map((p)=><ReasonButton key={p.id} disabled={pending||activityBlocked} reason={activityBlocked?activityReason:pending?t.thinking:undefined} aria-pressed={npcId===p.id} onClick={()=>{setNpcId(p.id);setDraft('');setLastText('');setElapsed(null);set({npcError:null});}}><b>{p.name[locale]}</b><span>{p.role[locale]}</span></ReasonButton>)}</div><div className="npc-body"><aside className="npc-scene"><div className="npc-arch"><div className="npc-window"><i/><i/><i/><i/></div><span className="npc-stars">✦</span><div className="npc-glow"/><Portrait npcId={npcId}/><div className="npc-scene-floor"/></div><div className="npc-persona"><span>{t.place}</span><h1>{t.name}<small>{t.role}</small></h1><div className="npc-profile" aria-label={labels.profile}>{npc.age}{labels.age} · {labels[npc.gender]} · {FANTASY_TERMS.find((term)=>term.category==='race'&&term.id===npc.race)?.names[locale]}</div><div className="npc-story-line"/></div></aside>
    <main className="npc-conversation"><div className="npc-conversation-title"><span className="npc-kicker">{t.subtitle}</span><h2>{t.title}</h2><div className="npc-connection"><i className={connected?'ready':''}/>{!connected?t.connecting:activityBlocked?activityReason:pending?t.thinking:t.ready}</div></div>
      <div className="npc-messages" ref={scroll} role="log" aria-label={t.name} aria-live="polite">{messages.length===0&&!pending&&<div className="npc-empty"><span>✧</span><h3>{t.welcome}</h3><p>{t.hint}</p></div>}{messages.map((m)=><article key={m.id} className={`npc-message ${m.role}`}><span className="npc-avatar">{m.role==='assistant'?'✦':'·'}</span><div><b>{m.role==='assistant'?t.name:{ko:'나',en:'You',ja:'あなた'}[locale]}</b><p>{m.text}</p>{m.role==='assistant'&&m.source&&<small className="npc-source">{m.source==='canon'?{ko:'NPC의 안내',en:'NPC guidance',ja:'NPCの案内'}[locale]:{ko:'서버 AI 자유 대화',en:'Server AI conversation',ja:'サーバーAIの自由会話'}[locale]}</small>}</div></article>)}{pending&&partial?.locale===locale&&partial.npcId===npcId&&partial.text&&<article className="npc-message assistant" aria-live="polite"><span className="npc-avatar">✦</span><div><b>{t.name}</b><p>{partial.text}</p></div></article>}{pending&&!partial?.text&&<div className="npc-thinking" role="status"><span/><span/><span/><small>{t.thinking}</small></div>}{error&&<div className="npc-error" role="alert"><p>{t[(error in t?error:'unavailable') as keyof typeof t] as string}</p>{connected&&lastText&&<ReasonButton disabled={activityBlocked} reason={activityBlocked?activityReason:undefined} onClick={()=>request(lastText)}>{t.retry}</ReasonButton>}</div>}</div>
      <form className="npc-composer" onSubmit={(e)=>{e.preventDefault();request(draft);}}><textarea aria-label={t.placeholder} placeholder={t.placeholder} maxLength={800} rows={2} value={draft} disabled={!connected||activityBlocked} title={activityBlocked?activityReason:undefined} onChange={(e)=>setDraft(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();request(draft);}}}/><div><small>{draft.length} / 800</small><ReasonButton className="npc-send" type="submit" reason={activityBlocked?activityReason:!draft.trim()?({ko:'하고 싶은 말을 입력하세요.',en:'Enter a message.',ja:'メッセージを入力してください。'})[locale]:modelPending?t.thinking:undefined} disabled={activityBlocked||!draft.trim()||modelPending&&!quickNpcQuestion(draft,npcId)||!connected}>{t.send} <span>↑</span></ReasonButton></div></form>
      <footer className="npc-chat-footer"><span>{elapsed!==null&&`${t.response} ${elapsed.toFixed(1)}${t.seconds}`}{model&&` · ${model}`}</span></footer><p className="npc-note">{compact||messenger?{ko:'제안받은 행동은 버튼을 눌러 실행합니다.',en:'Confirm a proposed action with its button.',ja:'提案された行動はボタンで実行します。'}[locale]:t.note}</p>
    </main></div><div className="npc-bottom"><span>✦ {t.badge}</span><span>{model||t.model} · KokoaAI</span></div>
  </div>;
}

export function NpcPrototype({onStart}:{onStart:()=>void}){
  const joined=useStore((s)=>s.joined);
  const connected=useStore((s)=>s.wsConnected);
  useEffect(()=>{if(!joined)onStart();},[joined,onStart]);
  useEffect(()=>{if(connected)send({t:'leave'});},[connected]);
  return <div className="npc-prototype"><NpcChat/></div>;
}
import { registerNpcRequest, quickNpcQuestion, npcRequestOwner } from './npc-request-tracker.ts';
