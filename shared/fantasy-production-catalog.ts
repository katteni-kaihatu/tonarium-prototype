import type { FantasyItem, FantasyRecipe } from './fantasy.ts';
type Text = Record<'ko' | 'en' | 'ja', string>;
type Triple = [string, string, string];
const l = ([ko, en, ja]: Triple): Text => ({ ko, en, ja });
const item = (id: string, names: Triple, descriptions: Triple, price: number, category: string, extra: Partial<FantasyItem> = {}): FantasyItem => ({ id, names: l(names), name: names[2], descriptions: l(descriptions), description: descriptions[2], price, category, ...extra });
export interface FantasyProductionRecipe extends FantasyRecipe { names?: Text; requiresBook?: string; requiresLocations?: string[] }
export const FANTASY_PRODUCTION_STUDIES = [
  { item: 'restored-archive', book: 'archive-records' }, { item: 'restored-healing-treatise', book: 'remedies-and-rites' },
  ...['physical', 'reach', 'resonance', 'purification', 'benediction', 'frost', 'embers', 'miracle'].map(id => ({ item: `rune-record-${id}`, book: `rune-${id}` })),
];
const runeNames: Record<string, Triple> = { physical: ['충격 문양 기록', 'Impulse Inscription Record', '衝撃紋の記録'], reach: ['연장 문양 기록', 'Reach Inscription Record', '延伸紋の記録'], resonance: ['공명 문양 기록', 'Resonance Inscription Record', '共鳴紋の記録'], purification: ['청정 문양 기록', 'Purification Inscription Record', '清浄紋の記録'], benediction: ['수호 문양 기록', 'Ward Inscription Record', '守護紋の記録'], frost: ['서리 문양 기록', 'Frost Inscription Record', '霜紋の記録'], embers: ['잔불 문양 기록', 'Ember Inscription Record', '残火紋の記録'], miracle: ['생환 문양 기록', 'Return Inscription Record', '生還紋の記録'] };
const food = (id: string, names: Triple, descriptions: Triple, price: number, shelfLife: number, nutrition: number, use: NonNullable<FantasyItem['use']>) => item(id, names, descriptions, price, 'food', { food: { shelfLife, nutrition }, use: { ...use, hunger: nutrition } });
export const FANTASY_PRODUCTION_ITEMS: FantasyItem[] = [
  item('scribe-paper', ['필사용 종이', 'Copyist’s Paper', '筆写用の紙'], ['나무 섬유와 삼베를 눌러 만든 종이. 지도와 필사본의 바탕이 된다.', 'Paper pressed from wood fibers and linen, used for maps and copied volumes.', '木の繊維と麻布を押して作る紙。地図や写本の下地となる。'], 8, 'paper'),
  item('scribe-ink', ['약초 먹물', 'Herbal Ink', '薬草の墨'], ['약초와 숯을 갈아 만든 먹물. 오래된 획을 다시 드러내고 새 기록을 남긴다.', 'Ink ground from herbs and charcoal, used to restore faded strokes and write new records.', '薬草と炭をすり合わせた墨。薄れた筆跡を戻し、新しい記録を残す。'], 10, 'ink'),
  item('faded-manuscript', ['빛바랜 고문서', 'Faded Manuscript', '色褪せた古文書'], ['유적의 마른 틈에서 찾은 종잇조각. 기록사가 복원하면 읽을 수 있는 문헌이 된다.', 'Dry pages recovered from a ruin. A scribe can restore them into a readable volume.', '遺跡の乾いた隙間から見つかる紙片。記録師が修復すれば読める文献になる。'], 18, 'manuscript'),
  item('restored-archive', ['복원한 고대 기록집', 'Restored Ancient Records', '修復した古代記録集'], ['복원한 문헌을 읽으면 기록 보관술을 익힌다. 물품으로 보관하거나 거래할 수 있다.', 'Study this restored volume to learn archival records. It can also be kept or traded as a physical book.', '修復した文献を読むと記録保管の知識を学ぶ。品物として保管や取引もできる。'], 42, 'study-volume'),
  item('restored-healing-treatise', ['복원한 치료 의식서', 'Restored Healing Treatise', '修復した治療儀礼書'], ['손상된 약초 문헌을 되살렸다. 읽으면 치료와 의식에 관한 기존 지식을 배운다.', 'A restored herbal text. Studying it teaches established knowledge of remedies and rites.', '傷んだ薬草文献を直した書。読むと治療と儀礼の知識を学ぶ。'], 48, 'study-volume'),
  ...Object.entries(runeNames).map(([id, names]) => item(`rune-record-${id}`, names, ['알고 있는 원전을 바탕으로 필사한 문양 기록. 읽어 문양을 익히거나 다른 이에게 양도한다.', 'An inscription copied from a known source. Study it to learn its rune, or trade the physical record.', '学んだ原典から写した紋様の記録。読んで紋様を学び、品物として譲渡もできる。'], id === 'miracle' ? 90 : 44, 'rune-record')),
  food('trail-grain-stew', ['여행자의 곡물 스튜', 'Traveler’s Grain Stew', '旅人の穀物煮込み'], ['곡물과 고기를 고아 HP와 기력을 회복하고 잠시 몸을 지킨다.', 'Slow-cooked grain and meat restore HP and vigor, with brief protection.', '穀物と肉を煮込み、HPと気力を回復してしばらく体を守る。'], 30, 24, 48, { hp: 18, fatigue: 6, effect: { id: 'well-fed', hours: 3, guard: 2 } }),
  food('moonmint-rice', ['달박하 곡물밥', 'Moonmint Grain Bowl', '月薄荷の穀物飯'], ['달박하 향이 MP를 회복하고 잠시 생각을 맑게 한다.', 'Moonmint restores MP and briefly clears the mind.', '月薄荷の香りでMPを回復し、しばらく思考を澄ませる。'], 32, 24, 42, { mp: 18, effect: { id: 'well-fed', hours: 3, stats: { intelligence: 1 } } }),
  food('pepper-trail-roast', ['후추 원정 구이', 'Peppered Trail Roast', '胡椒の遠征焼き'], ['고기와 후추가 HP를 회복하고 잠시 힘을 더한다.', 'Meat and pepper restore HP and briefly bolster strength.', '肉と胡椒でHPを回復し、しばらく力を補う。'], 36, 18, 50, { hp: 22, effect: { id: 'well-fed', hours: 3, stats: { strength: 2 } } }),
  food('silverweed-broth', ['은빛풀 맑은탕', 'Silverweed Clear Broth', '銀葉草の澄まし汁'], ['부드러운 생선 국물이 HP를 회복하고 독기를 씻는다.', 'Gentle fish broth restores HP and clears poison.', '穏やかな魚の汁でHPを回復し、毒を洗い流す。'], 28, 18, 35, { hp: 12, cure: ['poison'] }),
  food('frostbloom-pudding', ['서리꽃 푸딩', 'Frostbloom Pudding', '霜花のプディング'], ['서리꽃과 달박하가 MP를 회복하고 잠시 체력을 돕는다.', 'Frostbloom and moonmint restore MP and briefly support vitality.', '霜花と月薄荷でMPを回復し、しばらく体力を補う。'], 34, 36, 36, { mp: 14, effect: { id: 'well-fed', hours: 4, stats: { vitality: 1 } } }),
  food('sunroot-flatbread', ['해뿌리 납작빵', 'Sunroot Flatbread', '陽根草の平焼きパン'], ['피로를 풀고 잠시 발걸음을 가볍게 하는 든든한 빵.', 'A filling bread that eases fatigue and briefly lightens the step.', '疲れをほぐし、しばらく足取りを軽くする腹持ちのよいパン。'], 28, 72, 40, { fatigue: 18, effect: { id: 'well-fed', hours: 4, stats: { agility: 1 } } }),
  food('cinnamon-travel-loaf', ['계피 여행빵', 'Cinnamon Travel Loaf', '肉桂の旅パン'], ['HP와 MP를 조금 회복하고 잠시 행운을 북돋는 보존빵.', 'A lasting loaf that restores some HP and MP and briefly encourages luck.', 'HPとMPを少し回復し、しばらく運を補う保存パン。'], 30, 96, 44, { hp: 18, mp: 8, effect: { id: 'well-fed', hours: 4, stats: { luck: 1 } } }),
  food('sailor-fishcake', ['뱃사람 어묵전', 'Sailor’s Fishcake', '船乗りの魚練り焼き'], ['생선과 곡분으로 HP를 회복하고 잠시 방호를 더한다.', 'Fish and flour restore HP and briefly grant protection.', '魚と穀粉でHPを回復し、しばらく防護を与える。'], 29, 48, 42, { hp: 18, effect: { id: 'well-fed', hours: 3, guard: 2 } }),
  item('quilted-travelcoat', ['누빔 여행 외투', 'Quilted Traveling Coat', '綿入れの旅外套'], ['삼베와 늑대 가죽을 겹쳐 기민함과 체력, 방호를 보탠다.', 'Layers of linen and wolfhide support agility, vitality and protection.', '麻布と狼革を重ね、敏捷・体力・防護を補う。'], 72, 'armor', { equipment: { slot: 'armor', stats: { agility: 1, vitality: 1 }, guard: 2 } }),
  item('corded-silk-sash', ['비단 매듭띠', 'Corded Silk Sash', '絹の組み紐帯'], ['움직임을 따라 당김을 고르게 나누는 띠. 손재주와 민첩을 보탠다.', 'A sash distributing tension evenly with movement, supporting dexterity and agility.', '動きに合わせ張りを分ける帯。手先と敏捷を補う。'], 58, 'accessory', { equipment: { slot: 'accessory', stats: { dexterity: 1, agility: 1 } } }),
  item('weatherproof-gaiters', ['방수 여행 각반', 'Weatherproof Gaiters', '防水の旅脚絆'], ['도마뱀 가죽으로 다리를 감싸 민첩과 작은 방호를 보탠다.', 'Lizardhide leg guards support agility and a little protection.', '蜥蜴革で脚を包み、敏捷と小さな防護を補う。'], 62, 'armor', { equipment: { slot: 'armor', stats: { agility: 2 }, guard: 1 } }),
  item('concentrated-herbal-salve', ['농축 약초 연고', 'Concentrated Herbal Salve', '濃縮薬草の軟膏'], ['붉은잎과 은빛풀을 개어 HP 28을 회복하고 독을 지운다.', 'Redleaf and silverweed restore 28 HP and cure poison.', '赤葉草と銀葉草を練り、HP28を回復して毒を除く。'], 34, 'potion', { use: { hp: 28, cure: ['poison'] } }),
  item('glazed-ward-vessel', ['유약 수호 도기', 'Glazed Warding Vessel', '釉薬の守護陶器'], ['대지 마정석을 구워 넣은 보조 도기. 체력과 방호를 보탠다.', 'An offhand vessel fired with earth crystal, supporting vitality and protection.', '地の魔晶石を焼き込んだ副手の器。体力と防護を補う。'], 64, 'accessory', { equipment: { slot: 'offhand', stats: { vitality: 1 }, guard: 2 } }),
  item('polished-focus-lens', ['연마 집중 렌즈', 'Polished Focus Lens', '研磨した集中レンズ'], ['정밀하게 깎은 수정과 사파이어 렌즈. 지능과 최대 MP를 보탠다.', 'A precise crystal-and-sapphire lens, supporting intelligence and maximum MP.', '精密に削る水晶と蒼玉のレンズ。知力と最大MPを補う。'], 88, 'accessory', { equipment: { slot: 'accessory', stats: { intelligence: 2, mp: 8 } } }),
];
const mapNames: Record<string, Text> = {
  'map-hearth-fields': l(['하스 들녘 지도', 'Hearth Fields Chart', 'ハースの野辺地図']),
  'map-iron-mines': l(['철관 광산 지도', 'Ironridge Mines Chart', '鉄冠の鉱山図']),
  'map-moon-road': l(['루네리아 옛길 지도', 'Mooncity Old Roads', '月都の古道図']),
};
const recipe = (id: string, job: string, output: string, inputs: Record<string, number>, dc = 11, extra: Partial<FantasyProductionRecipe> = {}): FantasyProductionRecipe => {
  const names = FANTASY_PRODUCTION_ITEMS.find(item => item.id === output)?.names ?? mapNames[output];
  return { id, job, output, inputs, names, name: names.ja, count: 1, dc, ...extra };
};
export const FANTASY_PRODUCTION_RECIPES: FantasyProductionRecipe[] = [
  recipe('scribe-make-paper', 'scribe', 'scribe-paper', { wood: 1, linen: 1 }, 9, { count: 2 }), recipe('scribe-make-ink', 'scribe', 'scribe-ink', { herb: 1, wood: 1 }, 9, { count: 2 }),
  recipe('scribe-finish-reed-paper', 'scribe', 'scribe-paper', { 'reed-paper': 2, 'pine-resin': 1 }, 9, { count: 3 }),
  recipe('scribe-restore-archive', 'scribe', 'restored-archive', { 'faded-manuscript': 1, 'scribe-paper': 1, 'scribe-ink': 1, herb: 1 }),
  recipe('scribe-restore-remedies', 'scribe', 'restored-healing-treatise', { 'faded-manuscript': 1, 'scribe-paper': 1, 'scribe-ink': 1, silverweed: 1 }, 12),
  ...Object.keys(runeNames).map(id => recipe(`scribe-copy-rune-${id}`, 'scribe', `rune-record-${id}`, { 'scribe-paper': 2, 'scribe-ink': 1 }, id === 'miracle' ? 16 : 12, { requiresBook: `rune-${id}` })),
  recipe('scribe-map-hearth', 'scribe', 'map-hearth-fields', { 'scribe-paper': 2, 'scribe-ink': 1 }, 10, { requiresLocations: ['hearth', 'greenwood', 'sunmeadow'] }),
  recipe('scribe-map-iron', 'scribe', 'map-iron-mines', { 'scribe-paper': 2, 'scribe-ink': 1 }, 12, { requiresLocations: ['ironridge', 'emberhall', 'deepcave'] }),
  recipe('scribe-map-moon', 'scribe', 'map-moon-road', { 'scribe-paper': 2, 'scribe-ink': 1 }, 12, { requiresLocations: ['dawnport', 'mooncity', 'duskmire'] }),
  recipe('cook-trail-grain-stew', 'cook', 'trail-grain-stew', { grain: 2, meat: 1, herb: 1 }), recipe('cook-moonmint-rice', 'cook', 'moonmint-rice', { grain: 2, moonmint: 1 }),
  recipe('cook-pepper-trail-roast', 'cook', 'pepper-trail-roast', { meat: 2, pepper: 1 }, 12), recipe('cook-silverweed-broth', 'cook', 'silverweed-broth', { fish: 1, silverweed: 1, herb: 1 }),
  recipe('cook-frostbloom-pudding', 'cook', 'frostbloom-pudding', { frostbloom: 1, flour: 1, moonmint: 1 }, 12), recipe('baker-sunroot-flatbread', 'baker', 'sunroot-flatbread', { flour: 2, sunroot: 1 }),
  recipe('baker-cinnamon-loaf', 'baker', 'cinnamon-travel-loaf', { flour: 2, cinnamon: 1 }), recipe('fisher-sailor-fishcake', 'fisher', 'sailor-fishcake', { fish: 2, flour: 1, herb: 1 }),
  recipe('tailor-quilted-coat', 'tailor', 'quilted-travelcoat', { linen: 3, 'wolf-hide': 1 }, 12), recipe('weaver-corded-sash', 'weaver', 'corded-silk-sash', { 'silkworm-silk': 2, linen: 2 }, 12),
  recipe('leatherworker-weatherproof-gaiters', 'leatherworker', 'weatherproof-gaiters', { 'lizard-hide': 2, linen: 1 }, 12), recipe('herbalist-concentrated-salve', 'herbalist', 'concentrated-herbal-salve', { herb: 2, redleaf: 1, silverweed: 1 }),
  recipe('potter-glazed-ward', 'potter', 'glazed-ward-vessel', { clay: 3, 'earth-crystal': 1 }, 12), recipe('gemcutter-focus-lens', 'gemcutter', 'polished-focus-lens', { crystal: 2, sapphire: 1, 'silver-ingot': 1 }, 14),
];
