import type { FantasyLocation } from './fantasy.ts';

type Text=[ko:string,en:string,ja:string];
type L=Record<'ko'|'en'|'ja',string>;
export interface FantasyMonster {
  id:string;names:L;name:string;descriptions:L;description:string;tier:1|2|3|4|5|6|7|8;
  dc:number;damage:number;kinds:FantasyLocation['kind'][];minDanger?:number;
  loot:{item:string;weight:number}[];hide?:string;skinCount?:number;meat?:number;
}
const l=([ko,en,ja]:Text):L=>({ko,en,ja});
const materials=(...items:string[])=>items.map((item,index)=>({item,weight:Math.max(1,6-index*2)}));
function m(id:string,title:Text,body:Text,tier:FantasyMonster['tier'],kinds:FantasyLocation['kind'][],loot:string[],extra:Partial<FantasyMonster>={}):FantasyMonster{
  const names=l(title),descriptions=l(body);return{id:`monster-${id}`,names,name:names.ja,descriptions,description:descriptions.ja,tier,dc:[0,8,10,12,14,16,18,20,23][tier],damage:[0,4,7,10,14,18,23,29,36][tier],kinds,minDanger:[0,0,0,1,1,2,3,3,4][tier],loot:materials(...loot),meat:0,...extra};
}

