import type { FantasyCharacter } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_DUNGEONS } from './fantasy-dungeon-catalog.ts';

export type FantasyCarryReturnMethod = 'carry' | 'putDown' | 'tend' | 'returnInvite' | 'returnAccept' | 'returnDecline';
export interface FantasyCarryState {
  target: string; targetGeneration: number; generation: number; party: string;
  location: string; site?: string; room?: string;
}
export interface FantasyReturnLanternState {
  party: string; generation: number; site: string; room: string; location: string;
  invited: { user: string; generation: number }[]; accepted: string[]; startedAt: number; endsAt: number;
}
export const FANTASY_RETURN_LANTERN_HOURS = 3;
export const FANTASY_RETURN_LANTERN_MP = 45;
export const FANTASY_RETURN_LANTERN_FATIGUE = 35;
export const FANTASY_DOWNED_CARE_HOURS = 12;

const phrases = {
  'carry:unavailable': ['같은 장소의 파티 동료와 전투·행동이 없는 상태에서 시도하세요.', 'You need a party companion at the same place, outside combat and other activities.', '同じ場所のパーティーの仲間と、戦闘や行動のない状態で試してください。'],
  'carry:occupied': ['이미 동료 한 명을 부축하고 있거나 다른 동료가 부축 중입니다.', 'You already carry someone, or that companion is being carried.', 'すでに一人を運んでいるか、その仲間は別の人が運んでいます。'],
  'carry:patient': ['아직 쓰러져 있는 동료만 부축할 수 있습니다.', 'Only a companion who is still downed can be carried.', 'まだ倒れている仲間だけを運べます。'],
  'carry:started': ['쓰러진 동료를 부축했다. 이동하면 함께 이동한다.', 'Picked up the downed companion. They will move with you.', '倒れた仲間を抱えた。移動すると一緒に移動する。'],
  'carry:patient-started': ['파티 동료가 부축했다. 동료와 함께 이동한다.', 'A party companion picked you up. You will move with them.', 'パーティーの仲間に抱えられた。仲間と一緒に移動する。'],
  'carry:put-down': ['동료를 안전하게 내려놓았다.', 'Put your companion down.', '仲間を下ろした。'],
  'carry:patient-put-down': ['동료가 이곳에 내려놓았다.', 'Your companion put you down here.', '仲間にここで下ろされた。'],
  'carry:ended': ['상태나 파티가 바뀌어 부축을 마쳤다.', 'Carrying ended because a condition or party changed.', '状態やパーティーが変わったため、運ぶのをやめた。'],
  'carry:care-potion': ['동료를 돌보려면 회복 물약 한 개가 필요합니다.', 'You need a healing potion to tend your companion.', '仲間を看護するには回復薬が一つ必要です。'],
  'carry:care-wait': ['다음 간호까지 세계 시간 1시간을 기다려야 합니다.', 'Wait one world hour before tending again.', '次の看護まで世界時間で1時間待ってください。'],
  'carry:care-limit': ['간호로 늘릴 수 있는 대기 시간은 합계 12시간까지입니다.', 'Care can extend the waiting time by at most 12 hours in total.', '看護で延ばせる待機時間は合計12時間までです。'],
  'carry:tended': ['회복 물약으로 동료를 돌봐 남은 시간을 2시간 늘렸다.', 'Spent a healing potion tending your companion, extending their time by two hours.', '回復薬で仲間を看護し、残る時間を2時間延ばした。'],
  'return:saint': ['귀환의 등불을 준비한 성자 사제만 사용할 수 있습니다.', 'A Saint priest with Return Lantern prepared is required.', '帰還の灯を準備した聖者の司祭だけが使えます。'],
  'return:sealed': ['이 장소에서는 귀환의 등불을 사용할 수 없습니다.', 'Return Lantern cannot be used at this site.', 'この場所では帰還の灯を使えません。'],
  'return:cost': ['MP 45와 피로 여유 35가 필요합니다.', 'You need 45 MP and room for 35 fatigue.', 'MP45と疲労35の余裕が必要です。'],
  'return:pending': ['이미 귀환의 등불을 준비하고 있습니다.', 'Return Lantern is already channeling.', 'すでに帰還の灯を祈っています。'],
  'return:invitation': ['유효한 귀환 초대가 없거나 동료와 같은 방에 있지 않습니다.', 'There is no valid Return Lantern invitation, or you are no longer in the same room.', '有効な帰還の招待がないか、仲間と同じ部屋にいません。'],
  'return:started': ['귀환의 등불에 3시간 기도를 시작했다. 의식이 있는 동료는 직접 동의해야 한다.', 'Began the three-hour Return Lantern prayer. Conscious companions must explicitly agree.', '帰還の灯に3時間の祈りを始めた。意識のある仲間は自ら同意する必要がある。'],
  'return:accepted': ['귀환의 등불에 동의했다. 기도가 끝날 때까지 같은 방에 머문다.', 'Accepted Return Lantern. Remain in the same room until the prayer ends.', '帰還の灯に同意した。祈りが終わるまで同じ部屋に留まる。'],
  'return:declined': ['귀환의 등불 초대를 거절했다.', 'Declined the Return Lantern invitation.', '帰還の灯の招待を断った。'],
  'return:cancelled': ['기도 조건이 바뀌어 귀환의 등불이 꺼졌다. 사용한 비용은 돌아오지 않는다.', 'The prayer conditions changed and Return Lantern faded. Its cost is not refunded.', '祈りの条件が変わり、帰還の灯が消えた。使った費用は戻らない。'],
  'return:completed': ['귀환의 등불을 따라 동의한 동료와 부축 중인 동료가 던전 시작 지점으로 돌아왔다.', 'Followed Return Lantern to the dungeon starting point with consenting and carried companions.', '帰還の灯に従い、同意した仲間と運んでいる仲間がダンジョンの開始地点へ戻った。'],
} as const;
export function fantasyCarryReturnText(source: string, locale: NpcLocale): string | undefined {
  const entry = phrases[source as keyof typeof phrases];
  return entry?.[{ ko: 0, en: 1, ja: 2 }[locale]];
}

