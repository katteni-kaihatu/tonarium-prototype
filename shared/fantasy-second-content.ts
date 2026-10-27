import type { FantasyCheckContext, FantasyEvent, FantasyEventChoice, FantasyQuest, FantasyStat } from './fantasy.ts';
import { FANTASY_SETTLEMENT_MAIN_QUESTS, FANTASY_SETTLEMENT_MAIN_REVEALS, FANTASY_SETTLEMENT_SIDE_QUESTS } from './fantasy-settlement-quests.ts';
import { fantasyIsleChapter, fantasyIsleRevelation } from './fantasy-isle-story.ts';

type Text = [ko: string, en: string, ja: string];
type L = Record<'ko'|'en'|'ja',string>;
const l = ([ko,en,ja]:Text):L=>({ko,en,ja});
type Quest = FantasyQuest & { chapter?:number; dialogue:L; group?:boolean; seasons?:('spring'|'summer'|'autumn'|'winter')[]; objective?:FantasyQuest['objective'] };
const N:Record<string,Text>={
  hearth:['하스','Hearth','炉火の街ハース'],suncourt:['솔네왕도','Suncourt','白日王都ソルネ'],emberhall:['엠버홀','Emberhall','鍛都エンバーホール'],tidehaven:['조수항','Tidehaven','潮待ち港'],dawnport:['아사기항','Dawnport','東岸港アサギ'],mooncity:['루네리아','Mooncity','月都ルネリア'],starspire:['별읽는탑','Starspire','星詠みの塔'],
  greenwood:['푸른잎숲','Greenwood','翠葉の森'],sunmeadow:['햇살목초지','Sunmeadow','陽だまり牧草地'],ironridge:['철관산맥','Ironridge','鉄冠山脈'],deepcave:['푸른수정동굴','Deepcave','青晶の洞窟'],reedfen:['은갈대습지','Silverreed Fen','銀葦の湿原'],oldwatch:['옛망루성','Oldwatch','風化した見張り城'],glassdesert:['유리사막','Glass Desert','玻璃砂漠'],duskmire:['황혼늪','Duskmire','薄暮の沼'],frostpass:['흰안개고개','Frostpass','白霧峠'],eclipsevault:['월식지하궁','Eclipse Vault','月蝕の地下宮'],ashpeak:['잿불화산','Ashpeak','燠火の火山'],
  'verdant-quay':['푸른돛항','Verdant Quay','緑帆港'],'loom-village':['물결베틀마을','Loomwater','波織りの里'],rainvault:['비그늘수림','Rainvault','雨蔭の森'],'root-cavern':['뿌리울림동굴','Rootsong Cavern','根響き洞'],'fern-sanctum':['고사리옛터','Fern Sanctum','羊歯の古跡'],'saffron-port':['호박빛항','Amberwake Port','琥珀の港'],redweave:['붉은직물도시','Redweave','赤織の街'],windstep:['초원바람길','Windstep','草風の道'],saltglass:['소금거울분지','Saltglass Basin','塩鏡盆地'],'cinder-stair':['잿돌계단산','Cinderstair','灰段の山'],
  'echo-isle':['메아리섬','Echo Isle','こだまの小島'],'drift-isle':['떠도는섬','Drift Isle','漂泊の浮島'],'storm-isle':['천둥종섬','Stormbell Isle','雷鐘の島'],'mirror-isle':['거울물결섬','Mirrorwake Isle','鏡波の島'],
  herb:['회복 약초','Healing Herb','回復薬草'],wood:['좋은 목재','Timber','良質な木材'],ore:['철광석','Iron Ore','鉄鉱石'],crystal:['마정석','Mana Crystal','魔晶石'],relic:['고대 유물','Ancient Relic','古代の遺物'],gem:['원석 보석','Rough Gem','原石の宝玉'],ingot:['철 주괴','Iron Ingot','鉄の延べ棒'],spice:['향신료','Spice','香辛料'],silk:['별비단','Starsilk','星絹'],potion:['회복 물약','Recovery Potion','回復薬'],bread:['빵','Bread','パン'],jerky:['육포','Jerky','干し肉'],linen:['리넨 천','Linen','麻布'],flour:['밀가루','Flour','穀粉'],'dried-fish':['보존 생선','Preserved Fish','魚の保存食'],'repair-plank':['선체 보수판','Hull Repair Plank','船体の補修板'],'pottery-vessel':['도기 용기','Pottery Vessel','陶器の容器'],'traveler-cloak':['여행자의 외투','Traveler’s Cloak','旅人の外套'],
};
function q(id:string,title:Text,purpose:Text,giver:string,destination:string,item:string,count:number,gold:number,xp:number,options:Partial<Quest>={}):Quest{
  const to=N[destination],at=N[giver],goods=N[item];if(!to||!at||!goods)throw new Error(`Unknown second-content term:${id}`);
  const descriptions=l(options.chapter?[`${purpose[0]} ${to[0]} 현장조사와 ${at[0]}의 대조를 마치고 조사재료 ${goods[0]}×${count}를 전달하자.`,`${purpose[1]} Complete the field investigation at ${to[1]} and comparison in ${at[1]}, then deliver ${goods[1]} ×${count} as supplies.`,`${purpose[2]} ${to[2]}の現地調査と${at[2]}の照合を終え、調査資材${goods[2]}×${count}を届けよう。`]:[`${purpose[0]} ${to[0]}을 살피고 ${goods[0]} ${count}개를 준비해 ${at[0]}의 의뢰인에게 돌아오자.`,`${purpose[1]} Visit ${to[1]}, prepare ${goods[1]} ×${count}, and return to the giver in ${at[1]}.`,`${purpose[2]} ${to[2]}を訪ね、${goods[2]}×${count}を用意して${at[2]}の依頼人へ戻ろう。`]);
  const dialogue=l(options.chapter?purpose:[`${purpose[0]} 위험을 살피며 다녀와 주겠나? ${goods[0]} ${count}개를 준비한 뒤 여기서 다시 만나세.`,`${purpose[1]} Will you make the journey carefully? Prepare ${goods[1]} ×${count}, then meet me here again.`,`${purpose[2]} 危険を確かめながら行ってもらえますか。${goods[2]}×${count}を用意したら、ここでまた会いましょう。`]);
  return{id,names:l(title),name:title[2],descriptions,description:descriptions.ja,giver,destination,item,count,gold,xp,dialogue,...options};
}

