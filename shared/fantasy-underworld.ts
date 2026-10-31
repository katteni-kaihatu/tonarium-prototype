import type { FantasyCharacter, FantasyProfile, FantasyResult } from './fantasy.ts';
import type { FantasyContractGrant } from './fantasy-contracts.ts';
import { FANTASY_QUESTS } from './fantasy-data.ts';
import { fantasyCriminalContact, fantasyCriminalJob, fantasyQuestInstitution } from './fantasy-institutions.ts';
import { fantasyBlackMarketOpening } from './fantasy-black-market.ts';
import { FANTASY_JOB_DISCOVERY_BOOKS } from './fantasy-job-discovery.ts';
import { FANTASY_RELICS } from './fantasy-relic-catalog.ts';
import { fantasyBagState } from './fantasy-bags.ts';
import { fantasySpendItem } from './fantasy-equipment.ts';
import { NPC_PUBLIC, type NpcLocale } from './npc.ts';

export const FANTASY_UNDERWORLD_JOBS = ['thief', 'smuggler', 'assassin', 'bandit', 'spy', 'crimeboss'] as const;
export const FANTASY_UNDERWORLD_THRESHOLDS = [0, 20, 60, 140, 280] as const;
export type FantasyUnderworldRewardId = 'supplies' | 'folio' | 'relic';
export interface FantasyUnderworldProgress { version: 1; trust: number; merit: number; receipts: { quest: string; contract: string }[]; claimed: FantasyUnderworldRewardId[] }
export type FantasyUnderworldAction = { type: 'underworldClaim'; reward: FantasyUnderworldRewardId; npc?: string };
export interface FantasyUnderworldContext { hour: number; realm: string }
const text = (ko: string, en: string, ja: string): Record<NpcLocale, string> => ({ ko, en, ja });
export const FANTASY_UNDERWORLD_TITLES = [text('낯선 얼굴', 'Unknown Face', '見知らぬ顔'), text('연락책', 'Contact', '連絡役'), text('약속을 지키는 손', 'Trusted Hand', '約束を守る手'), text('밤길의 중개인', 'Night Broker', '夜道の仲介人'), text('그림자 원탁', 'Shadow Council', '影の円卓')];
export const FANTASY_UNDERWORLD_REWARDS = [
  { id: 'supplies' as const, tier: 2, merit: 20, gold: 10, inputs: { silk: 1 }, names: text('연락책의 보급품', 'Contact’s supplies', '連絡役の補給品'), descriptions: text('회복약 2개와 해독제 1개. 한 생애에 한 번.', 'Two potions and one antidote. Once per life.', '回復薬2個と解毒薬1個。一生に一度。') },
  { id: 'folio' as const, tier: 4, merit: 60, gold: 35, inputs: { crystal: 1 }, names: text('생업의 잃어버린 장', 'A Trade’s Lost Folio', '生業の拾遺帖'), descriptions: text('현재 직업의 아직 읽지 않은 길을 다루는 문헌. 읽어야 지식을 얻으며 수련 조건은 그대로입니다.', 'A folio about an unread path of your current trade. Study it for knowledge; practice requirements still apply.', '今の職の未読の道を記す文献。読んで知識を得ても修練条件は必要。') },
  { id: 'relic' as const, tier: 5, merit: 100, gold: 90, inputs: { gem: 1 }, names: text('봉인된 유고의 단서', 'Sealed testament clue', '封じた遺稿の手掛かり'), descriptions: text('현재 직업의 아직 연구하지 않은 유고 1개. 승급이나 기술을 즉시 부여하지 않습니다.', 'One unstudied testament for your current trade. Rank and skills still require their usual practice.', '今の職の未研究の遺稿1冊。昇格と技能には通常の修練が必要。') },
];
const errors = {
  invalid: text('조직 기록이나 요청을 확인하세요.', 'Check the organization record and request.', '組織の記録と要求を確かめてください。'),
  unavailable: text('현재 뒷세계 직업으로, 다른 일을 마친 뒤 찾아오세요.', 'Return in an underworld profession after finishing your current activity.', '現在の裏稼業で、ほかの用事を終えてから訪ねてください。'),
  venue: text('현지 뒷세계의 연락책이나 열려 있는 암시장을 찾아가세요.', 'Visit a local underworld contact or an open black market you know.', '現地の裏稼業の連絡役か、印を知る開催中の闇市を訪ねてください。'),
  rank: text('완료한 조직 의뢰로 신뢰와 공적을 더 쌓으세요.', 'Earn more trust and merit through completed underworld contracts.', '組織の依頼を完了し、信用と功績を積んでください。'),
  claimed: text('이 보상은 이번 생애에 이미 받았습니다.', 'You have already collected this reward in this life.', 'この報酬は今の生ですでに受け取りました。'),
  knowledge: text('이미 가진 문헌이나 아는 지식을 중복해서 받을 수 없습니다.', 'You already own the literature or know all its available knowledge.', '所持する文献や、知る知識を重ねて受け取れません。'),
  materials: text('금화나 사용 가능한 재료가 부족합니다.', 'You lack the gold or available materials.', '金貨か使える材料が足りません。'),
  bag: text('보상 받을 가방 공간을 확보하세요.', 'Make room in your bag for the reward.', '報酬を受け取る鞄の空きを作ってください。'),
};
export const fantasyUnderworldText = (source: string, locale: NpcLocale): string | undefined => Object.values(errors).find(row => row.ja === source)?.[locale];
export const fantasyUnderworldNpcText = (locale: NpcLocale) => text('약속을 지켜 돌아온 의뢰만 조직의 공적으로 기록해요. 악명과는 별개예요. 연락책에게 신뢰에 맞는 보급품과 문헌을 부탁할 수 있어요.', 'Only completed contracts earn the organization’s trust and merit. Notoriety is separate. Ask a contact about supplies and literature earned through that trust.', '約束を果たして帰った依頼だけを、組織の功績として記す。悪名とは別の話だ。信用に見合う補給品や文献は連絡役に尋ねてくれ。')[locale];
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 500 && !/[\u0000-\u001f\u007f]/.test(v);
const crimeJob = fantasyCriminalJob;
const rewardId = (v: unknown): v is FantasyUnderworldRewardId => FANTASY_UNDERWORLD_REWARDS.some(row => row.id === v);
const fresh = (): FantasyUnderworldProgress => ({ version: 1, trust: 0, merit: 0, receipts: [], claimed: [] });
export function fantasyUnderworldActionValid(v: unknown): v is FantasyUnderworldAction {
  return object(v) && Object.keys(v).every(key => ['type', 'reward', 'npc'].includes(key)) && v.type === 'underworldClaim' && rewardId(v.reward) && (!Object.hasOwn(v, 'npc') || id(v.npc));
}
export function fantasyUnderworldState(c: FantasyCharacter) {
  const progress = c.underworld ?? fresh(), tier = FANTASY_UNDERWORLD_THRESHOLDS.reduce<number>((result, threshold, index) => progress.trust >= threshold ? index + 1 : result, 1);
  return { ...progress, tier, title: FANTASY_UNDERWORLD_TITLES[tier - 1], nextTrust: FANTASY_UNDERWORLD_THRESHOLDS[tier], active: crimeJob(c.job) };
}
export function validFantasyUnderworld(c: FantasyCharacter): boolean {
  const v: unknown = c.underworld; if (v === undefined) return true;
  if (!object(v) || Object.keys(v).length !== 5 || v.version !== 1 || !Array.isArray(v.receipts) || v.receipts.length > 4096 || !Array.isArray(v.claimed) || v.claimed.length > 3 || !v.claimed.every(rewardId) || new Set(v.claimed).size !== v.claimed.length) return false;
  if (v.receipts.some(row => !object(row) || Object.keys(row).length !== 2 || !id(row.quest) || !id(row.contract) || !c.completed.includes(row.quest as string)) || new Set(v.receipts.map(row => row.quest)).size !== v.receipts.length || new Set(v.receipts.map(row => row.contract)).size !== v.receipts.length) return false;
  return v.trust === v.receipts.length * 20 && v.merit === v.receipts.length * 20 - v.claimed.reduce<number>((cost, reward) => cost + FANTASY_UNDERWORLD_REWARDS.find(row => row.id === reward)!.merit, 0)
    && Number(v.merit) >= 0 && v.claimed.every(reward => FANTASY_UNDERWORLD_THRESHOLDS[FANTASY_UNDERWORLD_REWARDS.find(row => row.id === reward)!.tier - 1] <= Number(v.trust));
}
export function fantasyUnderworldNpc(c: FantasyCharacter, npcId: string): boolean {
  return NPC_PUBLIC.some(npc => npc.id === npcId && npc.homeLocation === c.location && !npc.travelOnly && fantasyCriminalContact(npc.id));
}

