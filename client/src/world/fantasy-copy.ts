import { fantasyExpeditionText } from '../../../shared/fantasy-expedition.ts';
import { fantasyInstitutionText } from '../../../shared/fantasy-institutions.ts';
import { fantasyCommissionText } from '../../../shared/fantasy-commissions.ts';
import { fantasyOutdoorCookingErrorText, fantasyOutdoorCookingLogText } from '../../../shared/fantasy-outdoor-cooking.ts';
import { fantasyCookingText } from '../../../shared/fantasy-cooking.ts';
import { fantasyRankBenefitText } from '../../../shared/fantasy-rank-benefits.ts';
import { fantasyInnErrorText } from '../../../shared/fantasy-inn.ts';
import { fantasyRankBookText } from '../../../shared/fantasy-rank-rewards.ts';
import { fantasyMiracleText } from '../../../shared/fantasy-miracles.ts';
import { fantasyMonsterSiteText } from '../../../shared/fantasy-monster-sites.ts';
import { fantasyGuildAssessmentErrorText } from '../../../shared/fantasy-adventurer.ts';
import { fantasyDownedText } from '../../../shared/fantasy-downed.ts';
import { fantasyCarryReturnText } from '../../../shared/fantasy-carry-return.ts';
import {fantasyBagText} from '../../../shared/fantasy-bags.ts';
import {fantasyAlchemySynthesisText} from '../../../shared/fantasy-alchemy-synthesis.ts';
import {fantasyProductionText} from '../../../shared/fantasy-production-expansion.ts';
import {fantasyBlackMarketText} from '../../../shared/fantasy-black-market.ts';
import {fantasyWorldUtilityText} from '../../../shared/fantasy-world-utilities.ts';
import {fantasyOccultText} from '../../../shared/fantasy-occult.ts';
import { fantasyDungeonErrorText, fantasyDungeonLogText } from '../../../shared/fantasy-dungeon.ts';
import { fantasyMagicDiscoveryTranslation } from '../../../shared/fantasy-magic-discovery.ts';
import { fantasyEconomyLogText } from '../../../shared/fantasy-economy.ts';
import { fantasyCivicLogText } from '../../../shared/fantasy-civics.ts';
import { fantasyWorkLogText } from '../../../shared/fantasy-work.ts';
import type { NpcLocale } from '../../../shared/npc.ts';
import type { FantasyCharacter, FantasyStats } from '../../../shared/fantasy.ts';
import { FANTASY_EVENTS, FANTASY_ITEMS, FANTASY_JOBS, FANTASY_QUESTS, FANTASY_RACES, FANTASY_RECIPES } from '../../../shared/fantasy-data.ts';
import { FANTASY_TERMS } from '../../../shared/fantasy-lore.ts';
import { FANTASY_DINING, FANTASY_LODGINGS } from '../../../shared/fantasy-life.ts';
import { FANTASY_MAPS, fantasyKnownLocations } from '../../../shared/fantasy-town.ts';
import { fantasyEventText, fantasyQuestText } from '../../../shared/fantasy-narrative.ts';
import { fantasySkillName } from '../../../shared/fantasy-skill-names.ts';
import { FANTASY_CONTEXT_NAMES } from '../../../shared/fantasy-physiology.ts';
import { FANTASY_MANA_EXERCISES } from '../../../shared/fantasy-mana.ts';
import { FANTASY_MENTOR_SKILLS } from '../../../shared/fantasy-apprenticeship.ts';
import { fantasySpecializationText, FANTASY_ALCHEMY_FORMULAS } from '../../../shared/fantasy-specializations.ts';
import { fantasyTerrainText, FANTASY_TERRAIN_ACTIVITIES } from '../../../shared/fantasy-terrain.ts';
import { FANTASY_MONSTERS } from '../../../shared/fantasy-monsters.ts';
import { FANTASY_LIBRARY_BOOKS } from '../../../shared/fantasy-library.ts';
import { FANTASY_GATHERING_NAMES } from '../../../shared/fantasy-gathering.ts';
import { fantasyContractErrorText, type FantasyContractError } from '../../../shared/fantasy-contracts.ts';
import { parseFantasyRoll } from '../../../shared/fantasy-roll.ts';
import { FANTASY_MAIN_TRIALS } from '../../../shared/fantasy-main-trials.ts';
import { fantasyCampLogText } from '../../../shared/fantasy-camping.ts';
import { fantasyEncounterLogText } from '../../../shared/fantasy-encounters.ts';
import { fantasyVoyageSceneLogText } from '../../../shared/fantasy-voyage-scenes.ts';
import { fantasyVoyageDecisionLogText } from '../../../shared/fantasy-voyage-decisions.ts';
import { fantasyPropertyText } from '../../../shared/fantasy-property.ts';
import { fantasyPriestText } from '../../../shared/fantasy-priest-growth.ts';
import { fantasyJobPathText } from '../../../shared/fantasy-job-paths.ts';
import { fantasyUnderworldText } from '../../../shared/fantasy-underworld.ts';

export const statLabels: Record<NpcLocale, Record<keyof FantasyStats,string>> = {
  ko:{hp:'HP',mp:'MP',strength:'힘',agility:'민첩',intelligence:'지능',luck:'운',vitality:'체력',dexterity:'재주',charisma:'카리스마'},
  en:{hp:'HP',mp:'MP',strength:'Strength',agility:'Agility',intelligence:'Intelligence',luck:'Luck',vitality:'Vitality',dexterity:'Dexterity',charisma:'Charisma'},
  ja:{hp:'HP',mp:'MP',strength:'筋力',agility:'敏捷',intelligence:'知力',luck:'幸運',vitality:'体力',dexterity:'手先',charisma:'カリスマ'},
};
export const genderLabels = {ko:{male:'남성',female:'여성',none:'성별 없음'},en:{male:'Male',female:'Female',none:'Genderless'},ja:{male:'男性',female:'女性',none:'性別なし'}};
export function gameClock(h:number,locale:NpcLocale) { const totalMinutes=Math.max(0,Math.floor(h*60+1e-7)),day=Math.floor(totalMinutes/1440)+1,time=`${String(Math.floor(totalMinutes%1440/60)).padStart(2,'0')}:${String(totalMinutes%60).padStart(2,'0')}`;return locale==='ko'?`${day}일째 ${time}`:locale==='en'?`Day ${day} · ${time}`:`${day}日目 ${time}`; }

