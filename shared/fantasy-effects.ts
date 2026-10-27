import type { FantasyCharacter, FantasyItem, FantasyStats, FantasyTimedEffect } from './fantasy.ts';
import { fantasyEquippedGear, validFantasyGear } from './fantasy-equipment.ts';

const STAT_KEYS = ['hp', 'mp', 'strength', 'agility', 'intelligence', 'luck', 'vitality', 'dexterity', 'charisma'] as const;
export const FANTASY_PERMANENT_STAT_CAP = 3;
export const FANTASY_PERMANENT_RESOURCE_CAP = 20;
export const FANTASY_MAX_EFFECTS = 8;
export const FANTASY_MAX_EFFECT_HOURS = 48;
export const FANTASY_STATUS_DEFINITIONS = {
  poison: { hours: 6, periodicHp: -2, check: -1 },
  burn: { hours: 4, periodicHp: -3 },
  frost: { hours: 6, stats: { agility: -2, strength: -1 }, diceFaces: 'lower' },
  weakness: { hours: 8, check: -2 },
} as const;
export type FantasyStatusId = keyof typeof FANTASY_STATUS_DEFINITIONS;

export function fantasyActiveEffects(character: FantasyCharacter): FantasyTimedEffect[] {
  return (character.effects ?? []).filter(effect => effect.expiresAt > character.hour);
}
export function pruneFantasyEffects(character: FantasyCharacter): void {
  if (character.effects) character.effects = fantasyActiveEffects(character);
}
export function addFantasyEffect(character: FantasyCharacter, effect: Omit<FantasyTimedEffect, 'expiresAt'> & { hours: number }): boolean {
  const expiresAt = character.hour + Math.max(1, Math.min(FANTASY_MAX_EFFECT_HOURS, effect.hours));
  const { hours: _, ...values } = effect;
  const replacement = { ...structuredClone(values), expiresAt };
  const active = fantasyActiveEffects(character);
  const prior = active.find(entry => entry.id === effect.id);
  if (prior && JSON.stringify(prior) === JSON.stringify(replacement)) return false;
  const others = active.filter(entry => entry.id !== effect.id);
  if (others.length >= FANTASY_MAX_EFFECTS) return false;
  character.effects = [...others, replacement];
  return true;
}
export function addFantasyStatus(character: FantasyCharacter, id: FantasyStatusId): boolean {
  if (!Object.hasOwn(FANTASY_STATUS_DEFINITIONS, id)) return false;
  return addFantasyEffect(character, { id, ...FANTASY_STATUS_DEFINITIONS[id] });
}
export function fantasyEffectDamage(character: FantasyCharacter, from: number, to: number): number {
  return (character.effects ?? []).reduce((sum, effect) => sum + Math.max(0, -Math.min(0, effect.periodicHp ?? 0))
    * Math.max(0, Math.floor(Math.min(to, effect.expiresAt)) - Math.floor(from)), 0);
}
export function fantasyEquipmentItems(character: FantasyCharacter, items: readonly FantasyItem[]): FantasyItem[] {
  return Object.entries(character.equipment ?? {}).flatMap(([slot, id]) => {
    const item = items.find(item => item.id === id && item.equipment?.slot === slot);
    return item && (character.inventory[item.id] ?? 0) > 0 ? [item] : [];
  });
}
export function fantasyItemBonuses(character: FantasyCharacter, items: readonly FantasyItem[]): { stats: Partial<FantasyStats>; check: number; guard: number } {
  const stats: Partial<FantasyStats> = {};
  for (const key of STAT_KEYS) {
    const bonus = character.permanentBonuses?.[key] ?? 0;
    if (bonus) stats[key] = Math.max(0, Math.min(key === 'hp' || key === 'mp' ? FANTASY_PERMANENT_RESOURCE_CAP : FANTASY_PERMANENT_STAT_CAP, bonus));
  }
  let check = 0, guard = 0;
  for (const source of [...fantasyEquipmentItems(character, items).map(item => item.equipment!), ...fantasyEquippedGear(character).map(gear => ({ stats: gear.bonuses, check: gear.check, guard: gear.guard })), ...fantasyActiveEffects(character)]) {
    for (const [key, value] of Object.entries(source.stats ?? {})) stats[key as keyof FantasyStats] = (stats[key as keyof FantasyStats] ?? 0) + value;
    check += source.check ?? 0;
    guard += source.guard ?? 0;
  }
  return { stats, check: Math.max(-8, Math.min(8, check)), guard: Math.max(0, Math.min(15, guard)) };
}