/** 完了処理の前後と受注台帳を照合し、再精算を防ぐ。 */
export function creditFantasyUnderworldCompletion(before: FantasyProfile, after: FantasyProfile, questId: string, grant: FantasyContractGrant | undefined): boolean {
  const a = before.character, b = after.character, q = FANTASY_QUESTS.find(q => q.id === questId), accepted = a?.contracts?.[questId];
  if (!a || !b || before.death || after.death || (before.generation ?? 1) !== (after.generation ?? 1) || a.name !== b.name || a.race !== b.race || a.lifeStartedAt !== b.lifeStartedAt
    || !crimeJob(b.job) || !q || fantasyQuestInstitution(q) !== 'underworld' || !grant || !accepted || JSON.stringify(accepted) !== JSON.stringify(grant)
    || !id(grant.offerId) || !a.quests.includes(questId) || a.completed.includes(questId) || !b.completed.includes(questId) || b.quests.includes(questId) || b.contracts?.[questId]
    || !Number.isFinite(b.hour) || b.hour < a.hour || !Number.isFinite(grant.acceptedAt) || !Number.isFinite(grant.expiresAt) || grant.acceptedAt > a.hour || b.hour >= grant.expiresAt || grant.expiresAt <= grant.acceptedAt
    || q.issuer && q.issuer !== grant.issuer || !validFantasyUnderworld(a) || JSON.stringify(a.underworld) !== JSON.stringify(b.underworld)) return false;
  const progress = structuredClone(a.underworld ?? fresh());
  if (progress.receipts.length >= 4096 || progress.receipts.some(row => row.quest === questId || row.contract === grant.offerId)) return false;
  progress.receipts.push({ quest: questId, contract: grant.offerId }); progress.trust += 20; progress.merit += 20; b.underworld = progress; return true;
}

