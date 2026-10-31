import type { FantasyCharacter, FantasyItem } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';

type Text = Record<NpcLocale, string>;
export interface FantasyMonsterSite {
  id: string; enemy: string; location: string; item: string; kind: 'lair' | 'ruin'; tier: 7 | 8;
  names: Text; descriptions: Text; provocation: string;
}
const l = (ko: string, en: string, ja: string): Text => ({ ko, en, ja });
function site(enemy: string, location: string, kind: FantasyMonsterSite['kind'], tier: FantasyMonsterSite['tier'], names: Text, descriptions: Text, provocation = tier === 7 ? `apex-site-${enemy}` : `apex-${enemy}`): FantasyMonsterSite {
  return { id: `monster-site-${enemy}`, enemy: `monster-${enemy}`, location, item: `black-map-${enemy}`, kind, tier, names, descriptions, provocation };
}

/** Hidden approaches within existing regions; studying a map reveals a site, never starts combat. */
export const FANTASY_MONSTER_SITES: FantasyMonsterSite[] = [
  site('red-dragon', 'ashpeak', 'lair', 7,
    l('붉은용의 용암 둥지', 'Red Dragon’s Lava Lair', '赤竜の溶岩の巣'),
    l('잿불화산의 식은 용암관 끝에 숨은 붉은용의 둥지. 7등급 용이 머문다.', 'A red dragon’s lair hidden beyond a cooled lava tube in Ashpeak. A rank 7 dragon dwells here.', '燠火の火山の冷えた溶岩洞の先に隠れた赤竜の巣。7級の竜が棲む。')),
  site('frost-dragon', 'frostpass', 'lair', 7,
    l('서리용의 빙벽 둥지', 'Frost Dragon’s Icewall Lair', '霜竜の氷壁の巣'),
    l('흰안개고개의 빙벽 뒤로 이어지는 서리용의 둥지. 7등급 용이 머문다.', 'A frost dragon’s lair beyond the icewalls of Frostpass. A rank 7 dragon dwells here.', '白霧峠の氷壁の裏に続く霜竜の巣。7級の竜が棲む。')),
  site('storm-dragon', 'storm-isle', 'lair', 7,
    l('폭풍용의 절벽 둥지', 'Storm Dragon’s Cliff Lair', '嵐竜の断崖の巣'),
    l('천둥종섬의 바람 그늘에 숨은 폭풍용의 둥지. 7등급 용이 머문다.', 'A storm dragon’s lair hidden in the lee of Stormbell Isle’s cliffs. A rank 7 dragon dwells here.', '雷鐘の島の風裏の崖に隠れた嵐竜の巣。7級の竜が棲む。')),
  site('abyss-hydra', 'eclipsevault', 'ruin', 7,
    l('깊은늪히드라의 침수 유적', 'Deep-Marsh Hydra’s Flooded Ruins', '深沼ヒドラの水没遺跡'),
    l('월식지하궁 아래 검은 수로와 연결된 침수 유적. 7등급 깊은늪히드라가 잠복한다.', 'Flooded ruins linked to dark channels beneath Eclipse Vault. A rank 7 deep-marsh hydra lurks here.', '月蝕の地下宮の暗い水路に続く水没遺跡。7級の深沼ヒドラが潜む。')),
  site('obsidian-guardian', 'ashpeak', 'ruin', 7,
    l('흑요석 수호상의 제련 유적', 'Obsidian Guardian’s Foundry Ruins', '黒曜の守護像の炉跡'),
    l('잿불화산의 검은 재 아래 묻힌 옛 제련 유적. 7등급 흑요석 수호상이 길을 지킨다.', 'Ancient foundry ruins buried beneath Ashpeak’s black ash. A rank 7 obsidian guardian keeps the passage.', '燠火の火山の黒い灰に埋もれた古い炉の遺跡。7級の黒曜の守護像が道を守る。')),
  site('lich', 'oldwatch', 'ruin', 7,
    l('봉인묘 리치의 지하 유적', 'Sealed-Tomb Lich’s Burial Ruins', '封墓のリッチの地下遺跡'),
    l('옛망루성의 무너진 기초 아래 봉인된 묘실 유적. 7등급 리치가 마나를 모은다.', 'Sealed burial ruins beneath Oldwatch’s fallen foundations. A rank 7 lich gathers mana here.', '風化した見張り城の崩れた基礎の下に封じられた墓室遺跡。7級のリッチがマナを集める。')),
  site('phoenix', 'storm-isle', 'ruin', 7,
    l('잿불 불사조의 화로 유적', 'Ember Phoenix’s Brazier Ruins', '燠火の不死鳥の火壇遺跡'),
    l('천둥종섬의 지열이 새는 바위에 남은 옛 화로 유적. 7등급 잿불 불사조가 날개를 쉰다.', 'Ancient brazier ruins above geothermal fissures on Stormbell Isle. A rank 7 ember phoenix rests here.', '雷鐘の島の地熱が漏れる岩に残る古い火壇遺跡。7級の燠火の不死鳥が翼を休める。')),
  site('elder-dragon', 'ashpeak', 'lair', 8,
    l('고룡의 잿불 둥지', 'Elder Dragon’s Ember Lair', '古竜の燠火の巣'),
    l('잿불화산 깊은 곳의 비늘종 제단으로 이어지는 고룡의 둥지. 8등급 고룡은 결투 신호에만 응한다.', 'An elder dragon’s lair leading to the scale-gong altar deep in Ashpeak. The rank 8 dragon answers only a deliberate challenge.', '燠火の火山の奥の鱗鐘の祭壇へ続く古竜の巣。8級の古竜は明示した決闘の合図にのみ応じる。')),
  site('ancient-frost-dragon', 'frostpass', 'lair', 8,
    l('고대 서리용의 봉인 둥지', 'Ancient Frost Dragon’s Sealed Lair', '古き霜竜の封印の巣'),
    l('흰안개고개의 봉인된 빙문 뒤에 숨은 고대 서리용의 둥지. 8등급 용은 봉인못을 뽑기 전에는 싸우지 않는다.', 'An ancient frost dragon’s lair behind Frostpass’s sealed ice gate. The rank 8 dragon does not fight unless the seal pin is removed.', '白霧峠の封じた氷門の奥に隠れた古き霜竜の巣。8級の竜は封印釘を抜くまで戦わない。'), 'apex-frost-dragon'),
  site('ancient-storm-dragon', 'storm-isle', 'lair', 8,
    l('고대 폭풍용의 결투 둥지', 'Ancient Storm Dragon’s Duel Lair', '古き嵐竜の決闘の巣'),
    l('천둥종섬의 세 결투 사슬이 내려진 고대 폭풍용의 둥지. 8등급 용에게 도전하려면 경고를 확인해야 한다.', 'An ancient storm dragon’s lair beneath Stormbell Isle’s three duel chains. Challenging the rank 8 dragon requires acknowledging the warning.', '雷鐘の島の三本の決闘鎖が垂れる古き嵐竜の巣。8級の竜への挑戦には警告の確認が要る。'), 'apex-storm-dragon'),
  site('void-chimera', 'eclipsevault', 'ruin', 8,
    l('공허빛 키메라의 경계 유적', 'Void-Lit Chimera’s Boundary Ruins', '虚光のキマイラの境界遺跡'),
    l('월식지하궁의 닫힌 경계 화로를 감춘 유적. 8등급 공허빛 키메라는 화로에 불을 붙여야 나타난다.', 'Ruins concealing Eclipse Vault’s sealed boundary brazier. The rank 8 void-lit chimera appears only when the brazier is lit.', '月蝕の地下宮の閉じた境界火鉢を隠す遺跡。8級の虚光のキマイラは火鉢に火を灯して初めて現れる。')),
];

