import type { FantasyCharacter, FantasyEquipmentSlot, FantasyItem } from './fantasy.ts';

export const FANTASY_EQUIPMENT_SLOTS = ['weapon', 'offhand', 'head', 'body', 'legs', 'feet', 'ring1', 'ring2', 'necklace', 'gloves', 'artifact'] as const;
export type FantasyCanonicalEquipmentSlot = typeof FANTASY_EQUIPMENT_SLOTS[number];
export function fantasyItemEquipmentSlots(item: FantasyItem): readonly FantasyCanonicalEquipmentSlot[] {
  const slot = item.equipment?.slot;
  if (!slot) return [];
  if (slot === 'armor') return [item.id === 'rime-cooling-wrap' ? 'head' : item.id === 'weatherproof-gaiters' ? 'legs' : 'body'];
  if (slot === 'accessory') {
    if (/(^|-)ring$/.test(item.id)) return ['ring1', 'ring2'];
    if (/gloves$/.test(item.id)) return ['gloves'];
    if (/lens$/.test(item.id)) return ['head'];
    return ['necklace'];
  }
  return slot === 'ring1' || slot === 'ring2' ? ['ring1', 'ring2'] : FANTASY_EQUIPMENT_SLOTS.includes(slot as FantasyCanonicalEquipmentSlot) ? [slot as FantasyCanonicalEquipmentSlot] : [];
}
export function fantasyEquipmentSlot(slot: FantasyEquipmentSlot, item?: FantasyItem): FantasyCanonicalEquipmentSlot | undefined {
  if (slot === 'armor' || slot === 'accessory') return item ? fantasyItemEquipmentSlots(item)[0] : slot === 'armor' ? 'body' : 'necklace';
  return FANTASY_EQUIPMENT_SLOTS.includes(slot as FantasyCanonicalEquipmentSlot) ? slot as FantasyCanonicalEquipmentSlot : undefined;
}
export function fantasyEquipmentEntries(character: Pick<FantasyCharacter, 'inventory' | 'equipment' | 'equippedGear' | 'gear'>, items: readonly FantasyItem[]): { slot: FantasyCanonicalEquipmentSlot; item: FantasyItem; instance?: string }[] {
  const entries: { slot: FantasyCanonicalEquipmentSlot; item: FantasyItem; instance?: string }[] = [];
  const counts = new Map<string, number>(), usedGear = new Set<string>(), occupied = new Set<string>();
  // 新しい部位を優先し、旧名が併存する保存でも効果を重ねない。
  const source = Object.entries(character.equipment ?? {}).sort(([a], [b]) => Number(a === 'armor' || a === 'accessory') - Number(b === 'armor' || b === 'accessory'));
  for (const [rawSlot, id] of source) {
    const item = items.find(item => item.id === id), slot = item && fantasyEquipmentSlot(rawSlot as FantasyEquipmentSlot, item);
    if (!item || !slot || occupied.has(slot) || !fantasyItemEquipmentSlots(item).includes(slot)) continue;
    const count = counts.get(id) ?? 0;
    if (count >= (character.inventory[id] ?? 0)) continue;
    const instance = character.equippedGear?.[rawSlot as FantasyEquipmentSlot];
    if (instance && (usedGear.has(instance) || !character.gear?.some(gear => gear.id === instance && gear.item === id))) continue;
    const plainUsed = entries.filter(entry => entry.item.id === id && !entry.instance).length;
    if (!instance && plainUsed >= Math.max(0, (character.inventory[id] ?? 0) - (character.gear ?? []).filter(gear => gear.item === id).length)) continue;
    entries.push({ slot, item, ...(instance ? { instance } : {}) });
    occupied.add(slot); counts.set(id, count + 1); if (instance) usedGear.add(instance);
  }
  return entries;
}
export function migrateFantasyEquipment(character: FantasyCharacter, items: readonly FantasyItem[]): void {
  if (!character.equipment || typeof character.equipment !== 'object' || Array.isArray(character.equipment)) return;
  for (const alias of ['armor', 'accessory'] as const) {
    const id: string | undefined = character.equipment[alias]; if (!id) continue;
    const item: FantasyItem | undefined = items.find(item => item.id === id);
    const slot: FantasyCanonicalEquipmentSlot | undefined = item && fantasyEquipmentSlot(alias, item);
    if (!slot) continue;
    if (!character.equipment[slot]) {
      character.equipment[slot] = id;
      const instance = character.equippedGear?.[alias];
      if (instance) { character.equippedGear ??= {}; character.equippedGear[slot] = instance; }
    }
    delete character.equipment[alias]; if (character.equippedGear) delete character.equippedGear[alias];
  }
}
export function validFantasyEquipment(character: FantasyCharacter, items: readonly FantasyItem[]): boolean {
  if (character.equipment === undefined) return character.equippedGear === undefined || Object.keys(character.equippedGear).length === 0;
  if (!character.equipment || typeof character.equipment !== 'object' || Array.isArray(character.equipment)) return false;
  return fantasyEquipmentEntries(character, items).length === Object.keys(character.equipment).length;
}
export function fantasyWornItemCount(character: FantasyCharacter, item: string): number {
  const worn = Object.values(character.equipment ?? {}).filter(id => id === item).length;
  return Math.max(worn, character.outfit === item ? 1 : 0);
}

export function fantasyOffhandEquipError(character: FantasyCharacter, item: FantasyItem, locale: 'ko' | 'en' | 'ja' = 'ja'): string | undefined {
  if (item.equipment?.slot !== 'offhand') return;
  const dagger = /dagger/.test(item.id);
  const allowed = dagger ? ['thief', 'assassin'].includes(character.job) : ['warrior', 'knight', 'shieldbearer'].includes(character.job) || character.job === 'priest' && character.priestGrowth?.branch === 'paladin';
  if (allowed) return;
  return dagger ? { ko: '보조 단검은 도적·암살자만 사용할 수 있습니다.', en: 'Offhand daggers require Thief or Assassin.', ja: '副手の短剣は盗賊・暗殺者だけが使えます。' }[locale]
    : { ko: '방패는 전사·기사·방패병 또는 성기사 계열 사제만 사용할 수 있습니다.', en: 'Shields require Warrior, Knight, Shieldbearer, or a Paladin priest.', ja: '盾は戦士・騎士・盾兵、または聖騎士系統の司祭だけが使えます。' }[locale];
}
export function fantasyActiveEquipmentEntries(character: FantasyCharacter, items: readonly FantasyItem[]) {
  return fantasyEquipmentEntries(character, items).filter(entry => !fantasyOffhandEquipError(character, entry.item));
}

export function fantasyEquipmentSlotName(slot: FantasyCanonicalEquipmentSlot, locale: 'ko' | 'en' | 'ja'): string {
  const names = {
    weapon: ['무기', 'Weapon', '武器'], offhand: ['보조 손', 'Offhand', '補助手'], head: ['머리', 'Head', '頭'], body: ['상의', 'Upper body', '上半身'],
    legs: ['하의', 'Legs', '下半身'], feet: ['신발', 'Feet', '足'], ring1: ['반지 1', 'Ring 1', '指輪1'], ring2: ['반지 2', 'Ring 2', '指輪2'],
    necklace: ['목걸이', 'Necklace', '首飾り'], gloves: ['장갑', 'Gloves', '手袋'], artifact: ['아티팩트', 'Artifact', 'アーティファクト'],
  };
  return names[slot][locale === 'ko' ? 0 : locale === 'en' ? 1 : 2];
}
