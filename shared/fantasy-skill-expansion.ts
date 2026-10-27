import type { FantasySkill, FantasyStat } from './fantasy.ts';

type Text = [ko: string, en: string, ja: string];
type Localized = Record<'ko' | 'en' | 'ja', string>;
type Condition = 'explore' | 'craft' | 'gather' | 'hunt' | 'fish' | 'command';
type Unlock = { kind: 'job'; xp: number } | { kind: 'skill'; skill: string; xp: number } | { kind: 'book'; book: string; jobXp?: number } | { kind: 'mentor'; jobXp?: number } | { kind: 'condition'; condition: Condition; count: number };
type ExpandedSkill = FantasySkill & { names: Localized; descriptions: Localized; unlock: Unlock };
const l = ([ko, en, ja]: Text): Localized => ({ ko, en, ja });
export const FANTASY_JOB_GRADES = [
  { id: 'novice', minXp: 0, names: l(['초보', 'Novice', '初歩']) },
  { id: 'apprentice', minXp: 30, names: l(['견습', 'Apprentice', '見習い']) },
  { id: 'adept', minXp: 100, names: l(['숙련자', 'Adept', '熟練']) },
  { id: 'expert', minXp: 250, names: l(['전문가', 'Expert', '専門家']) },
  { id: 'master', minXp: 600, names: l(['대가', 'Master', '大家']) },
];

