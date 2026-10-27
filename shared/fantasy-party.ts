import type { FantasyMainApproach } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import type { FantasyCombatStartKind } from './fantasy-combat-challenges.ts';
import type { FantasyPartyVault, FantasyPartyVaultCommand } from './fantasy-party-vault.ts';

export const FANTASY_PARTY_MAX_MEMBERS = 6;
export const FANTASY_PARTY_TTL_MS = 120_000;
export type FantasyPartyCommand = { type: 'create' | 'leave' | 'unready' | 'start' | 'sync' }
  | { type: 'invite'; target: string } | { type: 'respond'; invite: string; accept: boolean }
  | { type: 'ready'; quest: string; approach: FantasyMainApproach }
  | { type: 'readyCombat'; source: FantasyCombatStartKind; target: string; confirm?: boolean } | { type: 'startCombat' }
  | { type: 'readyTravel'; destination: string; transport: string } | { type: 'startTravel' }
  | { type: 'chat'; text: string } | { type: 'joinCombat'; combatId: string; confirm?: boolean }
  | FantasyPartyVaultCommand;
export type FantasyPartyError = 'invalid' | 'unavailable' | 'not-in-world' | 'not-alive' | 'already-in-party' | 'no-party' | 'leader-only'
  | 'not-found' | 'party-full' | 'invite-expired' | 'self-invite' | 'invite-pending' | 'busy' | 'incompatible' | 'not-ready' | 'too-small' | 'save-failed' | 'rate-limit' | 'stale' | 'equipped';
