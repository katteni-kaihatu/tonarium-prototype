import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessDialogueQuality } from './dialogue-quality.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';

const query={ko:'네 나이가 이 여관을 운영하는 방식에 어떤 영향을 줘?',en:'How does your age influence the way you run this inn?',ja:'あなたの年齢は、この宿の営み方にどう影響していますか？'};
const profile=()=>applyFantasyAction(newFantasyProfile(),{type:'create',name:'Traveler',source:'human',gender:'female'}).profile;

test('the actual Korean age and hot-weather failure is diagnosed without grading unrelated known merchant history as wrong',()=>{
  const p=profile(),dynamicFacts={hour:480,location:'hearth',shops:[],rumors:[]};
  const flags=assessDialogueQuality({kind:'npc',npcId:'rin',locale:'ko',query:query.ko,profile:p,dynamicFacts,reply:'이 여관은 흐린 날씨와 더운 날씨가 동시에 있는 날이기 때문에, 객실이 조금 따뜻하고 편안한 시간이 되어줄 수도 있어.'}).flags;
  assert.deepEqual(flags,['npc_age_topic_missing','weather_conflict']);
  const actualEnglish="I'm 34, and that experience as a merchant helps me understand travelers better. It's not just age, but the way I listen and adapt that matters.";
  assert.deepEqual(assessDialogueQuality({kind:'npc',npcId:'rin',locale:'en',query:query.en,reply:actualEnglish}).flags,[]);
});

test('age influence coverage accepts experience without a literal age and never assigns someone else the NPC age',()=>{
  for(const [locale,reply] of [
    ['ko','떠돌이 상인으로 다닌 경험 덕에 지친 손님이 말을 꺼낼 때까지 기다릴 줄 알게 됐어.'],
    ['en','My years as a traveling merchant taught me to listen before offering a tired guest advice.'],
    ['ja','旅商人だった経験から、疲れたお客様の話を急がせずに聞くようにしています。'],
  ] as const)assert.deepEqual(assessDialogueQuality({kind:'npc',npcId:'rin',locale,query:query[locale],reply}).flags,[]);
  for(const [locale,question,reply] of [
    ['ko','내 나이가 여행에 어떤 영향을 줄까?','네 나이는 아직 몰라.'],
    ['en',"How does the unknown visitor's age affect travel?",'I do not know their age.'],
    ['ja','あの旅人の年齢は旅に影響しますか？','その方の年齢は知りません。'],
  ] as const)assert.deepEqual(assessDialogueQuality({kind:'npc',npcId:'rin',locale,query:question,reply}).flags,[]);
});

test('only explicit speaker age claims conflict with the public profile',()=>{
  for(const [locale,reply] of [['ko','나는 35살이야.'],['en',"I'm 35 years old."],['ja','私は35歳です。']] as const)
    assert.deepEqual(assessDialogueQuality({kind:'npc',npcId:'rin',locale,query:query[locale],reply}).flags,['npc_age_conflict']);
  for(const [locale,reply] of [['ko','나는 34살이고, 그 손님은 35살이야.'],['en',"I'm 34; the guest is 35 years old."],['ja','私は34歳で、お客様は35歳です。']] as const)
    assert.deepEqual(assessDialogueQuality({kind:'npc',npcId:'rin',locale,query:query[locale],reply}).flags,[]);
  assert.deepEqual(assessDialogueQuality({kind:'npc',npcId:'rin',locale:'en',query:query.en,reply:"I'm 34."}).flags,[]);
  assert.deepEqual(assessDialogueQuality({kind:'npc',npcId:'rin',locale:'en',query:'Tell me about your work.',reply:"I'm 35."}).flags,['npc_age_conflict']);
  for(const [locale,reply] of [['ko','그 여행자는 “나는 35살이야.”라고 했어.'],['en','The traveler said "I am 35 years old."'],['ja','その旅人は「私は35歳です」と言いました。']] as const)
    assert.deepEqual(assessDialogueQuality({kind:'npc',npcId:'rin',locale,query:'What did the traveler say?',reply}).flags,[]);
});

