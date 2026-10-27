import test from 'node:test';
import assert from 'node:assert/strict';
import { NPC_PUBLIC, type NpcLocale } from '../shared/npc.ts';
import { NPC_SERVER } from './npc-catalog.ts';
import { npcPreferenceFacts } from '../shared/fantasy-npc-preferences.ts';
import { NPC_PERSONA_DIALOGUE, NPC_PERSONA_TOPICS, npcPersonaReply } from './npc-persona-lines.ts';
import { preparedNpcReply } from './dialogue-prewritten.ts';
import { PREWRITTEN_QUESTIONS } from '../shared/fantasy-dialogue-topics.ts';
import { npcBreaksFourthWall } from './npc-speech.ts';

const locales:NpcLocale[]=['ko','en','ja'];
test('authored profession stances and personal habits are spoken directly in all languages',()=>{
  assert.equal(Object.keys(NPC_PERSONA_DIALOGUE).length,8);
  const corpus:string[]=[];
  for(const npc of NPC_PUBLIC)for(const locale of locales)for(const topic of NPC_PERSONA_TOPICS){
    const line=npcPersonaReply(npc.id,locale,topic)!;
    assert.ok(line&&line.length<400,`${npc.id}/${locale}/${topic}`);
    assert.equal(npcBreaksFourthWall(line),false,line);
    assert.ok([...new Intl.Segmenter(locale,{granularity:'sentence'}).segment(line)].filter(part=>part.segment.trim()).length<=2,line);
    assert.equal(preparedNpcReply(npc.id,'stranger',locale,PREWRITTEN_QUESTIONS[topic][locale][0])!.text,line);
    if(topic==='wellbeing')assert.ok(line.includes(npcPreferenceFacts(npc.id,locale)[1]));
    corpus.push(line);
  }
  for(const npc of Object.values(NPC_SERVER))for(const secret of npc.privateSecrets.filter(Boolean))assert.ok(!corpus.join('\n').includes(secret));
  assert.equal(npcPersonaReply('missing','ko','values'),undefined);
  assert.equal(npcPersonaReply('rin','ko','greeting'),undefined);
});
test('the same social question expresses eight different professional priorities instead of a common ending',()=>{
  const speakers=['rin','hearth-alia','borin','hearth-mira','hearth-iona','hearth-daren','redweave-voss','emberhall-pell'];
  for(const locale of locales)for(const topic of NPC_PERSONA_TOPICS){
    const lines=speakers.map(npc=>npcPersonaReply(npc,locale,topic)!);
    assert.equal(new Set(lines).size,8,`${locale}/${topic}`);
  }
  assert.match(npcPersonaReply('borin','ko','tired')!,/손|힘|실수/u);
  assert.match(npcPersonaReply('hearth-alia','en','tired')!,/purchase|promise/u);
  assert.match(npcPersonaReply('hearth-mira','ja','worried')!,/確かめ|推測/u);
  assert.match(npcPersonaReply('redweave-voss','en','lonely')!,/trust/u);
});
