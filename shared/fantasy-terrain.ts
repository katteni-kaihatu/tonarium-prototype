import { fantasyHasJob } from './fantasy-careers.ts';
import type { FantasyAction, FantasyCharacter, FantasyCheckContext, FantasyLocation, FantasyProfile, FantasyResult, FantasySeason, FantasyStat, FantasyStats } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_ITEMS, FANTASY_LOCATIONS, FANTASY_RACES } from './fantasy-data.ts';
import { fantasyBodyTraits, fantasyContextBonus } from './fantasy-physiology.ts';
import { fantasyEnvironment, fantasyEnvironmentActionError } from './fantasy-environment.ts';
import { grantFantasyReputation } from './fantasy-reputation.ts';

type Localized = Record<NpcLocale, string>;
type Text = [ko: string, en: string, ja: string];
const l = ([ko, en, ja]: Text): Localized => ({ ko, en, ja });
export interface FantasyTerrainActivity {
  id: string; names: Localized; descriptions: Localized; successes: Localized; failures: Localized;
  jobs?: string[]; races?: string[]; families?: string[]; traits?: string[];
  locations?: string[]; kinds?: FantasyLocation['kind'][]; seasons?: FantasySeason[];
  stat: FantasyStat; dc: number; sides: 8 | 12 | 20; hours: 1 | 2; mp: number;
  bodyContext?: FantasyCheckContext; reward?: { item: string; count: number };
  reputation: number; failureDamage: number; practice: 'explore' | 'gather';
}
export interface FantasyTerrainContext {
  stats: FantasyStats;
  check: (profile: FantasyProfile, stat: FantasyStat, dc: number, label: string, rng: () => number, sides?: number) => boolean;
  addItem: (profile: FantasyProfile, item: string, count: number) => void;
  hurt: (profile: FantasyProfile, amount: number) => void;
}
type Options = Pick<FantasyTerrainActivity, 'stat' | 'dc' | 'sides'> & Partial<Omit<FantasyTerrainActivity, 'id' | 'names' | 'descriptions' | 'successes' | 'failures' | 'stat' | 'dc' | 'sides'>>;
function activity(id: string, title: Text, description: Text, options: Options): FantasyTerrainActivity {
  const names = l(title);
  const last = names.ko.charCodeAt(names.ko.length - 1), finalConsonant = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return { id, names, descriptions: l(description), successes: l([`${names.ko}${finalConsonant ? '을' : '를'} 마쳤다.`, `${names.en} is complete.`, `${names.ja}を終えた。`]), failures: l([`${names.ko}${finalConsonant ? '이' : '가'} 뜻대로 되지 않아 물러났다.`, `${names.en} did not work out; you withdrew.`, `${names.ja}は思うように進まず、引き返した。`]), hours: 1, mp: 0, reputation: 0, failureDamage: 2, practice: 'gather', ...options };
}