const errorCopy: Record<string, [ko: string, en: string]> = {
  '一般依頼は担当施設か依頼人の掲示から受注してください。': ['일반 의뢰는 담당 시설이나 의뢰인의 게시에서 수락해 주세요.', 'Accept ordinary contracts from the responsible facility or issuer’s postings.'],
  'この依頼を受ける所属資格がありません。': ['이 의뢰를 맡을 현재 직업이나 등록 조건이 맞지 않습니다.', 'Your current profession or registration does not qualify for this contract.'],
  '生活職業を選んでください。': ['생활 직업을 먼저 선택하세요.', 'Choose a life profession first.'],
  '祈りを捧げられる神殿を訪ねてください。':['기도할 수 있는 신전에 방문해 주세요.','Visit a temple to pray.'],
  '今日はすでに祈りました。次の日に再び祈れます。':['오늘은 이미 기도했습니다. 다음 날 다시 기도할 수 있습니다.','You have already prayed today. Return on the next world day.'],
  '今は祈りを捧げられる状態ではありません。':['지금은 기도할 수 있는 상태가 아닙니다.','You are not in a condition to pray now.'],
  '売却する食品の状態を選んでください。':['판매할 음식의 상태를 선택해 주세요.','Choose the food condition to sell.'],
  '傷んだ食品は売却できません。':['상한 음식은 판매할 수 없습니다.','Spoiled food cannot be sold.'],
  '暗い場所で活動するにはランタンか暗所に適した感覚が必要です。':['어두운 곳에서 활동하려면 랜턴 같은 광원이 필요합니다.','A lantern or another light source is needed in the dark.'],
  'マナは実際にMPを使い、効果が働いた経験で成長します。修練ボタンでは学べません。':['마나는 실제 활동에서 MP를 유효하게 쓰면 성장합니다.','Mana grows when spent MP has a real effect during activity.'],
  '値段交渉は取引相手との会話で依頼してください。':['가격 흥정은 거래 상대와 대화해서 요청해 주세요.','Ask the trader to bargain in conversation.'],
  'この人生は終わっています。新しい人生を始めてください。':['이번 삶은 끝났습니다. 새로운 삶을 시작해 주세요.','This life has ended. Begin a new life.'],
  '新しい人生は、今の人生が終わった後に始められます。':['현재의 삶이 끝나면 새 삶을 시작할 수 있습니다.','A new life can begin after this one ends.'],
  '所有する衣服を選んでください。':['소유한 의복을 선택해 주세요.','Choose clothing you own.'],
  'その衣服はすでに着用しています。':['이미 입고 있는 옷입니다.','You are already wearing that outfit.'],
  'この図書館には、その本がありません。':['이 도서관에는 그 책이 없습니다.','This library does not hold that book.'],
  'その本はすでに読み終えています。':['이미 정독한 책입니다.','You have already studied this book.'],
  'この場所には解体できる新しい獲物がありません。':['이곳에는 해체할 신선한 사냥감이 없습니다.','There is no fresh quarry to skin here.'],
  '漁師として造船所で漁船を手配してください。':['어부 직업으로 조선소에서 어선을 준비해 주세요.','Arrange a fishing boat at a shipyard as a fisher.'],
  '漁船の手配方法が正しくありません。':['올바르지 않은 어선 준비 방식입니다.','Invalid fishing boat arrangement.'],
  'すでに使える漁船があります。':['이미 이용할 수 있는 어선이 있습니다.','You already have an available fishing boat.'],
  '漁船を手配する金貨が足りません。':['어선 준비에 필요한 금화가 부족합니다.','You need more gold for a fishing boat.'],
  '釣りは漁師の専門行動です。':['낚시는 어부의 전문 행동입니다.','Fishing is a fisher’s specialty.'],
  '釣り場の種類が正しくありません。':['올바르지 않은 낚시 장소입니다.','Invalid fishing mode.'],
  '港の桟橋や船着き場から釣りへ出発してください。':['항구의 부두나 선착장에서 낚시를 시작해 주세요.','Start fishing from a harbor pier or landing.'],
  '海釣りには、帰港まで使える購入済みかレンタルの漁船が必要です。':['바다 낚시는 귀항할 때까지 쓸 수 있는 어선이 필요합니다.','Sea fishing needs a boat available until your return.'],
  'この場所で狩れる獲物を選んでください。':['현재 지역에서 사냥할 수 있는 대상을 선택해 주세요.','Choose quarry found in this region.'],
  'この場所ではその資源を採集できません。':['이곳에서는 그 자원을 채집할 수 없습니다.','That resource cannot be gathered here.'],
  '採集する資源を選んでください。':['채집할 자원을 선택해 주세요.','Choose a resource to gather.'],
  '依頼の期限を過ぎています。放棄して新しい掲示を確認してください。':['의뢰 기한이 지났습니다. 포기 후 새 게시판을 확인해 주세요.','This contract expired. Abandon it and check the board again.'],
  '討伐依頼の進行がまだ足りません。':['토벌 목표를 아직 달성하지 못했습니다.','The hunt objective is not complete yet.'],
  '放棄できる受注済み依頼がありません。':['포기할 수 있는 의뢰가 없습니다.','There is no accepted quest to abandon.'],
  '依頼掲示の受付情報を確認できません。':['의뢰 수락 정보를 확인할 수 없습니다.','The contract claim could not be verified.'],
  '各装備に取り付ける宝石が足りません。':['제작할 장비에 붙일 보석이 부족합니다.','You need a gem for each crafted equipment item.'],
  '装備の保管上限に達しています。不要な装備を整理してください。':['장비 보관 한도에 도달했습니다.','Equipment storage is full.'],
  '制作に使える未装着の材料が足りません。':['제작에 쓸 미착용 재료가 부족합니다.','Not enough unequipped materials for crafting.'],
  '売却する前に装備を外すか、売却する未装着の個体を選んでください。':['판매할 장비를 해제하거나 미착용 개체를 선택해 주세요.','Unequip the item or choose an unequipped instance to sell.'],
  'この場所でその技能を教える師はいません。':['현재 장소에는 그 기술을 가르칠 스승이 없습니다.','There is no mentor for that skill here.'],
  'その技能はすでに習得しています。':['이미 배운 기술입니다.','You already learned that skill.'],
  '指導料5Gが足りません。':['지도료 5G가 부족합니다.','You need 5G for the lesson.'],
  '所有する装備品を選んでください。':['소유한 장비를 선택해 주세요.','Choose equipment you own.'],
  'すでに装備しています。':['이미 장착 중입니다.','Already equipped.'],
  'その部位には装備がありません。':['그 부위에는 장비가 없습니다.','Nothing is equipped in that slot.'],
  '売却する前に装備を外してください。':['판매하기 전에 장착을 해제해 주세요.','Unequip it before selling.'],
  '値引きの種類が正しくありません。':['올바르지 않은 흥정 종류입니다.','Invalid bargaining service.'],
  'この場所では交渉できないか、次の交渉まで待つ必要があります。':['현재 장소에서 흥정할 수 없거나 재시도까지 기다려야 합니다.','You cannot bargain here or must wait before trying again.'],
  'この品物で回復・治療・強化できる状態ではありません。':['지금은 이 물건의 회복·치료·강화 효과가 필요하지 않습니다.','This item cannot improve your current condition.'],
  'マナの修練記録を確認できません。':['마나 수련 기록을 확인할 수 없습니다.','Your mana training record could not be verified.'],
  'そのマナ修練は登録されていません。':['등록되지 않은 마나 수련입니다.','That mana exercise is not registered.'],
  'マナの負荷が高すぎます。休息して循環を落ち着かせてください。':['마나 부하가 높습니다. 쉬면서 순환을 안정시켜 주세요.','Mana strain is too high. Rest to steady your circulation.'],
  'マナの段階を順番に修練してください。':['마나 단계를 순서대로 수련해 주세요.','Practice the mana stages in order.'],
  '現在の段階で磨けるマナ制御は上限です。':['현재 단계의 마나 제어 숙련이 상한에 도달했습니다.','Your mana control has reached the limit for this stage.'],
  'マナ修練に必要なMPが足りません。':['마나 수련에 필요한 MP가 부족합니다.','You need more MP for that exercise.'],
  'まだ習得していないマナ技能です。':['아직 배우지 않은 마나 기술입니다.','You have not learned that mana skill.'],
  '操作が正しくありません。': ['올바르지 않은 조작입니다.', 'Invalid action.'],
  '先に候補をキープするか、見送ってください。': ['먼저 후보를 킵하거나 넘겨 주세요.', 'Keep or skip the current candidate first.'],
  '種族の抽選は5回までです。': ['종족 추첨은 5회까지 가능합니다.', 'You can draw a race up to five times.'],
  '種族候補がありません。': ['현재 종족 후보가 없습니다.', 'There is no current race candidate.'],
  '先にキャラクターを作成してください。': ['먼저 캐릭터를 생성해 주세요.', 'Create a character first.'],
  '名前を入力してください。': ['이름을 입력해 주세요.', 'Enter a name.'],
  '名前は制御文字を使わず1〜24文字で入力してください。': ['제어 문자를 제외하고 1~24자로 이름을 입력해 주세요.', 'Enter a name of 1–24 characters without control characters.'],
  '性別を選択してください。': ['성별을 선택해 주세요.', 'Choose a gender.'],
  '職業が見つかりません。': ['직업을 찾을 수 없습니다.', 'Profession not found.'],
  '選んだ種族候補がありません。': ['선택한 종족 후보가 없습니다.', 'The selected race candidate is unavailable.'],
  '冒険記録の種族・職業・現在地を確認できません。': ['모험 기록의 종족·직업·현재 위치를 확인할 수 없습니다.', 'The race, profession or current location in your adventure record could not be verified.'],
  'キャラクターはすでに作成されています。': ['이미 캐릭터를 생성했습니다.', 'Your character has already been created.'],
  '先に発生中の職業イベントを選択してください。': ['먼저 진행 중인 이벤트의 선택지를 골라 주세요.', 'Resolve the current event first.'],
  '先に発生中のイベントを選択してください。': ['먼저 진행 중인 이벤트의 선택지를 골라 주세요.', 'Resolve the current event first.'],
  '到着前の船・飛空艇・転移門からは途中で降りられません。': ['배·비공정·전이문은 도착할 때까지 내릴 수 없습니다.', 'You cannot disembark from a ship, airship or gate before arrival.'],
  '船・飛空艇・転移門の移動中は目的地を変えられません。': ['배·비공정·전이문으로 이동 중에는 목적지를 바꿀 수 없습니다.', 'You cannot change destination while aboard a ship, airship or gate.'],
  'パーティーの移動や戦闘は、リーダーの提案に返答して始めてください。': ['파티 이동과 전투는 파티장의 제안에 동의한 뒤 시작합니다.', 'Party travel and battles begin after responding to the leader’s proposal.'],
  '移動経路の途中です。施設や現地の行動は、地域に到着してから行ってください。': ['이동 경로 위에 있습니다. 시설과 현장 활동은 지역에 도착한 뒤 이용해 주세요.', 'You are on the road. Reach the region before using its facilities or local activities.'],
  '夜間は営業していません。午前6時に再開します。':['영업시간이 아닙니다. 오전 6시에 다시 문을 엽니다.','Closed for the night. Reopens at 06:00.'],
  '神殿の治療には、実際の負傷・病気と治療費が必要です。':['실제 부상·질병이 있고 치료비를 지불할 수 있어야 합니다.','Treatment requires an actual injury or illness and sufficient gold.'],
  '遺跡の入口へ戻り、外へ出てから行ってください。':['입구로 돌아가 밖으로 나온 뒤 할 수 있습니다.','Return to the entrance and leave first.'],
  '目的地と交通手段を選んでください。': ['목적지와 이동 수단을 선택해 주세요.', 'Choose a destination and transport.'],
  'その交通手段は利用できません。': ['해당 이동 수단을 이용할 수 없습니다.', 'That transport is unavailable.'],
  '目的地はまだ地図にありません。隣接地域を探索するか地図を入手してください。': ['목적지가 아직 지도에 없습니다. 인접 지역을 탐사하거나 지도를 구해 주세요.', 'The destination is not on your map yet. Explore nearby regions or obtain a chart.'],
  'この交通手段で通れる経路がありません。': ['해당 이동 수단으로 갈 수 있는 경로가 없습니다.', 'There is no route for that transport.'],
  '馬車は都市から出発します。': ['마차는 도시에서 출발합니다.', 'Carriages depart from cities.'],
  '冒険者レベル3で解禁されます。': ['모험가 레벨 3부터 이용할 수 있습니다.', 'Unlocks at adventurer level 3.'],
  '両方の拠点に転移門が必要です。': ['출발지와 목적지 모두에 전이문이 필요합니다.', 'Both settlements need a gate.'],
  '客室の種類が正しくありません。': ['올바르지 않은 객실 종류입니다.', 'Invalid room type.'],
  '現在地には宿屋がありません。': ['현재 지역에는 여관이 없습니다.', 'There is no inn here.'],
  '宿泊代が足りません。野宿や無料の仕事を利用できます。': ['숙박비가 부족합니다. 야영하거나 참가비 없는 일을 할 수 있습니다.', 'You cannot afford lodging. You can camp or take work with no entry fee.'],
  '食事の種類が正しくありません。': ['올바르지 않은 식사 종류입니다.', 'Invalid meal type.'],
  '現在地には食事を頼める宿屋・食堂がありません。': ['현재 지역에는 식사를 주문할 여관이나 식당이 없습니다.', 'There is no inn or restaurant serving meals here.'],
  '食事代が足りません。無料の仕事で代金を用意できます。': ['식사비가 부족합니다. 참가비 없는 일을 해서 마련할 수 있습니다.', 'You cannot afford a meal. Earn its cost through work with no entry fee.'],
  '職業を学ぶ方法が正しくありません。': ['올바르지 않은 직업 취득 방법입니다.', 'Invalid profession acquisition method.'],
  'この場所・相手・方法では、その職業を学べません。': ['이 장소·상대·방법으로는 해당 직업을 배울 수 없습니다.', 'You cannot learn that profession through this place, person or method.'],
  'すでにその職業です。': ['이미 해당 직업을 가지고 있습니다.', 'You already have that profession.'],
  '依頼が見つかりません。': ['의뢰를 찾을 수 없습니다.', 'Quest not found.'],
  '依頼人のいる拠点で受注してください。': ['의뢰인이 있는 거점에서 수락해 주세요.', 'Accept the quest at the giver’s settlement.'],
  'その依頼は受注済み、または達成済みです。': ['이미 수락했거나 완료한 의뢰입니다.', 'You have already accepted or completed that quest.'],
  '達成できる依頼がありません。': ['완료할 수 있는 의뢰가 없습니다.', 'There is no quest you can complete.'],
  '依頼人のいる拠点へ戻ってください。': ['의뢰인이 있는 거점으로 돌아가 주세요.', 'Return to the quest giver’s settlement.'],
  '依頼の品が足りません。': ['의뢰에 필요한 물품이 부족합니다.', 'You do not have enough quest goods.'],
  'まず指定された地域を訪れてください。': ['먼저 지정된 지역을 방문해 주세요.', 'Visit the required region first.'],
  '製法が見つかりません。': ['제작법을 찾을 수 없습니다.', 'Recipe not found.'],
  'この製法は対応する職業への転職が必要です。': ['이 제작법에 맞는 직업이 필요합니다.', 'This recipe requires its matching profession.'],
  'この製法に対応する制作設備が現在地にありません。': ['현재 지역에는 이 제작법에 필요한 시설이 없습니다.', 'The crafting facilities required for this recipe are not available here.'],
  '材料が足りません。': ['재료가 부족합니다.', 'You do not have enough materials.'],
  '傷んだ食材は制作に使えません。別の食材を用意してください。': ['상한 식재료는 제작에 쓸 수 없습니다. 다른 재료를 준비해 주세요.', 'Spoiled ingredients cannot be used for crafting. Prepare other ingredients.'],
  '品物が見つかりません。': ['물품을 찾을 수 없습니다.', 'Item not found.'],
  '現在地にはこの品物を扱う店がありません。': ['현재 지역에는 이 물품을 취급하는 상점이 없습니다.', 'No shop here handles that item.'],
  'その品物を持っていません。': ['해당 물품을 가지고 있지 않습니다.', 'You do not have that item.'],
  '金貨が足りません。': ['금화가 부족합니다.', 'You do not have enough gold.'],
  'その地図を持っていません。': ['해당 지도를 가지고 있지 않습니다.', 'You do not have that chart.'],
  'この地図の地域はすべて記録済みです。': ['이 지도에 실린 지역을 모두 기록했습니다.', 'Every region on this chart is already recorded.'],
  'その品物は直接使用できません。': ['해당 물품은 직접 사용할 수 없습니다.', 'That item cannot be used directly.'],
  '回復する必要がありません。': ['회복이 필요하지 않습니다.', 'No recovery is needed.'],
  '使用できるアクティブスキルではありません。': ['사용할 수 있는 액티브 스킬이 아닙니다.', 'That active skill is unavailable.'],
  'MPが足りません。無料の休息で回復できます。': ['MP가 부족합니다. 무료 야영으로 회복할 수 있습니다.', 'Not enough MP. Free camping can restore it.'],
  'HPはすでに満タンです。': ['HP가 이미 가득 찼습니다.', 'HP is already full.'],
  '先に現在の強化効果を使ってください。': ['먼저 현재 강화 효과를 사용해 주세요.', 'Use your current buff first.'],
  'イベントの選択肢が見つかりません。': ['이벤트 선택지를 찾을 수 없습니다.', 'Event choice not found.'],
  'その操作には対応していません。': ['지원하지 않는 조작입니다.', 'That action is not supported.'],
  '冒険記録を読み込めません。保存データを管理者に確認してください。': ['모험 기록을 불러올 수 없습니다. 관리자에게 저장 데이터 확인을 요청해 주세요.', 'Your adventure record could not be loaded. Ask the administrator to check the save data.'],
  '操作の形式が正しくありません。': ['조작 형식이 올바르지 않습니다.', 'Invalid action format.'],
  '別の画面で記録が更新されました。最新の状態で選び直してください。': ['다른 화면에서 기록이 갱신되었습니다. 최신 상태에서 다시 선택해 주세요.', 'Your record was updated in another window. Choose again using the latest state.'],
  '操作が続いています。少し待ってからお試しください。': ['조작 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.', 'Too many actions. Wait a moment and try again.'],
  '冒険記録の整合性を確認できませんでした。操作は確定していません。': ['모험 기록의 일관성을 확인하지 못했습니다. 조작은 확정되지 않았습니다.', 'Your adventure record could not be validated. The action was not committed.'],
  '冒険記録を保存できませんでした。操作は確定していません。もう一度お試しください。': ['모험 기록을 저장하지 못했습니다. 조작은 확정되지 않았습니다. 다시 시도해 주세요.', 'Your adventure record could not be saved. The action was not committed. Try again.'],
  'ファンタジー世界のセッションに参加してから操作してください。': ['판타지 세계 세션에 참여한 뒤 조작해 주세요.', 'Join a fantasy-world session before taking actions.'],
  '現在の行動が終わるまで、新しい行動は開始できません。': ['현재 활동이 끝날 때까지 새 활동을 시작할 수 없습니다.', 'Wait for your current activity to finish before starting another.'],
  '世界の時刻を確認できません。': ['세계 시각을 확인할 수 없습니다.', 'The world time could not be verified.'],
  '進行中の行動記録を確認できません。': ['진행 중인 활동 기록을 확인할 수 없습니다.', 'The current activity record could not be verified.'],
  '世界時計を読み込めません。管理者に保存データを確認してください。': ['세계 시계를 불러올 수 없습니다. 관리자에게 저장 데이터 확인을 요청해 주세요.', 'The world clock could not be loaded. Ask the administrator to check the save data.'],
  '世界時計を保存できません。時間を確定できないため操作を停止しています。': ['세계 시계를 저장할 수 없습니다. 시각을 확정할 수 없어 조작이 중단되었습니다.', 'The world clock could not be saved. Actions are paused until time can be committed.'],
  'この種族では、その依頼を受けられません。': ['현재 종족으로는 해당 의뢰를 수락할 수 없습니다.', 'Your ancestry cannot accept that quest.'],
  'この種族では、その依頼を達成できません。': ['현재 종족으로는 해당 의뢰를 완료할 수 없습니다.', 'Your ancestry cannot complete that quest.'],
  'この種族・職業・場所では、そのイベントを選べません。': ['현재 종족·직업·장소에서는 해당 이벤트를 선택할 수 없습니다.', 'Your ancestry, profession or location does not allow that event.'],
  '応答を確認できませんでした。再同期してから続けてください。': ['응답을 확인하지 못했습니다. 다시 동기화한 뒤 진행해 주세요.', 'No response was received. Resync before continuing.'],
  'この依頼の条件をまだ満たしていません。': ['아직 이 의뢰의 조건을 충족하지 못했습니다.', 'You do not yet meet this quest’s requirements.'],
  '写図を作るには、記載する地域をすべて訪問するか地図に記録してください。': ['지도에 담을 지역을 먼저 방문하거나 지도에 기록해야 합니다.', 'Visit or chart every region shown before making this map.'],
  '着用中の装備は納品できません。先に装備を外すか、納品する数とは別に1個残してください。': ['착용한 장비는 납품할 수 없습니다. 먼저 해제하거나 납품 수량 외에 한 개를 남겨주세요.', 'Unequip the item before delivery, or keep one copy in addition to the required quantity.'],
  '調査の指定が正しくありません。': ['조사 방법을 확인해 주세요.', 'Check the investigation request.'],
  '調査対象の主依頼がありません。': ['조사할 메인 의뢰를 찾을 수 없습니다.', 'The main investigation quest was not found.'],
  '先にその主依頼を受注してください。': ['먼저 해당 메인 의뢰를 수락하세요.', 'Accept this main quest first.'],
  '主調査の記録を確認できません。': ['조사 기록을 확인할 수 없습니다.', 'The investigation record could not be verified.'],
  '航海場面の手掛かりの順序を確認できません。': ['앞서 확보한 단서를 확인할 수 없습니다.', 'The preceding voyage clue could not be verified.'],
  '調査を続ける前に、通路を塞ぐ相手との戦闘を終えてください。': ['조사하기 전에 길을 막은 상대와 전투를 마쳐 주세요.', 'Finish the fight blocking the route before investigating.'],
  '戦闘を終えるか離脱してから行動してください。': ['전투를 끝내거나 퇴각한 뒤 행동할 수 있습니다.', 'Finish combat or retreat before taking another activity.'],
  '物語の選択を確認できません。': ['이야기의 선택을 확인할 수 없습니다.', 'The story choice could not be verified.'],
  'その場面ではすでに返事をしています。': ['이 장면에서는 이미 답했어요.', 'You have already answered in this scene.'],
  'その物語の場面で選んでください。': ['해당 이야기의 현장에서 선택하세요.', 'Choose at the matching story scene.'],
  'その返事に必要な金貨が足りません。': ['이 선택에 필요한 금화가 부족해요.', 'You do not have enough gold for this choice.'],
  'この主依頼の調査は完了しています。依頼人へ報告してください。': ['조사를 마쳤습니다. 의뢰인에게 보고하세요.', 'Investigation complete. Report to the issuer.'],
  '次の調査段階の場所へ移動してください。': ['다음 조사 장소로 이동하세요.', 'Travel to the next investigation site.'],
  '主依頼の調査と証拠の照合を終えてから報告してください。': ['현장 조사와 증거 대조를 마쳐야 보고할 수 있습니다.', 'Finish the field investigation and evidence comparison before reporting.'],
  '調査の予約時間を確認できません。': ['조사 시간을 확인할 수 없습니다.', 'The investigation schedule could not be verified.'],
  '指定地で依頼された行動を成功させてから報告してください。': ['지정 장소에서 의뢰한 행동에 성공한 뒤 보고하세요.', 'Succeed at the requested action at its site before reporting.'],
  '指定された報告場所へ移動してください。': ['지정된 보고 장소로 이동하세요.', 'Go to the designated reporting site.'],
  '最後の主依頼は、実際に島へ到着してから報告してください。': ['마지막 장은 섬에 직접 도착해야 마무리할 수 있습니다.', 'Reach the island in person to finish the final chapter.'],
  '航海の記録の指定が正しくありません。': ['항해 기록 요청을 확인하세요.', 'Check the voyage record request.'],
  'この航海の終章はすでに記録されています。': ['이미 이 항해의 결말을 기록했습니다.', 'This voyage ending is already recorded.'],
  '最後の主依頼を終えてから航海を記録してください。': ['마지막 장을 마친 뒤 항해를 기록하세요.', 'Finish the final chapter before recording the voyage.'],
  '航海の終章は、実際に島へ到着してから記録してください。': ['섬에 직접 도착해 항해의 마지막 장을 기록하세요.', 'Reach the island in person to record the final page of your voyage.'],
  '島へ続く航路を確かめてから調査してください。': ['섬으로 이어지는 항로를 먼저 완성하세요.', 'Complete the passage to the island first.'],
  'この島への出入りは、確かめた航路を通る船で行ってください。': ['이 섬은 확인된 항로를 따라 배로 오가야 합니다.', 'Use a boat on the verified passage to enter or leave this island.'],
  '護衛依頼は戦闘職で受注してください。': ['호위 의뢰는 전투 직업으로 받을 수 있습니다.', 'Escort assignments require a combat profession.'],
  '出発地のギルドで護衛依頼を受けてください。': ['출발지의 길드에서 호위를 배정받으세요.', 'Accept an escort assignment at the departure guild.'],
  '受注済みの護衛を完了するか辞退してください。': ['진행 중인 호위를 끝내거나 포기하세요.', 'Finish or abandon your current escort assignment.'],
  'この区間の次の護衛便はまだ準備中です。': ['이 구간의 다음 호위는 아직 준비 중입니다.', 'The next escort on this route is still being prepared.'],
  '今はその行き先の護衛依頼を受注できません。': ['지금은 그 목적지의 호위를 배정받을 수 없습니다.', 'An escort to that destination is unavailable now.'],
  '先に出発地のギルドで護衛依頼を受注してください。': ['먼저 출발지 길드에서 호위를 배정받으세요.', 'First accept the escort at the departure guild.'],
  '護衛を続けるには戦闘職が必要です。': ['호위를 계속하려면 전투 직업이어야 합니다.', 'Continuing the escort requires a combat profession.'],
  '護衛依頼の記録を確認できません。': ['호위 배정 기록을 확인할 수 없습니다.', 'The escort assignment could not be verified.'],
  '受注した出発地と目的地の区間で護衛してください。': ['배정받은 출발지와 목적지 사이에서 호위해야 합니다.', 'Escort between the assigned origin and destination.'],
  '受注中の護衛依頼はありません。': ['배정받은 호위가 없습니다.', 'You have no escort assignment.'],
  '先に護衛隊を守り、出発路を確保してください。': ['먼저 호위대를 지켜 출발로를 확보하세요.', 'Defend the convoy and secure its departure route first.'],
  '身柄の手続きは町の窓口で進めてください。': ['마을 소식에서 법적 절차를 진행하세요.', 'Continue the legal proceedings in Town affairs.'],
  '護衛依頼を受注できません。': ['호위를 배정받을 수 없습니다.', 'The escort cannot be assigned.'],
  '出発地と目的地の両方に、稼働中の転移門が必要です。': ['출발지와 목적지 모두 운영 중인 전이문이 필요합니다.', 'Both the origin and destination need an operating gate.'],
  '予約された移動時間を確認できません。': ['예약한 이동 시간을 확인할 수 없습니다.', 'The reserved travel duration could not be verified.'],
  '脅威が目前にいます。戦う・逃げる・話す対応か、手持ちの品・技能を選んでください。': ['상대가 앞을 막고 있습니다. 전투·도주·대화나 소지품·기술로 대응하세요.', 'An opponent blocks your way. Fight, flee, talk, or use your items and skills.'],
};

