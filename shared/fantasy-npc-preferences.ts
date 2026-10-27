import { NPC_PUBLIC, type NpcLocale } from './npc.ts';
import { FANTASY_ITEMS } from './fantasy-data.ts';
import { fantasyNpcTone } from './fantasy-dialogue-voice.ts';
import { fantasyTermName } from './fantasy-lore.ts';

type Text = Readonly<Record<NpcLocale, string>>;
const l = (ko: string, en: string, ja: string): Text => Object.freeze({ ko, en, ja });

const HOBBIES = {
  journals: l('쉬는 날에는 여행기를 읽는 걸 좋아해요.', 'I enjoy reading travel journals on my days off.', '休みの日には旅の記録を読むのが好きです。'),
  carving: l('작은 나무 동물을 깎는 게 취미예요.', 'I like carving little wooden animals.', '小さな木の動物を彫るのが趣味です。'),
  leaves: l('예쁜 낙엽을 눌러 책갈피로 만들곤 해요.', 'I press fallen leaves to make bookmarks.', 'きれいな落ち葉を押して、しおりにしています。'),
  paper: l('종이용을 접어 날려 보는 걸 좋아해요.', 'I like folding paper dragons and seeing how they fly.', '紙竜を折って飛ばすのが好きです。'),
  embroidery: l('옷자락에 작은 무늬를 수놓는 게 즐거워요.', 'I enjoy embroidering small patterns along hems.', '服の裾に小さな模様を刺繍するのが楽しみです。'),
  recipes: l('먹어 본 음식의 맛을 적어 두곤 해요.', 'I keep notes on dishes I have tasted.', '食べた料理の味を書き留めています。'),
  music: l('익숙한 민요를 조용히 흥얼거리는 걸 좋아해요.', 'I like quietly humming familiar folk songs.', '聞き慣れた民謡を小声で歌うのが好きです。'),
  pebbles: l('모양이 재미있는 작은 돌을 모아요.', 'I collect small stones with interesting shapes.', '面白い形の小石を集めています。'),
  knots: l('한가할 때 매듭을 여러 모양으로 묶어 봐요.', 'I try different decorative knots in my spare time.', '暇なときには、いろいろな飾り結びを試しています。'),
  sketches: l('주변 풍경을 목탄으로 그리는 걸 좋아해요.', 'I like making charcoal sketches of nearby scenery.', '身近な景色を木炭で描くのが好きです。'),
  letters: l('글씨를 천천히 따라 쓰면 마음이 편해져요.', 'Careful handwriting helps me unwind.', 'ゆっくり文字を書くと落ち着きます。'),
  tales: l('사람들이 들려주는 옛이야기를 좋아해요.', 'I enjoy listening to people tell old stories.', '人から昔話を聞くのが好きです。'),
  stars: l('맑은 밤에 별을 바라보는 게 취미예요.', 'I enjoy looking at the stars on clear nights.', '晴れた夜に星を眺めるのが趣味です。'),
  birds: l('멀찍이서 새를 관찰하고 그려 보곤 해요.', 'I watch birds from a distance and try sketching them.', '少し離れて鳥を眺め、絵に描いています。'),
  models: l('작은 배 모형을 만드는 걸 좋아해요.', 'I enjoy building miniature boats.', '小さな船の模型を作るのが好きです。'),
  games: l('친한 사람과 판놀이를 하는 게 즐거워요.', 'I enjoy board games with people I know well.', '親しい人と盤遊びをするのが楽しみです。'),
  garden: l('작은 화분을 돌보는 시간이 좋아요.', 'I like spending time tending small potted plants.', '小さな鉢植えを世話する時間が好きです。'),
  beads: l('색이 어울리는 구슬을 꿰는 걸 좋아해요.', 'I like threading beads in matching colors.', '色の合うビーズをつなぐのが好きです。'),
  walks: l('복잡하지 않은 길을 천천히 걷는 걸 좋아해요.', 'I enjoy slow walks along quiet paths.', '静かな道をゆっくり歩くのが好きです。'),
  riddles: l('답을 바로 알 수 없는 수수께끼가 재미있어요.', 'I enjoy riddles that take a while to solve.', 'すぐには解けないなぞなぞが好きです。'),
  mending: l('낡은 물건을 고쳐 다시 쓰는 게 즐거워요.', 'I enjoy repairing old things so they can be used again.', '古い物を直して、また使うのが楽しみです。'),
  scents: l('말린 허브의 향을 비교해 보는 걸 좋아해요.', 'I like comparing the scents of dried herbs.', '干した薬草の香りを比べるのが好きです。'),
  colors: l('천 조각을 나란히 놓고 색을 맞춰 보곤 해요.', 'I enjoy arranging scraps of cloth by color.', '布の切れ端を並べて色合わせをしています。'),
  whittling: l('나뭇가지를 깎아 작고 편한 손잡이를 만들어요.', 'I whittle small, comfortable handles from branches.', '枝を削って、小さく握りやすい柄を作っています。'),
  shells: l('빈 조개껍데기의 무늬를 살펴보는 걸 좋아해요.', 'I enjoy looking at the patterns on empty seashells.', '空の貝殻の模様を眺めるのが好きです。'),
  baking: l('빵 굽는 향을 맡으며 조리 기록을 읽는 게 좋아요.', 'I like reading cooking notes while bread is baking.', 'パンの焼ける香りの中で料理の覚え書きを読むのが好きです。'),
  clouds: l('구름을 보고 닮은 모양을 찾는 게 즐거워요.', 'I enjoy finding familiar shapes in clouds.', '雲を見て、何に似ているか考えるのが楽しみです。'),
  poetry: l('마음에 드는 짧은 시를 베껴 적곤 해요.', 'I copy out short poems that I like.', '気に入った短い詩を書き写しています。'),
  puzzles: l('작은 조각을 맞추는 퍼즐을 좋아해요.', 'I like puzzles made of little interlocking pieces.', '小さな木片を組み合わせるパズルが好きです。'),
  tea: l('차를 천천히 우리며 향이 바뀌는 걸 즐겨요.', 'I enjoy brewing tea slowly and noticing how its scent changes.', 'お茶をゆっくり淹れ、香りの変化を楽しみます。'),
} as const;

