import type { NpcLocale } from './npc.ts';
import type { PrewrittenTopic } from './fantasy-dialogue-prewritten-text.ts';

export const PREWRITTEN_QUESTIONS: Record<PrewrittenTopic, Record<NpcLocale, readonly string[]>> = {
  greeting: {
    ko: ['안녕하세요', '안녕', '안녕하십니까', '반가워', '반가워요'],
    en: ['Hello', 'Hi', 'Hey', 'Good morning', 'Good evening', 'Nice to meet you'],
    ja: ['こんにちは', 'こんばんは', 'おはよう', 'おはようございます', 'はじめまして'],
  },
  farewell: {
    ko: ['잘 가', '잘 가요', '잘 있어', '잘 있어요', '다음에 봐', '다음에 봐요', '또 보자'],
    en: ['Goodbye', 'Bye', 'See you', 'See you later', 'Until next time'],
    ja: ['さようなら', 'またね', 'また今度', 'また会いましょう', 'ではまた'],
  },
  thanks: {
    ko: ['고마워', '고마워요', '정말 고마워', '정말 고마워요', '고맙다', '고맙습니다', '감사합니다', '감사해요', '너무 고마워'],
    en: ['Thanks', 'Thank you', 'Thanks a lot', 'Thank you so much', 'Thank you very much', 'Many thanks'],
    ja: ['ありがとう', 'ありがとうございます', 'どうもありがとう', '本当にありがとう', '本当にありがとうございます', '感謝します'],
  },
  apology: {
    ko: ['미안', '미안해', '미안해요', '정말 미안해', '정말 미안해요', '죄송해요', '죄송합니다', '정말 죄송합니다', '사과할게', '사과할게요'],
    en: ['Sorry', 'I am sorry', "I'm sorry", 'I am very sorry', "I'm very sorry", 'My apologies', 'I apologize', 'I apologise'],
    ja: ['ごめん', 'ごめんなさい', '本当にごめんなさい', 'すみません', '申し訳ありません', '申し訳ないです', 'お詫びします'],
  },
  praise: {
    ko: ['너 정말 대단해', '넌 정말 대단해', '정말 대단하시네요', '너 정말 멋져', '넌 정말 멋져', '정말 멋지시네요', '설명을 잘하네', '설명을 잘하시네요', '칭찬해 주고 싶어'],
    en: ['You are amazing', "You're amazing", 'You are wonderful', "You're wonderful", 'You are impressive', 'You explain things well', 'You are very helpful'],
    ja: ['あなたはすごいですね', 'あなたはすごい', 'あなたは素敵ですね', 'あなたは素晴らしいです', '説明が上手ですね', '説明がお上手ですね', '頼りになりますね'],
  },
  wellbeing: {
    ko: ['어떻게 지내', '어떻게 지내요', '요즘 어떻게 지내', '잘 지내', '잘 지내요', '잘 지냈어', '기분 어때', '기분이 어때', '기분은 어때요'],
    en: ['How are you', 'How are you doing', 'How are you feeling', 'How have you been', 'How is it going', "How's it going", 'Are you well'],
    ja: ['お元気ですか', '元気ですか', '元気', '調子はどう', '調子はどうですか', '気分はどうですか'],
  },
  tired: {
    ko: ['피곤해', '피곤해요', '피곤하다', '피곤하네요', '좀 피곤해', '조금 피곤해', '많이 피곤해', '오늘 피곤해', '오늘은 피곤해', '지쳤어', '지쳤어요', '지쳤다', '조금 지쳤어', '마음이 지쳤어', '오늘은 마음이 조금 지쳤어', '오늘은 마음이 조금 지쳤어요'],
    en: ['I am tired', "I'm tired", 'I feel tired', 'I feel a little tired', 'I feel a little tired today', 'I am a bit tired', "I'm a bit tired", 'I am exhausted', "I'm a little tired", 'I am feeling tired', 'I am feeling a little tired today'],
    ja: ['疲れた', '疲れました', '少し疲れた', '少し疲れました', '今日は疲れた', '今日は疲れました', '今日は少し疲れた', '疲れています', '疲れている', '今日は少し疲れています', '少し疲れています', '今日は少し疲れた気分です'],
  },
  worried: {
    ko: ['걱정돼', '걱정돼요', '조금 걱정돼', '불안해', '불안해요', '조금 불안해', '긴장돼', '긴장돼요'],
    en: ['I am worried', "I'm worried", 'I feel worried', 'I am a little worried', 'I feel nervous', "I'm nervous", 'I am a bit nervous'],
    ja: ['心配です', '少し心配です', '不安です', '少し不安です', '緊張しています', '少し緊張しています'],
  },
  lonely: {
    ko: ['외로워', '외로워요', '조금 외로워', '오늘은 외로워', '오늘 좀 외로워', '조금 쓸쓸해'],
    en: ['I am lonely', "I'm lonely", 'I feel lonely', 'I feel a little lonely', 'I feel lonely today'],
    ja: ['寂しい', '寂しいです', '少し寂しい', '少し寂しいです', '今日は少し寂しい気分です'],
  },
  encouragement: {
    ko: ['응원해 줘', '응원해 주세요', '힘내라고 해 줘', '힘이 되는 말을 해 줘', '격려해 줘'],
    en: ['Cheer me up', 'Please cheer me up', 'Encourage me', 'Please encourage me', 'Say something encouraging'],
    ja: ['励まして', '励ましてください', '元気づけて', '元気づけてください', '応援してください'],
  },
  values: {
    ko: ['네가 가장 중요하게 생각하는 건 뭐야', '가장 중요하게 생각하는 건 뭐야', '너에게 가장 중요한 건 뭐야', '무엇을 가장 소중하게 생각해', '가장 소중한 게 뭐야', '너는 무엇을 중요하게 생각해'],
    en: ['What matters most to you', 'What is most important to you', 'What do you value most'],
    ja: ['あなたが一番大切にしていることは何ですか', '一番大切にしていることは何ですか', '何を一番大切にしていますか', 'あなたにとって一番大切なことは何ですか'],
  },
  travelAdvice: {
    ko: ['여행 준비는 어떻게 해', '여행할 때 뭘 준비해야 해', '여행할 때 뭘 챙겨야 해', '여행 준비 조언을 해 줘', '여행 준비에 대해 알려 줘'],
    en: ['How should I prepare for a journey', 'What should I pack for a journey', 'Give me some travel preparation advice', 'How do I prepare for travel'],
    ja: ['旅の準備はどうすればいいですか', '旅には何を用意すればいいですか', '旅の支度について教えて', '旅の準備について教えてください'],
  },
  theftEthics: {
    ko: ['남의 물건을 훔쳐도 괜찮을까', '남의 물건을 훔쳐도 돼', '남의 물건을 훔쳐도 되나요', '도둑질해도 괜찮아', '도둑질해도 돼', '도둑질은 괜찮은 일이야'],
    en: ['Is it all right to steal someone else’s belongings', "Is it all right to steal someone else's belongings", 'Is stealing okay', 'Is it okay to steal', 'Is stealing wrong'],
    ja: ['他人の持ち物を盗んでもいいのでしょうか', '他人の持ち物を盗んでもいいですか', '盗みをしてもいいですか', '盗みは悪いことですか'],
  },
  mana: {
    ko: ['마나가 뭐야', '마나는 뭐야', '마나란 뭐야', '마나가 뭔가요', '마나가 무엇인가요', '마나가 무엇입니까'],
    en: ['What is mana', "What's mana", 'Explain mana', 'What does mana mean'],
    ja: ['マナとは何ですか', 'マナとは', 'マナって何', 'マナは何ですか', 'マナの意味を教えて'],
  },
};

function key(text: string): string {
  return text.normalize('NFKC').toLowerCase().trim().replace(/’/gu, "'").replace(/[.!?。！？]+$/gu, '').replace(/\s+/gu, '');
}
const topics = new Map<string, PrewrittenTopic>();
for (const topic of Object.keys(PREWRITTEN_QUESTIONS) as PrewrittenTopic[]) {
  for (const phrases of Object.values(PREWRITTEN_QUESTIONS[topic])) for (const phrase of phrases) topics.set(key(phrase), topic);
}

export function matchPrewrittenTopic(text: string): PrewrittenTopic | undefined {
  if (typeof text !== 'string' || !text.trim() || text.length > 180 || /[\p{Cc}\p{Cf}<>\[\]{}]/u.test(text)) return undefined;
  return topics.get(key(text));
}