const translatedEconomyLog = (text:string,locale:NpcLocale) => { const translated=fantasyEconomyLogText(text,locale); return translated===text?undefined:translated; };
const partyContractCopy: Record<string, Record<NpcLocale, string>> = {
  'party-contract:owner-only': { ko: '파티 의뢰의 수락과 완료 보고는 계약자가 맡습니다.', en: 'The contract holder handles acceptance and completion reports for the party.', ja: 'パーティーの依頼の受注と完了報告は契約者が行います。' },
  'party-contract:unavailable': { ko: '파티 의뢰의 기록을 확인하지 못했습니다. 진행을 보존한 채 다시 확인해 주세요.', en: 'The party contract record could not be verified. Your progress is preserved; try again.', ja: 'パーティーの依頼記録を確認できません。進行は保たれています。もう一度確かめてください。' },
};

export function fantasyErrorText(text: string, locale: NpcLocale): string {
  const expedition=fantasyExpeditionText(text,locale);if(expedition!==undefined)return expedition;
  const institution = partyContractCopy[text]?.[locale] ?? fantasyInstitutionText(text,locale) ?? fantasyUnderworldText(text, locale); if (institution !== undefined) return institution;
  const commission=fantasyCommissionText(text,locale);if(commission!==undefined)return commission;
  const cooking=fantasyCookingText(text,locale)??fantasyOutdoorCookingErrorText(text,locale);if(cooking!==undefined)return cooking;
  if(text==='combat:retreat-safe')return {ko:'휴양지는 전투 없이 쉬는 안전한 장소입니다.',en:'Retreats are safe places to relax without combat.',ja:'休養地は戦闘をせずに休む安全な場所です。'}[locale];
  if(text==='combat:encounter-only')return {ko:'탐색 중 조우하거나 수락한 토벌 의뢰의 대상을 추적해 전투를 시작해 주세요.',en:'Begin combat through an encounter or by tracking an accepted hunt contract.',ja:'探索中の遭遇か、受注した討伐対象の追跡から戦闘を始めてください。'}[locale];
  const interiorMap = fantasyInteriorMapText(text, locale); if (interiorMap) return interiorMap;
  const benefitText=fantasyRankBenefitText(text,locale);if(benefitText!==undefined)return benefitText;
  const guildOrSite = fantasyRankBookText(text, locale) ?? fantasyInnErrorText(text, locale) ?? fantasyGuildAssessmentErrorText(text, locale) ?? fantasyMonsterSiteText(text, locale); if (guildOrSite !== undefined) return guildOrSite;
  if (text === 'この技は戦場で使ってください。') return { ko: '이 기술은 전투 화면에서 사용하세요.', en: 'Use this technique on the battlefield.', ja: text }[locale];
  if(text==='手当てには同じ場所のパーティーの仲間と、回復薬または治療費が必要です。')return {ko:'같은 위치의 파티 동료와 회복약 또는 치료비가 필요합니다.',en:'A party member at the same location and a potion or treatment fee are required.',ja:text}[locale];
  const additions=fantasyMiracleText(text,locale)??fantasyDownedText(text,locale)??fantasyCarryReturnText(text,locale)??fantasyBagText(text,locale)??fantasyAlchemySynthesisText(text,locale)??fantasyProductionText(text,locale)??fantasyBlackMarketText(text,locale)??fantasyWorldUtilityText(text,locale)??fantasyOccultText(text,locale);if(additions)return additions;
  const dungeon=fantasyDungeonErrorText(text,locale);if(dungeon)return dungeon;
  const magic=fantasyMagicDiscoveryTranslation(text,locale);if(magic)return magic;
  const expansion = translatedEconomyLog(text,locale) ?? fantasyCivicLogText(text,locale) ?? fantasyPropertyText(text,locale) ?? fantasyPriestText(text,locale) ?? fantasyJobPathText(text,locale); if(expansion)return expansion;
  if (locale === 'ja') return text;
  const specialty=fantasySpecializationText(text,locale)??fantasyTerrainText(text,locale);
  if(specialty)return specialty;
  for(const code of ['invalid','guildOnly','taken','expired','conditions','already','unavailable'] as FantasyContractError[])if(text===fantasyContractErrorText(code,'ja'))return fantasyContractErrorText(code,locale);
  const translation = errorCopy[text];
  if (translation) return translation[locale === 'ko' ? 0 : 1];
  const shortage = text.match(/^金貨が(\d+)枚足りません。$/);
  if (shortage) return locale === 'ko' ? `금화가 ${shortage[1]} G 부족합니다.` : `You need ${shortage[1]} more G.`;
  return text;
}