export function applyFantasyItemUse(character: FantasyCharacter, item: FantasyItem, maximum: FantasyStats): { changed: boolean; hp: number; mp: number; nutrition: number } {
  const use = item.use;
  if (!use) return { changed: false, hp: 0, mp: 0, nutrition: 0 };
  const before = JSON.stringify([character.hp, character.mp, character.fatigue, character.hunger, character.effects, character.permanentBonuses]);
  const hp = Math.min(Math.max(0, maximum.hp - character.hp), use.hp ?? 0);
  const mp = Math.min(Math.max(0, maximum.mp - character.mp), use.mp ?? 0);
  character.hp += hp;
  character.mp += mp;
  if (use.fatigue) character.fatigue = Math.max(0, character.fatigue - use.fatigue);
  if (use.hunger) character.hunger = Math.max(0, character.hunger - use.hunger);
  if (use.cure?.length && character.effects) character.effects = character.effects.filter(effect => !use.cure!.includes(effect.id));
  if (use.effect) addFantasyEffect(character, use.effect);
  if (use.permanent) {
    for (const [key, amount] of Object.entries(use.permanent)) {
      const stat = key as keyof FantasyStats;
      const cap = Math.min(use.permanentCap ?? FANTASY_PERMANENT_STAT_CAP, stat === 'hp' || stat === 'mp' ? FANTASY_PERMANENT_RESOURCE_CAP : FANTASY_PERMANENT_STAT_CAP);
      character.permanentBonuses ??= {};
      character.permanentBonuses[stat] = Math.min(cap, (character.permanentBonuses[stat] ?? 0) + amount);
    }
  }
  const after = JSON.stringify([character.hp, character.mp, character.fatigue, character.hunger, character.effects, character.permanentBonuses]);
  return { changed: before !== after, hp, mp, nutrition: use.hunger ?? 0 };
}

export function validFantasyItemState(character: FantasyCharacter, items: readonly FantasyItem[]): boolean {
  if (!validFantasyGear(character)) return false;
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  if (character.equipment !== undefined) {
    if (!object(character.equipment) || Object.keys(character.equipment).some(slot => !['weapon', 'armor', 'accessory', 'offhand'].includes(slot))) return false;
    const entries = Object.entries(character.equipment);
    if (new Set(entries.map(([, id]) => id)).size !== entries.length || entries.some(([slot, id]) => !items.some(item => item.id === id && item.equipment?.slot === slot) || (character.inventory[id] ?? 0) < 1)) return false;
  }
  if (character.permanentBonuses !== undefined && (!object(character.permanentBonuses) || Object.entries(character.permanentBonuses).some(([key, value]) => !STAT_KEYS.includes(key as typeof STAT_KEYS[number]) || !Number.isInteger(value) || Number(value) < 0 || Number(value) > (key === 'hp' || key === 'mp' ? 20 : 3)))) return false;
  if (character.effects !== undefined) {
    if (!Array.isArray(character.effects) || character.effects.length > FANTASY_MAX_EFFECTS || character.effects.some(effect => !object(effect)) || new Set(character.effects.map(effect => effect.id)).size !== character.effects.length) return false;
    const definitions = [...Object.entries(FANTASY_STATUS_DEFINITIONS).map(([id, values]) => ({ id, ...values })), ...items.flatMap(item => item.use?.effect ? [item.use.effect] : [])];
    for (const effect of character.effects) {
      if (!object(effect) || typeof effect.expiresAt !== 'number' || !Number.isFinite(effect.expiresAt) || effect.expiresAt < 0 || effect.expiresAt > character.hour + FANTASY_MAX_EFFECT_HOURS) return false;
      if (Object.keys(effect).some(key => !['id', 'expiresAt', 'stats', 'check', 'guard', 'periodicHp', 'diceFaces', 'dicePenalty'].includes(key))) return false;
      const properties = (value: object) => Object.entries(value).filter(([key]) => !['hours', 'expiresAt'].includes(key)).map(([key, value]) => [key, key === 'stats' && object(value) ? Object.entries(value).sort(([a], [b]) => a.localeCompare(b)) : value]).sort(([a], [b]) => String(a).localeCompare(String(b)));
      if (!definitions.some(definition => JSON.stringify(properties(definition)) === JSON.stringify(properties(effect)))) return false;
    }
  }
  return true;
}