const DISLIKES = {
  sweet: l('지나치게 단 음식은 입에 잘 맞지 않아요.', 'Very sweet food is not really to my taste.', '甘すぎる食べ物は、あまり口に合いません。'),
  soggy: l('눅눅해진 비스킷은 별로 좋아하지 않아요.', 'I am not fond of biscuits that have gone soggy.', '湿気たビスケットは苦手です。'),
  shouting: l('바로 옆에서 큰 소리로 말하면 좀 힘들어요.', 'I find it tiring when someone shouts right beside me.', 'すぐそばで大声を出されるのは苦手です。'),
  promises: l('가볍게 약속하고 잊어버리는 태도는 싫어요.', 'I dislike careless promises that are soon forgotten.', '軽く約束して忘れてしまう態度は好きではありません。'),
  waste: l('멀쩡한 재료를 함부로 버리는 건 싫어요.', 'I dislike seeing usable materials thrown away carelessly.', '使える材料をむやみに捨てるのは嫌ですね。'),
  interrupt: l('읽고 있는 문장 중간에 자꾸 말을 걸면 집중하기 어려워요.', 'Frequent interruptions make it hard for me to read.', '読んでいる途中で何度も話しかけられると、集中できません。'),
  wetbooks: l('젖은 손으로 책을 만지는 건 참기 어려워요.', 'I really dislike books being handled with wet hands.', '濡れた手で本を触られるのは困ります。'),
  spicy: l('혀가 아플 만큼 매운 음식은 피하는 편이에요.', 'I avoid food spicy enough to hurt my tongue.', '舌が痛くなるほど辛い料理は避けています。'),
  burnt: l('음식에서 탄 맛이 강하게 나는 건 싫어요.', 'I dislike a strong burnt taste in food.', '料理の強い焦げ味は苦手です。'),
  boasting: l('남의 말은 듣지 않고 자랑만 하는 대화는 피곤해요.', 'I find it tiring when someone only boasts and never listens.', '人の話を聞かずに自慢ばかりする会話は疲れます。'),
  startling: l('쉬고 있는 동물을 일부러 놀라게 하는 건 싫어요.', 'I dislike people deliberately startling resting animals.', '休んでいる動物をわざと驚かせるのは嫌です。'),
  tangles: l('실이나 줄을 마구 엉켜 놓으면 답답해요.', 'Carelessly tangled thread or rope frustrates me.', '糸や縄をぐちゃぐちゃに絡ませるのは困ります。'),
  wetshoes: l('신발 안이 축축한 건 유난히 싫어요.', 'I particularly dislike having damp shoes.', '靴の中が湿っているのは特に苦手です。'),
  rushed: l('밥 먹는 걸 자꾸 재촉하면 입맛이 떨어져요.', 'Being rushed through a meal spoils my appetite.', '食事を急かされると、食欲がなくなります。'),
  grit: l('물건 사이에 모래가 끼어 서걱거리는 게 싫어요.', 'I dislike the gritty feel of sand caught between things.', '物の間に砂が入って、ざらつくのが苦手です。'),
  tools: l('쓰던 도구를 손질하지 않고 내버려 두는 건 싫어요.', 'I dislike tools being put away without proper care.', '使った道具を手入れせず放っておくのは嫌です。'),
  perfume: l('너무 강한 향수 냄새는 잘 견디지 못해요.', 'I have trouble with very strong perfume.', '強すぎる香水の匂いは苦手です。'),
  mess: l('쓰고 난 자리를 어질러 놓고 가는 건 싫어요.', 'I dislike people leaving a mess behind them.', '使った場所を散らかしたまま帰るのは嫌です。'),
  bitter: l('너무 쓰게 우린 차는 별로 좋아하지 않아요.', 'I am not fond of tea brewed so long that it turns bitter.', '濃く淹れすぎて苦くなったお茶は苦手です。'),
  crowding: l('말할 때 너무 바짝 다가오면 불편해요.', 'I feel uncomfortable when someone stands too close while talking.', '話すときに近づきすぎられると落ち着きません。'),
} as const;

