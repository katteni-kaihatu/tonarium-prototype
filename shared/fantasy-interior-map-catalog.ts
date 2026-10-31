import type { FantasyCharacter, FantasyItem } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_DUNGEONS } from './fantasy-dungeon-catalog.ts';
import { generateFantasyDungeon } from './fantasy-dungeon-generator.ts';

export const FANTASY_INTERIOR_MAP_ITEM = 'scribe-interior-map';
export const FANTASY_INTERIOR_MAP_INPUTS: Record<string, number> = { 'scribe-paper': 2, 'scribe-ink': 1, linen: 1 };
export interface FantasyInteriorMapCopy {
  id: string; site: string; layoutSeed?: number; rooms: string[]; inspected: string[];
  quality: number; author: string; createdAt: number;
}
export type FantasyInteriorMapAction = { type: 'interiorMapCraft'; site: string } | { type: 'interiorMapUse'; copy: string };
type Carrier = Pick<FantasyCharacter, 'inventory'> & { hour?: number; interiorMaps?: FantasyInteriorMapCopy[]; pendingLoot?: FantasyCharacter['pendingLoot'] };
const text = (ko: string, en: string, ja: string) => ({ ko, en, ja });
export const FANTASY_INTERIOR_MAP_ITEMS: FantasyItem[] = [{
  id: FANTASY_INTERIOR_MAP_ITEM, name: '書記の内部探索図', names: text('기록사의 내부 탐사 지도', 'Scribe’s Interior Survey', '書記の内部探索図'),
  description: '記録者が探索した部屋と通路だけを記す、特定の配置用の写図。',
  descriptions: text('기록자가 탐사한 방과 통로만 담은 특정 배치의 사본. 사본마다 범위와 품질이 다릅니다.', 'A copy of rooms and passages personally explored by its author, bound to one layout. Coverage and quality vary by copy.', '記録者が探索した部屋と通路だけを記す、特定の配置用の写図。写しごとに範囲と品質が違います。'),
  price: 80, category: 'map', craftOnly: true,
}];
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function validFantasyInteriorMapCopy(v: unknown): v is FantasyInteriorMapCopy {
  if (!object(v) || Object.keys(v).some(key => !['id', 'site', 'layoutSeed', 'rooms', 'inspected', 'quality', 'author', 'createdAt'].includes(key))
    || Object.keys(v).length !== (v.layoutSeed === undefined ? 7 : 8) || typeof v.id !== 'string' || !/^interior-[a-z0-9-]{1,100}$/.test(v.id)
    || typeof v.site !== 'string' || typeof v.author !== 'string' || !v.author.trim() || v.author.length > 80 || /[\u0000-\u001f\u007f]/.test(v.author)
    || typeof v.createdAt !== 'number' || !Number.isFinite(v.createdAt) || v.createdAt < 0 || !Number.isSafeInteger(v.quality) || Number(v.quality) < 1 || Number(v.quality) > 5
    || v.layoutSeed !== undefined && (!Number.isSafeInteger(v.layoutSeed) || Number(v.layoutSeed) < 1 || Number(v.layoutSeed) > 0xffffffff)) return false;
  const base = FANTASY_DUNGEONS.find(site => site.id === v.site), site = base && (v.layoutSeed === undefined ? base : generateFantasyDungeon(base, Number(v.layoutSeed)));
  return !!site && Array.isArray(v.rooms) && v.rooms.length > 0 && v.rooms.length <= 18 && new Set(v.rooms).size === v.rooms.length
    && v.rooms.every(id => typeof id === 'string' && site.rooms.some(room => room.id === id))
    && Array.isArray(v.inspected) && new Set(v.inspected).size === v.inspected.length && v.inspected.every(id => v.rooms instanceof Array && v.rooms.includes(id));
}
export function validFantasyInteriorMaps(c: Carrier): boolean {
  if (c.interiorMaps !== undefined && !Array.isArray(c.interiorMaps) || Object.values(c.pendingLoot ?? {}).some(loot => loot.interiorMaps !== undefined && !Array.isArray(loot.interiorMaps))) return false;
  const copies = c.interiorMaps ?? [], pending = Object.values(c.pendingLoot ?? {}).flatMap(loot => loot.interiorMaps ?? []), all = [...copies, ...pending];
  return all.length <= 200 && all.every(copy => validFantasyInteriorMapCopy(copy) && (c.hour === undefined || copy.createdAt <= c.hour)) && new Set(all.map(copy => copy.id)).size === all.length
    && copies.length === (c.inventory[FANTASY_INTERIOR_MAP_ITEM] ?? 0)
    && Object.values(c.pendingLoot ?? {}).every(loot => Array.isArray(loot.interiorMaps ?? []) && (loot.interiorMaps?.length ?? 0) === (loot.items[FANTASY_INTERIOR_MAP_ITEM] ?? 0));
}
export function takeFantasyInteriorMap(c: Carrier, id?: string): FantasyInteriorMapCopy | undefined {
  const copy = c.interiorMaps?.find(copy => copy.id === id);
  if (!copy || !validFantasyInteriorMapCopy(copy) || !Number.isSafeInteger(c.inventory[FANTASY_INTERIOR_MAP_ITEM]) || c.inventory[FANTASY_INTERIOR_MAP_ITEM] < 1) return;
  c.interiorMaps = c.interiorMaps!.filter(value => value.id !== copy.id); c.inventory[FANTASY_INTERIOR_MAP_ITEM]--;
  return structuredClone(copy);
}
export function deliverFantasyInteriorMap(c: Carrier, copy: FantasyInteriorMapCopy): boolean {
  if (!validFantasyInteriorMapCopy(copy) || !validFantasyInteriorMaps(c) || (c.interiorMaps?.length ?? 0) + Object.values(c.pendingLoot ?? {}).reduce((sum, loot) => sum + (loot.interiorMaps?.length ?? 0), 0) >= 200
    || [...(c.interiorMaps ?? []), ...Object.values(c.pendingLoot ?? {}).flatMap(loot => loot.interiorMaps ?? [])].some(value => value.id === copy.id)) return false;
  (c.interiorMaps ??= []).push(structuredClone(copy)); c.inventory[FANTASY_INTERIOR_MAP_ITEM] = (c.inventory[FANTASY_INTERIOR_MAP_ITEM] ?? 0) + 1; return true;
}
export function fantasyInteriorMapValue(copy: FantasyInteriorMapCopy): number {
  return 10 + copy.rooms.length * (4 + copy.quality * 2) + copy.inspected.length * 3;
}
export function fantasyInteriorMapLabel(copy: FantasyInteriorMapCopy, locale: NpcLocale): string {
  const site = FANTASY_DUNGEONS.find(site => site.id === copy.site);
  return `${site?.names[locale] ?? copy.site} · ${copy.rooms.length} ${text('방', 'rooms', '室')[locale]} · ${'★'.repeat(copy.quality)} · ${copy.author}`;
}
