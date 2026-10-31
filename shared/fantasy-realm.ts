import type { FantasyEconomyCommand, FantasyEconomyState } from './fantasy-economy.ts';
import type { FantasyCivicCommand, FantasyCivicContext, FantasyCivicState } from './fantasy-civics.ts';
import type { FantasyBlackMarketAction, fantasyBlackMarketState } from './fantasy-black-market.ts';
export type FantasyRealmCommand = { domain: 'economy'; command: FantasyEconomyCommand } | { domain: 'civic'; command: FantasyCivicCommand } | {domain:'blackMarket';command:FantasyBlackMarketAction};
export type FantasyRealmContext = FantasyCivicContext;
export interface FantasyRealmState { economy: FantasyEconomyState; civic: FantasyCivicState;blackMarket?:ReturnType<typeof fantasyBlackMarketState> }