export interface NpcPreference {
  readonly favoriteFood: string;
  readonly hobby: keyof typeof HOBBIES;
  readonly dislike: keyof typeof DISLIKES;
}
type Row = readonly [id: string, favoriteFood: string, hobby: keyof typeof HOBBIES, dislike: keyof typeof DISLIKES];

// 個人の好みは公開設定であり、贈答や好感度の効果を暗示しない。
const ROWS: readonly Row[] = [
  ['rin', 'herbal-tea', 'tales', 'rushed'],
  ['borin', 'pepper-stew', 'carving', 'tools'],
  ['eris', 'moon-dessert', 'letters', 'wetbooks'],
  ['hearth-alia', 'dried-apricot', 'beads', 'promises'],
  ['hearth-ced', 'royal-pudding', 'recipes', 'waste'],
  ['hearth-galen', 'hunter-hotpot', 'games', 'boasting'],
  ['hearth-mira', 'herbal-tea', 'leaves', 'interrupt'],
  ['hearth-iona', 'moonrice-ball', 'garden', 'shouting'],
  ['hearth-nyx', 'smoked-trout', 'paper', 'crowding'],
  ['emberhall-doran', 'spiced-roast', 'pebbles', 'promises'],
  ['emberhall-tessa', 'winter-broth', 'baking', 'mess'],
  ['emberhall-pell', 'honey-nuts', 'puzzles', 'tangles'],
  ['suncourt-livia', 'royal-pudding', 'colors', 'grit'],
  ['suncourt-orin', 'spiced-roast', 'recipes', 'burnt'],
  ['suncourt-juna', 'herbal-tea', 'embroidery', 'shouting'],
  ['suncourt-varren', 'pepper-stew', 'games', 'sweet'],
  ['suncourt-selia', 'moon-dessert', 'poetry', 'wetbooks'],
  ['suncourt-aurel', 'moonrice-ball', 'music', 'boasting'],
  ['suncourt-dema', 'dried-apricot', 'sketches', 'waste'],
  ['suncourt-fenn', 'honey-nuts', 'riddles', 'rushed'],
  ['tidehaven-mael', 'grilled-trout', 'shells', 'grit'],
  ['tidehaven-nora', 'salmon-stew', 'tales', 'mess'],
  ['tidehaven-bram', 'smoked-trout', 'models', 'tools'],
  ['tidehaven-vex', 'citrus-ade', 'knots', 'crowding'],
  ['dawnport-ren', 'spice-skewer', 'beads', 'promises'],
  ['dawnport-kiri', 'moonrice-ball', 'models', 'tangles'],
  ['dawnport-hana', 'herbal-tea', 'embroidery', 'rushed'],
  ['dawnport-toren', 'jerky', 'whittling', 'perfume'],
  ['mooncity-vela', 'moon-dessert', 'scents', 'mess'],
  ['mooncity-osric', 'winter-broth', 'games', 'shouting'],
  ['mooncity-nera', 'dried-apricot', 'poetry', 'boasting'],
  ['mooncity-isil', 'herbal-tea', 'sketches', 'wetbooks'],
  ['mooncity-sable', 'camp-coffee', 'puzzles', 'crowding'],
  ['starspire-lyra', 'moonrice-ball', 'stars', 'interrupt'],
  ['starspire-ett', 'trail-biscuit', 'riddles', 'soggy'],
  ['starspire-ada', 'honey-nuts', 'paper', 'rushed'],
  ['sunmeadow-lark', 'hunter-hotpot', 'birds', 'startling'],
  ['sunmeadow-moss', 'winter-broth', 'garden', 'waste'],
  ['verdant-quay-naia', 'citrus-ade', 'shells', 'promises'],
  ['verdant-quay-soren', 'salmon-stew', 'music', 'mess'],
  ['verdant-quay-bryn', 'smoked-trout', 'mending', 'tools'],
  ['verdant-quay-eva', 'moon-dessert', 'journals', 'wetbooks'],
  ['verdant-quay-coro', 'grilled-trout', 'recipes', 'burnt'],
  ['verdant-quay-ori', 'honey-nuts', 'knots', 'crowding'],
  ['loom-village-nemi', 'dried-apricot', 'colors', 'tangles'],
  ['loom-village-tal', 'winter-broth', 'tales', 'rushed'],
  ['loom-village-rosa', 'pepper-stew', 'walks', 'promises'],
  ['loom-village-ilya', 'herbal-tea', 'poetry', 'interrupt'],
  ['loom-village-wen', 'moonrice-ball', 'embroidery', 'waste'],
  ['saffron-port-safi', 'citrus-ade', 'beads', 'grit'],
  ['saffron-port-idris', 'spiced-roast', 'tales', 'rushed'],
  ['saffron-port-kora', 'spice-skewer', 'models', 'tools'],
  ['saffron-port-zahir', 'camp-coffee', 'scents', 'perfume'],
  ['saffron-port-samra', 'royal-pudding', 'recipes', 'burnt'],
  ['saffron-port-iven', 'dried-apricot', 'riddles', 'crowding'],
  ['redweave-sira', 'citrus-ade', 'colors', 'promises'],
  ['redweave-ferro', 'pepper-stew', 'puzzles', 'tools'],
  ['redweave-mali', 'spiced-roast', 'embroidery', 'mess'],
  ['redweave-badar', 'hunter-hotpot', 'games', 'promises'],
  ['redweave-belen', 'herbal-tea', 'letters', 'wetbooks'],
  ['redweave-ossa', 'trail-biscuit', 'pebbles', 'grit'],
  ['redweave-cass', 'moon-dessert', 'beads', 'crowding'],
  ['hearth-daren', 'jerky', 'knots', 'boasting'],
  ['suncourt-mirel', 'winter-broth', 'letters', 'promises'],
  ['redweave-voss', 'camp-coffee', 'games', 'shouting'],
  ['tidehaven-sena', 'smoked-trout', 'shells', 'boasting'],
  ['mooncity-nalin', 'moonrice-ball', 'puzzles', 'interrupt'],
  ['starspire-elys', 'moon-dessert', 'birds', 'startling'],
  ['suncourt-velren', 'herbal-tea', 'journals', 'interrupt'],
  ['dawnport-yuri', 'citrus-ade', 'garden', 'perfume'],
  ['saffron-port-rashal', 'spice-skewer', 'puzzles', 'mess'],
  ['sunmeadow-bora', 'honey-nuts', 'garden', 'waste'],
  ['verdant-quay-marin', 'grilled-trout', 'knots', 'tangles'],
  ['loom-village-teo', 'winter-broth', 'scents', 'promises'],
  ['greenwood-mena', 'moonrice-ball', 'leaves', 'startling'],
  ['whispergrove-tarin', 'herbal-tea', 'birds', 'shouting'],
  ['ironridge-gorda', 'pepper-stew', 'whittling', 'tools'],
  ['deepcave-nim', 'honey-nuts', 'pebbles', 'sweet'],
  ['reedfen-luma', 'grilled-trout', 'shells', 'waste'],
  ['oldwatch-orran', 'jerky', 'mending', 'boasting'],
  ['duskmire-suri', 'moon-dessert', 'music', 'perfume'],
  ['glassdesert-hadir', 'citrus-ade', 'stars', 'grit'],
  ['eclipsevault-irna', 'trail-biscuit', 'letters', 'wetbooks'],
  ['glass-isle-pela', 'smoked-trout', 'shells', 'mess'],
  ['drift-isle-aeron', 'dried-apricot', 'clouds', 'tangles'],
  ['mushroom-isle-hobi', 'hunter-hotpot', 'recipes', 'waste'],
  ['storm-isle-kera', 'pepper-stew', 'knots', 'wetshoes'],
  ['echo-isle-maro', 'grilled-trout', 'music', 'shouting'],
  ['rainvault-fenna', 'herbal-tea', 'clouds', 'wetbooks'],
  ['root-cavern-bohm', 'winter-broth', 'carving', 'grit'],
  ['fern-sanctum-lise', 'moonrice-ball', 'poetry', 'boasting'],
  ['windstep-ravi', 'spice-skewer', 'paper', 'rushed'],
  ['saltglass-nadia', 'dried-apricot', 'pebbles', 'wetshoes'],
  ['mirror-isle-ivena', 'citrus-ade', 'clouds', 'crowding'],
  ['inkstone-city-kenzo', 'moonrice-ball', 'colors', 'promises'],
  ['inkstone-city-suyeon', 'herbal-tea', 'tea', 'shouting'],
  ['inkstone-city-raiko', 'hunter-hotpot', 'letters', 'boasting'],
  ['inkstone-city-shiori', 'moon-dessert', 'embroidery', 'wetbooks'],
  ['inkstone-city-natsume', 'grilled-trout', 'recipes', 'rushed'],
  ['inkstone-city-hosu', 'honey-nuts', 'sketches', 'crowding'],
  ['pinewatch-iseul', 'dried-apricot', 'beads', 'tangles'],
  ['pinewatch-taesu', 'winter-broth', 'mending', 'wetshoes'],
  ['pinewatch-mireun', 'herbal-tea', 'garden', 'perfume'],
  ['pinewatch-hakum', 'pepper-stew', 'carving', 'waste'],
  ['reedcross-yori', 'smoked-trout', 'knots', 'promises'],
  ['reedcross-seoru', 'salmon-stew', 'tea', 'mess'],
  ['reedcross-dami', 'moonrice-ball', 'baking', 'burnt'],
  ['reedcross-junho', 'moon-dessert', 'music', 'shouting'],
  ['canopy-hall-saeha', 'honey-nuts', 'colors', 'waste'],
  ['canopy-hall-naon', 'herbal-tea', 'leaves', 'rushed'],
  ['canopy-hall-dohwa', 'hunter-hotpot', 'birds', 'boasting'],
  ['canopy-hall-harin', 'moonrice-ball', 'journals', 'wetbooks'],
  ['canopy-hall-baeon', 'salmon-stew', 'recipes', 'spicy'],
  ['canopy-hall-yeori', 'dried-apricot', 'paper', 'startling'],
  ['mossbrook-rami', 'honey-nuts', 'riddles', 'promises'],
  ['mossbrook-nuri', 'winter-broth', 'baking', 'rushed'],
  ['mossbrook-solan', 'herbal-tea', 'scents', 'mess'],
  ['mossbrook-garam', 'grilled-trout', 'shells', 'wetshoes'],
  ['leafshade-aro', 'dried-apricot', 'puzzles', 'grit'],
  ['leafshade-eunbi', 'moonrice-ball', 'embroidery', 'shouting'],
  ['leafshade-toli', 'royal-pudding', 'recipes', 'spicy'],
  ['leafshade-seolin', 'herbal-tea', 'leaves', 'perfume'],
  ['sunloom-kamil', 'citrus-ade', 'beads', 'promises'],
  ['sunloom-azra', 'dried-apricot', 'tea', 'rushed'],
  ['sunloom-nadim', 'spiced-roast', 'games', 'boasting'],
  ['sunloom-zuleh', 'moon-dessert', 'letters', 'grit'],
  ['sunloom-bahir', 'spice-skewer', 'scents', 'waste'],
  ['sunloom-samina', 'honey-nuts', 'embroidery', 'crowding'],
  ['wellrest-yasmin', 'dried-apricot', 'colors', 'promises'],
  ['wellrest-hassun', 'citrus-ade', 'tales', 'mess'],
  ['wellrest-dalia', 'spiced-roast', 'baking', 'burnt'],
  ['wellrest-ramiz', 'grilled-trout', 'models', 'wetshoes'],
  ['rockshade-samira', 'citrus-ade', 'riddles', 'grit'],
  ['rockshade-durak', 'pepper-stew', 'tea', 'rushed'],
  ['rockshade-tarek', 'spice-skewer', 'whittling', 'tools'],
  ['rockshade-kehra', 'jerky', 'pebbles', 'boasting'],
  ['sunmeadow-faye', 'royal-pudding', 'garden', 'mess'],
];

