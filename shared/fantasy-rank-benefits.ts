import { FANTASY_GUILD_SUPPLY_DISCOUNT_GRADE } from './fantasy-guild-supply-rates.ts';
import type { FantasyCharacter } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { fantasyBagState } from './fantasy-bags.ts';
import { fantasyBuildings } from './fantasy-town.ts';
import { fantasyFacilityOpen } from './fantasy-facility-hours.ts';
import { fantasyRegisteredGuildGrade } from './fantasy-guild-progression.ts';
import { fantasyPriestGrowthStatus } from './fantasy-priest-growth.ts';
import { FANTASY_LODGINGS, reconcileFoodLots } from './fantasy-life.ts';

export type FantasyRankBenefitSource = 'adventurer' | 'priest';
export const FANTASY_RANK_BENEFIT_IDS = ['guild-rental', 'guild-supplies', 'guild-report', 'guild-title', 'temple-lodging', 'temple-materials', 'temple-title'] as const;
export type FantasyRankBenefitId = typeof FANTASY_RANK_BENEFIT_IDS[number];
export type FantasyRankBenefitAction = { type: 'rankBenefitClaim'; benefit: FantasyRankBenefitId } | { type: 'rankBenefitReturn'; benefit: 'guild-rental' };
export interface FantasyRankBenefitsState {
  claims: Partial<Record<FantasyRankBenefitId, number>>;
  loans?: { 'guild-rental'?: { deposit: number; claimedAt: number } };
  titles?: ('guild-master' | 'temple-archpriest')[];
  escortBonusDay?: number;
}
type Text = Record<NpcLocale, string>;
const l = (ko: string, en: string, ja: string): Text => ({ ko, en, ja });
interface Benefit {
  id: string; source: FantasyRankBenefitSource; grade: number; names: Text; descriptions: Text;
  claim?: FantasyRankBenefitId; items?: Record<string, number>; price?: number; daily?: boolean;
}
export interface FantasyRankBenefitStatus extends Benefit { unlocked: boolean; claimed: boolean; loaned: boolean }
export const FANTASY_GUILD_RENTAL_ITEMS = { 'guild-loan-lantern': 1, 'guild-loan-bedroll': 1 };
export const FANTASY_GUILD_RENTAL_DEPOSIT = 30;
export const FANTASY_TEMPLE_MATERIAL_ITEMS = { silverweed: 1, moonmint: 1 };
export const FANTASY_TEMPLE_MATERIAL_PRICE = 22;
const benefits: readonly Benefit[] = [
  { id: 'guild-services', source: 'adventurer', grade: 1, names: l('길드 기본 서비스', 'Guild services', 'ギルドの基本サービス'), descriptions: l('길드에서 의뢰를 수락·보고하고 승급 심사를 받습니다.', 'Accept and report contracts and request promotion assessments at the guild.', 'ギルドで依頼を受注・報告し、昇格審査を受けられる。') },
  { id: 'guild-rental', source: 'adventurer', grade: 2, claim: 'guild-rental', items: FANTASY_GUILD_RENTAL_ITEMS, price: FANTASY_GUILD_RENTAL_DEPOSIT, names: l('여행 장비 대여', 'Travel equipment loan', '旅道具の貸出'), descriptions: l('보증금 30G로 길드 대여용 랜턴과 침낭을 한 벌 빌립니다. 대여품은 구매품·제작품보다 조명과 야영 회복 성능이 낮습니다. 어느 길드에서든 두 물품을 돌려주면 보증금을 전액 환급합니다. 길드 대여품만 반환할 수 있습니다.', 'Borrow a guild loan lantern and bedroll for a 30G deposit. Lighting and camping recovery are weaker than purchased or crafted gear. Return both at any guild for a full refund. Only the guild loan items can be returned.', '保証金30Gでギルド貸出用のランタンと寝袋を一組借りられる。照明と野営回復は購入品・制作物より低い。どのギルドでも両方返せば全額返金。返せるのはギルド貸出品だけ。') },
  { id: 'guild-commissions', source: 'adventurer', grade: 3, names: l('지명 의뢰 자격', 'Named commissions', '指名依頼の資格'), descriptions: l('지명 의뢰는 각 의뢰의 등급·지역·선행 조건을 충족하면 기존 의뢰 게시판에 표시됩니다.', 'Named commissions appear on the existing board when their own rank, location and prerequisite conditions are met.', '指名依頼は各依頼の等級・地域・前提条件を満たすと既存の掲示板に表示される。') },
  { id: 'guild-supplies', source: 'adventurer', grade: FANTASY_GUILD_SUPPLY_DISCOUNT_GRADE, names: l('길드 보급품 추가 할인', 'Extra guild supply discount', 'ギルド補給品の追加割引'), descriptions: l('길드의 한정 보급품을 살 때 할인가에서 추가로 2% 할인받습니다. 다른 모험가와 같은 소량 재고를 이용하며, 품절되면 다음 입고를 기다려야 합니다.', 'Receive an extra 2% off discounted guild supplies. Purchases use the same limited shared stock; sold-out goods return with the next delivery.', 'ギルドの限定補給品を割引価格からさらに2%引きで購入できる。ほかの冒険者と同じ少量の共有在庫を使い、売り切れたら次の入荷を待つ。') },
  { id: 'guild-inn', source: 'adventurer', grade: 5, names: l('제휴 여관 5% 할인', 'Partner inns: 5% off', '提携宿屋5%割引'), descriptions: l('여관 숙박료가 자동으로 5% 할인됩니다. 금화 단위로 올림하며 식사는 제외됩니다.', 'Inn room prices automatically receive 5% off, rounded up to whole gold. Meals are excluded.', '宿屋の宿泊代が自動で5%引き。金貨単位で切り上げ、食事は対象外。') },
  { id: 'guild-escort', source: 'adventurer', grade: 6, names: l('하루 첫 호위 보수 +5%', 'First daily escort: +5% pay', '一日最初の護衛報酬+5%'), descriptions: l('세계 하루에 처음 성공·정산한 호위의 보수에 5%를 더합니다. 금화 단위로 내림하고 최소 1G를 지급합니다. 포기·실패는 소비하지 않습니다.', 'The first successfully settled escort each world day pays 5% extra, rounded down with a 1G minimum. Abandonment and failure do not use it.', '世界の一日で最初に成功・精算した護衛の報酬に5%加算。端数切り捨て、最低1G。放棄・失敗では使われない。') },
  { id: 'guild-report', source: 'adventurer', grade: 7, claim: 'guild-report', items: { 'map-hearth-fields': 1 }, price: 0, names: l('원정 준비 자료', 'Expedition preparation chart', '遠征準備の資料'), descriptions: l('길드가 공개한 하스 들녘 지도 한 장을 무료로 받습니다. 사용하면 하스·초록숲·햇살목초지의 길을 기록합니다. 인물당 한 번입니다.', 'Receive one free public Hearth fields chart. Use it to record Hearth, Greenwood and Sunmeadow. Once per character.', '公開資料「ハースの野辺地図」を一枚無料で受領。使うとハース・翠葉の森・陽だまり牧草地を記録。一人一度。') },
  { id: 'guild-title', source: 'adventurer', grade: 8, claim: 'guild-title', price: 0, names: l('길드 명예 칭호', 'Guild honorary title', 'ギルドの名誉称号'), descriptions: l('명예 칭호 「길드의 명인」을 기록합니다. 지명·고난도 의뢰는 기존 게시판의 개별 조건을 따릅니다.', 'Record the honorary title “Guild Master”. Named and difficult contracts follow their existing board requirements.', '名誉称号「ギルドの名匠」を記録。指名・高難度依頼には既存の掲示板の個別条件が適用される。') },
  { id: 'temple-lodging', source: 'priest', grade: 2, claim: 'temple-lodging', daily: true, price: 0, names: l('순례자 무료 숙박', 'Free pilgrim lodging', '巡礼者の無料宿泊'), descriptions: l('열린 신전의 순례자 침상에서 8시간 쉽니다. HP 55%·MP 40% 회복, 피로 -45. 인물당 세계 하루에 한 번이며 침상은 두 자리입니다.', 'Rest 8 hours in an open temple’s pilgrim beds: +55% HP, +40% MP, fatigue −45. Once per character per world day; two beds per temple.', '開いている神殿の巡礼者用寝床で8時間休む。HP55%・MP40%回復、疲労−45。一人につき世界の一日一回、各神殿二床。') },
  { id: 'temple-treatment', source: 'priest', grade: 3, names: l('신전 치료비 10% 할인', 'Temple treatment: 10% off', '神殿の治療費10%割引'), descriptions: l('신전 치료비가 자동으로 10% 할인됩니다. 금화 단위로 올림합니다.', 'Temple treatment automatically costs 10% less, rounded up to whole gold.', '神殿の治療費が自動で10%引き。金貨単位で切り上げる。') },
  { id: 'temple-books', source: 'priest', grade: 4, names: l('고급 교리서 열람', 'Advanced doctrine reading', '上級教理書の閲覧'), descriptions: l('신전에서 고위 사제용 교리서를 읽을 수 있습니다. 각 책의 독서 조건은 그대로 적용됩니다.', 'Read the temple’s advanced clergy doctrine books, subject to each book’s reading requirements.', '神殿で高位司祭用の教理書を読める。各書の読書条件も適用される。') },
  { id: 'temple-materials', source: 'priest', grade: 4, claim: 'temple-materials', daily: true, price: FANTASY_TEMPLE_MATERIAL_PRICE, items: FANTASY_TEMPLE_MATERIAL_ITEMS, names: l('신전 약초 소량 구매', 'Temple healing herbs', '神殿の薬草の少量購入'), descriptions: l('은빛풀 1개와 달박하 1개를 정가 22G에 구입합니다. 인물당 세계 하루에 한 묶음입니다.', 'Buy one silverweed and one moonmint at their regular total price of 22G. One bundle per character per world day.', '銀葉草1個と月薄荷1個を通常価格の計22Gで購入。一人につき世界の一日一組。') },
  { id: 'temple-title', source: 'priest', grade: 5, claim: 'temple-title', price: 0, names: l('대사제 명예 칭호', 'Archpriest honorary title', '大司祭の名誉称号'), descriptions: l('명예 칭호 「성소의 등불」을 기록합니다. 상위 봉사 의뢰는 기존 게시판의 개별 조건을 따릅니다.', 'Record the honorary title “Light of the Sanctuary”. Higher service contracts retain their existing board requirements.', '名誉称号「聖所の灯」を記録。上位の奉仕依頼には既存の掲示板の個別条件が適用される。') },
];

