import type { FantasyQuest } from './fantasy.ts';

type Text = [ko: string, en: string, ja: string];
const l = ([ko, en, ja]: Text) => ({ ko, en, ja });
const places: Record<string, Text> = {
  hearth: ['하스', 'Hearth', 'ハース'], emberhall: ['엠버홀', 'Emberhall', 'エンバーホール'],
  suncourt: ['백일왕도', 'Suncourt', '白日王都'], mooncity: ['월도', 'Mooncity', '月都'],
  greenwood: ['녹엽의 숲', 'Greenwood', '翠葉の森'], sunmeadow: ['양지 목초지', 'Sunmeadow', '陽だまり牧草地'],
  ironridge: ['철관산맥', 'Ironridge', '鉄冠山脈'], deepcave: ['청정 동굴', 'Deepcave', '青晶の洞窟'],
  oldwatch: ['옛 망루성', 'Oldwatch', '風化した見張り城'], ashpeak: ['잿불 화산', 'Ashpeak', '燠火の火山'],
  'storm-isle':['천둥종섬','Stormbell Isle','雷鐘の島'],
  frostpass: ['흰안개고개', 'Frostpass', '白霧峠'], duskmire: ['황혼늪', 'Duskmire', '薄暮の沼'],
};
const issuers: Record<string, { at: string; name: Text; reason: Text }> = {
  'hearth-galen': { at: 'hearth', name: ['갈렌', 'Galen', 'ガレン'], reason: ['훈련을 마친 신참들이 숲길을 안전하게 다닐 수 있도록 길목을 정리해 주게.', 'Clear the approach so newly trained adventurers can use the woodland road safely.', '訓練を終えた新人が森道を安全に通れるよう、道の入口を整えてほしい。'] },
  borin: { at: 'emberhall', name: ['보린', 'Borin', 'ボリン'], reason: ['광부들의 운반길이 막혔다. 광석보다 먼저 돌아올 사람들의 안전을 지켜 주게.', 'The miners’ haul road is blocked. Protect the people coming home before the ore.', '鉱夫の運搬路が塞がった。鉱石より先に、帰る人たちの無事を守ってくれ。'] },
  'suncourt-varren': { at: 'suncourt', name: ['바렌', 'Varren', 'ヴァレン'], reason: ['순찰 기록에 적힌 위협을 직접 확인했다. 목표를 쓰러뜨리고 길드에 결과를 보고해 주게.', 'Our patrol verified the threat in this report. Defeat the targets and report the result to the guild.', '巡回が記録の脅威を確認した。対象を倒し、結果をギルドへ報告してくれ。'] },
  eris: { at: 'mooncity', name: ['에리스', 'Eris', 'エリス'], reason: ['조사대가 더는 현장에 접근하지 못하고 있어요. 확인된 적대 개체만 상대하고 기록을 가져와 주세요.', 'The survey team cannot reach the site. Deal only with the identified hostile creatures and bring back your report.', '調査隊が現地へ近づけません。確認された敵対個体にだけ対処し、記録を持ち帰ってください。'] },
};
function hunt(id: string, title: Text, issuer: string, destination: string, monster: string, target: Text, tier: number, count = 1, group = false): FantasyQuest {
  const client = issuers[issuer], at = places[client.at], to = places[destination];
  const descriptions = l([
    `${to[0]}에서 ${target[0]} ${count}마리를 토벌하고 ${at[0]}의 ${client.name[0]}에게 보고하자.`,
    `Defeat ${target[1]} ×${count} at ${to[1]} and report to ${client.name[1]} in ${at[1]}.`,
    `${to[2]}で${target[2]}を${count}体討伐し、${at[2]}の${client.name[2]}へ報告しよう。`,
  ]);
  return { id: `guild-hunt-${id}`, names: l(title), name: title[2], descriptions, description: descriptions.ja,
    dialogue: l(client.reason), giver: client.at, issuer, destination, item: 'ore', count: 1,
    gold: Math.round((30 + tier * tier * 15) * (group ? 1.7 : 1) * Math.sqrt(count)), xp: Math.round((15 + tier * 12) * Math.sqrt(count)),
    objective: { type: 'hunt', monster: `monster-${monster}`, count }, ...(group ? { group: true } : {}) };
}
/** Data-only catalog: no imports from fantasy-data, NPC, contracts or grade logic during initialization. */
export const FANTASY_GUILD_HUNT_QUESTS: FantasyQuest[] = [
  hunt('meadow-slime', ['목초지 입구의 슬라임', 'Slime at the Meadow Gate', '牧草地入口のスライム'], 'hearth-galen', 'sunmeadow', 'meadow-slime', ['초원슬라임', 'Meadow Slime', '草原スライム'], 1),
  hunt('thorn-beetle', ['약초길의 가시등', 'Thornbacks on the Herb Trail', '薬草道の棘背'], 'hearth-galen', 'greenwood', 'thorn-beetle', ['가시등딱정벌레', 'Thornback Beetle', '棘背甲虫'], 1),
  hunt('forest-wolf', ['숲길을 지키는 순찰', 'Patrol of the Woodland Road', '森道を守る巡回'], 'hearth-galen', 'greenwood', 'forest-wolf', ['숲늑대', 'Forest Wolf', '森狼'], 2),
  hunt('venom-spider', ['운반로의 독그물', 'Venom Web on the Haul Road', '運搬路の毒網'], 'borin', 'deepcave', 'venom-spider', ['독그물거미', 'Venom-Web Spider', '毒網蜘蛛'], 2),
  hunt('orc-raider', ['산악 상단의 호위 요청', 'Escort Request from the Mountain Caravan', '山岳隊商の護衛依頼'], 'borin', 'ironridge', 'orc-raider', ['오크 습격병', 'Orc Raider', 'オーク襲撃兵'], 3),
  hunt('skeleton-guard', ['옛 성문을 막은 해골', 'Skeleton at the Old Gate', '古城門を塞ぐ骸骨'], 'suncourt-varren', 'oldwatch', 'skeleton-guard', ['해골 경비병', 'Skeleton Guard', '骸骨衛兵'], 3),
  hunt('stone-troll', ['광산길의 바위 밀기', 'Boulders on the Mine Road', '鉱山道の押し岩'], 'borin', 'ironridge', 'stone-troll', ['바위트롤', 'Stone Troll', '岩トロル'], 4),
  hunt('ice-wolf', ['눈길 조사대의 퇴로', 'The Snow Survey Team’s Retreat', '雪道調査隊の退路'], 'eris', 'frostpass', 'ice-wolf', ['서리늑대', 'Frost Wolf', '霜狼'], 4),
  hunt('chimera', ['산등성이의 합성 괴수', 'Composite Beast on the Ridge', '稜線の合成怪獣'], 'borin', 'ironridge', 'chimera', ['키메라', 'Chimera', 'キマイラ'], 5),
  hunt('grave-knight', ['서고 앞의 빈 갑옷', 'Empty Armor before the Archive', '書庫前の空の鎧'], 'suncourt-varren', 'oldwatch', 'grave-knight', ['무덤의 갑옷기사', 'Grave Knight', '墓所の鎧騎士'], 5),
  hunt('cliff-wyvern', ['광맥 위의 와이번', 'Wyvern above the Ore Vein', '鉱脈上のワイバーン'], 'borin', 'ironridge', 'cliff-wyvern', ['절벽와이번', 'Cliff Wyvern', '崖ワイバーン'], 6),
  hunt('hydra', ['황혼 수로의 여러 목', 'Many Necks in the Dusk Channel', '薄暮水路の幾つもの首'], 'eris', 'duskmire', 'hydra', ['늪히드라', 'Marsh Hydra', '沼ヒドラ'], 6),
  hunt('red-dragon', ['화산길의 붉은용 경보', 'Red Dragon Warning on the Volcanic Road', '火山道の赤竜警報'], 'eris', 'ashpeak', 'red-dragon', ['적대적 붉은용', 'Hostile Red Dragon', '敵対的な赤竜'], 7),
  hunt('frost-dragon', ['흰안개 능선의 용', 'Dragon on the White-Mist Ridge', '白霧の稜線の竜'], 'eris', 'frostpass', 'frost-dragon', ['적대적 서리용', 'Hostile Frost Dragon', '敵対的な霜竜'], 7),
  hunt('storm-dragon', ['섬의 항로를 막은 폭풍용','Storm Dragon Blocking the Sea Lane','航路を塞ぐ嵐竜'], 'eris','storm-isle','storm-dragon',['적대적 폭풍용','Hostile Storm Dragon','敵対的な嵐竜'],7),
  hunt('abyss-hydra', ['깊은 늪의 포식자','Predator of the Deep Marsh','深沼の捕食者'], 'eris','duskmire','abyss-hydra',['깊은늪히드라','Abyss Hydra','深沼ヒドラ'],7),
  hunt('obsidian-guardian', ['무너진 성의 흑요 수호상','Obsidian Guardian of the Fallen Keep','崩れた城の黒曜の守護像'], 'suncourt-varren','oldwatch','obsidian-guardian',['흑요석 수호상','Obsidian Guardian','黒曜石の守護像'],7),
  hunt('lich', ['봉인묘에서 돌아온 리치','Lich of the Sealed Tomb','封印墓から戻ったリッチ'], 'suncourt-varren','oldwatch','lich',['봉인묘의 리치','Sealed-Tomb Lich','封印墓のリッチ'],7),
  hunt('phoenix', ['화산재 속의 불사조','Phoenix in the Volcanic Ash','火山灰の不死鳥'], 'eris','ashpeak','phoenix',['잿불 불사조','Ember Phoenix','燠火の不死鳥'],7),
  hunt('orc-pair', ['두 갈래 산길의 습격병', 'Raiders on the Forked Mountain Road', '二股山道の襲撃兵'], 'borin', 'ironridge', 'orc-raider', ['오크 습격병', 'Orc Raider', 'オーク襲撃兵'], 3, 2),
  hunt('skeleton-pack', ['성벽 안쪽의 해골 부대', 'Skeleton Band inside the Wall', '城壁内の骸骨隊'], 'suncourt-varren', 'oldwatch', 'skeleton-guard', ['해골 경비병', 'Skeleton Guard', '骸骨衛兵'], 3, 4),
  hunt('wolf-pack', ['마을을 에워싼 늑대 무리', 'Wolf Pack around the Village', '村を囲む狼の群れ'], 'hearth-galen', 'greenwood', 'forest-wolf', ['숲늑대', 'Forest Wolf', '森狼'], 2, 6),
  hunt('dragon-pair', ['\ud654\uc0b0\uae38\uc758 \ubd89\uc740\uc6a9 \ud55c \uc30d', 'Red Dragon Pair on the Volcanic Road', '\u706b\u5c71\u9053\u306e\u4e00\u5bfe\u306e\u8d64\u7adc'], 'eris', 'ashpeak', 'red-dragon', ['\uc801\ub300\uc801 \ubd89\uc740\uc6a9', 'Hostile Red Dragon', '\u6575\u5bfe\u7684\u306a\u8d64\u7adc'], 7, 2),
  hunt('guild-forest-sweep', ['길드 집결: 숲길 소탕', 'Guild Muster: Woodland Sweep', 'ギルド集合：森道掃討'], 'hearth-galen', 'greenwood', 'goblin-raider', ['고블린 습격병', 'Goblin Raider', 'ゴブリン襲撃兵'], 2, 6, true),
  hunt('guild-wall-sweep', ['길드 집결: 성벽 탈환', 'Guild Muster: Reclaim the Wall', 'ギルド集合：城壁奪還'], 'suncourt-varren', 'oldwatch', 'skeleton-guard', ['해골 경비병', 'Skeleton Guard', '骸骨衛兵'], 3, 6, true),
  hunt('guild-dragon-pair', ['\uae38\ub4dc \uc9d1\uacb0: \ubd89\uc740\uc6a9 \uc30d', 'Guild Muster: Red Dragon Pair', '\u30ae\u30eb\u30c9\u96c6\u5408\uff1a\u4e00\u5bfe\u306e\u8d64\u7adc'], 'eris', 'ashpeak', 'red-dragon', ['\uc801\ub300\uc801 \ubd89\uc740\uc6a9', 'Hostile Red Dragon', '\u6575\u5bfe\u7684\u306a\u8d64\u7adc'], 7, 2, true),
];
