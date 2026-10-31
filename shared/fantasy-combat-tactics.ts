import type { FantasyCombatFighter, FantasyCombatRange, FantasyCombatState } from './fantasy-combat.ts';
import { fantasyObstacleBreak, fantasyObstacleKind, fantasyObstaclePassage, type FantasyObstacleDamage } from './fantasy-obstacles.ts';

export interface FantasyCombatTile { x: number; y: number }
export interface FantasyCombatObstaclePlacement { kind: string; tile: FantasyCombatTile; hp?: number; owner?: string; expiresRound?: number }
export interface FantasyCombatBattlefield { width: 10; height: 8; blocked: FantasyCombatTile[]; cover: FantasyCombatTile[]; water?: FantasyCombatTile[]; obstacles?: FantasyCombatObstaclePlacement[] }
export const fantasyCombatTileKey = (tile: FantasyCombatTile) => `${tile.x}:${tile.y}`;
export const fantasyCombatDistance = (a: FantasyCombatTile, b: FantasyCombatTile) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const fantasyCombatActors = (state: FantasyCombatState): FantasyCombatFighter[] => [...state.fighters, ...(state.units ?? []), ...(state.escort ? [state.escort.wagon] : [])];
export function fantasyCombatField(seed?: number): FantasyCombatBattlefield {
  if (seed !== undefined) return structuredClone(FANTASY_COMBAT_NORMAL_FIELD_TEMPLATES[(seed >>> 0) % FANTASY_COMBAT_NORMAL_FIELD_TEMPLATES.length].field);
  return { width: 10, height: 8,
    blocked: [{ x: 4, y: 0 }, { x: 5, y: 0 }, { x: 4, y: 7 }, { x: 5, y: 7 }],
    cover: [{ x: 3, y: 2 }, { x: 3, y: 5 }, { x: 6, y: 2 }, { x: 6, y: 5 }],
  };
}
function validateFantasyCombatTemplate(field: FantasyCombatBattlefield): void {
  if (!fantasyCombatValidField(field)) throw new TypeError('Invalid combat field template');
  const occupied = new Set([...field.blocked, ...(field.obstacles ?? []).map(entry => entry.tile)].map(fantasyCombatTileKey));
  const queue = [{ x: 1, y: 4 }], seen = new Set(queue.map(fantasyCombatTileKey));
  for (let index = 0; index < queue.length; index++) {
    const { x, y } = queue[index];
    for (const tile of [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }]) {
      const key = fantasyCombatTileKey(tile);
      if (fantasyCombatValidTile(field, tile) && !occupied.has(key) && !seen.has(key)) { seen.add(key); queue.push(tile); }
    }
  }
  if (seen.size !== 80 - occupied.size || !seen.has('9:4')) throw new TypeError('Disconnected combat field template');
}
export const FANTASY_COMBAT_NORMAL_FIELD_TEMPLATES = Object.freeze(Array.from({ length: 12 }, (_, variation) => {
  const top = 2 + variation % 4, bottom = 3 + Math.floor(variation / 4), field = fantasyCombatField();
  field.blocked = [{ x: top, y: 0 }, { x: top + 1, y: 0 }, { x: bottom, y: 7 }, { x: bottom + 1, y: 7 }];
  validateFantasyCombatTemplate(field);
  for (const tile of [...field.blocked, ...field.cover]) Object.freeze(tile);
  Object.freeze(field.blocked); Object.freeze(field.cover);
  return Object.freeze({ id: `open-${variation + 1}`, field: Object.freeze(field) });
}));
export const FANTASY_COMBAT_FIELD_TEMPLATES = (['forest', 'ruin', 'cave'] as const).flatMap((terrain, terrainIndex) =>
  Array.from({ length: 4 }, (_, variation) => {
    const kinds = terrain === 'forest' ? ['thick-vine', 'fallen-log', 'boulder', 'rubble', 'barrel', 'low-wall', 'hole', 'thick-vine']
      : terrain === 'ruin' ? ['low-wall', 'rubble', 'barrel', 'boulder', 'hole', 'fallen-log', 'low-wall', 'rubble']
        : ['great-ice', 'boulder', 'hole', 'rubble', 'great-ice', 'low-wall', 'barrel', 'boulder'];
    const placements = [{ x: 4, y: 1 }, { x: 4, y: 2 }, { x: 5, y: 1 }, { x: 5, y: 2 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 5, y: 5 }, { x: 5, y: 6 }];
    const field: FantasyCombatBattlefield = { ...fantasyCombatField(), obstacles: placements.map((tile, index) => ({
      kind: kinds[(index + variation + terrainIndex) % kinds.length], tile: { x: variation & 1 ? 9 - tile.x : tile.x, y: variation & 2 ? 7 - tile.y : tile.y },
    })) };
    // 配置は起動時に全検証し、戦闘中は検証済みの候補を選ぶだけにする。
    validateFantasyCombatTemplate(field);
    return Object.freeze({ id: `${terrain}-${variation + 1}`, terrain, field: Object.freeze(field) });
  }));
