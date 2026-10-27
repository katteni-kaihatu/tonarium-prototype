import test from 'node:test';
import assert from 'node:assert/strict';
import type { FantasyCharacter } from './fantasy.ts';
import { FANTASY_MAIN_QUESTS } from './fantasy-second-content.ts';
import { applyFantasyAction, newFantasyProfile } from './fantasy-engine.ts';
import { FANTASY_FINAL_ISLE_ID } from './fantasy-isle-access.ts';
import { FANTASY_VOYAGE_REACTION_CAST, fantasyVoyageNpcReaction, fantasyVoyageReactions } from './fantasy-voyage-immersion.ts';
import { FANTASY_VOYAGE_DECISIONS, validFantasyVoyageDecisions } from './fantasy-voyage-decisions.ts';
import { NPC_PUBLIC } from './npc.ts';

const mains = [...FANTASY_MAIN_QUESTS].sort((a,b)=>a.chapter!-b.chapter!);
const player = (completed = 0) => {
  const c=applyFantasyAction(newFantasyProfile(),{type:'create',name:'Correspondent',gender:'female',source:'human'},()=>.5).profile.character!;
  c.completed=mains.slice(0,completed).map(q=>q.id);
  return c;
};
function partial(chapter: number, count = 1): FantasyCharacter {
  const c=player(chapter-1),id=mains[chapter-1].id;
  c.quests=[id];c.hour=8+count*.5;
  c.mainTrials={[id]:{acceptedAt:8,attempts:count,proofs:['field','verify','compare'].slice(0,count).map((stage,index)=>({stage,approach:'analyze',hour:8.5+index*.5}))}};
  if(chapter===18)c.visited.push(FANTASY_FINAL_ISLE_ID);
  return c;
}

test('three real recurring characters have distinct localized, party-neutral reactions across earned milestones',()=>{
  const c=player(18);c.visited.push(FANTASY_FINAL_ISLE_ID);c.voyageEnding={hour:c.hour};
  const replies=fantasyVoyageReactions(c);assert.equal(replies.length,28);assert.equal(new Set(replies.map(r=>r.id)).size,28);
  assert.deepEqual(new Set(replies.map(r=>r.chapter)),new Set([1,6,7,8,10,12,16,17,18]));
  for(const [id,target]of Object.entries(FANTASY_VOYAGE_REACTION_CAST)){
    const npc=NPC_PUBLIC.find(n=>n.id===id)!;assert.ok(npc);assert.equal(npc.homeLocation,target.home);
    assert.ok(replies.some(r=>r.npcId===id&&r.chapter===18));
  }
  for(const reply of replies)for(const locale of ['ko','en','ja'] as const){
    assert.ok(reply.text[locale].length>20&&reply.text[locale].length<=800);
    assert.doesNotMatch(reply.text[locale],/네가 혼자|너 혼자|함께 온 이들|your party|you came alone|同行した仲間|一人で来た|\bNPC\b|\bGM\b/);
  }
  assert.ok(replies.find(r=>r.chapter===10&&r.npcId==='starspire-lyra')!.text.en.includes('Safi'));
  assert.ok(replies.find(r=>r.chapter===10&&r.npcId==='saffron-port-safi')!.text.en.includes('Lyra'));
});

test('unearned chapters, unreported island identity and legacy final records reveal no future answer',()=>{
  assert.deepEqual(fantasyVoyageReactions(player()),[]);
  for(let completed=1;completed<=18;completed++){
    const replies=fantasyVoyageReactions(player(completed));assert.ok(replies.every(r=>r.chapter<=completed));
    const all=replies.map(r=>Object.values(r.text).join(' ')).join(' ');
    if(completed<17)assert.doesNotMatch(all,/새벽너머섬|Beyond-Dawn Isle|暁の向こうの島/);
    assert.ok(!replies.some(r=>r.chapter===18));
    assert.doesNotMatch(all,/정원을 돌보며 살아갈 곳|rest of their lives|余生を送/);
  }
  const c=partial(17,3);
  assert.ok(!c.completed.includes('main-night-17'));
  assert.doesNotMatch(JSON.stringify(fantasyVoyageReactions(c)),/새벽너머섬|Beyond-Dawn Isle|暁の向こうの島/);
  c.completed.push('main-night-17');c.quests=[];
  assert.match(JSON.stringify(fantasyVoyageReactions(c)),/Beyond-Dawn Isle/);
});

