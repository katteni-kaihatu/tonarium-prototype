import type { FantasyQuest } from './fantasy.ts';
import type { FantasyMainReveal } from './fantasy-second-content.ts';
import { fantasyIsleChapter, fantasyIsleRevelation } from './fantasy-isle-story.ts';

type Text = [ko: string, en: string, ja: string];
const l = ([ko, en, ja]: Text) => ({ ko, en, ja });
type SettlementQuest = FantasyQuest & { dialogue: ReturnType<typeof l> };
const places: Record<string, Text> = {
  'saffron-port':['호박빛항','Amberwake Port','琥珀の港'],'beyond-dawn-isle':['새벽너머섬','Beyond-Dawn Isle','暁の向こうの島'],
  'inkstone-city': ['묵향도시', 'Inkstone City', '墨香の街'], pinewatch: ['솔바람마을', 'Pinewatch', '松風の里'], reedcross: ['갈대나루마을', 'Reedcross', '葦渡りの里'],
  'canopy-hall': ['수관도시', 'Canopy Hall', '樹冠の街'], mossbrook: ['이끼샘마을', 'Mossbrook', '苔泉の里'], leafshade: ['잎그늘마을', 'Leafshade', '葉陰の里'],
  sunloom: ['햇실도시', 'Sunloom', '陽織の街'], wellrest: ['샘쉼마을', 'Wellrest', '泉憩いの里'], rockshade: ['바위그늘마을', 'Rockshade', '岩陰の里'],
  mooncity: ['루네리아', 'Mooncity', '月都ルネリア'], frostpass: ['흰안개고개', 'Frostpass', '白霧峠'], eclipsevault: ['월식지하궁', 'Eclipse Vault', '月蝕の地下宮'],
  glassdesert: ['유리사막', 'Glass Desert', '玻璃砂漠'], duskmire: ['황혼늪', 'Duskmire', '薄暮の沼'], rainvault: ['비그늘수림', 'Rainvault', '雨蔭の森'],
  'root-cavern': ['뿌리울림동굴', 'Rootsong Cavern', '根響き洞'], 'fern-sanctum': ['고사리옛터', 'Fern Sanctum', '羊歯の古跡'],
  'verdant-quay': ['푸른돛항', 'Verdant Quay', '緑帆港'], 'loom-village': ['물결베틀마을', 'Loomwater', '波織りの里'],
  redweave: ['붉은직물도시', 'Redweave', '赤織の街'], 'cinder-stair': ['잿돌계단산', 'Cinderstair', '灰段の山'], saltglass: ['소금거울분지', 'Saltglass Basin', '塩鏡盆地'], windstep: ['초원바람길', 'Windstep', '草風の道'],
};
const goods: Record<string, Text> = {
  herb: ['회복 약초', 'Healing Herb', '回復薬草'], wood: ['좋은 목재', 'Timber', '良質な木材'], ore: ['철광석', 'Iron Ore', '鉄鉱石'], crystal: ['마정석', 'Mana Crystal', '魔晶石'], relic: ['고대 유물', 'Ancient Relic', '古代の遺物'],
  silk: ['별비단', 'Starsilk', '星絹'], linen: ['리넨 천', 'Linen', '麻布'], bread: ['빵', 'Bread', 'パン'], jerky: ['육포', 'Jerky', '干し肉'], spice: ['향신료', 'Spice', '香辛料'], fish: ['생선', 'Fish', '魚'],
  potion: ['회복 물약', 'Recovery Potion', '回復薬'], winterbloom: ['설화초', 'Winterbloom', '雪咲き草'], ingot: ['철 주괴', 'Iron Ingot', '鉄の延べ棒'],
  'dried-fish': ['보존 생선', 'Preserved Fish', '魚の保存食'], 'repair-plank': ['선체 보수판', 'Hull Repair Plank', '船体の補修板'], 'pottery-vessel': ['도기 용기', 'Pottery Vessel', '陶器の容器'], 'wolf-hide': ['늑대 가죽', 'Wolf Hide', '狼の皮'],
};
function delivery(id: string, title: Text, voice: Text, giver: string, issuer: string, destination: string, item: string, count: number, gold: number, xp: number, options: Partial<SettlementQuest> = {}): SettlementQuest {
  const at = places[giver], to = places[destination], material = goods[item];
  if (!at || !to || !material) throw new Error(`Unknown settlement quest reference: ${id}`);
  const descriptions = l([
    `${voice[0]} ${to[0]}을 방문하고 ${material[0]} ${count}개를 마련해 ${at[0]}의 의뢰인에게 전달하자.`,
    `${voice[1]} Visit ${to[1]}, obtain ${material[1]} ×${count}, and return them to the client in ${at[1]}.`,
    `${voice[2]} ${to[2]}を訪ね、${material[2]}×${count}を用意し、${at[2]}の依頼人へ届けよう。`,
  ]);
  return { id, names: l(title), name: title[2], descriptions, description: descriptions.ja, dialogue: l(voice), giver, issuer, destination, item, count, gold, xp, ...options };
}
function main(chapter:number,giver:string,issuer:string,destination:string,item:string,count:number):SettlementQuest {
  const story=fantasyIsleChapter(chapter),text=(value:Record<'ko'|'en'|'ja',string>):Text=>[value.ko,value.en,value.ja];
  const quest=delivery(`main-night-${chapter}`,text(story.title),text(story.dialogue),giver,issuer,destination,item,count,220+(chapter-12)*15,Math.round((80+(chapter-12)*5)*1.9/5)*5,{chapter,requiresCompleted:[`main-night-${chapter-1}`]});
  const at=places[chapter===18?'beyond-dawn-isle':giver],to=places[destination],material=goods[item];
  const descriptions=l([
    `${to[0]}의 조사와 ${at[0]}의 증거 대조를 마치자. 출발 전 조사재료 ${material[0]}×${count}를 준비하자.`,
    `Investigate ${to[1]} and cross-check the evidence in ${at[1]}. Prepare ${material[1]} ×${count} as supplies before setting out.`,
    `${to[2]}を調べ、${at[2]}で証拠を照合しよう。出発前に調査資材${material[2]}×${count}を用意しよう。`,
  ]);
  return {...quest,descriptions,description:descriptions.ja,...(chapter===18?{reportAt:'beyond-dawn-isle',completionLabel:{ko:'항해일지에 기록',en:'Record in voyage journal',ja:'航海日誌に記す'}}:{})};
}

