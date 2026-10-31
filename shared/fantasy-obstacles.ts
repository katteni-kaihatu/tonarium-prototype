import type { NpcLocale } from './npc.ts';

/** 戦場の障害物。壊せるか、どの属性に弱いか、下を通れるかを一箇所で決める。 */
export type FantasyObstacleDamage = 'fire' | 'ice' | 'blunt' | 'pierce' | 'none';
export type FantasyObstaclePassage = 'block' | 'under' | 'over';
export interface FantasyObstacleKind {
  id: string;
  names: Record<NpcLocale, string>;
  breakable: boolean;
  /** 壊すのに必要な累計ダメージ。壊せない種は0。 */
  hp: number;
  vulnerable: FantasyObstacleDamage;
  /** block=通れない, under=小柄・飛行以外も屈んで通れる, over=飛行か大柄が越えられる。 */
  passage: FantasyObstaclePassage;
  cover: boolean;
  blocksSight: boolean;
}
export const FANTASY_OBSTACLE_KINDS: FantasyObstacleKind[] = [
  { id: 'thick-vine', names: { ko: '굵은 넝쿨', en: 'Thick Vines', ja: '太い蔦' }, breakable: true, hp: 6, vulnerable: 'fire', passage: 'block', cover: false, blocksSight: false },
  { id: 'boulder', names: { ko: '바위', en: 'Boulder', ja: '岩' }, breakable: true, hp: 14, vulnerable: 'blunt', passage: 'block', cover: true, blocksSight: true },
  { id: 'great-ice', names: { ko: '큰 얼음', en: 'Great Ice', ja: '大氷' }, breakable: true, hp: 10, vulnerable: 'fire', passage: 'block', cover: true, blocksSight: true },
  { id: 'hole', names: { ko: '구멍', en: 'Hole', ja: '穴' }, breakable: false, hp: 0, vulnerable: 'none', passage: 'over', cover: false, blocksSight: false },
  { id: 'low-wall', names: { ko: '낮은 담', en: 'Low Wall', ja: '低い壁' }, breakable: true, hp: 8, vulnerable: 'blunt', passage: 'under', cover: true, blocksSight: false },
  { id: 'fallen-log', names: { ko: '쓰러진 통나무', en: 'Fallen Log', ja: '倒木' }, breakable: true, hp: 6, vulnerable: 'fire', passage: 'under', cover: true, blocksSight: false },
  { id: 'rubble', names: { ko: '무너진 잔해', en: 'Rubble', ja: '瓦礫' }, breakable: true, hp: 12, vulnerable: 'blunt', passage: 'over', cover: true, blocksSight: false },
  { id: 'barrel', names: { ko: '술통', en: 'Barrel', ja: '樽' }, breakable: true, hp: 4, vulnerable: 'pierce', passage: 'over', cover: false, blocksSight: false },
];
export const fantasyObstacleKind = (id: string): FantasyObstacleKind | undefined => FANTASY_OBSTACLE_KINDS.find(kind => kind.id === id);
export const fantasyObstacleName = (id: string, locale: NpcLocale): string => fantasyObstacleKind(id)?.names[locale] ?? id;
/** 壊せるか。弱点属性なら与えたダメージを倍として扱う。 */
export function fantasyObstacleBreak(kind: FantasyObstacleKind, damage: number, type: FantasyObstacleDamage): { hp: number; dealt: number } | undefined {
  if (!kind.breakable) return undefined;
  const dealt = Math.max(0, type !== 'none' && type === kind.vulnerable ? damage * 2 : damage);
  return { hp: Math.max(0, kind.hp - dealt), dealt };
}
export interface FantasyObstacleBody { small?: boolean; large?: boolean; flying?: boolean; flexible?: boolean }
/** 体の特徴から、その障害物を越えられるかを通れる方向で返す。 */
export function fantasyObstaclePassage(kind: FantasyObstacleKind, body: FantasyObstacleBody): 'block' | 'under' | 'over' {
  if (kind.passage === 'block') return 'block';
  if (kind.id === 'hole') return body.flying || body.large ? 'over' : 'block';
  if (kind.passage === 'under') return body.flying || body.large ? 'over' : body.small || body.flexible ? 'under' : 'block';
  return body.flying || body.large ? 'over' : 'block';
}
