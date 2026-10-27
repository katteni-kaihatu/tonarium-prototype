import { NPC_PUBLIC, type NpcLocale, type NpcRelationship } from '../shared/npc.ts';
import { NPC_PREWRITTEN_TEXT, type PrewrittenTopic, type PrewrittenTone } from '../shared/fantasy-dialogue-prewritten-text.ts';
import { matchPrewrittenTopic } from '../shared/fantasy-dialogue-topics.ts';
import { fantasyNpcTone } from '../shared/fantasy-dialogue-voice.ts';
import { GM_PREWRITTEN_TEXT } from './fantasy-gm-prewritten-text.ts';
import { npcPersonaReply } from './npc-persona-lines.ts';

export const PREPARED_DIALOGUE_VERSION = 5;
export const PREPARED_DIALOGUE_AUTHOR = 'Codex AI; written and reviewed before play';
export interface PreparedDialogue { text: string; topic: PrewrittenTopic; variant: number }
const locales: readonly string[] = ['ko', 'en', 'ja'];
const relationships: readonly string[] = ['stranger', 'familiar', 'trusted'];
const cache = new Map<string, PreparedDialogue>();
const seed = (text: string) => [...text].reduce((value, letter) => Math.imul(value ^ letter.charCodeAt(0), 16777619) >>> 0, 2166136261);

const sentences = {
  ko: new Intl.Segmenter('ko', { granularity: 'sentence' }),
  en: new Intl.Segmenter('en', { granularity: 'sentence' }),
  ja: new Intl.Segmenter('ja', { granularity: 'sentence' }),
};

function introduction(name: string, tone: PrewrittenTone, locale: NpcLocale): string {
  if (locale === 'en') return `I'm ${name}.`;
  if (locale === 'ja') return ['forge', 'leader', 'covert'].includes(tone) ? `${name}だ。` : tone === 'scholar' ? `${name}といいます。` : tone === 'priest' ? `${name}と申します。` : `${name}です。`;
  const last = name.codePointAt(name.length - 1) ?? 0;
  const consonant = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  const quoted = name + (consonant ? '이라고' : '라고');
  return tone === 'trade' ? `${name}${consonant ? '이에요' : '예요'}.`
    : tone === 'forge' ? `${name}${consonant ? '이라네' : '라네'}.`
    : tone === 'leader' ? `${quoted} 하네.`
    : tone === 'covert' ? `${quoted} 해.`
    : tone === 'scholar' ? `${quoted} 합니다.`
    : tone === 'priest' ? `${name}입니다.`
    : `나는 ${name}${consonant ? '이야' : '야'}.`;
}

export function preparedNpcReply(npcId: string, relationship: NpcRelationship, locale: NpcLocale, text: string, options: { hasMetSpeaker?: boolean } = {}): PreparedDialogue | undefined {
  const topic = matchPrewrittenTopic(text);
  if (!topic || !locales.includes(locale) || !relationships.includes(relationship)) return undefined;
  const npc = NPC_PUBLIC.find(person => person.id === npcId); if (!npc) return undefined;
  const firstGreeting = topic === 'greeting' && relationship === 'stranger' && !options.hasMetSpeaker;
  const key = JSON.stringify([npcId, relationship, locale, topic, firstGreeting]);
  const existing = cache.get(key); if (existing) return { ...existing };
  const tone = fantasyNpcTone(npcId), lines = NPC_PREWRITTEN_TEXT[tone][topic][locale];
  if (!lines.length) return undefined;
  const variant = (seed(`${npcId}|${npc.personality.en}|${npc.speech.en}|${topic}`) + (relationship === 'stranger' ? 0 : 1)) % lines.length;
  let spoken = npcPersonaReply(npcId,locale,topic) ?? lines[variant];
  if (firstGreeting) {
    let hello = [...sentences[locale].segment(spoken)][0]?.segment.trim() ?? spoken;
    if (locale === 'en') hello = hello.replace(/^Good to see you\./u, 'Good to meet you.');
    const self = introduction(npc.name[locale], tone, locale);
    spoken = locale === 'ko' && ['forge', 'leader'].includes(tone) ? `${self} ${hello}` : locale === 'ja' ? `${hello}${self}` : `${hello} ${self}`;
  }
  const reply = { text: spoken, topic, variant }; cache.set(key, Object.freeze(reply)); return { ...reply };
}

export function preparedGmReply(locale: NpcLocale, text: string): PreparedDialogue | undefined {
  const topic = matchPrewrittenTopic(text);
  if (!topic || !locales.includes(locale)) return undefined;
  const key = JSON.stringify(['gm', locale, topic]), existing = cache.get(key);
  if (existing) return { ...existing };
  const lines = GM_PREWRITTEN_TEXT[topic][locale]; if (!lines.length) return undefined;
  const variant = seed(`gm|${topic}`) % lines.length;
  const reply = { text: lines[variant], topic, variant }; cache.set(key, Object.freeze(reply)); return { ...reply };
}
