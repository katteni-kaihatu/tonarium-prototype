import type { FantasyEconomyCommand, FantasyEconomyState } from './fantasy-economy.ts';
import type { FantasyCivicCommand, FantasyCivicContext, FantasyCivicState } from './fantasy-civics.ts';
export type FantasyRealmCommand = { domain: 'economy'; command: FantasyEconomyCommand } | { domain: 'civic'; command: FantasyCivicCommand };
export type FantasyRealmContext = FantasyCivicContext;
export interface FantasyRealmState { economy: FantasyEconomyState; civic: FantasyCivicState }
