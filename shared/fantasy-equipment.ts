import type { FantasyCharacter, FantasyGearInstance, FantasyItem, FantasyRecipe, FantasyStat, FantasyStats } from './fantasy.ts';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_RACES } from './fantasy-data.ts';
import { fantasyAvailableJobSkills, fantasyProfessionGrade, fantasySkilledPower } from './fantasy-progression.ts';
import { fantasyLearnedSkills } from './fantasy-apprenticeship.ts';

const itemOf = (id: string) => FANTASY_ITEMS.find(item => item.id === id);
const categories = ['ore', 'ingot', 'wood', 'hide', 'cloth', 'silk'];
const slots = ['weapon', 'offhand', 'armor', 'accessory'] as const;
export function fantasyMaterialGrade(item: FantasyItem): number {
  if (/starsteel|adamant|orichalcum/.test(item.id)) return 4;
  if (/mithril|worldtree|moon-silk/.test(item.id)) return 3;
  if (/ironwood|moonwillow|silver|gold|bear|lizard/.test(item.id)) return 2;
  return item.tier ?? 1;
}
export function fantasyCraftOutputCount(character: FantasyCharacter, recipe: FantasyRecipe): number {
  const skills = [...(FANTASY_RACES.find(race => race.id === character.race)?.skills ?? []), ...fantasyAvailableJobSkills(character), ...fantasyLearnedSkills(character)];
  const bonus = skills.filter(skill => skill.kind === 'passive' && skill.effect === 'reward').reduce((sum, skill) => sum + fantasySkilledPower(character, skill), 0);
  const buff = character.buff?.effect === 'reward' && (character.buff.expiresAt === undefined || character.buff.expiresAt > character.hour) ? character.buff.power : 0;
  return recipe.count + bonus + buff;
}
export function fantasyCraftInputs(character: FantasyCharacter, recipe: FantasyRecipe, material?: string, gem?: string): { inputs: Record<string, number>; count: number; material?: string; error?: string } {
  const inputs = { ...recipe.inputs };
  const count = fantasyCraftOutputCount(character, recipe);
  const output = itemOf(recipe.output);
  if ((material || gem) && !output?.equipment) return { inputs, count, error: '素材や宝石の追加指定は装備の制作で使います。' };
  if (material) {
    const selected = itemOf(material);
    const original = selected && categories.includes(selected.category ?? '') ? Object.keys(inputs).find(id => itemOf(id)?.category === selected.category) : undefined;
    if (!original) return { inputs, count, error: 'この製法では指定した素材に置き換えられません。' };
    if (original !== material) { const count = inputs[original]; delete inputs[original]; inputs[material] = (inputs[material] ?? 0) + count; }
  }
  if (gem) {
    if (itemOf(gem)?.category !== 'gem') return { inputs, count, error: '装備に使える登録済みの宝石を選んでください。' };
    inputs[gem] = (inputs[gem] ?? 0) + count;
  }
  if (Object.entries(inputs).some(([id, count]) => (character.inventory[id] ?? 0) < count)) return { inputs, count, error: '材料が足りません。' };
  return { inputs, count, material: material ?? Object.keys(inputs).filter(id => categories.includes(itemOf(id)?.category ?? '')).sort((a, b) => fantasyMaterialGrade(itemOf(b)!) - fantasyMaterialGrade(itemOf(a)!))[0] };
}