test('weather conflict checks use matching live state and preserve negated or hypothetical heat',()=>{
  const p=profile(),dynamicFacts={hour:480,location:'hearth',shops:[],rumors:[]};
  for(const [locale,reply] of [['ko','오늘은 더워.'],['en',"It's hot today."],['ja','今日は暑いです。']] as const)
    assert.deepEqual(assessDialogueQuality({kind:'npc',npcId:'rin',locale,query:'weather',profile:p,dynamicFacts,reply}).flags,['weather_conflict']);
  for(const [locale,reply] of [
    ['ko','오늘은 덥지도 춥지도 않아. 더운 날씨라면 물을 챙겨.'],
    ['en',"It's not hot today. If it is hot tomorrow, bring water."],
    ['ja','今日は暑くありません。もし暑い日なら、水を用意します。'],
  ] as const)assert.deepEqual(assessDialogueQuality({kind:'npc',npcId:'rin',locale,query:'weather',profile:p,dynamicFacts,reply}).flags,[]);
  assert.deepEqual(assessDialogueQuality({kind:'npc',npcId:'rin',locale:'en',query:'weather',profile:p,dynamicFacts:{...dynamicFacts,location:'other'},reply:"It's hot today."}).flags,[]);
});

test('weather assertions distinguish current conditions from quoted unknown titles and explicit denial',()=>{
  const p=profile(),dynamicFacts={hour:480,location:'hearth',shops:[],rumors:[]};
  for(const [locale,reply] of [
    ['ko','“더운 날씨”라는 시는 몰라.'],
    ['en','I do not know the poem "It is hot".'],
    ['ja','今日は暑いとは言えません。'],
    ['ja','「暑い日」という詩は知りません。'],
  ] as const)assert.deepEqual(assessDialogueQuality({kind:'npc',npcId:'rin',locale,query:'unknown poem',profile:p,dynamicFacts,reply}).flags,[],reply);
  for(const [locale,reply] of [
    ['ko','오늘은 맑아.'],['en',"It's raining."],['ja','雪が降っています。'],['en','The temperature is 30°C.'],
  ] as const)assert.deepEqual(assessDialogueQuality({kind:'npc',npcId:'rin',locale,query:'weather',profile:p,dynamicFacts,reply}).flags,['weather_conflict'],reply);
  assert.deepEqual(assessDialogueQuality({kind:'npc',npcId:'rin',locale:'en',query:'weather',profile:p,dynamicFacts,reply:"It's cloudy, at 24°C."}).flags,[]);
});

test('GM diagnostics catch the actual extra sentence and mixed Japanese register without claiming to measure vague advice',()=>{
  const actualEnglish='The best way to compose yourself is to focus on your purpose and the journey ahead, rather than your anxiety. Remind yourself of the lessons you hope to learn and the outcomes you wish to achieve. This mental clarity can help you stay grounded.';
  assert.deepEqual(assessDialogueQuality({kind:'gm',locale:'en',query:'I feel nervous before my first journey. Explain one way to compose myself before departure.',reply:actualEnglish}).flags,['sentence_limit']);
  const actualJapanese='心を落ち着けるためには、呼吸法を試してみるといい。ゆっくりと息を吐きながら、意識を集中させる練習も効果的です。';
  assert.deepEqual(assessDialogueQuality({kind:'gm',locale:'ja',query:'初めての旅を前に緊張しています。出発前に気持ちを整える方法を一つ説明してください。',reply:actualJapanese}).flags,['gm_register']);
  assert.deepEqual(assessDialogueQuality({kind:'gm',locale:'ko',query:'출발 준비 조언을 한 가지 설명해 주세요.',reply:'먼저 천천히 숨을 내쉬어. 세 번 반복하면 돼.'}).flags,['gm_register']);
  assert.deepEqual(assessDialogueQuality({kind:'gm',locale:'ko',query:'출발 준비 조언을 한 가지 설명해 주세요.',reply:'먼저 천천히 숨을 내쉬십시오. 세 번 반복하면 됩니다.'}).flags,[]);
  assert.deepEqual(assessDialogueQuality({kind:'gm',locale:'ja',query:'落ち着く方法を教えてください。',reply:'ゆっくり息を吐いてください。三回繰り返します。'}).flags,[]);
});

test('sentence bounds respect requested detail and decimal numbers',()=>{
  const reply='Wait 1.5 minutes. Breathe slowly. Then review your route.';
  assert.deepEqual(assessDialogueQuality({kind:'gm',locale:'en',query:'Explain in detail how to prepare.',reply}).flags,[]);
  assert.deepEqual(assessDialogueQuality({kind:'gm',locale:'en',query:'Give one preparation step.',reply:'Wait 1.5 minutes. Breathe slowly.'}).flags,[]);
});
