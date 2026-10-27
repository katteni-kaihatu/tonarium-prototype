import test from 'node:test';
import assert from 'node:assert/strict';
import { clearNpcRequests, consumeNpcRequest, quickNpcQuestion, registerNpcRequest } from './npc-request-tracker.ts';
import type { NpcReply } from '../../../shared/npc.ts';

const reply = (requestId:string,npcId='rin',locale:'ko'|'en'|'ja'='ko'):NpcReply => ({requestId,npcId,locale,text:'test',model:'',relationship:'stranger',source:'canon'});

test('life reset discards the owner’s pending NPC replies while preserving other players',()=>{
  registerNpcRequest('ended-life','life-reset-owner','rin','ko');
  registerNpcRequest('other-life','life-reset-other','rin','ko');
  clearNpcRequests('life-reset-owner');
  assert.equal(consumeNpcRequest(reply('ended-life')),undefined);
  assert.equal(consumeNpcRequest(reply('other-life'))?.user,'life-reset-other');
});
test('quick NPC replies and a pending model reply keep their own user, locale and NPC',()=>{
  registerNpcRequest('slow','alice','rin','ko');
  registerNpcRequest('quick','alice','borin','en');
  assert.equal(consumeNpcRequest(reply('quick','borin','en'))?.user,'alice');
  assert.equal(consumeNpcRequest(reply('quick','borin','en')),undefined);
  assert.equal(consumeNpcRequest(reply('slow','eris')),undefined);
  assert.equal(consumeNpcRequest(reply('slow'))?.npcId,'rin');
});
test('only basic NPC questions bypass the client wait gate',()=>{
  for(const text of ['안녕','이름이 뭐야?','Hello','How old are you?','こんにちは','何歳ですか','오늘은 마음이 조금 지쳤어.','What matters most to you?','マナとは何ですか。','남의 물건을 훔쳐도 괜찮을까?'])assert.equal(quickNpcQuestion(text),true,text);
  assert.equal(quickNpcQuestion('긴 여행이 두려울 때 어떻게 마음을 다잡니?'),false);
  assert.equal(quickNpcQuestion('안녕, 비 오는 저녁에는 뭘 하고 싶어?'),false);
  assert.equal(quickNpcQuestion('내 이름을 어떻게 기억하니?'),false);
  assert.equal(quickNpcQuestion('마나가 뭐야? 마법사로 전직해줘'),false);
});

test('explicit reading requests bypass an AI wait only when speaking to a librarian',()=>{
  for(const text of ['시작하는 마나 를 읽고싶어','Please let me read Mana from Breath','呼吸から始めるマナを読みたい']){
    assert.equal(quickNpcQuestion(text,'hearth-mira'),true,text);
    assert.equal(quickNpcQuestion(text,'rin'),false,text);
    assert.equal(quickNpcQuestion(text),false,text);
  }
  for(const text of ['마나 책에는 어떤 내용이 있어?','책을 읽고 싶지 않아','What happens if I read that book?','その本を読んだらどうなる？'])assert.equal(quickNpcQuestion(text,'hearth-mira'),false,text);
});