export function applyFantasyUnderworld(profile: FantasyProfile, action: FantasyUnderworldAction, context: FantasyUnderworldContext): FantasyResult {
  const fail = (key: keyof typeof errors): FantasyResult => ({ profile, changed: false, error: errors[key].ja });
  const c = profile.character;
  if (!fantasyUnderworldActionValid(action) || !c || !validFantasyUnderworld(c) || !Number.isFinite(context.hour) || context.hour < c.hour || !context.realm || context.realm.length > 200) return fail('invalid');
  if (!crimeJob(c.job) || profile.death || profile.activity || profile.combatId || profile.event || c.hp <= 0 || c.downed || c.travelPosition || c.dungeon?.active) return fail('unavailable');
  if (action.npc ? !fantasyUnderworldNpc(c, action.npc) : !c.blackMarketClues?.includes(c.location) || !fantasyBlackMarketOpening(c.location, context.hour, context.realm).open) return fail('venue');
  const reward = FANTASY_UNDERWORLD_REWARDS.find(row => row.id === action.reward)!, progress = fantasyUnderworldState(c);
  if (progress.claimed.includes(reward.id)) return fail('claimed');
  if (progress.tier < reward.tier || progress.merit < reward.merit) return fail('rank');
  let output: Record<string, number>;
  if (reward.id === 'supplies') output = { potion: 2, antidote: 1 };
  else if (reward.id === 'folio') {
    if ((c.inventory['black-skill-folio'] ?? 0) > 0 || !Object.entries(FANTASY_JOB_DISCOVERY_BOOKS).some(([path, book]) => path.startsWith(`${c.job}-`) && !c.readBooks?.includes(book))) return fail('knowledge');
    output = { 'black-skill-folio': 1 };
  } else {
    const relic = FANTASY_RELICS.find(row => row.job === c.job && !c.blackMarketStudies?.includes(row.id) && !(c.inventory[`black-study-${row.path}`] > 0));
    if (!relic) return fail('knowledge'); output = { [`black-study-${relic.path}`]: 1 };
  }
  if (c.gold < reward.gold) return fail('materials');
  const next = structuredClone(profile), character = next.character!;
  for (const [item, amount] of Object.entries(reward.inputs)) if (!fantasySpendItem(character, item, amount!)) return fail('materials');
  for (const [item, amount] of Object.entries(output)) { character.inventory[item] = (character.inventory[item] ?? 0) + amount; if (character.inventory[item] > 1_000_000) return fail('bag'); }
  const bag = fantasyBagState(character); if (bag.weight > bag.weightLimit || bag.slots > bag.slotLimit) return fail('bag');
  character.gold -= reward.gold; character.underworld!.merit -= reward.merit; character.underworld!.claimed.push(reward.id); next.revision++;
  return { profile: next, changed: true };
}