export function fantasyCombatBarricadeField(seed = 1, terrain?: 'forest' | 'ruin' | 'cave'): FantasyCombatBattlefield {
  const templates = terrain ? FANTASY_COMBAT_FIELD_TEMPLATES.filter(template => template.terrain === terrain) : FANTASY_COMBAT_FIELD_TEMPLATES;
  return structuredClone(templates[(seed >>> 0) % templates.length].field);
}
/** 遠距離の敵を置くための、敵側の後方タイル。 */
export function fantasyCombatRangedTiles(count: number): FantasyCombatTile[] {
  const tiles: FantasyCombatTile[] = [];
  for (const x of [8, 9, 7, 6]) for (let y = 0; y < 8 && tiles.length < count; y++) if (y % 2 === 1) tiles.push({ x, y });
  return tiles.slice(0, count);
}/** 戦場に障害物を置く。既に埋まっているタイルや上限超過は拒否する。 */
export function fantasyCombatPlaceObstacle(state: FantasyCombatState, kind: string, tile: FantasyCombatTile, temporary?: { owner: string; expiresRound: number }): boolean {
  const field = state.battlefield;
  if (!field || !fantasyObstacleKind(kind) || !fantasyCombatValidTile(field, tile)) return false;
  const obstacles = field.obstacles ?? [];
  if (obstacles.length >= 20) return false;
  const key = fantasyCombatTileKey(tile);
  if ([...field.blocked, ...field.cover, ...(field.water ?? []), ...obstacles.map(value => value.tile), ...(state.fields ?? []).map(value => value.tile)].some(value => fantasyCombatTileKey(value) === key)) return false;
  if (fantasyCombatActors(state).some(value => value.hp > 0 && !value.fled && value.tile && fantasyCombatTileKey(value.tile) === key)) return false;
  field.obstacles = [...obstacles, { kind, tile, ...temporary }];
  return true;
}
/** 盾役が仮の遮蔽を置ける、体の前の空きタイル。 */
export function fantasyCombatCoverTile(state: FantasyCombatState, actor: FantasyCombatFighter): FantasyCombatTile | undefined {
  const field = state.battlefield;
  if (!field || !actor.tile) return undefined;
  const occupied = new Set([...field.blocked, ...field.cover, ...(field.water ?? []), ...(field.obstacles ?? []).map(value => value.tile), ...fantasyCombatActors(state)
    .filter(value => value.hp > 0 && !value.fled && value.tile).map(value => value.tile!)].map(fantasyCombatTileKey));
  const enemies = state.fighters.filter(value => value.side !== actor.side && value.hp > 0 && !value.fled && value.tile);
  const ahead = enemies.length ? { x: Math.sign(Math.round(enemies.reduce((sum, value) => sum + value.tile!.x, 0) / enemies.length - actor.tile.x)), y: 0 } : { x: 1, y: 0 };
  const candidates = [{ x: actor.tile.x + (ahead.x || 1), y: actor.tile.y }, { x: actor.tile.x, y: actor.tile.y - 1 }, { x: actor.tile.x, y: actor.tile.y + 1 }, { x: actor.tile.x - (ahead.x || 1), y: actor.tile.y }];
  return candidates.find(tile => fantasyCombatValidTile(field, tile) && !occupied.has(fantasyCombatTileKey(tile)));
}/** 障害物を攻撃で壊す。壊れた配置は戦場から消え、進路と視界が開く。 */
export function fantasyCombatBreakObstacle(state: FantasyCombatState, tile: FantasyCombatTile, damage: number, type: FantasyObstacleDamage): { destroyed: boolean; dealt: number } | undefined {
  const field = state.battlefield, key = fantasyCombatTileKey(tile);
  const entry = field?.obstacles?.find(value => fantasyCombatTileKey(value.tile) === key);
  const kind = entry && fantasyObstacleKind(entry.kind);
  if (!field?.obstacles || !entry || !kind) return undefined;
  const result = fantasyObstacleBreak({ ...kind, hp: entry.hp ?? kind.hp }, damage, type);
  if (!result) return undefined;
  if (result.hp <= 0) field.obstacles = field.obstacles.filter(value => fantasyCombatTileKey(value.tile) !== key);
  else entry.hp = result.hp;
  return { destroyed: result.hp <= 0, dealt: result.dealt };
}
export function fantasyCombatValidTile(field: FantasyCombatBattlefield, tile: unknown): tile is FantasyCombatTile {
  if (!tile || typeof tile !== 'object' || Array.isArray(tile)) return false;
  const value = tile as Record<string, unknown>;
  return Object.keys(value).length === 2 && Number.isInteger(value.x) && Number.isInteger(value.y)
    && Number(value.x) >= 0 && Number(value.x) < field.width && Number(value.y) >= 0 && Number(value.y) < field.height;
}
export function fantasyCombatValidField(value: unknown): value is FantasyCombatBattlefield {
  if (!value || typeof value !== 'object') return false;
  const field = value as FantasyCombatBattlefield;
  return [4, 5, 6].includes(Object.keys(field).length) && Object.keys(field).every(key => ['width', 'height', 'blocked', 'cover', 'obstacles', 'water'].includes(key)) && field.width === 10 && field.height === 8
    && [field.blocked, field.cover].every(list => Array.isArray(list) && list.length <= 20
      && list.every(tile => fantasyCombatValidTile(field, tile)) && new Set(list.map(fantasyCombatTileKey)).size === list.length)
    && !field.cover.some(tile => field.blocked.some(block => fantasyCombatTileKey(tile) === fantasyCombatTileKey(block)))
    && (field.water === undefined || Array.isArray(field.water) && field.water.length <= 60 && field.water.every(tile => fantasyCombatValidTile(field, tile))
      && new Set(field.water.map(fantasyCombatTileKey)).size === field.water.length
      && !field.water.some(tile => [...field.blocked, ...field.cover, ...(Array.isArray(field.obstacles) ? field.obstacles : []).filter(entry => entry?.tile).map(entry => entry.tile)].some(block => fantasyCombatTileKey(tile) === fantasyCombatTileKey(block))))
    && (field.obstacles === undefined || Array.isArray(field.obstacles) && field.obstacles.length <= 20
      && field.obstacles.every(entry => entry && typeof entry.kind === 'string' && !!fantasyObstacleKind(entry.kind) && fantasyCombatValidTile(field, entry.tile)
        && Object.keys(entry).every(key => ['kind', 'tile', 'hp', 'owner', 'expiresRound'].includes(key))
        && ((entry.owner === undefined && entry.expiresRound === undefined) || typeof entry.owner === 'string' && entry.owner.length > 0 && Number.isSafeInteger(entry.expiresRound) && entry.expiresRound! > 0)
        && (entry.hp === undefined || Number.isSafeInteger(entry.hp) && entry.hp > 0 && entry.hp <= fantasyObstacleKind(entry.kind)!.hp))
      && new Set(field.obstacles.map(entry => fantasyCombatTileKey(entry.tile))).size === field.obstacles.length
      && !field.obstacles.some(entry => [...field.blocked, ...field.cover].some(tile => fantasyCombatTileKey(tile) === fantasyCombatTileKey(entry.tile))));
}
export const fantasyCombatMoveRange = (actor: FantasyCombatFighter) => {
  if(actor.conditions?.some(condition=>condition.id==='root'))return 0;
  const base=Math.max(1,Math.min(4,2+Math.floor(actor.stats.agility/20))-(actor.effects.some(effect=>effect.id==='frost')?1:0))+(actor.conditions?.some(condition=>condition.id==='haste')?1:0);
  return actor.carrying||actor.externalCarrying?Math.max(1,Math.floor(base/2)):base;
};
export function fantasyCombatPath(state: FantasyCombatState, actor: FantasyCombatFighter, destination: FantasyCombatTile, avoidFields = false): FantasyCombatTile[] | undefined {
  const field = state.battlefield;
  if (!field || !actor.tile || !fantasyCombatValidTile(field, destination)) return undefined;
  const obstacleBlocks = (field.obstacles ?? []).filter(entry => {
    if(actor.carrying||actor.externalCarrying)return true;
    const kind = fantasyObstacleKind(entry.kind);
    return !kind || fantasyObstaclePassage(kind, actor.body ?? {}) === 'block';
  }).map(entry => fantasyCombatTileKey(entry.tile));
  const passableObstacles = new Set((field.obstacles ?? []).filter(entry => !obstacleBlocks.includes(fantasyCombatTileKey(entry.tile))).map(entry => fantasyCombatTileKey(entry.tile)));
  if (passableObstacles.has(fantasyCombatTileKey(destination))) return undefined;
  const occupied = new Set([...field.blocked.map(fantasyCombatTileKey), ...(actor.body?.flying && !actor.carrying && !actor.externalCarrying ? [] : field.water ?? []).map(fantasyCombatTileKey), ...obstacleBlocks, ...fantasyCombatActors(state)
    .filter(f => f.id !== actor.id && f.hp > 0 && !f.fled && f.tile).map(f => fantasyCombatTileKey(f.tile!))]);
  const queue = [{ path: [actor.tile], cost: 0 }], seen = new Set<string>();
  while (queue.length) {
    if (avoidFields) queue.sort((a, b) => a.cost - b.cost);
    const { path, cost } = queue.shift()!, current = path.at(-1)!, currentKey = fantasyCombatTileKey(current);
    if (seen.has(currentKey)) continue; seen.add(currentKey);
    if (fantasyCombatTileKey(current) === fantasyCombatTileKey(destination)) return path;
    for (const next of [{ x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y }, { x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 }]) {
      const key = fantasyCombatTileKey(next);
      if (fantasyCombatValidTile(field, next) && !occupied.has(key) && !seen.has(key)) queue.push({ path: [...path, next], cost: cost + 1 + (avoidFields && state.fields?.some(effect => effect.expiresRound > state.round && fantasyCombatTileKey(effect.tile) === key) ? 8 : 0) });
    }
  }
  return undefined;
}
export function fantasyCombatLineOfSight(state: FantasyCombatState, a: FantasyCombatTile, b: FantasyCombatTile, allowTargetObstacle = false): boolean {
  const field = state.battlefield;
  if (!field) return true;
  const dx = b.x - a.x, dy = b.y - a.y, steps = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
  for (let i = 1; i < steps; i++) {
    const x = Math.round(a.x + dx * i / steps), y = Math.round(a.y + dy * i / steps);
    if (field.blocked.some(tile => tile.x === x && tile.y === y)) return false;
    if (allowTargetObstacle && x === b.x && y === b.y) continue;
    if ((field.obstacles ?? []).some(entry => entry.tile.x === x && entry.tile.y === y && (fantasyObstacleKind(entry.kind)?.blocksSight ?? true))) return false;
  }
  return true;
}
export function fantasyCombatWithinRange(state: FantasyCombatState, actor: FantasyCombatFighter, target: FantasyCombatFighter, range: FantasyCombatRange): boolean {
  return !!actor.tile && !!target.tile && fantasyCombatDistance(actor.tile, target.tile) <= (range === 'melee' ? 1 : range === 'ranged' ? 7 : 8)
    && fantasyCombatLineOfSight(state, actor.tile, target.tile);
}
export function fantasyCombatCover(state: FantasyCombatState, target: FantasyCombatFighter, attacker?: FantasyCombatFighter): boolean {
  if (!target.tile || !state.battlefield) return false;
  if (state.battlefield.cover.some(tile => tile.x === target.tile!.x && tile.y === target.tile!.y)) return true;
  return (state.battlefield.obstacles ?? []).some(entry => fantasyObstacleKind(entry.kind)?.cover
    && fantasyCombatDistance(entry.tile, target.tile!) === 1
    && (!attacker?.tile || fantasyCombatDistance(attacker.tile, entry.tile) < fantasyCombatDistance(attacker.tile, target.tile!)));
}
export function fantasyCombatPlace(state: FantasyCombatState, actor: FantasyCombatFighter, preferred: FantasyCombatTile): boolean {
  if (!state.battlefield) return true;
  const occupied = new Set([...state.battlefield.blocked.map(fantasyCombatTileKey), ...(state.battlefield.water ?? []).map(fantasyCombatTileKey), ...(state.battlefield.obstacles ?? []).map(entry => fantasyCombatTileKey(entry.tile)), ...fantasyCombatActors(state)
    .filter(f => f.id !== actor.id && f.hp > 0 && !f.fled && f.tile).map(f => fantasyCombatTileKey(f.tile!))]);
  const candidates = Array.from({ length: 80 }, (_, index) => ({ x: index % 10, y: Math.floor(index / 10) }))
    .filter(tile => !occupied.has(fantasyCombatTileKey(tile)))
    .sort((a, b) => fantasyCombatDistance(a, preferred) - fantasyCombatDistance(b, preferred) || a.y - b.y || a.x - b.x);
  if (!candidates[0]) return false;
  actor.tile = candidates[0]; return true;
}
