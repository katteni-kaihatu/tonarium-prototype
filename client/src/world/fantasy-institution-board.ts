import { FANTASY_QUESTS } from '../../../shared/fantasy-data.ts';
import type { FantasyContractVisibleOffer } from '../../../shared/fantasy-contracts.ts';
import { fantasyQuestInstitution, type FantasyInstitution } from '../../../shared/fantasy-institutions.ts';

export function fantasyInstitutionBoardOffers(offers: FantasyContractVisibleOffer[], source: FantasyInstitution, npc?: string): FantasyContractVisibleOffer[] {
  return offers.filter(offer => { const quest = FANTASY_QUESTS.find(q => q.id === offer.quest); return quest && fantasyQuestInstitution(quest) === source && (!npc || offer.issuer === npc); });
}
