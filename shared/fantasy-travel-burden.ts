import type { FantasyCharacter, FantasyTransport, FantasyTravelLeg } from './fantasy.ts';
import { FANTASY_BAGS, fantasyBagState } from './fantasy-bags.ts';

type Character = Pick<FantasyCharacter, 'inventory' | 'bag' | 'magicBags'>;
export const FANTASY_TRAVEL_BURDEN_WEIGHT_SCALE = 100_000;
export const FANTASY_TRAVEL_BURDEN_LOAD_LIMIT = .66;
export const FANTASY_TRAVEL_BURDEN_LIMIT = .80;
export const FANTASY_TRAVEL_MAGIC_BAG_SIZE_PENALTY = .03;
export interface FantasyTravelBurden {
  weight: number;
  weightLimit: number;
  normalBag: string;
  magicBags: string[];
  sizePenalty: number;
  loadPenalty: number;
  penalty: number;
  multiplier: number;
}

export function fantasyTravelBurden(c: Character): FantasyTravelBurden {
  const state = fantasyBagState(c), normal = FANTASY_BAGS.find(bag => bag.id === state.bag);
  const sizePenalty = (normal ? (normal.grade - 1) * .04 : 0) + state.magicBags.length * FANTASY_TRAVEL_MAGIC_BAG_SIZE_PENALTY;
  // 容量を増やしても同じ荷物が軽くならないよう、容量ではなく実重量を使う。
  const loadPenalty = Math.min(FANTASY_TRAVEL_BURDEN_LOAD_LIMIT, state.weight / FANTASY_TRAVEL_BURDEN_WEIGHT_SCALE);
  const penalty = Math.min(FANTASY_TRAVEL_BURDEN_LIMIT, sizePenalty + loadPenalty);
  return { weight: state.weight, weightLimit: state.weightLimit, normalBag: state.bag, magicBags: [...state.magicBags], sizePenalty, loadPenalty, penalty, multiplier: 1 + penalty };
}

export function fantasyTravelBurdenModeFactor(transport: string): number {
  if (transport === 'foot') return 1;
  if (transport === 'carriage' || transport === 'escort') return .2;
  return 0;
}

export function fantasyTravelBurdenMultiplier(c: Character, transport: string): number {
  const factor = fantasyTravelBurdenModeFactor(transport);
  return factor ? 1 + fantasyTravelBurden(c).penalty * factor : 1;
}

export function fantasyTravelBurdenHours(c: Character, baseHours: number, transport: string): number {
  return baseHours * fantasyTravelBurdenMultiplier(c, transport);
}

export function fantasyTravelBurdenLegs(c: Character, legs: readonly FantasyTravelLeg[]): FantasyTravelLeg[] {
  const { penalty } = fantasyTravelBurden(c);
  return legs.map(leg => ({ ...leg, hours: leg.hours * (1 + penalty * fantasyTravelBurdenModeFactor(leg.transport)) }));
}

// 乗り継ぎでは徒歩区間だけを重くし、料金や到達位置の割合は変えない。
export function fantasyTravelBurdenQuote<T extends Pick<FantasyTransport, 'id' | 'hours'> & { legs?: FantasyTravelLeg[] }>(c: Character, quote: T): T {
  if (quote.legs?.length) {
    const legs = fantasyTravelBurdenLegs(c, quote.legs);
    const added = legs.reduce((sum, leg, index) => sum + leg.hours - quote.legs![index].hours, 0);
    return { ...quote, legs, hours: quote.hours + added };
  }
  return { ...quote, hours: fantasyTravelBurdenHours(c, quote.hours, quote.id) };
}