function replaceLabels(raw: string, entries: [string, string][]): string {
  const replacements = new Map(entries.filter(([from]) => from.length > 0));
  const keys = [...replacements.keys()].sort((a, b) => b.length - a.length);
  if (!keys.length) return raw;
  const pattern = new RegExp(keys.map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  return raw.replace(pattern, match => replacements.get(match) ?? match);
}

export function fantasyLogText(text:string,locale:NpcLocale,character:FantasyCharacter|null):string {
  const expedition=fantasyExpeditionText(text,locale);if(expedition!==undefined)return expedition;
  const institution = partyContractCopy[text]?.[locale] ?? fantasyInstitutionText(text,locale) ?? fantasyUnderworldText(text, locale); if (institution !== undefined) return institution;
  const commission=fantasyCommissionText(text,locale);if(commission!==undefined)return commission;
  const cooking=fantasyCookingText(text,locale)??fantasyOutdoorCookingLogText(text,locale);if(cooking!==undefined)return cooking;
  const interiorMap = fantasyInteriorMapText(text, locale); if (interiorMap) return interiorMap;
  const benefitText=fantasyRankBenefitText(text,locale);if(benefitText!==undefined)return benefitText;
  const guildOrSite = fantasyRankBookText(text, locale) ?? fantasyInnErrorText(text, locale) ?? fantasyGuildAssessmentErrorText(text, locale) ?? fantasyMonsterSiteText(text, locale); if (guildOrSite !== undefined) return guildOrSite;
  const additions=fantasyMiracleText(text,locale)??fantasyDownedText(text,locale)??fantasyCarryReturnText(text,locale)??fantasyBagText(text,locale)??fantasyAlchemySynthesisText(text,locale)??fantasyProductionText(text,locale)??fantasyBlackMarketText(text,locale);if(additions)return additions;
  const downed:Record<string,[string,string]>={'倒れて意識を失った。仲間の奇跡か、戦闘後の手当てを待っている。':['쓰러져 의식을 잃었다. 동료의 기적이나 전투 후 치료를 기다린다.','Fell unconscious. Waiting for an ally’s miracle or treatment after battle.'],'応急手当てで容体が安定した。目覚めるまで2時間。':['응급처치로 안정됐다. 깨어나기까지 세계 시간 2시간.','Stabilized by first aid. Waking in two world hours.'],'手当てを受け、意識を取り戻した。':['치료를 받고 의식을 되찾았다.','Regained consciousness after treatment.']};if(locale!=='ja'&&downed[text])return downed[text][locale==='ko'?0:1];
  const utility=fantasyWorldUtilityText(text,locale);if(utility)return utility;
  const situation=/^職業の状況補正\+(\d+)。$/.exec(text);if(situation)return {ko:'직업 상황 보정 +'+situation[1],en:'Profession situation bonus +'+situation[1],ja:text}[locale];
  const occult=fantasyOccultText(text,locale);if(occult)return occult;
  const dungeon=fantasyDungeonLogText(text,locale);if(dungeon)return dungeon;
  if(text==='地図売りに別れを告げた。')return {ko:'지도 상인과 헤어졌다.',en:'Took leave of the map seller.',ja:text}[locale];
  if(text==='街道で、地図を広げる行商に出会った。')return {ko:'길에서 지도를 펼친 떠돌이 상인을 만났다.',en:'Met a wandering map seller on the road.',ja:text}[locale];
  if(text==='運賃が足りず、以前の移動予約を中止した。')return {ko:'운임이 부족해 이전 이동 예약이 취소되었습니다.',en:'The earlier travel booking was cancelled because the fare could not be paid.',ja:text}[locale];
  const expansion = translatedEconomyLog(text,locale) ?? fantasyCivicLogText(text,locale) ?? fantasyPropertyText(text,locale) ?? fantasyPriestText(text,locale) ?? fantasyJobPathText(text,locale); if(expansion)return expansion;
  const combatXp=/^戦闘勝利。経験値(\d+)。$/.exec(text),combatGold=/^戦果の金貨(\d+)枚を受け取った。$/.exec(text),combatItem=/^戦果の品［([a-z-]+)］を(\d+)個受け取った。$/.exec(text),combatRecord=/^戦闘記録［[^］]+］(victory|defeat|escaped|active)。$/.exec(text),combatRescue=/^戦場から救護され、金貨(\d+)枚を支払った。$/.exec(text);
  if(combatXp)return {ko:`전투 승리. 경험치 +${combatXp[1]}.`,en:`Victory. XP +${combatXp[1]}.`,ja:text}[locale];
  if(combatGold)return {ko:`전리품 분배: ${combatGold[1]} G.`,en:`Loot share: ${combatGold[1]} G.`,ja:text}[locale];
  if(combatItem){const item=FANTASY_ITEMS.find(item=>item.id===combatItem[1]);const name=item?.names?.[locale]??item?.name??combatItem[1];return {ko:`전리품: ${name} ×${combatItem[2]}.`,en:`Loot: ${name} ×${combatItem[2]}.`,ja:`戦利品：${name} ×${combatItem[2]}。`}[locale];}
  if(combatRecord)return {ko:{victory:'전투에서 승리했다.',defeat:'전투에서 쓰러졌다.',escaped:'전장에서 퇴각했다.',active:'전투 중 쓰러져 전장을 벗어났다.'},en:{victory:'Won the battle.',defeat:'Fell in battle.',escaped:'Retreated from the battlefield.',active:'Fell and left the active battlefield.'},ja:{victory:'戦闘に勝利した。',defeat:'戦闘で倒れた。',escaped:'戦場から離脱した。',active:'戦闘中に倒れ、戦場を離れた。'}}[locale][combatRecord[1] as 'victory'|'defeat'|'escaped'|'active'];
  if(combatRescue)return {ko:`전장에서 구조되었다. 구조비 ${combatRescue[1]} G.`,en:`Rescued from battle. Rescue cost: ${combatRescue[1]} G.`,ja:text}[locale];
  if(text==='戦場で力尽き、この人生は終わった。足跡は世界に残る。')return {ko:'전장에서 쓰러져 이번 삶이 끝났다. 발자취는 세계에 남는다.',en:'Fell in battle and this life ended. Its footprints remain in the world.',ja:text}[locale];
  const decisionText=fantasyVoyageDecisionLogText(text,character,locale);if(decisionText!==undefined)return decisionText;
  const sceneText=fantasyVoyageSceneLogText(text,locale,character??undefined);if(sceneText!==undefined)return sceneText;
  if(text==='行動を途中で取り消した。判定済みの受取分は残り、依頼や調査の完了は数えない。')return {ko:'행동을 중간에 취소했다. 이미 판정된 보수는 남고, 의뢰·조사의 완료는 인정되지 않는다.',en:'Cancelled the action midway. Rewards already resolved stay, but the quest or investigation does not count as complete.',ja:text}[locale];
  const workText=fantasyWorkLogText(text,locale);if(workText)return workText;
  const campText=fantasyCampLogText(text,locale);if(campText)return campText;
  const encounterText=fantasyEncounterLogText(text,locale);if(encounterText)return encounterText;
  const voyageLogs:Record<string,Record<NpcLocale,string>>={
    '島への航海を結び、旅の終章を記した。':{ko:'섬에 도달한 항해를 마치고 여정의 마지막 장을 기록했다.',en:'Completed the island voyage and recorded its final chapter.',ja:'島への航海を結び、旅の終章を記した。'},
    '航海の記録から、新しい島への航路を地図に記した。':{ko:'항해 기록을 맞춰 새 섬으로 이어지는 항로를 지도에 남겼다.',en:'Combined the navigation records and charted the route to a new island.',ja:'航海の記録から、新しい島への航路を地図に記した。'},
    '旧航海調査の予約を解除した。確かめた手掛かりと所持品は保たれている。':{ko:'이전 조사의 예약이 취소되었다. 확보한 단서와 소지품은 남아 있다.',en:'Canceled an earlier investigation reservation. Secured clues and belongings remain.',ja:'旧航海調査の予約を解除した。確かめた手掛かりと所持品は保たれている。'},
  };
  if(voyageLogs[text])return voyageLogs[text][locale];
  const taskLog=text.match(/^行動依頼「([a-z0-9-]+)」(?:を受注した。指定地で成功した行動を記録し、依頼人へ報告します。|：(\d+)\/(\d+)。)$/);
  if(taskLog){const quest=FANTASY_QUESTS.find(quest=>quest.id===taskLog[1]);if(quest){const name=fantasyQuestText(quest,locale).name;return taskLog[2]?`${name} · ${taskLog[2]}/${taskLog[3]}`:{ko:`의뢰 수락: ${name}. 지정 장소의 성공 실적을 기록해 보고하자.`,en:`Accepted ${name}. Record successful actions at the site, then report.`,ja:`「${name}」を受注した。指定地で成功した行動を記録して報告しよう。`}[locale];}}
  const mainAccepted=text.match(/^主依頼「(main-night-\d{2})」を(受注した。調査と照合が必要です。補助物資は報告時に用意します。|手放した。確かめた手掛かりは残る。)$/);
  if(mainAccepted){const quest=FANTASY_QUESTS.find(quest=>quest.id===mainAccepted[1]);if(quest){const name=fantasyQuestText(quest,locale).name,accepted=mainAccepted[2].startsWith('受注');return {ko:accepted?`의뢰 수락: ${name}. 순서대로 조사한 뒤 재료를 갖춰 보고하자.`:`${name} 의뢰를 포기했다. 확보한 단서는 남아 있다.`,en:accepted?`Accepted ${name}. Investigate in order, then bring supplies and report.`:`Abandoned ${name}. Secured clues remain.`,ja:accepted?`「${name}」を受注した。順に調査し、資材を揃えて報告しよう。`:`「${name}」を手放した。確かめた手掛かりは残る。`}[locale];}}
  const investigation=text.match(/^主調査「(main-night-\d{2})」(\d)\/(\d)：(成功|失敗)。$/);
  if(investigation){
    const quest=FANTASY_QUESTS.find(quest=>quest.id===investigation[1]);
    if(quest){const won=investigation[4]==='成功',name=fantasyQuestText(quest,locale).name;return {ko:`${name} · 조사 ${investigation[2]}/${investigation[3]} ${won?'성공':'실패'}.`,en:`${name} · investigation ${investigation[2]}/${investigation[3]} ${won?'succeeded':'failed'}.`,ja:`${name}・調査${investigation[2]}/${investigation[3]}${won?'成功':'失敗'}。`}[locale];}
  }
  const known=character?fantasyKnownLocations(character):[];
  const names=(raw:string) => {
    if(locale==='ja')return replaceLabels(raw,FANTASY_TERMS.filter(t=>t.category==='place'&&!known.includes(t.id)).map(t=>[t.names.ja,'未知の場所']));
    const entries:[string,string][]=FANTASY_TERMS.map(t=>[t.names.ja,t.category==='place'&&!known.includes(t.id)?{ko:'미지의 장소',en:'Unknown place'}[locale]:t.names[locale]]);
    const checks:Record<string,[string,string]>={'調査':['조사','Investigation'],'発見運':['발견운','Discovery'],'獲物の追跡':['사냥감 추적','Tracking'],'獲物の解体':['가죽 채집','Skinning'],'海釣り':['바다낚시','Sea fishing'],'桟橋釣り':['부두 낚시','Pier fishing'],'危険からの回避':['위험 회피','Avoid danger'],'魔物との小競り合い':['마물과의 교전','Skirmish'],'仲間との現地任務':['동료와 현장 임무','Field mission with companions']};
    for(const [source,labels] of Object.entries(checks))entries.push([source,labels[locale==='ko'?0:1]]);
    entries.push(['未確認の配合 ',{ko:'미확인 조합 ',en:'Unidentified mixture '}[locale]]);
    entries.push(['値段交渉（目標以下）',{ko:'가격 흥정 · 목표 이하',en:'Bargaining · roll at or below target'}[locale]]);
    for(const context of Object.values(FANTASY_CONTEXT_NAMES))entries.push([context.ja,context[locale]]);
    for(const m of FANTASY_MAPS)entries.push([m.name.ja,m.name[locale]]);
    for(const item of FANTASY_ITEMS)entries.push([item.name,item.names?.[locale]??FANTASY_TERMS.find(term=>term.id===item.id)?.names[locale]??item.name]);
    for(const monster of FANTASY_MONSTERS)entries.push([monster.names.ja,monster.names[locale]]);
    for(const book of FANTASY_LIBRARY_BOOKS)entries.push([book.title.ja,book.title[locale]]);
    for(const activity of FANTASY_TERRAIN_ACTIVITIES)entries.push([activity.names.ja,activity.names[locale]]);
    for(const trial of FANTASY_MAIN_TRIALS)for(const stage of trial.stages)entries.push([stage.labels.ja,stage.labels[locale]]);
    for(const gathering of Object.values(FANTASY_GATHERING_NAMES))entries.push([gathering.ja,gathering[locale]]);
    for(const q of FANTASY_QUESTS)entries.push([q.name,fantasyQuestText(q,locale).name]);
    for(const e of FANTASY_EVENTS){const tr=fantasyEventText(e,locale);entries.push([e.name,tr.name]);for(const ch of e.choices)entries.push([ch.label,tr.choices[ch.id]??ch.label]);}
    for(const j of FANTASY_JOBS)for(const s of j.skills)entries.push([s.name,fantasySkillName(s,locale)]);
    for(const r of FANTASY_RACES)for(const s of r.skills)entries.push([s.name,fantasySkillName(s,locale)]);
    for(const skill of FANTASY_MENTOR_SKILLS)entries.push([skill.name,skill.names[locale]]);
    for(const exercise of FANTASY_MANA_EXERCISES)entries.push([exercise.names.ja,exercise.names[locale]]);
    for(const r of FANTASY_RECIPES) {const term=FANTASY_TERMS.find(t=>t.id===r.output);entries.push([r.name,term?.names[locale]??r.name]);}
    for(const r of FANTASY_LODGINGS)entries.push([r.name.ja,r.name[locale]]);
    for(const m of FANTASY_DINING)entries.push([m.name.ja,m.name[locale]]);
    for(const formula of FANTASY_ALCHEMY_FORMULAS)entries.push([formula.names.ja,formula.names[locale]]);
    return replaceLabels(raw,entries).replaceAll('の仕事',locale==='ko'?' 작업':' work').replaceAll('の探索',locale==='ko'?' 탐색':' exploration').replaceAll('の狩猟',locale==='ko'?' 사냥':' hunt');
  };
  if(locale==='ja')return names(text);
  const pick=(ko:string,en:string)=>locale==='ko'?ko:en;
  const specialty=fantasySpecializationText(text,locale)??fantasyTerrainText(text,locale);
  if(specialty)return names(specialty);
  const roll=parseFantasyRoll(text);
  if(roll)return `${fantasyLogText(roll.label,locale,character)}: ${roll.dice.length}D${roll.sides} [${roll.dice.join(', ')}]${roll.rule==='single'?'':` → ${roll.kept}`} ${roll.modifier>=0?'+':'−'}${Math.abs(roll.modifier)} = ${roll.total} / DC${roll.dc} → ${roll.success?pick('성공','Success'):pick('실패','Failure')}`;
  const event=FANTASY_EVENTS.find(e=>text===`${e.name}：${e.description}`);
  if(event){const tr=fantasyEventText(event,locale);return `${tr.name}: ${tr.description}`;}
  const outcome=FANTASY_EVENTS.flatMap(e=>e.choices).find(ch=>text.startsWith(ch.success+' ')||text.startsWith(ch.failure+' '));
  if(outcome){const won=text.startsWith(outcome.success);const gold=text.match(/金貨(\d+)枚/)?.[1]??'0';const item=text.match(/金貨\d+枚、(.+)1個を獲得。$/)?.[1];const story=(won?outcome.successes:outcome.failures)?.[locale];return pick(won?`${story??'선택이 성공했다.'} ${gold} G 획득${item?' · '+names(item)+' × 1':''}.`:`${story??'선택이 실패했다.'} ${gold} G 지출.`,won?`${story??'The choice succeeded.'} Gained ${gold} G${item?' · '+names(item)+' × 1':''}.`:`${story??'The choice failed.'} Spent ${gold} G.`);}
  let m:RegExpMatchArray|null;
  if((m=text.match(/^(.+)：d20=(\d+)、補正([+-]\d+)、合計(-?\d+) \/ DC(\d+) → (成功|失敗)$/)))return `${names(m[1]).replace('の仕事',pick(' 일하기',' work')).replace('の探索',pick(' 탐색',' exploration')).replace('発見運',pick('발견운','Discovery')).replace('危険からの回避',pick('위험 회피','Avoid danger')).replace('魔物との小競り合い',pick('마물과의 교전','Skirmish'))}: d20=${m[2]} ${m[3]} = ${m[4]} / DC${m[5]} → ${m[6]==='成功'?pick('성공','Success'):pick('실패','Failure')}`;
  const patterns:[RegExp,(m:RegExpMatchArray)=>string][]=[
    [/^神殿で治療を受け、金貨(\d+)枚を支払った。$/,m=>pick(`신전에서 치료받고 ${m[1]} G를 지불했다.`,`Received temple treatment for ${m[1]} G.`)],
    [/^ギルドで(.+)行きの護衛依頼を受注した。到着後に金貨(\d+)枚。$/,m=>pick(`${names(m[1])}행 호위를 배정받았다. 도착 후 +${m[2]} G.`,`Accepted escort to ${names(m[1])}. +${m[2]} G on arrival.`)],
    [/^護衛に出発した。(.+)まで([\d.]+)時間。到着後に金貨(\d+)枚。$/,m=>pick(`${names(m[1])}행 호위에 출발했다. 게임 ${m[2]}시간 · 도착 후 +${m[3]} G.`,`Departed as escort to ${names(m[1])}. ${m[2]} game hours · +${m[3]} G on arrival.`)],
    [/^護衛を完了し、金貨(\d+)枚の報酬を受け取った。$/,m=>pick(`호위 완료. ${m[1]} G를 받았다.`,`Escort completed. Received ${m[1]} G.`)],
    [/^護衛依頼を辞退した。報酬は受け取っていない。$/,()=>pick('호위 배정을 포기했다. 보수는 받지 않았다.','Abandoned the escort. No pay received.')],
    [/^護衛依頼を辞退した。報酬は受け取らず、違約金(\d+)枚（支払い(\d+)枚）を負った。$/,m=>pick(`호위 배정을 포기했다. 보수는 받지 못하고 위약금 ${m[1]} G(지불 ${m[2]} G)를 부담했다.`,`Abandoned the escort. No pay, and a ${m[1]} G penalty (${m[2]} G paid).`)],
    [/^仲間の調査結果を共有され、証拠を確認した。$/,()=>pick('동료의 조사 결과를 공유받아 증거를 확인했다.','Shared a companion’s investigation and confirmed the evidence.')],
    [/^旧仕様の転移予約を解除した。位置・金貨・所持品は変更していない。$/,()=>pick('이전 방식의 전이문 예약이 취소되었다. 위치·금화·소지품은 그대로다.','Canceled a legacy gate reservation. Location, gold and inventory are preserved.')],
    [/^神殿で静かに祈った。司祭の熟練\+(\d+)、悪名-(\d+)。$/,m=>pick(`신전에서 기도했다.${+m[1]?` 사제 숙련 +${m[1]}.`:''}${+m[2]?` 악명 -${m[2]}.`:''}`,`Prayed at the temple.${+m[1]?` Priest proficiency +${m[1]}.`:''}${+m[2]?` Notoriety -${m[2]}.`:''}`)],
    [/^「(.+)」を読み、知識を記録した。$/,m=>pick(`『${names(m[1])}』을 정독했다.`,`Studied “${names(m[1])}”.`)],
    [/^(.+)を着用した。$/,m=>pick(`${names(m[1])}을 입었다.`,`Changed into ${names(m[1])}.`)],
    [/^(.+)を(\d+)個採集した。$/,m=>pick(`${names(m[1])} × ${m[2]} 채집.`,`Gathered ${names(m[1])} × ${m[2]}.`)],
    [/^(.+)を(\d+)匹釣り上げた。$/,m=>pick(`${names(m[1])} × ${m[2]} 낚았다.`,`Caught ${names(m[1])} × ${m[2]}.`)],
    [/^(.+)を(\d+)個回収した。獲物は一度だけ解体できる。$/,m=>pick(`${names(m[1])} × ${m[2]} 해체해 얻었다.`,`Skinned your quarry for ${names(m[1])} × ${m[2]}.`)],
    [/^(.+)の狩猟を終えた。.*$/,m=>pick(`${names(m[1])} 사냥을 마쳤다. 소지품과 해체할 사냥감을 확인하자.`,`Finished hunting ${names(m[1])}. Check your inventory and available quarry.`)],
    [/^金貨(\d+)枚で漁船を購入した。$/,m=>pick(`어선을 ${m[1]} G에 구입했다.`,`Bought a fishing boat for ${m[1]} G.`)],
    [/^金貨(\d+)枚で24時間使える漁船を借りた。$/,m=>pick(`어선을 ${m[1]} G에 빌렸다. 대여 기간: 게임 24시간.`,`Rented a fishing boat for 24 game hours for ${m[1]} G.`)],
    [/^(.+)で(.+)へ到着。([\d.]+)時間・金貨(\d+)枚。経路：(.+)$/,m=>pick(`${names(m[2])} 도착. ${m[3]}시간 · ${m[4]} G.`,`Arrived at ${names(m[2])}. ${m[3]} h · ${m[4]} G.`)],
    [/^指導料5Gを払い、(.+)を習得した。$/,m=>pick(`지도료 5G를 내고 ${names(m[1])} 기술을 배웠다.`,`Paid 5G and learned ${names(m[1])}.`)],
    [/^(.+)を装備した。$/,m=>pick(`${names(m[1])} 장착.`,`Equipped ${names(m[1])}.`)],
    [/^交渉に成功し、(\d+)%の値引きを得た。$/,m=>pick(`흥정 성공. ${m[1]}% 할인.`,`Bargaining succeeded. ${m[1]}% discount.`)],
    [/^マナ修練を終えた。段階(\d+)、熟練(\d+)。$/,m=>pick(`마나 수련을 마쳤다. ${m[1]}단계 · 숙련 ${m[2]}.`,`Mana practice finished. Stage ${m[1]} · mastery ${m[2]}.`)],
    [/^(.+)を使い、品物の効果を適用した。$/,m=>pick(`${names(m[1])}의 효과가 적용되었다.`,`Applied the effects of ${names(m[1])}.`)],
    [/^行動を開始した。完了まで([\d.]+)時間。$/,m=>pick(`활동 시작. 완료까지 게임 ${m[1]}시간.`,`Activity started. ${m[1]} game hours until completion.`)],
    [/^行動を完了できなかった。(.+)$/,m=>pick(`활동을 완료하지 못했다. ${fantasyErrorText(m[1],locale)}`,`The activity could not be completed. ${fantasyErrorText(m[1],locale)}`)],
    [/^冒険者レベルが(\d+)になった。.*$/,m=>pick(`레벨 ${m[1]} 달성. 최대 HP·MP와 판정이 성장했다.`,`Reached level ${m[1]}. Maximum HP, MP and checks improved.`)],
    [/^(\d+)のダメージを受けた.*$/,m=>pick(`${m[1]} 피해를 입었다.`,`Took ${m[1]} damage.`)],
    [/^近くの人々や仲間に保護され、(.+)へ運ばれた。救護費は金貨(\d+)枚。.*$/,m=>pick(`${names(m[1])}로 구조되었다. 구호비 ${m[2]} G. 소지품은 무사하다.`,`Rescued to ${names(m[1])}. Aid cost ${m[2]} G. Belongings are safe.`)],
    [/^救助隊に保護され.*救護費は金貨(\d+)枚。.*$/,m=>pick(`구조되어 하스로 돌아왔다. 구호비 ${m[1]} G. 소지품은 무사하다.`,`Rescued and returned to Hearth. Aid cost ${m[1]} G. Belongings are safe.`)],
    [/^種族候補：(.+)。残り(\d+)回。$/,m=>pick(`종족 후보: ${names(m[1])}. 남은 기회 ${m[2]}회.`,`Race drawn: ${names(m[1])}. ${m[2]} draws left.`)],
    [/^旅支度の贈り物：(.+)。$/,m=>pick(`여행 준비 선물: ${names(m[1]).replaceAll('、',', ')}.`,`Travel supplies gifted: ${names(m[1]).replaceAll('、',', ')}.`)],
    [/^(.+)は(.+)の(.+)として、新しい人生を歩み始めた。$/,m=>pick(`${m[1]}의 새로운 삶이 시작되었다. ${names(m[2])} · ${names(m[3])}.`,`${m[1]} began a new life. ${names(m[2])} · ${names(m[3])}.`)],
    [/^(.+)で(.+)へ到着。(\d+)時間・金貨(\d+)枚。経路：(.+)$/,m=>pick(`${names(m[2])} 도착. ${m[3]}시간 · ${m[4]} G.`, `Arrived at ${names(m[2])}. ${m[3]} h · ${m[4]} G.`)],
    [/^8時間の野宿。.*$/,()=>pick('8시간 노숙했다. HP·MP와 피로가 조금 회복되었다.','Camped for 8 hours. Recovered some HP, MP and fatigue.')],
    [/^野宿中に小銭を盗まれた。金貨(\d+)枚.*$/,m=>pick(`노숙 중 ${m[1]} G를 도둑맞았다.`,`Lost ${m[1]} G to theft while camping.`)],
    [/^(.+)に8時間宿泊。金貨(\d+)枚。.*$/,m=>pick(`${names(m[1])}에서 8시간 쉬었다. ${m[2]} G.`, `Rested in ${names(m[1])} for 8 hours. ${m[2]} G.`)],
    [/^(.+)を食べた。金貨(\d+)枚、([\d.]+)時間。.*$/,m=>pick(`${names(m[1])} 식사. ${m[3]}시간 · ${m[2]} G.`, `Ate ${names(m[1])}. ${m[3]} h · ${m[2]} G.`)],
    [/^(師匠の指導|GMの提案|ギルドへの加入)で(.+)になった。.*$/,m=>pick(`${{師匠の指導:'스승의 가르침',GMの提案:'GM의 제안',ギルドへの加入:'길드 가입'}[m[1]]}으로 ${names(m[2])} 직업을 얻었다.`, `Became ${names(m[2])} through ${{師匠の指導:'a mentor',GMの提案:'the GM',ギルドへの加入:'a guild'}[m[1]]}.`)],
    [/^(.+)に転職した。.*$/,m=>pick(`${names(m[1])} 직업으로 변경했다. 기존 숙련은 보존된다.`,`Changed profession to ${names(m[1])}. Previous proficiency is preserved.`)],
    [/^(?:仕事を無事に終え|簡単な手伝いを終え)、金貨(\d+)枚.*$/,m=>pick(`일을 마치고 ${m[1]} G를 받았다.`,`Finished work and earned ${m[1]} G.`)],
    [/^(.+)を(\d+)個見つけた。$/,m=>pick(`${names(m[1])} × ${m[2]} 발견.`,`Found ${names(m[1])} × ${m[2]}.`)],
    [/^狩人の技で生肉を1個確保した。$/,()=>pick('사냥 기술로 생고기 × 1 획득.','Hunting yielded raw meat × 1.')],
    [/^地形に合わせた体の使い方で(.+)を1個確保した。$/,m=>pick(`지형에 맞춰 몸을 활용해 ${names(m[1])} × 1 확보.`,`Adapted to the terrain and secured ${names(m[1])} × 1.`)],
    [/^依頼「(.+)」の(.+)を1個確保した。$/,m=>pick(`${names(m[1])}: ${names(m[2])} × 1 확보.`,`${names(m[1])}: secured ${names(m[2])} × 1.`)],
    [/^依頼「(.+)」を受注した。.*$/,m=>pick(`의뢰 수락: ${names(m[1])}.`,`Accepted quest: ${names(m[1])}.`)],
    [/^依頼「(.+)」達成。金貨(\d+)枚、経験値(\d+).*$/,m=>pick(`의뢰 완료: ${names(m[1])}. ${m[2]} G · ${m[3]} XP.`,`Completed quest: ${names(m[1])}. ${m[2]} G · ${m[3]} XP.`)],
    [/^(.+)を(\d+)個制作した。$/,m=>pick(`${names(m[1])} × ${m[2]} 제작.`,`Crafted ${names(m[1])} × ${m[2]}.`)],
    [/^出来栄えに納得できず.*$/,()=>pick('제작이 실패했다. 재료를 회수했다.','Crafting failed. Materials were recovered.')],
    [/^(.+)を1個売り、金貨(\d+)枚.*$/,m=>pick(`${names(m[1])} × 1 판매. ${m[2]} G 획득.`,`Sold ${names(m[1])} × 1 for ${m[2]} G.`)],
    [/^(.+)を金貨(\d+)枚で1個購入した。$/,m=>pick(`${names(m[1])} × 1 구매. ${m[2]} G.`,`Bought ${names(m[1])} × 1 for ${m[2]} G.`)],
    [/^(.+)を広げ、地図に地域を記録した。.*$/,m=>pick(`${names(m[1])}을 펼쳐 지역을 지도에 기록했다.`,`Charted regions using ${names(m[1])}.`)],
    [/^(.+)を使った。HPを(\d+)、MPを(\d+)回復。$/,m=>pick(`${names(m[1])} 사용. HP +${m[2]} · MP +${m[3]}.`,`Used ${names(m[1])}. HP +${m[2]} · MP +${m[3]}.`)],
    [/^(.+)を使用した。MPを(\d+)消費。.*$/,m=>pick(`${names(m[1])} 발동. MP -${m[2]}.`,`Used ${names(m[1])}. MP -${m[2]}.`)],
  ];
  for(const [pattern,render]of patterns)if((m=text.match(pattern)))return render(m);
  const fixed:Record<string,[string,string]>={
    '救助が届かず、この人生は終わった。足跡は記録され、新しい人生を始められる。':['구조가 닿지 않아 이번 삶이 끝났다. 발자취는 세계에 남는다.','Rescue could not reach you. This life has ended, but your footprints remain.'],
    '過去の足跡を残し、新しい人生の支度を始めた。':['발자취를 남기고 새 삶을 준비한다.','Your footprints remain as you prepare a new life.'],
    '依頼を放棄した。報酬や品物は受け取らない。':['의뢰를 포기했다.','Abandoned the quest.'],
    '採集を試したが、使える資源は確保できなかった。':['채집했지만 쓸 만한 자원을 얻지 못했다.','No usable resources were gathered.'],
    '獲物を逃したが、追跡と実戦の経験を得た。':['사냥감을 놓쳤지만 추적과 실전 경험을 얻었다.','The quarry escaped, but you gained tracking and combat experience.'],
    '魚には逃げられたが、釣りの経験を得た。':['물고기를 놓쳤지만 낚시 경험을 얻었다.','The fish escaped, but you gained fishing experience.'],
    '状態異常が体をむしばんだ。':['상태이상으로 피해를 입었다.','A harmful condition damaged you.'],
    '装備を外した。':['장비를 해제했다.','Unequipped the item.'],
    '交渉はまとまらなかった。時間をおいて再挑戦できる。':['흥정이 성사되지 않았다. 시간이 지난 뒤 다시 시도할 수 있다.','The bargain was declined. You may try again later.'],
    '空腹や疲労が体にこたえる。':['허기와 피로가 몸을 해친다.','Hunger and fatigue are taking a toll.'],
    '野宿中に小さな襲撃を受けた。':['노숙 중 습격을 받았다.','Attacked while camping.'],
    '野生の物音で何度も目覚め、疲労回復が8少なくなった。':['밤중 소리에 자꾸 깨어 충분히 쉬지 못했다.','Night noises interrupted your rest.'],
    '傷んだ食べ物で腹を壊した。':['상한 음식을 먹고 배탈이 났다.','Spoiled food caused stomach trouble.'],
    '救助のため、進行中の行動は中止された。':['구조로 인해 진행 중인 활동이 취소되었다.','The current activity was cancelled for rescue.'],
  };
  return fixed[text]?pick(...fixed[text]):names(text);
}
import { fantasyInteriorMapText } from '../../../shared/fantasy-interior-maps.ts';
