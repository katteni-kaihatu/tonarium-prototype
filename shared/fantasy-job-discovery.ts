import type { FantasyCharacter } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_JOB_PATH_CATALOG } from './fantasy-job-path-catalog.ts';
import { FANTASY_RELICS } from './fantasy-relic-catalog.ts';

const BOOKS: Record<string, string[]> = {
  adventurer: ['archive-records', 'field-signs', 'sylvara-journal', 'quiet-sword'],
  ranger: ['field-signs', 'lantern-fox', 'staff-and-footwork', 'kazaran-journal'],
  hunter: ['field-signs', 'lantern-fox', 'staff-and-footwork', 'kazaran-journal'],
  bard: ['tin-pot-king', 'argument-of-hats', 'archive-records', 'weather-in-a-bottle'],
  mage: ['mirrorwake-voyage', 'mana-primer', 'weather-in-a-bottle', 'stone-and-flame', 'mana-shapes'],
  leader: ['trades-handbook', 'quiet-sword', 'traveler-guide', 'caravan-ledger'],
  warrior: ['quiet-sword', 'stone-and-flame', 'kazaran-journal', 'martial-practice'],
  knight: ['mender-notes', 'staff-and-footwork', 'tin-pot-king', 'words-and-promises'],
  spearfighter: ['staff-and-footwork', 'field-signs', 'mirrorwake-voyage', 'martial-practice'],
  archer: ['wood-and-hide', 'sylvara-journal', 'advanced-mana-forms', 'arts-handbook'],
  scout: ['sylvara-journal', 'traveler-guide', 'borrowed-shadow', 'field-signs'],
  pugilist: ['staff-and-footwork', 'mana-primer', 'argument-of-hats', 'martial-practice'],
  spellblade: ['mana-shapes', 'weather-in-a-bottle', 'advanced-mana-forms', 'gate-records'],
  shieldbearer: ['mender-notes', 'quiet-sword', 'martial-practice', 'words-and-promises'],
  summoner: ['mana-primer', 'lantern-fox', 'arts-handbook', 'borrowed-shadow'],
  merchant: ['caravan-ledger', 'harbor-signals', 'archive-records', 'trades-handbook'],
  blacksmith: ['stone-and-flame', 'mender-notes', 'advanced-mana-forms', 'one-hundred-spoons'],
  cook: ['tin-pot-king', 'pantry-guide', 'remedies-and-rites', 'harbor-signals'],
  alchemist: ['remedies-and-rites', 'mana-shapes', 'gate-records', 'weather-in-a-bottle'],
  carpenter: ['mender-notes', 'wood-and-hide', 'small-balcony-garden', 'arts-handbook'],
  tailor: ['argument-of-hats', 'kazaran-journal', 'mender-notes', 'cloth-and-thread'],
  weaver: ['cloth-and-thread', 'rain-tailor', 'mana-shapes', 'harbor-signals'],
  leatherworker: ['wood-and-hide', 'sylvara-journal', 'traveler-guide', 'caravan-ledger'],
  gemcutter: ['arts-handbook', 'gate-records', 'weather-in-a-bottle', 'stone-and-flame'],
  herbalist: ['green-and-grain', 'kazaran-journal', 'remedies-and-rites', 'small-balcony-garden'],
  farmer: ['green-and-grain', 'small-balcony-garden', 'remedies-and-rites', 'mana-primer'],
  fisher: ['harbor-signals', 'mirrorwake-voyage', 'sylvara-journal', 'weather-in-a-bottle'],
  baker: ['tin-pot-king', 'pantry-guide', 'traveler-guide', 'one-hundred-spoons'],
  potter: ['one-hundred-spoons', 'stone-and-flame', 'words-and-promises', 'mana-shapes'],
  shipwright: ['caravan-ledger', 'harbor-signals', 'wood-and-hide', 'gate-records'],
  scribe: ['words-and-promises', 'archive-records', 'mirrorwake-voyage', 'advanced-mana-forms'],
  thief: ['borrowed-shadow', 'lantern-fox', 'field-signs', 'rain-tailor'],
  smuggler: ['harbor-signals', 'kazaran-journal', 'caravan-ledger', 'borrowed-shadow'],
  assassin: ['shadow-and-risk', 'remedies-and-rites', 'borrowed-shadow', 'argument-of-hats'],
  bandit: ['shadow-and-risk', 'kazaran-journal', 'mirrorwake-voyage', 'tin-pot-king'],
  spy: ['borrowed-shadow', 'archive-records', 'gate-records', 'words-and-promises'],
  crimeboss: ['argument-of-hats', 'shadow-and-risk', 'harbor-signals', 'archive-records'],
};
const PRIEST_PATHS = [
  { id: 'priest-care', names: { ko: '돌봄의 길', en: 'Path of Care', ja: '慈しみの道' }, book: 'remedies-and-rites' },
  { id: 'priest-ward', names: { ko: '수호의 길', en: 'Path of Shelter', ja: '守護の道' }, book: 'quiet-sword' },
  { id: 'priest-oath', names: { ko: '서약의 길', en: 'Path of Oaths', ja: '誓いの道' }, book: 'words-and-promises' },
  { id: 'priest-pilgrim', names: { ko: '순례의 길', en: 'Path of Pilgrimage', ja: '巡礼の道' }, book: 'traveler-guide' },
];
export const FANTASY_JOB_DISCOVERY_BOOKS: Record<string, string> = Object.fromEntries([
  ...Object.entries(BOOKS).flatMap(([job, books]) => FANTASY_JOB_PATH_CATALOG.filter(path => path.job === job).map((path, index) => [path.id, books[index]])),
  ...PRIEST_PATHS.map(path => [path.id, path.book]),
]);
type Story = [ko: string, en: string, ja: string];
const STORIES: Record<string, Story> = {
  'traveler-guide': [
    '낡은 숙박장에는 {a}라는 이름들이 같은 날 서명되어 있었다. {b}라는 이름의 손님들은 서로 다른 짐을 메고도 마지막 물통을 나누었다. 길을 오래 기억한 것은 그날의 목적지보다 그들의 작은 배려였다.',
    'The worn guest register held the names {a} beneath the same date. Travelers called {b} carried different burdens, yet shared the last water flask. Their small kindness outlasted the memory of that day’s destination.',
    '古い宿帳の同じ日付に、{a}という名が並んでいた。{b}と呼ばれる客たちは違う荷を背負いながら、最後の水筒を分けた。その日の行き先より、小さな心遣いが長く記憶に残った。',
  ],
  'arts-handbook': [
    '수선된 책장 사이에 {a}의 관찰 쪽지가 끼어 있었다. 뒷면에는 {b}가 같은 물체를 전혀 다르게 그린 그림이 남았다. 어느 그림도 다른 그림의 잘못을 증명하려 하지 않았다.',
    'Between repaired pages lay observation slips signed {a}. On their backs, {b} had drawn the same object in entirely different ways. None of the drawings tried to prove the others wrong.',
    '補修された頁に、{a}の観察メモが挟まっていた。裏には{b}が同じ物をまるで違う姿で描いている。どの絵も、ほかの絵の間違いを証明しようとはしていなかった。',
  ],
  'trades-handbook': [
    '장날이 끝난 뒤 {a}는 비어 있는 계산대를 닦았다. {b}는 남은 수레를 누구에게 돌려줄지 의논했다. 그날의 장부 마지막에는 금액 대신 돌려받은 신뢰가 적혀 있었다.',
    'After market day, {a} wiped the empty counters. {b} discussed whose carts still needed returning. The ledger ended with recovered trust rather than a sum of coins.',
    '市が終わると{a}が空いた勘定台を拭いた。{b}は残った荷車を誰に返すか話し合う。その日の帳簿の末尾には、金額ではなく取り戻した信用が記された。',
  ],
  'pantry-guide': [
    '겨울 부엌의 벽에는 {a}가 남긴 밀가루 손자국이 있었다. {b}는 식은 화덕에 귀를 대고 아직 남아 있는 열을 찾았다. 서로 다른 손맛이 같은 식탁을 기다리고 있었다.',
    'Flour handprints left by {a} marked the winter kitchen wall. {b} listened to the cooling oven for its remaining warmth. Different crafts waited for the same table.',
    '冬の台所の壁には、{a}の粉の手形が残っていた。{b}は冷める炉に耳を寄せ、残った熱を探す。異なる手の味が同じ食卓を待っていた。',
  ],
  'gate-records': [
    '전이문 곁의 부서진 작업대에는 {a}의 서명이 희미했다. 먼 곳에서 온 {b}는 깨진 부품을 서둘러 버리지 않고 종이에 윤곽부터 옮겼다. 이동의 흔적이 때로는 움직이지 않는 종이에 남는다.',
    'Faded signatures of {a} marked a broken bench beside the gate. Visiting {b} traced the shattered parts before throwing anything away. Sometimes the trace of a journey remains on unmoving paper.',
    '転移門脇の壊れた作業台に、{a}の署名が薄く残る。遠来の{b}は破片を捨てず、まず紙に輪郭を写した。移動の跡が、動かぬ紙に残ることもある。',
  ],
  'archive-records': [
    '비에 젖은 명부에서 {a}라는 이름을 읽었다. {b}가 남긴 여백의 글씨는 명부와 날짜가 달랐다. 기록관은 두 종이를 억지로 합치지 않고 같은 상자에 나란히 두었다.',
    'A rain-soaked roster yielded the names {a}. Marginal notes signed {b} bore a different date. The archivist placed the papers side by side instead of forcing them into one account.',
    '雨に濡れた名簿から{a}という名を読んだ。{b}の余白の書き込みには別の日付がある。記録係は二枚を無理に繋がず、同じ箱に並べて置いた。',
  ],
  'martial-practice': [
    '연습장 모래에는 {a}의 발자국이 깊게 남았다. {b}는 지친 동료가 지나갈 자리를 비워 두고 마지막 동작을 멈췄다. 강한 동작보다 멈춘 까닭이 수첩에 오래 적혔다.',
    'The practice sand held deep footprints of {a}. {b} stopped the final movement to leave room for a tired companion. The notebook remembered the reason for stopping longer than the force of the blow.',
    '稽古場の砂に{a}の足跡が深く残る。{b}は疲れた仲間の通り道を空け、最後の動きを止めた。力強さより、止まった理由が手帳に長く記された。',
  ],
  'field-signs': [
    '갈림길의 나무에는 {a}가 매달아 둔 낡은 끈이 흔들렸다. {b}는 그 표식 옆에 날짜가 다른 흔적을 조심스레 그려 넣었다. 다음 날 지나간 아이는 두 표시가 모두 집으로 돌아오는 방향임을 알아보았다.',
    'An old cord tied by {a} swayed at the fork. {b} carefully sketched signs from another day beside it. A child passing later saw that both marks pointed toward a way home.',
    '分かれ道の木で、{a}が結んだ古い紐が揺れる。{b}は別の日の跡を、その横にそっと描き添えた。後から通った子は、二つとも帰り道を示すと気づいた。',
  ],
  'wood-and-hide': [
    '비에 젖은 작업장에서는 {a}가 오래된 재료를 펼쳤다. {b}는 부러진 것보다 다시 이을 수 있는 자리를 먼저 찾아냈다. 주인은 새 물건보다 고쳐 쓰는 손의 이름을 기억했다.',
    'In the rain-damp workshop, {a} laid out old materials. {b} looked first for places that could be joined again. The owner remembered the hands that repaired more clearly than any new object.',
    '雨に湿った工房で、{a}が古い材料を広げた。{b}は壊れた箇所より、もう一度繋げる場所を先に見つける。持ち主は新品より、直す手の名を覚えていた。',
  ],
  'cloth-and-thread': [
    '헝겊 상자 안에는 {a}가 접어 둔 옷감과 {b}의 짧은 편지가 함께 있었다. 편지는 새 옷을 자랑하지 않고 오래 입은 소매가 누구의 어깨를 덮었는지 물었다.',
    'The cloth chest held fabric folded by {a} and a short letter from {b}. The letter did not boast of new clothes; it asked whose shoulders the old sleeves had sheltered.',
    '布箱には{a}の畳んだ生地と、{b}の短い手紙があった。新品を誇る手紙ではない。長く着た袖が誰の肩を守ったかを尋ねていた。',
  ],
  'stone-and-flame': [
    '가마가 식는 동안 {a}는 깨진 돌과 쇳조각을 차례로 늘어놓았다. {b}는 어느 조각이 마지막 열을 오래 품는지 지켜보았다. 재의 색이 바뀌는 밤에는 서두르지 않는 손이 필요했다.',
    'While the kiln cooled, {a} lined up broken stone and metal. {b} watched which fragments held the last heat longest. A night of changing ash colors needed patient hands.',
    '窯が冷める間、{a}は割れた石と鉄片を並べた。{b}はどの欠片が最後の熱を長く抱くか見守る。灰の色が変わる夜には、急がぬ手が要った。',
  ],
  'green-and-grain': [
    '첫 서리 뒤에 {a}는 빈 바구니를 들고 밭 가장자리를 걸었다. {b}는 뽑지 않은 뿌리 옆에 작은 나무 표식을 꽂았다. 다음 계절을 위해 남긴 것이 그날 거둔 것만큼 소중했다.',
    'After the first frost, {a} walked the field edge with empty baskets. {b} placed small wooden markers beside roots left in the soil. What remained for next season mattered as much as that day’s harvest.',
    '初霜の後、{a}は空籠を持って畑の縁を歩いた。{b}は抜かなかった根の横に小さな木札を立てる。次の季節へ残したものも、その日の収穫と同じほど大切だった。',
  ],
  'remedies-and-rites': [
    '회복실의 작은 탁자에는 {a}가 놓고 간 물잔이 남았다. {b}라는 글씨가 적힌 천은 낡았지만 깨끗이 빨려 있었다. 병상 곁에서는 자신의 이름보다 곁에 남는 시간이 더 긴 대답이었다.',
    'Small water cups left by {a} remained on the recovery-room table. Cloth marked {b} was worn but freshly washed. Beside the sickbed, staying a while answered more than a proud name.',
    '療養室の小卓に、{a}が残した水杯があった。{b}と書かれた布は古いが清潔に洗われている。病床の傍らでは、名乗りより長く寄り添う時間が答えになった。',
  ],
  'words-and-promises': [
    '서명란에는 {a}가 남긴 잉크 자국이 보였다. {b}의 손때가 밴 쪽지는 지키지 못한 약속을 솔직히 적은 문장이 더 길었다. 찢지 않은 그 쪽지가 다음 만남의 자리를 남겼다.',
    'The signature space bore ink left by {a}. On a page worn by the hands of {b}, the honest account of a failed promise was the longest entry. The un-torn page left room for another meeting.',
    '署名欄には{a}の墨跡が残っていた。{b}の手垢のついた紙には、守れなかった約束の正直な記録が最も長く記される。破らなかった一頁が、次に会う場所を残した。',
  ],
  'shadow-and-risk': [
    '닫힌 선술집 문틈에서 {a}의 이야기가 흘러나왔다. {b}가 잃어버린 것은 금화만이 아니었다고 한다. 다음 장의 주인은 그 이야기를 멋진 무용담으로 고쳐 쓰지 않았다.',
    'Stories of {a} drifted through a shuttered tavern door. They said {b} had lost more than coins. The next keeper of the notebook refused to turn the account into a glorious adventure.',
    '閉ざされた酒場の戸隙から、{a}の話が漏れた。{b}が失ったのは金貨だけではなかったという。次に手帳を持った者は、それを華々しい武勇伝に書き換えなかった。',
  ],
  'advanced-mana-forms': [
    '창가의 오래된 종이에는 {a}가 그린 흐름의 윤곽이 남았다. {b}는 그 위를 덧그리지 않고 다른 종이에 자신의 떨리는 선을 남겼다. 같은 힘을 바라보아도 손이 기억하는 모양은 달랐다.',
    'Old paper at the window bore outlines drawn by {a}. Rather than tracing over them, {b} left trembling lines on a fresh sheet. The same power could leave different shapes in different hands.',
    '窓辺の古紙に、{a}が描いた流れの輪郭が残る。{b}はなぞらず、別紙に震える線を引いた。同じ力を見ても、手に残る形は異なる。',
  ],
  'lantern-fox': [
    '여우는 숲에서 만난 {a}에게 빌린 등불을 자랑했다. {b}는 불빛을 쫓지 말고 돌아갈 나무를 기억하라고 일렀다. 여우는 마지막에 등불보다 긴 그림자를 돌려주고 달아났다.',
    'The fox boasted of its borrowed lantern to {a} in the woods. {b} told it to remember the homeward tree instead of chasing the light. In the end, the fox returned a shadow longer than the lantern and ran away.',
    '狐は森で会った{a}に、借りた灯りを自慢した。{b}は光を追うより帰りの木を覚えよと言う。狐は最後に灯りより長い影を返し、走り去った。',
  ],
  'tin-pot-king': [
    '양철냄비 왕의 엉뚱한 연회에는 {a}가 초대되었다. {b}는 왕관보다 큰 숟가락을 들고 입장해 모두를 웃겼다. 왕은 빈 접시를 보고서야 허세보다 따뜻한 저녁이 낫다는 사실을 배웠다.',
    'The Tin-Pot King invited {a} to an absurd banquet. {b} arrived carrying spoons larger than the crown and made everyone laugh. Only the empty plates taught the king that a warm supper mattered more than pomp.',
    'ブリキ鍋の王の妙な宴に、{a}が招かれた。{b}は王冠より大きな匙を持って現れ、皆を笑わせる。空の皿を見て初めて、王は見栄より温かな夕食がよいと学んだ。',
  ],
  'rain-tailor': [
    '비를 꿰매던 재봉사는 {a}의 천을 빌려 작은 구멍을 막았다. {b}는 빗방울 대신 달빛을 주머니에 넣어 달라며 웃었다. 재봉사는 주머니를 비워 두어야 하늘을 더 많이 담는다고 대답했다.',
    'The tailor sewing the rain borrowed cloth from {a} to close a tiny hole. {b} laughed and asked for moonlight in the pockets instead of raindrops. The tailor said empty pockets could hold more sky.',
    '雨を縫う仕立屋は{a}の布を借り、小穴を塞いだ。{b}は雨粒より月明かりをポケットへ入れてくれと笑う。仕立屋は、空のポケットこそ空を多く入れられると答えた。',
  ],
  'borrowed-shadow': [
    '장화를 빌린 아이는 {a}의 발자국을 따라가다 자기 그림자를 잃었다. {b}는 남의 그림자를 입어도 집으로 돌아갈 발은 빌릴 수 없다고 했다. 아이는 새벽에 제 그림자가 기다리는 문을 두드렸다.',
    'The child in borrowed boots followed the footprints of {a} and lost its own shadow. {b} said another shadow could be worn, but no one could lend the feet that found home. At dawn, the child knocked where its shadow waited.',
    '借りた長靴の子は{a}の足跡を追い、自分の影を失った。{b}は影を借りても、家へ帰る足は借りられぬと言う。夜明けに子は、自分の影が待つ戸を叩いた。',
  ],
  'quiet-sword': [
    '해 질 무렵 {a}는 검을 뽑지 않은 채 마당을 비웠다. {b}는 쓰러진 훈련 표적을 다시 세우고 뒤에 선 사람을 돌아보았다. 그 조용한 저녁에는 승자를 부르는 외침이 없었다.',
    'At dusk, {a} left the yard without drawing a blade. {b} raised a fallen practice target and checked the people standing behind. No victor was hailed that quiet evening.',
    '夕暮れに{a}は剣を抜かず庭を空けた。{b}は倒れた稽古標を立て直し、後ろの人を振り返る。その静かな夕べに、勝者を呼ぶ声はなかった。',
  ],
  'staff-and-footwork': [
    '오래된 연습 기록에는 {a}가 미끄러진 자리부터 그려져 있었다. {b}는 그 옆에 무사히 멈춘 발자국을 덧붙였다. 첫 장에 남은 것은 멋진 자세보다 서로 부딪치지 않은 간격이었다.',
    'The old practice notes began with the places where {a} had slipped. {b} added the footprints of safe stops. The first page preserved spacing that avoided collisions rather than impressive poses.',
    '古い稽古帳は、{a}が滑った場所から描かれていた。{b}は隣に安全に止まった足跡を添える。最初の頁に残ったのは、立派な姿勢より互いにぶつからぬ間合いだった。',
  ],
  'mana-primer': [
    '창문이 열린 방에서 {a}는 흔들리는 촛불을 바라보았다. {b}는 촛불을 세게 만들려 하지 않고 자신의 숨부터 고르게 했다. 저녁 일기에는 큰 기적 대신 손끝이 덜 떨렸다는 문장만 남았다.',
    'In a room with an open window, {a} watched the wavering candle. {b} steadied their breathing instead of trying to enlarge its flame. The evening diary recorded no miracle, only hands that trembled less.',
    '窓を開けた部屋で、{a}が揺れる蝋燭を見た。{b}は火を大きくしようとせず、まず息を整える。夕べの日記には奇跡でなく、手の震えが減ったとだけ記された。',
  ],
  'mana-shapes': [
    '연못가에 놓인 그릇에는 {a}가 남긴 물결이 번졌다. {b}는 서로 다른 그릇을 포개지 않고 나란히 놓았다. 물이 가라앉자 어느 그릇에도 같은 하늘이 비쳤다.',
    'Ripples left by {a} spread through bowls beside the pond. {b} placed the different vessels side by side rather than stacking them. When the water settled, each reflected the same sky.',
    '池辺の器に、{a}が残した波紋が広がる。{b}は異なる器を重ねず並べた。水が静まると、どの器にも同じ空が映った。',
  ],
  'mender-notes': [
    '찢어진 앞치마 안쪽에 {a}의 감사 쪽지가 꿰매져 있었다. {b}는 수선비 대신 다음에 부러진 의자를 가져오겠다고 적었다. 고쳐 쓰는 약속은 물건보다 오래 남기도 한다.',
    'A thank-you note from {a} had been stitched inside the torn apron. {b} promised to bring the next broken chair instead of a repair fee. A promise to mend can outlast the object.',
    '破れた前掛けの裏に、{a}のお礼の紙が縫い込まれていた。{b}は代金の代わりに、次の壊れた椅子を持ってくると書く。直す約束は品より長く残ることもある。',
  ],
  'small-balcony-garden': [
    '작은 난간에서 {a}는 서로 다른 화분을 돌보았다. {b}는 빈 화분에도 이름표를 꽂아 아직 오지 않은 봄을 기다렸다. 아래층 아이는 어느 화분이 가장 큰지보다 어느 것이 먼저 향기를 내는지 세었다.',
    'On the small balcony, {a} tended different pots. {b} labeled even an empty pot while waiting for a spring not yet arrived. The child below counted the first scents rather than the tallest stems.',
    '小さな欄干で、{a}が異なる鉢を世話した。{b}は空の鉢にも札を立て、まだ来ぬ春を待つ。階下の子は背の高さより、最初に香る鉢を数えた。',
  ],
  'caravan-ledger': [
    '물이 모자란 날 {a}는 장부를 덮고 그늘부터 나누었다. {b}가 남긴 화물표에는 누구의 짐이 가벼워졌는지도 적혀 있었다. 그 장을 읽을 때마다 은화 소리보다 물잔 부딪치는 소리가 먼저 떠올랐다.',
    'When water ran short, {a} closed the ledger and shared the shade first. Cargo slips left by {b} recorded whose burdens had been lightened. The page recalled cups touching before it recalled silver coins.',
    '水の足りぬ日、{a}は帳簿を閉じて先に日陰を分けた。{b}の荷札には、誰の荷が軽くなったかもある。その頁からは銀貨より水杯の触れる音が先に浮かんだ。',
  ],
  'harbor-signals': [
    '부두에서 {a}는 떠나는 배를 향해 손을 흔들었다. {b}는 돌아오는 사람을 위해 젖은 밧줄을 먼저 정리했다. 다른 깃발을 쓰는 이들도 안개가 끼면 같은 항구의 불빛을 찾았다.',
    'At the quay, {a} waved to a departing ship. {b} cleared wet ropes for those returning. Even crews under different flags sought the same harbor lights in the fog.',
    '埠頭で{a}が出る船へ手を振った。{b}は帰る人のため、濡れた綱を先に片づける。違う旗の船も、霧の中では同じ港の灯りを探した。',
  ],
  'sylvara-journal': [
    '젖은 소매의 일기에는 {a}와 함께 걸었던 숲길이 적혀 있었다. {b}는 길을 넓히기 전에 비가 모이는 자리를 비워 두었다. 잎 위에서 떨어진 물방울이 지워진 지명 대신 작은 점을 남겼다.',
    'The damp-sleeved journal recorded a forest road walked with {a}. {b} left room for collected rain before widening the path. Drops from the leaves left small dots where place names had washed away.',
    '濡れた袖の日記には、{a}と歩いた森道が記される。{b}は道を広げる前に、雨の集まる場所を空けた。葉から落ちる滴が、消えた地名の代わりに小点を残した。',
  ],
  'kazaran-journal': [
    '카자란의 밤바람 속에서 {a}는 낮에 접었던 겉옷을 펼쳤다. {b}는 모닥불을 가운데 두고 물통을 가까이 옮겼다. 서로 다른 사정으로 길에 나선 이들이 그날만큼은 같은 추위를 나누었다.',
    'In Kazaran’s night wind, {a} unfolded the layers packed away by day. {b} moved the water jars closer around the fire. Travelers with different reasons for leaving home shared the same cold that night.',
    'カザランの夜風に、{a}が昼に畳んだ上着を広げた。{b}は焚き火を囲んで水甕を寄せる。異なる事情で旅立った者たちも、その夜は同じ寒さを分けた。',
  ],
  'mirrorwake-voyage': [
    '항해록의 젖은 가장자리에는 {a}의 짧은 관찰이 남아 있었다. {b}는 밤하늘과 물 위의 반짝임을 서로 다른 줄에 그렸다. 보았다는 말과 안다는 말 사이에는 아직 넓은 바다가 있었다.',
    'Short observations by {a} survived at the voyage log’s damp edge. {b} drew the night sky and the glints on the water on separate lines. A wide sea still lay between having seen and having understood.',
    '航海録の濡れた端に、{a}の短い観察が残る。{b}は夜空と水上のきらめきを別の行に描いた。見たことと知ったことの間には、まだ広い海があった。',
  ],
  'one-hundred-spoons': [
    '숟가락을 모은 노인은 {a}에게 가장 쓸모없는 것을 골라 달라고 했다. {b}는 그 숟가락으로 화분의 흙을 고르고는 빈 접시를 건넸다. 노인은 쓸모없는 물건보다 아직 떠오르지 않은 쓰임이 많다고 웃었다.',
    'The spoon collector asked {a} to choose the least useful one. {b} used it to level a flowerpot and handed back an empty plate. The old collector laughed that there were more undiscovered uses than useless things.',
    '匙集めの老人は{a}に、最も役立たぬ一本を選ばせた。{b}はそれで鉢土を均し、空の皿を返す。役立たぬ品より、まだ思いつかぬ使い道が多いと老人は笑った。',
  ],
  'argument-of-hats': [
    '모자들의 회의에 {a}가 보낸 초대장이 도착했다. {b}의 모자는 서로 높이를 자랑하다가 낮은 문턱에 모두 걸렸다. 가장 낡은 모자만 주인을 기다리며 조용히 의자 밑에 앉아 있었다.',
    'Invitations from {a} reached the council of hats. The hats of {b} boasted of their height until every one caught on a low doorway. Only the oldest hat waited quietly beneath a chair for its owner.',
    '帽子たちの会議に、{a}の招待状が届いた。{b}の帽子は高さを誇り、揃って低い戸口に引っかかる。いちばん古い帽子だけが椅子の下で静かに持ち主を待った。',
  ],
  'weather-in-a-bottle': [
    '병 속의 구름을 바라보며 {a}는 오늘의 냄새를 적었다. {b}는 병마개를 열지 않은 채 바깥 하늘과 색을 비교했다. 병이 맑아져도 내일의 날씨를 안다고 말하는 이는 없었다.',
    'Watching the cloud in the bottle, {a} recorded the day’s scent. {b} compared its color with the sky without opening the stopper. Even when the bottle cleared, nobody claimed to know tomorrow’s weather.',
    '瓶の雲を見ながら、{a}がその日の匂いを記した。{b}は栓を開けず、外の空と色を比べる。瓶が晴れても、明日の天気を知ったと言う者はいなかった。',
  ],
};
const PATHS = [...FANTASY_JOB_PATH_CATALOG, ...PRIEST_PATHS];
export function fantasyJobPathDiscovered(c: Pick<FantasyCharacter, 'readBooks' | 'jobPaths' | 'priestGrowth' | 'occult' | 'blackMarketStudies'>, path: string): boolean {
  if (Object.values(c.jobPaths ?? {}).some(record => record.path === path)) return true;
  if (c.priestGrowth?.branch && path === `priest-${c.priestGrowth.branch}`) return true;
  if (path === 'mage-star') return !!c.occult?.starObservations.length;
  if (FANTASY_RELICS.some(relic => relic.path === path && (c.occult?.usedRelics.includes(relic.id) || c.blackMarketStudies?.includes(relic.id)))) return true;
  const book = FANTASY_JOB_DISCOVERY_BOOKS[path]; return !!book && !!c.readBooks?.includes(book);
}
export function fantasyJobDiscoveryPassages(book: string): Record<NpcLocale, string[]> {
  const paths = PATHS.filter(path => FANTASY_JOB_DISCOVERY_BOOKS[path.id] === book), story = STORIES[book];
  const result: Record<NpcLocale, string[]> = { ko: [], en: [], ja: [] };
  if (!paths.length || !story) return result;
  const middle = Math.max(1, Math.ceil(paths.length / 2));
  for (const [index, locale] of (['ko', 'en', 'ja'] as const).entries()) {
    const join = (values: typeof paths) => values.map(path => path.names[locale]).join(locale === 'en' ? ', ' : '·');
    const a = join(paths.slice(0, middle)), b = join(paths.slice(middle)) || a;
    let whole = story[index];
    for (const [marker, name] of [['{a}', a], ['{b}', b]]) {
      if (locale === 'ko') {
        const code = name.charCodeAt(name.length - 1), consonant = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
        for (const [particle, changed] of [['는', consonant ? '은' : '는'], ['가', consonant ? '이' : '가'], ['를', consonant ? '을' : '를'], ['라는', consonant ? '이라는' : '라는']]) whole = whole.replaceAll(marker + particle, name + changed);
      }
      whole = whole.replaceAll(marker, name);
    }
    const separator = locale === 'ja' ? '。' : '. ', split = whole.indexOf(separator);
    result[locale] = paths.length > 4 && split >= 0 ? [whole.slice(0, split + 1), whole.slice(split + separator.length)] : [whole];
  }
  return result;
}
export function fantasyJobDiscoveryInsertionIndices(book: string, originalLength: number, count: number): number[] {
  if (originalLength < 1 || count < 1) return [];
  let hash = 2166136261;
  for (const code of book) hash = Math.imul(hash ^ code.charCodeAt(0), 16777619) >>> 0;
  const first = 1 + hash % originalLength;
  if (count === 1) return [first];
  const second = originalLength === 1 ? 1 : 1 + (first - 1 + 1 + (hash >>> 16) % (originalLength - 1)) % originalLength;
  return [first, second].sort((a, b) => a - b);
}
