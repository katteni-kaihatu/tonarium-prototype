import type { FantasyCharacter } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_CIRCLE_CORES, FANTASY_CIRCLE_RUNES, fantasyCircleDiscoveryText, type FantasyCircleComponent } from './fantasy-magic-circle.ts';

export type FantasyMagicElement = 'flame' | 'tide' | 'gale' | 'stone' | 'light';
export type FantasyMagicForm = 'bolt' | 'veil' | 'mend';
export type FantasyMagicComponent = { kind: 'element'; id: FantasyMagicElement } | { kind: 'form'; id: FantasyMagicForm };
export interface FantasyMagicKnowledge {
  version: 1; elements: FantasyMagicElement[]; forms: FantasyMagicForm[]; discoveries: string[];
  prayerFailures: number; prayerDay?: number;
}
type Character = Pick<FantasyCharacter, 'magicKnowledge' | 'specialization' | 'readBooks'>;
const elements: FantasyMagicElement[] = ['flame', 'tide', 'gale', 'stone', 'light'];
const forms: FantasyMagicForm[] = ['bolt', 'veil', 'mend'];
export const FANTASY_MAGIC_BOOK_DISCOVERIES: Record<string, FantasyMagicComponent[]> = {
  'mana-primer': [{ kind: 'element', id: 'gale' }, { kind: 'form', id: 'bolt' }],
  'advanced-mana-forms': [{ kind: 'element', id: 'light' }, { kind: 'form', id: 'veil' }],
  'stone-and-flame': [{ kind: 'element', id: 'stone' }, { kind: 'element', id: 'flame' }],
  'remedies-and-rites': [{ kind: 'element', id: 'tide' }, { kind: 'form', id: 'mend' }],
};
const recipes = new Set(['flame:bolt', 'flame:veil', 'tide:veil', 'tide:mend', 'gale:bolt', 'stone:bolt', 'stone:veil', 'light:bolt', 'light:mend']);
const empty = (): FantasyMagicKnowledge => ({ version: 1, elements: [], forms: [], discoveries: [], prayerFailures: 0 });
function add(knowledge: FantasyMagicKnowledge, component: FantasyMagicComponent): boolean {
  if (component.kind === 'element') { if (knowledge.elements.includes(component.id)) return false; knowledge.elements.push(component.id); }
  else { if (knowledge.forms.includes(component.id)) return false; knowledge.forms.push(component.id); }
  return true;
}
// 既存の読了本と保存済みの有効な術だけを移行する。
export function fantasyMagicKnowledge(character: Character): FantasyMagicKnowledge {
  if (character.magicKnowledge) return structuredClone(character.magicKnowledge);
  const knowledge = empty();
  for (const book of character.readBooks ?? []) if (Object.hasOwn(FANTASY_MAGIC_BOOK_DISCOVERIES, book)) {
    for (const component of FANTASY_MAGIC_BOOK_DISCOVERIES[book]) add(knowledge, component);
    knowledge.discoveries.push(`book:${book}`);
  }
  for (const spell of character.specialization?.spells ?? []) if (recipes.has(`${spell.element}:${spell.form}`)) {
    add(knowledge, { kind: 'element', id: spell.element }); add(knowledge, { kind: 'form', id: spell.form });
  }
  return knowledge;
}
export function initializeFantasyMagicKnowledge(character: Character): FantasyMagicKnowledge {
  return character.magicKnowledge ??= fantasyMagicKnowledge(character);
}
export function fantasyMagicKnown(character: Character, element: string, form: string): boolean {
  const knowledge = fantasyMagicKnowledge(character);
  return knowledge.elements.includes(element as FantasyMagicElement) && knowledge.forms.includes(form as FantasyMagicForm);
}
export function learnFantasyMagicBook(character: Character, book: string): FantasyMagicComponent[] {
  if (!Object.hasOwn(FANTASY_MAGIC_BOOK_DISCOVERIES, book)) return [];
  const knowledge = initializeFantasyMagicKnowledge(character), receipt = `book:${book}`;
  if (knowledge.discoveries.includes(receipt)) return [];
  const learned = FANTASY_MAGIC_BOOK_DISCOVERIES[book].filter(component => add(knowledge, component));
  knowledge.discoveries.push(receipt); return learned;
}
export function learnFantasyMagicDungeon(character: Character, discovery: string): FantasyMagicComponent[] {
  const id = discovery.startsWith('magic-') ? discovery.slice(6) : '';
  const component: FantasyMagicComponent | undefined = elements.includes(id as FantasyMagicElement) ? { kind: 'element', id: id as FantasyMagicElement } : forms.includes(id as FantasyMagicForm) ? { kind: 'form', id: id as FantasyMagicForm } : undefined;
  if (!component) return [];
  const knowledge = initializeFantasyMagicKnowledge(character), receipt = `dungeon:${discovery}`;
  if (knowledge.discoveries.includes(receipt)) return [];
  knowledge.discoveries.push(receipt); return add(knowledge, component) ? [component] : [];
}
export function fantasyMagicPrayerChance(character: Character): number {
  return Math.min(.05, .01 + fantasyMagicKnowledge(character).prayerFailures * .0025);
}
// 完了済みの祈りだけを受け取り、独立した日付記録で再抽選を防ぐ。
export function completeFantasyMagicPrayer(character: FantasyCharacter, day: number, rng: () => number): FantasyMagicComponent[] {
  if (character.job !== 'priest' || !Number.isSafeInteger(day) || day < 0 || character.lastPrayerDay !== day || day > Math.floor(character.hour / 24)) return [];
  const knowledge = initializeFantasyMagicKnowledge(character);
  if (knowledge.prayerDay !== undefined && knowledge.prayerDay >= day) return [];
  knowledge.prayerDay = day;
  const eligible: FantasyMagicComponent[] = [{ kind: 'element', id: 'tide' }, { kind: 'element', id: 'light' }, { kind: 'form', id: 'veil' }, { kind: 'form', id: 'mend' }];
  const unknown = eligible.filter(component => component.kind === 'element' ? !knowledge.elements.includes(component.id) : !knowledge.forms.includes(component.id));
  if (!unknown.length) return [];
  const chance = fantasyMagicPrayerChance(character), raw = rng(), roll = Number.isFinite(raw) ? Math.max(0, Math.min(1 - Number.EPSILON, raw)) : 1;
  if (roll >= chance) { knowledge.prayerFailures = Math.min(1_000_000, knowledge.prayerFailures + 1); return []; }
  const component = unknown[Math.min(unknown.length - 1, Math.floor(roll / chance * unknown.length))];
  if (!add(knowledge, component)) return [];
  knowledge.prayerFailures = 0; return [component];
}
export function validFantasyMagicKnowledge(character: Character & Partial<Pick<FantasyCharacter, 'hour' | 'lastPrayerDay'>>): boolean {
  const value = character.magicKnowledge;
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['version', 'elements', 'forms', 'discoveries', 'prayerFailures', 'prayerDay'].includes(key)) || value.version !== 1) return false;
  if (!Array.isArray(value.elements) || value.elements.length > 5 || new Set(value.elements).size !== value.elements.length || value.elements.some(id => !elements.includes(id))) return false;
  if (!Array.isArray(value.forms) || value.forms.length > 3 || new Set(value.forms).size !== value.forms.length || value.forms.some(id => !forms.includes(id))) return false;
  if (!Array.isArray(value.discoveries) || value.discoveries.length > 12 || new Set(value.discoveries).size !== value.discoveries.length || value.discoveries.some(id => typeof id !== 'string' || !(id.startsWith('book:') && Object.hasOwn(FANTASY_MAGIC_BOOK_DISCOVERIES, id.slice(5)) || /^dungeon:magic-(flame|tide|gale|stone|light|bolt|veil|mend)$/.test(id)))) return false;
  return Number.isSafeInteger(value.prayerFailures) && value.prayerFailures >= 0 && value.prayerFailures <= 1_000_000 && (value.prayerDay === undefined || Number.isSafeInteger(value.prayerDay) && value.prayerDay >= 0 && (character.hour === undefined || value.prayerDay <= Math.floor(character.hour / 24)) && (character.lastPrayerDay === undefined || value.prayerDay <= character.lastPrayerDay));
}
export function fantasyMagicDiscoveryText(components: FantasyMagicComponent[], locale: NpcLocale): string {
  const labels: Record<string, Record<NpcLocale, string>> = {
    flame: { ko: '불', en: 'Flame', ja: '火' }, tide: { ko: '물', en: 'Water', ja: '水' }, gale: { ko: '바람', en: 'Wind', ja: '風' }, stone: { ko: '돌', en: 'Stone', ja: '石' }, light: { ko: '빛', en: 'Light', ja: '光' },
    bolt: { ko: '집중', en: 'Focus', ja: '集中' }, veil: { ko: '장막', en: 'Veil', ja: '帳' }, mend: { ko: '회복', en: 'Mending', ja: '癒やし' },
  };
  const names = components.map(component => labels[component.id][locale]).join(' · ');
  return { ko: `마법 구성 요소를 익혔습니다: ${names}.`, en: `Learned magic components: ${names}.`, ja: `魔法の構成要素を学んだ：${names}。` }[locale];
}
export function fantasyMagicDiscoveryTranslation(source: string, locale: NpcLocale): string | undefined {
  const circle = source.match(/^魔法陣の紋様を学んだ：(.+)。$/);
  if (circle) {
    const components = circle[1].split(' · ').map(name => {
      const core = FANTASY_CIRCLE_CORES.find(core => core.names.ja === name);
      if (core) return { kind: 'core', id: core.id } as FantasyCircleComponent;
      const rune = FANTASY_CIRCLE_RUNES.find(rune => rune.names.ja === name);
      return rune ? { kind: 'rune', id: rune.id } as FantasyCircleComponent : undefined;
    });
    return components.every(component => component !== undefined) ? fantasyCircleDiscoveryText(components, locale) : undefined;
  }
  const match = source.match(/^魔法の構成要素を学んだ：(.+)。$/); if (!match) return;
  const ids: Record<string, FantasyMagicComponent> = { 火: { kind: 'element', id: 'flame' }, 水: { kind: 'element', id: 'tide' }, 風: { kind: 'element', id: 'gale' }, 石: { kind: 'element', id: 'stone' }, 光: { kind: 'element', id: 'light' }, 集中: { kind: 'form', id: 'bolt' }, 帳: { kind: 'form', id: 'veil' }, 癒やし: { kind: 'form', id: 'mend' } };
  const components = match[1].split(' · ').map(name => ids[name]);
  return components.every(Boolean) ? fantasyMagicDiscoveryText(components, locale) : undefined;
}
export function fantasyMagicBookPassage(book: string, locale: NpcLocale): string | undefined {
  const passages:Record<string,Record<NpcLocale,string>>={
    'mana-primer':{ko:'창틈의 바람을 좇아 숨을 고른다. 흩어진 흐름을 한 점에 모으면 촛불이 기울어지는 방향도 달라진다. 서두르지 말고 기류와 집중의 결을 익혀라.',en:'Breathe with the breeze at the window. Gather its scattered currents into one point and even a candle bends another way. Learn the grain of wind and focus without haste.',ja:'窓の風に合わせて息を整える。散る流れを一点に集めれば、蝋燭の傾く向きさえ変わる。急がず、風と集中の筋を覚えよ。'},
    'advanced-mana-forms':{ko:'빛을 세게 쏘는 것만이 능사는 아니다. 얇은 천을 겹치듯 빛의 결을 펴서 감싸면, 다가오는 충격을 받아낼 장막이 된다.',en:'Light need not strike fiercely. Spread its strands like layers of fine cloth, and they form a veil that can soften an approaching blow.',ja:'光は強く放つだけではない。薄布を重ねるように光の筋を広げて包めば、迫る衝撃を受け止める帳となる。'},
    'stone-and-flame':{ko:'돌은 오랜 압력을 기억하고 불은 짧은 변화를 품는다. 손바닥의 열기와 발밑의 무게를 따로 느끼되, 서로의 흐름을 억지로 섞지 말라.',en:'Stone remembers lasting pressure; flame holds sudden change. Feel the warmth in your palm and the weight beneath your feet separately. Never force their currents together.',ja:'石は長い圧力を覚え、火は短い変化を宿す。掌の熱と足元の重さを別々に感じ、その流れを無理に混ぜてはならない。'},
    'remedies-and-rites':{ko:'물의 흐름은 상처 가장자리에서 끊긴 맥을 잇는다. 회복의 형상을 그릴 때는 살을 억지로 당기지 말고, 본래의 숨결이 돌아올 길을 열어 주어라.',en:'Water follows the broken pulse at the edge of a wound. When shaping mending, do not pull flesh by force; open a path for its own rhythm to return.',ja:'水の流れは傷の縁で途切れた脈を結ぶ。癒やしの形を描くとき、肉を無理に引かず、本来の息が戻る道を開いてやれ。'},
  };
  return Object.hasOwn(passages,book)?passages[book][locale]:undefined;
}
