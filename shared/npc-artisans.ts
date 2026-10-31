import { FANTASY_ARTISANS } from './fantasy-artisan-catalog.ts';
import type { NpcLocale, NpcPublicProfile } from './npc.ts';

type Localized = Record<NpcLocale, string>;
const l = (ko: string, en: string, ja: string): Localized => ({ ko, en, ja });
const DETAILS: Record<string, { role: Localized; topic: Localized; personality: Localized }> = {
  cook: { role: l('공동 주방 요리사', 'Communal kitchen cook', '共同厨房の料理人'), topic: l('재료의 신선도와 균형 잡힌 식사', 'Ingredient freshness and balanced meals', '食材の鮮度と釣り合いのよい食事'), personality: l('넬라는 손님의 입맛을 기억하고 남은 재료를 아낀다.', 'Nella remembers guests’ tastes and saves useful leftovers.', 'ネラは客の好みを覚え、残った食材を大切にする。') },
  baker: { role: l('갈대마을 제빵사', 'Reed village baker', '葦の里のパン職人'), topic: l('반죽의 발효와 화덕 온도', 'Dough fermentation and oven heat', '生地の発酵と窯の温度'), personality: l('파벨은 느긋하지만 발효 시간만큼은 타협하지 않는다.', 'Pavel is easygoing but never rushes fermentation.', 'パヴェルはのんびりしているが、発酵だけは急がない。') },
  blacksmith: { role: l('길드 단조 장인', 'Guild forging artisan', 'ギルドの鍛造職人'), topic: l('철의 열처리와 단조 도구', 'Iron tempering and forging tools', '鉄の焼入れと鍛造道具'), personality: l('루리크는 실패한 시편을 보관하며 견습생의 실수를 함께 살핀다.', 'Rurik keeps failed samples and examines mistakes alongside apprentices.', 'ルーリクは失敗した試片を残し、見習いと一緒に間違いを調べる。') },
  carpenter: { role: l('수관 목수', 'Canopy carpenter', '樹冠の大工'), topic: l('나뭇결과 튼튼한 이음', 'Wood grain and durable joints', '木目と丈夫な継ぎ手'), personality: l('실벤은 나무의 결을 오래 살피고 수리 가능한 설계를 좋아한다.', 'Sylven studies the grain patiently and favors repairable designs.', 'シルヴェンは木目をじっくり調べ、直せる設計を好む。') },
  scribe: { role: l('묵향 필경사', 'Inkstone scribe', '墨香の筆写師'), topic: l('잉크 조제와 정확한 문서 사본', 'Ink preparation and accurate document copies', '墨の調製と正確な文書の写し'), personality: l('현은 오자를 솔직히 인정하고 원문과 사본을 대조한다.', 'Hyeon admits copying errors and checks every copy against its source.', 'ヒョンは誤字を率直に認め、写しを原本と照合する。') },
  tailor: { role: l('왕도 재단사', 'Court tailor', '王都の仕立師'), topic: l('치수 재기와 여행복 재단', 'Taking measurements and cutting travel clothes', '採寸と旅服の裁断'), personality: l('엘로디는 화려함보다 입는 사람의 움직임을 먼저 본다.', 'Elodie watches how a wearer moves before choosing decoration.', 'エロディは飾りを選ぶ前に、着る人の動きを見る。') },
  weaver: { role: l('베틀마을 직조사', 'Loom village weaver', '機織りの里の織師'), topic: l('날실의 장력과 천의 조직', 'Warp tension and cloth structure', '経糸の張りと布の組織'), personality: l('마이리는 규칙적인 베틀 소리를 즐기며 작은 올풀림도 놓치지 않는다.', 'Mairi enjoys the loom’s rhythm and notices every loose thread.', 'マイリは機の規則的な音を楽しみ、ほつれた一本も見逃さない。') },
  leatherworker: { role: l('붉은직물 가죽 장인', 'Redweave leatherworker', '赤織の革職人'), topic: l('무두질과 짐끈 바느질', 'Tanning hides and stitching pack straps', 'なめしと荷紐の縫い方'), personality: l('나디르는 말보다 오래 버티는 물건으로 약속을 증명한다.', 'Nadir proves a promise by making goods that last.', 'ナディルは長持ちする品物で約束を示す。') },
  gemcutter: { role: l('불씨회관 보석 세공사', 'Emberhall gemcutter', '熾火館の宝石細工師'), topic: l('보석의 균열과 연마 각도', 'Gem fractures and polishing angles', '宝石の亀裂と研磨の角度'), personality: l('브리스카는 작은 균열을 숨기지 않고 돌마다 다른 가치를 찾는다.', 'Briska discloses tiny flaws and finds a different value in each stone.', 'ブリスカは小さな傷も隠さず、石ごとの価値を見つける。') },
  potter: { role: l('햇실 도공', 'Sunloom potter', '陽織の陶工'), topic: l('흙 배합과 가마 굽기', 'Clay mixtures and kiln firing', '土の配合と窯焼き'), personality: l('탈라는 실험을 좋아하며 깨진 그릇도 유약 기록과 함께 남긴다.', 'Tala enjoys experiments and keeps broken pots with glaze notes.', 'タラは実験好きで、割れた器も釉薬の記録と残す。') },
  herbalist: { role: l('이끼내 약초사', 'Mossbrook herbalist', '苔川の薬草師'), topic: l('약초 구별과 건조 보관', 'Identifying herbs and dry storage', '薬草の見分け方と乾燥保存'), personality: l('엔나는 모르는 풀을 아는 척하지 않고 잎과 뿌리를 함께 확인한다.', 'Enna checks both leaf and root and admits unfamiliar plants.', 'エンナは葉と根を確かめ、知らない草は知らないと伝える。') },
  farmer: { role: l('샘쉼 농부', 'Wellrest farmer', '泉憩いの農夫'), topic: l('곡물 고르기와 토양 돌보기', 'Sorting grain and caring for soil', '穀物の選別と土の手入れ'), personality: l('옴리는 수확을 자랑하기보다 다음 철의 흙을 걱정한다.', 'Omri thinks about next season’s soil before boasting of a harvest.', 'オムリは収穫を誇るより、次の季節の土を気にかける。') },
  fisher: { role: l('물결항 어부', 'Tidehaven fisher', '潮港の漁師'), topic: l('그물 손질과 어획물 보존', 'Net repair and preserving a catch', '網の手入れと魚の保存'), personality: l('페트라는 바다의 변화를 관찰하고 불확실한 어획을 약속하지 않는다.', 'Petra watches the changing sea and never promises an uncertain catch.', 'ペトラは海の変化を見て、不確かな漁獲を約束しない。') },
  merchant: { role: l('향신항 교역 상인', 'Saffron trade merchant', '香辛港の交易商'), topic: l('공정한 견적과 지역 물품 수요', 'Fair quotations and local demand', '公正な見積りと土地の需要'), personality: l('야스민은 거래 조건을 먼저 밝히고 작은 약속도 장부에 적는다.', 'Yasmin states terms upfront and records even small promises.', 'ヤスミンは条件を先に示し、小さな約束も帳簿に記す。') },
  shipwright: { role: l('초록부두 조선 장인', 'Verdant quay shipwright', '緑の波止場の船大工'), topic: l('선체 이음과 방수 정비', 'Hull joints and waterproofing', '船体の継ぎ目と防水整備'), personality: l('일마르는 출항 날짜보다 선체 검사를 중시하고 동료 의견을 듣는다.', 'Ilmar values hull checks over departure dates and listens to the crew.', 'イルマルは出航日より船体検査を重んじ、仲間の意見を聞く。') },
  alchemist: { role: l('월도 마탑 연금술사', 'Mooncity tower alchemist', '月都の塔の錬金術師'), topic: l('시약 계량과 재현 가능한 조합', 'Measuring reagents and repeatable mixtures', '試薬の計量と再現できる調合'), personality: l('세리트는 결과보다 실험 조건을 먼저 기록하고 모르는 반응을 경계한다.', 'Serit records conditions before results and treats unknown reactions cautiously.', 'セリトは結果より先に条件を記し、未知の反応を慎重に扱う。') },
};

