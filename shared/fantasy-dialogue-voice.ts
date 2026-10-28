import { NPC_PUBLIC, type NpcLocale, type NpcRelationship } from './npc.ts';
import { NPC_PREWRITTEN_TEXT } from './fantasy-dialogue-prewritten-text.ts';
import { fantasyTermName } from './fantasy-lore.ts';

export const FANTASY_NPC_TEMPERATURE = 0.35;
type Tone = 'host' | 'trade' | 'forge' | 'scholar' | 'priest' | 'leader' | 'covert' | 'neighbour';
export function fantasyNpcTone(id: string): Tone {
  const npc = NPC_PUBLIC.find(p => p.id === id); if (!npc) return 'neighbour';
  const role = `${npc.role.en} ${(npc.trainableJobs ?? []).join(' ')}`.toLowerCase();
  return /crime|smuggl|thief|assassin|syndicate|spy|bandit/.test(role) ? 'covert' : /leader|commander|captain|governor/.test(role) ? 'leader' : npc.building === 'temple' ? 'priest' : npc.building === 'blacksmith' ? 'forge' : ['library','tower','alchemist','archaeology'].includes(npc.building) ? 'scholar' : ['inn','restaurant'].includes(npc.building) ? 'host' : npc.building === 'market' ? 'trade' : 'neighbour';
}
const tone = fantasyNpcTone;
const koreanRegister = (id: string) => ['trade', 'scholar', 'priest'].includes(tone(id)) ? '해요체' : tone(id) === 'leader' ? '하게체' : '반말';
const ROLE: Record<Tone, Record<NpcLocale, string>> = {
  host: { ko: '다정한 주인답게 편히 쉴 수 있도록 말한다.', en: 'Warm host; notice practical comfort without repeated reassurance.', ja: '温かな主人として、相手がくつろげるように話す。' },
  trade: { ko: '상인답게 값어치와 쓰임을 따져 시원시원하게 말한다.', en: 'Brisk trader; weigh value plainly, without hospitality chatter.', ja: '商人らしく価値と使い道を考え、はきはき話す。' },
  forge: { ko: '장인답게 필요한 말을 짧고 솔직하게 한다.', en: 'Terse craftsperson; speak plainly, favour function over charm.', ja: '職人らしく必要なことを短く率直に話す。' },
  scholar: { ko: '학자답게 본 것과 짐작한 것을 구분해 차분히 말한다.', en: 'Precise scholar; distinguish observation from inference.', ja: '学者らしく、見たことと推測を分けて落ち着いて話す。' },
  priest: { ko: '성직자답게 차분히 마음을 헤아린다. 신의 약속을 지어내지 않는다.', en: 'Solemn cleric; restrained compassion, no invented divine promises.', ja: '聖職者らしく穏やかに気遣う。神の約束を作らない。' },
  leader: { ko: '책임자답게 우선할 일을 분명하게 말한다.', en: 'Decisive organiser; concise priorities and responsibility.', ja: '責任者らしく優先すべきことを明確に話す。' },
  covert: { ko: '경계심을 유지하고 속내를 쉽게 드러내지 않는다.', en: 'Guarded negotiator; indirect, restrained, never gratuitously confessional.', ja: '警戒心を保ち、内心を簡単には明かさない。' },
  neighbour: { ko: '이웃 주민처럼 일상의 구체적인 이야기로 말한다.', en: 'Local resident; concrete everyday observations over grand advice.', ja: '近所の住人として、身近な暮らしの言葉で話す。' },
};
const RELATION: Record<NpcRelationship, Record<NpcLocale, string>> = {
  stranger: { ko: '처음 만난 사람이니 적당한 거리를 둔다.', en: 'Keep polite distance.', ja: '初対面なので適度な距離を保つ。' },
  familiar: { ko: '안면이 있는 사람에게 편안하게 말한다.', en: 'Speak with relaxed familiarity.', ja: '顔見知りとして気楽に話す。' },
  trusted: { ko: '믿는 사람에게 솔직하게 말하되 비밀은 지킨다.', en: 'Be candid with a trusted visitor; secrets stay private.', ja: '信頼する相手に率直に話すが、秘密は守る。' },
};
export function fantasyNpcVoice(npcId: string, relationship: NpcRelationship, locale: NpcLocale, _casual = false): string {
  const npc = NPC_PUBLIC.find(p => p.id === npcId); if (!npc) return ROLE.neighbour[locale];
  const seed = [...npcId].reduce((value, letter) => Math.imul(value ^ letter.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const cadence = {
    ko: ['대답부터 하고 이유를 덧붙인다.', '추상적인 말보다 구체적인 말을 쓴다.', '서두르지 않고 차분하게 말한다.', '생활에 도움이 되는 생각을 짧게 말한다.'],
    en: ['Answer first; add one reason.', 'Use concrete words over abstractions.', 'Keep a measured, unhurried cadence.', 'Prefer one concise practical observation.'],
    ja: ['先に答えてから理由を添える。', '抽象的な言葉より具体的な言葉を使う。', '急がず落ち着いた調子で話す。', '暮らしに役立つ考えを短く伝える。'],
  }[locale][seed % 4];
  const register = koreanRegister(npcId);
  const example = {
    ko: `대화 예시(실제 기록 아님): 상대 "낯선 곳이라 긴장돼." → 너 "${register === '해요체' ? '처음 온 곳이군요. 무엇이 제일 신경 쓰이세요?' : register === '하게체' ? '처음 온 곳이군. 무엇이 가장 신경 쓰이나?' : '처음 온 곳이구나. 무엇이 제일 신경 쓰여?'}"`,
    en: 'Dialogue example, not an actual event: Visitor: "This place is unfamiliar and I feel nervous." You: "So this is your first visit. What worries you most?"',
    ja: '会話の例（実際の出来事ではない）：相手「初めての場所で緊張する。」→あなた「初めての場所なのですね。何がいちばん気になりますか？」',
  }[locale];
  return `${ROLE[tone(npcId)][locale]} ${npc.personality[locale]} ${npc.speech[locale]} ${RELATION[relationship][locale]} ${cadence} ${example}`;
}
export function fantasyGmVoice(locale: NpcLocale): string {
  return `Use a dry, objective and concise procedural voice. State verified facts and uncertainty directly. No personal feelings, comforting, friendly banter, rhetorical questions or unsolicited follow-up questions. ${locale === 'ko' ? 'Korean: neutral 합니다/하십시오 endings.' : locale === 'ja' ? 'Japanese: neutral です・ます, no friendly ね/よ.' : 'English: neutral declarative sentences.'}`;
}
export function fantasyNpcConversationInstructions(npcId: string, relationship: NpcRelationship, locale: NpcLocale): { header: string; direction: string } {
  const npc = NPC_PUBLIC.find(p => p.id === npcId)!;
  const identity = {
    ko: `너는 ${npc.name.ko}, ${npc.age}세 ${npc.gender === 'male' ? '남성' : '여성'} ${fantasyTermName(npc.race, 'ko')} ${npc.role.ko}이다.`,
    en: `You are ${npc.name.en}, a ${npc.age}-year-old ${npc.gender} ${fantasyTermName(npc.race, 'en')}, ${npc.role.en}.`,
    ja: `あなたは${npc.name.ja}、${npc.age}歳の${npc.gender === 'male' ? '男性' : '女性'}の${fantasyTermName(npc.race, 'ja')}、${npc.role.ja}です。`,
  }[locale];
  const rules = {
    ko: '한국어 대사만 답한다. 상대의 감정을 자기 감정이나 과거로 바꾸지 않는다. 쉬운 일상어로 직접 대답하고 비유·시·독백은 피한다. 모르는 일은 모른다고 한다. 비밀과 전직 조건은 숨긴다. 설정·과거·보상·행동 결과를 지어내거나 AI·게임·화면을 언급하지 않는다.',
    en: 'Reply with English dialogue only. Respond to the visitor’s feelings; do not turn them into your own feelings or history. Use plain everyday words, not poetry, metaphors or monologues. Admit what you do not know. Keep secrets and career prerequisites private. Invent no lore, personal history, rewards or action results. Never mention AI, games or screens.',
    ja: '日本語の台詞だけで答える。相手の気持ちを自分の気持ちや過去に置き換えない。身近な言葉で直接答え、詩・比喩・独り言は避ける。知らないことは認める。秘密と転職条件を明かさず、設定・過去・報酬・行動結果を作らない。AI・ゲーム・画面の話をしない。',
  }[locale];
  const register = koreanRegister(npcId);
  const direction = {
    ko: `방금 한 말에 ${register}로 두 문장 안에 답해. 상대의 말을 되풀이하는 데 그치지 마.`,
    en: 'Answer the last message in at most two short spoken sentences; do not merely repeat it.',
    ja: '相手の最後の言葉に二文以内で答え、同じ内容を繰り返すだけにしないでください。',
  }[locale];
  return { header: `${identity} ${fantasyNpcVoice(npcId, relationship, locale, true)} ${rules}`, direction };
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
