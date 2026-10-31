import { NPC_FRONTIER_PUBLIC } from './npc-frontier.ts';
import { FANTASY_MAP_MERCHANT_PROFILE } from './fantasy-map-merchant.ts';
export const NPC_NAME = 'リン';
export type NpcLocale = 'ko' | 'en' | 'ja';
export type NpcId = string;
export type NpcRelationship = 'stranger' | 'familiar' | 'trusted';
export const NPC_NAMES: Record<NpcLocale, string> = { ko: '린', en: 'Rin', ja: 'リン' };
export const NPC_TEXT_MAX = 800;

export interface NpcPublicProfile {
  id: NpcId;
  name: Record<NpcLocale, string>;
  role: Record<NpcLocale, string>;
  age: number;
  gender: 'female' | 'male';
  race: string;
  homeLocation: string;
  building: string;
  personality: Record<NpcLocale, string>;
  speech: Record<NpcLocale, string>;
  knownTopics: Record<NpcLocale, string[]>;
  /** Encounter-only travelers are excluded from permanent town residence and service schedules. */
  travelOnly?: boolean;
  trainableJobs?: string[];
  trainableSkills?: string[];
}

export const NPC_PUBLIC: NpcPublicProfile[] = [
  {
    id: 'rin', name: NPC_NAMES, age: 34, gender: 'female', race: 'human', homeLocation: 'hearth', building: 'inn',
    trainableJobs: ['merchant', 'cook'],
    role: { ko: '여관 주인', en: 'Innkeeper', ja: '宿の主人' },
    personality: { ko: '차분하고 친근하며, 여행자의 이야기를 끝까지 듣는다.', en: 'Calm and friendly; listens patiently to travelers.', ja: '穏やかで親しみやすく、旅人の話をゆっくり聞く。' },
    speech: { ko: '편안하고 따뜻한 말투. 짧게 조언하고 가끔 되묻는다.', en: 'Warm, relaxed speech, brief advice and occasional follow-up questions.', ja: '温かく気さくな口調。短く助言し、ときどき問い返す。' },
    knownTopics: { ko: ['여관 생활', '여행 준비', '상단과 함께한 여행'], en: ['Inn life', 'Travel preparations', 'Caravan journeys'], ja: ['宿の暮らし', '旅支度', '隊商での旅'] },
  },
  {
    id: 'borin', name: { ko: '보린', en: 'Borin', ja: 'ボリン' }, age: 52, gender: 'male', race: 'dwarf', homeLocation: 'emberhall', building: 'blacksmith',
    trainableJobs: ['blacksmith'], trainableSkills: ['mentor-steady-hand'],
    role: { ko: '산드워프 대장장이', en: 'Mountain dwarf blacksmith', ja: '山ドワーフの鍛冶師' },
    personality: { ko: '과묵하고 실용적이며, 정직하고 꼼꼼한 작업을 중시한다.', en: 'Reserved and practical; values honest and careful workmanship.', ja: '無口で実直。丁寧な仕事と実用性を大切にする。' },
    speech: { ko: '짧고 담백하게 말하며, 장비와 준비에 관한 조언을 한다.', en: 'Short, plain sentences and practical advice about tools and preparation.', ja: '短く飾らない言葉で、道具と準備について話す。' },
    knownTopics: { ko: ['대장간 작업', '광석', '도구 손질'], en: ['Forge work', 'Ores', 'Tool maintenance'], ja: ['鍛冶仕事', '鉱石', '道具の手入れ'] },
  },
  {
    id: 'eris', name: { ko: '에리스', en: 'Eris', ja: 'エリス' }, age: 27, gender: 'female', race: 'human', homeLocation: 'mooncity', building: 'library',
    trainableJobs: ['mage', 'alchemist'], trainableSkills: ['mentor-focus'],
    role: { ko: '학자 겸 기록관', en: 'Scholar and archivist', ja: '学者・記録係' },
    personality: { ko: '정중하고 신중하며, 확인된 기록과 추측을 구분한다.', en: 'Courteous and careful; distinguishes evidence from a theory.', ja: '礼儀正しく慎重で、記録と推測を区別する。' },
    speech: { ko: '차분하고 정중하게 설명하고, 어려운 용어는 풀어서 말한다.', en: 'Polite, calm explanations with unfamiliar terms explained plainly.', ja: '落ち着いた丁寧な口調で、難しい言葉は言い換える。' },
    knownTopics: { ko: ['기록 비교', '고문서 보존', '별과 유적의 기록'], en: ['Comparing records', 'Preserving old texts', 'Records of stars and ruins'], ja: ['記録の比較', '古文書の保存', '星と遺跡の記録'] },
  },
];
import { NPC_RESIDENTS } from './npc-residents.ts';
import { NPC_ARTISANS } from './npc-artisans.ts';
NPC_PUBLIC.push(...NPC_RESIDENTS, ...NPC_ARTISANS, ...NPC_FRONTIER_PUBLIC, FANTASY_MAP_MERCHANT_PROFILE);

export interface NpcChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  npcId: NpcId;
  locale: NpcLocale;
  source?: 'canon' | 'local';
  actions?: FantasyAction[];
}

export interface NpcChatRequest {
  requestId: string;
  text: string;
  reset?: boolean;
  locale: NpcLocale;
  npcId: NpcId;
}

export interface NpcReply {
  requestId: string;
  text: string;
  model: string;
  npcId: NpcId;
  locale: NpcLocale;
  relationship: NpcRelationship;
  source?: 'canon' | 'local';
  actions?: FantasyAction[];
  error?: 'unavailable' | 'busy' | 'invalid' | 'timeout';
}
import type { FantasyAction } from './fantasy.ts';
