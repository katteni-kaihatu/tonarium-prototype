import { fantasyCombatEnemy } from './fantasy-combat-catalog.ts';
import type { FantasyCharacter, FantasyQuest } from './fantasy.ts';
import { FANTASY_ITEMS, FANTASY_LOCATIONS, FANTASY_QUESTS } from './fantasy-data.ts';
import { NPC_PUBLIC } from './npc.ts';
import { fantasyQuestEligible } from './fantasy-access.ts';
import { fantasyBuildings } from './fantasy-town.ts';
import { fantasyEnvironment } from './fantasy-environment.ts';
import type { FantasyAdventurerGrade } from './fantasy-adventurer.ts';
import { fantasyQuestGrade } from './fantasy-quest-grades.ts';
import { FANTASY_INSTITUTIONS, fantasyQuestInstitution, fantasyInstitutionEligible, fantasyInstitutionPresent } from './fantasy-institutions.ts';

export const FANTASY_CONTRACT_CYCLE = 2;
export const FANTASY_CONTRACT_POST_HOURS = FANTASY_CONTRACT_CYCLE;
export const FANTASY_CONTRACT_RAID_DELAY_HOURS = 6;
export const FANTASY_CONTRACT_RAID_PARTICIPANTS = 6;
export const FANTASY_CONTRACT_RAID_WAITING_DEADLINE = Number.MAX_SAFE_INTEGER;
export const FANTASY_CONTRACT_DEADLINE_HOURS = 36;
export interface FantasyContractOffer {
  id: string; quest: string; boardLocation: string; issuer: string; createdAt: number; expiresAt: number; deadline: number; mode: 'exclusive' | 'raid'; gold: number;
  grade?: FantasyAdventurerGrade; startsAt?: number; startedAt?: number; monster?: string; enemyCount?: number; recipient?: string;
}
export interface FantasyContractGrant {
  offerId: string; issuer: string; boardLocation: string; acceptedAt: number; expiresAt: number; progress: number; gold: number;
  grade?: FantasyAdventurerGrade; startsAt?: number; startedAt?: number; monster?: string; enemyCount?: number;
}
export interface FantasyContractVisibleOffer extends FantasyContractOffer { participants: number; mine: boolean; available: boolean }
export interface FantasyContractBoard {
  revision: number; hour: number; location: string; offers: FantasyContractVisibleOffer[];
  environment: ReturnType<typeof fantasyEnvironment> & { monsterPressure: number; bountyMultiplier: number };
}
export type FantasyContractError = 'invalid' | 'guildOnly' | 'taken' | 'expired' | 'conditions' | 'already' | 'unavailable' | 'full';
export interface FantasyContractRequest { quest: string; offer: string }
export function fantasyContractErrorText(error: FantasyContractError, locale: 'ko' | 'en' | 'ja'): string {
  const text: Record<FantasyContractError, Record<'ko' | 'en' | 'ja', string>> = {
    full: { ko: '\uacf5\ub3d9\ud1a0\ubc8c \ucc38\uac00 \uc815\uc6d0 6\uba85\uc774 \uac00\ub4dd \ucc3c\uc2b5\ub2c8\ub2e4.', en: 'This raid has reached its limit of 6 participants.', ja: '\u5171\u540c\u8a0e\u4f10\u306f\u5b9a\u54e16\u4eba\u306b\u9054\u3057\u307e\u3057\u305f\u3002' },
    invalid: { ko: '의뢰 요청과 현재 참가 상태를 확인해 주세요.', en: 'Check the quest request and your current membership.', ja: '依頼の要求と現在の参加状態を確認してください。' },
    guildOnly: { ko: '해당 의뢰를 담당하는 시설이나 의뢰인에게 방문하세요.', en: 'Visit the facility or resident handling this request.', ja: 'その依頼を扱う施設か依頼人を訪ねてください。' },
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
/** Required grade measures the whole objective, including all waves of a pack. */
export function fantasyContractHunt(quest: FantasyQuest): { grade: FantasyAdventurerGrade; monster: string; enemyCount: number } | undefined {
  const objective = quest.objective;
  if (objective?.type !== 'hunt') return undefined;
  const monster = objective.monster?fantasyCombatEnemy(objective.monster):undefined;
  if (!monster) return undefined;
  return { grade: fantasyQuestGrade(quest),
    monster: monster.id, enemyCount: Math.min(6, objective.count) };
}
/** Each grade has its own deterministic posting gate before the board's slot lottery. */
export function fantasyContractPostingChance(grade: number): number {
  return [0, 1, .65, .35, .16, .06, .02, .005, .001][Math.max(1, Math.min(8, Math.floor(grade)))] ?? 0;
}
export function fantasyContractCandidates(location: string, hour: number, season: string, seasonDay: number): FantasyQuest[] {
  const land = FANTASY_LOCATIONS.find(place => place.id === location)?.land;
  return FANTASY_QUESTS.filter(quest => {
    const q = quest as Quest;
    const hunt = fantasyContractHunt(quest);
    if (quest.objective?.type === 'hunt' && (!hunt || (fantasyCombatEnemy(hunt.monster)?.tier ?? 8) > 7)) return false;
    const giverLand = FANTASY_LOCATIONS.find(place => place.id === quest.giver)?.land;
    const institution= fantasyQuestInstitution(quest);
    if(institution!=='guild'&&quest.giver!==location)return false;
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
  return FANTASY_INSTITUTIONS.some(source=>fantasyInstitutionPresent(character,source));
}
export function fantasyCanClaimContract(character: FantasyCharacter, offer: FantasyContractOffer, hour: number): boolean {
  const quest = FANTASY_QUESTS.find(quest => quest.id === offer.quest);
  const objective = quest?.objective;
  const allowedTarget = objective?.type !== 'hunt' || !!objective.monster&&fantasyCombatEnemy(objective.monster)?.kind==='monster'&&fantasyCombatEnemy(objective.monster)!.tier<=7;
  return !!quest && allowedTarget && !fantasyPersonalQuest(quest) && fantasyInstitutionEligible(character,fantasyQuestInstitution(quest)) && fantasyInstitutionPresent({...character,hour},fantasyQuestInstitution(quest)) && character.location === offer.boardLocation
    && offer.startedAt === undefined && hour >= offer.createdAt && hour < offer.expiresAt && !character.quests.includes(quest.id) && !character.completed.includes(quest.id)
    && fantasyQuestEligible(character, quest) && NPC_PUBLIC.some(npc => npc.id === offer.issuer && npc.homeLocation === quest.giver);
}