export const NPC_PREFERENCES: Readonly<Record<string, Readonly<NpcPreference>>> = Object.freeze(Object.fromEntries(
  ROWS.map(([id, favoriteFood, hobby, dislike]) => [id, Object.freeze({ favoriteFood, hobby, dislike })]),
));

export type NpcPreferenceTopic = 'food' | 'likes' | 'dislikes' | 'hobby';
export const NPC_PREFERENCE_QUESTIONS: Record<NpcPreferenceTopic, Record<NpcLocale, readonly string[]>> = {
  food: {
    ko: ['좋아하는 음식이 뭐야', '좋아하는 음식은 뭐야', '어떤 음식을 좋아해', '무슨 음식을 좋아해', '좋아하는 음식이 뭐예요', '좋아하는 음식은 뭔가요', '뭘 먹는 걸 좋아해', '뭘 먹는걸 좋아해', '좋아하는 음식을 알려줘', '가장 좋아하는 음식은 뭐야'],
    en: ['What is your favorite food', "What's your favorite food", 'What food do you like', 'What do you like to eat', 'What is your favourite food', 'Tell me your favorite food'],
    ja: ['好きな食べ物は何ですか', '好きな食べ物は', '何を食べるのが好き', '何を食べるのが好きですか', '好きな料理は何ですか', '好物は何ですか'],
  },
  likes: {
    ko: ['뭘 좋아해', '무엇을 좋아해', '좋아하는 게 뭐야', '좋아하는게 뭐야', '어떤 걸 좋아해', '뭘 좋아하세요', '무엇을 좋아하세요', '취향이 어때', '취향을 알려줘', '너는 뭘 좋아해', '좋아하는 것은 뭐야'],
    en: ['What do you like', 'What kinds of things do you like', 'Tell me about your tastes', 'What are your tastes'],
    ja: ['何が好きですか', '何が好き', '好きなものは何ですか', 'どんなものが好きですか', '好みを教えて'],
  },
  dislikes: {
    ko: ['뭘 싫어해', '무엇을 싫어해', '싫어하는 게 뭐야', '싫어하는게 뭐야', '어떤 걸 싫어해', '뭘 싫어하세요', '싫어하는 게 있나요'],
    en: ['What do you dislike', 'What do you hate', 'Is there anything you dislike', 'What bothers you'],
    ja: ['何が嫌いですか', '嫌いなものは何ですか', '苦手なものは何ですか', '嫌いなものはある', '何が苦手ですか'],
  },
  hobby: {
    ko: ['취미가 뭐야', '취미는 뭐야', '취미가 뭔가요', '취미가 뭐예요', '취미가 뭐에요', '쉬는 날에는 뭐 해', '쉬는날에는 뭐해', '여가 시간에 뭐 해', '취미를 알려줘', '취미가 있어', '무슨 취미가 있어'],
    en: ['What are your hobbies', 'What is your hobby', "What's your hobby", 'What do you do for fun', 'What do you do in your spare time', 'Do you have any hobbies'],
    ja: ['趣味は何ですか', '趣味は何', '休みの日は何をしていますか', '暇な時は何をするの', '趣味を教えて', '趣味はありますか'],
  },
};