export const fantasyRankBenefitDay = (hour: number) => Math.floor(hour / 24);
export function fantasyRankBenefitGrade(c: FantasyCharacter, source: FantasyRankBenefitSource): number {
  return source === 'adventurer' ? fantasyRegisteredGuildGrade(c) : c.job === 'priest' ? fantasyPriestGrowthStatus(c).clergyGrade : 0;
}
export function fantasyRankBenefits(c: FantasyCharacter, source: FantasyRankBenefitSource): FantasyRankBenefitStatus[] {
  const grade = fantasyRankBenefitGrade(c, source), day = fantasyRankBenefitDay(c.hour);
  return benefits.filter(benefit => benefit.source === source).map(benefit => ({ ...benefit, unlocked: grade >= benefit.grade,
    claimed: benefit.id === 'guild-rental' ? !!c.rankBenefits?.loans?.['guild-rental'] : !!benefit.claim && (benefit.daily ? c.rankBenefits?.claims[benefit.claim] === day : c.rankBenefits?.claims[benefit.claim] !== undefined),
    loaned: benefit.id === 'guild-rental' && !!c.rankBenefits?.loans?.['guild-rental'] }));
}
export function fantasyRankBenefitActionValid(value: unknown): value is FantasyRankBenefitAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const action = value as Record<string, unknown>;
  return Object.keys(action).length === 2 && (action.type === 'rankBenefitClaim' && action.benefit !== 'guild-supplies' && FANTASY_RANK_BENEFIT_IDS.includes(action.benefit as FantasyRankBenefitId) || action.type === 'rankBenefitReturn' && action.benefit === 'guild-rental');
}
export function fantasyRankBenefitHours(action: { type: string; benefit?: string }): number { return action.type === 'rankBenefitClaim' && action.benefit === 'temple-lodging' ? 8 : 0; }
export function fantasyRankBenefitPrice(c: FantasyCharacter, base: number, service: 'room' | 'temple'): number {
  const discount = service === 'room' ? fantasyRankBenefitGrade(c, 'adventurer') >= 5 ? .05 : 0 : fantasyRankBenefitGrade(c, 'priest') >= 3 ? .1 : 0;
  return Math.max(1, Math.ceil(base * (1 - discount)));
}
export function fantasyRankBenefitEscortBonus(c: FantasyCharacter, base: number, serviceHour = c.hour): { bonus: number; day: number } {
  const day = fantasyRankBenefitDay(serviceHour);
  return { day, bonus: base > 0 && fantasyRankBenefitGrade(c, 'adventurer') >= 6 && c.rankBenefits?.escortBonusDay !== day ? Math.max(1, Math.floor(base * .05)) : 0 };
}
export function recordFantasyRankBenefitEscortBonus(c: FantasyCharacter, day: number): void { (c.rankBenefits ??= { claims: {} }).escortBonusDay = day; }

