import type { FantasyCharacter } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { fantasyOccultKnowledge } from './fantasy-occult.ts';

type Names = Record<NpcLocale, string>;
const l = (ko: string, en: string, ja: string): Names => ({ ko, en, ja });
export type FantasyCircleKind = 'attack' | 'heal' | 'guard' | 'cleanse' | 'blessing' | 'miracle';
export interface FantasyCircleRecipe { core: string; runes: string[] }
export interface FantasyCircleKnowledge {
  version: 1; cores: string[]; runes: string[]; discoveries: string[]; prayerFailures: number; prayerDay?: number;
}
export interface FantasyCircleComponent { kind: 'core' | 'rune'; id: string }
export interface FantasyCompiledCircle extends FantasyCircleRecipe {
  names: Names; kind: FantasyCircleKind; power: number; mp: number; magic: boolean; reach: number; radius: number; selfOnly: boolean; field?: 'fire' | 'frost' | 'poison' | 'storm';
  effects: { slow?: number; burn?: number; cleanse?: boolean; revive?: boolean; guard?: number; might?: number };
}
interface Core { id: string; names: Names; job: 'mage' | 'priest'; kind: FantasyCircleKind; power: number; mp: number; reach: number; radius: number; special?: boolean }
export const FANTASY_CIRCLE_CORES: Core[] = [
  { id: 'flame', names: l('화염', 'Flame', '火炎'), job: 'mage', kind: 'attack', power: 28, mp: 10, reach: 7, radius: 1 },
  { id: 'tide', names: l('물결', 'Tide', '水流'), job: 'mage', kind: 'attack', power: 26, mp: 9, reach: 7, radius: 1 },
  { id: 'gale', names: l('질풍', 'Gale', '疾風'), job: 'mage', kind: 'attack', power: 26, mp: 9, reach: 8, radius: 1 },
  { id: 'stone', names: l('대지', 'Stone', '大地'), job: 'mage', kind: 'attack', power: 30, mp: 11, reach: 6, radius: 1 },
  { id: 'physical', names: l('충격', 'Impulse', '衝撃'), job: 'mage', kind: 'attack', power: 27, mp: 10, reach: 6, radius: 1 },
  { id: 'star', names: l('별빛', 'Starlight', '星光'), job: 'mage', kind: 'attack', power: 33, mp: 14, reach: 8, radius: 1, special: true },
  { id: 'holy', names: l('신성', 'Holy Light', '聖光'), job: 'priest', kind: 'attack', power: 28, mp: 11, reach: 7, radius: 1 },
  { id: 'healing', names: l('치유', 'Healing', '治癒'), job: 'priest', kind: 'heal', power: 28, mp: 10, reach: 6, radius: 1 },
  { id: 'pure', names: l('정화', 'Purity', '浄化'), job: 'priest', kind: 'cleanse', power: 1, mp: 8, reach: 6, radius: 1 },
  { id: 'barrier', names: l('결계', 'Barrier', '結界'), job: 'priest', kind: 'guard', power: 10, mp: 10, reach: 6, radius: 1 },
  { id: 'blessing', names: l('축복', 'Benediction', '祝福'), job: 'priest', kind: 'blessing', power: 10, mp: 12, reach: 0, radius: 0, special: true },
  { id: 'miracle', names: l('기적', 'Miracle', '奇跡'), job: 'priest', kind: 'miracle', power: 32, mp: 30, reach: 5, radius: 1, special: true },
];
export const FANTASY_CIRCLE_RUNES: { id: string; names: Names; descriptions: Names; job?: 'mage' | 'priest'; special?: boolean }[] = [
  { id: 'focus', names: l('집중', 'Focus', '集中'), descriptions: l('단독 위력 ×1.35, 사거리 −2, 범위 −1. 다른 강화와 함께 쓰면 위력 증가폭 감소.', 'Alone: power ×1.35, reach −2, radius −1. Additional amplification has diminishing gains.', '単独で威力×1.35、射程−2、範囲−1。他の増幅と重ねるほど増加量が減る。') },
  { id: 'scatter', names: l('분산', 'Scatter', '拡散'), descriptions: l('위력 ×0.75, 범위 +1.', 'Power ×0.75, radius +1.', '威力×0.75、範囲+1。') },
  { id: 'economy', names: l('절감', 'Economy', '節約'), descriptions: l('위력 ×0.8, MP ×0.65.', 'Power ×0.8, MP ×0.65.', '威力×0.8、MP×0.65。') },
  { id: 'reach', names: l('연장', 'Reach', '延伸'), descriptions: l('사거리 +2, MP +2.', 'Reach +2, MP +2.', '射程+2、MP+2。') },
  { id: 'empower', names: l('공명', 'Resonance', '共鳴'), descriptions: l('단독 위력 ×1.2, MP ×1.3. 다른 강화와 함께 쓰면 위력 증가폭 감소.', 'Alone: power ×1.2, MP ×1.3. Additional amplification has diminishing gains.', '単独で威力×1.2、MP×1.3。他の増幅と重ねるほど増加量が減る。') },
  { id: 'ward', names: l('수호', 'Ward', '守護'), descriptions: l('회복·정화·축복에 방호 4를 더하고 MP +3.', 'Healing, cleansing or blessing also grants guard 4; MP +3.', '治癒・浄化・祝福に防護4、MP+3。') },
  { id: 'slow', names: l('서리', 'Frost', '霜'), descriptions: l('공격에 둔화 1, MP +3.', 'Attacks inflict slow 1; MP +3.', '攻撃に鈍化1、MP+3。'), job: 'mage' },
  { id: 'burn', names: l('잔불', 'Embers', '残火'), descriptions: l('공격에 화상 3, MP +3.', 'Attacks inflict burn 3; MP +3.', '攻撃に火傷3、MP+3。'), job: 'mage' },
  { id: 'purify', names: l('청정', 'Purification', '清浄'), descriptions: l('회복·수호·축복에 정화, MP +3.', 'Healing, protection or blessing also cleanses; MP +3.', '治癒・防護・祝福に浄化、MP+3。'), job: 'priest' },
  { id: 'miracle', names: l('생환', 'Return', '生還'), descriptions: l('성인의 기적으로 전투 중 쓰러진 동료를 일으킨다.', 'A saint’s miracle raises a downed ally during battle.', '聖人の奇跡で戦闘中に倒れた仲間を起こす。'), job: 'priest' },
  { id: 'flame-crest', names: l('화염 문양', 'Flame Crest', '炎紋'), descriptions: l('화염술사의 공격에 화상 4, MP +4.', 'A Flame Mage’s attack inflicts burn 4; MP +4.', '炎術師の攻撃に火傷4、MP+4。'), job: 'mage', special: true },
  { id: 'ice-crest', names: l('빙결 문양', 'Frost Crest', '氷紋'), descriptions: l('빙결술사의 공격에 둔화 2, MP +4.', 'A Frost Mage’s attack inflicts slow 2; MP +4.', '氷結術師の攻撃に鈍化2、MP+4。'), job: 'mage', special: true },
  { id: 'earth-crest', names: l('대지 문양', 'Earth Crest', '地紋'), descriptions: l('대지술사의 공격이 자신에게 방호 5를 남긴다. MP +4.', 'An Earth Mage’s attack also grants the caster guard 5; MP +4.', '大地術師の攻撃は術者に防護5を残す。MP+4。'), job: 'mage', special: true },
  { id: 'wind-crest', names: l('바람 문양', 'Wind Crest', '風紋'), descriptions: l('바람술사의 공격 사거리 +2, MP +3.', 'A Wind Mage’s attack gains reach +2; MP +3.', '風術師の攻撃射程+2、MP+3。'), job: 'mage', special: true },
  { id: 'star-crest', names: l('별 문양', 'Star Crest', '星紋'), descriptions: l('단독 위력 ×1.15, 사거리 +1, MP +5. 다른 강화와 함께 쓰면 위력 증가폭 감소.', 'Alone: power ×1.15, reach +1, MP +5. Additional amplification has diminishing gains.', '単独で威力×1.15、射程+1、MP+5。他の増幅と重ねるほど増加量が減る。'), job: 'mage', special: true },
];
const mageBasics = ['flame', 'tide', 'gale', 'stone'], priestBasics = ['holy', 'healing', 'pure', 'barrier'], basicRunes = ['focus', 'scatter', 'economy'];
export const FANTASY_CIRCLE_BOOK_DISCOVERIES: Record<string, FantasyCircleComponent[]> = {
  'rune-physical': [{ kind: 'core', id: 'physical' }], 'rune-reach': [{ kind: 'rune', id: 'reach' }],
  'rune-resonance': [{ kind: 'rune', id: 'empower' }], 'rune-purification': [{ kind: 'rune', id: 'purify' }],
  'rune-benediction': [{ kind: 'rune', id: 'ward' }], 'rune-miracle': [{ kind: 'rune', id: 'miracle' }],
  'rune-frost': [{ kind: 'rune', id: 'slow' }], 'rune-embers': [{ kind: 'rune', id: 'burn' }],
};
type Character = Partial<Pick<FantasyCharacter, 'job' | 'jobXp' | 'readBooks' | 'hour' | 'lastPrayerDay'>> & { circleKnowledge?: FantasyCircleKnowledge };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const empty = (): FantasyCircleKnowledge => ({ version: 1, cores: [], runes: [], discoveries: [], prayerFailures: 0 });
function add(k: FantasyCircleKnowledge, component: FantasyCircleComponent): boolean {
  const ids = component.kind === 'core' ? k.cores : k.runes;
  if (ids.includes(component.id)) return false; ids.push(component.id); return true;
}
function basics(k: FantasyCircleKnowledge, job?: string) {
  if (job !== 'mage' && job !== 'priest') return;
  for (const id of job === 'mage' ? mageBasics : priestBasics) add(k, { kind: 'core', id });
  for (const id of basicRunes) add(k, { kind: 'rune', id });
  if (!k.discoveries.includes(`admission:${job}`)) k.discoveries.push(`admission:${job}`);
}
function dungeonComponent(id: string): FantasyCircleComponent | undefined {
  const match = id.match(/^magic-(core|rune)-([a-z]+)$/); if (!match) return;
  const kind = match[1] as FantasyCircleComponent['kind'];
  const allowed = kind === 'core' ? ['physical'] : FANTASY_CIRCLE_RUNES.filter(r => !basicRunes.includes(r.id) && r.id !== 'miracle' && !r.special).map(r => r.id);
  return allowed.includes(match[2]) ? { kind, id: match[2] } : undefined;
}
// 転職後も学習記録を残し、使用資格はコンパイル時に確認する。
export function fantasyCircleKnowledge(c: Character): FantasyCircleKnowledge {
  const k = c.circleKnowledge && validFantasyCircleKnowledge(c) ? structuredClone(c.circleKnowledge) : empty();
  basics(k, c.job);
  for (const id of c.readBooks ?? []) if (Object.hasOwn(FANTASY_CIRCLE_BOOK_DISCOVERIES, id)) {
    for (const component of FANTASY_CIRCLE_BOOK_DISCOVERIES[id]) add(k, component);
    if (!k.discoveries.includes(`book:${id}`)) k.discoveries.push(`book:${id}`);
  }
  if (c.job && c.jobXp && c.hour !== undefined) {
    const special = fantasyOccultKnowledge(c as FantasyCharacter);
    for (const id of special.cores) if (FANTASY_CIRCLE_CORES.some(core => core.id === id)) add(k, { kind: 'core', id });
    for (const id of special.runes) if (FANTASY_CIRCLE_RUNES.some(rune => rune.id === id)) add(k, { kind: 'rune', id });
  }
  return k;
}
export function grantFantasyCircleBasics(c: Character): FantasyCircleKnowledge {
  const k = c.circleKnowledge ??= empty(); basics(k, c.job);
  for (const id of c.readBooks ?? []) if (Object.hasOwn(FANTASY_CIRCLE_BOOK_DISCOVERIES, id)) {
    for (const component of FANTASY_CIRCLE_BOOK_DISCOVERIES[id]) add(k, component);
    if (!k.discoveries.includes(`book:${id}`)) k.discoveries.push(`book:${id}`);
  }
  return structuredClone(k);
}
export function fantasyCircleNodeCapacity(c: Character): number {
  const xp = c.job === 'mage' || c.job === 'priest' ? c.jobXp?.[c.job] ?? 0 : 0;
  return xp >= 100 ? 6 : xp >= 30 ? 4 : 2;
}
export function validFantasyCircleShape(v: unknown): v is FantasyCircleRecipe {
  return record(v) && Object.keys(v).length === 2 && typeof v.core === 'string' && FANTASY_CIRCLE_CORES.some(core => core.id === v.core)
    && Array.isArray(v.runes) && v.runes.length <= 6
    && v.runes.every(id => typeof id === 'string' && FANTASY_CIRCLE_RUNES.some(r => r.id === id));
}
export function validFantasyCircleKnowledge(c: Character): boolean {
  const k = c.circleKnowledge; if (k === undefined) return true;
  if (!record(k) || Object.keys(k).some(key => !['version', 'cores', 'runes', 'discoveries', 'prayerFailures', 'prayerDay'].includes(key)) || k.version !== 1) return false;
  if (!Array.isArray(k.cores) || k.cores.length > FANTASY_CIRCLE_CORES.length || new Set(k.cores).size !== k.cores.length || k.cores.some(id => !FANTASY_CIRCLE_CORES.some(core => core.id === id))) return false;
  if (!Array.isArray(k.runes) || k.runes.length > FANTASY_CIRCLE_RUNES.length || new Set(k.runes).size !== k.runes.length || k.runes.some(id => !FANTASY_CIRCLE_RUNES.some(rune => rune.id === id))) return false;
  if (!Array.isArray(k.discoveries) || k.discoveries.length > 40 || new Set(k.discoveries).size !== k.discoveries.length || k.discoveries.some(id => typeof id !== 'string' || !(/^admission:(mage|priest)$/.test(id) || id.startsWith('book:') && Object.hasOwn(FANTASY_CIRCLE_BOOK_DISCOVERIES, id.slice(5)) || id.startsWith('dungeon:') && !!dungeonComponent(id.slice(8))))) return false;
  return Number.isSafeInteger(k.prayerFailures) && k.prayerFailures >= 0 && k.prayerFailures <= 1_000_000
    && (k.prayerDay === undefined || Number.isSafeInteger(k.prayerDay) && k.prayerDay >= 0 && (c.hour === undefined || k.prayerDay <= Math.floor(c.hour / 24)) && (c.lastPrayerDay === undefined || k.prayerDay <= c.lastPrayerDay));
}
// 派生値は保存値や通信値を使わず、常に正規の定義から求める。
export function fantasyCompileCircle(c: FantasyCharacter, coreId: string, runeIds: string[]): FantasyCompiledCircle | undefined {
  if (!validFantasyCircleKnowledge(c) || !validFantasyCircleShape({ core: coreId, runes: runeIds }) || runeIds.length > fantasyCircleNodeCapacity(c)) return;
  const core = FANTASY_CIRCLE_CORES.find(core => core.id === coreId)!;
  if (c.job !== core.job) return;
  const knowledge = fantasyCircleKnowledge(c), occult = fantasyOccultKnowledge(c);
  if (!knowledge.cores.includes(coreId) || core.special && !occult?.cores.includes(coreId)) return;
  const runes = FANTASY_CIRCLE_RUNES.flatMap(rune => runeIds.filter(id => id === rune.id).map(() => rune));
  if (runes.some(rune => !knowledge.runes.includes(rune.id) || rune.job && rune.job !== c.job || rune.special && !occult.runes.includes(rune.id))) return;
  if (runeIds.includes('miracle') !== (core.kind === 'miracle')) return;
  if (runeIds.some(id => ['burn', 'slow'].includes(id)) && core.kind !== 'attack') return;
  if (runes.some(rune => rune.special) && core.kind !== 'attack') return;
  if (runeIds.includes('ward') && !['heal', 'cleanse', 'blessing', 'guard'].includes(core.kind)) return;
  if (runeIds.includes('purify') && !['heal', 'guard', 'blessing'].includes(core.kind)) return;
  let selfOnly = core.kind === 'blessing';
  if (selfOnly && runeIds.some(id => ['scatter', 'reach'].includes(id))) return;
  let power = core.power * (c.job === 'mage' ? 1.12 : 1), mp = core.mp, reach = core.reach, radius = core.radius, amplificationRoom = 1;
  const effects: FantasyCompiledCircle['effects'] = {};
  for (const rune of runes) {
    if (rune.id === 'focus') { amplificationRoom *= 1 - .35 / .65; reach -= 2; radius--; }
    if (rune.id === 'scatter') { power *= .75; radius++; }
    if (rune.id === 'economy') { power *= .8; mp *= .65; }
    if (rune.id === 'empower') { amplificationRoom *= 1 - .2 / .65; mp *= 1.3; }
    if (rune.id === 'reach') { reach += 2; mp += 2; }
    if (rune.id === 'slow') { effects.slow = 1; mp += 3; }
    if (rune.id === 'burn') { effects.burn = 3; mp += 3; }
    if (rune.id === 'ward') { effects.guard = 4; mp += 3; }
    if (rune.id === 'purify') { effects.cleanse = true; mp += 3; }
    if (rune.id === 'miracle') effects.revive = true;
    if (rune.id === 'flame-crest') { effects.burn = 4; mp += 4; }
    if (rune.id === 'ice-crest') { effects.slow = 2; mp += 4; }
    if (rune.id === 'earth-crest') { effects.guard = 5; mp += 4; }
    if (rune.id === 'wind-crest') { reach += 2; mp += 3; }
    if (rune.id === 'star-crest') { amplificationRoom *= 1 - .15 / .65; reach++; mp += 5; }
  }
  if (radius < 0 || reach < 0) return;
  if (core.kind === 'heal' && (radius === 0 || reach === 0)) selfOnly = true;
  if (!selfOnly && (radius === 0 || reach === 0)) return;
  // 増幅は残る余地を使うため、重ねても上限1.65倍を超えない。
  power *= 1 + .65 * (1 - amplificationRoom);
  if (core.kind === 'cleanse') effects.cleanse = true;
  if (core.kind === 'blessing') { effects.guard = Math.max(effects.guard ?? 0, Math.round(power)); effects.might = Math.min(6, Math.max(1, Math.round(power / 3))); }
  const names = Object.fromEntries((['ko', 'en', 'ja'] as const).map(locale => [locale, [core.names[locale], ...runes.map(r => r.names[locale])].join(' · ')])) as Names;
  return { core: coreId, runes: runes.map(r => r.id), names, kind: core.kind, power: Math.max(1, Math.min(100, Math.round(power))), mp: Math.max(2, Math.min(60, Math.ceil(mp))), magic: coreId !== 'physical', reach: Math.min(10, reach), radius: Math.min(2, radius), selfOnly, effects, ...(core.kind === 'attack' ? { field: effects.slow ? 'frost' as const : effects.burn || coreId === 'flame' ? 'fire' as const : coreId === 'gale' ? 'storm' as const : undefined } : {}) };
}
export function learnFantasyCircleBook(c: Character, id: string): FantasyCircleComponent[] {
  if (!Object.hasOwn(FANTASY_CIRCLE_BOOK_DISCOVERIES, id) || !validFantasyCircleKnowledge(c)) return [];
  const k = c.circleKnowledge ??= empty(), receipt = `book:${id}`; basics(k, c.job);
  // 読了フラグが先に付いた本も、初回の習得結果を返す。
  for (const previous of c.readBooks ?? []) if (previous !== id && Object.hasOwn(FANTASY_CIRCLE_BOOK_DISCOVERIES, previous)) {
    for (const component of FANTASY_CIRCLE_BOOK_DISCOVERIES[previous]) add(k, component);
    if (!k.discoveries.includes(`book:${previous}`)) k.discoveries.push(`book:${previous}`);
  }
  if (k.discoveries.includes(receipt)) return [];
  const learned = FANTASY_CIRCLE_BOOK_DISCOVERIES[id].filter(component => add(k, component)); k.discoveries.push(receipt); return learned;
}
export function learnFantasyCircleDungeon(c: Character, id: string): FantasyCircleComponent[] {
  const aliases: Record<string, string> = { 'magic-bolt': 'magic-rune-reach', 'magic-flame': 'magic-rune-burn', 'magic-tide': 'magic-rune-ward', 'magic-stone': 'magic-core-physical', 'magic-veil': 'magic-rune-empower', 'magic-mend': 'magic-rune-purify', 'magic-gale': 'magic-rune-reach' };
  const canonical = Object.hasOwn(aliases, id) ? aliases[id] : id;
  const component = dungeonComponent(canonical); if (!component || !validFantasyCircleKnowledge(c)) return [];
  grantFantasyCircleBasics(c); const k = c.circleKnowledge!, receipt = `dungeon:${canonical}`;
  if (k.discoveries.includes(receipt)) return [];
  k.discoveries.push(receipt); return add(k, component) ? [component] : [];
}
export function completeFantasyCirclePrayer(c: FantasyCharacter, day: number, rng: () => number): FantasyCircleComponent[] {
  if (c.job !== 'priest' || !Number.isSafeInteger(day) || day < 0 || c.lastPrayerDay !== day || day > Math.floor(c.hour / 24) || !validFantasyCircleKnowledge(c)) return [];
  grantFantasyCircleBasics(c); const k = c.circleKnowledge!;
  if (k.prayerDay !== undefined && k.prayerDay >= day) return [];
  k.prayerDay = day;
  const unknown = ['ward', 'purify', 'reach', 'empower'].filter(id => !k.runes.includes(id)); if (!unknown.length) return [];
  const chance = Math.min(.05, .01 + k.prayerFailures * .0025), raw = rng(), roll = Number.isFinite(raw) ? Math.max(0, Math.min(1 - Number.EPSILON, raw)) : 1;
  if (roll >= chance) { k.prayerFailures = Math.min(1_000_000, k.prayerFailures + 1); return []; }
  const component: FantasyCircleComponent = { kind: 'rune', id: unknown[Math.min(unknown.length - 1, Math.floor(roll / chance * unknown.length))] };
  add(k, component); k.prayerFailures = 0; return [component];
}
export function fantasyCircleDiscoveryText(components: FantasyCircleComponent[], locale: NpcLocale): string {
  const names = components.map(component => (component.kind === 'core' ? FANTASY_CIRCLE_CORES : FANTASY_CIRCLE_RUNES).find(entry => entry.id === component.id)?.names[locale] ?? component.id).join(' · ');
  return l(`마법진 문양을 익혔습니다: ${names}.`, `Learned circle inscriptions: ${names}.`, `魔法陣の紋様を学んだ：${names}。`)[locale];
}