function isleMain(chapter:number,giver:string,destination:string,item:string,count:number,gold:number,xp:number,issuer:string):Quest{
  const story=fantasyIsleChapter(chapter),text=(value:L):Text=>[value.ko,value.en,value.ja];
  return q(`main-night-${String(chapter).padStart(2,'0')}`,text(story.title),text(story.dialogue),giver,destination,item,count,gold,xp,{chapter,issuer,...(chapter>1?{requiresCompleted:[`main-night-${String(chapter-1).padStart(2,'0')}`]}:{})});
}
export const FANTASY_MAIN_QUESTS:Quest[]=[
  isleMain(1,"hearth","oldwatch","relic",1,65,55,"hearth-mira"),
  isleMain(2,"suncourt","starspire","crystal",2,75,65,"suncourt-livia"),
  isleMain(3,"mooncity","eclipsevault","relic",2,90,70,"eris"),
  isleMain(4,"dawnport","glassdesert","crystal",2,100,80,"dawnport-ren"),
  isleMain(5,"verdant-quay","rainvault","wood",3,110,85,"verdant-quay-bryn"),
  isleMain(6,"loom-village","fern-sanctum","relic",2,125,95,"loom-village-ilya"),
  isleMain(7,"redweave","cinder-stair","ore",3,135,105,"redweave-ferro"),
  isleMain(8,"saffron-port","saltglass","crystal",3,145,110,"saffron-port-safi"),
  isleMain(9,"tidehaven","storm-isle","ingot",2,160,120,"tidehaven-mael"),
  isleMain(10,"starspire","drift-isle","crystal",3,175,125,"starspire-lyra"),
  isleMain(11,"verdant-quay","mirror-isle","relic",3,190,135,"verdant-quay-eva"),
  isleMain(12,"hearth","mooncity","relic",3,220,150,"hearth-mira"),
  ...FANTASY_SETTLEMENT_MAIN_QUESTS,
];

export interface FantasyMainReveal {questId:string;id:string;topic:string;text:L;termIds:string[];supersedes?:string[]}
const reveal=(chapter:number):FantasyMainReveal=>({questId:`main-night-${String(chapter).padStart(2,'0')}`,id:`night-evidence-${String(chapter).padStart(2,'0')}`,topic:'passage-beyond-dawn',text:fantasyIsleRevelation(chapter),termIds:fantasyIsleChapter(chapter).termIds,...(chapter===11?{supersedes:['mirrorwake-mystery']}:{})});
export const FANTASY_MAIN_REVEALS:FantasyMainReveal[]=[
  ...Array.from({length:12},(_,index)=>reveal(index+1)),
  ...FANTASY_SETTLEMENT_MAIN_REVEALS,
];
export function fantasyStoryReveals(completedQuestIds:readonly string[],locale:'ko'|'en'|'ja',endingComplete=false):string[]{const completed=new Set(completedQuestIds);return FANTASY_MAIN_REVEALS.filter(fact=>completed.has(fact.questId)&&(fact.questId!=='main-night-18'||endingComplete)).map(fact=>fact.text[locale]);}