const key = (text: string): string => text.normalize('NFKC').toLowerCase().replace(/’/gu, "'").trim().replace(/[.!?。！？]+$/gu, '').replace(/\s+/gu, '');
const MATCHES = new Map<string, NpcPreferenceTopic>();
for (const topic of Object.keys(NPC_PREFERENCE_QUESTIONS) as NpcPreferenceTopic[]) {
  for (const questions of Object.values(NPC_PREFERENCE_QUESTIONS[topic])) for (const question of questions) MATCHES.set(key(question), topic);
}
export function matchNpcPreferenceTopic(text: string): NpcPreferenceTopic | undefined {
  if (typeof text !== 'string' || !text || text.length > 180 || /[\p{Cc}\p{Cf}<>\[\]{}]/u.test(text)) return undefined;
  return MATCHES.get(key(text));
}

function sentence(npcId: string, locale: NpcLocale, text: string): string {
  const tone = fantasyNpcTone(npcId);
  if (locale === 'ko' && ['host', 'neighbour'].includes(tone)) {
    return text.replace(/^저는 /u, '나는 ').replace(/좋아해요\.$/u, '좋아해.').replace(/취미예요\.$/u, '취미야.').replace(/즐거워요\.$/u, '즐거워.').replace(/재미있어요\.$/u, '재미있어.').replace(/편해져요\.$/u, '편해져.').replace(/모아요\.$/u, '모아.').replace(/만들어요\.$/u, '만들어.').replace(/곤 해요\.$/u, '곤 해.').replace(/봐요\.$/u, '봐.').replace(/지 않아요\.$/u, '지 않아.').replace(/편이에요\.$/u, '편이야.').replace(/싫어요\.$/u, '싫어.').replace(/힘들어요\.$/u, '힘들어.').replace(/피곤해요\.$/u, '피곤해.').replace(/어려워요\.$/u, '어려워.').replace(/답답해요\.$/u, '답답해.').replace(/떨어져요\.$/u, '떨어져.').replace(/불편해요\.$/u, '불편해.').replace(/못해요\.$/u, '못해.').replace(/좋아요\.$/u, '좋아.');
  }
  if (locale === 'ko' && ['forge', 'leader', 'covert'].includes(tone)) {
    return text.replace(/좋아해요\.$/u, '좋아하지.').replace(/취미예요\.$/u, '취미지.').replace(/즐거워요\.$/u, '즐겁지.').replace(/흥미로워요\.$/u, '흥미롭지.').replace(/재미있어요\.$/u, '재미있지.').replace(/편해져요\.$/u, '편해지지.').replace(/모아요\.$/u, '모으곤 하지.').replace(/만들어요\.$/u, '만들곤 하지.').replace(/보곤 해요\.$/u, '보곤 하지.').replace(/곤 해요\.$/u, '곤 하지.').replace(/봐요\.$/u, '보곤 하지.').replace(/지 않아요\.$/u, '지 않지.').replace(/편이에요\.$/u, '편이지.').replace(/싫어요\.$/u, '싫지.').replace(/힘들어요\.$/u, '힘들지.').replace(/피곤해요\.$/u, '피곤하지.').replace(/어려워요\.$/u, '어렵지.').replace(/답답해요\.$/u, '답답하지.').replace(/떨어져요\.$/u, '떨어지지.').replace(/불편해요\.$/u, '불편하지.').replace(/못해요\.$/u, '못하지.').replace(/좋아요\.$/u, '좋지.');
  }
  if (locale === 'ja' && ['forge', 'covert'].includes(tone)) {
    return text.replace(/好物は(.+)です。$/u, '好物は$1だ。').replace(/好きです。$/u, '好きだ。').replace(/趣味です。$/u, '趣味だ。').replace(/楽しみです。$/u, '楽しみだ。').replace(/苦手です。$/u, '苦手だ。').replace(/しています。$/u, 'している。').replace(/います。$/u, 'いる。').replace(/落ち着きます。$/u, '落ち着く。').replace(/ありません。$/u, 'ない。').replace(/嫌ですね。$/u, '嫌だな。').replace(/嫌です。$/u, '嫌だ。').replace(/困ります。$/u, '困る。').replace(/疲れます。$/u, '疲れる。').replace(/できません。$/u, 'できない。').replace(/なくなります。$/u, 'なくなる。');
  }
  return text;
}

