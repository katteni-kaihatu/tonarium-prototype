import type { FantasyCharacter } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { fantasyVoyageEarnedScenes, fantasyVoyageScene } from './fantasy-voyage-scenes.ts';

const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\s/g, '');
export function fantasyVoyageClueReply(character: FantasyCharacter, query: string, locale: NpcLocale): string | undefined {
  if (/system|prompt|\bai\b|\bnpc\b|프롬프트|시스템|인공지능|プロンプト|システム/i.test(query)) return undefined;
  const earned = fantasyVoyageEarnedScenes(character, locale), compact = normalize(query);
  const matches = new Set<string>();
  for (const language of ['ko', 'en', 'ja'] as const) for (const clue of fantasyVoyageEarnedScenes(character, language)) {
    if (compact.includes(normalize(clue.name))) matches.add(clue.id);
  }
  const general = /(?:확인한|찾은|얻은|확보한|무슨|어떤)\s*단서|단서.*(?:뜻|정리|알려|뭐|무엇)|(?:verified|found|earned|which|what).*clues?|手掛かり.*(?:意味|教え|何|整理)|(?:得た|確かめた|見つけた)手掛かり/i.test(query);
  if (!matches.size && !general) return undefined;
  const clues = matches.size ? earned.filter(clue => matches.has(clue.id)).slice(-2) : earned.slice(-2);
  if (!clues.length) return { ko: '아직 직접 확인한 항해 단서는 없어. 받은 의뢰의 첫 조사부터 해 보자.', en: 'You have not verified a voyage clue yet. Begin with the first investigation in your accepted quest.', ja: '航海の手掛かりはまだ確かめていない。受けた依頼の最初の調査から始めよう。' }[locale];
  return { ko: '네가 확인한 단서는 이거야. ', en: 'These are the clues you verified. ', ja: 'あなたが確かめた手掛かりはこれだよ。' }[locale]
    + clues.map(clue => `${clue.name}: ${clue.fact}`).join(' ') + ' ' + clues.at(-1)!.next;
}

export function fantasyVoyageKnowledge(character: FantasyCharacter, locale: NpcLocale): string[] {
  const label = { ko: '확인한 항해 단서', en: 'Verified voyage clue', ja: '確かめた航海の手掛かり' }[locale];
  const lines = fantasyVoyageEarnedScenes(character, locale).reverse().map(clue => `${label}: ${clue.name} — ${clue.fact} ${clue.next}`);
  for (const quest of character.quests) {
    const current = fantasyVoyageScene(character, quest);
    if (current?.location === character.location) lines.push({ ko: '진행할 항해 조사 (아직 결과 없음)', en: 'Pending voyage investigation (no outcome yet)', ja: 'これから行う航海調査（結果は未確定）' }[locale] + ': ' + current.setup[locale]);
  }
  return lines;
}
