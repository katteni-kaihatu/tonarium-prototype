import test from 'node:test';
import assert from 'node:assert/strict';
import { npcHasMultipleRequests, npcProfileQuestion } from '../shared/fantasy-npc-query.ts';
import { NpcChat, npcCanonicalReply } from './npc.ts';
import { NPC_PUBLIC } from '../shared/npc.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import type { NpcLocale } from '../shared/npc.ts';
import { npcSystemPrompt } from './npc.ts';

test('profile questions require the complete supported intent in Korean, English and Japanese',()=>{
  const samples = {
    identity:['이름이 뭐야?','Who are you?','お名前は？'],age:['몇 살이야?','How old are you?','何歳ですか？'],
    gender:['성별이 뭐야?','What is your gender?','性別は？'],race:['종족은 뭐야?','What is your race?','種族は？'],
    job:['무슨 일을 해?','What do you do?','どんな仕事ですか？'],personality:['성격이 어때?','What is your personality like?','どんな性格ですか？'],
    relationship:['우리 관계는 어때?','What is our relationship?','私たちの関係は？'],
  } as const;
  for(const [topic,texts]of Object.entries(samples))for(const text of texts)assert.equal(npcProfileQuestion(text),topic,text);
  for(const text of ['네 나이를 생각하면 어떤 여행을 추천해?','성격에 맞는 의뢰를 추천해줘','우리 관계가 앞으로 어떻게 될 것 같아?',
    'How does your age influence the way you run the inn?','What do you do and why does it matter to you?',
    'あなたの性格に合う仕事を勧めて','お名前は？それと今日は何ができる？'])assert.equal(npcProfileQuestion(text),undefined,text);
  for(const text of ['안녕. 우리 관계는 어때?','What do you do and why does it matter to you?','名前を教えて。それから天気も教えて'])assert.equal(npcHasMultipleRequests(text),true,text);
  for(const text of ['요리사가 되고 싶어. 가르쳐줘','錬金術師になりたい。教えてください。','I want to learn cooking. Please teach me.'])assert.equal(npcHasMultipleRequests(text),false,text);
});

test('unsupported context and compound questions reach live generation with the actual NPC persona',async()=>{
  const questions:Record<NpcLocale,readonly string[]>={
    ko:['네 나이를 생각하면 어떤 여행을 추천해?','여기서는 뭘 할 수 있어? 그리고 왜 그 일을 하는 거야?','하스에서 조용히 지내려면 네 생각엔 어떻게 하는 게 좋을까?','왜 마법을 배워야 한다고 생각해?'],
    en:['How does your age influence the way you run this place?','What do you offer here and why does it matter to you?','What would you personally recommend for a quiet stay in Hearth?','Why should I learn magic?'],
    ja:['その年齢で旅に出るなら何を勧める？','ここでは何ができますか？それと、なぜその仕事をしているの？','ハースで静かに過ごすなら、あなたはどうしたい？','なぜ魔法を学んだほうがいいと思う？'],
  };
  let calls=0;
  for(const id of ['rin','borin','hearth-mira','hearth-alia','redweave-voss'])for(const locale of ['ko','en','ja'] as const)for(const text of questions[locale]){
    const person=NPC_PUBLIC.find(npc=>npc.id===id)!;
    const profile=applyFantasyAction(newFantasyProfile(),{type:'create',name:'Route check',source:'human',gender:'female'},()=>.5).profile;
    profile.character!.location=person.homeLocation;
    const before=JSON.stringify(profile),bodies:{messages:{role:string;content:string}[]}[]=[];
    const chat=new NpcChat({fetch:(async(_url,init)=>{calls++;bodies.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify({choices:[{message:{content:{ko:'당신의 생각을 조금 더 들어 보고 싶어.',en:'I would like to hear a little more about your plans.',ja:'あなたの考えをもう少し聞きたいです。'}[locale]}}]}),{headers:{'Content-Type':'application/json'}});}) as typeof fetch});
    assert.equal(npcCanonicalReply(locale,id,'stranger',text,{character:profile.character!}),undefined,`${id}:${locale}:${text}`);
    const reply=await chat.chat(`route-${calls}`,{requestId:crypto.randomUUID(),npcId:id,locale,text},{character:profile.character!});
    assert.equal(reply.source,'local',`${id}:${locale}:${text}`);assert.equal(reply.error,undefined);assert.equal(bodies.length,1);
    assert.ok(bodies[0].messages[0].content.includes(person.name[locale]));
    assert.ok(bodies[0].messages.some(message=>message.role==='user'&&message.content===text));
    assert.equal(JSON.stringify(profile),before);assert.equal(reply.actions,undefined);
  }
  assert.equal(calls,60);
});

test('known short facts and missing canonical names stay immediate without fabricated facts',async()=>{
  let calls=0;
  const chat=new NpcChat({fetch:(async()=>{calls++;throw Error('No model for direct facts');}) as typeof fetch});
  for(const [locale,text]of [['ko','이름이 뭐야?'],['en','How old are you?'],['ja','カルヴェラントとは何ですか。']] as const){
    const reply=await chat.chat(`facts-${locale}`,{requestId:crypto.randomUUID(),npcId:'rin',locale,text});
    assert.equal(reply.source,'canon');assert.equal(reply.error,undefined);assert.ok(reply.text.trim());
  }
  assert.equal(calls,0);
  assert.match(npcSystemPrompt('en','rin','stranger',{},'Could you explain how an inn handles room prices?'),/natural first-person speech/);
  assert.match(npcSystemPrompt('en','rin','stranger',{},'What does the temperature mean for my plans?'),/never with numeric temperatures/);
});