type Mode = 'martial' | 'field' | 'craft' | 'social' | 'arcane' | 'sacred' | 'underworld';
interface Plan { job: string; primary: FantasyStat; secondary: FantasyStat; baseActive: string; condition: Condition; basicBook: string; fieldBook: string; mode: Mode; titles: Text[] }
const p = (job: string, primary: FantasyStat, secondary: FantasyStat, baseActive: string, condition: Condition, basicBook: string, fieldBook: string, mode: Mode, titles: Text[]): Plan => ({ job, primary, secondary, baseActive, condition, basicBook, fieldBook, mode, titles });
const PLANS: Plan[] = [
  p('adventurer', 'strength', 'agility', 'adventurer-resolve', 'explore', 'traveler-guide', 'field-signs', 'field', [
    ['배낭의 균형','Pack Balance','背嚢の均衡'], ['험로 발디딤','Rough-Trail Footing','悪路の足運び'], ['야영터 살피기','Campsite Survey','野営地の見極め'], ['짧은 위험 대응','Brief Danger Response','危険への即応'], ['귀환 방향 기억','Remember the Return','帰り道の記憶'], ['막힌 길 돌파','Break the Blockage','塞がる道の突破'], ['오래 걷는 요령','Long-Road Habit','長道の心得'], ['먼 여정의 박자','Long Journey Rhythm','長旅の拍子'],
  ]),
  p('merchant', 'charisma', 'intelligence', 'merchant-bargain', 'command', 'caravan-ledger', 'words-and-promises', 'social', [
    ['장터의 눈높이','Market Perspective','市の目線'], ['장부의 행간','Between Ledger Lines','帳簿の行間'], ['작은 약속의 가치','Worth of Small Promises','小さな約束の値'], ['차분한 가격 대조','Calm Price Comparison','穏やかな値の比較'], ['상단 길의 기억','Caravan Road Memory','隊商路の記憶'], ['합의의 실마리','Thread of Agreement','合意の糸口'], ['신뢰를 남기는 거래','Trade That Leaves Trust','信頼を残す商い'], ['먼 장터의 설득','Distant-Market Persuasion','遠市の説得'],
  ]),
  p('blacksmith', 'dexterity', 'intelligence', 'blacksmith-forge', 'craft', 'trades-handbook', 'stone-and-flame', 'craft', [
    ['망치의 고른 리듬','Even Hammer Rhythm','槌の揃う調子'], ['금속 결 읽기','Read Metal Grain','金属の目を読む'], ['낭비 없는 절삭','Measured Trimming','無駄のない削り'], ['불빛 아래 정밀 작업','Precision by the Forge','炉明かりの精密仕事'], ['모루 주변 안전','Anvil Safety','金床周りの安全'], ['완성 이음 맞추기','Finish the Joint','仕上げの継ぎ合わせ'], ['오랜 화덕의 감각','Seasoned Forge Sense','古炉の感覚'], ['대가의 마지막 타격','The Master’s Final Strike','大家の最後の一打'],
  ]),
  p('cook', 'dexterity', 'intelligence', 'cook-feast', 'craft', 'pantry-guide', 'green-and-grain', 'craft', [
    ['재료 분량 가늠','Ingredient Measure','食材の分量'], ['향의 층 나누기','Layers of Aroma','香りの層分け'], ['남김을 줄이는 손질','Low-Waste Preparation','無駄を減らす下拵え'], ['분주한 화구 정리','Order at the Stove','忙しい火口の整理'], ['뜨거운 부엌의 동선','Hot-Kitchen Routes','熱い台所の動線'], ['한 접시의 균형','Balance on a Plate','一皿の均衡'], ['오래 익힌 손맛','Seasoned Hand','馴れた手の味'], ['연회의 마지막 간','Final Seasoning','宴の最後の味付け'],
  ]),
  p('alchemist', 'intelligence', 'dexterity', 'alchemist-mixture', 'craft', 'arts-handbook', 'remedies-and-rites', 'arcane', [
    ['용액의 층 관찰','Solution Layers','溶液層の観察'], ['작은 방울 계량','Measured Drops','小滴の計量'], ['촉매 회수 습관','Catalyst Recovery','触媒回収の習慣'], ['비산 방지 막','Splash Ward','飛散を防ぐ膜'], ['잔류 흔적 읽기','Read Residue','残留跡を読む'], ['반응 순서 정리','Order the Reaction','反応順の整理'], ['안정된 조합 지식','Stable Mixture Lore','安定調合の知識'], ['최종 반응 제어','Final Reaction Control','最終反応の制御'],
  ]),
  p('hunter', 'agility', 'intelligence', 'hunter-focus', 'hunt', 'staff-and-footwork', 'field-signs', 'field', [
    ['낮은 흔적 찾기','Low-Track Reading','低い足跡探し'], ['바람 아래 접근','Downwind Approach','風下の接近'], ['숲의 안전거리','Forest Caution','森の間合い'], ['위험에서 몸 낮추기','Duck from Danger','危険に身を伏せる'], ['돌아오는 숲길','The Returning Trail','帰りの森道'], ['복잡한 흔적 분리','Separate Tangled Tracks','絡む痕跡の分離'], ['오랜 순찰의 감각','Seasoned Patrol Sense','長い巡回の勘'], ['소리 없는 먼걸음','Silent Long Stride','音なき長い歩み'],
  ]),
  p('bard', 'charisma', 'intelligence', 'bard-courage', 'command', 'archive-records', 'words-and-promises', 'social', [
    ['청중의 호흡','Audience Rhythm','聴き手の呼吸'], ['옛 노래 대조','Compare Old Songs','古歌の照合'], ['작은 무대의 경험','Small-Stage Experience','小舞台の経験'], ['흐트러진 박자 정리','Restore the Beat','乱れた拍子を整える'], ['여행 노래의 기억','Roadsong Memory','旅歌の記憶'], ['함께 부르는 후렴','Shared Refrain','共に歌う節'], ['이야기를 잇는 사람','Keeper of Stories','物語を繋ぐ者'], ['광장에 닿는 목소리','Voice across the Square','広場に届く声'],
  ]),
  p('mage', 'intelligence', 'dexterity', 'mage-insight', 'explore', 'mana-primer', 'advanced-mana-forms', 'arcane', [
    ['기초 문양 정독','Read the Pattern','基礎紋の精読'], ['가는 흐름 조율','Fine-Flow Tuning','細流の調律'], ['연구 도구 정돈','Ordered Study Tools','研究道具の整頓'], ['고른 마나 방호','Even Mana Ward','均一な魔力の守り'], ['현장 마나 관찰','Field Mana Observation','現地魔力の観察'], ['복잡한 술식 대조','Compare Complex Forms','複雑な術式の照合'], ['침착한 연구자의 눈','The Calm Scholar’s Eye','静かな研究者の目'], ['깊은 형태 집중','Deep Shape Focus','深い形の集中'],
  ]),
  p('leader', 'charisma', 'intelligence', 'leader-rally', 'command', 'trades-handbook', 'words-and-promises', 'social', [
    ['역할 나누기','Share the Roles','役割を分ける'], ['상황의 순서','Order of Priorities','状況の順序'], ['작은 합의 기록','Small Agreements','小さな合意の記録'], ['혼란 속의 안내','Guidance in Confusion','混乱の案内'], ['현장을 기억하는 눈','Memory of the Site','現場を覚える目'], ['서로의 말 잇기','Join Both Voices','双方の言葉を繋ぐ'], ['꾸준한 공동 준비','Steady Shared Preparation','地道な共同準備'], ['큰 무리의 보조 맞추기','Set a Common Pace','大勢の歩調を揃える'],
  ]),
  p('thief', 'agility', 'intelligence', 'thief-chance', 'explore', 'trades-handbook', 'shadow-and-risk', 'underworld', [
    ['좁은 길의 눈','Eye for Tight Paths','狭路を見る目'], ['작은 소리 구분','Separate Faint Sounds','小音の聞き分け'], ['서두르지 않는 손','Unhurried Hands','急がない手'], ['들키기 전 물러서기','Retreat before Trouble','騒ぎの前に退く'], ['되돌아갈 모퉁이','The Return Corner','戻る角'], ['빠져나갈 틈 찾기','Find the Opening','抜ける隙を探す'], ['위험을 재는 습관','Habit of Caution','危険を量る習慣'], ['그림자 속 발디딤','Shadow Footing','影の足運び'],
  ]),
  p('smuggler', 'charisma', 'intelligence', 'smuggler-talk', 'explore', 'caravan-ledger', 'shadow-and-risk', 'social', [
    ['항구의 긴장 읽기','Read Harbor Tension','港の緊張を読む'], ['엇갈린 서류 대조','Conflicting Papers','食い違う書類の照合'], ['위험 비용 가늠','Measure the Risk','危険の代価を量る'], ['궁지의 침착함','Composure in a Corner','窮地の落ち着き'], ['귀환 약속 기억','Remember the Return','帰還の約束を覚える'], ['말의 모순 풀기','Untangle Contradictions','言葉の矛盾を解く'], ['경솔한 거래 피하기','Avoid Rash Deals','軽率な取引を避ける'], ['막힌 협상의 출구','Exit from Deadlock','行き詰まる交渉の出口'],
  ]),
  p('assassin', 'agility', 'intelligence', 'assassin-retreat', 'hunt', 'staff-and-footwork', 'shadow-and-risk', 'underworld', [
    ['발소리의 간격','Footstep Intervals','足音の間隔'], ['현장의 작은 변화','Small Changes on Site','現場の小変化'], ['퇴로를 남기는 습관','Leave a Way Back','退路を残す習慣'], ['위험한 순간의 회피','A Timely Evasion','危うい瞬間の回避'], ['긴 추적의 방향','Direction of a Long Trail','長い追跡の向き'], ['흔들림 없는 움직임','Unwavering Motion','揺れない動き'], ['충동을 누르는 판단','Measured Judgment','衝動を抑える判断'], ['마지막 순간의 이탈','Final-Moment Withdrawal','最後の離脱'],
  ]),
  p('bandit', 'strength', 'vitality', 'bandit-intimidate', 'hunt', 'quiet-sword', 'shadow-and-risk', 'martial', [
    ['거친 길의 균형','Rough-Road Balance','荒道の均衡'], ['무거운 짐 버티기','Hold the Heavy Load','重荷を堪える'], ['야영지 경계','Camp Caution','野営地の警戒'], ['상처를 줄이는 자세','A Guarded Stance','傷を抑える構え'], ['산길 귀환 감각','Mountain Return Sense','山道の帰還感覚'], ['막힌 통로 밀기','Press the Blocked Way','塞がる通路を押す'], ['위험 앞의 절제','Restraint before Danger','危険を前にした自制'], ['굳센 철수 준비','Firm Withdrawal','強固な退き支度'],
  ]),
  p('spy', 'intelligence', 'charisma', 'spy-cover', 'explore', 'archive-records', 'shadow-and-risk', 'social', [
    ['관찰과 추측 분리','Separate Fact and Guess','観察と推測を分ける'], ['변화 없는 표정','An Even Expression','変わらぬ表情'], ['출처 확인 습관','Check the Source','出典を確かめる習慣'], ['엇갈린 말 정리','Order Conflicting Words','食い違う言葉の整理'], ['현장의 작은 지도','A Small Site Map','現場の小地図'], ['빈 기록 대조','Compare the Gaps','空白記録の照合'], ['오랜 관찰자의 절제','The Observer’s Restraint','観察者の長い自制'], ['차분한 질문의 힘','The Calm Question','穏やかな問いの力'],
  ]),
  p('crimeboss', 'charisma', 'intelligence', 'crimeboss-command', 'command', 'trades-handbook', 'shadow-and-risk', 'social', [
    ['무리의 불안 읽기','Read the Group’s Unease','一団の不安を読む'], ['이해관계 대조','Compare Interests','利害の照合'], ['경솔한 명령 줄이기','Fewer Rash Orders','軽率な命を減らす'], ['혼란 속 질서','Order amid Confusion','混乱の中の秩序'], ['물러설 때 기억','Remember When to Withdraw','退く時を覚える'], ['갈라진 의견 묶기','Gather Divided Views','割れた意見を束ねる'], ['오래 보는 책임','Long-View Responsibility','長い目の責任'], ['최후의 중재','Final Mediation','最後の調停'],
  ]),
  p('priest', 'intelligence', 'vitality', 'priest-grace', 'craft', 'arts-handbook', 'remedies-and-rites', 'sacred', [
    ['기도문 정독','Prayer Reading','祈祷文の精読'], ['봉사의 고른 호흡','Breath of Service','奉仕の呼吸'], ['성소의 안전 습관','Sanctuary Care','聖所の安全習慣'], ['작은 회복의 기도','Prayer of Small Recovery','小さな回復の祈り'], ['순례길의 살핌','Pilgrim-Road Care','巡礼路の見守り'], ['의식 순서 대조','Compare the Rite','儀式手順の照合'], ['오랜 봉사의 버팀','Endurance of Service','長い奉仕の支え'], ['깊은 회복의 기도','Prayer of Deep Recovery','深い回復の祈り'],
  ]),
  p('warrior', 'strength', 'vitality', 'approved-skill-warrior-drive', 'hunt', 'quiet-sword', 'martial-practice', 'martial', [
    ['무게를 받는 어깨','Weight-Bearing Shoulders','重さを受ける肩'], ['짧은 힘의 배분','Measured Effort','短い力の配分'], ['훈련장 안전거리','Training Caution','稽古場の間合い'], ['꺾이지 않는 방어','Unbroken Guard','崩れない守り'], ['험로의 버팀','Rough-Trail Endurance','悪路の踏ん張り'], ['모은 힘의 돌파','Gathered Breakthrough','集めた力の突破'], ['오랜 대련의 절제','Seasoned Restraint','長い稽古の自制'], ['굳센 전진 자세','Firm Advance','堅固な前進姿勢'],
  ]),
  p('knight', 'vitality', 'charisma', 'approved-skill-knight-vow', 'command', 'quiet-sword', 'martial-practice', 'martial', [
    ['호위의 교대 규율','Escort Rotation','護衛交代の規律'], ['안심시키는 안내','Reassuring Guidance','安心させる案内'], ['서약의 안전선','The Pledge’s Safety Line','誓約の安全線'], ['낮은 방호 자세','Low Guard','低い守護の構え'], ['행렬의 속도 기억','Procession Pace','行列の歩調'], ['끝까지 지키는 버팀','Enduring the Watch','最後まで守る粘り'], ['오랜 초소의 경계','Seasoned Watch','長い見張りの警戒'], ['흔들리지 않는 수문','Unwavering Watchpost','揺るがぬ守り門'],
  ]),
  p('spearfighter', 'strength', 'agility', 'approved-skill-spearfighter-press', 'hunt', 'staff-and-footwork', 'martial-practice', 'martial', [
    ['긴 자루의 중심','Long-Shaft Center','長柄の中心'], ['선회 발디딤','Turning Footwork','旋回の足運び'], ['연습선의 절제','Practice-Line Restraint','稽古線の自制'], ['자루로 받는 방호','Shaft Guard','柄で受ける守り'], ['산길의 긴 보폭','Long Mountain Step','山道の長い歩幅'], ['곧은 힘의 집중','Straightened Force','真っ直ぐな力の集中'], ['수많은 반복의 균형','Balance through Repetition','反復の均衡'], ['단단한 끝맺음','Firm Finish','堅い締め'],
  ]),
  p('archer', 'agility', 'intelligence', 'approved-skill-archer-focus', 'hunt', 'staff-and-footwork', 'martial-practice', 'martial', [
    ['먼 표식의 눈금','Distant Mark Scale','遠い目印の目盛り'], ['바람 간격 가늠','Wind Interval','風の間隔の見積もり'], ['화살 정리 습관','Ordered Arrows','矢を整える習慣'], ['빠른 몸 낮추기','Quick Duck','素早く身を伏せる'], ['숲 가장자리의 길','Forest-Edge Path','森縁の道'], ['흔들림 없는 조준','Unwavering Aim','揺れない狙い'], ['오랜 표적 관찰','Seasoned Target Study','長い的の観察'], ['고른 숨의 끝','The Measured Breath’s End','整う息の終わり'],
  ]),
  p('scout', 'agility', 'intelligence', 'approved-skill-scout-scan', 'explore', 'staff-and-footwork', 'field-signs', 'field', [
    ['되짚는 발자국','Retraced Footprints','たどり直す足跡'], ['서로 다른 흔적','Separate Traces','異なる痕跡'], ['야영지 위험선','Camp Hazard Line','野営地の危険線'], ['급한 철수 자세','Ready Withdrawal','急な退きの姿勢'], ['갈림길의 방향감','Fork Sense','分岐の方向感覚'], ['세밀한 전방 관찰','Close Forward Study','細やかな前方観察'], ['익숙한 미지의 경계','A Familiar Frontier','馴れた未知の境'], ['멀리 이어지는 귀환','The Long Return','遠く続く帰路'],
  ]),
  p('pugilist', 'vitality', 'strength', 'approved-skill-pugilist-breath', 'hunt', 'quiet-sword', 'martial-practice', 'martial', [
    ['골반의 고른 중심','Even Center','腰の均一な重心'], ['팔과 어깨의 협응','Arm and Shoulder Unity','腕と肩の協調'], ['대련의 안전한 멈춤','Safe Sparring Stop','稽古の安全な停止'], ['충격 흘리는 자세','Yielding Guard','衝撃を流す構え'], ['발바닥의 길 감각','Sole-Sense Route','足裏の道感覚'], ['짧은 전신 집중','Whole-Body Focus','短い全身集中'], ['오래 버티는 호흡','Enduring Breath','長く耐える呼吸'], ['단단한 중심 회복','Restore the Center','堅い重心の立て直し'],
  ]),
  p('spellblade', 'strength', 'intelligence', 'approved-skill-spellblade-channel', 'explore', 'mana-primer', 'advanced-mana-forms', 'arcane', [
    ['손잡이의 힘 배분','Hilt Force Balance','柄の力配分'], ['문양과 동작 대조','Pattern and Motion','紋と動作の照合'], ['마나 회수 습관','Recover the Flow','魔力回収の習慣'], ['검곁의 방호막','Ward beside the Blade','刃の傍の守り膜'], ['현장 흐름의 기억','Field-Flow Memory','現場の流れの記憶'], ['힘과 마나의 합','Force and Mana Unity','力と魔力の和'], ['과한 방출의 절제','Release Restraint','過剰な放出の自制'], ['정밀한 제어 집중','Precision Control','精密な制御集中'],
  ]),
  p('shieldbearer', 'vitality', 'strength', 'approved-skill-shieldbearer-set', 'hunt', 'quiet-sword', 'martial-practice', 'martial', [
    ['균등한 하중 받기','Even Load Bearing','均等な荷重受け'], ['방책을 세우는 힘','Raise the Barrier','柵を立てる力'], ['방패끈 안전 점검','Shield-Strap Safety','盾紐の安全点検'], ['넓게 받치는 방호','Broad Brace','広く支える守り'], ['무거운 걸음의 박자','Heavy-Step Rhythm','重い歩みの拍子'], ['끝까지 버티는 받침','Lasting Support','最後まで耐える支え'], ['오랜 방호의 감각','Seasoned Guard Sense','長い守りの感覚'], ['흔들림 없는 대형','Unshaken Formation','揺るがぬ構え'],
  ]),
  p('summoner', 'intelligence', 'charisma', 'approved-skill-summoner-seal', 'explore', 'mana-primer', 'advanced-mana-forms', 'arcane', [
    ['계약 기호의 질서','Covenant Symbol Order','契約記号の秩序'], ['서약을 읽는 목소리','The Vow-Reading Voice','誓約を読む声'], ['매개체 정돈 습관','Ordered Focus','媒介を整える習慣'], ['겹쳐 그린 수호 문양','Layered Guardian Pattern','重ねる守護紋'], ['잔류 문양 관찰','Residual Pattern Study','残る紋の観察'], ['흐름의 연결 고리','Flow Link','流れの繋ぎ輪'], ['오래 보존한 계약','Preserved Covenant','長く保つ契約'], ['정밀한 계약 제어','Precise Covenant Control','精密な契約制御'],
  ]),
  p('carpenter', 'dexterity', 'strength', 'approved-skill-carpenter-fit', 'craft', 'trades-handbook', 'wood-and-hide', 'craft', [
    ['자투리 결 읽기','Offcut Grain','端材の木目'], ['받침의 무게 나누기','Share Support Weight','支えの重さを分ける'], ['남김 없는 목재','Timber without Waste','木材を余さぬ工夫'], ['맞물리는 수선','Interlocking Repair','噛み合う修繕'], ['작업장의 손 보호','Workshop Hand Care','作業場の手の守り'], ['정확한 마지막 이음','Final Fitted Joint','正確な最後の継ぎ'], ['오래 쓴 도구의 감각','Seasoned Tool Sense','使い込む道具の感覚'], ['대들보의 정밀 맞춤','Precision Beam Fit','梁の精密合わせ'],
  ]),
  p('tailor', 'dexterity', 'intelligence', 'approved-skill-tailor-stitch', 'craft', 'trades-handbook', 'cloth-and-thread', 'craft', [
    ['움직임을 재는 눈','Measure Motion','動きを測る目'], ['옷감 결의 대조','Compare Cloth Grain','布目の照合'], ['남은 천의 쓰임','Use the Offcuts','端布の使い道'], ['당김 없는 봉제','Seams without Pull','引きつれない縫い'], ['바늘과 핀의 정리','Needle and Pin Order','針と留め具の整理'], ['체형에 맞춘 재단','Body-Fitted Cut','体に合わせる裁ち'], ['오래 남는 솔기','Lasting Seam','長く保つ縫い目'], ['입는 이의 마지막 치수','The Wearer’s Final Measure','着る人の最後の寸法'],
  ]),
  p('weaver', 'dexterity', 'intelligence', 'approved-skill-weaver-tension', 'craft', 'trades-handbook', 'cloth-and-thread', 'craft', [
    ['고른 실 간격','Even Thread Spacing','糸間を揃える'], ['무늬의 작은 차이','Fine Pattern Differences','模様の小さな違い'], ['실끝 회수 습관','Recover Thread Ends','糸端回収の習慣'], ['흐트러진 장력 정리','Restore the Tension','乱れた張りを整える'], ['베틀 주변 안전','Loom Safety','機の周りの安全'], ['정밀한 무늬 이어짐','Precision Pattern Join','精密な模様の繋ぎ'], ['오래 짠 손의 박자','Seasoned Weaving Rhythm','織り続けた手の拍子'], ['흠 없는 마무리 결','Flawless Finishing Weave','傷のない仕上げ目'],
  ]),
  p('leatherworker', 'dexterity', 'vitality', 'approved-skill-leatherworker-knot', 'craft', 'trades-handbook', 'wood-and-hide', 'craft', [
    ['가죽 두께 가늠','Leather Thickness','革の厚さの見積もり'], ['당김을 견디는 손','Hands against Tension','張りに耐える手'], ['낭비 없는 가죽 재단','Low-Waste Leather Cut','無駄なき革裁ち'], ['정확한 솔기 덧댐','Precision Seam Patch','正確な縫い目の当て'], ['날카로운 도구의 안전','Sharp-Tool Safety','鋭い道具の安全'], ['새지 않는 이음','Watertight Join','漏れない継ぎ目'], ['오래 가는 여행끈','Lasting Travel Strap','長持ちする旅紐'], ['대가의 마감 죔','Masterful Final Lacing','大家の仕上げ締め'],
  ]),
  p('gemcutter', 'dexterity', 'intelligence', 'approved-skill-gemcutter-facet', 'craft', 'arts-handbook', 'stone-and-flame', 'craft', [
    ['고른 절삭면','Even Facets','揃う研磨面'], ['빛의 굴절 대조','Compare Refraction','屈折の照合'], ['원석 손실 줄이기','Preserve the Rough','原石の損失を減らす'], ['미세한 보석집 맞춤','Fine Setting Fit','細かな石座合わせ'], ['원석 가루의 안전','Gem-Dust Safety','石粉への安全'], ['최종 면의 집중','Final-Facet Focus','最後の面の集中'], ['오래 본 빛의 감각','Seasoned Light Sense','見続けた光の感覚'], ['빛을 살리는 마무리','Light-Preserving Finish','光を生かす仕上げ'],
  ]),
  p('herbalist', 'intelligence', 'dexterity', 'approved-skill-herbalist-soothe', 'gather', 'pantry-guide', 'green-and-grain', 'craft', [
    ['잎맥과 향의 짝','Vein and Scent Pairing','葉脈と香りの組'], ['작은 표본 손질','Fine Sample Handling','小標本の手入れ'], ['채집지 보존 습관','Preserve Gathering Grounds','採取地を守る習慣'], ['약초 묶음의 정돈','Order the Herb Bundles','薬草束を整える'], ['현장 표본 읽기','Field Sample Reading','現地標本を読む'], ['복잡한 잎의 대조','Compare Complex Leaves','複雑な葉の照合'], ['오래 맡은 향의 기억','Seasoned Scent Memory','長く嗅いだ香りの記憶'], ['대가의 표본 감별','Master Sample Appraisal','大家の標本鑑別'],
  ]),
  p('farmer', 'vitality', 'strength', 'approved-skill-farmer-brace', 'gather', 'trades-handbook', 'green-and-grain', 'craft', [
    ['꾸준한 밭의 호흡','Steady Field Breath','畑の地道な呼吸'], ['물길 받침의 힘','Channel-Bracing Strength','水路を支える力'], ['곡물 남김 줄이기','Preserve the Grain','穀物の無駄を減らす'], ['흙과 자루 정돈','Order Soil and Sacks','土と袋を整える'], ['들녘의 안전한 자세','Safe Field Posture','野の安全な姿勢'], ['일손의 고른 분배','Even Farm Effort','農作業の力を揃える'], ['오래 일군 땅의 감각','Seasoned Soil Sense','耕した土の感覚'], ['하루 일을 마치는 버팀','Endure the Day’s Work','一日の仕事を終える粘り'],
  ]),
  p('fisher', 'agility', 'vitality', 'approved-skill-fisher-haul', 'fish', 'staff-and-footwork', 'field-signs', 'field', [
    ['줄과 물살의 박자','Line and Current Rhythm','綱と流れの拍子'], ['찬물의 고른 호흡','Even Coldwater Breath','冷水の均一な呼吸'], ['어구의 안전한 매듭','Safe Gear Knots','漁具の安全な結び'], ['물가의 위험 대응','Shoreline Danger Response','水際の危険対応'], ['물길 귀환 감각','Waterway Return Sense','水路の帰還感覚'], ['흐름에 맞춘 손놀림','Hands with the Current','流れに合わせる手'], ['오래 본 조수의 기억','Seasoned Tide Memory','見続けた潮の記憶'], ['긴 물길의 발디딤','Long-Waterway Footing','長い水路の足運び'],
  ]),
  p('baker', 'dexterity', 'intelligence', 'approved-skill-baker-rhythm', 'craft', 'pantry-guide', 'green-and-grain', 'craft', [
    ['고른 반죽 나누기','Even Dough Portions','生地を均等に分ける'], ['기포와 향의 판단','Judge Bubbles and Aroma','泡と香りの判断'], ['자투리 반죽 활용','Use the Dough Ends','端生地の活用'], ['화덕 앞의 정밀 손질','Precision by the Oven','窯前の精密な手入れ'], ['뜨거운 판의 안전','Hot-Tray Safety','熱い板の安全'], ['익힘의 마지막 맞춤','Final Bake Adjustment','焼きの最後の調整'], ['오래 익힌 화덕 감각','Seasoned Oven Sense','焼き続けた窯の感覚'], ['축제 빵의 완성','Festival Loaf Finish','祭りパンの仕上げ'],
  ]),
  p('potter', 'dexterity', 'intelligence', 'approved-skill-potter-center', 'craft', 'trades-handbook', 'stone-and-flame', 'craft', [
    ['그릇 벽의 고름','Even Vessel Walls','器壁を揃える'], ['흙 속 기포 읽기','Read Air in Clay','土の泡を読む'], ['흙을 남기는 손질','Preserve the Clay','土を残す手入れ'], ['젖은 중심 다듬기','Refine the Wet Center','濡れた中心を整える'], ['가마 주변 안전','Kiln Safety','窯周りの安全'], ['정밀한 입구 마감','Precision Rim Finish','精密な口縁仕上げ'], ['오래 빚은 손의 기억','Seasoned Shaping Memory','練り続けた手の記憶'], ['흠 없는 그릇의 선','The Vessel’s Clear Line','傷なき器の線'],
  ]),
  p('shipwright', 'strength', 'dexterity', 'approved-skill-shipwright-rig', 'craft', 'trades-handbook', 'wood-and-hide', 'craft', [
    ['선판 무게 가늠','Hull-Plank Weight','船板の重さの見積もり'], ['돛줄의 정밀 고정','Precision Rigging','帆綱の精密固定'], ['남는 판재의 쓰임','Use Spare Planks','余り板の使い道'], ['새지 않는 선체 이음','Sealed Hull Joint','漏れない船体の継ぎ'], ['부두의 안전한 발','Safe Pier Footing','桟橋の安全な足場'], ['무거운 보수판 맞춤','Fit the Repair Plank','重い補修板を合わせる'], ['오래 본 배의 균형','Seasoned Hull Balance','見続けた船の均衡'], ['대가의 받침 세우기','Masterful Support','大家の支え組み'],
  ]),
  p('scribe', 'intelligence', 'dexterity', 'approved-skill-scribe-clear', 'craft', 'archive-records', 'words-and-promises', 'craft', [
    ['출처를 나누는 눈','Separate the Sources','出典を分ける目'], ['흔들리지 않는 필획','Steady Pen Strokes','揺れない筆画'], ['사본의 빈칸 지키기','Respect the Blank','写しの空白を守る'], ['흐린 기록의 정리','Order Faded Records','薄い記録を整える'], ['현장 기록 확인','Check Field Notes','現地記録の確認'], ['명료한 판본 대조','Clear Edition Comparison','明瞭な写本照合'], ['오래 남기는 증거','Evidence That Lasts','長く残す証拠'], ['대가의 정확한 필사','Master Transcription','大家の正確な筆写'],
  ]),
];