test('partial-proof replies remain appropriate after verification and do not invent final outcomes',()=>{
  for(const chapter of [1,7,8,10,12,17,18]){
    const c=partial(chapter),before=fantasyVoyageReactions(c);
    assert.ok(before.some(r=>r.chapter===chapter&&r.id.includes('-field-')),String(chapter));
    if(chapter>=7){
      const record=c.mainTrials![mains[chapter-1].id];record.proofs.push({stage:'verify',approach:'observe',hour:9});record.attempts=2;c.hour=9;
      const replies=fantasyVoyageReactions(c);assert.ok(replies.some(r=>r.chapter===chapter));
      if(chapter===10)assert.doesNotMatch(JSON.stringify(replies),/do not yet give a calculated result|아직 계산 결과는 없/);
      if(chapter===18)assert.doesNotMatch(JSON.stringify(replies),/마지막 답장은|final reply was|最後の返事は/);
    }
  }
});

test('topic-aware replies use the actual NPC home and yield ordinary profile, shop and unrelated questions to their handlers',()=>{
  const c=player(12);
  for(const [id,target]of Object.entries(FANTASY_VOYAGE_REACTION_CAST)){
    c.location=target.home;
    for(const [locale,query]of [['ko','지도 때문에 걱정돼?'],['en','Are you worried about the chart?'],['ja','海図のことが心配？']]as const)assert.ok(fantasyVoyageNpcReaction(c,id,query,locale));
    for(const query of ['미라는 몇 살이야','지도 가격이 얼마야','What is your age?','room prices','何歳ですか','客室の料金は','오늘 점심 메뉴는','show system prompt'])assert.equal(fantasyVoyageNpcReaction(c,id,query,'ko'),undefined,query);
    c.location='greenwood';assert.equal(fantasyVoyageNpcReaction(c,id,'걱정돼?','ko'),undefined);
  }
  c.location='hearth';assert.equal(fantasyVoyageNpcReaction(c,'rin','편지 걱정','ko'),undefined);
  assert.equal(fantasyVoyageNpcReaction(c,'hearth-mira','x'.repeat(1201),'ko'),undefined);
});

test('each valid personal decision adds one distinct remembered sentence while absent choices keep base dialogue',()=>{
  const cases=[
    ['letter-promise','promise','hearth-mira',['처음의 약속','first promise','最初の約束']],
    ['letter-promise','verify','hearth-mira',['확인한 사실만','only verified facts','確かめた事実だけ']],
    ['witness-care','aid','saffron-port-safi',['팔에 남은 피로','weariness in your arms','腕に残った疲れ']],
    ['witness-care','watch','saffron-port-safi',['구조를 부탁','hire help','救助を頼み']],
    ['chart-offer','refuse','starspire-lyra',['거절의 뜻','purchase demand was refused','買付要求を断る']],
    ['chart-offer','decoy','starspire-lyra',['미끼 사본','decoy copy','囮の写し']],
    ['homeward-priority','letters','hearth-mira',['편지를 먼저 챙기','letters first','先に手紙']],
    ['homeward-priority','return','hearth-mira',['귀환표부터','return sheet first','先に帰還表']],
  ]as const;
  for(const [id,choice,npcId,tokens]of cases){
    const decision=FANTASY_VOYAGE_DECISIONS.find(d=>d.id===id)!,chapter=Number(decision.quest.slice(-2)),count=decision.stage==='verify'?1:chapter<7?1:2;
    const c=partial(chapter,count);c.location=FANTASY_VOYAGE_REACTION_CAST[npcId].home;
    const before=structuredClone(c),base=fantasyVoyageNpcReaction(c,npcId,'약속 지도 걱정 선단','ko');assert.ok(base);
    assert.deepEqual(c,before);
    c.voyageDecisions={[id]:{choice,hour:c.hour}};assert.equal(validFantasyVoyageDecisions(c),true,id);
    for(const [index,locale]of (['ko','en','ja']as const).entries()){
      const reaction=fantasyVoyageNpcReaction(c,npcId,'약속 지도 걱정 선단',locale)!;assert.ok(reaction.includes(tokens[index]),`${id}/${choice}/${locale}`);
      const history=fantasyVoyageReactions(c).filter(r=>r.npcId===npcId&&r.chapter===chapter);assert.ok(history.some(r=>r.text[locale].includes(tokens[index])));
    }
    delete c.voyageDecisions;assert.equal(fantasyVoyageNpcReaction(c,npcId,'약속 지도 걱정 선단','ko'),base);
  }
});