export const FANTASY_TERRAIN_ACTIVITIES: FantasyTerrainActivity[] = [
  activity('stealth-scout', ['은밀한 정찰', 'Covert Scouting', '密かな偵察'], ['숲·유적·도시에서 시선을 피해 동선을 살핀다. 실패하면 괴물이나 추격자와 마주칠 수 있다.', 'Survey routes through a forest, ruin or town without being noticed. Failure can lead to a monster or pursuer confrontation.', '森・遺跡・街で目を避けて動線を調べる。失敗すると魔物や追跡者と対峙することがある。'], { kinds: ['forest', 'ruin', 'city'], stat: 'agility', dc: 13, sides: 20, practice: 'explore', failureDamage: 0 }),
  activity('trail-reading', ['흔적 추적', 'Trail Reading', '痕跡の追跡'], ['숲과 습지의 눌린 풀을 따라가 약초 자리를 찾는다.', 'Follow bent grass through forests and marshes to find an herb patch.', '森や湿地の倒れた草をたどり、薬草の場所を探す。'], { jobs: ['hunter', 'scout', 'adventurer'], kinds: ['forest', 'swamp', 'snow'], stat: 'intelligence', dc: 12, sides: 20, bodyContext: 'keen-senses', reward: { item: 'herb', count: 2 } }),
  activity('woodland-sense', ['숲의 흐름 감응', 'Sense the Woodland', '森の流れの感応'], ['나뭇잎 사이의 마나를 느끼며 싱싱한 잎을 고른다.', 'Sense mana between the leaves and choose healthy herbs.', '葉の間の魔力を感じ、健やかな薬草を選ぶ。'], { families: ['elf', 'spirit'], kinds: ['forest'], stat: 'intelligence', dc: 10, sides: 12, mp: 4, bodyContext: 'keen-senses', reward: { item: 'herb', count: 2 } }),
  activity('mineral-seam', ['광맥 확인', 'Read the Mineral Seam', '鉱脈の確認'], ['드러난 암층의 결을 살피고 쓸 만한 광석을 떼어 낸다.', 'Read exposed rock grain and free usable ore.', '露出した地層を読み、使える鉱石を取り出す。'], { families: ['dwarf'], kinds: ['mountain', 'cave'], stat: 'intelligence', dc: 10, sides: 12, hours: 2, bodyContext: 'keen-senses', reward: { item: 'ore', count: 2 } }),
  activity('ledge-footing', ['바위 발판 다지기', 'Secure a Rocky Foothold', '岩の足場固め'], ['발굽이 닿을 바위의 흔들림을 확인하고 틈의 광석을 회수한다.', 'Test the rock beneath your hooves and recover ore from a fissure.', '蹄を置く岩の揺れを確かめ、割れ目の鉱石を回収する。'], { races: ['goatkin'], kinds: ['mountain'], stat: 'agility', dc: 7, sides: 8, bodyContext: 'high-place', reward: { item: 'ore', count: 1 }, failureDamage: 4 }),
  activity('echo-survey', ['메아리 탐사', 'Echo Survey', '反響の調査'], ['짧은 소리의 반향으로 가지굴을 구별하고 수정 조각을 찾는다.', 'Use brief echoes to distinguish side passages and locate a crystal shard.', '短い反響で枝洞を見分け、水晶の欠片を探す。'], { races: ['batkin'], kinds: ['cave'], stat: 'intelligence', dc: 7, sides: 8, bodyContext: 'keen-senses', reward: { item: 'crystal', count: 1 }, practice: 'explore' }),
  activity('crevice-survey', ['좁은 틈 조사', 'Survey a Narrow Crevice', '狭い隙間の調査'], ['작은 몸을 기울여 무너진 벽 틈의 오래된 물건을 회수한다.', 'Slip a small frame through a broken wall to recover an old object.', '小さな体を傾け、崩れた壁の隙間から古い物を回収する。'], { traits: ['small', 'tiny'], kinds: ['cave', 'ruin'], stat: 'agility', dc: 7, sides: 8, bodyContext: 'narrow-space', reward: { item: 'relic', count: 1 }, failureDamage: 3, practice: 'explore' }),
  activity('coastal-dive', ['해안 잠수', 'Coastal Dive', '沿岸の潜水'], ['얕은 암초 아래를 돌아 먹을 수 있는 물고기를 건진다.', 'Work beneath shallow reefs to catch edible fish.', '浅い岩礁の下を巡り、食べられる魚を採る。'], { families: ['seafolk'], kinds: ['coast', 'island'], stat: 'agility', dc: 10, sides: 12, bodyContext: 'deep-water', reward: { item: 'fish', count: 2 }, failureDamage: 4 }),
  activity('wreckwood-search', ['난파목 고르기', 'Sort Wreckwood', '漂着船材の選別'], ['항구에 떠밀린 나무 중 선체 수리에 쓸 결 좋은 목재를 고른다.', 'Choose sound repair timber from driftwood washed into the harbor.', '港に流れ着いた船材から、修繕に使える木目を選ぶ。'], { jobs: ['shipwright'], locations: ['tidehaven', 'dawnport', 'verdant-quay', 'saffron-port'], stat: 'dexterity', dc: 10, sides: 12, hours: 2, reward: { item: 'wood', count: 3 }, reputation: 1, failureDamage: 0 }),
  activity('ruin-transcription', ['유적 기록', 'Record Ruin Markings', '遺跡の記録'], ['풍화된 글자의 선을 대조하고 옮길 수 있는 점토판을 분류한다.', 'Compare weathered strokes and sort portable clay tablets.', '風化した文字を照合し、持ち運べる粘土板を分類する。'], { jobs: ['scribe', 'mage'], kinds: ['ruin', 'tower'], stat: 'intelligence', dc: 13, sides: 20, hours: 2, bodyContext: 'keen-senses', reward: { item: 'clay-tablet', count: 1 }, practice: 'explore' }),
  activity('winterflower-picking', ['겨울꽃 채집', 'Pick Winterblooms', '冬花の採取'], ['눈 사이의 어린 겨울꽃을 알아보고 뿌리를 남겨 채집한다.', 'Recognize young winterblooms in the snow and harvest without uprooting them.', '雪間の若い冬花を見分け、根を残して採る。'], { races: ['frostfairy', 'snow-elf'], locations: ['frostpass'], seasons: ['winter'], stat: 'intelligence', dc: 7, sides: 8, bodyContext: 'cold', reward: { item: 'winterbloom', count: 1 }, failureDamage: 3 }),
  activity('street-performance', ['거리 공연', 'Street Performance', '街角の演奏'], ['장터의 걸음을 방해하지 않으며 짧은 노래를 들려준다.', 'Offer a short song without blocking the market foot traffic.', '市の通行を妨げず、短い歌を披露する。'], { jobs: ['bard'], locations: ['hearth', 'suncourt', 'loom-village', 'redweave'], stat: 'charisma', dc: 12, sides: 20, reputation: 2, failureDamage: 0, practice: 'explore' }),
  activity('council-mediation', ['회의 중재', 'Mediate a Meeting', '寄り合いの仲裁'], ['거점 주민들의 작업 순서를 듣고 작은 다툼을 조정한다.', 'Hear residents’ work priorities and settle a small dispute.', '拠点の住民の仕事順を聞き、小さな争いを調整する。'], { jobs: ['leader'], locations: ['hearth', 'suncourt', 'redweave'], stat: 'charisma', dc: 13, sides: 20, hours: 2, reputation: 2, failureDamage: 0, practice: 'explore' }),
  activity('contact-inquiry', ['연락책 탐문', 'Ask the Local Contacts', '連絡役への聞き込み'], ['항구와 골목의 연락책에게 버려진 화물의 행방을 묻는다.', 'Ask harbor and alley contacts where abandoned cargo was left.', '港や路地の連絡役に、放置された荷の行方を尋ねる。'], { jobs: ['crimeboss'], locations: ['mooncity', 'tidehaven', 'saffron-port'], stat: 'intelligence', dc: 13, sides: 20, hours: 2, reward: { item: 'spice', count: 1 }, failureDamage: 0, practice: 'explore' }),
  activity('summoning-traces', ['소환 흔적 살피기', 'Examine Summoning Traces', '召喚の残り跡を探る'], ['남아 있는 계약 문양에 작은 마나를 흘려 매개 수정 조각을 찾는다.', 'Pass a small mana flow through residual covenant marks to find a focus shard.', '残る契約紋に小さな魔力を通し、媒介の水晶片を探す。'], { jobs: ['summoner'], kinds: ['ruin', 'island'], stat: 'intelligence', dc: 10, sides: 12, mp: 5, bodyContext: 'keen-senses', reward: { item: 'faint-crystal', count: 1 }, practice: 'explore' }),
  activity('field-ingredients', ['야외 식재료 손질', 'Prepare Wild Ingredients', '野外食材の下拵え'], ['들에서 찾은 향신 식물의 먹을 수 있는 부분을 골라 손질한다.', 'Sort and trim edible parts of wild spice plants.', '野で見つけた香草から食べられる部分を選び、整える。'], { jobs: ['cook'], locations: ['sunmeadow', 'rainvault', 'windstep'], stat: 'dexterity', dc: 10, sides: 12, reward: { item: 'spice', count: 2 } }),
  activity('farm-assistance', ['농지 일손 돕기', 'Help the Local Fields', '畑仕事の手伝い'], ['거점 가장자리의 물길과 곡물 자루를 정리하고 곡물을 나눈다.', 'Clear field channels and sort grain sacks at the settlement edge.', '拠点の畑の水路と穀物袋を整え、穀物を分けてもらう。'], { jobs: ['farmer'], locations: ['hearth', 'loom-village', 'suncourt'], stat: 'vitality', dc: 12, sides: 20, hours: 2, reward: { item: 'grain', count: 2 }, reputation: 1, failureDamage: 0 }),
  activity('flax-sorting', ['아마줄기 고르기', 'Sort Flax Stems', '亜麻の茎の選別'], ['물에 불린 아마에서 긴 섬유가 남은 줄기를 골라 공동 작업을 돕는다.', 'Select long-fiber stems from soaked flax for the communal workshop.', '水に浸した亜麻から長い繊維を持つ茎を選び、共同作業を助ける。'], { jobs: ['weaver', 'tailor'], locations: ['loom-village', 'verdant-quay'], stat: 'dexterity', dc: 10, sides: 12, reward: { item: 'flax', count: 2 }, reputation: 1, failureDamage: 0 }),
  activity('sanctuary-herbs', ['성소 약초 정리', 'Sort Sanctuary Herbs', '聖所の薬草整理'], ['신전의 약초 봉지를 대조하고 순례자에게 쓸 묶음을 정리한다.', 'Compare temple herb sacks and prepare bundles for pilgrims.', '神殿の薬草袋を照合し、巡礼者向けの束を整える。'], { jobs: ['priest', 'herbalist'], locations: ['hearth', 'suncourt', 'mooncity'], stat: 'intelligence', dc: 11, sides: 20, reward: { item: 'herb', count: 1 }, reputation: 1, failureDamage: 0 }),
  activity('marsh-reagent', ['습지 잔류물 감별', 'Inspect Marsh Residue', '湿地の残留物の鑑別'], ['소량의 마나로 물가 표본을 구별하고 월박하 잎을 골라 낸다.', 'Use a little mana to distinguish waterside samples and select moonmint.', '少しの魔力で水辺の標本を見分け、月薄荷の葉を選ぶ。'], { jobs: ['alchemist'], locations: ['reedfen', 'duskmire'], stat: 'intelligence', dc: 10, sides: 12, mp: 3, reward: { item: 'moonmint', count: 1 } }),
  activity('ore-sorting', ['노두 광석 선별', 'Sort Exposed Ore', '露頭の鉱石選別'], ['표면이 갈라진 암석을 도구로 벌려 구리 광석을 고른다.', 'Open fractured surface rock with tools and sort copper ore.', '割れた露頭を道具で開き、銅鉱石を選ぶ。'], { jobs: ['blacksmith'], locations: ['ironridge', 'cinder-stair'], stat: 'strength', dc: 10, sides: 12, hours: 2, bodyContext: 'heavy-lifting', reward: { item: 'copper-ore', count: 2 }, failureDamage: 4 }),
  activity('fallen-branch', ['쓰러진 가지 재단', 'Trim Fallen Branches', '倒れ枝の切り揃え'], ['쓰러진 가지의 썩은 부분을 덜어 내고 곧은 참나무 재료를 얻는다.', 'Trim rot from fallen branches to recover straight oak stock.', '倒れ枝の腐った部分を除き、真っ直ぐな樫材を得る。'], { jobs: ['carpenter'], locations: ['greenwood', 'rainvault', 'windstep'], stat: 'dexterity', dc: 10, sides: 12, reward: { item: 'oak-wood', count: 1 } }),
  activity('clay-bank', ['점토 둑 살피기', 'Inspect the Clay Bank', '粘土岸の見極め'], ['무너지기 쉬운 둑을 피해 고운 점토를 덜어 낸다.', 'Recover fine clay while avoiding unstable banks.', '崩れやすい岸を避け、細かな粘土を取る。'], { jobs: ['potter'], locations: ['reedfen', 'verdant-quay'], stat: 'dexterity', dc: 9, sides: 12, reward: { item: 'clay', count: 2 }, failureDamage: 3 }),
  activity('cargo-appraisal', ['항구 화물 감정', 'Harbor Cargo Appraisal', '港の荷の目利き'], ['도착한 향신료 봉지의 상태를 확인하고 하역장 일을 돕는다.', 'Check arriving spice sacks and help the unloading crew.', '届いた香辛料袋の状態を確かめ、荷下ろしを手伝う。'], { jobs: ['merchant'], locations: ['tidehaven', 'dawnport', 'saffron-port'], stat: 'charisma', dc: 12, sides: 20, reward: { item: 'spice', count: 1 }, reputation: 1, failureDamage: 0 }),
  activity('winged-perch', ['높은 발판 살피기', 'Survey a High Perch', '高い足場の確認'], ['날개로 균형을 잡아 가까운 돌턱의 수정 조각을 회수한다.', 'Balance with your wings to recover a crystal from a nearby ledge.', '翼で均衡を保ち、近くの岩棚から水晶片を回収する。'], { traits: ['winged'], kinds: ['mountain', 'ruin', 'tower'], stat: 'agility', dc: 7, sides: 8, bodyContext: 'high-place', reward: { item: 'crystal', count: 1 }, failureDamage: 4, practice: 'explore' }),
  activity('scent-trail', ['향으로 표본 찾기', 'Find Samples by Scent', '香りで標本を探す'], ['예민한 감각으로 풀 사이의 햇뿌리 냄새를 구별한다.', 'Use keen senses to distinguish sunroot among the grasses.', '鋭い感覚で草の間の陽根の香りを見分ける。'], { traits: ['keen'], kinds: ['forest', 'swamp'], stat: 'intelligence', dc: 10, sides: 12, bodyContext: 'keen-senses', reward: { item: 'sunroot', count: 1 } }),
  activity('warm-stone', ['따뜻한 암층 조사', 'Inspect Warm Strata', '暖かい地層の調査'], ['열이 남은 바위의 이끼를 조심스럽게 떼어 낸다.', 'Carefully lift embermoss from rock that still holds heat.', '熱の残る岩から熾苔を慎重に剥がす。'], { traits: ['heatproof'], locations: ['ashpeak', 'cinder-stair'], stat: 'vitality', dc: 11, sides: 12, bodyContext: 'heat', reward: { item: 'embermoss', count: 1 }, failureDamage: 4 }),
  activity('submerged-crystal', ['물속 수정 살피기', 'Survey Submerged Crystal', '水中の水晶探し'], ['물속에서 짧게 머물며 바위에 느슨하게 박힌 수정을 건진다.', 'Remain underwater briefly to recover a loose crystal from the rocks.', '水中に短く留まり、岩に緩く挟まる水晶を拾う。'], { traits: ['aquatic'], kinds: ['coast', 'island'], stat: 'vitality', dc: 11, sides: 12, bodyContext: 'deep-water', reward: { item: 'crystal', count: 1 }, failureDamage: 4 }),
  activity('brace-debris', ['무거운 잔해 받치기', 'Brace Heavy Debris', '重い瓦礫の支え'], ['튼튼한 체격으로 들보를 받쳐 쓸 수 있는 목재를 꺼낸다.', 'Brace a fallen beam with a sturdy frame to recover usable timber.', '頑丈な体で倒れた梁を支え、使える木材を取り出す。'], { traits: ['heavy', 'sturdy', 'large'], kinds: ['cave', 'ruin'], stat: 'strength', dc: 13, sides: 20, hours: 2, bodyContext: 'heavy-lifting', reward: { item: 'wood', count: 2 }, failureDamage: 4 }),
];

