import type { FantasyCharacter, FantasyProfile } from '../shared/fantasy.ts';
import { NPC_PUBLIC, type NpcLocale } from '../shared/npc.ts';
import { FANTASY_TERMS } from '../shared/fantasy-lore.ts';
import { FANTASY_LIBRARY_BOOKS } from '../shared/fantasy-library.ts';
import { fantasyDefinitionSubject, fantasyInquiryKey } from '../shared/fantasy-dialogue-inquiry.ts';
import { fantasyKnownLocations } from '../shared/fantasy-town.ts';
import { fantasySkills } from '../shared/fantasy-engine.ts';
import { fantasyNpcMentorSkills } from '../shared/fantasy-apprenticeship.ts';
import { fantasyNpcTone } from '../shared/fantasy-dialogue-voice.ts';
import { NPC_UNKNOWN_INFORMATION_TEXT } from '../shared/fantasy-dialogue-prewritten-text.ts';
import { GM_UNKNOWN_INFORMATION_TEXT } from './fantasy-gm-prewritten-text.ts';

const same = (subject: string, names: readonly string[]) => names.some(name => fantasyInquiryKey(name.replace(/^(?:a|an|the)\s+/iu, '')) === fantasyInquiryKey(subject.replace(/^(?:a|an|the)\s+/iu, '')));
const termFor = (subject: string) => FANTASY_TERMS.find(term => same(subject, [term.id, ...Object.values(term.names), ...Object.values(term.aliases ?? {}).flat()]));
const npcFor = (subject: string) => NPC_PUBLIC.find(npc => same(subject, [npc.id, ...Object.values(npc.name)]));
const bookFor = (subject: string) => FANTASY_LIBRARY_BOOKS.find(book => book.inGame !== false && same(subject, [book.id, ...Object.values(book.title)]));
const variant = (text: string) => [...text].reduce((value, letter) => (value + letter.codePointAt(0)!) % 2, 0);

export function unknownNpcInformation(npcId: string, locale: NpcLocale): string {
  return NPC_UNKNOWN_INFORMATION_TEXT[fantasyNpcTone(npcId)][locale][variant(npcId)];
}

export function unknownNpcDefinition(npcId: string, locale: NpcLocale, text: string, character?: FantasyCharacter): string | undefined {
  const subject = fantasyDefinitionSubject(text);
  if (!subject || termFor(subject) || npcFor(subject) || bookFor(subject)) return undefined;
  if (fantasyNpcMentorSkills(npcId, character).some(skill => same(subject, [skill.id, skill.name, ...Object.values(skill.names ?? {})]))) return undefined;
  return unknownNpcInformation(npcId, locale);
}

export function groundedGmDefinition(profile: FantasyProfile, locale: NpcLocale, text: string): string | undefined {
  const subject = fantasyDefinitionSubject(text);
  if (!subject || !profile.character) return undefined;
  const c = profile.character, term = termFor(subject);
  const known = new Set(fantasyKnownLocations(c));
  if (term && (['world-title', 'calendar', 'mana', 'gold', 'guilds'].includes(term.id)
    || term.category === 'place' && known.has(term.id)
    || term.category === 'race' && c.race === term.id
    || term.category === 'job' && c.job === term.id
    || term.category === 'item' && (c.inventory[term.id] ?? 0) > 0)) return `${term.names[locale]}: ${term.summary[locale]}`;
  const npc = npcFor(subject);
  if (npc && known.has(npc.homeLocation)) return { ko: `${npc.name.ko}: ${npc.role.ko}입니다.`, en: `${npc.name.en}: ${npc.role.en}.`, ja: `${npc.name.ja}：${npc.role.ja}です。` }[locale];
  const skill = fantasySkills(c).find(skill => same(subject, [skill.id, skill.name, ...Object.values(skill.names ?? {})]));
  if (skill) return `${skill.names?.[locale] ?? skill.name}: ${skill.descriptions?.[locale] ?? skill.description}`;
  const book = bookFor(subject);
  if (book && c.readBooks?.includes(book.id)) return { ko: `이미 정독한 책인 『${book.title.ko}』입니다.`, en: `You have already studied ${book.title.en}.`, ja: `すでに精読した『${book.title.ja}』です。` }[locale];
  return GM_UNKNOWN_INFORMATION_TEXT[locale][variant(subject)];
}
