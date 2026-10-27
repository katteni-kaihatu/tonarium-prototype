import type { FantasyProfile } from '../shared/fantasy.ts';
import { NPC_PUBLIC, type NpcId, type NpcLocale } from '../shared/npc.ts';
import { fantasyConversationPlan } from '../shared/fantasy-gm-context.ts';
import { fantasyEnvironment } from '../shared/fantasy-environment.ts';
import type { DialogueDynamicContext } from './dialogue-dynamic.ts';

export type DialogueQualityFlag = 'npc_age_conflict' | 'npc_age_topic_missing' | 'weather_conflict' | 'sentence_limit' | 'gm_register';
export interface DialogueQualityInput {
  kind: 'npc' | 'gm'; locale: NpcLocale; query: string; reply: string; npcId?: NpcId;
  dynamicFacts?: DialogueDynamicContext; profile?: FantasyProfile;
}
export function npcSelfAgeQuestion(query: string): boolean {
  return /(?:네|너의|당신의|자네의)\s*(?:나이|연세)|(?:너|당신|자네)(?:는|가)?\s*몇\s*살|\b(?:your age|how old are you)\b|あなたの(?:年齢|歳)|あなたは何歳/iu.test(query.normalize('NFKC'));
}
function spokenAge(reply: string, locale: NpcLocale): number | undefined {
  const pattern = locale==='ko' ? /(?:^|[.!?。！？]\s*)(?:(?:나는|난|저는|전|내\s*나이는|제\s*나이는)\s*)?(\d{1,3})\s*(?:살|세)/u
    : locale==='ja' ? /(?:^|[.!?。！？]\s*)(?:(?:私は|僕は|俺は|年齢は)\s*)?(\d{1,3})歳/u
    : /(?:^|[.!?。！？]\s*)(?:i am|i'm|my age is)\s+(\d{1,3})(?:\s+years? old)?\b/iu;
  const match=reply.normalize('NFKC').replace(/’/gu,"'").match(pattern);
  return match ? Number(match[1]) : undefined;
}
function weatherConflict(input: DialogueQualityInput, sentences: string[]): boolean {
  const character=input.profile?.character, facts=input.dynamicFacts;
  if(!character||!facts||facts.location!==character.location)return false;
  if(input.kind==='npc'&&NPC_PUBLIC.find(npc=>npc.id===input.npcId)?.homeLocation!==character.location)return false;
  const actual=fantasyEnvironment({location:character.location,hour:facts.hour});
  for(const sentence of sentences){
    const text=sentence.replace(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"]*"/gu,'').normalize('NFKC').toLowerCase()
      .replace(/(?:暑い|寒い|晴れている|曇っている|雨が降っている|雪が降っている)(?:とは|と)(?:言え|いえ|断定でき|確認でき)(?:ません|ない)/gu,'');
    if(/\b(?:if|when|would|could|tomorrow|yesterday)\b|내일|어제|라면|다면|경우|もし|なら|場合|明日|昨日/u.test(text))continue;
    const hot=/더운\s*날씨|(?:오늘|지금|밖은|바깥은|날씨)[^.!?。！？]{0,24}?(?:더워(?:요|서|[.!?。！？]|$)|덥(?:다|네|군|습니다|고))|\b(?:it's|it is|today is|the weather is)\s+(?:(?:very|quite|rather|a little)\s+)*(?:hot|sweltering)\b|(?:今日は|今は|外は|天気は)[^。！？]{0,16}?(?:暑い|蒸し暑い)/u.test(text);
    const cold=/추운\s*날씨|(?:오늘|지금|밖은|바깥은|날씨)[^.!?。！？]{0,24}?(?:추워(?:요|서|[.!?。！？]|$)|춥(?:다|네|군|습니다|고))|\b(?:it's|it is|today is|the weather is)\s+(?:(?:very|quite|rather|a little)\s+)*(?:cold|freezing)\b|(?:今日は|今は|外は|天気は)[^。！？]{0,16}?寒い/u.test(text);
    if(hot&&actual.temperature<25||cold&&actual.temperature>=17)return true;
    const claims={
      clear: /^(?:오늘은\s*|지금은\s*)?맑(?:아|군|습니다)|\b(?:it's|it is|the weather is)\s+clear\b|^(?:今日は|今は|外は)?晴れて(?:います|いる)/u,
      cloudy: /^(?:오늘은\s*|지금은\s*)?흐(?:려|리군|립니다)|\b(?:it's|it is|the weather is)\s+cloudy\b|^(?:今日は|今は|外は)?曇って(?:います|いる)/u,
      rain: /^(?:오늘은\s*|지금은\s*)?비가\s*(?:와|옵니다)|\b(?:it's|it is)\s+raining\b|^(?:今日は|今は|外は)?雨が降って(?:います|いる)/u,
      snow: /^(?:오늘은\s*|지금은\s*)?눈이\s*(?:와|옵니다)|\b(?:it's|it is)\s+snowing\b|^(?:今日は|今は|外は)?雪が降って(?:います|いる)/u,
    };
    if(Object.entries(claims).some(([kind,pattern])=>kind!==actual.weather&&pattern.test(text)))return true;
    const degrees=text.match(/(-?\d+(?:\.\d+)?)\s*(?:°c|℃)/u);
    if(degrees&&Number(degrees[1])!==actual.temperature)return true;
  }
  return false;
}
function informalGmSentence(sentence: string, locale: NpcLocale): boolean {
  const ending=sentence.trim().replace(/[.!?。！？\s”」』"']+$/gu,'');
  if(locale==='ko')return /(?:해|해봐|봐|있어|없어|거야|야|이지|하자|돼|네|래|더라|군|구나|요)$/u.test(ending)||/다$/u.test(ending)&&!/(?:니다|십시오)$/u.test(ending);
  return locale==='ja'&&/(?:といい|だ|だろう|する|ある|いる|なる|できる|ね|よ)$/u.test(ending);
}
// 客観的に判定できる狭い兆候だけを診断する。語彙の一致は意味品質の合格判定ではない。
export function assessDialogueQuality(input: DialogueQualityInput): { flags: DialogueQualityFlag[] } {
  const flags: DialogueQualityFlag[]=[];
  const sentences=Array.from(new Intl.Segmenter(input.locale,{granularity:'sentence'}).segment(input.reply.trim()),part=>part.segment.trim()).filter(Boolean);
  if(input.kind==='npc'&&input.npcId){
    const age=spokenAge(input.reply,input.locale),npc=NPC_PUBLIC.find(npc=>npc.id===input.npcId);
    if(age!==undefined&&npc&&age!==npc.age)flags.push('npc_age_conflict');
    if(npcSelfAgeQuestion(input.query)&&age===undefined&&!/\d+\s*(?:살|세|歳)|나이|연세|경험|세월|상인|다닌|전에는|\b(?:age|years?|experience|merchant|used to)\b|年齢|経験|商人|以前|かつて/iu.test(input.reply))flags.push('npc_age_topic_missing');
  }
  if(weatherConflict(input,sentences))flags.push('weather_conflict');
  if(sentences.length>(fantasyConversationPlan(input.query).maxTokens===256?6:2))flags.push('sentence_limit');
  if(input.kind==='gm'&&sentences.some(sentence=>informalGmSentence(sentence,input.locale)))flags.push('gm_register');
  return {flags};
}