const STAT_NAMES: Record<FantasyStat, Text> = { strength: ['힘','Strength','力'], agility: ['민첩','Agility','敏捷'], intelligence: ['지능','Intelligence','知力'], luck: ['운','Luck','運'], vitality: ['체력','Vitality','体力'], dexterity: ['손재주','Dexterity','手先'], charisma: ['카리스마','Charisma','カリスマ'] };
type DiceFaces = NonNullable<FantasySkill['diceFaces']>;
// One face pattern applies to a check; these annotations never stack patterns.
const DICE_TECHNIQUES: Record<string, DiceFaces> = {
  'job-blacksmith-advanced-5': 'even',
  'job-tailor-advanced-5': 'steady',
  'job-weaver-advanced-5': 'even',
  'job-leatherworker-advanced-5': 'steady',
  'job-gemcutter-advanced-5': 'even',
  'job-scribe-advanced-5': 'steady',
  'job-potter-advanced-5': 'even',
  'job-archer-advanced-6': 'upper',
  'job-scout-advanced-6': 'upper',
  'job-warrior-advanced-6': 'even',
  'job-pugilist-advanced-6': 'even',
  'job-mage-advanced-6': 'upper',
  'job-alchemist-advanced-6': 'steady',
  'job-spellblade-advanced-2': 'steady',
  'job-summoner-advanced-6': 'upper',
  'job-thief-advanced-6': 'upper',
  'job-assassin-advanced-6': 'even',
  'job-hunter-advanced-2': 'upper',
  'job-carpenter-advanced-6': 'even',
  'job-baker-advanced-6': 'steady',
};
function diceDescription(base: Localized, faces: DiceFaces, passive: boolean): Localized {
  const pattern = { steady: '2·2·3·4·5·6', even: '2·2·4·4·6·6', upper: '4·4·5·5·6·6' }[faces];
  const details = l([
    `${passive ? '해당 능력 판정의 눈을 바꾼다. 주사위 수는 늘리지 않는다.' : '다음 해당 능력 판정 1회에 주사위 1개를 추가하고 눈을 바꾼다.'} D6 눈: ${pattern}. 다른 면수도 같은 6구간 비례 규칙을 쓴다.`,
    `${passive ? 'Change the faces used for checks of this stat without adding dice.' : 'Add one die and change the faces for the next matching stat check only.'} D6 faces: ${pattern}. Other die sizes use the same six-band proportional rule.`,
    `${passive ? '対応する能力判定の出目を変更する。ダイス数は増えない。' : '次の対応する能力判定1回にダイスを1個追加し、出目を変更する。'}D6の目：${pattern}。他の面数も同じ6区間の比例規則を使う。`,
  ]);
  return { ko: `${base.ko} ${details.ko}`, en: `${base.en} ${details.en}`, ja: `${base.ja}${details.ja}` };
}
function description(effect: FantasySkill['effect'], power: number, stat: FantasyStat | undefined, passive: boolean): Localized {
  if (effect === 'check') { const names = STAT_NAMES[stat!]; return l([`${passive ? '' : '다음 '}${names[0]} 판정 +${power}.`, `${passive ? '' : 'The next '}${names[1]} ${passive ? 'checks gain' : 'check gains'} +${power}.`, `${passive ? '' : '次の'}${names[2]}判定+${power}。`]); }
  if (effect === 'guard') return l([`${passive ? '받는' : '다음에 자신이 받는'} 피해를 ${power} 줄인다.`, `Reduce ${passive ? 'incoming damage' : 'your next incoming damage'} by ${power}.`, `${passive ? '' : '次に自分が受ける'}被害を${power}軽減する。`]);
  if (effect === 'heal') return l([`자신의 HP를 ${power} 회복한다.`, `Restore ${power} of your own HP.`, `自分のHPを${power}回復する。`]);
  if (effect === 'reward') return l([`일과 제작에서 적용되는 성과 보정 +${power}.`, `Work and crafting reward modifier +${power}.`, `仕事と制作の成果補正+${power}。`]);
  return l([`${passive ? '' : '다음 '}이동 시간을 ${power}시간 줄인다. 최소 1시간.`, `Reduce ${passive ? '' : 'the next '}travel time by ${power} hours, to a minimum of one.`, `${passive ? '' : '次の'}移動時間を${power}時間短縮。最低1時間。`]);
}
function build(plan: Plan): ExpandedSkill[] {
  const craft = plan.mode === 'craft', field = ['field','underworld'].includes(plan.mode), social = plan.mode === 'social', sacred = plan.mode === 'sacred';
  const effects: [FantasySkill['effect'], number, FantasyStat | undefined][] = [
    ['check', 3, plan.primary], ['check', 3, plan.secondary],
    [craft || social ? 'reward' : 'guard', craft || social ? 2 : 3, undefined],
    sacred ? ['heal',20,undefined] : craft || social ? ['check',4,plan.primary] : ['guard',8,undefined],
    field ? ['travel',1,undefined] : ['check',2,plan.secondary], ['check',5,plan.primary],
    [social ? 'reward' : 'guard', social ? 3 : 4, undefined],
    sacred ? ['heal',32,undefined] : field ? ['travel',3,undefined] : ['check',6,plan.primary],
  ];
  const unlocks: Unlock[] = [
    {kind:'job',xp:30}, {kind:'skill',skill:plan.baseActive,xp:5}, {kind:'book',book:plan.basicBook,jobXp:100}, {kind:'mentor',jobXp:100},
    {kind:'condition',condition:plan.condition,count:6}, {kind:'skill',skill:`job-${plan.job}-advanced-2`,xp:20}, {kind:'job',xp:600}, {kind:'book',book:plan.fieldBook,jobXp:250},
  ];
  return plan.titles.map((title,index) => { const [effect,power,stat] = effects[index]; const passive=index%2===0; const id=`job-${plan.job}-advanced-${index+1}`, diceFaces=DICE_TECHNIQUES[id]; const names=l(title), base=description(effect,power,stat,passive), descriptions=diceFaces?diceDescription(base,diceFaces,passive):base; return {id,names,name:names.ja,descriptions,description:descriptions.ja,kind:passive?'passive':'active',effect,power,mp:passive?0:[0,5,0,7,0,9,0,12][index],...(stat?{stat}:{}),...(diceFaces?{diceFaces}:{}),unlock:unlocks[index]}; });
}

export const FANTASY_JOB_SKILL_EXPANSIONS: Record<string, ExpandedSkill[]> = Object.fromEntries(PLANS.map(plan => [plan.job,build(plan)]));
export const FANTASY_SKILL_METADATA_OVERRIDES: Record<string, {names:Localized;descriptions:Localized}> = {};
export const FANTASY_SKILL_FIELD_BOOKS: Record<string,string[]> = Object.fromEntries([...new Set(PLANS.map(plan => plan.fieldBook))].map(book => [book,PLANS.filter(plan => plan.fieldBook===book).map(plan => plan.job)]));
