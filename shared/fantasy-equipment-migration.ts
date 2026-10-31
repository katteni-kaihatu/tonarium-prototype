import type { FantasyCharacter, FantasyStats } from './fantasy.ts';
import { FANTASY_ITEMS } from './fantasy-data.ts';
import { fantasyOffhandEquipError } from './fantasy-equipment-slots.ts';
import { fantasyItemBonuses, validFantasyItemState } from './fantasy-effects.ts';
import { fantasyStats, fantasyUnscaledMaxHp } from './fantasy-engine.ts';
import { fantasyJobHpMultiplier } from './fantasy-job-balance.ts';

export function migrateFantasyEquipmentResources(character: FantasyCharacter): boolean {
  if (character.equipmentVersion !== undefined) return false;
  const equipment = character.equipment;
  if (!equipment || typeof equipment !== 'object' || Array.isArray(equipment) || !character.inventory || typeof character.inventory !== 'object'
    || !Number.isSafeInteger(character.hp) || character.hp < 0 || !Number.isSafeInteger(character.mp) || character.mp < 0 || !Number.isFinite(character.hour)) return false;
  const entries = Object.entries(equipment);
  if (!entries.length || entries.some(([slot]) => !['weapon', 'offhand', 'armor', 'accessory'].includes(slot))) return false;
  const offhand = FANTASY_ITEMS.find(item => item.id === equipment.offhand);
  if (!equipment.armor && !equipment.accessory && !(offhand && fantasyOffhandEquipError(character, offhand))) return false;
  if (!validFantasyItemState(character, FANTASY_ITEMS)) return false;
  const previous: Partial<FantasyStats> = {};
  for (const [slot, id] of entries) {
    const item = FANTASY_ITEMS.find(item => item.id === id);
    if (!item?.equipment || item.equipment.slot !== slot || !Object.hasOwn(character.inventory, id) || !Number.isSafeInteger(character.inventory[id]) || character.inventory[id] < 1) return false;
    const instance = character.equippedGear?.[slot as keyof typeof equipment];
    const gear = instance ? character.gear?.find(gear => gear.id === instance && gear.item === id) : undefined;
    for (const values of [item.equipment.stats, gear?.bonuses]) for (const [key, value] of Object.entries(values ?? {})) {
      const stat = key as keyof FantasyStats; previous[stat] = (previous[stat] ?? 0) + value;
    }
  }
  const current = fantasyItemBonuses({ ...character, permanentBonuses: undefined, effects: [] }, FANTASY_ITEMS).stats;
  const delta: Partial<FantasyStats> = {};
  for (const stat of ['hp', 'mp', 'vitality', 'intelligence'] as const) delta[stat] = (previous[stat] ?? 0) - (current[stat] ?? 0);
  if (!Object.values(delta).some(value => value !== 0)) return false;
  // 保存しない差分効果で、種族・マナ・職業倍率と能力の下限を旧装備にも正確に適用する。
  const effects = (character.effects ?? []).map(effect => ({ ...effect, expiresAt: Math.max(effect.expiresAt, character.hour + 1) }));
  const preview = { ...character, effects: [...effects, { id: 'legacy-equipment-preview', expiresAt: character.hour + 1, stats: delta }] };
  const maximum = fantasyStats(character), oldMaximum = fantasyStats(preview);
  if (character.jobHpVersion === undefined) {
    const historical: Readonly<Record<string, number>> = { pugilist: 1.3, knight: 1.35, shieldbearer: 1.45 };
    oldMaximum.hp = Math.max(20, Math.round(fantasyUnscaledMaxHp(preview) * Math.max(1, historical[character.job] ?? 1, fantasyJobHpMultiplier(character.job))));
  }
  if (![maximum.hp, maximum.mp, oldMaximum.hp, oldMaximum.mp].every(Number.isFinite) || character.hp > oldMaximum.hp || character.mp > oldMaximum.mp) return false;
  const hp = Math.min(character.hp, maximum.hp), mp = Math.min(character.mp, maximum.mp);
  if (hp === character.hp && mp === character.mp) return false;
  character.hp = hp; character.mp = mp;
  return true;
}
