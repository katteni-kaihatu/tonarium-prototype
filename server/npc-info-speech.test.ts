import test from 'node:test';
import assert from 'node:assert/strict';
import { NPC_PUBLIC, type NpcLocale } from '../shared/npc.ts';
import { FANTASY_TERMS } from '../shared/fantasy-lore.ts';
import { applyFantasyAction, newFantasyProfile } from '../shared/fantasy-engine.ts';
import { fantasyCompanyCapacity, fantasySpellCapacity, type FantasyCompanyKind } from '../shared/fantasy-specializations.ts';
import { npcBreaksFourthWall } from './npc-speech.ts';
import { npcInformationSpeech, npcSpecializationSpeech, npcDefinitionSpeech, npcPersonalitySpeech, npcRelationshipSpeech } from './npc-info-speech.ts';

const locales:NpcLocale[]=['ko','en','ja'];
const numbers=(text:string)=>[...text.matchAll(/\d+(?:\.\d+)?/gu)].map(row=>row[0]).sort();
const profile=()=>applyFantasyAction(newFantasyProfile(),{type:'create',name:'Speech test',source:'human',gender:'female'},()=>.5).profile;

test('relationship stages reflect the actual relationship in clearly different voices without claiming shared incidents',()=>{
  const speakers=['rin','hearth-alia','borin','hearth-mira','hearth-iona','hearth-daren','redweave-voss','emberhall-pell'];
  for(const locale of locales)for(const relationship of ['stranger','familiar','trusted'] as const){
    const lines=speakers.map(id=>npcRelationshipSpeech(id,relationship,locale,true)!);
    assert.equal(new Set(lines).size,speakers.length,`${locale}/${relationship}`);
  }
  for(const npc of NPC_PUBLIC)for(const locale of locales){
    const first=npcRelationshipSpeech(npc.id,'stranger',locale,false)!;
    const familiar=npcRelationshipSpeech(npc.id,'familiar',locale,true)!;
    const trusted=npcRelationshipSpeech(npc.id,'trusted',locale,true)!;
    assert.notEqual(first,familiar);assert.notEqual(first,trusted);assert.notEqual(familiar,trusted);
    for(const line of [first,familiar,trusted]){
      assert.equal(npcBreaksFourthWall(line),false,`${npc.id}/${locale}:${line}`);
      assert.ok([...new Intl.Segmenter(locale,{granularity:'sentence'}).segment(line)].filter(part=>part.segment.trim()).length<=2,line);
      assert.doesNotMatch(line,/\d|함께.*(?:먹었|싸웠|구했)|할인|discount|secret|秘密|割引/iu,line);
    }
  }
  assert.equal(npcRelationshipSpeech('unknown','trusted','ko'),undefined);
});

test('public community counters become sentences without losing or changing numeric facts',()=>{
  const lines={ko:'이 지역의 공동 준비 기록: 물자 준비 1/3, 2; 공동 보수 0/3, 4.',en:'Shared preparations in this settlement: Supplies 1/3, 2; Repairs 0/3, 4.',ja:'この土地の共同準備記録：物資準備 1/3, 2; 共同補修 0/3, 4。'};
  for(const npc of ['rin','borin','hearth-mira','hearth-alia'])for(const locale of locales){
    const spoken=npcInformationSpeech(npc,locale,lines[locale]);
    assert.deepEqual(numbers(spoken),numbers(lines[locale]));
    assert.doesNotMatch(spoken,/\d\/\d|(?:공동 준비 기록|preparations in this settlement|共同準備記録)[:：]/u);
    assert.equal(npcBreaksFourthWall(spoken),false);
  }
});

test('known civic prose and past lives retain public facts in spoken sentences',()=>{
  const source='이곳의 옛 여행자 기록: 아렌, 기사. 생전에 이 지역을 방문했고 7개의 의뢰를 마쳤다. 이 인물은 이미 삶을 마쳤으며 기록은 남아 있다.';
  const spoken=npcInformationSpeech('rin','ko',source);
  assert.match(spoken,/아렌.*기사.*7개.*세상을 떠났지만.*발자취/su);
  assert.deepEqual(numbers(spoken),['7']);assert.doesNotMatch(spoken,/기록:/u);
  assert.equal(npcInformationSpeech('hearth-mira','ko','공동 우물 보수가 시작됐습니다.'),'공동 우물 보수가 시작됐어요.');
  assert.equal(npcInformationSpeech('rin','ko','공동 우물 보수가 끝났습니다.'),'공동 우물 보수가 끝났어.');
});