export const FANTASY_SETTLEMENT_MAIN_QUESTS:SettlementQuest[]=[
  main(13,"inkstone-city","inkstone-city-shiori","pinewatch","crystal",2),
  main(14,"pinewatch","pinewatch-mireun","reedcross","relic",2),
  main(15,"canopy-hall","canopy-hall-harin","mossbrook","wood",2),
  main(16,"mossbrook","mossbrook-solan","leafshade","herb",3),
  main(17,"sunloom","sunloom-zuleh","wellrest","silk",2),
  main(18,"saffron-port","saffron-port-safi","beyond-dawn-isle","ingot",2),
];
function evidence(chapter:number):FantasyMainReveal {
  return {questId:`main-night-${chapter}`,id:`night-evidence-${chapter}`,topic:'passage-beyond-dawn',text:fantasyIsleRevelation(chapter),termIds:fantasyIsleChapter(chapter).termIds,...(chapter>=17?{supersedes:['uncharted-isle-rumor']}:{})};
}
export const FANTASY_SETTLEMENT_MAIN_REVEALS:FantasyMainReveal[]=Array.from({length:6},(_,index)=>evidence(index+13));

function hunt(id: string, title: Text, voice: Text, giver: string, issuer: string, destination: string, monster: string, count: number, group: boolean): SettlementQuest {
  const at = places[giver], to = places[destination];
  const descriptions = l([
    `${voice[0]} ${to[0]}의 지정된 적 ${count}마리 토벌에 기여하고 ${at[0]}의 의뢰인에게 보고하자.`,
    `${voice[1]} Contribute to defeating ${count} of the specified hostile target in ${to[1]}, then report to the client in ${at[1]}.`,
    `${voice[2]} ${to[2]}で指定された敵${count}体の討伐に協力し、${at[2]}の依頼人へ報告しよう。`,
  ]);
  return { id, names: l(title), name: title[2], descriptions, description: descriptions.ja, dialogue: l(voice), giver, issuer, destination, item: 'ore', count: 1, gold: group ? 180 : 90, xp: group ? 48 : 32, group, objective: { type: 'hunt', monster, count } };
}