const RETURN_SITES = new Set(['oldwatch', 'fern-sanctum', 'eclipsevault', 'deepcave', 'root-cavern', 'deepcave-depths']);
export function fantasyReturnLanternSiteAllowed(c: Pick<FantasyCharacter, 'location' | 'dungeon'>): boolean {
  const active = c.dungeon?.active, site = active && FANTASY_DUNGEONS.find(site => site.id === active.site);
  if (!site || site.location !== c.location || !RETURN_SITES.has(site.id) || /^(story|main)(?:[-:]|$)/.test(c.location)) return false;
  const restriction = site as typeof site & { storySealed?: boolean; sealed?: boolean; returnBlocked?: boolean; allowReturn?: boolean };
  return !restriction.storySealed && !restriction.sealed && !restriction.returnBlocked && restriction.allowReturn !== false;
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f\u007f]/.test(value);
const generation = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 1;
const hour = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function validFantasyCarryReturn(c: FantasyCharacter): boolean {
  const { carrying, returnLantern } = c as FantasyCharacter & { carrying?: FantasyCarryState; returnLantern?: FantasyReturnLanternState };
  if (carrying !== undefined && (!object(carrying) || Object.keys(carrying).some(key => !['target', 'targetGeneration', 'generation', 'party', 'location', 'site', 'room'].includes(key)) || !id(carrying.target) || !generation(carrying.targetGeneration) || !generation(carrying.generation) || !id(carrying.party) || !id(carrying.location) || (carrying.site === undefined ? carrying.room !== undefined : !id(carrying.site) || !id(carrying.room)))) return false;
  if (returnLantern === undefined) return true;
  return object(returnLantern) && Object.keys(returnLantern).length === 9 && Object.keys(returnLantern).every(key => ['party', 'generation', 'site', 'room', 'location', 'invited', 'accepted', 'startedAt', 'endsAt'].includes(key))
    && id(returnLantern.party) && generation(returnLantern.generation) && id(returnLantern.site) && id(returnLantern.room) && id(returnLantern.location)
    && Array.isArray(returnLantern.invited) && returnLantern.invited.length <= 5 && returnLantern.invited.every(invite => object(invite) && Object.keys(invite).length === 2 && id(invite.user) && generation(invite.generation)) && new Set(returnLantern.invited.map(invite => invite.user)).size === returnLantern.invited.length
    && Array.isArray(returnLantern.accepted) && returnLantern.accepted.length <= 5 && returnLantern.accepted.every(user => id(user) && returnLantern.invited.some(invite => invite.user === user)) && new Set(returnLantern.accepted).size === returnLantern.accepted.length
    && hour(returnLantern.startedAt) && returnLantern.startedAt <= c.hour && hour(returnLantern.endsAt) && returnLantern.endsAt === returnLantern.startedAt + FANTASY_RETURN_LANTERN_HOURS;
}
