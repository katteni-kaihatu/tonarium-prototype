import { NPC_PUBLIC, type NpcLocale, type NpcRelationship } from './npc.ts';
import { NPC_PREWRITTEN_TEXT } from './fantasy-dialogue-prewritten-text.ts';
type Tone = 'host' | 'trade' | 'forge' | 'scholar' | 'priest' | 'leader' | 'covert' | 'neighbour';
export function fantasyNpcTone(id: string): Tone {
  const npc = NPC_PUBLIC.find(p => p.id === id); if (!npc) return 'neighbour';
  const role = `${npc.role.en} ${(npc.trainableJobs ?? []).join(' ')}`.toLowerCase();
  return /crime|smuggl|thief|assassin|syndicate|spy|bandit/.test(role) ? 'covert' : /leader|commander|captain|governor/.test(role) ? 'leader' : npc.building === 'temple' ? 'priest' : npc.building === 'blacksmith' ? 'forge' : ['library','tower','alchemist','archaeology'].includes(npc.building) ? 'scholar' : ['inn','restaurant'].includes(npc.building) ? 'host' : npc.building === 'market' ? 'trade' : 'neighbour';
}
const tone = fantasyNpcTone;
const ROLE: Record<Tone,string> = {
  host: 'Warm host; notice practical comfort without repeated reassurance.', trade: 'Brisk trader; weigh value plainly, without hospitality chatter.',
  forge: 'Terse craftsperson; speak plainly, favour function over charm.', scholar: 'Precise scholar; distinguish observation from inference.',
  priest: 'Solemn cleric; restrained compassion, no invented divine promises.', leader: 'Decisive organiser; concise priorities and responsibility.',
  covert: 'Guarded negotiator; indirect, restrained, never gratuitously confessional.', neighbour: 'Local resident; concrete everyday observations over grand advice.',
};
const RELATION: Record<NpcRelationship,string> = { stranger: 'Keep polite distance.', familiar: 'Speak with relaxed familiarity.', trusted: 'Be candid with a trusted visitor; secrets stay private.' };
export function fantasyNpcVoice(npcId: string, relationship: NpcRelationship, locale: NpcLocale, _casual = false): string {
  const npc = NPC_PUBLIC.find(p => p.id === npcId); if (!npc) return ROLE.neighbour;
  const register = locale === 'ko' ? tone(npcId) === 'forge' || tone(npcId) === 'covert' ? 'Korean: short plain endings.' : 'Korean: natural conversational endings.' : locale === 'ja' ? tone(npcId) === 'forge' || tone(npcId) === 'covert' ? 'Japanese: short plain register.' : 'Japanese: natural polite register.' : 'English: natural spoken register.';
  const seed = [...npcId].reduce((value, letter) => Math.imul(value ^ letter.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const cadence = ['Answer first; add one reason.', 'Use concrete words over abstractions.', 'Keep a measured, unhurried cadence.', 'Prefer one concise practical observation.'][seed % 4];
  return `${ROLE[tone(npcId)]} ${npc.personality.en} ${npc.speech.en} ${RELATION[relationship]} ${register} ${cadence}`;
}
export function fantasyGmVoice(locale: NpcLocale): string {
  return `Use a dry, objective and concise procedural voice. State verified facts and uncertainty directly. No personal feelings, comforting, friendly banter, rhetorical questions or unsolicited follow-up questions. ${locale === 'ko' ? 'Korean: neutral 합니다/하십시오 endings.' : locale === 'ja' ? 'Japanese: neutral です・ます, no friendly ね/よ.' : 'English: neutral declarative sentences.'}`;
}
export function fantasyNpcGreeting(npcId: string, relationship: NpcRelationship, locale: NpcLocale): string {
  const npc = NPC_PUBLIC.find(p => p.id === npcId)!;
  const known = relationship !== 'stranger';
  const lines: Record<Tone,[string,string,string]> = {
    host: [known ? '또 왔구나. 잠깐 쉬어 갈래?' : '어서 와. 먼 길을 왔다면 잠깐 숨부터 돌려.', known ? 'Back again? Take a moment to rest.' : 'Welcome. Catch your breath after the road.', known ? 'また来てくれたんだね。少し休んでいく？' : 'ようこそ。長旅なら、まずひと息どうぞ。'],
    trade: [known ? '반가워. 오늘은 뭘 알아보러 왔어?' : '반가워. 찾는 물건이 있으면 말해 줘.', known ? 'Good to see you. What are you looking for today?' : 'Hello. Tell me what goods you need.', known ? 'いらっしゃい。今日は何をお探し？' : 'いらっしゃい。探している品があれば言ってね。'],
    forge: ['왔군. 필요한 용건부터 말하게.', 'You are here. Tell me what needs doing.', '来たか。用件から聞こう。'],
    scholar: ['안녕하세요. 어떤 기록을 찾으시나요?', 'Hello. Which records are you looking for?', 'こんにちは。どの記録をお探しですか。'],
    priest: ['평안하시길. 말씀을 듣겠습니다.', 'Peace to you. I am listening.', '安らかでありますように。お話を伺います。'],
    leader: ['잘 왔네. 용건을 듣겠네.', 'Welcome. Let us hear the matter at hand.', 'よく来た。用件を聞こう。'],
    covert: ['조용히 말해. 무슨 일이지?', 'Keep your voice down. What is it?', '静かに話せ。何の用だ。'],
    neighbour: [known ? '또 만났네. 오늘은 어땠어?' : '안녕. 이 근처는 처음이야?', known ? 'Good to see you again. How was your day?' : 'Hello. Are you new around here?', known ? 'また会ったね。今日はどうだった？' : 'こんにちは。この辺りは初めて？'],
  };
  const greeting = lines[tone(npcId)][locale === 'ko' ? 0 : locale === 'en' ? 1 : 2];
  if (known) return greeting;
  return `${greeting} ${locale === 'ko' ? ['scholar','priest'].includes(tone(npcId)) ? `저는 ${npc.name.ko}, ${npc.role.ko}입니다.` : `나는 ${npc.name.ko}, ${npc.role.ko}이야.` : locale === 'ja' ? `私は${npc.name.ja}、${npc.role.ja}です。` : `I am ${npc.name.en}, ${npc.role.en.toLowerCase()}.`}`;
}

export function fantasyNpcSocialReply(npcId: string, relationship: NpcRelationship, locale: NpcLocale, text: string): string | undefined {
  if (!NPC_PUBLIC.some(npc => npc.id === npcId) || !['ko', 'en', 'ja'].includes(locale) || typeof text !== 'string' || text.length > 120 || /[\r\n\u0000-\u001f\u007f]/.test(text)) return undefined;
  const query = text.normalize('NFKC').toLowerCase().trim().replace(/[.!?。！？]+$/u, '').trim().replace(/\s+/g, ' ');
  const thanks = /^(?:(?:정말|정말로|대단히|너무)\s*)?(?:고마워(?:요)?|고맙(?:다|습니다)|감사(?:합니다|해요|해))$|^(?:thanks(?: a lot| so much)?|thank you(?: very much| so much)?|many thanks|much appreciated)$|^(?:(?:どうも|本当に))?ありがとう(?:ございます|ね)?$|^感謝します$/u;
  const tired = /^(?:(?:나|난|나는|저는|저|오늘|오늘은)\s*)?(?:(?:몸이|마음이)\s*)?(?:(?:조금|좀|많이|아주|너무)\s*)?(?:피곤해(?:요)?|피곤하다|피곤하네요|지쳤어(?:요)?|지쳤다|지치네요)$|^(?:(?:(?:i['’]m|i am)(?: feeling)?|i feel) )?(?:(?:a little|a bit|quite|very|so) )?(?:tired|weary|exhausted)(?: today)?$|^(?:(?:今日|今日は|私は))?(?:(?:少し|ちょっと|とても|かなり))?疲れ(?:た(?:よ|な)?|ました|ている|ています|てます)$/u;
  const wellbeing = /^(?:(?:요즘|오늘|오늘은)\s*)?(?:어떻게\s*지내(?:요)?|잘\s*지내(?:요)?|잘\s*지냈어(?:요)?|기분(?:이|은)?\s*어때(?:요)?|기분(?:이|은)?\s*어떠세요)$|^(?:how are you(?: doing| feeling)?|how have you been|how is it going|how['’]s it going|are you well)$|^(?:元気ですか|お元気ですか|元気|調子はどう(?:ですか)?|気分はどう(?:ですか)?|お変わりありませんか)$/u;
  const kind = thanks.test(query) ? 'thanks' : tired.test(query) ? 'tired' : wellbeing.test(query) ? 'wellbeing' : undefined;
  if (!kind) return undefined;
  const npc = NPC_PUBLIC.find(person => person.id === npcId)!;
  const lines = NPC_PREWRITTEN_TEXT[tone(npcId)][kind][locale];
  const seed = [...`${npcId}|${npc.personality.en}|${npc.speech.en}|${kind}`]
    .reduce((value, letter) => Math.imul(value ^ letter.charCodeAt(0), 16777619) >>> 0, 2166136261);
  return lines[(seed + (relationship === 'stranger' ? 0 : 1)) % lines.length];
}