export const FANTASY_MONSTER_SITE_ITEMS: FantasyItem[] = FANTASY_MONSTER_SITES.map((entry): FantasyItem => {
  const names = l(`${entry.names.ko} 지도`, `${entry.names.en} Map`, `${entry.names.ja}の地図`);
  const descriptions = l(
    `${entry.descriptions.ko} 암시장 경매에서 드물게 구할 수 있는 비밀 지도다. 읽으면 접근로를 기억한다. 지도만으로 전투는 시작되지 않는다.`,
    `${entry.descriptions.en} A rare secret map from a black-market auction. Study it to remember the approach. Reading the map starts no battle.`,
    `${entry.descriptions.ja} 裏競売でまれに出る秘密の地図。読むと入口までの道を覚える。地図を読んでも戦闘は始まらない。`,
  );
  return { id: entry.item, name: names.ja, names, description: descriptions.ja, descriptions, price: entry.tier === 8 ? 18000 : 7000, category: 'black-market-map', tier: entry.tier === 8 ? 5 : 4, craftOnly: true };
});

export const fantasyMonsterSiteForItem = (item: string): FantasyMonsterSite | undefined => FANTASY_MONSTER_SITES.find(entry => entry.item === item);
export const fantasyMonsterSiteForProvocation = (id: string): FantasyMonsterSite | undefined => FANTASY_MONSTER_SITES.find(entry => entry.provocation === id);
export const fantasyKnownMonsterSites = (c: FantasyCharacter): FantasyMonsterSite[] => FANTASY_MONSTER_SITES.filter(entry => c.monsterSites?.includes(entry.id));

/** Resolve persisted map-use messages without changing their stable storage format. */
export function fantasyMonsterSiteText(source: string, locale: NpcLocale): string | undefined {
  if (source === 'この秘密の入口はすでに記録済みです。') return l('이 비밀 입구는 이미 기록했습니다.', 'This secret entrance is already recorded.', source)[locale];
  if (source === 'その地図を持っていません。') return l('그 지도를 가지고 있지 않습니다.', 'You do not have that map.', source)[locale];
  const match = /^魔物の地図［([a-z0-9-]+)］を読み、秘密の入口を地図に記録した。$/.exec(source);
  const entry = match && FANTASY_MONSTER_SITES.find(entry => entry.id === match[1]);
  if (!entry) return undefined;
  return l(`「${entry.names.ko}」 지도를 읽고 비밀 입구를 지도에 기록했다.`, `Read the map to ${entry.names.en} and recorded its secret entrance.`, `「${entry.names.ja}」の地図を読み、秘密の入口を地図に記録した。`)[locale];
}
