import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fantasyInstitutionBoardOffers } from './fantasy-institution-board.ts';
import { FANTASY_QUESTS } from '../../../shared/fantasy-data.ts';
import { fantasyQuestInstitution } from '../../../shared/fantasy-institutions.ts';
import type { FantasyContractVisibleOffer } from '../../../shared/fantasy-contracts.ts';

test('institution boards filter actual quest channels and an NPC sees only their own requests', () => {
  const guild = FANTASY_QUESTS.find(q => fantasyQuestInstitution(q) === 'guild')!, first = FANTASY_QUESTS.find(q => q.id === 'underworld-nyx-dressing')!, second = FANTASY_QUESTS.find(q => q.id === 'underworld-vex-provisions')!;
  const offer = (q: typeof first, id: string): FantasyContractVisibleOffer => ({ id, quest: q.id, issuer: q.issuer ?? 'guild-contact', boardLocation: 'hearth', createdAt: 8, expiresAt: 10, deadline: 44, mode: 'exclusive', gold: 30, participants: 0, mine: false, available: true });
  const offers = [offer(guild, 'guild'), offer(first, 'nyx'), offer(second, 'vex')];
  assert.deepEqual(fantasyInstitutionBoardOffers(offers, 'guild').map(row => row.id), ['guild']);
  assert.deepEqual(fantasyInstitutionBoardOffers(offers, 'underworld', 'hearth-nyx').map(row => row.id), ['nyx']);
  assert.deepEqual(fantasyInstitutionBoardOffers(offers, 'underworld').map(row => row.id), ['nyx', 'vex']);
  assert.deepEqual(fantasyInstitutionBoardOffers(offers, 'personal'), []);
});
