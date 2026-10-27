import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dialogueDynamicPremises, dynamicGmReply, dynamicNpcReply, npcTemperatureFeeling, type DialogueDynamicContext } from './dialogue-dynamic.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { FANTASY_DINING, FANTASY_LODGINGS } from '../shared/fantasy-life.ts';
import { fantasyEnvironment } from '../shared/fantasy-environment.ts';
import { fantasyPrice } from '../shared/fantasy-reputation.ts';
import { fantasyQuestText } from '../shared/fantasy-narrative.ts';
import { npcFacilityFacts, npcFacilityKnowledge, npcFacilityReply } from './npc-facility.ts';
import { npcBreaksFourthWall } from './npc-speech.ts';
import { NPC_PUBLIC } from '../shared/npc.ts';
import { fantasyNpcTone } from '../shared/fantasy-dialogue-voice.ts';

const profile = () => applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Traveler', source: 'human', gender: 'female' }).profile;
function facts(): DialogueDynamicContext {
  return {location:'hearth',hour:49,shops:[{building:'market',lots:[{id:'live-herb',item:'herb',count:2,unitPrice:37}],sales:[{key:'held-herb',item:'herb',count:1,unitPrice:11,canSell:true}]}],rumors:[]};
}
test('live goods prices and stock are bound anew per request, with no state mutation', () => {
  const p=profile(), state=facts(), before=structuredClone({p,state});
  const first=dynamicNpcReply('ko','hearth-alia','회복 약초 가격 알려줘',p.character!,state)!;
  assert.match(first,/37G/); assert.match(first,/2개/); assert.doesNotMatch(first,/×|현재 가격|다음과 같습니다/);
  assert.deepEqual({p,state},before);
  state.shops[0].lots[0].unitPrice=52; state.shops[0].lots[0].count=1;
  const second=dynamicNpcReply('ko','hearth-alia','회복 약초 가격 알려줘',p.character!,state)!;
  assert.match(second,/52G/); assert.doesNotMatch(second,/37G/);
  state.shops[0].lots[0].count=0;
  assert.match(dynamicNpcReply('ko','hearth-alia','회복 약초 가격 알려줘',p.character!,state)!,/없어요/);
});
test('quotes only use the speaking facility and matching current location',()=>{
  const p=profile(), state=facts();
  assert.doesNotMatch(dynamicNpcReply('ko','rin','회복 약초 가격 알려줘',p.character!,state)!,/37G/);
  state.location='other';
  assert.match(dynamicGmReply('en','price of herb',p,state)!,/unavailable/);
});
test('buying and selling quote different authoritative lots without revealing food condition',()=>{
  const p=profile(), state=facts();
  assert.match(dynamicGmReply('en','how much can i sell herb for',p,state)!,/11G/);
  assert.match(dynamicGmReply('ja','回復薬草はいくらですか',p,state)!,/37G/);
  state.shops[0].sales.push({key:'quality-lot',item:'herb',count:2,unitPrice:6,canSell:true,quality:'spoiled'});
  const result=dynamicGmReply('ko','회복 약초 팔면 얼마야',p,state)!;
  assert.match(result,/11G/);assert.match(result,/6G/);assert.doesNotMatch(result,/spoiled|상한|腐/);
});
test('rumor templates only include current-day public notices, never empty fabricated stories',()=>{
  const p=profile(), state=facts();
  state.rumors=[{hour:23,text:'old private-like sentinel'},{hour:48,text:'A public arrival.'},{hour:50,text:'future sentinel'}];
  for(const [locale,question] of [['ko','오늘 소문 알려줘'],['en','any rumors today'],['ja','今日の噂を教えて']] as const){
    const result=dynamicGmReply(locale,question,p,state)!;
    assert.match(result,/A public arrival/); assert.doesNotMatch(result,/sentinel/);
  }
  state.rumors=[];
  assert.match(dynamicGmReply('en','any news today',p,state)!,/no verified news/);
});
test('weather templates use current location and authoritative world hour in all languages',()=>{
  const p=profile(), state=facts();
  p.character!.hour=0; state.hour=1141;
  const expected=fantasyEnvironment({location:p.character!.location,hour:state.hour});
  for(const [locale,question] of [['ko','오늘 날씨 어때'],['en','what is the weather like today'],['ja','今日の天気はどうですか']] as const){
    const result=dynamicGmReply(locale,question,p,state)!;
    assert.ok(result.includes(`${expected.temperature}°C`));
  }
});
test('activity progress uses actual action, global remaining time, and fixed world rate',()=>{
  const p=profile(), state=facts();
  p.character!.hour=1;p.activity={action:{type:'work'},startedAt:48,endsAt:53,seed:1};
  const answer=dynamicGmReply('en','what am i doing now',p,state)!;
  assert.match(answer,/4\.00 game hours/);assert.match(answer,/8\.0 real minutes/);
  state.activity=p.activity;
  assert.match(dynamicNpcReply('ko','rin','내 행동 진행도 알려줘',p.character!,state)!,/약 4시간/);
  for(const [locale,question] of [['ko','무슨 행동중인데?'],['en','what am i doing now'],['ja','私の行動の残り時間を教えて']] as const){
    const text=dynamicNpcReply(locale,'rin',question,p.character!,state)!;
    assert.match(text,/4(?:시간| hours|時間)/);assert.equal(npcBreaksFourthWall(text),false,text);
    assert.doesNotMatch(text,/게임|실제|game|real minutes|ゲーム|実時間/u);
  }
  delete p.activity;
  assert.match(dynamicGmReply('en','what am i doing',p,{...state,activity:undefined})!,/No activity/);
});
test('natural Korean first-person activity questions use the actual idle or working state',()=>{
  const p=profile(), state=facts();
  for(const question of ['지금 내가 뭘 하고있어?','내가 지금 뭐 하고 있어?','저는 지금 무엇을 하고 있나요?']){
    assert.match(dynamicGmReply('ko',question,p,state)??'',/진행 중인 행동이 없습니다/,question);
    p.activity={action:{type:'work'},startedAt:48,endsAt:53,seed:1};
    assert.match(dynamicGmReply('ko',question,p,state)??'',/일\. 남은 시간은 게임 4\.00시간, 실제 약 8\.0분/,question);
    delete p.activity;
  }
});

