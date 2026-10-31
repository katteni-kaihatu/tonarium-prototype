import type { FantasyCombatError, FantasyCombatFighter, FantasyCombatSkill, FantasyCombatRange, FantasyCombatState } from './fantasy-combat.ts';
import { fantasyCombatEnemy, createFantasyCombatEnemyStats } from './fantasy-combat-catalog.ts';
import { fantasyEnemyCombatSkills } from './fantasy-enemy-combat.ts';
import { fantasyPartyCombatScale } from './fantasy-party-balance.ts';
import { FANTASY_NAVAL_ENCOUNTERS } from './fantasy-naval-catalog.ts';
import { fantasyCombatActors, fantasyCombatDistance, fantasyCombatLineOfSight, fantasyCombatPlace, type FantasyCombatTile } from './fantasy-combat-tactics.ts';

export interface FantasyNavalState {
  version: 1;
  offshore: { id: string; home: FantasyCombatTile; parts: { id: string; damage: number; severed: boolean }[] }[];
  harpoonReadyRound: number;
  tether?: { core: string; untilRound: number };
}
export const FANTASY_NAVAL_HARPOON = 'naval-deck-harpoon';
export const FANTASY_NAVAL_HARPOON_SKILL: FantasyCombatSkill = {
  id: FANTASY_NAVAL_HARPOON, names: { ko: '공용 선상 작살', en: 'Shared Deck Harpoon', ja: '共用甲板銛' },
  kind: 'attack', mp: 0, power: 0, range: 'ranged', reach: 9, shape: 'single', damageType: 'pierce',
};
const metadata = (template?: string) => FANTASY_NAVAL_ENCOUNTERS.find(entry => entry.template === template);
const living = (fighter: FantasyCombatFighter) => fighter.hp > 0 && !fighter.fled;
const same = (a: FantasyCombatTile, b: FantasyCombatTile) => a.x === b.x && a.y === b.y;
const partsOf = (template?: string) => metadata(template)?.parts?.flatMap(part => Array.from({ length: part.count }, () => part.template)) ?? [];
export function fantasyNavalTile(state: FantasyCombatState, tile: FantasyCombatTile): 'deck' | 'water' {
  return state.naval && tile.x >= 7 ? 'water' : 'deck';
}
export function fantasyNavalRole(state: FantasyCombatState, fighter: FantasyCombatFighter | string): 'body' | 'appendage' | 'boarder' | undefined {
  if (!state.naval) return undefined;
  const id = typeof fighter === 'string' ? fighter : fighter.id;
  if (state.naval.offshore.some(core => core.id === id)) return 'body';
  if (fantasyNavalAuxiliary(state, id)) return 'appendage';
  return state.fighters.some(candidate => candidate.id === id && candidate.side === 'enemies') ? 'boarder' : undefined;
}
export function fantasyNavalCanHit(state: FantasyCombatState, actor: FantasyCombatFighter, target: FantasyCombatFighter, range: FantasyCombatRange): boolean {
  return range !== 'melee' || !!actor.body?.flying || fantasyNavalRole(state, target) !== 'body' || !target.tile || fantasyNavalTile(state, target.tile) !== 'water';
}
export function fantasyNavalAuxiliary(state: FantasyCombatState, fighter: FantasyCombatFighter | string): boolean {
  const id = typeof fighter === 'string' ? fighter : fighter.id;
  return !!state.naval?.offshore.some(core => core.parts.some(part => part.id === id));
}
export function fantasyNavalRewardEnemies(state: FantasyCombatState): FantasyCombatFighter[] {
  return state.fighters.filter(fighter => fighter.side === 'enemies' && !fantasyNavalAuxiliary(state, fighter));
}
export function ensureFantasyNavalSkills(state: FantasyCombatState, fighter: FantasyCombatFighter): void {
  fighter.skills = fighter.skills.filter(skill => skill.id !== FANTASY_NAVAL_HARPOON);
  if (state.naval && fighter.side === 'players' && fighter.userId && !fighter.companion)
    fighter.skills.push(structuredClone(FANTASY_NAVAL_HARPOON_SKILL));
}
export function setupFantasyNavalCombat(state: FantasyCombatState): void {
  if (state.naval) return;
  const roots = state.fighters.filter(fighter => fighter.side === 'enemies');
  if (!roots.length || roots.length > 3 || roots.some(fighter => !metadata(fighter.template))) throw new Error('F_COMBAT_NAVAL');
  state.battlefield = { width: 10, height: 8, blocked: [], cover: [], water: Array.from({ length: 24 }, (_, n) => ({ x: 7 + Math.floor(n / 8), y: n % 8 })) };
  state.naval = { version: 1, offshore: [], harpoonReadyRound: 1 };
  for (const fighter of fantasyCombatActors(state)) delete fighter.tile;
  const players = fantasyCombatActors(state).filter(fighter => fighter.side === 'players');
  players.forEach((fighter, index) => { fantasyCombatPlace(state, fighter, { x: fighter.position === 'rear' ? 1 : 4, y: index % 8 }); ensureFantasyNavalSkills(state, fighter); });
  for (const [index, fighter] of roots.entries()) {
    const entry = metadata(fighter.template)!;
    fighter.skills = fantasyEnemyCombatSkills(fantasyCombatEnemy(fighter.template!)!);
    fighter.range = fighter.skills[0]?.range ?? fighter.range;
    if (entry.role === 'boarder') { fantasyCombatPlace(state, fighter, { x: 5, y: index * 2 + 1 }); continue; }
    fighter.tile = { x: 8, y: index * 2 + 1 };
    const templates = partsOf(fighter.template), binding: FantasyNavalState['offshore'][number] = { id: fighter.id, home: { ...fighter.tile }, parts: [] };
    state.naval.offshore.push(binding);
    templates.forEach((template, partIndex) => {
      const definition = fantasyCombatEnemy(template); if (!definition) throw new Error('F_COMBAT_NAVAL_PART');
      const varied = createFantasyCombatEnemyStats(template, () => Math.max(0, Math.min(1, ((fighter.variation ?? 1) - .92) / .16))).stats;
      const scale = fantasyPartyCombatScale(state.scaling, definition.rank), stats = { ...varied, attack: Math.round(varied.attack * scale.damageMultiplier), intelligence: Math.round(varied.intelligence * scale.damageMultiplier) };
      stats.hp = Math.ceil(fighter.stats.hp / templates.length);
      const part: FantasyCombatFighter = { id: `${fighter.id}-part-${partIndex + 1}`, template, variation: fighter.variation ?? 1,
        side: 'enemies', names: { ...definition.names }, stats, hp: stats.hp, mp: stats.mp, position: 'front', range: fantasyEnemyCombatSkills(definition)[0]?.range ?? 'melee',
        skills: fantasyEnemyCombatSkills(definition), effects: [], fled: false, guarding: false, ward: 0,
        contribution: { effectiveActions: 0, activeRounds: 0, manualActions: 0 } };
      fantasyCombatPlace(state, part, { x: 6, y: index * 2 + partIndex * 2 });
      state.fighters.push(part); binding.parts.push({ id: part.id, damage: Math.ceil(fighter.stats.hp / templates.length), severed: false });
    });
  }
}
export function fantasyNavalHarpoonError(state: FantasyCombatState, actor: FantasyCombatFighter, target?: FantasyCombatFighter, queued = true): FantasyCombatError | undefined {
  if (!state.naval || actor.side !== 'players' || !actor.userId || actor.companion) return 'invalid';
  if (actor.carrying || actor.externalCarrying) return 'carrying';
  if (!target || !living(target) || fantasyNavalRole(state, target) !== 'body') return 'target';
  if (state.round < state.naval.harpoonReadyRound || queued && Object.values(state.orders).some(order => order.type === 'skill' && order.skill === FANTASY_NAVAL_HARPOON)) return 'cooldown';
  if (!actor.tile || !target.tile || fantasyNavalTile(state, actor.tile) !== 'deck' || fantasyCombatDistance(actor.tile, target.tile) > 9 || !fantasyCombatLineOfSight(state, actor.tile, target.tile)) return 'range';
}
export function useFantasyNavalHarpoon(state: FantasyCombatState, actor: FantasyCombatFighter, target: FantasyCombatFighter): boolean {
  if (fantasyNavalHarpoonError(state, actor, target, false)) return false;
  const binding = state.naval!.offshore.find(core => core.id === target.id)!;
  const occupied = new Set(fantasyCombatActors(state).filter(f => living(f) && f.id !== target.id && f.tile).map(f => `${f.tile!.x},${f.tile!.y}`));
  const candidates = Array.from({ length: 56 }, (_, n) => ({ x: n % 7, y: Math.floor(n / 7) })).filter(tile => !occupied.has(`${tile.x},${tile.y}`)
    && !state.battlefield!.blocked.some(block => same(tile, block)) && !state.battlefield!.obstacles?.some(obstacle => same(tile, obstacle.tile)))
    .sort((a, b) => b.x - a.x || Math.abs(a.y - binding.home.y) - Math.abs(b.y - binding.home.y));
  if (!candidates.length) return false;
  if (state.naval!.tether) advanceFantasyNavalTether(state, true);
  target.tile = candidates[0]; delete target.enemyCharge;
  state.naval!.tether = { core: target.id, untilRound: state.round + 3 };
  state.naval!.harpoonReadyRound = state.round + 3;
  return true;
}
export function advanceFantasyNavalTether(state: FantasyCombatState, force = false): void {
  const tether = state.naval?.tether; if (!tether || !force && state.round < tether.untilRound) return;
  const binding = state.naval!.offshore.find(core => core.id === tether.core), core = state.fighters.find(f => f.id === tether.core);
  if (binding && core && living(core)) {
    const occupied = new Set(fantasyCombatActors(state).filter(f => living(f) && f.id !== core.id && f.tile).map(f => `${f.tile!.x},${f.tile!.y}`));
    const home = state.battlefield!.water!.filter(tile => !occupied.has(`${tile.x},${tile.y}`)).sort((a,b) => fantasyCombatDistance(a, binding.home) - fantasyCombatDistance(b, binding.home))[0];
    if (home) { binding.home = { ...home }; core.tile = { ...home }; delete core.enemyCharge; }
  }
  delete state.naval!.tether;
}
export function syncFantasyNavalDamage(state: FantasyCombatState): { part: FantasyCombatFighter; core: FantasyCombatFighter; damage: number }[] {
  const severed: { part: FantasyCombatFighter; core: FantasyCombatFighter; damage: number }[] = [];
  for (const binding of state.naval?.offshore ?? []) {
    const core = state.fighters.find(fighter => fighter.id === binding.id); if (!core) continue;
    for (const link of binding.parts) {
      const part = state.fighters.find(fighter => fighter.id === link.id); if (!part) continue;
      if (!link.severed && part.hp <= 0 && core.hp > 0) {
        link.severed = true; const damage = Math.min(core.hp, link.damage); core.hp -= damage; severed.push({ part, core, damage });
      }
      if (part.hp <= 0) { link.severed = true; delete part.enemyCharge; }
    }
    if (core.hp <= 0) {
      delete core.enemyCharge;
      for (const link of binding.parts) { const part = state.fighters.find(fighter => fighter.id === link.id); if (part) { part.hp = 0; delete part.enemyCharge; } link.severed = true; }
      if (state.naval?.tether?.core === core.id) delete state.naval.tether;
    }
  }
  return severed;
}
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: Record<string, any>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
const integer = (value: unknown, min: number, max: number) => Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
export function validFantasyNavalState(state: FantasyCombatState): boolean {
  const naval = state.naval;
  if (naval === undefined) return state.battlefield?.water === undefined && !fantasyCombatActors(state).some(f => f.skills.some(skill => skill.id === FANTASY_NAVAL_HARPOON) || !!f.template && fantasyCombatEnemy(f.template)?.auxiliary);
  if (!record(naval) || !keys(naval, ['version', 'offshore', 'harpoonReadyRound', 'tether']) || naval.version !== 1 || state.escort
    || !Array.isArray(naval.offshore) || naval.offshore.length > 3 || !integer(naval.harpoonReadyRound, 1, state.round + 3)) return false;
  const water = state.battlefield?.water;
  if (!water || water.length !== 24 || new Set(water.map(tile => `${tile.x},${tile.y}`)).size !== 24 || water.some(tile => tile.x < 7)) return false;
  if (naval.offshore.some(binding => !record(binding) || !Array.isArray(binding.parts) || binding.parts.some(part => !record(part)))) return false;
  const roots = fantasyNavalRewardEnemies(state); if (!roots.length || roots.length > 3 || roots.some(f => !metadata(f.template))) return false;
  if (new Set(naval.offshore.map(core => core?.id)).size !== naval.offshore.length) return false;
  const bound = new Set<string>();
  for (const binding of naval.offshore) {
    if (!record(binding) || !keys(binding, ['id', 'home', 'parts']) || !record(binding.home) || !keys(binding.home, ['x','y'])
      || !integer(binding.home.x, 7, 9) || !integer(binding.home.y, 0, 7) || !Array.isArray(binding.parts)) return false;
    const core = state.fighters.find(f => f.id === binding.id), templates = partsOf(core?.template);
    if (!core || !['offshore', 'kraken'].includes(metadata(core.template)?.role ?? '') || binding.parts.length !== templates.length) return false;
    if (core.hp > 0 && core.tile && !same(core.tile, binding.home) && naval.tether?.core !== core.id) return false;
    for (const [index, link] of binding.parts.entries()) {
      if (!record(link) || !keys(link, ['id', 'damage', 'severed']) || link.id !== `${core.id}-part-${index + 1}` || bound.has(link.id)
        || link.damage !== Math.ceil(core.stats.hp / templates.length) || typeof link.severed !== 'boolean') return false;
      const part = state.fighters.find(f => f.id === link.id);
      if (!part || part.template !== templates[index] || part.side !== 'enemies' || part.userId || part.stats.hp !== link.damage || link.severed !== (part.hp === 0) || core.hp === 0 && part.hp !== 0) return false;
      bound.add(link.id);
    }
    if (binding.parts.length && core.hp > binding.parts.filter(link => !link.severed).reduce((sum, link) => sum + link.damage, 0)) return false;
  }
  if (roots.some(core => metadata(core.template)?.role !== 'boarder' && !naval.offshore.some(binding => binding.id === core.id))) return false;
  if (naval.tether !== undefined && (!record(naval.tether) || !keys(naval.tether, ['core', 'untilRound']) || !integer(naval.tether.untilRound, state.round + 1, state.round + 3)
    || !naval.offshore.some(core => core.id === naval.tether!.core) || !state.fighters.some(f => f.id === naval.tether!.core && living(f) && f.tile && fantasyNavalTile(state, f.tile) === 'deck'))) return false;
  return fantasyCombatActors(state).every(fighter => {
    const role = fantasyNavalRole(state, fighter), harpoon = fighter.skills.find(skill => skill.id === FANTASY_NAVAL_HARPOON);
    if (fighter.side === 'players' && fighter.userId && !fighter.companion && (!harpoon || Object.keys(harpoon).length !== Object.keys(FANTASY_NAVAL_HARPOON_SKILL).length
      || !Object.entries(FANTASY_NAVAL_HARPOON_SKILL).every(([key, value]) => key === 'names' ? record(harpoon.names) && Object.keys(harpoon.names).length === 3 && ['ko','en','ja'].every(locale => harpoon.names[locale as keyof typeof harpoon.names] === FANTASY_NAVAL_HARPOON_SKILL.names[locale as keyof typeof harpoon.names]) : harpoon[key as keyof FantasyCombatSkill] === value))) return false;
    if (harpoon && (fighter.side !== 'players' || !fighter.userId || fighter.companion)) return false;
    return !!fighter.tile && (!living(fighter) || role === 'body' || fighter.body?.flying || fantasyNavalTile(state, fighter.tile) === 'deck');
  });
}

export function rescaleFantasyNavalParts(state: FantasyCombatState): void {
  for (const binding of state.naval?.offshore ?? []) {
    const core = state.fighters.find(fighter => fighter.id === binding.id)!;
    for (const link of binding.parts) {
      const part = state.fighters.find(fighter => fighter.id === link.id)!;
      const maximum = Math.ceil(core.stats.hp / binding.parts.length);
      part.hp = part.hp > 0 ? Math.ceil(part.hp / part.stats.hp * maximum) : 0;
      part.stats.hp = maximum; link.damage = maximum;
    }
  }
}
