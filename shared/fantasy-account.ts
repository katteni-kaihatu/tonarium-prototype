export interface FantasyAccountPublic {
  id: string;
  principal: string;
  username: string;
}

export type FantasyAccountError = 'invalid' | 'invalid-credentials' | 'username-taken' | 'rate-limited'
  | 'unauthenticated' | 'unavailable' | 'secure-connection-required' | 'origin-denied' | 'payload-too-large'
  | 'claim-unavailable' | 'invalid-claim';

export interface FantasyAccountResponse {
  account: FantasyAccountPublic | null;
  ticket?: string;
  recoveryCode?: string;
  error?: FantasyAccountError;
}

export const FANTASY_ACCOUNT_USERNAME = /^[a-zA-Z0-9_]{3,24}(?![\s\S])/u;
export const FANTASY_ACCOUNT_PASSWORD_MIN = 10;
export const FANTASY_ACCOUNT_PASSWORD_MAX = 128;