function definition(value: string | FantasyTerrainActivity): FantasyTerrainActivity | undefined {
  return FANTASY_TERRAIN_ACTIVITIES.find(activity => activity.id === (typeof value === 'string' ? value : value.id));
}
export function fantasyTerrainAllowed(character: FantasyCharacter, value: string | FantasyTerrainActivity): boolean {
  const activity = definition(value), place = FANTASY_LOCATIONS.find(place => place.id === character.location);
  if (!activity || !place || character.hp <= 0) return false;
  const race = FANTASY_RACES.find(race => race.id === character.race);
  if (!race) return false;
  return (!activity.jobs || activity.jobs.some(job=>fantasyHasJob(character,job)))
    && (!activity.races || activity.races.includes(character.race))
    && (!activity.families || activity.families.includes(race.family))
    && (!activity.traits || fantasyBodyTraits(character).some(trait => activity.traits!.includes(trait.id)))
    && (!activity.locations || activity.locations.includes(place.id))
    && (!activity.kinds || activity.kinds.includes(place.kind))
    && (!activity.seasons || activity.seasons.includes(fantasyEnvironment(character).season));
}
export function fantasyTerrainActivities(character: FantasyCharacter): FantasyTerrainActivity[] {
  return FANTASY_TERRAIN_ACTIVITIES.filter(activity => fantasyTerrainAllowed(character, activity));
}
export function fantasyTerrainHours(action: FantasyAction): number {
  return action.type === 'terrain' ? definition(action.activity)?.hours ?? 0 : 0;
}