function qualityBonuses(item: FantasyItem, quality: number, gem?: string) {
  const bonuses: Partial<FantasyStats> = {};
  const keys = Object.keys(item.equipment?.stats ?? {}) as (keyof FantasyStats)[];
  for (const [index, stat] of keys.entries()) bonuses[stat] = (stat === 'hp' || stat === 'mp' ? 4 : index === 0 ? 1 : 0.5) * (quality - 1);
  for (const stat of keys) bonuses[stat] = Math.floor(bonuses[stat]!);
  if (gem) {
    const stat = gem === 'ruby' ? 'strength' : gem === 'sapphire' ? 'intelligence' : gem === 'diamond' ? 'vitality' : gem === 'moonstone' ? 'mp' : 'luck';
    bonuses[stat] = (bonuses[stat] ?? 0) + (stat === 'mp' ? 5 : 1);
  }
  return { bonuses, guard: item.equipment?.guard ? Math.floor(quality / 2) : 0, check: 0 };
}
export function createFantasyGear(character: FantasyCharacter, itemId: string, rng: () => number, material?: string, gem?: string): FantasyGearInstance | undefined {
  const item = itemOf(itemId);
  if (!item?.equipment) return undefined;
  const materialGrade = material && itemOf(material) ? fantasyMaterialGrade(itemOf(material)!) : 1;
  const score = materialGrade * 10 + fantasyProfessionGrade(character) * 10 + (gem ? 12 : 0) + (Math.max(0, Math.min(0.999999, Number(rng()) || 0)) * 4 - 2);
  const quality = (score >= 88 ? 5 : score >= 68 ? 4 : score >= 48 ? 3 : score >= 28 ? 2 : 1) as FantasyGearInstance['quality'];
  let suffix = 0; const prefix = `gear-${Math.floor(character.hour)}-${item.id}-`;
  while (character.gear?.some(gear => gear.id === `${prefix}${suffix}`)) suffix++;
  const instance: FantasyGearInstance = { id: `${prefix}${suffix}`, item: item.id, quality, ...qualityBonuses(item, quality, gem), ...(material ? { material } : {}), ...(gem ? { gem } : {}), createdAt: character.hour };
  character.gear ??= []; character.gear.push(instance);
  return instance;
}
export function fantasyEquippedGear(character: FantasyCharacter): FantasyGearInstance[] {
  return Object.entries(character.equippedGear ?? {}).flatMap(([slot, id]) => {
    const gear = character.gear?.find(gear => gear.id === id);
    return gear && character.equipment?.[slot as typeof slots[number]] === gear.item && itemOf(gear.item)?.equipment?.slot === slot && (character.inventory[gear.item] ?? 0) > 0 ? [gear] : [];
  });
}
export function fantasyEquipGear(character: FantasyCharacter, itemId: string, instance?: string): string | undefined {
  const item = itemOf(itemId);
  if (!item?.equipment || (character.inventory[itemId] ?? 0) < 1) return '所有する装備品を選んでください。';
  const owned = (character.gear ?? []).filter(gear => gear.item === itemId);
  const selected = instance ? owned.find(gear => gear.id === instance) : owned.sort((a, b) => b.quality - a.quality)[0];
  if (instance && !selected) return '指定した装備の個体を持っていません。';
  if (character.equipment?.[item.equipment.slot] === itemId && character.equippedGear?.[item.equipment.slot] === selected?.id) return 'すでに装備しています。';
  character.equipment ??= {}; character.equippedGear ??= {};
  character.equipment[item.equipment.slot] = itemId;
  if (selected) character.equippedGear[item.equipment.slot] = selected.id;
  else delete character.equippedGear[item.equipment.slot];
  return undefined;
}
export function fantasySpendItem(character: FantasyCharacter, itemId: string, count: number, instance?: string): boolean {
  if (!Number.isSafeInteger(count) || count < 1) return false;
  const held = character.inventory[itemId] ?? 0;
  const worn = Object.values(character.equipment ?? {}).includes(itemId) || character.outfit === itemId ? 1 : 0;
  if (held - worn < count) return false;
  const wornIds = new Set(Object.values(character.equippedGear ?? {}));
  const owned = (character.gear ?? []).filter(gear => gear.item === itemId);
  const selected = instance ? owned.find(gear => gear.id === instance && !wornIds.has(gear.id)) : undefined;
  if (instance && (count !== 1 || !selected)) return false;
  const removed = new Set<string>();
  if (selected) removed.add(selected.id);
  else {
    const plain = Math.max(0, held - owned.length - (worn && !owned.some(gear => wornIds.has(gear.id)) ? 1 : 0));
    let remaining = Math.max(0, count - plain);
    for (const gear of owned.filter(gear => !wornIds.has(gear.id)).sort((a, b) => a.quality - b.quality || a.createdAt - b.createdAt)) if (remaining > 0) { removed.add(gear.id); remaining--; }
    if (remaining > 0) return false;
  }
  character.inventory[itemId] = held - count;
  if (removed.size) character.gear = character.gear!.filter(gear => !removed.has(gear.id));
  return true;
}
export function fantasyCombatStat(character: FantasyCharacter): FantasyStat {
  const weapon = character.equipment?.weapon ?? '';
  if (/bow|crossbow/.test(weapon)) return 'agility';
  if (/staff|sacred-book/.test(weapon)) return 'intelligence';
  const job = FANTASY_JOBS.find(job => job.id === character.job);
  return ['warrior', 'knight', 'spearfighter', 'archer', 'scout', 'pugilist', 'spellblade', 'shieldbearer', 'summoner', 'priest', 'hunter', 'mage', 'alchemist'].includes(character.job) ? job?.stat ?? 'strength' : 'strength';
}
export function validFantasyGear(character: FantasyCharacter): boolean {
  const gear = character.gear ?? [];
  if (!Array.isArray(gear) || gear.length > 1000 || new Set(gear.map(item => item?.id)).size !== gear.length) return false;
  for (const instance of gear) {
    if (!instance || typeof instance !== 'object' || Array.isArray(instance) || Object.keys(instance).some(key => !['id', 'item', 'quality', 'bonuses', 'guard', 'check', 'material', 'gem', 'createdAt'].includes(key))
      || typeof instance.id !== 'string' || !/^gear-[a-z0-9-]{1,110}$/.test(instance.id) || !Number.isInteger(instance.quality) || instance.quality < 1 || instance.quality > 5 || !Number.isFinite(instance.createdAt) || instance.createdAt < 0 || instance.createdAt > character.hour
      || instance.material !== undefined && typeof instance.material !== 'string' || instance.gem !== undefined && typeof instance.gem !== 'string'
      || instance.bonuses !== undefined && (!instance.bonuses || typeof instance.bonuses !== 'object' || Array.isArray(instance.bonuses))) return false;
    const item = itemOf(instance.item);
    if (!item?.equipment || instance.material && !categories.includes(itemOf(instance.material)?.category ?? '') || instance.gem && itemOf(instance.gem)?.category !== 'gem') return false;
    const expected = qualityBonuses(item, instance.quality, instance.gem);
    const ordered = (value: object | undefined) => Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b));
    if (JSON.stringify(ordered(instance.bonuses)) !== JSON.stringify(ordered(expected.bonuses)) || (instance.guard ?? 0) !== expected.guard || (instance.check ?? 0) !== expected.check) return false;
    if (gear.filter(gear => gear.item === instance.item).length > (character.inventory[instance.item] ?? 0)) return false;
  }
  if (character.equippedGear !== undefined) {
    if (!character.equippedGear || typeof character.equippedGear !== 'object' || Array.isArray(character.equippedGear)) return false;
    for (const [slot, id] of Object.entries(character.equippedGear)) if (!slots.includes(slot as typeof slots[number]) || !gear.some(gear => gear.id === id && gear.item === character.equipment?.[slot as typeof slots[number]] && itemOf(gear.item)?.equipment?.slot === slot)) return false;
  }
  return true;
}