const DELIVERY_SIDES:Quest[]=[
  q('side-hearth-bridge',['들녘 다리의 새 받침','New Props for the Field Bridge','野の橋の新しい支え'],['작은 다리의 받침을 손볼 재료가 필요하다.','We need material for the small bridge supports.','小橋の支えを直す材料が要る。'],'hearth','greenwood','wood',3,48,22),
  q('side-hearth-shelter',['겨울 쉼터의 빵','Bread for the Winter Shelter','冬の休み場のパン'],['추운 길을 건너 쉼터에 도착할 사람들과 나눌 빵을 준비한다.','We are preparing bread for travelers arriving from the cold roads.','寒い道を来る旅人と分けるパンを用意する。'],'hearth','sunmeadow','bread',3,45,20,{seasons:['winter']}),
  q('side-court-lamps',['저녁 낭독의 준비','Preparations for Evening Reading','夕べの朗読の支度'],['낭독회 도우미들이 쓸 물약과 탑의 운영 기록을 확인하려 한다.','We need supplies for reading-room helpers and the tower’s operating notes.','朗読会の手伝いの薬と塔の運用記録を確かめたい。'],'suncourt','starspire','potion',2,70,28),
  q('side-court-grain',['가을 공동 식사의 가루','Flour for the Autumn Table','秋の共同食卓の粉'],['가을 장터가 끝난 뒤 나눌 식사 재료를 마련하려 한다.','We are preparing a shared meal after the autumn market.','秋の市の終わりに分ける食事の材料を用意したい。'],'suncourt','sunmeadow','flour',3,52,22,{seasons:['autumn']}),
  q('side-emberhall-ore',['공방의 작은 보충','A Small Workshop Restock','工房の小さな補充'],['수리 주문이 밀려 기본 광석을 보충해야 한다.','Repair orders have used up our basic ore stock.','修理注文が重なり、基本の鉱石を補充したい。'],'emberhall','ironridge','ore',4,65,26),
  q('side-emberhall-props',['광산길의 경고 받침','Warning Props on the Mine Road','鉱山道の警告支柱'],['위험한 길목의 표시를 다시 고정할 나무가 필요하다.','We need timber to secure warning marks along the mine road.','危ない道の警告標を固定する木が要る。'],'emberhall','deepcave','wood',4,72,28),
  q('side-tidehaven-floats',['물표의 나무 손잡이','Wooden Handles for the Markers','水標の木の柄'],['물표의 손잡이를 고치고 섬의 어부들 상황도 확인하려 한다.','We need marker handles repaired and news from the island fishers.','水標の柄を直し、島の漁師の様子も確かめたい。'],'tidehaven','echo-isle','wood',3,62,25),
  q('side-tidehaven-preserved',['젖지 않은 항해 식량','Dry Supplies for the Passage','濡れない航海食'],['다음 배편의 식량을 보존식으로 나누어 준비한다.','We are dividing preserved food for the next passage.','次の便の食料を保存食で分けて用意する。'],'tidehaven','reedfen','dried-fish',3,66,26),
  q('side-dawnport-cloth',['동항의 포장 안감','Linings for the Eastern Port','東港の包み裏布'],['먼 배편의 물건을 감쌀 천을 마련하려 한다.','We need cloth to wrap goods for a long passage.','遠い便の品を包む布を用意したい。'],'dawnport','mooncity','linen',3,68,27),
  q('side-dawnport-spice',['사막길의 향신료 표본','Spice Samples from the Desert Road','砂漠道の香辛料見本'],['상인들이 향의 차이를 비교할 작은 표본을 요청했다.','Traders have requested small samples to compare aromas.','商人が香りを比べる小見本を求めている。'],'dawnport','glassdesert','spice',3,72,28),
  q('side-mooncity-ink',['기록실의 잎 표본','Leaf Samples for the Archive','記録室の葉見本'],['서고의 표본을 새 잎과 대조할 준비다.','We are comparing the archive’s samples with fresh leaves.','書庫の標本を新しい葉と照合する支度だ。'],'mooncity','duskmire','herb',3,64,26),
  q('side-mooncity-bindings',['낡은 사본의 묶음끈','Bindings for Old Copies','古写本の綴じ紐'],['지하궁 조사 사본의 묶음끈을 바꿔야 한다.','The vault survey copies need replacement bindings.','地下宮調査の写しの綴じ紐を替えたい。'],'mooncity','eclipsevault','silk',2,82,30),
  q('side-mooncity-cold',['찬 고개를 위한 꾸러미','A Bundle for the Cold Pass','寒い峠の包み'],['겨울 고개를 오갈 기록 운반인에게 보존식이 필요하다.','Record couriers crossing the winter pass need preserved supplies.','冬の峠を通る記録運びに保存食が要る。'],'mooncity','frostpass','jerky',3,78,30,{seasons:['winter']}),
  q('side-starspire-lenses',['탑의 빛 대조 견본','Light Samples for the Tower','塔の光の対照見本'],['렌즈 연구에 쓸 원석을 관찰 기록과 함께 준비하려 한다.','We need rough gems and observation notes for lens study.','レンズ研究の原石と観察記録を用意したい。'],'starspire','deepcave','gem',2,86,32),
  q('side-starspire-lights',['떠도는섬의 계류등','Mooring Lights of Drift Isle','漂う島の係留灯'],['계류등의 작은 촉매를 보충하고 점검 기록을 맞추려 한다.','We need small catalysts and matching inspection notes for the mooring lights.','係留灯の小触媒を補充し、点検記録を合わせたい。'],'starspire','drift-isle','crystal',3,96,35),
  q('side-verdant-water',['겨울 전 수로의 약초','Channel Herbs before Winter','冬前の水路の薬草'],['추위가 오기 전에 수로 일꾼들의 쉼터에 약초를 비축한다.','We are stocking the channel workers’ shelter with herbs before the cold arrives.','寒さの前に水路の働き手の休み場へ薬草を蓄える。'],'verdant-quay','rainvault','herb',4,62,25,{seasons:['autumn']}),
  q('side-verdant-planks',['젖은 부두의 수선판','Repair Boards for the Wet Quay','濡れた波止場の補修板'],['젖은 부두의 이음을 손볼 보수판을 준비하려 한다.','We need repair boards for the wet quay’s joints.','濡れた波止場の継ぎ目を直す板を用意したい。'],'verdant-quay','root-cavern','repair-plank',2,90,32),
  q('side-loom-linen',['공동 베틀의 새 천','New Cloth for the Shared Loom','共同の機の新しい布'],['항구에서 본 습기에 맞춰 공동 작업장의 천을 준비한다.','We are preparing shared workhouse cloth for the harbor’s damp air.','港で見た湿気に合わせ、共同作業場の布を用意する。'],'loom-village','verdant-quay','linen',3,65,26),
  q('side-loom-ferns',['고사리 곁의 표본함','The Sample Box beside the Ferns','羊歯の傍の標本箱'],['오래된 물길과 주변 약초를 비교할 자료가 필요하다.','We need material to compare old watercourses with nearby herbs.','古水路と周囲の薬草を比べる資料が要る。'],'loom-village','fern-sanctum','herb',4,75,29),
  q('side-amber-vessels',['여름 소금길의 물 나눔','Water on the Summer Salt Road','夏の塩道の水分け'],['더운 상단길에서 물을 나눌 그릇을 더 마련하려 한다.','The caravan needs more water vessels for the hot road.','暑い隊商路で水を分ける器を増やしたいという。'],'saffron-port','saltglass','pottery-vessel',2,88,31,{seasons:['summer']}),
  q('side-amber-repair',['먼 항구의 판재 교환','Plank Exchange for the Distant Port','遠港の板交換'],['거친 바닷길을 앞두고 수리 판재를 보충한다.','We are restocking repair planks before a rough passage.','荒い航路の前に修理板を補充する。'],'saffron-port','cinder-stair','repair-plank',2,94,33),
  q('side-redweave-coats',['초원길의 여벌 외투','Spare Coats for Windstep','草風の道の替え外套'],['고원 일꾼들이 추운 저녁에 쓸 외투를 요청했다.','Upland workers have requested coats for cold evenings.','高原の働き手が寒い夕べの外套を求めている。'],'redweave','windstep','traveler-cloak',2,108,35),
  q('side-redweave-clasps',['튼튼한 끈 고리','Strong Strap Rings','丈夫な紐の輪'],['새 상단의 끈 고리를 만들 금속을 마련한다.','We need metal for the new caravan’s strap rings.','新しい隊商の紐輪を作る金属を用意する。'],'redweave','cinder-stair','ingot',3,88,31),
  q('side-court-archives',['옛 성의 서가 표본','Old Castle Archive Samples','古城の書架見本'],['보관함 모양을 비교할 유물 자료를 정리하고 있다.','We are arranging relic samples to compare archive fittings.','保管箱の形を比べる遺物資料を整理している。'],'suncourt','oldwatch','relic',2,85,32),
];
function group(id:string,title:Text,purpose:Text,giver:string,destination:string,monster:string,count:number,gold:number):Quest{
  const quest=q(id,title,purpose,giver,destination,'ore',1,gold,55,{group:true,objective:{type:'hunt',monster,count}});
  quest.descriptions=l([`${purpose[0]} ${N[destination][0]}에서 공동 토벌 목표 ${count}마리에 기여하고 ${N[giver][0]}의 의뢰인에게 보고하자.`,`${purpose[1]} Contribute to the shared hunt target of ${count} at ${N[destination][1]}, then report to the giver in ${N[giver][1]}.`,`${purpose[2]} ${N[destination][2]}で共同討伐目標${count}体に協力し、${N[giver][2]}の依頼人へ報告しよう。`]);
  quest.description=quest.descriptions.ja;quest.dialogue=l([`${purpose[0]} 함께 대응할 동료들과 위험을 확인하고 돌아와 주겠나?`,`${purpose[1]} Will you assess the danger with companions and return to report?`,`${purpose[2]} 仲間と危険を確かめ、戻って報告してもらえますか。`]);return quest;
}
export const FANTASY_GROUP_QUESTS:Quest[]=[
  group('group-reed-slimes',['갈대 물길의 슬라임 무리','Slimes in the Reedway','葦水路のスライム群'],['물길을 막는 갈대슬라임 무리에 함께 대응할 사람이 필요하다.','We need a team to deal with reed slimes blocking the channel.','水路を塞ぐ葦スライム群へ協力して対処したい。'],'tidehaven','reedfen','monster-reed-slime',4,150),
  group('group-goblin-raiders',['숲길 습격대 경계','Raiders on the Forest Road','森道の襲撃隊警戒'],['길을 습격하는 고블린 무장대가 확인되어 길드가 공동 대응을 요청했다.','The guild requests a joint response to an identified goblin raiding band.','道を襲うゴブリン武装隊を確認し、ギルドが共同対応を求める。'],'hearth','greenwood','monster-goblin-raider',4,170),
  group('group-orc-raiders',['초원 상단의 위협','Threat to the Grassland Caravan','草原隊商への脅威'],['상단을 습격하는 오크 무장대에 공동 대응하려 한다.','We are organizing a joint response to an orc band raiding caravans.','隊商を襲うオーク武装隊へ共同対応をまとめたい。'],'redweave','windstep','monster-orc-raider',3,200),
  group('group-stone-trolls',['산길의 바위트롤','Stone Trolls on the Mountain Road','山道の岩トロル'],['광산길을 위협하는 바위트롤을 상대할 숙련된 동료가 필요하다.','Experienced companions are needed against stone trolls threatening the mine road.','鉱山道を脅かす岩トロルに対し熟練した仲間が要る。'],'emberhall','ironridge','monster-stone-troll',2,230),
  group('group-cliff-wyvern',['계류길의 와이번','Wyvern at the Mooring Route','係留路のワイバーン'],['계류길 주변에서 확인된 절벽와이번에 신중히 대응하려 한다.','We need a cautious response to a cliff wyvern near the mooring route.','係留路付近の崖ワイバーンへ慎重に対処したい。'],'starspire','drift-isle','monster-cliff-wyvern',1,270),
  group('group-elder-dragon',['화산길의 고룡 경보','Elder Dragon Warning on the Volcanic Road','火山道の古竜警報'],['화산길에 나타난 적대적인 고룡으로 길이 위험하다. 충분히 준비된 동료들의 공동 대응만 받는다.','A hostile elder dragon threatens the volcanic road. Only a well-prepared party should respond.','火山道を敵対的な古竜が脅かす。十分に備えた仲間の共同対応を求める。'],'suncourt','ashpeak','monster-elder-dragon',1,340),
];
/** Includes the six group quests; append this array once, rather than appending both exports. */
export const FANTASY_SIDE_QUESTS:Quest[]=[...DELIVERY_SIDES,...FANTASY_GROUP_QUESTS,...FANTASY_SETTLEMENT_SIDE_QUESTS];
interface Subject{id:string;names:L;theme:Text;contexts:[FantasyCheckContext,FantasyCheckContext];item:string}
const RACE_SUBJECTS:Subject[]=[
  {
    "id": "human",
    "names": {
      "ko": "인간",
      "en": "Human",
      "ja": "人間"
    },
    "theme": [
      "먼 길의 공동 짐",
      "Shared Road Loads",
      "遠路の共同荷物"
    ],
    "contexts": [
      "keen-senses",
      "heavy-lifting"
    ],
    "item": "bread"
  },
  {
    "id": "elf",
    "names": {
      "ko": "숲 엘프",
      "en": "Wood Elf",
      "ja": "森エルフ"
    },
    "theme": [
      "나뭇가지의 옛 표식",
      "Old Canopy Marks",
      "梢の古い目印"
    ],
    "contexts": [
      "trap",
      "heavy-lifting"
    ],
    "item": "herb"
  },
  {
    "id": "dwarf",
    "names": {
      "ko": "산 드워프",
      "en": "Mountain Dwarf",
      "ja": "山ドワーフ"
    },
    "theme": [
      "갱도의 임시 지주",
      "Temporary Mine Props",
      "坑道の仮支柱"
    ],
    "contexts": [
      "narrow-space",
      "trap"
    ],
    "item": "ore"
  },
  {
    "id": "orc",
    "names": {
      "ko": "오크",
      "en": "Orc",
      "ja": "オーク"
    },
    "theme": [
      "야영터의 무거운 받침",
      "Heavy Camp Supports",
      "野営の重い台"
    ],
    "contexts": [
      "heavy-lifting",
      "narrow-space"
    ],
    "item": "ingot"
  },
  {
    "id": "halfling",
    "names": {
      "ko": "하플링",
      "en": "Halfling",
      "ja": "小人族"
    },
    "theme": [
      "마루 아래 작은 상자",
      "The Box beneath the Floor",
      "床下の小箱"
    ],
    "contexts": [
      "narrow-space",
      "heavy-lifting"
    ],
    "item": "wood"
  },
  {
    "id": "foxkin",
    "names": {
      "ko": "여우 수인",
      "en": "Foxfolk",
      "ja": "狐の獣人"
    },
    "theme": [
      "두 향기 주머니",
      "Two Scent Pouches",
      "二つの香り袋"
    ],
    "contexts": [
      "trap",
      "heavy-lifting"
    ],
    "item": "jerky"
  },
  {
    "id": "tideborn",
    "names": {
      "ko": "조수족",
      "en": "Tideborn",
      "ja": "潮の民"
    },
    "theme": [
      "물가의 얽힌 밧줄",
      "Tangled Shore Ropes",
      "水際の絡む綱"
    ],
    "contexts": [
      "deep-water",
      "heat"
    ],
    "item": "fish"
  },
  {
    "id": "dragonblood",
    "names": {
      "ko": "화염 용혈족",
      "en": "Ember Dragonkin",
      "ja": "炎の竜血族"
    },
    "theme": [
      "열을 품은 돌덮개",
      "The Warm Stone Cover",
      "熱い石蓋"
    ],
    "contexts": [
      "heat",
      "narrow-space"
    ],
    "item": "crystal"
  },
  {
    "id": "starfairy",
    "names": {
      "ko": "별빛 요정",
      "en": "Starlight Fairy",
      "ja": "星灯りの妖精"
    },
    "theme": [
      "높은 작은 방울",
      "The High Tiny Bell",
      "高い小鈴"
    ],
    "contexts": [
      "narrow-space",
      "heavy-lifting"
    ],
    "item": "herb"
  },
  {
    "id": "dryad",
    "names": {
      "ko": "드라이어드",
      "en": "Dryad",
      "ja": "樹花の精"
    },
    "theme": [
      "뿌리 곁의 물표",
      "Watermarks by the Roots",
      "根元の水標"
    ],
    "contexts": [
      "keen-senses",
      "heat"
    ],
    "item": "crystal"
  },
  {
    "id": "stoneborn",
    "names": {
      "ko": "바위 골렘",
      "en": "Stone Golem",
      "ja": "石生まれ"
    },
    "theme": [
      "무거운 관측대",
      "The Heavy Observation Stand",
      "重い観測台"
    ],
    "contexts": [
      "heavy-lifting",
      "deep-water"
    ],
    "item": "ore"
  },
  {
    "id": "moonshadow",
    "names": {
      "ko": "월영족",
      "en": "Moonshadow",
      "ja": "月影族"
    },
    "theme": [
      "희미한 글씨 표찰",
      "Faint Lettered Tags",
      "薄い文字札"
    ],
    "contexts": [
      "trap",
      "heavy-lifting"
    ],
    "item": "crystal"
  },
  {
    "id": "wolfkin",
    "names": {
      "ko": "늑대 수인",
      "en": "Wolffolk",
      "ja": "狼の獣人"
    },
    "theme": [
      "바람에 바뀐 냄새",
      "Scents Changed by Wind",
      "風に変わる匂い"
    ],
    "contexts": [
      "keen-senses",
      "heat"
    ],
    "item": "jerky"
  },
  {
    "id": "catkin",
    "names": {
      "ko": "고양이 수인",
      "en": "Catfolk",
      "ja": "猫の獣人"
    },
    "theme": [
      "좁은 지붕 발판",
      "The Narrow Roof Ledge",
      "狭い屋根の足場"
    ],
    "contexts": [
      "trap",
      "heavy-lifting"
    ],
    "item": "jerky"
  },
  {
    "id": "rabbitkin",
    "names": {
      "ko": "토끼 수인",
      "en": "Rabbitfolk",
      "ja": "兎の獣人"
    },
    "theme": [
      "낮은 울타리 통로",
      "The Low Fence Opening",
      "低い柵の抜け口"
    ],
    "contexts": [
      "narrow-space",
      "heavy-lifting"
    ],
    "item": "jerky"
  },
  {
    "id": "bearkin",
    "names": {
      "ko": "곰 수인",
      "en": "Bearfolk",
      "ja": "熊の獣人"
    },
    "theme": [
      "겨울 준비의 큰 자루",
      "Large Winter Sacks",
      "冬支度の大袋"
    ],
    "contexts": [
      "heavy-lifting",
      "narrow-space"
    ],
    "item": "jerky"
  },
  {
    "id": "birdkin",
    "names": {
      "ko": "조인",
      "en": "Birdfolk",
      "ja": "鳥の獣人"
    },
    "theme": [
      "높은 돛의 표식",
      "Marks on a High Sail",
      "高い帆の印"
    ],
    "contexts": [
      "high-place",
      "deep-water"
    ],
    "item": "jerky"
  },
  {
    "id": "lizardkin",
    "names": {
      "ko": "도마뱀 수인",
      "en": "Lizardfolk",
      "ja": "蜥蜴の獣人"
    },
    "theme": [
      "볕 드는 돌틀",
      "The Sunlit Stone Frame",
      "日向の石枠"
    ],
    "contexts": [
      "heat",
      "cold"
    ],
    "item": "jerky"
  },
  {
    "id": "high-elf",
    "names": {
      "ko": "하이 엘프",
      "en": "High Elf",
      "ja": "ハイエルフ"
    },
    "theme": [
      "가는 마나 문양",
      "Fine Mana Patterns",
      "細い魔力模様"
    ],
    "contexts": [
      "trap",
      "heavy-lifting"
    ],
    "item": "herb"
  },
  {
    "id": "dark-elf",
    "names": {
      "ko": "다크 엘프",
      "en": "Dark Elf",
      "ja": "ダークエルフ"
    },
    "theme": [
      "어두운 서가의 표식",
      "Marks in a Dim Archive",
      "暗い書庫の印"
    ],
    "contexts": [
      "trap",
      "heavy-lifting"
    ],
    "item": "herb"
  },
  {
    "id": "snow-elf",
    "names": {
      "ko": "설원 엘프",
      "en": "Snow Elf",
      "ja": "雪原エルフ"
    },
    "theme": [
      "얼어붙은 건널판",
      "The Frozen Crossing Board",
      "凍える渡し板"
    ],
    "contexts": [
      "cold",
      "heat"
    ],
    "item": "herb"
  },
  {
    "id": "hill-dwarf",
    "names": {
      "ko": "구릉 드워프",
      "en": "Hill Dwarf",
      "ja": "丘ドワーフ"
    },
    "theme": [
      "비탈의 임시 나무틀",
      "The Slope’s Wooden Frame",
      "斜面の仮木枠"
    ],
    "contexts": [
      "narrow-space",
      "trap"
    ],
    "item": "ore"
  },
  {
    "id": "deep-dwarf",
    "names": {
      "ko": "지하 드워프",
      "en": "Deep Dwarf",
      "ja": "地底ドワーフ"
    },
    "theme": [
      "깊은 갱도의 작은 소리",
      "Faint Sounds in the Deep Mine",
      "奥坑の小音"
    ],
    "contexts": [
      "narrow-space",
      "heavy-lifting"
    ],
    "item": "ore"
  },
  {
    "id": "vampire-night",
    "names": {
      "ko": "야혈 뱀파이어",
      "en": "Nightblood Vampire",
      "ja": "夜血の吸血族"
    },
    "theme": [
      "그늘의 천 고정끈",
      "Cloth Ties in the Shade",
      "日陰の布留め"
    ],
    "contexts": [
      "trap",
      "heavy-lifting"
    ],
    "item": "silk"
  },
  {
    "id": "vampire-crimson",
    "names": {
      "ko": "홍혈 뱀파이어",
      "en": "Crimsonblood Vampire",
      "ja": "紅血の吸血族"
    },
    "theme": [
      "짙은 빛의 무거운 상자",
      "The Heavy Dark-Colored Crate",
      "重い濃色の箱"
    ],
    "contexts": [
      "keen-senses",
      "heat"
    ],
    "item": "silk"
  },
  {
    "id": "vampire-moon",
    "names": {
      "ko": "월광 뱀파이어",
      "en": "Moonlit Vampire",
      "ja": "月光の吸血族"
    },
    "theme": [
      "달빛 대조판",
      "The Moonlight Comparison Board",
      "月灯りの照合板"
    ],
    "contexts": [
      "trap",
      "heavy-lifting"
    ],
    "item": "silk"
  },
  {
    "id": "frost-dragonkin",
    "names": {
      "ko": "서리 용혈족",
      "en": "Frost Dragonkin",
      "ja": "霜の竜血族"
    },
    "theme": [
      "서리 낀 관측주",
      "The Frosted Observation Post",
      "霜の観測柱"
    ],
    "contexts": [
      "cold",
      "narrow-space"
    ],
    "item": "crystal"
  },
  {
    "id": "storm-dragonkin",
    "names": {
      "ko": "폭풍 용혈족",
      "en": "Storm Dragonkin",
      "ja": "嵐の竜血族"
    },
    "theme": [
      "바람 소리의 지주",
      "The Wind-Sounding Prop",
      "風鳴りの支柱"
    ],
    "contexts": [
      "heavy-lifting",
      "narrow-space"
    ],
    "item": "crystal"
  },
  {
    "id": "fire-spirit",
    "names": {
      "ko": "불꽃 정령",
      "en": "Flame Spirit",
      "ja": "火の精"
    },
    "theme": [
      "화덕 곁의 덮개",
      "The Cover beside the Furnace",
      "炉脇の覆い"
    ],
    "contexts": [
      "heat",
      "cold"
    ],
    "item": "crystal"
  },
  {
    "id": "water-spirit",
    "names": {
      "ko": "물 정령",
      "en": "Water Spirit",
      "ja": "水の精"
    },
    "theme": [
      "수조의 연결부",
      "The Water Tank Join",
      "水槽の継ぎ目"
    ],
    "contexts": [
      "deep-water",
      "heat"
    ],
    "item": "crystal"
  },
  {
    "id": "flower-fairy",
    "names": {
      "ko": "꽃 요정",
      "en": "Flower Fairy",
      "ja": "花の妖精"
    },
    "theme": [
      "화분의 작은 선반",
      "The Flowerpot’s Small Shelf",
      "花鉢の小さな棚"
    ],
    "contexts": [
      "narrow-space",
      "heavy-lifting"
    ],
    "item": "herb"
  },
  {
    "id": "clockwork-golem",
    "names": {
      "ko": "기계 골렘",
      "en": "Clockwork Golem",
      "ja": "機巧ゴーレム"
    },
    "theme": [
      "규칙적인 잠금쇠",
      "The Rhythmic Catch",
      "定周期の留め具"
    ],
    "contexts": [
      "heavy-lifting",
      "deep-water"
    ],
    "item": "ore"
  },
  {
    "id": "gnome",
    "names": {
      "ko": "놈",
      "en": "Gnome",
      "ja": "ノーム"
    },
    "theme": [
      "작은 기계의 톱니 흔적",
      "Gear Traces in a Small Device",
      "小機の歯車跡"
    ],
    "contexts": [
      "narrow-space",
      "heavy-lifting"
    ],
    "item": "wood"
  },
  {
    "id": "goblin",
    "names": {
      "ko": "고블린",
      "en": "Goblin",
      "ja": "ゴブリン"
    },
    "theme": [
      "잔해 속 쓸 만한 부품",
      "Useful Parts in the Debris",
      "瓦礫の使える部品"
    ],
    "contexts": [
      "narrow-space",
      "heavy-lifting"
    ],
    "item": "ingot"
  },
  {
    "id": "hobgoblin",
    "names": {
      "ko": "홉고블린",
      "en": "Hobgoblin",
      "ja": "ホブゴブリン"
    },
    "theme": [
      "고르지 않은 짐의 줄",
      "The Uneven Load Line",
      "揃わない荷の列"
    ],
    "contexts": [
      "heavy-lifting",
      "trap"
    ],
    "item": "ingot"
  },
  {
    "id": "coralborn",
    "names": {
      "ko": "산호족",
      "en": "Coralborn",
      "ja": "珊瑚の民"
    },
    "theme": [
      "산호 해안의 물표",
      "The Coral-Shore Marker",
      "珊瑚岸の水標"
    ],
    "contexts": [
      "deep-water",
      "heat"
    ],
    "item": "fish"
  },
  {
    "id": "celestial",
    "names": {
      "ko": "천상족",
      "en": "Celestial",
      "ja": "天上の民"
    },
    "theme": [
      "순례 선반의 등불",
      "The Pilgrim Shelf’s Lamp",
      "巡礼棚の灯"
    ],
    "contexts": [
      "high-place",
      "deep-water"
    ],
    "item": "relic"
  },
  {
    "id": "devilkin",
    "names": {
      "ko": "마족",
      "en": "Devilkin",
      "ja": "魔の民"
    },
    "theme": [
      "사당의 맹세 표찰",
      "Vow Tags at the Shrine",
      "祠の誓約札"
    ],
    "contexts": [
      "heat",
      "cold"
    ],
    "item": "relic"
  },
  {
    "id": "revenant",
    "names": {
      "ko": "망령족",
      "en": "Revenant",
      "ja": "残響の民"
    },
    "theme": [
      "남겨진 길표찰",
      "The Remaining Road Tag",
      "残された道札"
    ],
    "contexts": [
      "cold",
      "heavy-lifting"
    ],
    "item": "relic"
  },
  {
    "id": "demigod",
    "names": {
      "ko": "반신",
      "en": "Demigod",
      "ja": "半神"
    },
    "theme": [
      "신전의 무거운 받침",
      "The Temple’s Heavy Plinth",
      "神殿の重い台座"
    ],
    "contexts": [
      "keen-senses",
      "heat"
    ],
    "item": "potion"
  },
  {
    "id": "true-dragon",
    "names": {
      "ko": "진룡",
      "en": "True Dragon",
      "ja": "真竜"
    },
    "theme": [
      "큰 짐이 지나는 통로",
      "The Passage for Large Loads",
      "大きな荷の通路"
    ],
    "contexts": [
      "heat",
      "narrow-space"
    ],
    "item": "crystal"
  },
  {
    "id": "elder-dragon",
    "names": {
      "ko": "고룡",
      "en": "Elder Dragon",
      "ja": "古竜"
    },
    "theme": [
      "오래된 암석의 구분",
      "Distinguishing Old Stone",
      "古い岩の見分け"
    ],
    "contexts": [
      "heat",
      "narrow-space"
    ],
    "item": "crystal"
  },
  {
    "id": "archangel",
    "names": {
      "ko": "대천사",
      "en": "Archangel",
      "ja": "大天使"
    },
    "theme": [
      "높은 순례 등불",
      "The High Pilgrim Lamp",
      "高い巡礼灯"
    ],
    "contexts": [
      "high-place",
      "deep-water"
    ],
    "item": "relic"
  },
  {
    "id": "archdemon",
    "names": {
      "ko": "상위마족",
      "en": "Archdemon",
      "ja": "上位魔族"
    },
    "theme": [
      "계약 상자의 무게",
      "The Covenant Chest’s Weight",
      "契約箱の重み"
    ],
    "contexts": [
      "heat",
      "narrow-space"
    ],
    "item": "relic"
  },
  {
    "id": "phoenix",
    "names": {
      "ko": "불사조",
      "en": "Phoenix",
      "ja": "不死鳥"
    },
    "theme": [
      "식은 재의 덮개",
      "The Cooled-Ash Cover",
      "冷めた灰の覆い"
    ],
    "contexts": [
      "high-place",
      "cold"
    ],
    "item": "crystal"
  },
  {
    "id": "voidborn",
    "names": {
      "ko": "공허족",
      "en": "Voidborn",
      "ja": "虚空の民"
    },
    "theme": [
      "조용한 기록의 틈",
      "Gaps in the Quiet Record",
      "静かな記録の隙間"
    ],
    "contexts": [
      "narrow-space",
      "heavy-lifting"
    ],
    "item": "relic"
  },
  {
    "id": "deerkin",
    "names": {
      "ko": "사슴수인",
      "en": "Deerkin",
      "ja": "鹿の獣人"
    },
    "theme": [
      "뿔이 지나는 가지 길",
      "The Antler Passage",
      "角の通る枝道"
    ],
    "contexts": [
      "trap",
      "heavy-lifting"
    ],
    "item": "jerky"
  },
  {
    "id": "goatkin",
    "names": {
      "ko": "산양수인",
      "en": "Goatkin",
      "ja": "山羊の獣人"
    },
    "theme": [
      "발굽의 바위턱",
      "The Hoofed Ledge",
      "蹄の岩棚"
    ],
    "contexts": [
      "high-place",
      "deep-water"
    ],
    "item": "jerky"
  },
  {
    "id": "batkin",
    "names": {
      "ko": "박쥐수인",
      "en": "Batkin",
      "ja": "蝙蝠の獣人"
    },
    "theme": [
      "반향이 남는 작은 문",
      "The Small Echoing Door",
      "反響する小戸"
    ],
    "contexts": [
      "trap",
      "deep-water"
    ],
    "item": "jerky"
  },
  {
    "id": "windspirit",
    "names": {
      "ko": "바람정령",
      "en": "Wind Spirit",
      "ja": "風の精霊"
    },
    "theme": [
      "흔들리는 관측천",
      "The Shifting Observation Cloth",
      "揺れる観測布"
    ],
    "contexts": [
      "narrow-space",
      "heavy-lifting"
    ],
    "item": "crystal"
  },
  {
    "id": "frostfairy",
    "names": {
      "ko": "서리요정",
      "en": "Frost Fairy",
      "ja": "霜の妖精"
    },
    "theme": [
      "작고 얼어붙은 손잡이",
      "The Tiny Frozen Handle",
      "小さな凍る取っ手"
    ],
    "contexts": [
      "cold",
      "heavy-lifting"
    ],
    "item": "herb"
  }
];
const FAMILY_SUBJECTS:Subject[]=[
  {
    "id": "human",
    "names": {
      "ko": "인간",
      "en": "Humans",
      "ja": "人間"
    },
    "theme": [
      "함께 맞추는 작업 순서",
      "A Shared Work Order",
      "共に揃える作業順"
    ],
    "contexts": [
      "keen-senses",
      "heavy-lifting"
    ],
    "item": "bread"
  },
  {
    "id": "beastfolk",
    "names": {
      "ko": "수인족",
      "en": "Beastfolk",
      "ja": "獣人"
    },
    "theme": [
      "서로 다른 감각의 길",
      "A Trail of Different Senses",
      "異なる感覚の道"
    ],
    "contexts": [
      "keen-senses",
      "deep-water"
    ],
    "item": "jerky"
  },
  {
    "id": "elf",
    "names": {
      "ko": "엘프",
      "en": "Elves",
      "ja": "エルフ"
    },
    "theme": [
      "여러 숲의 표식 대조",
      "Comparing Forest Marks",
      "様々な森の印の照合"
    ],
    "contexts": [
      "trap",
      "heavy-lifting"
    ],
    "item": "herb"
  },
  {
    "id": "dwarf",
    "names": {
      "ko": "드워프",
      "en": "Dwarves",
      "ja": "ドワーフ"
    },
    "theme": [
      "돌 결의 공동 견본",
      "Shared Stone Samples",
      "石目の共同見本"
    ],
    "contexts": [
      "narrow-space",
      "trap"
    ],
    "item": "ore"
  },
  {
    "id": "vampire",
    "names": {
      "ko": "뱀파이어",
      "en": "Vampires",
      "ja": "吸血族"
    },
    "theme": [
      "그늘진 서가의 순서",
      "The Shaded Shelf Order",
      "日陰の書架の順"
    ],
    "contexts": [
      "keen-senses",
      "heat"
    ],
    "item": "silk"
  },
  {
    "id": "dragonkin",
    "names": {
      "ko": "용혈족",
      "en": "Dragonkin",
      "ja": "竜血族"
    },
    "theme": [
      "열과 찬바람의 받침",
      "Supports in Heat and Cold",
      "熱と冷風の支え"
    ],
    "contexts": [
      "heavy-lifting",
      "narrow-space"
    ],
    "item": "crystal"
  },
  {
    "id": "spirit",
    "names": {
      "ko": "정령",
      "en": "Spirits",
      "ja": "精霊"
    },
    "theme": [
      "자연의 흐름과 기록",
      "Natural Flows and Notes",
      "自然の流れと記録"
    ],
    "contexts": [
      "trap",
      "heavy-lifting"
    ],
    "item": "crystal"
  },
  {
    "id": "fairy",
    "names": {
      "ko": "요정",
      "en": "Fairies",
      "ja": "妖精"
    },
    "theme": [
      "작은 몸의 큰 작업장",
      "A Small Body’s Large Workshop",
      "小さな体の大作業場"
    ],
    "contexts": [
      "narrow-space",
      "heavy-lifting"
    ],
    "item": "herb"
  },
  {
    "id": "golem",
    "names": {
      "ko": "골렘족",
      "en": "Golems",
      "ja": "ゴーレム"
    },
    "theme": [
      "다른 재료의 이음",
      "Joints of Different Materials",
      "異材の継ぎ目"
    ],
    "contexts": [
      "heavy-lifting",
      "deep-water"
    ],
    "item": "ore"
  },
  {
    "id": "smallfolk",
    "names": {
      "ko": "소인족",
      "en": "Smallfolk",
      "ja": "小人"
    },
    "theme": [
      "낮은 작업대의 교환",
      "The Low Workbench Exchange",
      "低い作業台の交換"
    ],
    "contexts": [
      "narrow-space",
      "heavy-lifting"
    ],
    "item": "wood"
  },
  {
    "id": "orcfolk",
    "names": {
      "ko": "오크계",
      "en": "Orc Kindred",
      "ja": "オーク系"
    },
    "theme": [
      "무게를 나누는 동행",
      "Companions Sharing the Weight",
      "重さを分ける道連れ"
    ],
    "contexts": [
      "heavy-lifting",
      "trap"
    ],
    "item": "ingot"
  },
  {
    "id": "seafolk",
    "names": {
      "ko": "해양족",
      "en": "Sea Folk",
      "ja": "海の民"
    },
    "theme": [
      "물길에서 육지로",
      "From Waterway to Land",
      "水路から陸へ"
    ],
    "contexts": [
      "deep-water",
      "heat"
    ],
    "item": "fish"
  },
  {
    "id": "otherworld",
    "names": {
      "ko": "이계족",
      "en": "Otherworld Folk",
      "ja": "異界の民"
    },
    "theme": [
      "서로 다른 맹세의 사본",
      "Copies of Different Vows",
      "異なる誓いの写し"
    ],
    "contexts": [
      "trap",
      "heavy-lifting"
    ],
    "item": "relic"
  },
  {
    "id": "nightfolk",
    "names": {
      "ko": "월영족",
      "en": "Moonshadow Folk",
      "ja": "月影の民"
    },
    "theme": [
      "희미한 빛의 관측표",
      "The Dim-Light Observation Table",
      "薄明の観測表"
    ],
    "contexts": [
      "trap",
      "heavy-lifting"
    ],
    "item": "crystal"
  },
  {
    "id": "divine",
    "names": {
      "ko": "신성계",
      "en": "Divine Kindred",
      "ja": "神性の民"
    },
    "theme": [
      "순례의 작은 받침",
      "Small Supports for Pilgrims",
      "巡礼の小さな支え"
    ],
    "contexts": [
      "keen-senses",
      "heat"
    ],
    "item": "potion"
  }
];
const APPROACHES:Record<FantasyCheckContext,{labels:Text;stat:FantasyStat;success:Text;failure:Text}>={
  'narrow-space':{labels:['좁은 점검구로 안쪽을 살핀다','Inspect inside through the narrow opening','狭い点検口から内を調べる'],stat:'agility',success:['좁은 안쪽의 어긋남을 찾아 바로잡았다.','The fault inside the narrow space was found and corrected.','狭い内側のずれを見つけ直した。'],failure:['좁은 안쪽에 손이 닿지 않아 도구를 더 준비했다.','The interior was out of reach, so more tools were prepared.','狭い奥へ届かず、道具を更に用意した。']},
  trap:{labels:['걸리는 장치와 줄의 순서를 읽는다','Read the order of catches and cords','掛かる仕掛けと紐の順を読む'],stat:'intelligence',success:['걸림의 순서를 읽어 장치를 안전하게 풀었다.','The catch sequence was understood and the device released safely.','掛かる順を読み、仕掛けを安全に外した。'],failure:['움직임을 확신하지 못해 주변을 표시하고 담당자를 기다렸다.','The motion remained uncertain; the area was marked while awaiting help.','動きを確信できず、周囲を印して担当者を待った。']},
  'deep-water':{labels:['깊은 물 쪽의 받침을 확인한다','Inspect the support in deeper water','深い水側の支えを確かめる'],stat:'vitality',success:['물속의 연결부를 확인해 받침을 안정시켰다.','The submerged join was checked and its support steadied.','水中の継ぎ目を確かめ支えを安定させた。'],failure:['물살이 바뀌어 물러난 뒤 다른 방법을 구했다.','The current changed; you withdrew and sought another method.','流れが変わり、退いて別の方法を探した。']},
  'high-place':{labels:['높은 발판에서 연결부를 살핀다','Inspect the join from a high ledge','高い足場から継ぎ目を見る'],stat:'agility',success:['높은 연결부의 상태를 확인하고 고정했다.','The high join was inspected and secured.','高い継ぎ目を確かめ固定した。'],failure:['발판이 흔들려 내려온 뒤 긴 도구를 빌렸다.','The ledge shook; you climbed down and borrowed a longer tool.','足場が揺れ、下りて長い道具を借りた。']},
  heat:{labels:['열원 곁에서 덮개와 간격을 고른다','Set the cover and spacing beside the heat','熱源の傍で覆いと間隔を揃える'],stat:'vitality',success:['열이 몰리던 간격을 고르게 정리했다.','The spacing was adjusted to stop heat gathering in one place.','熱の集中する間隔を均等に整えた。'],failure:['열이 예상보다 강해 식힌 뒤 다시 점검하기로 했다.','The heat was stronger than expected; inspection waited for cooling.','熱が予想より強く、冷めてから再点検することにした。']},
  cold:{labels:['찬바람 속에서도 매듭과 표식을 정돈한다','Order knots and marks in the cold wind','冷風の中でも結び目と印を整える'],stat:'vitality',success:['굳은 끈을 풀어 찬바람에도 버티게 다시 고정했다.','Stiff cords were loosened and reset to hold against the cold wind.','固い紐を解き、冷風にも耐えるよう留め直した。'],failure:['손과 도구가 굳어 따뜻한 자리에서 준비를 다시 했다.','Hands and tools stiffened; preparations resumed in a warmer place.','手と道具が固まり、暖かい所で支度し直した。']},
  'heavy-lifting':{labels:['무게를 나누어 받침을 세운다','Distribute the weight and set a support','重さを分けて支えを立てる'],stat:'strength',success:['무게를 나누어 흔들리던 물건을 안전하게 놓았다.','The weight was shared and the unstable object set down safely.','重さを分け、揺れる物を安全に据えた。'],failure:['무게가 한쪽에 쏠려 나누어 옮길 사람을 더 불렀다.','The load shifted to one side; more help was called to divide it.','重さが片寄り、分けて運ぶ人手を呼んだ。']},
  'keen-senses':{labels:['작은 표식과 소리의 차이를 비교한다','Compare fine marks and sounds','小さな印と音の違いを比べる'],stat:'intelligence',success:['작은 흔적을 대조해 서로 다른 부분을 구분했다.','Fine traces were compared and the different parts distinguished.','小さな跡を照合し、違う部分を見分けた。'],failure:['흔적이 겹쳐 확정을 미루고 관찰 위치만 기록했다.','Overlapping traces prevented certainty; only the observation position was recorded.','跡が重なり、断定せず観察位置だけ記した。']},
};
function subjectEvent(subject:Subject,family:boolean):FantasyEvent{
  const names=l([`${subject.names.ko}의 ${subject.theme[0]}`,`${subject.names.en}: ${subject.theme[1]}`,`${subject.names.ja}と${subject.theme[2]}`]);
  const descriptions=l([`'${subject.theme[0]}'를 둘러싼 작은 문제가 생겼다. ${subject.names.ko}의 체질과 경험에 맞춰 도울 방법을 고르자.`,`A practical problem arises around ${subject.theme[1].toLowerCase()}. Choose a way to help using your ${subject.names.en} traits and experience.`,`「${subject.theme[2]}」をめぐる小さな問題が起きた。${subject.names.ja}の体質と経験に合う手伝い方を選ぼう。`]);
  const choices:FantasyEventChoice[]=subject.contexts.map((context,index)=>{const approach=APPROACHES[context];const successes=l([`${subject.theme[0]}: ${approach.success[0]}`,`${subject.theme[1]}: ${approach.success[1]}`,`${subject.theme[2]}：${approach.success[2]}`]),failures=l([`${subject.theme[0]}: ${approach.failure[0]}`,`${subject.theme[1]}: ${approach.failure[1]}`,`${subject.theme[2]}：${approach.failure[2]}`]);return{id:index?'alternative':'approach',labels:l(approach.labels),label:approach.labels[2],stat:approach.stat,context,dc:index?14:12,successes,success:successes.ja,failures,failure:failures.ja,gold:index?32:25,item:subject.item};});
  const locations=subject.id==='divine'||['demigod','celestial','archangel'].includes(subject.id)?['hearth','suncourt']:['devilkin','archdemon'].includes(subject.id)?['mooncity']:undefined;
  return{id:`second-${family?'family':'racial'}-${subject.id}`,names,name:names.ja,descriptions,description:descriptions.ja,choices,...(family?{families:[subject.id]}:{races:[subject.id]}),...(locations?{locations}:{})};
}
export const FANTASY_SECOND_RACIAL_EVENTS:FantasyEvent[]=RACE_SUBJECTS.map(subject=>subjectEvent(subject,false));
export const FANTASY_SECOND_FAMILY_EVENTS:FantasyEvent[]=FAMILY_SUBJECTS.map(subject=>subjectEvent(subject,true));
