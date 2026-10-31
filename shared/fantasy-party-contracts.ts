export interface FantasyPartyContractMember { user: string; generation: number; lifeStartedAt: number; participated?: true }
export interface FantasyPartyContractRecord { offer: string; party: string; owner: string; members: FantasyPartyContractMember[]; totalGold: number; paid?: true }
