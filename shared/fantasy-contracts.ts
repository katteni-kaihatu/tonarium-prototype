import type { FantasyCharacter, FantasyQuest } from './fantasy.ts';
import { FANTASY_ITEMS, FANTASY_LOCATIONS, FANTASY_QUESTS } from './fantasy-data.ts';
import { NPC_PUBLIC } from './npc.ts';
import { fantasyQuestEligible } from './fantasy-access.ts';
import { fantasyBuildings } from './fantasy-town.ts';
import { fantasyEnvironment } from './fantasy-environment.ts';

export const FANTASY_CONTRACT_CYCLE = 6;
export const FANTASY_CONTRACT_POST_HOURS = 12;
export const FANTASY_CONTRACT_DEADLINE_HOURS = 36;
export interface FantasyContractOffer {
  id: string; quest: string; boardLocation: string; issuer: string; createdAt: number; expiresAt: number; deadline: number; mode: 'exclusive' | 'raid'; gold: number;
}
export interface FantasyContractGrant {
  offerId: string; issuer: string; boardLocation: string; acceptedAt: number; expiresAt: number; progress: number; gold: number;
}
export interface FantasyContractVisibleOffer extends FantasyContractOffer { participants: number; mine: boolean; available: boolean }
export interface FantasyContractBoard {
  revision: number; hour: number; location: string; offers: FantasyContractVisibleOffer[];
  environment: ReturnType<typeof fantasyEnvironment> & { monsterPressure: number; bountyMultiplier: number };
}
export type FantasyContractError = 'invalid' | 'guildOnly' | 'taken' | 'expired' | 'conditions' | 'already' | 'unavailable';
export interface FantasyContractRequest { quest: string; offer: string }
export function fantasyContractErrorText(error: FantasyContractError, locale: 'ko' | 'en' | 'ja'): string {
  const text: Record<FantasyContractError, Record<'ko' | 'en' | 'ja', string>> = {
    invalid: { ko: '의뢰 요청과 현재 참가 상태를 확인해 주세요.', en: 'Check the quest request and your current membership.', ja: '依頼の要求と現在の参加状態を確認してください。' },
    guildOnly: { ko: '의뢰 게시판은 현재 지역의 길드에서 이용할 수 있습니다.', en: 'Use the quest board at the local guild.', ja: '依頼の掲示板は現地のギルドで利用できます。' },
    taken: { ko: '다른 플레이어가 먼저 수락한 의뢰입니다.', en: 'Another player has already claimed this contract.', ja: 'ほかのプレイヤーが先に受けた依頼です。' },
    expired: { ko: '게시 기간이 끝난 의뢰입니다. 새 게시판을 확인해 주세요.', en: 'This posting expired. Check the updated board.', ja: '掲載が終了した依頼です。新しい掲示板を確認してください。' },
    conditions: { ko: '현재 종족·직업·선행 의뢰 등 수락 조건이 맞지 않습니다.', en: 'Your ancestry, profession or prerequisite quests do not meet the conditions.', ja: '現在の種族・職業・前提依頼などの条件が整っていません。' },
    already: { ko: '이미 수락 처리된 의뢰입니다.', en: 'This contract has already been accepted.', ja: 'すでに受注処理された依頼です。' },
    unavailable: { ko: '공유 의뢰 기록을 저장하거나 불러올 수 없습니다. 현재 진행을 보존하고 다시 확인합니다.', en: 'The shared contract record is unavailable. Existing progress is preserved while it is checked again.', ja: '共有依頼の記録を保存・読込できません。現在の進行を保ち、もう一度確認します。' },
  };
  return text[error][locale];
}
type Quest = FantasyQuest & { issuer?: string; chapter?: number; group?: boolean; seasons?: string[]; objective?: { type: string; count: number } };
export const fantasyPersonalQuest = (quest: FantasyQuest): boolean => ((quest as Quest).chapter ?? 0) > 0 || quest.id.startsWith('main-night-');
export const fantasyContractMode = (quest: FantasyQuest): FantasyContractOffer['mode'] => (quest as Quest).group === true ? 'raid' : 'exclusive';
export function fantasyContractIssuer(quest: FantasyQuest): string | undefined {
  const stated = (quest as Quest).issuer;
  if (stated && NPC_PUBLIC.some(npc => npc.id === stated && npc.homeLocation === quest.giver)) return stated;
  const residents=NPC_PUBLIC.filter(npc=>npc.homeLocation===quest.giver);
  const category=FANTASY_ITEMS.find(item=>item.id===quest.item)?.category;
  const jobs=quest.jobs??(category==='ore'||category==='ingot'?['blacksmith']:category==='wood'?['carpenter','shipwright']:category==='gem'?['gemcutter']:category==='potion'||category==='herb'?['alchemist','herbalist']:category==='food'||category==='fish'?['cook','baker','fisher']:category==='fiber'||category==='leather'?['tailor','leatherworker','weaver']:category==='relic'?['scribe','mage']:[]);
  const facilities=category==='relic'?['archaeology','library']:category==='food'||category==='fish'?['restaurant','inn']:category==='ore'||category==='ingot'||category==='weapon'?['blacksmith']:category==='potion'||category==='herb'?['alchemist']:['market'];
  return residents.find(npc=>npc.trainableJobs?.some(job=>jobs.includes(job)))?.id
    ?? residents.find(npc=>facilities.includes(npc.building))?.id
    ?? residents.find(npc=>npc.building==='guild')?.id
    ?? residents[0]?.id;
}
export const fantasyContractBounty = (pressure: number) => .5 + Math.max(0, Math.min(100, pressure)) / 100;
export function fantasyContractHash(text: string): number {
  let value = 2166136261;
  for (const code of text) { value ^= code.charCodeAt(0); value = Math.imul(value, 16777619); }
  return value >>> 0;
}
export function fantasyContractCandidates(location: string, hour: number, season: string, seasonDay: number): FantasyQuest[] {
  const land = FANTASY_LOCATIONS.find(place => place.id === location)?.land;
  return FANTASY_QUESTS.filter(quest => {
    const q = quest as Quest;
    const giverLand = FANTASY_LOCATIONS.find(place => place.id === quest.giver)?.land;
    const hasLocalGuild = FANTASY_LOCATIONS.some(place => place.land === giverLand && fantasyBuildings({ location: place.id }).some(building => building.id === 'guild'));
    if (fantasyPersonalQuest(quest) || !fantasyContractIssuer(quest) || !land || giverLand !== land && hasLocalGuild) return false;
    return (!q.seasons || q.seasons.includes(season)) && (quest.item !== 'winterbloom' || season === 'winter');
  }).sort((a, b) => {
    const score = (q: FantasyQuest) => fantasyContractHash(`${location}:${Math.floor(hour / FANTASY_CONTRACT_CYCLE)}:${q.id}`) / 4294967296
      - (season === 'autumn' && seasonDay >= 10 && ['herb', 'moonmint', 'winterbloom'].includes(q.item) ? .3 : 0);
    return score(a) - score(b);
  });
}
export function fantasyCanViewContracts(character: FantasyCharacter): boolean {
  return character.hp > 0 && fantasyBuildings(character).some(building => building.id === 'guild');
}
export function fantasyCanClaimContract(character: FantasyCharacter, offer: FantasyContractOffer, hour: number): boolean {
  const quest = FANTASY_QUESTS.find(quest => quest.id === offer.quest);
  return !!quest && !fantasyPersonalQuest(quest) && fantasyCanViewContracts(character) && character.location === offer.boardLocation
    && hour >= offer.createdAt && hour < offer.expiresAt && !character.quests.includes(quest.id) && !character.completed.includes(quest.id)
    && fantasyQuestEligible(character, quest) && NPC_PUBLIC.some(npc => npc.id === offer.issuer && npc.homeLocation === quest.giver);
}