export const FANTASY_SETTLEMENT_SIDE_QUESTS: SettlementQuest[] = [
  delivery('settlement-ink-bindings', ['장맛비를 견딜 묶음', 'Bindings against the Long Rain', '長雨に耐える綴じ'],
    ['시오리야. 루네리아로 오가는 사본의 묶음끈이 눅눅해졌어. 천 두 장이면 사본을 다시 보호할 수 있겠네.', 'Shiori here. The bindings of copies traveling to Mooncity have gone damp. Two cloths will protect them again.', 'シオリです。月都を往復する写しの綴じが湿っています。布が二枚あれば守り直せます。'], 'inkstone-city', 'inkstone-city-shiori', 'mooncity', 'linen', 2, 62, 25, { jobs: ['weaver', 'tailor', 'scribe'] }),
  delivery('settlement-ink-bread', ['찻국과 나눌 빵', 'Bread beside the Tea Broth', '茶の汁に添えるパン'],
    ['나쓰메예요. 갈대나루에서 돌아오는 운반꾼들이 찻국만 먹고 길을 떠나요. 빵 세 개를 곁들여 주고 싶어요.', 'I am Natsume. Couriers returning from Reedcross leave after only tea broth. I would like three loaves to send with them.', 'ナツメです。葦渡りから戻る運び手が茶の汁だけで出発します。パンを三つ添えてあげたいです。'], 'inkstone-city', 'inkstone-city-natsume', 'reedcross', 'bread', 3, 56, 23, { jobs: ['baker', 'cook'] }),
  delivery('settlement-ink-lamps', ['사막길의 작은 신호등', 'Small Signals on the Desert Road', '砂漠道の小さな合図灯'],
    ['라이코다. 유리사막 쪽 이정표의 촉매를 보충하려 한다. 길의 상태를 확인하고 마정석 두 개를 가져와 줘. 새 길을 개척하라는 뜻은 아니다.', 'Raiko here. The Glass Desert signposts need fresh catalysts. Check that route and bring two crystals. I am not asking you to open a new road.', 'ライコだ。玻璃砂漠側の道標に触媒を補充したい。道を確かめ、魔晶石を二つ頼む。新道を拓けという話ではない。'], 'inkstone-city', 'inkstone-city-raiko', 'glassdesert', 'crystal', 2, 78, 29),
  delivery('settlement-pine-autumn', ['찬바람 전 약초 선반', 'Herb Shelves before the Cold Wind', '寒風前の薬草棚'],
    ['미르은이에요. 가을 끝에 급히 모으면 뿌리까지 상해요. 고개를 살피고 약초 네 묶음을 조금씩 마련해 주세요.', 'I am Mireun. Rushing the autumn harvest harms the roots. Check the pass and gather four herb bundles with care.', 'ミルンです。秋の終わりに急ぐと根を傷めます。峠を確かめ、薬草を四束、少しずつ用意してください。'], 'pinewatch', 'pinewatch-mireun', 'frostpass', 'herb', 4, 66, 26, { seasons: ['autumn'] }),
  delivery('settlement-pine-winterbloom', ['눈 사이의 두 꽃', 'Two Flowers in the Snow', '雪間の二つの花'],
    ['미르은이에요. 설화초는 지금 피어요. 고개의 꽃 두 송이만 부탁해요. 남은 뿌리는 다음 겨울에도 살아야 하니까요.', 'Mireun speaking. Winterblooms are flowering now. Bring just two from the pass; their roots must live for another winter.', 'ミルンです。雪咲き草はいま咲きます。峠の花を二つだけ。根は来年の冬にも生きる必要があります。'], 'pinewatch', 'pinewatch-mireun', 'frostpass', 'winterbloom', 2, 74, 28, { seasons: ['winter'], jobs: ['herbalist', 'alchemist'] }),
  delivery('settlement-pine-remedy', ['새벽 손님의 구급함', 'A Kit for Dawn Arrivals', '夜明けの客の救急箱'],
    ['태수요. 지하궁에서 돌아온 손님이 손을 다쳐도 빈 병만 내밀 순 없지요. 회복 물약 두 병을 구급함에 채워 주겠어요?', 'I am Taesu. Guests return from the vault with scraped hands; I cannot offer empty bottles. Will you restock two recovery potions?', 'テスです。地下宮帰りの客が手を傷めても空瓶は渡せません。回復薬を二瓶、救急箱へ補充してくれますか。'], 'pinewatch', 'pinewatch-taesu', 'eclipsevault', 'potion', 2, 64, 25),
  delivery('settlement-reed-fish', ['비 오는 날의 건어물', 'Dried Fish for Rainy Days', '雨の日の干し魚'],
    ['다미예요. 황혼늪 길손에게 생선을 그대로 싸주면 상하기 쉬워요. 보존 생선 세 꾸러미면 안심하고 내줄 수 있겠네요.', 'I am Dami. Fresh fish spoils in a Duskmire traveler’s pack. Three preserved bundles would be safer provisions.', 'ダミです。薄暮の沼へ向かう旅人に生魚では傷みます。魚の保存食を三包みなら安心して渡せます。'], 'reedcross', 'reedcross-dami', 'duskmire', 'dried-fish', 3, 72, 27, { jobs: ['fisher'] }),
  delivery('settlement-reed-planks', ['나루 발판의 새 이음', 'New Joints for the Landing', '渡し場の新しい継ぎ目'],
    ['요리야. 묵향도시행 짐꾼이 나루 발판에 발을 헛디뎠어. 판재 두 장을 구해 오면 갈라진 곳부터 고칠게.', 'Yori here. A porter bound for Inkstone slipped on the landing. Bring two repair boards and I will mend the split first.', 'ヨリです。墨香行きの荷運びが渡し場で足を滑らせました。補修板を二枚いただければ割れから直します。'], 'reedcross', 'reedcross-yori', 'inkstone-city', 'repair-plank', 2, 88, 30, { jobs: ['shipwright'] }),
  hunt('settlement-reed-slimes', ['낚싯줄을 막는 점액', 'Slime across the Fishing Lines', '釣り糸を塞ぐ粘体'],
    ['서루예요. 황혼늪 쪽 갈대슬라임이 그물을 뒤덮어요. 두 무리만 정리해 주면 여관 손님도 나루를 지나기 편할 거예요.', 'I am Seoru. Reed slimes cover the nets toward Duskmire. Clearing two will make the landing safer for our guests.', 'ソルです。薄暮の沼側の葦スライムが網を覆います。二体退けてもらえれば宿の客も通りやすくなります。'], 'reedcross', 'reedcross-seoru', 'duskmire', 'monster-reed-slime', 2, false),
  delivery('settlement-canopy-linen', ['빗물받이 뒤의 얇은 천', 'Light Cloth behind the Rain Gutter', '雨樋の裏の薄布'],
    ['새하예요. 물결베틀마을 장인의 새 천을 보러 가는 길이라면 우리 처마에 댈 리넨도 두 장 부탁해요. 두껍게 막으면 바람길까지 사라져요.', 'I am Saeha. If you visit Loomwater’s cloth workers, bring two linens for our eaves. A heavy covering would block the breeze too.', 'セハです。波織りの織り手を訪ねるなら軒用の麻布も二枚。厚く塞ぐと風の道まで消えてしまいます。'], 'canopy-hall', 'canopy-hall-saeha', 'loom-village', 'linen', 2, 60, 25, { jobs: ['weaver'] }),
  delivery('settlement-canopy-pattern', ['도안 표본의 묶음', 'Ties for the Pattern Samples', '図案見本の結び'],
    ['하린이에요. 고사리옛터를 살피고 돌아올 도안 표본은 서로 섞이면 안 돼요. 비단 두 장으로 표지를 나누어 보관하려고요.', 'I am Harin. Pattern samples from Fern Sanctum must not be mixed. Two silks will let me bind their covers separately.', 'ハリンです。羊歯の古跡から戻る図案見本は混ぜられません。絹二枚で表紙を分けて保管したいのです。'], 'canopy-hall', 'canopy-hall-harin', 'fern-sanctum', 'silk', 2, 76, 28, { jobs: ['scribe', 'tailor', 'weaver'] }),
  delivery('settlement-canopy-soup', ['여름비 뒤의 큰 냄비', 'The Pot after Summer Rain', '夏雨のあとの大鍋'],
    ['배온이오. 비그늘수림에서 일한 사람들이 젖은 채 돌아오네. 여름비가 오는 동안 국에 넣을 약초 세 묶음을 부탁하오.', 'Baeon here. Workers return soaked from Rainvault. While the summer rains last, bring three herbs for their soup.', 'ペオンです。雨蔭の森の働き手が濡れて戻ります。夏雨の間、汁に入れる薬草を三束お願いします。'], 'canopy-hall', 'canopy-hall-baeon', 'rainvault', 'herb', 3, 58, 24, { seasons: ['summer'] }),
  delivery('settlement-moss-potions', ['샘터 일꾼의 약병', 'Remedies for the Spring Workers', '泉の働き手の薬瓶'],
    ['솔란이오. 뿌리울림동굴의 급수길을 살핀 뒤 물약 두 병을 가져오시오. 병을 빌려 달라는 게 아니라 일꾼들 구급품이오.', 'Solan here. Inspect the approach to Rootsong Cavern and bring two potions. These are remedies for the workers, not bottles to borrow.', 'ソランです。根響き洞への給水道を訪ね、薬を二瓶。空瓶を借りるのではなく、働き手の救急品です。'], 'mossbrook', 'mossbrook-solan', 'root-cavern', 'potion', 2, 66, 26, { jobs: ['alchemist'] }),
  delivery('settlement-moss-beds', ['샘가 객실의 삐걱임', 'The Creak beside the Spring', '泉辺の客室の軋み'],
    ['누리예요. 수관도시행 길손이 앉을 때마다 침대 받침이 울려요. 목재 세 개면 낡은 받침부터 갈 수 있겠어요.', 'I am Nuri. The bed creaks whenever a traveler bound for Canopy sits down. Three timbers will replace its worn supports.', 'ヌリです。樹冠行きの旅人が座るたび寝台が軋みます。木材三つで古い支えを替えられます。'], 'mossbrook', 'mossbrook-nuri', 'canopy-hall', 'wood', 3, 56, 24, { jobs: ['carpenter'] }),
  hunt('settlement-moss-spiders', ['샘길 아래의 독그물', 'Venom Webs below the Spring Road', '泉道の下の毒網'],
    ['라미예요. 뿌리울림동굴 입구에서 씨앗 운반인이 독그물에 걸렸어요. 독그물거미 두 마리를 퇴치해 운반길을 지켜 주세요.', 'I am Rami. A seed porter was caught in webs near Rootsong Cavern. Defeat two venom-web spiders along that route.', 'ラミです。根響き洞の入口で種運びが毒網に掛かりました。毒網蜘蛛二体を退け、運び道を守ってください。'], 'mossbrook', 'mossbrook-rami', 'root-cavern', 'monster-venom-spider', 2, false),
  delivery('settlement-leaf-spice', ['가을 열매의 향 묶음', 'Spices for the Autumn Fruit', '秋の実の香り包み'],
    ['톨리야. 물결베틀마을 장터까지 다녀올 사람 있니? 가을 열매를 보존할 향신료 세 묶음을 내 주방으로 부탁해.', 'Toli here. Is anyone visiting Loomwater’s market? Bring three spices to my kitchen for preserving the autumn fruit.', 'トリです。波織りの市へ行く方はいませんか。秋の実を保存する香辛料を三束、厨房へお願いします。'], 'leafshade', 'leafshade-toli', 'loom-village', 'spice', 3, 66, 26, { seasons: ['autumn'], jobs: ['cook'] }),
  delivery('settlement-leaf-jerky', ['곰팡이 걱정 없는 길양식', 'Provisions That Keep on the Road', '道中に保つ保存食'],
    ['아로야. 비그늘수림을 건너는 짐꾼에게 마른 길양식을 주려 해. 육포 세 꾸러미를 가져오면 다음 짐에 나누어 실을게.', 'Aro here. Porters crossing Rainvault need dry provisions. Bring three bundles of jerky and I will divide them among the next loads.', 'アロです。雨蔭の森を越す運び手に乾いた食料を。干し肉を三包みいただければ次の荷へ分けて積みます。'], 'leafshade', 'leafshade-aro', 'rainvault', 'jerky', 3, 60, 25, { jobs: ['cook', 'hunter'] }),
  delivery('settlement-leaf-hide', ['안장 아래의 여분 가죽', 'Spare Hide beneath the Saddle', '鞍の下の替え皮'],
    ['은비예요. 뿌리울림동굴행 손님의 짐끈이 자꾸 쓸려요. 늑대 가죽 두 장으로 안쪽 덧댐을 바꿔 주려 해요.', 'I am Eunbi. A guest’s straps keep chafing on the Rootsong route. Two wolf hides will replace the inner patches.', 'ウンビです。根響き洞へ行く客の荷紐が擦れます。狼の皮を二枚、内側の当て皮に替えたいです。'], 'leafshade', 'leafshade-eunbi', 'root-cavern', 'wolf-hide', 2, 78, 28, { jobs: ['leatherworker', 'hunter'] }),
  delivery('settlement-sunloom-shade', ['한낮 도안의 견본천', 'Sample Cloth for Noon Shade', '真昼の日除け見本布'],
    ['줄레요. 붉은직물도시의 차양 치수를 비교할 견본이 필요해요. 리넨 세 장이면 도안마다 같은 폭으로 재볼 수 있겠어요.', 'I am Zuleh. I need samples to compare Redweave’s awning measures. Three linens will give each pattern the same test width.', 'ズレです。赤織の日除け寸法を比べる見本が要ります。麻布三枚なら図案ごとに同じ幅で測れます。'], 'sunloom', 'sunloom-zuleh', 'redweave', 'linen', 3, 70, 27, { jobs: ['weaver', 'scribe'] }),
  delivery('settlement-sunloom-dyes', ['염료병 곁의 회복약', 'Remedies beside the Dye Jars', '染料瓶の隣の回復薬'],
    ['바히르다. 잿돌계단산 표본을 다루는 일꾼들 구급함을 채우려 한다. 회복 물약 두 병을 가져와. 염료를 약이라 속여 팔 생각은 없어.', 'Bahir here. The Cinderstair sample workers need a stocked first-aid kit. Bring two recovery potions. I have no intention of selling dye as medicine.', 'バヒルだ。灰段の山の標本を扱う者の救急箱を満たしたい。回復薬を二瓶頼む。染料を薬と偽って売る気はない。'], 'sunloom', 'sunloom-bahir', 'cinder-stair', 'potion', 2, 68, 26, { jobs: ['alchemist'] }),
  delivery('settlement-sunloom-ties', ['모래가 덜 드는 매듭', 'Knots That Shed the Sand', '砂の入りにくい結び'],
    ['카밀이오. 샘쉼마을행 천 꾸러미는 모래가 들면 팔기 어렵소. 비단 두 장으로 덮개와 매듭을 보강하려 하오.', 'Kamil speaking. Sand spoils cloth bundles bound for Wellrest. Two silks will reinforce their covers and ties.', 'カミルです。泉憩い行きの布包みに砂が入ると売れません。絹二枚で覆いと結びを補強したいのです。'], 'sunloom', 'sunloom-kamil', 'wellrest', 'silk', 2, 76, 28, { jobs: ['tailor', 'weaver'] }),
  delivery('settlement-well-vessels', ['샘물을 나눌 작은 그릇', 'Small Vessels for Springwater', '泉水を分ける小さな器'],
    ['야스민이에요. 햇실도시행 상단이 물을 나눌 때 그릇이 모자라요. 도기 두 개만 더 있으면 서로 기다리지 않아도 돼요.', 'I am Yasmin. The Sunloom caravan is short of water vessels. Two more pots will save everyone waiting in one line.', 'ヤスミンです。陽織行きの隊商は水を分ける器が足りません。陶器が二つ増えれば皆を待たせずに済みます。'], 'wellrest', 'wellrest-yasmin', 'sunloom', 'pottery-vessel', 2, 60, 24, { jobs: ['potter'] }),
  delivery('settlement-well-bread', ['먼 항구로 갈 납작빵', 'Flatbread for the Distant Port', '遠い港へ持つ平パン'],
    ['달리아예요. 호박빛항으로 떠날 손님에게 빵 세 개를 나누려 해요. 식당의 화덕을 쓰든 다른 주방에서 구하든 식량부터 마련해 주세요.', 'I am Dalia. I want three loaves for guests leaving toward the coast. Use a shared oven or obtain them from another kitchen; provisions come first.', 'ダリアです。港へ発つ客にパンを三つ分けたいです。共同窯を使っても他の厨房で求めても、まず食料を用意してください。'], 'wellrest', 'wellrest-dalia', 'sunloom', 'bread', 3, 54, 23, { jobs: ['baker', 'cook'] }),
  delivery('settlement-well-summer', ['그늘막 아래의 여름 약초', 'Summer Herbs beneath the Awning', '日除けの下の夏薬草'],
    ['하순이오. 초원바람길 손님들이 더위를 피해 늦게 돌아오오. 여름 동안 쓸 약초 네 묶음을 여관에 비축하려 하오.', 'Hassun here. Guests return late from Windstep to escape the heat. I need four herb bundles for the inn through summer.', 'ハッスンです。草風の道の客は暑さを避け遅く戻ります。夏の宿に薬草を四束備えたいのです。'], 'wellrest', 'wellrest-hassun', 'windstep', 'herb', 4, 64, 25, { seasons: ['summer'] }),
  delivery('settlement-rock-rings', ['새 짐고리의 철', 'Iron for the New Load Rings', '新しい荷輪の鉄'],
    ['타레크다. 붉은직물도시행 짐고리가 닳았어. 주괴 세 개면 잘라 붙인 임시 고리부터 갈 수 있지.', 'Tarek here. The rings on Redweave-bound loads are worn. Three ingots will replace the patched makeshift rings.', 'タレクだ。赤織行きの荷輪が摩耗した。延べ棒三本で、継ぎ接ぎの仮輪から替えられる。'], 'rockshade', 'rockshade-tarek', 'redweave', 'ingot', 3, 84, 30, { jobs: ['blacksmith'] }),
  delivery('settlement-rock-repairs', ['바위 그늘 쉼터의 받침', 'Supports for the Rock Shelter', '岩陰の休み場の支え'],
    ['두라크다. 소금거울분지에서 돌아온 짐이 기대는 받침이 갈라졌어. 목재 세 개만 가져와. 돌벽이 튼튼해도 가구는 닳으니까.', 'Durak here. The support for loads returning from Saltglass has split. Bring three timbers. A stone wall does not stop furniture wearing out.', 'ドゥラクだ。塩鏡帰りの荷を置く支えが割れた。木材を三つ頼む。石壁が丈夫でも家具は摩耗するからな。'], 'rockshade', 'rockshade-durak', 'saltglass', 'wood', 3, 58, 24, { jobs: ['carpenter'] }),
  delivery('settlement-rock-ore', ['쓸 만한 철물의 시작', 'Where Reliable Hardware Begins', '使える金具の始まり'],
    ['사미라예요. 잿돌계단산길 철물 주문이 늘었어요. 철광석 네 개를 마련해 주면 수리 담당에게 넘겨 둘게요.', 'I am Samira. Hardware orders for the Cinderstair road are growing. Bring four iron ores and I will set them aside for the repairers.', 'サミラです。灰段の山道の金具注文が増えました。鉄鉱石を四つ用意していただければ修理係へ渡しておきます。'], 'rockshade', 'rockshade-samira', 'cinder-stair', 'ore', 4, 70, 27),
  hunt('settlement-moon-bears', ['흰안개길의 공동 호위', 'A Joint Guard on Frostpass', '白霧道の共同護衛'],
    ['오스릭이오. 고개에서 사나운 숲곰이 길손을 위협한다는 소식이 왔소. 세 마리에 공동 대응할 사람을 구하오. 준비 없이 달려들진 마시오.', 'Osric here. Fierce forest bears are threatening travelers on the pass. We need a joint response to three. Do not charge in unprepared.', 'オスリクです。峠で猛る森熊が旅人を脅かしています。三体への共同対応を求めます。備えず飛び込まないでください。'], 'mooncity', 'mooncity-osric', 'frostpass', 'monster-forest-bear', 3, true),
  hunt('settlement-verdant-webs', ['비그늘길의 공동 방제', 'A Joint Clearing in Rainvault', '雨蔭道の共同駆除'],
    ['브린이다. 수리판을 싣는 길에 독그물거미가 모여 배달이 멎었어. 넷을 함께 정리할 동료를 구해 와.', 'Bryn here. Venom-web spiders have halted repair-board deliveries. Find companions to clear four from the route.', 'ブリンだ。補修板を運ぶ道に毒網蜘蛛が集まり配送が止まった。四体を共に退ける仲間を募ってくれ。'], 'verdant-quay', 'verdant-quay-bryn', 'rainvault', 'monster-venom-spider', 4, true),
  delivery('settlement-redweave-crossing', ['다음 봄의 상단 선물', 'A Caravan Gift for Next Spring', '次の春の隊商土産'],
    ['말리예요. 바위그늘마을 쉼터와 봄맞이 길양식을 나누기로 했어요. 육포 세 꾸러미면 손님들 짐에 조금씩 넣어 보낼 수 있어요.', 'I am Mali. We agreed to share spring provisions with the Rockshade shelter. Three bundles of jerky can travel in our guests’ packs.', 'マリです。岩陰の休み場と春の道中食を分ける約束です。干し肉三包みなら客の荷へ少しずつ入れて送れます。'], 'redweave', 'redweave-mali', 'rockshade', 'jerky', 3, 62, 25, { seasons: ['spring'] }),
];