test('activity questions about an NPC, advice, or compound requests stay outside canonical replies',()=>{
  const p=profile(), state=facts();
  for(const question of ['너는 지금 뭐하고있어?','당신은 지금 무엇을 하고 있나요?','지금 내가 뭘 하고있어? 그리고 일해줘','내가 지금 뭐 하고 있어, 일을 시작해줘','저는 지금 무엇을 하고 있나요? 그만하고 쉬게 해줘','내가 지금 뭐 하고 있어야 해?']){
    assert.equal(dynamicGmReply('ko',question,p,state),undefined,question);
    assert.equal(dynamicNpcReply('ko','rin',question,p.character!,state),undefined,question);
  }
});

test('accepted quest progress omits unaccepted quest names and other issuers for NPCs',()=>{
  const p=profile(), state=facts();
  const quest=FANTASY_QUESTS.find(q=>!q.races&&!q.families&&!q.requiresCompleted&&q.count>0)!;
  p.character!.quests=[quest.id];
  const answer=dynamicGmReply('en','my quest progress',p,state)!;
  assert.ok(answer.includes(fantasyQuestText(quest,'en').name));
  assert.ok(!dynamicNpcReply('en','rin','my quest progress',p.character!,state)!.includes(fantasyQuestText(quest,'en').name));
});
test('room and meal templates bind current server discounts rather than fixed authored prices',()=>{
  const p=profile(), state=facts();
  p.character!.bargains={room:{location:'hearth',discount:.2,expiresAt:50,nextAt:50},food:{location:'hearth',discount:.1,expiresAt:50,nextAt:50}};
  assert.ok(dynamicNpcReply('ko','rin','객실 가격 알려줘',p.character!,state)!.includes(`${fantasyPrice({...p.character!,hour:49},FANTASY_LODGINGS[0].cost,'room')}G`));
  assert.ok(dynamicNpcReply('en','rin','how much do meals cost',p.character!,state)!.includes(`${fantasyPrice({...p.character!,hour:49},FANTASY_DINING[0].cost,'food')}G`));
});
test('dynamic matchers decline compound, action, private, and unrelated queries',()=>{
  const p=profile(), state=facts();
  for(const text of ['약초 가격 알려주고 하나 사줘','what is the weather and take me to the inn','any rumors about my password','how much is herb and buy it','내 퀘스트 진행도 알려주고 완료해줘','너는 지금 뭐 하고 있어?','I like the weather','그 도시는 어디야']){
    assert.equal(dynamicGmReply('ko',text,p,state),undefined,text);
  }
});
test('broader facility replies and live model premises bind the same finite lots',()=>{
  const p=profile(),state=facts(),before=structuredClone(state);
  const text=npcFacilityReply('ko','hearth-alia','회복 약초는 얼마야?',p.character!,undefined,state)!;
  assert.match(text,/37G/);assert.match(text,/2개/);assert.doesNotMatch(text,/5G|×/);
  const premises=npcFacilityFacts('hearth-alia','en',p.character!,'healing herb',state).join(' ');
  assert.match(premises,/37G ×2/);
  assert.deepEqual(state,before);
  state.shops[0].lots[0].count=0;
  assert.equal(npcFacilityKnowledge('hearth-alia',p.character!,state).stock.includes('herb'),false);
  assert.match(npcFacilityReply('ko','hearth-alia','회복 약초는 얼마야?',p.character!,undefined,state)!,/품절/);
  const unknownPrice=npcFacilityReply('en','hearth-alia','healing herb price',p.character!)!;
  assert.doesNotMatch(unknownPrice,/\d+G/);
  assert.match(npcFacilityFacts('hearth-alia','en',p.character!,'healing herb').join(' '),/prices and quantities are unverified/);
});
test('free-answer premises are bounded fresh public records without private sale lots',()=>{
  const p=profile(),state=facts();
  state.rumors=[{hour:23,text:'OLD_SENTINEL'},{hour:48,text:'CURRENT_NEWS'},{hour:50,text:'FUTURE_SENTINEL'}];
  state.shops[0].sales[0].key='PRIVATE_SALE_SENTINEL';
  state.shops[0].sales[0].unitPrice=987654;
  for(const locale of ['ko','en','ja'] as const){
    const lines=dialogueDynamicPremises(locale,p,state,'hearth-alia','오늘 소문과 회복 약초 가격 좀 알려주실 수 있어요?');
    assert.ok(lines.length<=3);assert.ok(lines.join('\n').length<=500);
    assert.match(lines.join(' '),/CURRENT_NEWS/);assert.match(lines.join(' '),/37G ×2/);
    assert.doesNotMatch(lines.join(' '),/OLD_SENTINEL|FUTURE_SENTINEL|PRIVATE_SALE_SENTINEL|987654/);
  }
  assert.doesNotMatch(dialogueDynamicPremises('en',p,state,'rin','healing herb price').join(' '),/37G/);
  assert.deepEqual(dialogueDynamicPremises('en',p,{...state,location:'other'},undefined,'herb price'),[]);
  state.shops[0].lots[0].unitPrice=41;
  assert.match(dialogueDynamicPremises('en',p,state,undefined,'how much for herb please').join(' '),/41G/);
  state.rumors=[{hour:48,text:'long '.repeat(1000)}];
  const lines=dialogueDynamicPremises('en',p,state,undefined,'herb price');
  assert.ok(lines.length<=3);assert.ok(lines.join('\n').length<=500);
});
test('free answers select weather and news only when needed by the actual question, including compound advice',()=>{
  const p=profile(),state=facts();
  state.rumors=[{hour:48,text:'CURRENT_NEWS'}];
  for(const [locale,age,clothing,compound] of [
    ['ko','네 나이가 이 여관을 운영하는 방식에 어떤 영향을 줘?','외투를 챙겨 가는 게 좋을까?','이름이 뭐야? 그리고 오늘 날씨와 소문을 알려줘.'],
    ['en','How does your age influence the way you run this inn?','Should I bring a coat outside?','What is your name, and what weather and news should I expect today?'],
    ['ja','あなたの年齢は、この宿の営み方にどう影響していますか？','外へ出る前に上着を用意すべきですか？','名前と、今日の天気や噂を教えてください。'],
  ] as const){
    assert.deepEqual(dialogueDynamicPremises(locale,p,state,'rin',age),[],age);
    const advice=dialogueDynamicPremises(locale,p,state,'rin',clothing).join(' ');
    assert.ok(advice.length>0,clothing);assert.doesNotMatch(advice,/CURRENT_NEWS/);
    const all=dialogueDynamicPremises(locale,p,state,'rin',compound).join(' ');
    assert.match(all,/CURRENT_NEWS/);assert.ok(all.length>advice.length,compound);
  }
});
test('NPC information uses spoken sentences while GM keeps factual report wording in all languages',()=>{
  const p=profile(),state=facts();
  state.rumors=[{hour:48,text:'공동 우물 보수가 시작됐습니다.'}];
  assert.equal(dynamicNpcReply('ko','hearth-alia','회복 약초 가격 알려줘',p.character!,state),'회복 약초는 개당 37G예요. 지금 남은 건 2개고요.');
  assert.equal(dynamicNpcReply('ko','rin','오늘 소문 알려줘',p.character!,state),'마을에 이런 소식이 있더라. 공동 우물 보수가 시작됐대.');
  assert.match(dynamicGmReply('ko','오늘 소문 알려줘',p,state)!,/오늘 확인된 소식은 다음과 같습니다: 공동 우물 보수가 시작됐습니다/);
  assert.match(dynamicGmReply('ko','회복 약초 가격 알려줘',p,state)!,/현재 가격은 다음과 같습니다: 회복 약초: 37G · ×2/);
  for(const [notice,expected] of [['공동 우물 보수가 끝났습니다.','공동 우물 보수가 끝났대.'],['공동 우물 보수가 완료되었습니다.','공동 우물 보수가 완료됐대.'],['린과 알리아가 이웃의 물자를 함께 옮겼다.','린과 알리아가 이웃의 물자를 함께 옮겼대.'],['장터의 차례를 두고 다퉜다.','장터의 차례를 두고 다퉜대.']] as const){
    state.rumors=[{hour:48,text:notice}];
    assert.equal(dynamicNpcReply('ko','rin','오늘 소문 알려줘',p.character!,state),`마을에 이런 소식이 있더라. ${expected}`);
  }
  for(const [locale,notice,expected] of [['en','Repairs to the shared well are complete.',"They've finished repairing the shared well."],['ja','共同井戸の修理が始まりました。','共同井戸の修理が始まったそうですよ。'],['ja','共同井戸の修理が終わりました。','共同井戸の修理が終わったそうですよ。']] as const){
    state.rumors=[{hour:48,text:notice}];
    assert.ok(dynamicNpcReply(locale,'rin',({en:'any rumors today',ja:'今日の噂を教えて'})[locale],p.character!,state)!.includes(expected));
  }
  for(const npc of NPC_PUBLIC){
    const c={...p.character!,location:npc.homeLocation}, current={...state,location:npc.homeLocation};
    for(const [locale,questions] of [
      ['ko',['오늘 날씨 어때','오늘 소문 알려줘','내 행동 진행도 알려줘','내 퀘스트 진행도 알려줘','회복 약초 가격 알려줘','회복 약초 팔면 얼마야','객실 가격 알려줘']],
      ['en',['what is the weather like today','any rumors today','what am i doing now','my quest progress','price of herb','how much can i sell herb for','how much do rooms cost']],
      ['ja',['今日の天気はどうですか','今日の噂を教えて','私の行動の残り時間を教えて','私の依頼の進み具合を教えて','回復薬草はいくらですか','回復薬草を売るといくら','部屋の料金を教えて']],
    ] as const) for(const question of questions){
      current.rumors=[{hour:48,text:({ko:'공동 우물 보수가 시작됐습니다.',en:'Repairs to the shared well have begun.',ja:'共同井戸の修理が始まった。'})[locale]}];
      const answer=dynamicNpcReply(locale,npc.id,question,c,current);
      assert.ok(answer,`${npc.id}/${locale}/${question}`);
      assert.equal(npcBreaksFourthWall(answer),false,answer);
      assert.doesNotMatch(answer,/현재 가격|현재 진행 상황|오늘 확인된 소식|다음과 같습니다|Current prices:|Current progress:|News confirmed today:|現在の価格：|現在の進み具合：|今日確認された知らせ：|×\d|\d+\/\d+/u,answer);
    }
  }
});
test('NPCs describe temperature as a feeling with distinct occupational voices while GM retains measurements',()=>{
  for(const [temperature,feeling] of [[-1,'freezing'],[0,'cold'],[9,'cold'],[10,'cool'],[16,'cool'],[17,'mild'],[24,'mild'],[25,'hot'],[30,'hot'],[31,'scorching']] as const)assert.equal(npcTemperatureFeeling(temperature),feeling);
  const p=profile(),representatives=[...new Map(NPC_PUBLIC.map(npc=>[fantasyNpcTone(npc.id),npc])).values()];
  assert.equal(representatives.length,8);
  for(const [locale,question] of [['ko','오늘 날씨 어때'],['en','what is the weather like today'],['ja','今日の天気はどうですか']] as const){
    const answers=[];
    for(const npc of representatives){
      const hour=Array.from({length:3000},(_,i)=>i).find(hour=>{const e=fantasyEnvironment({location:npc.homeLocation,hour});return e.weather==='cloudy'&&npcTemperatureFeeling(e.temperature)==='mild';});
      assert.notEqual(hour,undefined,npc.id);
      const c={...p.character!,location:npc.homeLocation,hour:0},state={...facts(),location:npc.homeLocation,hour:hour!};
      const answer=dynamicNpcReply(locale,npc.id,question,c,state)!;
      assert.equal(npcBreaksFourthWall(answer),false,answer);assert.doesNotMatch(answer,/\d|°|℃|temperature is|기온은|気温は/u,answer);
      const premises=dialogueDynamicPremises(locale,{...p,character:c},state,npc.id,question);
      assert.ok(premises[0]);assert.doesNotMatch(premises[0],/\d|°|℃/u,premises[0]);
      answers.push(answer);
      const gm=dynamicGmReply(locale,question,{...p,character:c},state)!;
      assert.ok(gm.includes(`${fantasyEnvironment({location:npc.homeLocation,hour:hour!}).temperature}°C`));
    }
    assert.equal(new Set(answers).size,8,locale);
  }
});
test('dynamic replies leave detailed interpretation, compound requests and unsupported intent for live dialogue',()=>{
  const p=profile(),state=facts();
  for(const [locale,question] of [['ko','오늘 날씨가 내 작물에 어떤 영향을 줄까?'],['ko','오늘 소문을 듣고 어디로 가면 좋을까?'],['en','How would this weather affect the books I carry?'],['en','Tell me the price and whether I should buy it'],['ja','今日の天気は私の畑にどう影響しますか？'],['ja','今日の噂を聞いて、どこへ行けばいいと思う？']] as const)assert.equal(dynamicNpcReply(locale,'rin',question,p.character!,state),undefined,question);
});
