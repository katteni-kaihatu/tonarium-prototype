import { fantasyHasJob } from './fantasy-careers.ts';
import type { FantasyCharacter, FantasyProfile, FantasyResult } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import { FANTASY_DUNGEONS } from './fantasy-dungeon-catalog.ts';
import { fantasyDungeonCanCamp, fantasyDungeonSiteFor, validFantasyDungeon } from './fantasy-dungeon.ts';
import { grantFantasyPractice } from './fantasy-progression.ts';
import { FANTASY_INTERIOR_MAP_ITEM, FANTASY_INTERIOR_MAP_INPUTS, validFantasyInteriorMaps, validFantasyInteriorMapCopy, type FantasyInteriorMapAction, type FantasyInteriorMapCopy } from './fantasy-interior-map-catalog.ts';
export * from './fantasy-interior-map-catalog.ts';

const text = (ko: string, en: string, ja: string) => ({ ko, en, ja });
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const errors = {
  busy: text('현재 행동을 마친 뒤 지도를 다루세요.', 'Finish your current activity before handling a map.', 'いまの行動を終えてから地図を扱ってください。'),
  path: text('현재 지도필사사 전문 분야의 기록사만 내부 지도를 제작할 수 있습니다.', 'Only a scribe currently specialized as a Map Copyist can record an interior map.', '現在、地図写師を専門とする書記だけが内部図を制作できます。'),
  site: text('현재 탐사 중인 확보한 방에서 직접 탐사한 길을 기록하세요.', 'Record your own explored passages in a secured room of your current expedition.', '探索中の安全を確保した部屋で、自ら探索した道を記してください。'),
  supplies: text('필사용 종이 2장, 약초 먹물 1개, 리넨 1장이 필요합니다.', 'Requires two copyist papers, one herbal ink and one linen.', '筆写用の紙2枚、薬草の墨1個、麻布1枚が必要です。'),
  limit: text('지도 보관 한도에 도달했습니다.', 'Your map storage limit has been reached.', '地図の保管上限に達しています。'),
  missing: text('사용할 실제 지도 사본을 선택하세요.', 'Select a physical map copy you carry.', '所持している地図の写しを選んでください。'),
  layout: text('이 지도와 현재 저장된 내부 배치가 다릅니다. 배치를 바꾸지는 않습니다.', 'This map differs from your saved interior layout. It cannot change that layout.', '地図と保存済みの内部配置が違います。配置は変更できません。'),
  known: text('이 지도에 실린 길은 이미 모두 알고 있습니다.', 'You already know every passage on this map.', 'この地図の道は全て記録済みです。'),
};
export function isFantasyInteriorMapAction(value: unknown): value is FantasyInteriorMapAction {
  if (!object(value) || Object.keys(value).length !== 2) return false;
  return value.type === 'interiorMapCraft' && typeof value.site === 'string' && FANTASY_DUNGEONS.some(site => site.id === value.site)
    || value.type === 'interiorMapUse' && typeof value.copy === 'string' && /^interior-[a-z0-9-]{1,100}$/.test(value.copy);
}
export function fantasyInteriorMapHours(action: { type: string }): number { return action.type === 'interiorMapCraft' ? 3 : 0; }
export function fantasyInteriorMapCraftError(c: FantasyCharacter, siteId: string): string | undefined {
  if (!fantasyHasJob(c,'scribe') || c.jobPaths?.scribe?.path !== 'scribe-maps') return errors.path.ja;
  const progress = c.dungeon?.sites[siteId], site = fantasyDungeonSiteFor(c, siteId);
  if (!validFantasyDungeon(c) || !site || !progress || c.dungeon?.active?.site !== siteId || site.location !== c.location || !fantasyDungeonCanCamp(c)
    || !(progress.visited ?? progress.revealed).length) return errors.site.ja;
  if ((c.interiorMaps?.length ?? 0) + Object.values(c.pendingLoot ?? {}).reduce((n, loot) => n + (loot.interiorMaps?.length ?? 0), 0) >= 200) return errors.limit.ja;
  if (Object.entries(FANTASY_INTERIOR_MAP_INPUTS).some(([id, count]) => !Number.isSafeInteger(c.inventory[id]) || c.inventory[id] < count)) return errors.supplies.ja;
}
export function fantasyInteriorMapUseError(c: FantasyCharacter, copy: FantasyInteriorMapCopy): string | undefined {
  if (!validFantasyInteriorMapCopy(copy) || !c.interiorMaps?.some(value => value.id === copy.id) || !validFantasyDungeon(c)) return errors.missing.ja;
  const progress = c.dungeon?.sites[copy.site];
  // 保存済みの配置を地図で引き直すと、未受領の品を繰り返し採れるため変更しない。
  if (progress && progress.layoutSeed !== copy.layoutSeed) return errors.layout.ja;
  if (progress && copy.rooms.every(id => progress.revealed.includes(id))) return errors.known.ja;
}
export function applyFantasyInteriorMapAction(profile: FantasyProfile, action: FantasyInteriorMapAction, rng = Math.random, options: { advanceTime?: boolean } = {}): FantasyResult {
  const c = profile.character, fail = (error: string): FantasyResult => ({ profile, changed: false, error });
  if (!c || profile.death || c.hp <= 0 || c.downed || profile.activity || profile.combatId || profile.event || c.travelPosition) return fail(errors.busy.ja);
  if (!isFantasyInteriorMapAction(action) || !validFantasyInteriorMaps(c)) return fail(errors.missing.ja);
  const copy = action.type === 'interiorMapUse' ? c.interiorMaps?.find(copy => copy.id === action.copy) : undefined;
  const error = action.type === 'interiorMapCraft' ? fantasyInteriorMapCraftError(c, action.site) : !copy ? errors.missing.ja : fantasyInteriorMapUseError(c, copy);
  if (error) return fail(error);
  const next = structuredClone(profile), target = next.character!;
  if (action.type === 'interiorMapCraft') {
    const progress = target.dungeon!.sites[action.site], site = fantasyDungeonSiteFor(target, action.site)!;
    const visited = progress.visited ?? progress.revealed, rooms = site.rooms.filter(room => visited.includes(room.id)).map(room => room.id);
    for (const [id, count] of Object.entries(FANTASY_INTERIOR_MAP_INPUTS)) target.inventory[id] -= count;
    if (options.advanceTime !== false) target.hour += 3;
    const roll = Math.floor(Math.max(0, Math.min(.999999999, rng())) * 20) + 1;
    const quality = Math.max(1, Math.min(5, 1 + Math.floor((target.jobXp.scribe ?? 0) / 250) + Math.floor((roll - 1) / 7)));
    let id = `interior-${next.revision}-${Math.floor(target.hour * 1000)}-${Math.floor(Math.max(0, Math.min(.999999999, rng())) * 0xffffffff).toString(36)}`;
    while (target.interiorMaps?.some(copy => copy.id === id)) id += '-x';
    (target.interiorMaps ??= []).push({ id, site: action.site, ...(progress.layoutSeed === undefined ? {} : { layoutSeed: progress.layoutSeed }), rooms,
      inspected: (progress.surveyed ?? progress.inspected).filter(room => rooms.includes(room)), quality, author: target.name, createdAt: target.hour });
    target.inventory[FANTASY_INTERIOR_MAP_ITEM] = (target.inventory[FANTASY_INTERIOR_MAP_ITEM] ?? 0) + 1;
    target.fatigue = Math.min(100, target.fatigue + 3);
    grantFantasyPractice(target, { key: `interior-map:${action.site}`, amount: 6, success: true, practice: 'craft' });
  } else {
    const chart = copy!;
    target.dungeon ??= { sites: {} };
    const progress = target.dungeon.sites[chart.site] ??= { ...(chart.layoutSeed === undefined ? {} : { layoutSeed: chart.layoutSeed }), revealed: [], visited: [], surveyed: [], inspected: [], findings: [], detected: [], disarmed: [], sprung: [], cleared: [], claimed: [], inspectionDays: {} };
    progress.visited ??= [...progress.revealed]; progress.surveyed ??= [...progress.inspected];
    progress.revealed = [...new Set([...progress.revealed, ...chart.rooms])];
    target.dungeon.known = [...new Set([...(target.dungeon.known ?? []), chart.site])];
    target.interiorMaps = target.interiorMaps!.filter(value => value.id !== chart.id); target.inventory[FANTASY_INTERIOR_MAP_ITEM]--;
  }
  next.revision++;
  next.log.push({ id: (next.log.at(-1)?.id ?? 0) + 1, hour: target.hour, kind: 'success', text: `interior-map:${action.type === 'interiorMapCraft' ? 'crafted' : 'used'}` }); next.log = next.log.slice(-100);
  return { profile: next, changed: true };
}
export function fantasyInteriorMapText(source: string, locale: NpcLocale): string | undefined {
  const error = Object.values(errors).find(error => error.ja === source); if (error) return error[locale];
  if (source === '売却する地図の写しを選んでください。') return text('판매할 지도 사본을 선택하세요.', 'Select the map copy to sell.', source)[locale];
  if (source === '地図の写しを確認できません。') return text('지도 사본을 확인할 수 없습니다.', 'The map copy could not be verified.', source)[locale];
  if (source === 'interior-map:crafted') return text('직접 탐사한 방과 통로를 내부 지도 사본에 기록했습니다.', 'Recorded your explored rooms and passages on a physical interior map.', '自ら探索した部屋と通路を内部図の写しに記した。')[locale];
  if (source === 'interior-map:used') return text('사본을 읽고 같은 배치의 길을 기록했습니다. 조사·함정·보상 기록은 유지됩니다.', 'Read the copy and recorded its passages in the same layout. Investigation, trap and reward records are preserved.', '写しを読み、同じ配置の道を記録した。調査・罠・受取記録は維持される。')[locale];
}
