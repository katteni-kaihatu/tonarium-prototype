import type { FantasyCharacter, FantasyItem } from './fantasy.ts';
import { fantasyEquipmentEntries } from './fantasy-equipment-slots.ts';

export interface FantasyArtifactEffects {
  coldRelief: number; heatRelief: number; rainRelief: number; darknessRelief: number;
  foodAgingReduction: number; campHpBonus: number; campMpBonus: number;
  campFatigueBonus: number; campRiskReduction: number; gatherYieldBonus: number;
}
export type FantasyArtifactCarrier = Pick<FantasyCharacter, 'inventory'> & Partial<Pick<FantasyCharacter, 'equipment' | 'equippedGear' | 'gear'>>;
type Labels = [ko: string, en: string, ja: string];
const labels = ([ko, en, ja]: Labels) => ({ ko, en, ja });
function artifact(id: string, names: Labels, descriptions: Labels, equipment: Omit<NonNullable<FantasyItem['equipment']>, 'slot'> = {}, effects: Partial<FantasyArtifactEffects> = {}) {
  return { item: { id: `frontier-${id}`, name: names[2], names: labels(names), description: descriptions[2], descriptions: labels(descriptions), price: 200, category: 'artifact', tier: 4, equipment: { slot: 'artifact', ...equipment } } satisfies FantasyItem, effects };
}