const ERRORS: Record<string, Localized> = {
  'この職業・種族・場所では、その地形行動はできません。': l(['현재 직업·종족·장소에서는 해당 지형 행동을 할 수 없습니다.', 'Your profession, ancestry or location cannot perform that terrain activity.', 'この職業・種族・場所では、その地形行動はできません。']),
  '地形行動に必要なMPが足りません。': l(['지형 행동에 필요한 MP가 부족합니다.', 'You lack the MP required for this terrain activity.', '地形行動に必要なMPが足りません。']),
  '地形行動の品物を確認できません。': l(['지형 행동의 획득품을 확인할 수 없습니다.', 'The terrain activity reward is not registered.', '地形行動の品物を確認できません。']),
};
function outcome(activity: FantasyTerrainActivity, success: boolean, locale: NpcLocale): string {
  let text = `「${activity.names[locale]}」：${(success ? activity.successes : activity.failures)[locale]}`;
  if (success && activity.reward) {
    const item = FANTASY_ITEMS.find(item => item.id === activity.reward!.item)!;
    const name = item.names?.[locale] ?? item.name, count = activity.reward.count;
    text += l([` ${name} ${count}개를 얻었다.`, ` Gained ${count} ${name}.`, `${name}を${count}個得た。`])[locale];
  }
  if (success && activity.reputation) text += l([' 현지 평판이 조금 올랐다.', ' Local reputation improved a little.', '現地の評判が少し上がった。'])[locale];
  return text;
}
export function fantasyTerrainText(text: string, locale: NpcLocale): string | undefined {
  if (Object.hasOwn(ERRORS, text)) return ERRORS[text][locale];
  for (const activity of FANTASY_TERRAIN_ACTIVITIES) {
    for (const success of [true, false]) if (outcome(activity, success, 'ja') === text) return outcome(activity, success, locale);
  }
  return undefined;
}