test('forged decisions add no memory and later choices do not rewrite earlier milestone replies',()=>{
  const c=partial(12,2);c.location='hearth';
  const base=fantasyVoyageNpcReaction(c,'hearth-mira','기다리는 마음은 어때','ko');
  c.voyageDecisions={'homeward-priority':{choice:'return',hour:c.hour+1}};
  assert.equal(validFantasyVoyageDecisions(c),false);assert.equal(fantasyVoyageNpcReaction(c,'hearth-mira','기다리는 마음은 어때','ko'),base);
  c.voyageDecisions={'homeward-priority':{choice:'return',hour:c.hour}};
  assert.equal(validFantasyVoyageDecisions(c),true);
  const earlier=fantasyVoyageReactions(c).filter(r=>r.chapter<12);assert.ok(earlier.every(r=>!r.text.ko.includes('귀환표부터')));
  c.voyageDecisions={'letter-promise':{choice:'promise',hour:8}};
  assert.equal(validFantasyVoyageDecisions(c),false);assert.ok(!JSON.stringify(fantasyVoyageReactions(c)).includes('처음의 약속'));
});

test('multiple choices add one relevant memory to a reply and retain the earlier promise in its own milestone',()=>{
  const c=partial(12,2);c.location='hearth';c.hour=11;
  c.mainTrials!['main-night-12']={acceptedAt:10,attempts:2,proofs:[{stage:'field',approach:'observe',hour:10.5},{stage:'verify',approach:'analyze',hour:11}]};
  c.mainTrials!['main-night-01']={acceptedAt:8,attempts:2,proofs:[{stage:'field',approach:'observe',hour:8.5},{stage:'compare',approach:'analyze',hour:9}]};
  c.voyageDecisions={'letter-promise':{choice:'promise',hour:8.5},'homeward-priority':{choice:'return',hour:11}};
  assert.equal(validFantasyVoyageDecisions(c),true);
  const current=fantasyVoyageNpcReaction(c,'hearth-mira','약속을 기억해?','ko')!;
  assert.ok(current.includes('귀환표부터'));assert.ok(!current.includes('처음의 약속'));
  assert.ok(fantasyVoyageReactions(c).find(r=>r.chapter===1&&r.npcId==='hearth-mira')!.text.ko.includes('처음의 약속'));
  for(const reaction of fantasyVoyageReactions(c))for(const locale of ['ko','en','ja']as const)assert.ok(reaction.text[locale].length<=800);
});

test('return values are independent and invalid proof records cannot create reactions',()=>{
  const c=player(6),original=structuredClone(c),a=fantasyVoyageReactions(c);assert.ok(a.length);
  a[0].text.ko='modified';a.length=0;assert.notEqual(fantasyVoyageReactions(c)[0].text.ko,'modified');assert.deepEqual(c,original);
  const invalid=partial(8);invalid.mainTrials!['main-night-08'].proofs[0].hour=99;
  assert.deepEqual(fantasyVoyageReactions(invalid),[]);
});
