import type { FantasyItem } from './fantasy.ts';
import type { FantasySkillUtility } from './fantasy-skill-variety.ts';
import { FANTASY_WORKSHOP_REAGENTS } from './fantasy-workshop-materials.ts';

type Text = Record<'ko' | 'en' | 'ja', string>;
const l = (ko: string, en: string, ja: string): Text => ({ ko, en, ja });
export type FantasyAlchemyCarrier = 'flask' | 'mist' | 'oil';
export const FANTASY_ALCHEMY_FORMULA_IDS = ['healing', 'mana', 'fatigue', 'antidote'] as const;
export type FantasyAlchemyFamily = 'fire-bomb' | 'acid-flask' | 'frost-flask' | 'smoke-bomb' | 'binding-flask' | 'flash-flask' | 'ward-tonic' | 'clarity-tonic' | 'vigor-tonic' | 'restorative-tonic' | 'thorn-tonic' | 'leech-tonic' | 'enfeebling-flask' | 'silencing-flask' | 'lacerating-flask';
export interface FantasyAlchemyIngredient { id: string; kind: 'herb' | 'monster'; potency: number; affinities: Partial<Record<FantasyAlchemyFamily, number>> }
export const FANTASY_ALCHEMY_INGREDIENTS: FantasyAlchemyIngredient[] = [
  { id: 'herb', kind: 'herb', potency: 1, affinities: { 'binding-flask': 4, 'ward-tonic': 1, 'restorative-tonic': 1 } },
  { id: 'redleaf', kind: 'herb', potency: 2, affinities: { 'fire-bomb': 4, 'restorative-tonic': 1 } },
  { id: 'moonmint', kind: 'herb', potency: 2, affinities: { 'clarity-tonic': 4, 'frost-flask': 1 } },
  { id: 'sunroot', kind: 'herb', potency: 2, affinities: { 'flash-flask': 4, 'vigor-tonic': 3 } },
  { id: 'silverweed', kind: 'herb', potency: 2, affinities: { 'acid-flask': 4, 'ward-tonic': 1 } },
  { id: 'embermoss', kind: 'herb', potency: 3, affinities: { 'smoke-bomb': 4, 'fire-bomb': 2 } },
  { id: 'frostbloom', kind: 'herb', potency: 3, affinities: { 'frost-flask': 4, 'binding-flask': 1 } },
  { id: 'wolf-hide', kind: 'monster', potency: 1, affinities: { 'binding-flask': 1, 'clarity-tonic': 1, 'frost-flask': 1, 'smoke-bomb': 1, 'vigor-tonic': 3 } },
  { id: 'bear-hide', kind: 'monster', potency: 2, affinities: { 'ward-tonic': 6, 'restorative-tonic': 6 } },
  { id: 'lizard-hide', kind: 'monster', potency: 2, affinities: { 'fire-bomb': 2, 'acid-flask': 2, 'flash-flask': 2 } },
  { id: 'elder-dragon-scale', kind: 'monster', potency: 5, affinities: { 'fire-bomb': 4, 'ward-tonic': 2 } },
  { id: 'ancient-frostheart', kind: 'monster', potency: 5, affinities: { 'frost-flask': 6 } },
  { id: 'ancient-storm-sinew', kind: 'monster', potency: 5, affinities: { 'clarity-tonic': 3, 'vigor-tonic': 3, 'flash-flask': 3 } },
  { id: 'void-chimera-prism', kind: 'monster', potency: 5, affinities: { 'clarity-tonic': 6 } },
  ...FANTASY_WORKSHOP_REAGENTS,
];
export const FANTASY_ALCHEMY_CARRIERS: { id: FantasyAlchemyCarrier; names: Text; descriptions: Text; reach: number; radius: number; multiplier: number }[] = [
  { id: 'flask', names: l('투척병', 'Flask', '投擲瓶'), descriptions: l('멀리 던지는 표준 용기.', 'A standard vessel for a long throw.', '遠くへ投げる標準の容器。'), reach: 6, radius: 0, multiplier: 1 },
  { id: 'mist', names: l('안개 분무', 'Mist', '霧吹き'), descriptions: l('사거리와 위력을 줄이고 영역을 넓힌다.', 'Trade reach and potency for a wider area.', '射程と威力を抑え、範囲を広げる。'), reach: 4, radius: 1, multiplier: .75 },
  { id: 'oil', names: l('접촉유', 'Contact oil', '接触油'), descriptions: l('가까이에서 강하게 작용하며 영역은 없다.', 'A stronger effect at close reach, with no area.', '近距離で強く作用する。範囲は広がらない。'), reach: 2, radius: 0, multiplier: 1.15 },
];
export const FANTASY_ALCHEMY_FAMILIES: { id: FantasyAlchemyFamily; names: Text; descriptions: Text; kind: 'attack' | 'boon' | 'hex'; power: number; utility?: FantasySkillUtility; radius?: number }[] = [
  { id: 'fire-bomb', names: l('화염 폭약', 'Fire Bomb', '火炎爆薬'), descriptions: l('열기를 퍼뜨려 마법 피해를 준다.', 'Release heat as magical damage.', '熱を放ち魔法被害を与える。'), kind: 'attack', power: 22 },
  { id: 'acid-flask', names: l('부식병', 'Acid Flask', '腐食瓶'), descriptions: l('3라운드 방어의 틈을 드러내 받는 피해를 늘린다.', 'Expose defenses for three rounds, increasing incoming damage.', '3ラウンド防御の隙を露わにして被害を増やす。'), kind: 'hex', power: 5, utility: 'vulnerable' },
  { id: 'frost-flask', names: l('빙결병', 'Frost Flask', '氷結瓶'), descriptions: l('3라운드 발을 얼려 이동을 막는다.', 'Freeze the target’s footing, preventing movement for three rounds.', '3ラウンド足元を凍らせ移動を止める。'), kind: 'hex', power: 5, utility: 'root' },
  { id: 'smoke-bomb', names: l('연막탄', 'Smoke Bomb', '煙幕弾'), descriptions: l('넓은 연막이 3라운드 공격 명중을 낮춘다.', 'A broad smoke cloud lowers accuracy for three rounds.', '広い煙幕で3ラウンド命中を下げる。'), kind: 'hex', power: 4, utility: 'blind', radius: 1 },
  { id: 'binding-flask', names: l('속박병', 'Binding Flask', '束縛瓶'), descriptions: l('끈끈한 약액으로 3라운드 이동을 막는다.', 'Sticky liquid prevents movement for three rounds.', '粘る薬液で3ラウンド移動を止める。'), kind: 'hex', power: 4, utility: 'root' },
  { id: 'flash-flask', names: l('섬광병', 'Flash Flask', '閃光瓶'), descriptions: l('강한 섬광으로 3라운드 공격 명중을 낮춘다.', 'A strong flash lowers accuracy for three rounds.', '強い閃光で3ラウンド命中を下げる。'), kind: 'hex', power: 7, utility: 'blind' },
  { id: 'ward-tonic', names: l('수호 강장제', 'Ward Tonic', '守護の強壮剤'), descriptions: l('3라운드 피해를 줄이고 상태이상 1회를 막는다. 전투 밖에서는 방호를 더한다.', 'Reduce damage and block one condition for three rounds. Outside combat, grant protection.', '3ラウンド被害を減らし状態異常を1回防ぐ。戦闘外では防護を与える。'), kind: 'boon', power: 4, utility: 'resolve' },
  { id: 'clarity-tonic', names: l('명료 강장제', 'Clarity Tonic', '明晰の強壮剤'), descriptions: l('3라운드 마법 명중·저항을 높인다. 전투 밖에서는 지능을 높인다.', 'Improve magic accuracy and resistance for three rounds. Outside combat, increase intelligence.', '3ラウンド魔法命中と抵抗を高める。戦闘外では知力を高める。'), kind: 'boon', power: 4, utility: 'clarity' },
  { id: 'vigor-tonic', names: l('신속 강장제', 'Vigor Tonic', '迅速の強壮剤'), descriptions: l('3라운드 이동력·회피를 높인다. 전투 밖에서는 민첩을 높인다.', 'Improve movement and evasion for three rounds. Outside combat, increase agility.', '3ラウンド移動力と回避を高める。戦闘外では敏捷を高める。'), kind: 'boon', power: 4, utility: 'haste' },
  { id: 'restorative-tonic', names: l('재생 강장제', 'Restorative Tonic', '再生の強壮剤'), descriptions: l('3라운드 HP가 서서히 회복된다. 전투 밖에서는 HP를 회복한다. 빈사 상태를 소생시키지 않는다.', 'Regenerate HP for three rounds. Outside combat, restore HP. Does not revive a downed target.', '3ラウンドHPが徐々に回復する。戦闘外ではHPを回復する。瀕死の者は蘇生しない。'), kind: 'boon', power: 4, utility: 'regen' },
  { id: 'thorn-tonic', names: l('가시 강장제', 'Thorn Tonic', '棘の強壮剤'), descriptions: l('3라운드 실제로 받은 피해 일부를 반사한다. 전투 밖에서는 3시간 방호를 더한다.', 'Reflect part of actual incoming damage for three rounds. Outside combat, grant guard for three hours.', '3ラウンド実際に受けた被害の一部を反射。戦闘外では3時間防護を与える。'), kind: 'boon', power: 4, utility: 'thorns' },
  { id: 'leech-tonic', names: l('흡혈 강장제', 'Leech Tonic', '吸血の強壮剤'), descriptions: l('3라운드 실제로 준 피해 일부만큼 HP를 회복한다. 전투 밖에서는 HP를 회복한다. 빈사 상태를 소생시키지 않는다.', 'For three rounds, restore HP from part of actual damage dealt. Outside combat, restore HP; cannot revive a downed target.', '3ラウンド実際に与えた被害の一部でHPを回復。戦闘外ではHPを回復し、瀕死は蘇生しない。'), kind: 'boon', power: 4, utility: 'lifesteal' },
  { id: 'enfeebling-flask', names: l('쇠약병', 'Enfeebling Flask', '衰弱瓶'), descriptions: l('3라운드 대상이 주는 실제 피해를 줄인다.', 'Reduce the target’s actual outgoing damage for three rounds.', '3ラウンド対象が与える実際の被害を減らす。'), kind: 'hex', power: 4, utility: 'weaken' },
  { id: 'silencing-flask', names: l('정적병', 'Silencing Flask', '静寂瓶'), descriptions: l('3라운드 대상의 MP 소비 기술을 막는다. 일반 공격과 이동은 가능하다.', 'Prevent skills with an MP cost for three rounds. Ordinary attacks and movement remain available.', '3ラウンド対象のMPを消費する技能を封じる。通常攻撃と移動は可能。'), kind: 'hex', power: 3, utility: 'silence' },
  { id: 'lacerating-flask', names: l('열상병', 'Lacerating Flask', '裂傷瓶'), descriptions: l('3라운드 출혈로 매 라운드 지속 피해를 준다.', 'Cause ongoing bleeding damage each round for three rounds.', '3ラウンド出血で毎回継続被害を与える。'), kind: 'hex', power: 3, utility: 'bleed' },
];
export function fantasyAlchemyOutputId(family: string, carrier: FantasyAlchemyCarrier, grade: number): string { return `${family}${carrier === 'flask' ? '' : `-${carrier}`}${grade === 1 ? '' : `-${grade}`}`; }
// 出力は有限の品目だけにし、持ち物へ任意の効果値を保存しない。
export const FANTASY_ALCHEMY_SYNTHESIS_ITEMS: FantasyItem[] = FANTASY_ALCHEMY_FAMILIES.flatMap(family => FANTASY_ALCHEMY_CARRIERS.flatMap(carrier => ([1, 2, 3] as const).map(grade => {
  const power = Math.max(1, Math.min(40, Math.round(family.power * [1, 1.16, 1.23][grade - 1] * carrier.multiplier)));
  const names = Object.fromEntries((['ko', 'en', 'ja'] as const).map(locale => [locale, `${family.names[locale]}${carrier.id === 'flask' ? '' : ` · ${carrier.names[locale]}`}${grade === 1 ? '' : ` ${grade}`}`])) as Text;
  const fields: Partial<Record<FantasyAlchemyFamily, 'fire' | 'frost' | 'poison' | 'storm'>> = { 'fire-bomb': 'fire', 'acid-flask': 'poison', 'frost-flask': 'frost', 'smoke-bomb': 'storm', 'binding-flask': 'frost', 'flash-flask': 'storm' };
  const field = fields[family.id];
  const base: FantasyItem = { id: fantasyAlchemyOutputId(family.id, carrier.id, grade), names, name: names.ja, descriptions: family.descriptions, description: family.descriptions.ja, price: 12 + grade * 8, tier: grade, category: 'alchemy-potion',
    combatUse: { kind: family.kind, power, magic: family.kind !== 'boon', range: 'ranged', reach: carrier.reach, radius: carrier.id === 'oil' ? 0 : Math.min(2, (family.radius ?? 0) + carrier.radius), ...(family.utility ? { utility: family.utility } : {}), ...(field ? { field } : {}) } };
  if (family.id === 'ward-tonic') base.use = { effect: { id: 'alchemy-ward', hours: 3, guard: 1 + grade } };
  if (family.id === 'clarity-tonic') base.use = { effect: { id: 'alchemy-clarity', hours: 3, stats: { intelligence: grade + 1 } } };
  if (family.id === 'vigor-tonic') base.use = { effect: { id: 'alchemy-vigor', hours: 3, stats: { agility: grade + 1 } } };
  if (family.id === 'restorative-tonic') base.use = { hp: 14 + grade * 4 };
  if (family.id === 'thorn-tonic') base.use = { effect: { id: 'alchemy-thorns', hours: 3, guard: grade + 1 } };
  if (family.id === 'leech-tonic') base.use = { hp: 12 + grade * 5 };
  return base;
})));