test('every public glossary definition avoids report labels and fourth-wall currency wording in all languages',()=>{
  for(const npc of ['rin','borin','hearth-mira'])for(const locale of locales)for(const term of FANTASY_TERMS){
    const spoken=npcDefinitionSpeech(npc,locale,term);
    assert.ok(spoken.trim(),`${npc}/${term.id}/${locale}`);
    assert.ok(!spoken.startsWith(term.names[locale]+':')&&!spoken.startsWith(term.names[locale]+'：'),`${npc}/${term.id}/${locale}`);
    assert.equal(npcBreaksFourthWall(spoken),false,`${npc}/${term.id}/${locale}:${spoken}`);
    if(term.id!=='gold')assert.deepEqual(numbers(spoken),numbers(term.summary[locale].toLowerCase().startsWith(term.names[locale].toLowerCase())?term.summary[locale]:term.names[locale]+' '+term.summary[locale]),`${term.id}/${locale}`);
  }
});

test('currency and factual explanations express eight different priorities without changing the facts',()=>{
  const speakers=['rin','hearth-alia','borin','hearth-mira','hearth-iona','hearth-daren','redweave-voss','emberhall-pell'];
  for(const locale of locales)for(const id of ['gold','mana','herb']){
    const term=FANTASY_TERMS.find(term=>term.id===id)!;
    const lines=speakers.map(npc=>npcDefinitionSpeech(npc,locale,term));
    assert.equal(new Set(lines).size,8,`${locale}/${id}`);
    for(const line of lines)assert.equal(npcBreaksFourthWall(line),false,line);
  }
});

test('specialty dialogue uses the actual company roster and current spell capacity without mutation or UI language',()=>{
  const p=profile(),c=p.character!;
  for(const [job,kind] of [['leader','troop'],['crimeboss','syndicate'],['summoner','summons']] as const){
    c.job=job;c.jobXp[job]=31;
    c.specialization={companies:{[kind]:{members:[{id:kind==='troop'?'troop-guard':kind==='syndicate'?'syndicate-runner':'summon-wisp',hp:17,condition:'injured',assigned:false,missions:2}]}}};
    const before=JSON.stringify(c);
    for(const locale of locales){const spoken=npcSpecializationSpeech('rin',c,locale);assert.ok(spoken.includes('17'));assert.ok(spoken.includes(String(fantasyCompanyCapacity(c,kind as FantasyCompanyKind))));assert.equal(npcBreaksFourthWall(spoken),false,spoken);assert.doesNotMatch(spoken,/HP|MP|\d\/\d|[:：]/u);}
    assert.equal(JSON.stringify(c),before);
  }
  c.job='mage';c.jobXp.mage=50;
  for(const locale of locales){const text=npcSpecializationSpeech('hearth-mira',c,locale);assert.ok(text.includes(String(fantasySpellCapacity(c))));assert.ok(text.includes('3'));assert.equal(npcBreaksFourthWall(text),false);}
  c.job='alchemist';for(const locale of locales)assert.equal(npcBreaksFourthWall(npcSpecializationSpeech('hearth-mira',c,locale)),false);
});

test('race definitions speak attribute changes and physical traits without catalog labels',()=>{
  for(const term of FANTASY_TERMS.filter(term=>term.category==='race'))for(const locale of locales){
    const text=npcDefinitionSpeech('hearth-mira',locale,term);
    assert.doesNotMatch(text,/[:：]|능력 보정|신체 특성|Attribute changes|Body traits|身体特性/u,`${term.id}/${locale}:${text}`);
    for(const value of term.summary[locale].match(/[+-]\d+/gu)??[])assert.ok(text.includes(value),`${term.id}/${locale}:${value}`);
  }
  for(const locale of locales)assert.doesNotMatch(npcDefinitionSpeech('rin',locale,FANTASY_TERMS.find(term=>term.id==='calendar')!),/이야기|story|物語/iu);
});

test('personality answers use each own public character trait instead of reciting speech instructions',()=>{
  for(const npc of NPC_PUBLIC)for(const locale of locales){const text=npcPersonalitySpeech(npc.id,locale);assert.ok(text.trim());assert.equal(npcBreaksFourthWall(text),false,`${npc.id}/${locale}:${text}`);assert.ok(!text.includes(npc.speech[locale]),npc.id);}
  assert.match(npcPersonalitySpeech('borin','en'),/^I'm reserved and practical\. I value/u);
  assert.equal(npcPersonalitySpeech('hearth-alia','en'),'I listen patiently but am clear about promises.');
  assert.equal(npcPersonalitySpeech('redweave-voss','en'),'I dislike boasting and check the limits of each agreement.');
  assert.match(npcPersonalitySpeech('eris','en'),/I distinguish evidence/u);
  assert.match(npcPersonalitySpeech('hearth-mira','ja'),/重んじています。$/u);
  assert.match(npcPersonalitySpeech('rin','ja'),/聞くよ。$/u);
  assert.match(npcPersonalitySpeech('rin','ko'),/^나는 차분하고 친근하며/u);
});
