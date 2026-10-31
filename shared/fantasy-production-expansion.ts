import type { FantasyCharacter, FantasyProfile, FantasyResult } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_PRODUCTION_ITEMS, FANTASY_PRODUCTION_STUDIES, type FantasyProductionRecipe } from './fantasy-production-catalog.ts';
import { FANTASY_DUNGEONS } from './fantasy-dungeon-catalog.ts';
import { FANTASY_READABLE_LIBRARY_BOOKS } from './fantasy-library.ts';
import { learnFantasyMagicBook } from './fantasy-magic-discovery.ts';
import { learnFantasyCircleBook, fantasyCircleDiscoveryText } from './fantasy-magic-circle.ts';
type Character = Pick<FantasyCharacter, 'inventory' | 'location' | 'dungeon'> & { productionClaims?: string[] };
const errors = {
  owned: { ko: '읽을 수 있는 실제 문헌을 가지고 있어야 합니다.', en: 'You must own a readable physical volume.', ja: '読める文献を実際に所持してください。' },
  known: { ko: '이 문헌의 지식은 이미 익혔습니다. 다른 이에게 양도할 수 있습니다.', en: 'You already know this text. You may trade the physical volume to someone else.', ja: 'この文献の知識は学習済みです。品物を他の人へ譲れます。' },
  source: { ko: '원전을 먼저 읽고 익혀야 필사할 수 있습니다.', en: 'Study the source book before copying it.', ja: '原典を先に読み、学んでから写してください。' },
  route: { ko: '지도에 기록할 모든 지역을 직접 방문해야 합니다.', en: 'Visit every location represented on the chart before drawing it.', ja: '地図に記す全ての地域を実際に訪ねてください。' },
};
export function fantasyProductionRecipeError(c: Pick<FantasyCharacter, 'readBooks' | 'visited'>, recipe: FantasyProductionRecipe): string | undefined {
  if (recipe.requiresBook && !c.readBooks?.includes(recipe.requiresBook)) return errors.source.ja;
  if (recipe.requiresLocations?.some(id => !c.visited.includes(id))) return errors.route.ja;
}
export function applyFantasyProductionStudy(profile: FantasyProfile, id: string): FantasyResult | undefined {
  const study = FANTASY_PRODUCTION_STUDIES.find(study => study.item === id); if (!study) return;
  const c = profile.character, fail = (error: string): FantasyResult => ({ profile, changed: false, error });
  if (!c || profile.death || c.hp <= 0 || profile.combatId || profile.activity || !Number.isSafeInteger(c.inventory[id]) || c.inventory[id] < 1 || !FANTASY_READABLE_LIBRARY_BOOKS.some(book => book.id === study.book)) return fail(errors.owned.ja);
  if (c.readBooks?.includes(study.book)) return fail(errors.known.ja);
  const next = structuredClone(profile), target = next.character!; target.inventory[id]--;
  learnFantasyMagicBook(target, study.book); const runes = learnFantasyCircleBook(target, study.book);
  target.readBooks = [...(target.readBooks ?? []), study.book]; next.revision++;
  if (runes.length) next.log.push({ id: (next.log.at(-1)?.id ?? 0) + 1, hour: target.hour, kind: 'success', text: fantasyCircleDiscoveryText(runes, 'ja') });
  next.log.push({ id: (next.log.at(-1)?.id ?? 0) + 1, hour: target.hour, kind: 'success', text: `production:study:${id}` }); next.log = next.log.slice(-100);
  return { profile: next, changed: true };
}
function claimable(site: string, room: string): boolean { return FANTASY_DUNGEONS.some(dungeon => dungeon.id === site && dungeon.kind === 'ruin' && dungeon.rooms.some(value => value.id === room && !!(value.reward || value.discovery))); }
export function validFantasyProductionClaims(c: Character): boolean {
  const claims = c.productionClaims; if (claims === undefined) return true;
  const limit = FANTASY_DUNGEONS.filter(site => site.kind === 'ruin').reduce((sum, site) => sum + site.rooms.length, 0);
  return Array.isArray(claims) && claims.length <= limit && new Set(claims).size === claims.length && claims.every(receipt => {
    if (typeof receipt !== 'string') return false; const parts = receipt.split(':'), [site, room] = parts;
    return parts.length === 2 && claimable(site, room) && !!c.dungeon?.sites[site]?.claimed.includes(room);
  });
}
// 実際の部屋の受取と同じ保存で記録し、再接続でも複製しない。
export function grantFantasyProductionRuins(c: Character, site: string, room: string): string[] {
  const receipt = `${site}:${room}`, dungeon = FANTASY_DUNGEONS.find(value => value.id === site);
  if (!validFantasyProductionClaims(c) || !dungeon || dungeon.location !== c.location || !claimable(site, room) || c.dungeon?.active?.site !== site || c.dungeon.active.room !== room || !c.dungeon.sites[site]?.claimed.includes(room) || c.productionClaims?.includes(receipt)) return [];
  (c.productionClaims ??= []).push(receipt); c.inventory['faded-manuscript'] = (c.inventory['faded-manuscript'] ?? 0) + 1; return ['faded-manuscript'];
}
export function fantasyProductionText(source: string, locale: NpcLocale): string | undefined {
  const error = Object.values(errors).find(error => error.ja === source); if (error) return error[locale];
  const item = FANTASY_PRODUCTION_ITEMS.find(item => source === `production:study:${item.id}`); if (!item) return;
  return { ko: `${item.names!.ko}을 읽고 지식을 익혔습니다.`, en: `Studied ${item.names!.en} and recorded its knowledge.`, ja: `${item.names!.ja}を読み、知識を身につけた。` }[locale];
}