const errors = {
  invalid: l('혜택 요청을 확인할 수 없습니다.', 'The benefit request is invalid.', '特典の要求を確認できません。'),
  unavailable: l('회복하고 현재 활동을 마친 뒤 이용하세요.', 'Recover and finish your current activity first.', '回復し、現在の活動を終えてから利用してください。'),
  guild: l('현재 지역의 열린 길드에서 이용하세요.', 'Visit an open local guild.', '現地の開いているギルドで利用してください。'),
  temple: l('현재 지역의 열린 신전에서 이용하세요.', 'Visit an open local temple.', '現地の開いている神殿で利用してください。'),
  rank: l('이 혜택에 필요한 등급이 부족합니다.', 'Your rank does not yet unlock this benefit.', 'この特典に必要な等級に達していません。'),
  daily: l('오늘의 혜택을 이미 이용했습니다. 세계의 다음 날에 다시 이용하세요.', 'Already used today. Return on the next world day.', '今日の特典は利用済みです。世界の翌日に再度利用できます。'),
  claimed: l('이 인물은 이미 이 혜택을 받았습니다.', 'This character has already received this benefit.', 'この人物はすでにこの特典を受領しています。'),
  loaned: l('이미 빌린 장비가 있습니다. 먼저 반환하세요.', 'Return your current equipment loan first.', 'すでに借りている道具を先に返してください。'),
  noLoan: l('반환할 대여 기록이 없습니다.', 'There is no equipment loan to return.', '返却する貸出記録がありません。'),
  missing: l('길드 대여용 랜턴과 침낭을 각각 한 개씩 가방에 준비하세요.', 'Carry the guild loan lantern and bedroll to return.', 'ギルド貸出用のランタンと寝袋を一つずつ鞄に用意してください。'),
  gold: l('금화가 부족합니다.', 'You do not have enough gold.', '金貨が足りません。'),
  bag: l('가방의 무게와 칸을 비운 뒤 다시 이용하세요. 비용과 오늘의 횟수는 사용하지 않았습니다.', 'Make room in your bag and try again. No gold or daily allowance was used.', '鞄の重さと枠に余裕を作ってください。代金と今日の回数は使われていません。'),
} satisfies Record<string, Text>;
export function fantasyRankBenefitActionError(c: FantasyCharacter, action: unknown, locale: NpcLocale = 'ja'): string | undefined {
  const fail = (key: keyof typeof errors) => errors[key][locale];
  if (!fantasyRankBenefitActionValid(action)) return fail('invalid');
  if (c.hp <= 0 || c.downed || c.carrying) return fail('unavailable');
  const benefit = benefits.find(benefit => benefit.claim === action.benefit);
  if(!benefit)return fail('invalid');
  const building = benefit.source === 'adventurer' ? 'guild' : 'temple';
  const onRoad = c.travelPosition && c.travelPosition.from !== c.travelPosition.to && c.travelPosition.fraction > 0 && c.travelPosition.fraction < 1;
  if (onRoad || c.dungeon?.active || !fantasyBuildings(c).some(place => place.id === building) || !fantasyFacilityOpen(building, c.hour)) return fail(building);
  if (action.type === 'rankBenefitReturn') {
    if (!c.rankBenefits?.loans?.['guild-rental']) return fail('noLoan');
    return Object.entries(FANTASY_GUILD_RENTAL_ITEMS).some(([id, count]) => (c.inventory[id] ?? 0) < count) ? fail('missing') : undefined;
  }
  if (fantasyRankBenefitGrade(c, benefit.source) < benefit.grade) return fail('rank');
  if (action.benefit === 'guild-rental' && c.rankBenefits?.loans?.['guild-rental']) return fail('loaned');
  const claimed = c.rankBenefits?.claims[action.benefit];
  if (action.benefit !== 'guild-rental' && claimed !== undefined && (!benefit.daily || claimed === fantasyRankBenefitDay(c.hour))) return fail(benefit.daily ? 'daily' : 'claimed');
  if (c.gold < (benefit.price ?? 0)) return fail('gold');
  if (benefit.items) {
    const inventory = { ...c.inventory };
    for (const [id, count] of Object.entries(benefit.items)) inventory[id] = (inventory[id] ?? 0) + count;
    if (fantasyBagState({ ...c, inventory }).overloaded) return fail('bag');
  }
}
export interface FantasyRankBenefitContext { maxHp?: number; maxMp?: number; serviceHour?: number }
// 時刻の進行とログ追加は呼出側が行い、失敗時には人物を変更しない。
export function applyFantasyRankBenefitAction(c: FantasyCharacter, action: FantasyRankBenefitAction, context: FantasyRankBenefitContext = {}): { error?: string; message?: string; hours?: number; fatigueRecovery?: number } {
  const serviceHour = context.serviceHour ?? c.hour;
  const error = fantasyRankBenefitActionError({ ...c, hour: serviceHour }, action);
  if (error) return { error };
  if (action.type === 'rankBenefitClaim' && action.benefit === 'temple-lodging' && (!Number.isFinite(context.maxHp) || !Number.isFinite(context.maxMp))) return { error: errors.invalid.ja };
  const state = c.rankBenefits ??= { claims: {} };
  if (action.type === 'rankBenefitReturn') {
    for (const [id, count] of Object.entries(FANTASY_GUILD_RENTAL_ITEMS)) { c.inventory[id] -= count; if (!c.inventory[id]) delete c.inventory[id]; }
    c.gold += state.loans!['guild-rental']!.deposit;
    delete state.loans!['guild-rental'];
    return { message: 'rank-benefit:return:guild-rental' };
  }
  const benefit = benefits.find(benefit => benefit.claim === action.benefit)!;
  c.gold -= benefit.price ?? 0;
  if (benefit.items) for (const [id, count] of Object.entries(benefit.items)) c.inventory[id] = (c.inventory[id] ?? 0) + count;
  if (action.benefit === 'guild-rental') (state.loans ??= {})['guild-rental'] = { deposit: FANTASY_GUILD_RENTAL_DEPOSIT, claimedAt: serviceHour };
  state.claims[action.benefit] = fantasyRankBenefitDay(serviceHour);
  if (action.benefit === 'guild-title' || action.benefit === 'temple-title') {
    const title: 'guild-master'|'temple-archpriest' = action.benefit === 'guild-title' ? 'guild-master' : 'temple-archpriest';
    state.titles = [...new Set([...(state.titles ?? []), title])];
  }
  if (action.benefit === 'temple-lodging') {
    const room = FANTASY_LODGINGS[0];
    c.hp = Math.min(context.maxHp!, c.hp + Math.ceil(context.maxHp! * room.hpRecovery));
    c.mp = Math.min(context.maxMp!, c.mp + Math.ceil(context.maxMp! * room.mpRecovery));
    c.buff = null;
    return { message: `rank-benefit:claim:${action.benefit}`, hours: room.hours, fatigueRecovery: room.fatigueRecovery };
  }
  reconcileFoodLots(c);
  return { message: `rank-benefit:claim:${action.benefit}`, hours: 0 };
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function validFantasyRankBenefits(value: unknown, hour = Number.MAX_SAFE_INTEGER): value is FantasyRankBenefitsState | undefined {
  if (value === undefined) return true;
  if (!record(value) || Object.keys(value).some(key => !['claims', 'loans', 'titles', 'escortBonusDay'].includes(key)) || !record(value.claims)) return false;
  const validDay = (day: unknown) => Number.isSafeInteger(day) && Number(day) >= 0 && Number(day) <= fantasyRankBenefitDay(hour);
  if (Object.entries(value.claims).some(([id, day]) => !FANTASY_RANK_BENEFIT_IDS.includes(id as FantasyRankBenefitId) || !validDay(day))) return false;
  if (value.escortBonusDay !== undefined && !validDay(value.escortBonusDay)) return false;
  if (value.titles !== undefined && (!Array.isArray(value.titles) || value.titles.length > 2 || new Set(value.titles).size !== value.titles.length || value.titles.some(id => id !== 'guild-master' && id !== 'temple-archpriest'))) return false;
  if (value.loans !== undefined) {
    if (!record(value.loans) || Object.keys(value.loans).some(id => id !== 'guild-rental')) return false;
    const loan = value.loans['guild-rental'];
    if (loan !== undefined && (!record(loan) || Object.keys(loan).length !== 2 || loan.deposit !== FANTASY_GUILD_RENTAL_DEPOSIT || !Number.isFinite(loan.claimedAt) || Number(loan.claimedAt) < 0 || Number(loan.claimedAt) > hour)) return false;
  }
  const titles = value.titles as FantasyRankBenefitsState['titles'];
  return (!titles?.includes('guild-master') || value.claims['guild-title'] !== undefined) && (!titles?.includes('temple-archpriest') || value.claims['temple-title'] !== undefined);
}
export function fantasyRankBenefitTitle(id: string, locale: NpcLocale): string | undefined {
  return id === 'guild-master' ? l('길드의 명인', 'Guild Master', 'ギルドの名匠')[locale] : id === 'temple-archpriest' ? l('성소의 등불', 'Light of the Sanctuary', '聖所の灯')[locale] : undefined;
}
export function fantasyRankBenefitText(source: string, locale: NpcLocale): string | undefined {
  if(source==='rank-benefit:temple-full')return l('신전의 순례자 침상이 모두 사용 중입니다.','The temple’s pilgrim beds are occupied.','神殿の巡礼者用寝床は満床です。')[locale];
  const error = Object.values(errors).find(text => text.ja === source);
  if (error) return error[locale];
  if (source === 'rank-benefit:return:guild-rental') return l('대여한 랜턴과 침낭을 반환하고 보증금 30G를 돌려받았습니다.', 'Returned the lantern and bedroll and received the 30G deposit back.', '借りたランタンと寝袋を返し、保証金30Gを受け取った。')[locale];
  if (!source.startsWith('rank-benefit:claim:')) return;
  const benefit = benefits.find(benefit => benefit.claim === source.slice('rank-benefit:claim:'.length));
  if (!benefit) return;
  return l(`${benefit.names.ko} 혜택을 이용했습니다.`, `Used the benefit: ${benefit.names.en}.`, `特典「${benefit.names.ja}」を利用した。`)[locale];
}