const definitions = [
  artifact('ember-acorn', ['겨울잠 불씨 도토리', 'Hibernating Ember Acorn', '冬眠する熾火のどんぐり'], [
    '장착 중 도토리의 온기로 추위 노출을 1단계 줄인다. 도토리나무는 자라지 않는다.',
    'Equipped: its sleepy warmth reduces cold exposure by 1. It will not grow into a tree.',
    '装備中は眠そうな温もりで寒さを1段階軽減。植えても木にはならない。',
  ], {}, { coldRelief: 1 }),
  artifact('pocket-refrigerator', ['주머니 냉장고', 'Pocket Refrigerator', 'ポケット冷蔵庫'], [
    '장착 중 신선한 식량의 노화가 25% 느려진다. 이미 상한 음식은 되살리지 않으며 보존 가방과 중첩되지 않는다.',
    'Equipped: fresh food ages 25% slower. Cannot restore spoiled food; does not stack with preservation bags.',
    '装備中は新鮮な食料の劣化が25%遅くなる。傷んだ食品は戻らず、保冷鞄とは重ならない。',
  ], {}, { foodAgingReduction: .25 }),
  artifact('weather-remote', ['날씨 리모컨: 건전지 없음', 'Weather Remote: Batteries Missing', '天気リモコン・電池なし'], [
    '장착 중 작은 비막이로 비 노출을 1단계 줄인다. 대륙의 날씨 자체는 바뀌지 않는다.',
    'Equipped: a tiny rain shield reduces rain exposure by 1. The continent ignores its weather buttons.',
    '装備中は小さな雨よけが雨の負担を1段階軽減。天気のボタンは大陸に無視される。',
  ], {}, { rainRelief: 1 }),
  artifact('sunshade-satellite', ['양산 위성', 'Sunshade Satellite', '日傘衛星'], [
    '장착 중 머리 위를 도는 양산이 더위 노출을 1단계 줄인다. 궤도는 아주 낮다.',
    'Equipped: an orbiting parasol reduces heat exposure by 1. Its orbit is very low.',
    '装備中は頭上を周回する日傘が暑さを1段階軽減。軌道はとても低い。',
  ], {}, { heatRelief: 1 }),
  artifact('night-shift-badge', ['야근 면제 배지', 'Night Shift Exemption Badge', '夜勤免除バッジ'], [
    '장착 중 어둠 불이익을 1 줄이되 최소 1은 남는다. 빛이나 야간 시야를 제공하지 않는다.',
    'Equipped: darkness penalty -1, minimum 1. Provides neither a light source nor night vision.',
    '装備中は暗さの不利を1軽減し、最低1は残る。灯りや暗視能力にはならない。',
  ], {}, { darknessRelief: 1 }),
  artifact('dream-pillow', ['왕실 낮잠 베개', 'Royal Nap Pillow', '王室の昼寝枕'], [
    '장착 중 야영 완료 시 최대 HP의 5%를 추가 회복한다. 왕위 계승권은 없다.',
    'Equipped: completed camping restores an extra 5% maximum HP. No claim to the throne included.',
    '装備中は野営完了時のHP回復が最大HPの5%分増える。王位継承権は付属しない。',
  ], {}, { campHpBonus: .05 }),
  artifact('coffee-pot', ['영원히 미지근한 커피포트', 'Eternally Lukewarm Coffee Pot', '永遠にぬるいコーヒーポット'], [
    '장착 중 야영 완료 시 최대 MP의 5%를 추가 회복한다. 수면을 생략할 수는 없다.',
    'Equipped: completed camping restores an extra 5% maximum MP. Still requires sleep.',
    '装備中は野営完了時のMP回復が最大MPの5%分増える。睡眠は省略できない。',
  ], {}, { campMpBonus: .05 }),
  artifact('do-not-disturb', ['방해 금지 문패', 'Do Not Disturb Plaque', '起こさないで札'], [
    '장착 중 야영 습격 확률을 8% 줄인다. 문패를 읽지 않는 마물도 있다.',
    'Equipped: camp ambush chance is reduced by 8%. Some monsters cannot read the sign.',
    '装備中は野営の襲撃確率を8%軽減。札を読めない魔物もいる。',
  ], {}, { campRiskReduction: .08 }),
  artifact('helpful-trowel', ['퇴근을 원하는 모종삽', 'Clocking-Off Trowel', '定時で帰りたい移植ごて'], [
    '장착 중 성공한 자원 채집의 수확이 1개 늘어난다. 실패한 채집에는 효과가 없다.',
    'Equipped: successful resource gathering yields 1 extra item. Failed gathering gets no overtime.',
    '装備中は成功した資源採集の収穫が1個増える。失敗した採集には残業しない。',
  ], {}, { gatherYieldBonus: 1 }),
  artifact('grandma-star', ['할머니가 뜬 별', 'Grandma-Knitted Star', 'おばあちゃんが編んだ星'], [
    '장착 중 추위를 1단계 줄이고 야영 HP 회복이 최대 HP의 2.5%만큼 늘어난다.',
    'Equipped: cold exposure -1 and completed camping restores an extra 2.5% maximum HP.',
    '装備中は寒さを1段階軽減し、野営完了時に最大HPの2.5%分を追加回復。',
  ], {}, { coldRelief: 1, campHpBonus: .025 }),
  artifact('cloud-dehumidifier', ['구름 제습기', 'Cloud Dehumidifier', '雲の除湿機'], [
    '장착 중 비 노출을 1단계 줄이고 야영 MP 회복이 최대 MP의 2.5%만큼 늘어난다.',
    'Equipped: rain exposure -1 and completed camping restores an extra 2.5% maximum MP.',
    '装備中は雨の負担を1段階軽減し、野営完了時に最大MPの2.5%分を追加回復。',
  ], {}, { rainRelief: 1, campMpBonus: .025 }),
  artifact('moon-projector', ['가정용 달 영사기', 'Domestic Moon Projector', '家庭用の月映写機'], [
    '장착 중 어둠 불이익 -1(최소 1), 야영 습격 확률 4% 감소. 실제 등불은 아니다.',
    'Equipped: darkness penalty -1 (minimum 1), camp ambush chance reduced by 4%. Not a light source.',
    '装備中は暗さの不利を1軽減（最低1）、野営襲撃確率を4%軽減。灯りにはならない。',
  ], {}, { darknessRelief: 1, campRiskReduction: .04 }),
  artifact('lunch-bell', ['점심시간 종', 'Lunch Break Bell', 'お昼休みの鐘'], [
    '장착 중 신선한 식량 노화가 20% 느려지고 야영 시 최대 HP의 2.5%를 추가 회복한다. 보존 가방과 중첩되지 않는다.',
    'Equipped: fresh food ages 20% slower and camping restores an extra 2.5% maximum HP. No preservation-bag stacking.',
    '装備中は新鮮な食料の劣化が20%遅くなり、野営で最大HPの2.5%分を追加回復。保冷鞄とは重ならない。',
  ], {}, { foodAgingReduction: .2, campHpBonus: .025 }),
  artifact('solar-thermos', ['태양 냉차 보온병', 'Solar Iced-Tea Flask', '太陽の冷茶ボトル'], [
    '장착 중 더위를 1단계 줄이고 야영 MP 회복이 최대 MP의 2.5%만큼 늘어난다.',
    'Equipped: heat exposure -1 and completed camping restores an extra 2.5% maximum MP.',
    '装備中は暑さを1段階軽減し、野営完了時に最大MPの2.5%分を追加回復。',
  ], {}, { heatRelief: 1, campMpBonus: .025 }),
  artifact('room-service-button', ['황야 룸서비스 버튼', 'Wilderness Room Service Button', '荒野のルームサービスボタン'], [
    '장착 중 야영 피로 회복량 +3, HP 추가 회복 +최대 HP의 2.5%. 식사는 배달되지 않는다.',
    'Equipped: camp fatigue recovery +3 and an extra 2.5% maximum HP recovered. No meals delivered.',
    '装備中は野営の疲労回復+3、最大HPの2.5%分を追加回復。食事は届かない。',
  ], {}, { campFatigueBonus: 3, campHpBonus: .025 }),
  artifact('hiking-snail', ['접이식 등산 달팽이', 'Folding Hiking Snail', '折りたたみ登山かたつむり'], [
    '장착 중 야영 기본 피로 회복량이 5 늘어난다. 이동 속도에는 영향을 주지 않는다.',
    'Equipped: base camp fatigue recovery +5. It has no effect on travel speed.',
    '装備中は野営の基本疲労回復が5増える。移動速度には影響しない。',
  ], {}, { campFatigueBonus: 5 }),
  artifact('whisper-antenna', ['수다쟁이 속삭임 안테나', 'Chatty Whisper Antenna', 'おしゃべり囁きアンテナ'], [
    '장착 중 일반 행동 판정 +1, 어둠 불이익 -1(최소 1). 등불을 대체하지 않는다.',
    'Equipped: general action checks +1 and darkness penalty -1 (minimum 1). Does not replace a lantern.',
    '装備中は一般行動の判定+1、暗さの不利を1軽減（最低1）。ランタンの代わりにはならない。',
  ], { check: 1 }, { darknessRelief: 1 }),
  artifact('bureaucratic-paperweight', ['거인의 결재 문진', 'Giant Bureaucratic Paperweight', '巨人の決裁文鎮'], [
    '장착 중 힘 +2. 결재 서류보다 약간 가볍다.', 'Equipped: strength +2. Slightly lighter than the paperwork.', '装備中は力+2。決裁書類よりは少し軽い。',
  ], { stats: { strength: 2 } }),
  artifact('rubber-duck', ['무패의 목욕 오리', 'Undefeated Bath Duck', '無敗の風呂あひる'], [
    '장착 중 체력 +1, 전투 피해 경감 +2. 굶주림과 독은 막지 못한다.',
    'Equipped: vitality +1, combat damage reduction +2. Does not protect against hunger or poison.',
    '装備中は体力+1、戦闘被害軽減+2。空腹と毒は防げない。',
  ], { stats: { vitality: 1 }, guard: 2 }),
  artifact('calculating-skull', ['암산하는 해골', 'Mental-Arithmetic Skull', '暗算するどくろ'], [
    '장착 중 지능 +2. 답을 말하기 전에 꼭 헛기침한다.', 'Equipped: intelligence +2. Always clears its throat before answering.', '装備中は知力+2。答える前に必ず咳払いする。',
  ], { stats: { intelligence: 2 } }),
  artifact('rehearsal-stopwatch', ['리허설 초시계', 'Rehearsal Stopwatch', '予行演習ストップウォッチ'], [
    '장착 중 민첩 +2, 손재주 +1. 시간을 되감지는 않는다.', 'Equipped: agility +2, dexterity +1. Does not rewind time.', '装備中は敏捷+2、手先+1。時間は巻き戻せない。',
  ], { stats: { agility: 2, dexterity: 1 } }),
  artifact('emergency-exit-sign', ['휴대용 비상구 표지', 'Portable Emergency Exit Sign', '携帯非常口標識'], [
    '장착 중 민첩 +1, 일반 행동 판정 +1. 새로운 출구나 귀환 경로는 만들지 않는다.',
    'Equipped: agility +1, general action checks +1. Does not create exits or return routes.',
    '装備中は敏捷+1、一般行動の判定+1。出口や帰路を新しく作ることはない。',
  ], { stats: { agility: 1 }, check: 1 }),
  artifact('invoice-charm', ['반려되지 않는 영수증', 'Never-Rejected Receipt', '差し戻されない領収書'], [
    '장착 중 카리스마 +2, 행운 +1. 물건값을 대신 내주지는 않는다.', 'Equipped: charisma +2, luck +1. Does not pay your bills.', '装備中はカリスマ+2、運+1。代金の立て替えはしてくれない。',
  ], { stats: { charisma: 2, luck: 1 } }),
  artifact('paper-dragon', ['보험 든 종이 용', 'Insured Paper Dragon', '保険付きの紙竜'], [
    '장착 중 최대 HP +12, 전투 피해 경감 +1. 종이라도 보험 약관은 두껍다.',
    'Equipped: maximum HP +12, combat damage reduction +1. Paper dragon, substantial fine print.',
    '装備中は最大HP+12、戦闘被害軽減+1。紙製だが保険約款は分厚い。',
  ], { stats: { hp: 12 }, guard: 1 }),
  artifact('mana-usb', ['방향이 세 개인 마나 USB', 'Three-Way Mana USB', '三回裏返す魔力USB'], [
    '장착 중 최대 MP +15. 어느 방향이든 세 번째에는 맞는다.', 'Equipped: maximum MP +15. Fits on the third try, whichever way up.', '装備中は最大MP+15。どちら向きでも三回目には挿さる。',
  ], { stats: { mp: 15 } }),
  artifact('lucky-dice', ['은퇴한 사기 주사위', 'Retired Loaded Dice', '引退したいかさま賽'], [
    '장착 중 행운 +2. 주사위 눈이나 유물 발견 확률을 고정하지 않는다.',
    'Equipped: luck +2. Does not fix dice faces or artifact discovery chances.',
    '装備中は運+2。賽の目やアーティファクトの発見確率は固定しない。',
  ], { stats: { luck: 2 } }),
  artifact('mechanical-pen', ['고대의 자동 필기구', 'Ancient Mechanical Pencil', '古代のシャープペン'], [
    '장착 중 손재주 +2, 일반 행동 판정 +1. 심이 부러져도 효과는 남는다.',
    'Equipped: dexterity +2, general action checks +1. Works even with a broken lead.',
    '装備中は手先+2、一般行動の判定+1。芯が折れても効果は残る。',
  ], { stats: { dexterity: 2 }, check: 1 }),
  artifact('honest-vending-machine', ['거스름돈 지키는 자판기', 'Honest Change Vending Machine', 'お釣りを守る自販機'], [
    '장착 중 체력 +2, 최대 HP +8. 음료와 동전은 나오지 않는다.',
    'Equipped: vitality +2, maximum HP +8. Dispenses neither drinks nor coins.',
    '装備中は体力+2、最大HP+8。飲料も硬貨も出てこない。',
  ], { stats: { vitality: 2, hp: 8 } }),
];

export const FANTASY_FRONTIER_ARTIFACTS: FantasyItem[] = definitions.map(definition => definition.item);
export function fantasyEquippedArtifact(character: FantasyArtifactCarrier): FantasyItem | undefined {
  const id = character.equipment?.artifact;
  if (!id || !Object.hasOwn(character.inventory, id) || !Number.isSafeInteger(character.inventory[id]) || character.inventory[id] < 1) return;
  return fantasyEquipmentEntries(character, FANTASY_FRONTIER_ARTIFACTS).find(entry => entry.slot === 'artifact')?.item;
}
export function fantasyArtifactEffects(character: FantasyArtifactCarrier): FantasyArtifactEffects {
  const equipped = fantasyEquippedArtifact(character);
  return { coldRelief: 0, heatRelief: 0, rainRelief: 0, darknessRelief: 0, foodAgingReduction: 0, campHpBonus: 0, campMpBonus: 0, campFatigueBonus: 0, campRiskReduction: 0, gatherYieldBonus: 0,
    ...definitions.find(definition => definition.item.id === equipped?.id)?.effects };
}
