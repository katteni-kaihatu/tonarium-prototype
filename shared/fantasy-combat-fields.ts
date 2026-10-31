import type { NpcLocale } from './npc.ts';
import type { FantasyCombatFighter, FantasyCombatSkill, FantasyCombatState } from './fantasy-combat.ts';
import { fantasyCombatActors, fantasyCombatDistance, fantasyCombatLineOfSight, fantasyCombatTileKey, fantasyCombatValidTile, type FantasyCombatTile } from './fantasy-combat-tactics.ts';

export const FANTASY_COMBAT_FIELD_KINDS = ['fire', 'frost', 'poison', 'storm'] as const;
export type FantasyCombatFieldKind = typeof FANTASY_COMBAT_FIELD_KINDS[number];
export interface FantasyCombatFieldEffect {
  kind: FantasyCombatFieldKind; tile: FantasyCombatTile; power: number; expiresRound: number; source: string;
  appliedRound: Record<string, number>;
}
export function fantasyCombatFieldKind(skill: FantasyCombatSkill): FantasyCombatFieldKind | undefined {
  return skill.field ?? (skill.kind === 'attack' && skill.effects?.burn ? 'fire' : skill.kind === 'attack' && skill.effects?.slow ? 'frost' : undefined);
}
export function fantasyCombatCreateFields(state: FantasyCombatState, actor: FantasyCombatFighter, center: FantasyCombatTile, skill: FantasyCombatSkill): boolean {
  const field = state.battlefield, kind = fantasyCombatFieldKind(skill);
  if (!field || !kind || !fantasyCombatValidTile(field, center)) return false;
  state.fields ??= [];
  const appliedRound = Object.fromEntries(state.fields.filter(entry => entry.kind === kind).flatMap(entry => Object.entries(entry.appliedRound)));
  let changed = false;
  for (let y = 0; y < field.height; y++) for (let x = 0; x < field.width; x++) {
    const tile = { x, y }, key = fantasyCombatTileKey(tile);
    if (fantasyCombatDistance(tile, center) > Math.min(2, skill.radius ?? 0) || !fantasyCombatLineOfSight(state, center, tile)
      || [...field.blocked, ...(field.obstacles ?? []).map(entry => entry.tile)].some(value => fantasyCombatTileKey(value) === key)) continue;
    const existing = state.fields.find(entry => entry.kind === kind && fantasyCombatTileKey(entry.tile) === key);
    const power = Math.max(1, Math.min(8, Math.floor(skill.power / 5)));
    if (existing) { existing.expiresRound = state.round + 3; existing.power = Math.max(existing.power, power); existing.source = actor.id; }
    else if (state.fields.length < 80) state.fields.push({ kind, tile, power, expiresRound: state.round + 3, source: actor.id, appliedRound: { ...appliedRound } });
    else continue;
    changed = true;
  }
  return changed;
}
export function fantasyCombatApplyFields(state: FantasyCombatState, actor: FantasyCombatFighter): { kind: FantasyCombatFieldKind; damage: number }[] {
  if (!actor.tile || actor.hp <= 0 || actor.fled) return [];
  const applied: { kind: FantasyCombatFieldKind; damage: number }[] = [];
  for (const field of state.fields ?? []) {
    if (field.expiresRound <= state.round || fantasyCombatTileKey(field.tile) !== fantasyCombatTileKey(actor.tile)
      || Object.hasOwn(field.appliedRound, actor.id) && field.appliedRound[actor.id] === state.round || actor.hp <= 0) continue;
    // 同種の床を渡り歩いても、同じラウンドの効果は一度だけ。
    for (const same of state.fields ?? []) if (same.kind === field.kind) same.appliedRound = { ...same.appliedRound, [actor.id]: state.round };
    const damage = field.kind === 'fire' || field.kind === 'poison' ? Math.min(actor.hp, field.power) : 0;
    actor.hp -= damage;
    if (actor.hp > 0 && field.kind === 'frost') {
      const frost = actor.effects.find(effect => effect.id === 'frost');
      if (frost) frost.turns = Math.max(frost.turns, 2); else actor.effects.push({ id: 'frost', power: 1, turns: 2 });
    }
    if (actor.hp > 0 && field.kind === 'storm' && actor.id !== state.escort?.wagon.id) {
      const blind = actor.conditions?.find(condition => condition.id === 'blind');
      if (blind) { blind.power = Math.max(blind.power, field.power); blind.turns = Math.max(blind.turns, 2); }
      else actor.conditions = [...(actor.conditions ?? []), { id: 'blind', power: field.power, turns: 2 }];
    }
    applied.push({ kind: field.kind, damage });
  }
  return applied;
}
export function validFantasyCombatFields(state: FantasyCombatState): boolean {
  if (state.fields === undefined) return true;
  if (!state.battlefield || !Array.isArray(state.fields) || state.fields.length > 80) return false;
  const actors = new Set(fantasyCombatActors(state).map(actor => actor.id)), unique = new Set<string>();
  return state.fields.every(field => {
    if (!field || typeof field !== 'object' || Array.isArray(field) || Object.keys(field).length !== 6
      || Object.keys(field).some(key => !['kind', 'tile', 'power', 'expiresRound', 'source', 'appliedRound'].includes(key))) return false;
    const key = `${field.kind}:${fantasyCombatTileKey(field.tile ?? { x: -1, y: -1 })}`;
    if (unique.has(key)) return false; unique.add(key);
    return (FANTASY_COMBAT_FIELD_KINDS as readonly string[]).includes(field.kind) && fantasyCombatValidTile(state.battlefield!, field.tile)
      && ![...state.battlefield!.blocked, ...(state.battlefield!.obstacles ?? []).map(entry => entry.tile)].some(tile => fantasyCombatTileKey(tile) === fantasyCombatTileKey(field.tile))
      && Number.isSafeInteger(field.power) && field.power >= 1 && field.power <= 8
      && Number.isSafeInteger(field.expiresRound) && field.expiresRound > state.round && field.expiresRound <= state.round + 3
      && actors.has(field.source) && !!field.appliedRound && typeof field.appliedRound === 'object' && !Array.isArray(field.appliedRound)
      && Object.entries(field.appliedRound).every(([actor, round]) => actors.has(actor) && Number.isSafeInteger(round) && round >= 1 && round <= state.round);
  });
}
const FIELD_TEXT = {
  fire: { ko: '불타는 바닥 · 주기 화염 피해', en: 'Burning ground · periodic fire damage', ja: '燃える床・継続火炎ダメージ' },
  frost: { ko: '얼어붙은 바닥 · 이동력 감소', en: 'Frozen ground · reduced movement', ja: '凍った床・移動力低下' },
  poison: { ko: '독 안개 · 주기 독 피해', en: 'Poison miasma · periodic poison damage', ja: '毒の霧・継続毒ダメージ' },
  storm: { ko: '폭풍 지대 · 명중 감소', en: 'Storm field · reduced accuracy', ja: '嵐の場・命中低下' },
};
export function fantasyCombatFieldDescription(field: FantasyCombatFieldEffect, round: number, locale: NpcLocale): string {
  const remaining = Math.max(0, field.expiresRound - round);
  const effect = field.kind === 'frost' ? { ko: '이동 −1', en: 'Move −1', ja: '移動−1' }[locale]
    : field.kind === 'storm' ? `${{ ko: '명중', en: 'Accuracy', ja: '命中' }[locale]} −${field.power * 2}` : `HP −${field.power}`;
  return `${FIELD_TEXT[field.kind][locale]} · ${effect} · ${remaining}${{ ko: '라운드 남음', en: ' rounds remaining', ja: 'ラウンド残り' }[locale]}`;
}