export interface FantasyPartyState {
  id: string | null;
  members: { id: string; name: string; isLeader: boolean; here: boolean; ready: boolean; compatible: boolean; combatReady?: boolean; travelReady?: boolean }[];
  invitations: { id: string; fromId: string; fromName: string; expiresAt: number }[];
  canStart: boolean;
  canStartCombat?: boolean;
  canStartTravel?: boolean;
  travelHours?: number;
  chat?: { id: string; from: string; name: string; text: string; at: number }[];
  vault?: FantasyPartyVault;
  battle?: { id: string; needsConfirmation: boolean };
}
const phrases: Record<FantasyPartyError, [string, string, string]> = {
  invalid: ['파티 요청을 확인할 수 없습니다.', 'The party request is invalid.', 'パーティーの依頼を確認できません。'],
  unavailable: ['지금은 파티 조사를 시작할 수 없습니다.', 'Party investigation is unavailable.', 'いまは共同調査を始められません。'],
  'not-in-world': ['같은 판타지 세계에 참가해야 합니다.', 'Join the same fantasy session first.', '同じファンタジー世界に参加してください。'],
  'not-alive': ['살아 있는 캐릭터로 참가해 주세요.', 'A living character is required.', '生きている人物で参加してください。'],
  'already-in-party': ['이미 파티에 참가하고 있습니다.', 'You are already in a party.', 'すでにパーティーに参加しています。'],
  'no-party': ['참가한 파티가 없습니다.', 'You are not in a party.', '参加中のパーティーがありません。'],
  'leader-only': ['파티장만 할 수 있습니다.', 'Only the party leader can do that.', 'リーダーだけが行えます。'],
  'not-found': ['지금 초대할 수 있는 동료가 아닙니다.', 'That traveler is not available to invite.', 'いま招待できる旅人ではありません。'],
  'party-full': ['파티는 최대 6명입니다.', 'A party can have at most six members.', 'パーティーは最大6人です。'],
  'invite-expired': ['초대가 만료되었거나 취소되었습니다.', 'The invitation expired or was cancelled.', '招待が期限切れか取り消されています。'],
  'self-invite': ['자신을 초대할 수 없습니다.', 'You cannot invite yourself.', '自分は招待できません。'],
  'invite-pending': ['이미 초대했습니다.', 'An invitation is already pending.', 'すでに招待しています。'],
  busy: ['현재 행동이나 사건을 먼저 마쳐 주세요.', 'Finish the current activity or encounter first.', 'いまの行動や出来事を先に終えてください。'],
  incompatible: ['같은 장소에서 같은 조사 단계에 있어야 합니다.', 'Everyone must be at the same location and investigation stage.', '同じ場所で同じ調査段階にいる必要があります。'],
  'not-ready': ['각자가 조사 방법을 고르고 준비해야 합니다.', 'Each member must choose an approach and ready themselves.', '一人ずつ調査方法を選び、準備してください。'],
  'too-small': ['공동 조사는 2명 이상이 필요합니다.', 'At least two members are needed.', '共同調査には2人以上必要です。'],
  'save-failed': ['기록을 저장하지 못해 모두 출발을 취소했습니다.', 'Saving failed, so nobody started.', '記録を保存できず、全員の開始を取り消しました。'],
  'rate-limit': ['요청이 잦습니다. 잠시 뒤 다시 해 주세요.', 'Too many requests. Try again shortly.', '依頼が続いています。少し待ってください。'],
  stale: ['공동 소지품이 바뀌었습니다. 다시 확인해 주세요.', 'The shared supplies changed. Refresh and try again.', '共有の持ち物が変わりました。確認し直してください。'],
  equipped: ['착용 중인 장비를 해제하거나 보낼 물건을 다시 선택해 주세요.', 'Unequip the item or select the exact item to deposit.', '装着を外すか、預ける品を選び直してください。'],
};
export const fantasyPartyErrorText = (error: FantasyPartyError, locale: NpcLocale) => phrases[error][{ ko: 0, en: 1, ja: 2 }[locale]];
export function isFantasyPartyCommand(value: unknown): value is FantasyPartyCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>, keys = (...fields: string[]) => Object.keys(v).length === fields.length + 1 && fields.every(field => Object.hasOwn(v, field));
  const id = (id: unknown) => typeof id === 'string' && id.length > 0 && id.length <= 160 && !/[\u0000-\u001f\u007f]/.test(id);
  switch (v.type) {
    case 'create': case 'leave': case 'unready': case 'start': case 'startCombat': case 'startTravel': case 'sync': return keys();
    case 'invite': return keys('target') && id(v.target);
    case 'respond': return keys('invite', 'accept') && id(v.invite) && typeof v.accept === 'boolean';
    case 'ready': return keys('quest', 'approach') && id(v.quest) && ['observe', 'analyze', 'restore'].includes(String(v.approach));
    case 'readyCombat': return (keys('source', 'target') || keys('source', 'target', 'confirm') && typeof v.confirm === 'boolean') && ['hunt', 'story', 'encounter', 'apex', 'challenge'].includes(String(v.source)) && id(v.target);
    case 'readyTravel': return keys('destination', 'transport') && id(v.destination) && id(v.transport);
    case 'chat': return keys('text') && typeof v.text === 'string' && v.text.trim().length > 0 && [...v.text].length <= 500 && !/[\u0000-\u001f\u007f]/.test(v.text);
    case 'joinCombat': return (keys('combatId') || keys('combatId', 'confirm') && typeof v.confirm === 'boolean') && id(v.combatId);
    case 'deposit': return (keys('revision', 'item', 'count') || keys('revision', 'item', 'count', 'instance') && id(v.instance)) && Number.isSafeInteger(v.revision) && Number(v.revision) >= 0 && id(v.item) && Number.isSafeInteger(v.count) && Number(v.count) > 0 && Number(v.count) <= 999;
    case 'requestWithdraw': return keys('revision', 'lot', 'count') && Number.isSafeInteger(v.revision) && Number(v.revision) >= 0 && id(v.lot) && Number.isSafeInteger(v.count) && Number(v.count) > 0 && Number(v.count) <= 999;
    case 'approveWithdraw': return keys('revision', 'request', 'approve') && Number.isSafeInteger(v.revision) && Number(v.revision) >= 0 && id(v.request) && typeof v.approve === 'boolean';
    default: return false;
  }
}