/** Hostile encounter targets, not moral classifications of playable ancestries. */
export const FANTASY_MONSTERS:FantasyMonster[]=[
  m('meadow-slime',['초원슬라임','Meadow Slime','草原スライム'],['젖은 풀밭에 모이는 작은 점액 생물.','A small gelatinous creature gathering in damp grass.','湿った草地に集まる小さな粘体。'],1,['forest','coast'],['herb','wood']),
  m('reed-slime',['갈대슬라임','Reed Slime','葦スライム'],['갈대 물길의 얕은 곳에 뭉쳐 통행을 막는다.','Clusters in shallow reed channels and blocks passage.','葦水路の浅瀬に固まり通行を塞ぐ。'],1,['swamp','coast'],['herb','fish']),
  m('cave-slime',['동굴슬라임','Cave Slime','洞窟スライム'],['축축한 돌틈에 달라붙어 움직이는 점액 생물.','A gelatinous creature moving along wet stone cracks.','湿った岩の隙間に付いて動く粘体。'],1,['cave','ruin'],['ore','crystal']),
  m('small-rat',['들쥐 무리','Field Rat Swarm','野鼠の群れ'],['보관된 식량 주변에 모여 길손을 위협하는 쥐 무리.','Rats gathering around stored food and threatening travelers.','貯蔵食の周りに集まり旅人を脅かす鼠の群れ。'],1,['forest','city','ruin'],['herb','wood'],{meat:1}),
  m('thorn-beetle',['가시등딱정벌레','Thornback Beetle','棘背甲虫'],['단단한 등으로 나뭇잎 사이를 밀고 다니는 큰 벌레.','A large beetle pushing through leaves with its hard back.','硬い背で葉の間を押し進む大きな虫。'],1,['forest','swamp'],['herb','spice']),
  m('marsh-leech',['늪거머리','Marsh Leech','沼蛭'],['늪길의 고인 물에 숨어 있는 질긴 거머리.','A tough leech hiding in stagnant water along marsh paths.','沼道の淀みに潜むしぶとい蛭。'],1,['swamp'],['herb','fish']),
  m('giant-rat',['거대쥐','Giant Rat','大鼠'],['폐허와 저장고 주변을 차지한 커다란 쥐.','A large rat occupying ruins and storehouse surroundings.','遺跡や倉庫の周りを占める大きな鼠。'],2,['ruin','cave','city'],['ore','herb'],{meat:1}),
  m('forest-wolf',['숲늑대','Forest Wolf','森狼'],['사냥길에 접근한 이에게 달려드는 날랜 늑대.','A swift wolf that attacks intruders near its hunting trail.','狩り道へ近づく者に襲い掛かる素早い狼。'],2,['forest','mountain'],['meat','herb'],{hide:'wolf-hide',skinCount:1,meat:2}),
  m('boar',['성난 멧돼지','Angry Boar','荒ぶる猪'],['먹이 터를 지키며 길로 돌진하는 힘센 멧돼지.','A strong boar charging onto paths while defending feeding grounds.','餌場を守り道へ突進する力強い猪。'],2,['forest','swamp'],['meat','spice'],{meat:3}),
  m('venom-spider',['독그물거미','Venom-Web Spider','毒網蜘蛛'],['낮은 통로에 끈끈한 그물을 펼친 큰 거미.','A large spider stretching sticky webs across low passages.','低い通路に粘る網を張る大蜘蛛。'],2,['forest','cave','ruin'],['silk','herb']),
  m('goblin-raider',['고블린 습격병','Goblin Raider','ゴブリン襲撃兵'],['교역로를 습격하는 무장단의 전투원. 고블린 전체를 뜻하지 않는다.','A fighter in an armed road-raiding band, not a description of all goblins.','交易路を襲う武装団の戦闘員。全ゴブリンを示さない。'],2,['forest','mountain','ruin'],['ore','wood','bread']),
  m('goblin-slinger',['고블린 투석병','Goblin Slinger','ゴブリン投石兵'],['바위 엄폐물을 이용하는 습격단 소속 투석병.','A raiding-band slinger using rocks for cover.','岩陰を利用する襲撃団の投石兵。'],2,['mountain','ruin','cave'],['ore','wood']),
  m('reef-crab',['암초집게게','Reef Pincer Crab','礁の鋏蟹'],['항구 바위틈에서 큰 집게로 통행을 막는 게.','A crab blocking harbor rocks with oversized pincers.','港の岩間で大きな鋏を構え通行を塞ぐ蟹。'],2,['coast','island'],['fish','gem'],{meat:1}),
  m('goblin-chief',['고블린 습격대장','Goblin Raid Chief','ゴブリン襲撃隊長'],['무장 습격대를 이끄는 노련한 우두머리.','A seasoned leader of an armed raiding band.','武装襲撃隊を率いる手慣れた頭。'],3,['forest','mountain','ruin'],['ingot','ore','jerky']),
  m('orc-raider',['오크 습격병','Orc Raider','オーク襲撃兵'],['상단을 습격하는 무장단의 힘센 전투원. 종족 전체와 구분한다.','A strong fighter in a caravan-raiding band, distinct from the wider ancestry.','隊商を襲う武装団の力強い戦闘員。種族全体とは区別する。'],3,['forest','mountain','desert'],['ingot','ore','jerky']),
  m('orc-scout',['오크 습격 정찰병','Orc Raider Scout','オーク襲撃斥候'],['습격단의 앞길을 살피는 민첩한 정찰병.','An agile scout checking routes ahead of a raiding band.','襲撃団の先の道を調べる機敏な斥候。'],3,['forest','mountain','swamp'],['wood','herb','jerky']),
  m('skeleton-guard',['해골 경비병','Skeleton Guard','骸骨衛兵'],['낡은 무구를 들고 유적 통로를 막는 움직이는 해골.','An animated skeleton with old equipment blocking ruined corridors.','古い武具を持ち遺跡の通路を塞ぐ動く骸骨。'],3,['ruin','cave','tower'],['ore','relic']),
  m('restless-zombie',['떠도는 좀비','Restless Zombie','さまよう屍'],['멈춘 길목을 배회하는 느리고 질긴 사체.','A slow, stubborn corpse wandering abandoned paths.','廃れた道を徘徊する遅くしぶとい屍。'],3,['ruin','swamp','cave'],['relic','herb']),
  m('giant-bat',['거대박쥐','Giant Bat','大蝙蝠'],['좁은 동굴 위쪽에서 갑자기 내려오는 큰 박쥐.','A large bat swooping from the roof of narrow caverns.','狭い洞の天井から急に降りる大蝙蝠。'],3,['cave','ruin'],['meat','crystal'],{meat:1}),
  m('forest-bear',['사나운 숲곰','Fierce Forest Bear','猛る森熊'],['둥지 가까운 길에서 사람을 위협하는 큰 곰.','A large bear threatening travelers near its den.','巣に近い道で人を威嚇する大熊。'],3,['forest','mountain','snow'],['meat','herb'],{hide:'bear-hide',skinCount:1,meat:3}),
  m('mud-golem',['진흙골렘','Mud Golem','泥ゴーレム'],['늪과 유적의 진흙이 뭉쳐 움직이는 둔중한 형체.','A heavy moving form of marsh and ruin mud.','沼や遺跡の泥が固まり動く重い形。'],3,['swamp','ruin'],['ore','crystal']),
  m('stone-troll',['바위트롤','Stone Troll','岩トロル'],['산길의 바위를 밀어 길을 가로막는 거대한 트롤.','A huge troll pushing rocks across mountain roads.','山道の岩を押し道を塞ぐ巨大なトロル。'],4,['mountain','cave'],['ore','gem','meat'],{meat:2}),
  m('marsh-troll',['늪트롤','Marsh Troll','沼トロル'],['젖은 갈대밭을 헤집고 다니는 큰 트롤.','A large troll tearing through wet reedbeds.','濡れた葦原をかき分ける大きなトロル。'],4,['swamp','forest'],['herb','meat','spice'],{meat:2}),
  m('armored-orc',['오크 중장 습격병','Armored Orc Raider','重装オーク襲撃兵'],['두꺼운 방어구를 갖춘 습격단의 전투원.','A raiding-band fighter in thick armor.','厚い防具を備えた襲撃団の戦闘員。'],4,['mountain','ruin','volcano'],['ingot','ore']),
  m('wight',['무덤 망자','Barrow Wight','塚の亡者'],['오래된 매장지 주변에서 적대적으로 움직이는 망자.','A hostile undead figure moving around old burial places.','古い埋葬地の周囲で敵対的に動く亡者。'],4,['ruin','cave','snow'],['relic','crystal']),
  m('flame-lizard',['화염도마뱀','Flame Lizard','火蜥蜴'],['뜨거운 암석 사이에서 길을 위협하는 큰 도마뱀.','A large lizard threatening paths among heated rocks.','熱い岩の間で道を脅かす大蜥蜴。'],4,['volcano','desert','mountain'],['crystal','meat'],{hide:'lizard-hide',skinCount:1,meat:2}),
  m('ice-wolf',['서리늑대','Frost Wolf','霜狼'],['흰 털로 눈길에 섞여 나타나는 사나운 늑대.','A fierce pale wolf blending into snowy roads.','白い毛で雪道に紛れる荒い狼。'],4,['snow','mountain'],['meat','crystal'],{hide:'wolf-hide',skinCount:1,meat:2}),
  m('stone-golem',['유적 돌골렘','Ruin Stone Golem','遺跡の石ゴーレム'],['옛 통로를 지키듯 움직이는 단단한 돌 인형.','A solid stone figure moving as though guarding an old passage.','古い通路を守るように動く硬い石人形。'],4,['ruin','cave','tower'],['ore','gem','crystal']),
  m('ogre',['황야 오우거','Wildland Ogre','荒野のオーガ'],['길가의 큰 바위를 무기처럼 휘두르는 괴력의 괴물.','A powerful creature swinging roadside boulders like weapons.','道端の大岩を武器のように振るう怪力の魔物。'],5,['forest','mountain','desert'],['ingot','meat'],{meat:2}),
  m('chimera',['키메라','Chimera','キマイラ'],['서로 다른 짐승의 특징이 한 몸에 엉킨 흉포한 괴수.','A fierce beast combining traits of several animals.','異なる獣の特徴が一体に絡む凶暴な怪獣。'],5,['mountain','ruin','forest'],['gem','crystal','meat'],{meat:2}),
  m('grave-knight',['무덤의 갑옷기사','Grave Knight','墓所の鎧騎士'],['빈 갑옷 안에서 차가운 빛이 움직이는 적대적 형체.','A hostile form with cold light moving inside empty armor.','空の鎧に冷たい光が動く敵対的な形。'],5,['ruin','tower','snow'],['ingot','relic','crystal']),
  m('griffin',['절벽 그리핀','Cliff Griffin','崖のグリフォン'],['날개와 큰 발톱으로 높은 길을 위협하는 맹수.','A winged predator with large talons threatening high paths.','翼と大きな爪で高い道を脅かす猛獣。'],5,['mountain','island'],['gem','meat'],{meat:2}),
  m('storm-elemental',['폭풍 형체','Storm Elemental','嵐の形'],['거센 바람과 마나가 엉켜 주변을 휩쓰는 형체.','A form of tangled winds and mana sweeping its surroundings.','強風と魔力が絡み周囲を巻く形。'],5,['island','mountain','tower'],['crystal','gem']),
  m('deep-serpent',['심수뱀','Deepwater Serpent','深水蛇'],['깊은 수로에서 배 밑으로 다가오는 거대한 뱀.','A huge serpent approaching beneath boats in deep channels.','深い水路で船底へ寄る巨大な蛇。'],5,['coast','swamp','island'],['fish','crystal','meat'],{meat:2}),
  m('cliff-wyvern',['절벽와이번','Cliff Wyvern','崖ワイバーン'],['갈고리 발과 긴 꼬리를 가진 비행 괴수. 계류길의 위협으로 보고되었다.','A flying beast with hooked feet and a long tail, reported near mooring routes.','鉤足と長い尾を持つ飛行怪獣。係留路の脅威と報告された。'],6,['island','mountain'],['gem','crystal','meat'],{minDanger:2,hide:'lizard-hide',skinCount:1,meat:2}),
  m('venom-wyvern',['독꼬리와이번','Venom-Tail Wyvern','毒尾ワイバーン'],['낮게 선회하며 긴 꼬리로 접근을 막는 와이번.','A low-circling wyvern keeping intruders away with its long tail.','低く旋回し長い尾で接近を拒むワイバーン。'],6,['swamp','mountain','island'],['crystal','gem','meat'],{hide:'lizard-hide',skinCount:1,meat:2}),
  m('hydra',['늪히드라','Marsh Hydra','沼ヒドラ'],['여러 목을 가진 거대한 수변 괴수.','A huge waterside creature with many necks.','複数の首を持つ巨大な水辺の怪獣。'],6,['swamp','coast','island'],['crystal','gem','meat'],{meat:3}),
  m('greater-chimera',['상위키메라','Greater Chimera','上位キマイラ'],['큰 몸과 불규칙한 움직임을 가진 위험한 합성 괴수.','A dangerous composite beast with a large body and irregular motion.','大きな体と不規則な動きの危険な合成怪獣。'],6,['mountain','ruin','volcano'],['gem','crystal','relic'],{meat:2}),
  m('ancient-wight',['고대 망자','Ancient Wight','古い亡者'],['희미한 유물 빛을 두르고 폐허를 배회하는 강한 망자.','A powerful undead figure wandering ruins in faint relic light.','淡い遺物光を纏い遺跡を巡る強い亡者。'],6,['ruin','cave','tower'],['relic','crystal','gem']),
  m('red-dragon',['적대적 붉은용','Hostile Red Dragon','敵対的な赤竜'],['화산길을 차지한 강한 용. 용혈 종족 일반과 구분한다.','A powerful dragon occupying a volcanic road, distinct from dragonkin generally.','火山道を占める強い竜。竜の民一般とは分ける。'],7,['volcano','mountain'],['gem','crystal','ingot'],{meat:3}),
  m('frost-dragon',['적대적 서리용','Hostile Frost Dragon','敵対的な霜竜'],['찬 산길을 위협하는 강한 비늘의 용.','A heavily scaled dragon threatening cold mountain paths.','冷たい山道を脅かす堅鱗の竜。'],7,['snow','mountain'],['gem','crystal','relic'],{meat:3}),
  m('storm-dragon',['적대적 폭풍용','Hostile Storm Dragon','敵対的な嵐竜'],['섬과 높은 바위 위로 선회하는 강력한 용.','A powerful dragon circling islands and high rocks.','島と高い岩の上を旋回する強力な竜。'],7,['island','mountain'],['crystal','gem','relic'],{meat:3}),
  m('abyss-hydra',['깊은늪히드라','Deep-Marsh Hydra','深沼ヒドラ'],['어두운 수로에서 여러 목을 드러내는 거대한 괴수.','A huge creature raising many necks from dark channels.','暗い水路から幾つもの首を出す巨大な怪獣。'],7,['swamp','cave','coast'],['crystal','gem','relic'],{meat:3}),
  m('obsidian-guardian',['흑요석 수호상','Obsidian Guardian','黒曜の守護像'],['검은 돌의 큰 인형이 오래된 길을 가로막는다.','A large black-stone figure blocking an old road.','黒い石の大きな人形が古い道を塞ぐ。'],7,['volcano','ruin','tower'],['ore','crystal','gem']),
  m('elder-dragon',['적대적 고룡','Hostile Elder Dragon','敵対的な古竜'],['오랜 마나를 품은 거대한 용으로 화산길의 중대한 위협이다.','An immense dragon bearing old mana and posing a grave threat on volcanic roads.','古い魔力を帯びた巨大な竜。火山道の重大な脅威。'],8,['volcano','mountain'],['gem','crystal','relic'],{meat:3}),
  m('ancient-frost-dragon',['고대 서리용','Ancient Frost Dragon','古き霜竜'],['깊은 설원의 길을 차지한 오래되고 위험한 용.','An old and dangerous dragon occupying deep snow routes.','深い雪道を占める古く危険な竜。'],8,['snow','mountain'],['gem','crystal','relic'],{meat:3}),
  m('ancient-storm-dragon',['고대 폭풍용','Ancient Storm Dragon','古き嵐竜'],['먼 섬의 높은 바위를 차지한 오래된 용.','An old dragon occupying high rocks on distant islands.','遠い島の高岩を占める古い竜。'],8,['island','mountain'],['crystal','gem','relic'],{meat:3}),
  m('void-chimera',['공허빛 키메라','Void-Lit Chimera','虚光のキマイラ'],['형체의 가장자리가 흐릿하게 보이는 위험한 합성 괴수.','A dangerous composite beast whose edges appear indistinct.','輪郭が曖昧に見える危険な合成怪獣。'],8,['ruin','tower','cave'],['relic','crystal','gem']),
];

export const fantasyMonsterById=(id:string):FantasyMonster|undefined=>FANTASY_MONSTERS.find(monster=>monster.id===id);