export function npcPreferenceFacts(npcId: string, locale: NpcLocale): readonly string[] {
  const preferences = NPC_PREFERENCES[npcId];
  if (!preferences || !NPC_PUBLIC.some(npc => npc.id === npcId) || !['ko', 'en', 'ja'].includes(locale)) return [];
  const item = FANTASY_ITEMS.find(item => item.id === preferences.favoriteFood);
  if (!item) return [];
  const food = item.names?.[locale] ?? (locale === 'ja' ? item.name : fantasyTermName(item.id, locale));
  const foodSentence = locale === 'ko' ? `저는 ${food}${/[가-힣]$/u.test(food) && (food.charCodeAt(food.length - 1) - 0xac00) % 28 ? '을' : '를'} 좋아해요.` : locale === 'en' ? `I like ${food} best.` : `好物は${food}です。`;
  const naturalFood = locale === 'ko' && ['forge', 'leader', 'covert'].includes(fantasyNpcTone(npcId)) ? foodSentence.replace(/^저는 /u, '나는 ') : foodSentence;
  return Object.freeze([sentence(npcId, locale, naturalFood), sentence(npcId, locale, HOBBIES[preferences.hobby][locale]), sentence(npcId, locale, DISLIKES[preferences.dislike][locale])]);
}

export function npcPreferenceReply(npcId: string, locale: NpcLocale, text: string): string | undefined {
  const topic = matchNpcPreferenceTopic(text);
  if (!topic) return undefined;
  const facts = npcPreferenceFacts(npcId, locale);
  if (!facts.length) return undefined;
  return topic === 'food' ? facts[0] : topic === 'hobby' ? facts[1] : topic === 'dislikes' ? facts[2] : `${facts[0]} ${facts[1]}`;
}
