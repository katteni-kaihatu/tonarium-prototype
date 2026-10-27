import type { FantasyItem, FantasyRecipe, FantasyStats } from './fantasy.ts';
import type { FantasyCombatText } from './fantasy-combat-catalog.ts';

type Tuple = [string, string, string];
const text = ([ko, en, ja]: Tuple): FantasyCombatText => ({ ko, en, ja });
function material(id: string, names: Tuple, descriptions: Tuple, price: number): FantasyItem {
  const localized = text(names), body = text(descriptions);
  return { id, names: localized, name: localized.ja, descriptions: body, description: body.ja, price, category: 'apex-material', tier: 5 };
}
function gear(id: string, names: Tuple, descriptions: Tuple, slot: 'weapon' | 'armor' | 'offhand', stats: Partial<FantasyStats>, guard: number, price: number): FantasyItem {
  const localized = text(names), body = text(descriptions);
  return { id, names: localized, name: localized.ja, descriptions: body, description: body.ja, price, category: slot === 'armor' ? 'armor' : 'weapon', tier: 5, equipment: { slot, stats, ...(guard ? { guard } : {}) } };
}
export const FANTASY_COMBAT_LOOT_ITEMS: FantasyItem[] = [
  material('elder-dragon-scale', ['고룡의 심층비늘', 'Elder Dragon Deep Scale', '古竜の深鱗'], ['고룡이 남긴 두꺼운 비늘. 오랜 열기를 품어 최고급 무구의 겹침 재료로 쓴다.', 'A thick scale left by an elder dragon, carrying old heat and used to layer exceptional arms and armor.', '古竜が残した厚い鱗。古い熱を帯び、最高級の武具を重ねる素材となる。'], 220),
  material('ancient-frostheart', ['고대 서리용의 빙정핵', 'Ancient Frostheart', '古き霜竜の氷晶核'], ['고대 서리용의 마나가 굳은 핵. 정밀한 마력 통로를 가진 장비 제작에 쓰인다.', 'A core of crystallized ancient frost-dragon mana, used in equipment with precise magical channels.', '古き霜竜のマナが固まった核。精密な魔力路を持つ装備に用いる。'], 280),
  material('ancient-storm-sinew', ['고대 폭풍용의 뇌광힘줄', 'Ancient Storm Sinew', '古き嵐竜の雷光腱'], ['끊임없이 미세한 진동을 품는 힘줄. 강한 장력을 견디는 활과 겹침 무구에 쓴다.', 'Sinew holding a constant faint vibration, used for high-tension bows and layered equipment.', '絶えず微かな振動を帯びる腱。強い張力の弓や重ね武具に使う。'], 250),
  material('void-chimera-prism', ['공허빛 키메라의 경계결정', 'Void Chimera Boundary Prism', '虚光キマイラの境界晶'], ['빛의 가장자리가 어긋나 보이는 결정. 섬세한 마력 직조와 지팡이 제작에 쓴다.', 'A crystal whose light seems offset at the edges, used for delicate mana weaving and staves.', '光の輪郭がずれて見える結晶。繊細な魔力織りや杖の制作に使う。'], 300),
  gear('ember-oath-blade', ['잿불맹약검', 'Ember-Oath Blade', '燠火の誓剣'], ['고룡비늘과 오리할콘을 겹친 검. 힘과 기민한 검놀림을 함께 보탠다.', 'A blade layering elder scale and orichalcum, supporting strength and agile swordwork.', '古竜鱗とオリハルコンを重ねた剣。力と機敏な剣捌きを支える。'], 'weapon', { strength: 8, agility: 3 }, 0, 920),
  gear('tempest-longbow', ['뇌광장궁', 'Tempest Longbow', '雷光の長弓'], ['폭풍용 힘줄을 건 장궁. 민첩한 조준과 사수의 감각을 살린다.', 'A longbow strung with storm-dragon sinew, supporting agile aim and an archer’s instinct.', '嵐竜の腱を張った長弓。機敏な狙いと射手の感覚を支える。'], 'weapon', { agility: 10, luck: 2 }, 0, 940),
  gear('frostheart-staff', ['빙정심장 지팡이', 'Frostheart Staff', '氷晶心の杖'], ['빙정핵을 정밀하게 감싼 지팡이. 주문 해석과 마나의 여유를 보탠다.', 'A staff carefully enclosing a frostheart, supporting spell understanding and mana capacity.', '氷晶核を精密に包む杖。術式の理解とマナの余裕を補う。'], 'weapon', { intelligence: 10, mp: 20 }, 0, 960),
  gear('dragon-scale-lamellar', ['고룡겹비늘 갑옷', 'Elder-Scale Lamellar', '古竜の重ね鱗鎧'], ['고룡비늘을 겹쳐 엮은 갑옷. 공격력보다 체력과 방호를 중시한다.', 'Armor woven from layered elder scales, favoring endurance and protection over offense.', '古竜鱗を重ね繋いだ鎧。攻撃より体力と防護を重んじる。'], 'armor', { vitality: 7, hp: 40 }, 9, 1080),
  gear('void-woven-robe', ['경계직조 예복', 'Boundary-Woven Robe', '境界織りの法衣'], ['경계결정을 달비단에 엮은 예복. 중갑보다 가볍고 지능과 마나를 보탠다.', 'A robe weaving a boundary prism into moon silk, favoring intellect and mana over heavy plating.', '境界晶を月絹に織り込んだ法衣。重い装甲より知力とマナを支える。'], 'armor', { intelligence: 6, mp: 30 }, 7, 1040),
  gear('oathscale-bulwark', ['맹약비늘 대방패', 'Oathscale Bulwark', '誓鱗の大盾'], ['고룡비늘과 폭풍용 힘줄로 고정한 방패. 손을 차지하는 대신 단단한 방호를 제공한다.', 'A shield braced with elder scale and storm sinew, occupying the off hand in return for firm protection.', '古竜鱗と嵐竜の腱で留めた盾。片手を使う代わりに堅い防護を与える。'], 'offhand', { vitality: 5, strength: 2 }, 8, 980),
];
const recipe = (id: string, output: string, inputs: Record<string, number>, job: string, dc: number): FantasyRecipe => ({
  id, output, inputs, job, dc, count: 1, name: FANTASY_COMBAT_LOOT_ITEMS.find(item => item.id === output)!.name,
});
export const FANTASY_COMBAT_LOOT_RECIPES: FantasyRecipe[] = [
  recipe('craft-ember-oath-blade', 'ember-oath-blade', { 'elder-dragon-scale': 2, 'orichalcum-ingot': 2, 'ruby': 1 }, 'blacksmith', 25),
  recipe('craft-tempest-longbow', 'tempest-longbow', { 'ancient-storm-sinew': 2, 'worldtree-branch': 2, 'diamond': 1 }, 'carpenter', 25),
  recipe('craft-frostheart-staff', 'frostheart-staff', { 'ancient-frostheart': 1, 'moonwillow': 2, 'sapphire': 1 }, 'carpenter', 25),
  recipe('craft-dragon-scale-lamellar', 'dragon-scale-lamellar', { 'elder-dragon-scale': 2, 'adamant-ingot': 2, 'bear-hide': 1 }, 'blacksmith', 26),
  recipe('craft-void-woven-robe', 'void-woven-robe', { 'void-chimera-prism': 1, 'moon-silk': 2, 'silver-ingot': 1 }, 'tailor', 25),
  recipe('craft-oathscale-bulwark', 'oathscale-bulwark', { 'elder-dragon-scale': 1, 'ancient-storm-sinew': 1, 'starsteel-ingot': 2 }, 'blacksmith', 26),
];