const REGIONAL_PERSONALITIES: Record<string, Localized> = {
  'artisan-pinewatch-brann': l('브란은 찬 공기에서 달라지는 시약을 살피고 실험 전에 온도를 묻는다.', 'Brann studies reagents in cold air and asks about temperature before an experiment.', 'ブランは冷気で変わる試薬を調べ、実験の前に温度を尋ねる。'),
  'artisan-mossbrook-rivet': l('리베트는 습기에 민감한 재료를 따로 보관하며 매일 병마개를 확인한다.', 'Rivet separates moisture-sensitive materials and checks bottle stoppers daily.', 'リヴェトは湿気に弱い材料を分け、毎日瓶の栓を確かめる。'),
  'artisan-sunloom-dima': l('디마는 더운 날의 변화를 천천히 설명하고 급한 주문에도 계량을 생략하지 않는다.', 'Dima patiently explains changes in heat and measures even for urgent orders.', 'ディマは暑さによる変化を丁寧に説明し、急ぎでも計量を省かない。'),
  'artisan-saffron-fadila': l('파딜라는 수입 시약의 출처를 묻고 서로 다른 상인의 기록을 비교한다.', 'Fadila asks where imported reagents came from and compares suppliers’ records.', 'ファディラは輸入試薬の産地を尋ね、仕入先の記録を比べる。'),
  'artisan-rockshade-olek': l('올레크는 낡은 농기구를 먼저 고치며 손잡이가 편한지 직접 묻는다.', 'Olek prioritizes worn farm tools and asks their owners how the handles feel.', 'オレクは古い農具を先に直し、柄の使い心地を持ち主に尋ねる。'),
};

export const NPC_ARTISANS: NpcPublicProfile[] = FANTASY_ARTISANS.map((artisan, index) => {
  const detail = DETAILS[artisan.job];
  return {
    id: artisan.id, name: { ...artisan.names }, homeLocation: artisan.location, building: artisan.building,
    age: 32 + index * 2, gender: index % 2 ? 'male' : 'female', race: artisan.race ?? 'human',
    role: { ...detail.role }, personality: { ...REGIONAL_PERSONALITIES[artisan.id] ?? detail.personality },
    speech: l('자기 일의 구체적인 예로 설명하고, 모르는 것은 분명히 말한다.', 'Explains through examples from the trade and states what remains unknown.', '自分の仕事の具体例で説明し、分からないことは明言する。'),
    knownTopics: { ko: [detail.topic.ko], en: [detail.topic.en], ja: [detail.topic.ja] },
    trainableJobs: [artisan.job], trainableSkills: [artisan.job === 'alchemist' || artisan.job === 'scribe' ? 'mentor-focus' : 'mentor-steady-hand'],
  };
});