/** Mutates the engine-provided clone. The engine alone advances time/revision and grants practice. */
export function applyFantasyTerrain(profile: FantasyProfile, action: FantasyAction, rng: () => number, context: FantasyTerrainContext): FantasyResult | undefined {
  if (action.type !== 'terrain') return undefined;
  const character = profile.character, activity = definition(action.activity);
  const fail = (error: string): FantasyResult => ({ profile, changed: false, error });
  if (!character || !activity || !fantasyTerrainAllowed(character, activity)) return fail('この職業・種族・場所では、その地形行動はできません。');
  const environmentError = fantasyEnvironmentActionError(character, action);
  if (environmentError) return fail(environmentError);
  if (character.mp < activity.mp) return fail('地形行動に必要なMPが足りません。');
  if (activity.reward && !FANTASY_ITEMS.some(item => item.id === activity.reward!.item)) return fail('地形行動の品物を確認できません。');
  character.mp -= activity.mp;
  const bodyBonus = activity.bodyContext ? fantasyContextBonus(character, activity.bodyContext) : 0;
  const success = context.check(profile, activity.stat, activity.dc - bodyBonus, activity.names.ja, rng, activity.sides);
  if (success) {
    if (activity.reward) context.addItem(profile, activity.reward.item, activity.reward.count);
    if (activity.reputation) grantFantasyReputation(character, activity.reputation);
  } else if (activity.failureDamage) context.hurt(profile, activity.failureDamage);
  profile.log.push({ id: (profile.log.at(-1)?.id ?? 0) + 1, hour: character.hour, text: outcome(activity, success, 'ja'), kind: success ? 'success' : 'failure' });
  profile.log = profile.log.slice(-100);
  return { profile, changed: true };
}
